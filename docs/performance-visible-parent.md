# 可见父元素下的排除检查优化

2026-10-12；基线 `3ef4532`。以 10,000 条摘录库为主，兼顾小数据；本轮分别测量 100/10,000 段网页与每批 20 条无偏移高亮，库与实际消息链路另做原生验收。延续[匹配末端提前停止](./performance-highlight-overlap.md)。

## 从 profile 选择热点

新增可选 `PROFILE=/path/file.cpuprofile`，复用既有基准 runner 与 CDP 接口。默认不启用；输出 `cpuProfiled` 标记，拒绝与分配采样同时运行。前后各正/反序一次 profile，全部与正式计时、测试、构建分开。

原实现两份 profile 中，`acceptNode` 分别占 `findTextRangeInNode` 内加权采样间隔的 64.7%/64.8%，原文边界映射约 9.8%/10.1%。过滤器行级采样的主要位置是排除元素的 `closest`；已核对运行时转换后的第 38 行对应祖先查询，不把这行号当作 TS 文件行号。优化后可见性过滤占比约 58.5%/58.3%，仍是主要成本。

按每个样本的调用栈与 `timeDeltas` 汇总，避免把其他操作的过滤时间混入文本查找。字段的微秒单位及行级采样定义见 [Chrome DevTools Protocol](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/js_protocol.pdl)。这不是精确函数 CPU 时长，也不是端到端等待；profile 覆盖全部规模/布局，不能用它直接宣称某一种布局的速度提升。带 profile 的耗时全部另存，未混入下表。

## 最小改动与正确性

同一个 walker 已用 WeakMap 记住确认可见的元素。可见结果意味着该元素及其祖先不在 `script/style/noscript/svg/canvas` 内。当一个新文本父元素的直属父元素已确认可见时，只需 `matches` 检查自身排除标签；其他情况继续原来的 `closest`。仍逐个读取当前元素的样式、检查隐藏屏障与 visibility，并保持读取失败重试。

没有新增缓存：复用已有的同次遍历结果，新 walker 重新检查。当前元素自身仍可能是排除标签或隐藏元素，不能因父元素可见就直接接受。祖先不可见、尚未检查、自定义根外祖先、可见性覆盖及 `display:contents` 都保留原路径与样式检查。没有保存长期节点索引、增加依赖、权限、接口或数据库变更。

新增一个回归测试，先访问父元素的直接文本，再访问子元素；确认子元素不再进行重复祖先查询，同时同层五种排除标签的文本都被拒绝。修正非执行 script 夹具后，旧实现单独测试因多调用一次 `closest` 失败、无运行异常；最终通过。初版夹具执行 script 的错误已修正并单独记录，不作为正确性证据。

## 非 profile 耗时

Headless Chrome 155、macOS、Node.js 22.23.2、临时配置。五种布局每段五个文本节点；稀疏布局仅在最后一段追加 Tab，不同汉字布局有 20,000 个不同代码单元。准备 DOM 后等待两个动画帧，查询预热一次、七次取中位数。恢复使用生产定位、绘制和默认调度，只替代设置传输；每次核对目标 Text、UTF-16 边界、20 个高亮和清除后的原文。

正式顺序为基线正序、当前正序、当前反序、基线反序；全部串行，没有与测试、构建、CPU/分配采样或原生验收重叠。10,000 段尾部查询，单位 ms：

| 文本 | 正序：基线 → 当前 | 反序：基线 → 当前 |
| --- | --- | --- |
| Latin-1，普通空格 | 19.3 → 17.4 | 20.2 → 17.1 |
| 中文与英文混排 | 29.2 → 26.0 | 28.9 → 25.8 |
| Unicode 空白、展开与 emoji | 28.4 → 27.2 | 30.1 → 26.8 |
| 仅末尾追加 Tab | 19.5 → 17.7 | 20.9 → 18.9 |
| 20,000 个不同汉字代码单元 | 20.7 → 18.6 | 21.5 → 19.6 |

20 条无偏移高亮的完整恢复，单位 ms：

| 文本 | 正序：基线 → 当前 | 反序：基线 → 当前 |
| --- | --- | --- |
| Latin-1，普通空格 | 457.4 → 425.7 | 488.8 → 427.1 |
| 中文与英文混排 | 549.4 → 522.5 | 582.8 → 517.1 |
| Unicode 空白、展开与 emoji | 614.8 → 559.0 | 642.5 → 563.9 |
| 仅末尾追加 Tab | 467.7 → 431.7 | 510.0 → 464.2 |
| 20,000 个不同汉字代码单元 | 490.6 → 447.8 | 517.4 → 470.8 |

本机两轮尾部查询约减少 4–15%，完整恢复约减少 5–13%，全部五种布局同向改善；不是实际扩展 IPC 的端到端耗时，也不是所有网站或硬件的保证。100 段整批当前 6.1–8.2ms、基线 6.4–9.2ms，小绝对值不概括成倍数提升。头部、中部、缺失查询、首次恢复及全部样本保留。首次恢复仅一次，后续布局可能已预热，不统一称为冷启动。

## 回归和实际扩展

最终源码通过 260 项测试、28 个文件的 coverage、类型检查、脚本语法与 diff 检查。可选 profile 正/反序四次均有超过 10,000 个样本，默认四次计时标记为未启用；CPU/分配互斥自检也通过。Chrome MV3、Edge MV3、Firefox MV2 顺序构建通过，产物中的分支与源码哈希核对；原有大 UI chunk 与 Firefox 发布配置提示保留。

Chrome for Testing、Firefox Nightly 各通过 18 项真实扩展检查：真实 10,000 条库提供页面的 20 条记录，倒序、重复、全文回退、清除；1,000 条合成恢复载荷全部正确，页面定时器在恢复未结束时执行。Unicode 空白/展开、选区、相邻文字、外部插入、CSSOM/媒体变化、隐藏目标与可见性覆盖通过。隐藏选区额外保存一条，最终各 10,001 条；Chrome 异常与 Firefox 扩展 URL 错误均为空。取消由单测覆盖，没有把原生响应性测试标成取消验收。

源码/产物 SHA-256、逐次样本、profile 汇总与完整原生结果见 [performance-visible-parent-results.json](./performance-visible-parent-results.json)。完整 profile 可导入 DevTools：[原实现正序](./performance-visible-parent-before-normal.cpuprofile)、[原实现反序](./performance-visible-parent-before-reverse.cpuprofile)、[当前正序](./performance-visible-parent-after-normal.cpuprofile)、[当前反序](./performance-visible-parent-after-reverse.cpuprofile)。本轮仅本地提交，未推送或创建 PR；未访问用户浏览器资料或摘录。

```sh
BASELINE_REF=3ef4532 node scripts/performance.mjs --text-mapping --baseline
node scripts/performance.mjs --text-mapping
node scripts/performance.mjs --text-mapping --reverse
BASELINE_REF=3ef4532 node scripts/performance.mjs --text-mapping --baseline --reverse
# 单独做 CPU 探索，其耗时不加入正式对照：
PROFILE=/tmp/clipsey-highlight.cpuprofile node scripts/performance.mjs --text-mapping
```

未测新增分配量或峰值内存、Edge 原生运行、其他系统、低端硬件、真实网站和远端 CI；Chrome 截图未人工视觉检查。该热点已有可复现改进，但全项目性能上限仍未证实。
