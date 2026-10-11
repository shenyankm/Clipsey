# Firefox 真实扩展运行验收

2026-10-12；源码基准 `8ad216d`。以 10,000 条摘录为主要规模，兼顾 100 条。本阶段只增加测试脚本和证据，没有修改生产源码、依赖、权限或数据库版本。

## 环境和方法

macOS arm64，Node.js 22.23.2，Playwright 下载的测试用 Firefox 153.0（Nightly，build ID `20260722112722`），geckodriver 0.37.1。它包含 Playwright 补丁，不等同于当前正式发行版。本轮通过原生 WebDriver 加载当前 `.output/firefox-mv2`，没有使用浏览器 API 桩，也没有通过 Playwright 自动化 Firefox。

浏览器与驱动仅放在临时目录，使用独立临时配置和合成数据。[Mozilla 文档](https://firefox-source-docs.mozilla.org/testing/geckodriver/Flags.html)说明 `--allow-system-access` 允许切换浏览器内部上下文；这里只用它读取临时扩展的 UUID 以及检查脚本错误。扩展按[官方临时加载接口](https://www.selenium.dev/documentation/webdriver/browsers/firefox/)安装，没有修改 manifest 来注入测试 ID。

分别导入 100/10,000 条，正文约 640 字符并包含中文、emoji，附带 HTML、完整日期。前 45 条同来源，其余来源各不相同。该夹具与 Chrome 备份报告的全不同来源夹具不同，不能据此比较两个浏览器谁快。

分页和完整请求各预热一次、测七次。备份使用同一 `EXPORT_DATA`，比较旧缩进 JSON 与生产单参数紧凑 JSON，再创建 Blob；预热两种编码，交替顺序各测七次。第二轮反转规模与编码顺序。全部串行运行，测量期间没有构建或运行其它性能测试。

使用扩展页面的 `performance.now()` 计时，本次样本呈整数毫秒精度；不强制 GC、不做内存采样。逐字段/顺序验证以及 Blob 解析在计时外；这些操作仍可能影响后续 GC。计时不含 WebDriver 传输、下载写盘、恢复、界面渲染或浏览器冷启动。

## 功能验收

每轮 12 项断言流程通过，两轮均覆盖：

- 100/10,000 条真实导入；URL 第二页含文本片段的来源查询，45 条命中及 20 条返回顺序正确；全量请求的每个公开字段与顺序一致，私有 `__clipseyUrlKey` 不泄漏。
- 两种编码的所有测量样本均逐条验证记录、Unicode、HTML、日期和备份头。
- 两种规模的实际管理页 `@content NEEDLE` 搜索，总数为一半，第二页与预期顺序相同；实际标题排序符合浏览器本地比较顺序。
- 实际下载 10,000 条紧凑文件，验证文件等于重新编码后的紧凑 JSON，全部摘录及中文、emoji、引号、换行、HTML 保留。
- 分别上传旧缩进与新紧凑文件，经过真实覆盖确认恢复；导出数据与下载文件的全部摘录逐字段相同。
- 无效导入失败，原有 10,000 条数据保持不变。

正式两轮结束时，Firefox 控制台中以该临时扩展 URL 为来源的非警告脚本错误为空。驱动日志仍包含测试浏览器自身的沙箱、Juggler 和附件服务提示，保留原始日志；该检查不能替代全浏览器错误监控。

WebDriver 把对象中值为 `undefined` 的可选属性转换为 `null`，因此分页及全量消息在扩展页内校验，避免测试驱动转换产生误判。文件和恢复的 Node 断言采用 JSON 表示；没有修改生产标准化或消息行为。

## 耗时和文件大小

下表取七次中位数，单位 ms。全量请求为后台缓存已加载后的请求；分页是既有 `sourceUrl_createdAt` 查询路径，不代表规范化 URL 页缓存或高亮恢复。

| 场景 | 第一轮 | 第二轮 |
| --- | --- | --- |
| 100 条，URL 第二页 | 3 | 3 |
| 100 条，全量请求 | 4 | 3 |
| 100 条，备份消息至 Blob，旧 → 新 | 4 → 4 | 4 → 4 |
| 100 条，仅 JSON 生成，旧 → 新 | 0 → 0 | 0 → 0 |
| 10,000 条，URL 第二页 | 3 | 1 |
| 10,000 条，全量请求 | 273 | 252 |
| 10,000 条，备份消息至 Blob，旧 → 新 | 308 → 289 | 283 → 276 |
| 10,000 条，仅 JSON 生成，旧 → 新 | 16 → 16 | 16 → 15 |

| 两轮一致的文件字节数 | 旧缩进 | 紧凑 | 减少 |
| --- | --- | --- | --- |
| 100 条 | 161,077 | 154,457 | 6,620（4.1%） |
| 10,000 条 | 16,180,627 | 15,520,607 | 660,020（4.1%） |

紧凑编码稳定减少文件字节，但没有证据表明 Firefox 的 JSON 生成部分稳定更快。消息往返是大数据总耗时的主要部分，两种编码调用的消息接口相同；不能把总耗时差全部归因于编码优化，也不能把 Chrome 的 V8 快速路径解释外推到 SpiderMonkey。

100 条编码的 `0ms` 是时钟粒度下的结果，不代表没有工作或分配；不据此宣称小数据速度提升。

导入耗时作为原始诊断保存，没有专门预热或隔离此前数据库大小、管理页刷新和后台通知，不作为写入优化结论。

## 复跑和边界

先构建 Firefox，然后提供测试浏览器和驱动路径：

```sh
node_modules/.bin/wxt build -b firefox
FIREFOX_PATH='/path/to/firefox' GECKODRIVER_PATH='/path/to/geckodriver' node scripts/firefox-performance.mjs
FIREFOX_PATH='/path/to/firefox' GECKODRIVER_PATH='/path/to/geckodriver' node scripts/firefox-performance.mjs --reverse
```

`EXTENSION_PATH` 可指向另一个 Firefox MV2 构建。脚本使用 Node 原生 HTTP、assert 和文件接口，不增加 Selenium 依赖。结束时删除测试配置，下载、输入备份、结果及驱动日志保留在打印的临时产物目录；产物可能有几十 MB。原始样本、环境、源码和构建哈希及验证范围见 [performance-firefox-results.json](./performance-firefox-results.json)。

脚本语法检查通过；另验证不存在的驱动、浏览器路径均以失败状态退出并清理配置。全部正式运行及失败探测后，没有残留测试配置或驱动进程。

生产源码未变，本轮没有重跑单元测试、类型检查或三浏览器构建；基准提交对应的 216 个测试及三浏览器构建见[备份报告](./performance-backup.md)，不算本轮新检查。

本轮只验证上述 Firefox MV2 路径。正式发行版 Firefox、Edge 运行时、浏览器重启和数据库升级、高亮/滚动、完整 popup、内存峰值、低端硬件、真实用户分布、商店发布及远端 CI 均未覆盖，不能据此宣布跨浏览器全功能验收或绝对最优。性能目标仍在进行。
