# 测试与覆盖率

## 运行
- 安装依赖：`npm install`
- 运行单测并生成覆盖率：`npm run test`
- 覆盖率报告输出到 `coverage/`（HTML 与文本）。

## 范围
- 单元测试覆盖新引入的模块：`HighlightEngine`、`ClipService`、`SettingsService`。
- 通过 `tests/setup.ts` 提供最小的 `chrome` API mock，保证 Node 环境可运行。

## 扩展建议
- 为 `message-router` 编写消息路由测试，使用 `chrome.runtime.onMessage` 的模拟监听器。
- 为 `storage.ts` 编写基于 `indexedDBManager` 的集成测试，使用可替换的内存数据库 mock。
- 在 `content/selection.ts` 增加集成测试，用 jsdom 生成典型页面结构并验证高亮与定位的表现。