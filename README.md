# Page Clipper

_A modern Chrome extension starter for capturing, organizing, and revisiting web snippets with Vue 3 + Vite + Naive UI._  
_基于 Vue 3 + Vite + Naive UI 的现代网页摘录 Chrome 扩展脚手架。_

## ✨ Features · 功能亮点
- **Context menu clipping｜右键菜单摘录**：选中文本后点击 “Clip current selection” 即可保存标题、来源链接、纯文本与 HTML 片段。
- **Popup 管理面板**：在弹窗中浏览本地存储的摘录，支持刷新、清空与跳转。
- **智能高亮回访**：从弹窗打开原网页时自动滚动并尝试高亮原始段落，快速回到阅读位置。
- **Manifest V3 & TypeScript**：完善的 MV3 脚本架构与类型约束，便于继续扩展业务逻辑。
- **Naive UI 主题风格**：内置响应式 UI 组件与细节优化，可直接用于生产设计迭代。

## 🚀 Quick Start · 快速上手
```bash
npm install          # 安装依赖
npm run dev          # 启动 Vite 开发服务器（监视源码变化）
npm run build        # 生成 dist/，用于打包到 Chrome 扩展
```

开发调试扩展：
1. 运行 `npm run build`（初次可先 `npm run dev` 查看界面）。
2. 打开 `chrome://extensions`，勾选 “开发者模式”。
3. 点击 “加载已解压的扩展程序”，选择仓库内的 `dist/` 目录。
4. 右键任意页面选中文本，测试剪藏、弹窗展示与高亮回访功能。

> 开发阶段修改代码后，需要重新执行 `npm run build` 并在扩展管理页刷新才能看到最新效果。

## 🧭 Usage Tips · 使用指南
- **捕捉摘录**：在网页上选中内容 → 右键 → 选择 “Clip current selection”。
- **查看与管理**：点击扩展图标，使用弹窗查看历史摘录，支持一键刷新或清空。
- **重新访问**：点击列表中的 `Open`，会打开原网页并尝试定位至摘录位置。
- **数据存储**：所有摘录均存放在 `chrome.storage.local`，如需同步可替换为 `chrome.storage.sync` 或自定义后端。

## 📂 Project Structure · 目录结构
```
.
├── manifest.json          # Chrome 扩展清单（Manifest V3）
├── src/
│   ├── background/        # Service Worker & 数据存储、上下文菜单逻辑
│   ├── content/           # 注入页面的脚本（抓取选区、滚动定位高亮）
│   ├── popup/             # 弹窗界面（Clip 列表与操作）
│   ├── options/           # 预留的扩展配置页
│   ├── types/             # TypeScript 类型定义
│   └── utils/             # 工具函数与 Chrome API 封装
├── public/ / assets/      # 扩展图标等静态资源
├── vite.config.ts         # Vite 构建配置
└── package.json           # 项目信息与脚本命令
```

## 🛠 Scripts · 常用命令
| Command | Description |
|---------|-------------|
| `npm run dev` | 启动 Vite 开发服务器并监听源码变化 |
| `npm run build` | 运行 `vue-tsc` 类型检查并生成生产构建 |
| `npm run preview` | 在本地预览打包后的扩展站点 |
| `npm run typecheck` | 独立执行 TypeScript / Vue SFC 类型检查 |

## 🧱 Tech Stack · 技术栈
- **Vue 3 + `<script setup>`**：组合式 API 构建界面。
- **Naive UI**：现代化 UI 组件库，内置主题与交互细节。
- **Vite**：极速开发与构建体验，支持热更新。
- **TypeScript**：全链路类型安全，避免常见运行时错误。
- **Chrome Extensions Manifest V3**：Service Worker 架构、`chrome.scripting` 等新特性。

## 🧩 Customization Ideas · 扩展建议
- 将 `clip.htmlContent` 渲染成富文本预览，或导出 Markdown / PDF。
- 接入后端 API，实现账号同步或团队共享剪藏。
- 在 `options/` 页面添加配置项（如高亮颜色、快捷键、自动同步策略）。
- 使用 `chrome.contextMenus.update` 动态调整菜单项，实现多种摘录模式。

## 🤝 Contributing · 参与贡献
欢迎提交 Issue / PR 指出问题或补充特性。开发前可先讨论需求，以便保持脚手架的轻量与易扩展性。

## 📄 License · 许可协议
该项目基于 [Apache License 2.0](./LICENSE) 开源。欢迎在遵循协议的前提下自由使用与修改。
