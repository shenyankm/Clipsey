# 高亮恢复的消息任务兼容路径

2026-10-12；基线 `d4253fa`。延续[高亮调度验收](./performance-highlight-scheduling.md)，继续以 10,000 条摘录为主要库规模、100 条为辅助规模。这里测量的是 100/10,000 段网页恢复 20/100/1,000 条高亮，并非同时绘制 10,000 条。

## 改动与适用范围

没有 `scheduler.postTask` 时，原实现每条高亮都使用 `setTimeout(0)`。候选仅为已经校验过的批量偏移范围使用消息任务，每个恢复批次复用一个 `MessageChannel`，完成、失败或取消时关闭两端。不要求持久化缓存，也没有新增依赖、权限、设置或数据库结构。

仍优先使用原来的后台优先级 `postTask`。当前测试 Chrome 和 Firefox Nightly 均支持该 API，所以以下大幅提速来自**强制关闭该 API 后的兼容路径**，不能称为当前浏览器默认路径的提速。无消息通道、正数节流、完整扫描或预定位范围失效时保留定时器路径。每约 8ms 再插入一次定时器边界，防止连续消息任务挤压页面工作；这不是单次定位、布局或输入延迟的 8ms 上限。

使用消息任务的依据见 [MessageChannel 接口](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel)及 [HTML 定时器规范](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers)。浏览器如何选择不同任务队列需要实测，不能从接口存在推导响应性。

## 独立耗时

macOS、Node.js 22.23.2。Chrome 为原有 Headless Chrome 155；Firefox 为带 Playwright 补丁的 153.0 Nightly，geckodriver 0.37.1。两浏览器均使用真实 DOM、独立临时配置；颜色设置消息使用原有空响应桩，生产定位、绘制、取消与调度代码照常执行。Firefox 新脚本复用同一夹具与固定 Git 基线，而不是另写较简单的定位算法。

每项预热一次、七次取中位数。先等待夹具两帧布局，再计时；不包含首次构建 DOM、扩展启动、存储读取或消息传输。每次都逐个核对目标、原文、数量和清除结果。各阶段串行，没有并行测试、构建或其他浏览器测量。候选在源码冻结后重新完成全部正反序测量；前期候选结果单独保存。

Chrome，单位 ms，基线 → 最终候选：

| 网页段落 / 高亮 / 定位 | 正序 | 反序 |
| --- | --- | --- |
| 100 / 20 / 偏移 | 66.7 → 0.8 | 75.4 → 3.5 |
| 100 / 100 / 偏移 | 447.8 → 3.7 | 495.5 → 5.0 |
| 10,000 / 20 / 偏移 | 88.6 → 18.2 | 90.9 → 15.7 |
| 10,000 / 20 / 全文回退 | 298.2 → 301.8 | 313.8 → 307.9 |
| 10,000 / 100 / 偏移 | 535.9 → 23.9 | 550.7 → 28.1 |
| 10,000 / 1,000 / 偏移 | 5,615.9 → 183.4 | 5,833.7 → 206.3 |

Firefox，单位 ms，基线 → 最终候选：

| 网页段落 / 高亮 / 定位 | 正序 | 反序 |
| --- | --- | --- |
| 100 / 20 / 偏移 | 81 → 1 | 93 → 3 |
| 100 / 100 / 偏移 | 479 → 7 | 561 → 8 |
| 10,000 / 20 / 偏移 | 108 → 26 | 120 → 31 |
| 10,000 / 20 / 全文回退 | 459 → 467 | 457 → 504 |
| 10,000 / 100 / 偏移 | 511 → 67 | 622 → 71 |
| 10,000 / 1,000 / 偏移 | 5,399 → 538 | 6,436 → 392 |

1,000 条偏移恢复的兼容路径耗时，Chrome 降低约 96%–97%，Firefox 降低约 90%–94%。全文回退没有稳定收益，Firefox 反序增加约 47ms；不把此路径称为更快，也未将阶段之间的资源影响单独归因。

默认 `postTask` 路径单独作功能对照：最终源码的 1,000 条偏移恢复，Chrome 192.6ms、Firefox 530ms。它们不是兼容路径的基线，不用于上述提升比例。此前 Firefox 的默认路径 489ms；一次中位数对照不足以断言默认路径稳定提速或无性能回退。

## 响应性、取消与前期候选

原始每次最大动画帧间隔、16ms 心跳定时器间隔与计数均保存，不以小于一帧即结束的样本宣称帧率。Chrome 的 1,000 条恢复最大帧间隔中位数约 16.8 → 16.8ms / 16.8 → 16.7ms，最大心跳间隔约 34.6 → 19.3ms / 23.1 → 19.6ms。

Firefox 的 1,000 条恢复最大帧间隔中位数约 20.1 → 20.9ms / 17.5 → 24.4ms，心跳间隔约 25 → 27ms / 22 → 25ms；100 条大页面正序帧间隔约 20.2 → 30.1ms。完整扫描反序帧间隔约 33.9 → 48.6ms，心跳约 35 → 52ms。保留这些不利结果，不宣称所有帧间隔均改善、所有任务都低于 50ms或真实输入 INP 已通过。Firefox 不提供夹具所使用的 `longtask` 观察类型，不将空列表当作没有长任务。

最终四轮兼容路径的普通定时器取消均发生在绘制第 2 条后：返回 `false`，取消后没有继续绘制；Chrome 约 0.1/0.3ms、Firefox 约 1/0ms。默认 `postTask` 对照在第 1 条后取消。不是只验证微任务可执行。

前期无预算、逐项新建通道的 Firefox 候选虽将 1,000 条恢复降至 530ms，但帧间隔中位数约 48ms，未直接采用。增加定时器预算后改善这一场景；完整扫描仍有波动，所以消息路径限制为已校验的预定位范围。最后改为每批次复用一个通道，避免成千上万个临时端口。前期三种版本的样本均单列，不能混入最终结果；未为这些临时版本补造源码哈希。

## 检查与真实扩展

最终 278 项测试、29 个文件通过 coverage；语句 60.44%、分支 56.88%、函数 61.82%、行 60.85%。应用类型检查与新脚本语法检查通过。新增检查在完成/取消时关闭端口、批次内复用、定时器预算、全文回退，以及同时存在消息 API 时仍优先 `postTask` 和保留正数节流。两个消息任务测试在生产修改前失败，失败日志保留。

Chrome/Edge/Firefox 顺序构建通过。原有大于 500kB 的共享 UI chunk 和 Firefox 发布配置提示继续保留。

真实扩展验收使用构建产物的临时副本，在 content script 前加以下两行，强制实际内容脚本执行兼容路径；原构建产物未修改：

```js
if (typeof MessageChannel !== 'function') throw new Error('MessageChannel unavailable in content world');
Object.defineProperty(globalThis, 'scheduler', { value: undefined, configurable: true });
```

Firefox 临时副本额外授予回环地址权限，用于本地合成网页；生产权限没有增加。Chrome for Testing 153.0.8010.12 和同一 Firefox Nightly 各通过 18 项检查：偏移/全文定位、倒序批量恢复、重复与清除、Unicode 边界、动态插入、CSSOM/媒体条件变化、隐藏重复文字、原生选区和异常检查。两者的页面普通定时器都在第 2 条绘制时运行。结果、断言、临时副本内容哈希和原始日志保存在 JSON。

初始导入 10,000 条，取出其中 20 条页面摘录供真实消息恢复；另有 1,000 条合成载荷验证批量恢复、重复与清除。后者没有写入库，不能称为同时绘制库内 10,000 条。末尾选区测试额外保存一条摘录，两浏览器最终库数量 10,001 已断言。Chrome 页面异常及 Firefox 扩展来源的非警告脚本错误均为空。

## 复跑与边界

先安装项目已有依赖，设置浏览器和驱动路径，在仓库根目录执行：

```sh
BASELINE_REF=d4253fa node scripts/performance.mjs --highlight-scheduling --timer-yield --baseline
node scripts/performance.mjs --highlight-scheduling --timer-yield
BASELINE_REF=d4253fa node scripts/performance.mjs --highlight-scheduling --timer-yield --reverse --baseline
node scripts/performance.mjs --highlight-scheduling --timer-yield --reverse

BASELINE_REF=d4253fa node scripts/firefox-highlight-scheduling.mjs --timer-yield --baseline
node scripts/firefox-highlight-scheduling.mjs --timer-yield
BASELINE_REF=d4253fa node scripts/firefox-highlight-scheduling.mjs --timer-yield --reverse --baseline
node scripts/firefox-highlight-scheduling.mjs --timer-yield --reverse
```

Chrome 脚本读取 `CHROME_PATH`；Firefox 脚本读取 `FIREFOX_PATH`、`GECKODRIVER_PATH`，可用 `DRIVER_LOG` 保存驱动日志。不带 `--timer-yield` 则保留浏览器原有 API，不能与强制关闭 API 的时间混合比较。Firefox 脚本在结束或失败时清理会话、配置与 Vite 服务。

真实扩展流程复用 [Chrome 验收脚本](../scripts/highlight-acceptance.mjs)和 [Firefox 验收脚本](../scripts/firefox-highlight-acceptance.mjs)，`EXTENSION_PATH` 指向上述临时副本；需要脚本原有的浏览器/驱动环境变量。原始样本、源码/构建哈希、验证日志和边界见 [performance-message-yield-results.json](./performance-message-yield-results.json)。

未验证正式版 Firefox、真正缺少 API 的旧发行版、Edge 运行时、后台标签页、繁忙第三方页面、低端硬件、真实用户数据分布、峰值/RSS、长时间资源泄漏或远端 CI。没有声称默认浏览器全流程提升或整个项目达到绝对最优；整体性能目标仍在进行。
