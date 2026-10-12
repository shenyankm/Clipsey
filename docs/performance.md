# 性能审查与验收

后续实验[冷深页的一次主键扫描](./performance-one-pass.md)因 Firefox 与超窗口回退未接入生产，保留完整取舍数据。

本文件保存首轮审查与验收；最新优化见[深页复访的有界主键缓存验收](./performance-page-keys.md)，此前见[越界分页与计数发布时机验收](./performance-empty-page.md)，此前见[精确计数复用与单事务分页验收](./performance-count-cache.md)，此前见[普通深分页的主键游标验收](./performance-key-cursor.md)，此前见[高亮恢复的消息任务兼容路径](./performance-message-yield.md)，此前见[受限搜索快照与事务版本验收](./performance-search-cache.md)，此前实验见[搜索小记录扫描的读写取舍（暂不接入持久化表）](./performance-search-projection.md)，此前[接受文本时跳过屏障读取（未采用）](./performance-barrier-read.md)，已交付优化见[可见父元素的排除检查优化](./performance-visible-parent.md)，此前见[已高亮重叠检查提前结束](./performance-highlight-overlap.md)，缓存实验见[Unicode 分类缓存评估（未采用）](./performance-unicode-classification.md)，已交付优化见[空白规范化的分配优化](./performance-whitespace.md)，此前见[Latin-1 文本边界映射的分配优化](./performance-latin1-mapping.md)、[高亮恢复调度与响应性验收](./performance-highlight-scheduling.md)、[文本遍历游标与分配采样](./performance-text-cursor.md)、[隐藏祖先的文本定位修复与性能验收](./performance-hidden-text.md)、[文本匹配边界映射与跨浏览器高亮验收](./performance-text-range-mapping.md)、[Firefox 备份消息传输优化](./performance-firefox-backup.md)、[Firefox 真实扩展运行验收](./performance-firefox.md)与[备份生成与消息传输验收](./performance-backup.md)，更早补充见[后台自然休眠与唤醒验收](./performance-worker-idle.md)与[UI 启动与动态样式验收](./performance-ui-validation.md)，缓存优化见[缓存读取与字段处理验收](./performance-cache-snapshot.md)，单库索引接入及其代价见[批量写入与单库 URL 索引验收](./performance-write-index.md)，上一候选见[按网址读取的生产候选与验收](./performance-indexed-url-cache.md)。

## 结论

本轮实施两项有测量依据、无需增加依赖或修改数据库结构的优化。重点审查了存储/缓存、分页搜索、页面高亮定位与绘制、popup/options 的数据调用路径；不是所有功能的正确性或安全审计。

| 优先级 | 源码问题 | 可行方案 | 状态 |
| --- | --- | --- | --- |
| P1 | `storage.getClipsForUrl` 为确保缓存加载调用 `cacheManager.get`，每次复制全部摘录后丢弃副本 | 将加载与复制分开，URL 查询只复制索引命中的记录；首次全量读取也减少一层复制 | 已实施并实测 |
| P1 | `IndexedDBQuery.getAll` 每跳过一条记录触发一次游标回调 | 正整数 offset 使用原生 `cursor.advance(offset)`；保留特殊 offset 的旧行为 | 已实施并实测 |
| P2 | `storage.addClip/deleteClip` 每次 `store.getAll()`，还需构造全量同步快照 | 单条写入使用 ID/highlightId 索引；同步协议改成增量通知 | 暂不实施：现有监听器依赖 old/new 全量数组，必须一起更改并验收并发写入、删除高亮与同步 |
| P2 | `filterByKeywordPaged` 为精确 total 必须扫描所有候选记录，options 输入每次变化都会调用搜索 | 先对输入做短延迟合并并防止旧请求覆盖新结果；若扫描仍慢，再评估全文索引 | 暂不实施：尚未实测连续输入，不能声称有收益；索引还涉及 Unicode 子串语义及更新一致性 |
| P2 | 高亮逐项定位可能重复遍历 DOM，并对节点读取计算样式 | 先录制长网页、多摘录场景的主线程 profile，再评估单次批处理中复用文本索引 | 暂不实施：内联高亮会修改文本节点，跨绘制复用索引可能失效；不能牺牲定位正确性 |
| P3 | 三浏览器构建均产生约 642 kB 的共享 UI JS chunk（未压缩传输大小），触发 >500 kB 警告 | 按实际 popup 加载情况分析依赖图，再缩减 UI 导入或分包 | 暂不实施：没有测量冷启动，不仅为消除 warning 调整打包 |

## 改动范围与兼容性

- `src/background/storage/cache-manager.ts`：新增私有加载路径，保留并发加载合并、revision 失效检查、失败向上传递和返回对象隔离。`getByUrl` 现在异步并接收 loader，唯一生产调用方已更新。
- `src/background/storage.ts`：按 URL 读取不再请求全量缓存副本。外部 `getClipsForUrl` 签名不变。
- `src/background/indexeddb-query.ts`：仅改变 offset 跳过方式。0、负数、非整数与超出 `advance` 参数范围的 offset 保留原语义；顺序、范围、unique 游标与 limit 语义不变。
- 不改变数据结构、权限、URL 匹配规则、事务提交/回滚、全量同步协议或 HTML 净化；不会为优化删除历史摘录。
- `advance` 减少 JS 回调和逐条 value 读取，但不意味着深页变成 O(1)；底层仍需跳过记录，总数查询仍有成本。

## 真实浏览器验收

环境：macOS、Node.js 22.23.2、Headless Chrome 155.0.0.0。每次新建并删除临时 Chrome 用户目录，使用真实 IndexedDB，未访问用户浏览器或用户摘录。

数据：10,000 条合成摘录、1,000 个 URL，每个 URL 命中 10 条。分页每页 20 条，第 450 页跳过 8,980 条。时间不含数据生成/写入；每项先预热一次，再采样 7 次，取中位数。URL 查询每次样本执行 1,000 次，报告单次均摊时间。

基线：`8a38372759ca9d2c413e4fc03693fbf3d9980f42` 的缓存和查询实现。基准脚本为基线恢复旧缓存调用路径，为工作树使用新调用路径，均与对应版本的 `storage.getClipsForUrl` 一致；没有测量扩展消息传输或页面绘制。

两轮串行对照：第一轮先基线后优化，第二轮反向执行。数据库测试放在 URL 查询之前，避免旧版大量对象分配影响数据库对照。所有运行都断言 URL 记录、分页 ID/顺序和总数正确。

| 场景 | 第一轮：优化前 → 后 | 第二轮：优化前 → 后 | 验收结论 |
| --- | --- | --- | --- |
| 热缓存 URL 查询 | 0.1484 → 0.0014 ms | 0.1527 → 0.0015 ms | 单次耗时降低约 99%；绝对收益约 0.15 ms，不能等同于整页快 100 倍 |
| 深页读取，不含总数 | 92.6 → 51.7 ms | 67.8 → 39.4 ms | 降低约 42–44% |
| 深页完整分页，含总数 | 92.8 → 67.0 ms | 93.3 → 70.2 ms | 降低约 25–28% |
| 全量读取（未优化路径，对照组） | 80.3 → 80.2 ms | 100.7 → 99.6 ms | 两轮配对差异小于 1.1%，未观察到明显回退；不宣称提升 |

原始每次采样数据见 [`performance-results.json`](./performance-results.json)。计时会随机器负载波动，不把毫秒阈值作为 CI 硬断言。

复跑（仓库根目录，先安装现有依赖）：

```sh
BASELINE_REF=8a38372759ca9d2c413e4fc03693fbf3d9980f42 node scripts/performance.mjs --baseline
node scripts/performance.mjs
```

默认 Chrome 路径为 macOS Google Chrome；其他安装位置使用 `CHROME_PATH` 环境变量指定可执行文件。基线模式只从 Git 读取两个源码文件，不改工作树。

## 回归验收

- 优化前：63 个测试通过，类型检查通过。
- 优化后：14 个测试文件、72 个测试全部通过（含 V8 coverage），类型检查通过。
- 新增检查：全量/URL 并发加载只调用一次 loader、返回对象互不影响、加载期间失效/失败后重试、storage 的 URL 路径不请求全量复制、正反向深页、首页/末页/越界、范围与 unique 游标、旧 offset/limit 语义、游标错误传播。
- 深页单元测试确认跳过 40 条只调用一次 `advance(40)`，而不是 40 次 `continue()`。
- Chrome MV3、Edge MV3、Firefox MV2 生产构建全部通过。
- 保留现有大 chunk 警告和 Firefox 发布配置警告，不将“构建通过”解释为商店发布检查通过。

## 未覆盖与风险

没有做真实站点滚动/高亮的人工验收、安装扩展后的完整交互验收、Edge/Firefox 运行时性能测试或真实用户数据规模分布测试。当前结论仅适用于已测的 Chrome 缓存/IndexedDB 热路径；冷缓存仍需读取并索引全部记录，关键词查询、写入全量同步与 UI 冷启动仍需后续专项实测。
