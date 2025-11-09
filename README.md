# Clipsey

Clipsey 是一款 Chrome 浏览器扩展，帮助你把网页上的零碎内容随手收藏、随时回看，并在需要时一键回到原文位置。无需注册账号，所有数据都保存在你的浏览器本地。

> 🎉 **项目现已迁移到WXT框架!** 查看 [WXT_MIGRATION.md](./WXT_MIGRATION.md) 了解详情。

## 可以帮你做什么
- **右键一键收藏**：选中网页内容后点击 `Clip current selection`，即可保存文本、标题、原网址和 HTML 片段。
- **抽屉式收藏库**：点击工具栏中的 Clipsey 图标即可查看所有收藏，支持快速刷新与搜索定位。
- **一键返回原文**：在列表中选择 `Open`，会在新标签页打开原网页并自动滚动到收藏时的位置。
- **信息补全**：扩展会自动记录来源页面的标题和链接，方便你事后整理。

## 开发环境

### 快速开始
```bash
# 安装依赖
npm install

# 开发模式(自动打开Chrome并加载扩展)
npm run dev

# 生产构建
npm run build

# 打包为zip(用于发布)
npm run zip
```

### 技术栈
- **框架**: [WXT](https://wxt.dev/) - 下一代浏览器扩展开发框架
- **UI框架**: Vue 3 + Ant Design Vue
- **语言**: TypeScript
- **构建工具**: Vite (via WXT)
- **安全**: DOMPurify (HTML内容净化)

详细开发指南请查看 [DEVELOPMENT.md](./DEVELOPMENT.md)

## 安装方法
1. 下载最新构建（或在本地执行 `npm install && npm run build` 生成 `.output/chrome-mv3/` 文件夹）。
2. 在地址栏输入 `chrome://extensions`，右上角开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择 `.output/chrome-mv3/` 文件夹，Clipsey 即会出现在扩展栏。

> 升级到新版本时，重新生成 `.output/chrome-mv3/` 并在 `chrome://extensions` 中点击“更新”即可。

## 使用指南
- **收藏片段**：在任何网页选中文本 → 右键 → `Clip current selection`。
- **管理收藏**：点击工具栏中的 Clipsey 图标打开弹窗，可浏览、搜索或删除记录。
- **回到原文**：点击某条收藏的 `Open` 按钮，自动跳转并定位到当时的段落。
- **数据存储**：所有内容保存在浏览器的 `chrome.storage.local` 中，不会上传到云端。

## 常见问题
- **是否需要联网？** 不需要，Clipsey 离线工作。
- **可以多设备同步吗？** 目前不支持自动同步，你可以通过开发者工具导出 `chrome.storage.local` 后手动迁移。
- **我的数据是否安全？** 扩展不会收集或上传任何信息，数据完全掌握在你自己手中。

有任何建议或想法，欢迎提交 Issue 告诉我们。祝你剪藏愉快！
