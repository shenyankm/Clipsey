# UI 启动与动态样式补充验收

日期：2026-10-11；生产源码：`e2d5839`。主要数据规模仍为 10,000 条，兼顾 100 条。本轮增加可复跑验收与记录，没有修改生产代码。此前缓存优化见[缓存读取验收](./performance-cache-snapshot.md)。

## 当前版本 popup

使用构建后的实际扩展、独立临时用户目录、Chrome for Testing 153.0.8010.12。调用原有设置、tabs、扩展消息及 IndexedDB。每种规模预热一次，再新建 popup 七次取中位数；数据库中各有 45 条属于当前页面，展示最新 20 条，其余来源不同。逐次断言 URL、顺序、富文本及数量。数据准备不计时。

正式计时没有启用 CPU profiler，另一次运行仅用于 CPU 探索。结果如下，单位 ms：

| 数据规模 | 标题区域 | 20 条列表完成 | 两个动画帧后 | 脚本执行 | 布局 |
| --- | --- | --- | --- | --- | --- |
| 100 | 50.3 | 94.5 | 107.6 | 15.5 | 5.5 |
| 10,000 | 51.2 | 93.7 | 108.4 | 15.5 | 4.5 |

这是当前版本的一组观测，没有同轮旧版本对照，不据此宣称新增收益。导航起点为零，网页标签保持激活、popup 作为后台扩展页打开；不是点击工具栏到弹窗可见的系统耗时，也不是服务工作线程休眠后的启动。

强制 GC 后，渲染进程 V8 堆中位数均约 14.69MB，包含同进程中其他扩展页面，不能视作 popup 独占内存。后台独立观测：

| GC 后后台 V8 堆，十进制 MB | 100 条 | 10,000 条 |
| --- | --- | --- |
| 导入结束 | 0.68 | 0.74 |
| popup 分页结束 | 0.71 | 0.74 |
| 主动全量读取并建立缓存 | 0.88 | 16.85 |
| 删除一条、缓存失效 | 0.72 | 0.75 |

这些是操作结束后的观测，不是峰值、进程 RSS 或长期无泄漏的证明。采样期间没有页面异常。

## 共享 UI 包候选

在 `e2d5839` 的临时源码副本里，将七个文件的 Ant Design Vue 聚合导入改为当前已安装包的 `es/<component>` 导入，保留组件、别名与注册。Chrome 生产构建通过。

| 页面静态 JS 总字节数 | 原版本 | 直接导入候选 |
| --- | --- | --- |
| popup | 697,316 | 697,318 |
| options | 695,486 | 695,485 |

没有缩减加载成本，候选未采用，也未继续做运行时或跨浏览器验收。没有为消除大 chunk 警告增加分包配置或替换依赖。单次启动的 [CPU profile](./performance-ui-validation.cpuprofile)只有 37 个样本，保留作探索证据，不能用它认定稳定热点或给出优化比例。

## 动态样式与高亮

将原有临时 Chrome 高亮验收整理为 [highlight-acceptance.mjs](../scripts/highlight-acceptance.mjs)。实际扩展消息共通过 10 项断言：长页面原生选区保存偏移/64 字符上下文、倒序恢复 20 条、重复激活、清理保留原文、同一节点相邻摘录、外部插入后原有偏移优先回退、CSSOM 隐藏当前目标、两种前置文本可见性变化，以及无页面异常。

新增的两种变化分别通过 `CSSStyleSheet.insertRule` 和视口媒体查询隐藏前置文本，目标保持可见。页面放置两个相同的摘录，断言准备的实时 Range 仍画在原目标，没有误画后面的同名摘录。媒体场景在目标之前增加 20 个逐项绘制，使视口变化有时间发生；在目标绘制的 MutationObserver 回调里确认前置文本已经隐藏。CSSOM 和媒体变化没有证明需要新增定位失效机制，保持现有引擎。

脚本语法检查、上述原生验收及启动失败清理检查均通过；不存在浏览器可执行文件时，以失败退出且不遗留临时用户目录。截图与运行结果路径见原始 JSON。

## 复跑与边界

```sh
PLAYWRIGHT_MODULE='/path/to/playwright/index.mjs' CHROME_PATH='/path/to/Chrome for Testing' node scripts/highlight-acceptance.mjs
PLAYWRIGHT_MODULE='/path/to/playwright/index.mjs' CHROME_PATH='/path/to/Chrome for Testing' node scripts/popup-performance.mjs
```

两个脚本均可用 `EXTENSION_PATH` 指定已构建的扩展。CPU 探索另设 `PROFILE='/path/to/startup.cpuprofile'`，不与正式计时混用。未增加应用依赖或扩展权限。原始逐次样本、包大小、生产产物 SHA-256、验收及检查范围见 [performance-ui-validation-results.json](./performance-ui-validation-results.json)。

生产源码未变，本轮没有重跑全量单元测试、类型检查或 Edge/Firefox 构建；对应 `e2d5839` 的 216 个测试和三浏览器构建见缓存报告，不算作本轮新检查。Edge/Firefox 运行时、低端硬件、真实用户数据、后台休眠启动、峰值内存及远端 CI 仍未验证，整个性能目标尚未完成。
