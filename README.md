# Clipsey

Clipsey 是一款专注于网页摘录的浏览器扩展。无需注册，数据本地存储，支持一键高亮与回溯原文。

## ✨ 核心功能

*   **✂️ 一键摘录**：选中网页文本，右键即存，自动高亮。
*   **⚡ 快速回溯**：点击摘录，支持的浏览器使用原生 Text Fragments 链接滚动并高亮；不支持时使用扩展定位。原文变动、重复文本或网站禁用文本片段可能影响定位。
*   **🔒 隐私安全**：所有数据存储在浏览器本地（IndexedDB），无服务器上传。
*   **📚 历史保留**：不会因超过 200 条而自动删除旧摘录；实际容量受浏览器存储配额限制。恢复备份会替换现有摘录，请先导出当前数据。
*   **🎨 富文本摘录**：保存加粗、列表、链接等基础富文本结构，展示时净化不安全内容；不完整保留网页样式。

## 🚀 快速开始

1.  **安装**：从 [Releases](https://github.com/Shenean/Clipsey/releases) 下载安装。
2.  **使用**：选中网页文本 -> 右键 "保存当前选中内容"。
3.  **管理**：点击浏览器右上角 Clipsey 图标查看当前网页摘录；进入设置中的“摘要管理”搜索、排序和查看时间线。
4.  **备份**：在“摘要管理”中导出紧凑 JSON 备份；也能恢复旧的缩进 JSON 备份，恢复前会校验记录并显示覆盖确认。备份包含摘录及最多 1,000 条错误日志，不包含偏好设置。

## 🛠️ 开发

基于 [WXT](https://wxt.dev/) + Vue 3 + TypeScript 构建。

开发环境需要 Node.js 22.22.2+（22.x）、24.15.0+（24.x）或 26+；使用项目固定的 pnpm 版本：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build:all
```

依赖采用最新稳定兼容版本。TypeScript 暂使用 6.0.3：当前 vue-tsc 3.3.13 无法调用 TypeScript 7 的编译器入口，待上游兼容后再升级。测试使用 jsdom 与 fake-indexeddb，覆盖存储事务、迁移、缓存同步、高亮和原文链接；真实网页的原生滚动效果仍需浏览器验收。

性能审查、真实 Chrome/Firefox 对照数据与复跑方式见 [性能验收记录](docs/performance.md)。

---

[提交反馈](https://github.com/Shenean/Clipsey/issues) | [GitHub](https://github.com/Shenean/Clipsey)
