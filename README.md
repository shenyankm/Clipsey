# Page Clipper Template

基于 Vite + Vue 3 + Naive UI + TypeScript 的 Chrome 插件（Manifest V3）脚手架，用于快速搭建摘抄/剪藏类扩展。

## 功能特性
- 🔧 预配置 Vite 多入口构建（Popup / Options / Background / Content）
- 🎨 Vue 3 + Naive UI 组件库，提供基础 UI 模板
- 💾 封装 `chrome.storage` 的读写逻辑，内置摘抄数据结构
- 🧩 Manifest V3 配置完善，可直接在 Chrome 中加载

## 快速开始
```bash
npm install
npm run dev     # 开发模式（会启动 Vite 服务器）
npm run build   # 产出 dist 目录，可直接打包成扩展
```

> 提示：开发时可以配合 [`chrome://extensions`](chrome://extensions) 打开开发者模式并加载 `dist` 目录。

## 目录结构
```
page-clipper-template/
├── manifest.json
├── src/
│   ├── background/
│   ├── content/
│   ├── options/
│   ├── popup/
│   ├── types/
│   └── utils/
├── tsconfig*.json
├── vite.config.ts
└── package.json
```

重点目录：
- `src/background/`：Service Worker，处理上下文菜单、消息与存储
- `src/content/`：注入页面的脚本，负责抓取选中内容
- `src/popup/`：扩展图标弹出的 Vue UI
- `src/options/`：扩展设置页
- `src/types/`：统一的 TypeScript 类型定义
- `src/utils/`：工具函数、Chrome API Promise 封装等

## 构建与发布
1. `npm run build` 生成 `dist/`
2. 在 Chrome 打开 `chrome://extensions`
3. 打开“开发者模式” → “加载已解压的扩展程序”，选择 `dist/`

## 自定义建议
- 根据实际业务扩展 `background/api.ts` 中与后端通信的逻辑
- 在 `manifest.json` 中调整权限、匹配规则与图标
- 结合 `@/utils/helpers` 添加更多常用工具函数或格式化逻辑

欢迎在此模板基础上拓展更多功能，构建属于你的页面剪藏插件 🚀
