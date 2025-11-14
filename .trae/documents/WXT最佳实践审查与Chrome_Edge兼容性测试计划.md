## 目标
- 全面审查代码库对WXT官方最佳实践的遵循情况，给出问题点与改进建议（含具体文件与行号）。
- 在Windows环境下分别针对Chrome与Edge的“当前稳定版/上一个主要版本”执行核心功能兼容性与性能测试，输出一致性结论与问题复现路径。

## 审查维度
1. 项目结构与模块化：目录划分、入口脚本、服务/处理器/工具的分层与边界
2. WXT配置与Manifest：权限最小化、host_permissions/optional_host_permissions、CSP与沙箱、入口声明
3. API使用规范：`wxt/browser`统一、`defineBackground/defineContentScript`入口、消息路由与类型约束
4. 错误处理机制：统一错误类型、用户提示、可观察性与降级策略
5. 性能优化措施：内容脚本加载时机、批量渲染/节流/可中断、缓存与清理策略
6. 安全与可维护性：lint/format、依赖安全性、CSP与nonce一致性、存储与权限申请

## 浏览器测试矩阵
- Chrome：稳定版N、N-1（版本号以Chrome Releases稳定通道公告为准，参考 chromereleases.googleblog.com 与 developer.chrome.com/release-notes）
- Edge：稳定版N、N-1（基于Chromium稳定通道对应版本）
- 平台：Windows

## 测试范围
- 安装与生命周期：安装/更新（`runtime.onInstalled`）、启动（`runtime.onStartup`）
- 右键菜单：创建与点击触发（`contextMenus.onClicked`），消息路由响应
- 选区与高亮：页面选区聚焦、批量高亮（含滚动定位与撤销），颜色方案注入与更新
- 内容脚本：`document_idle`加载、按需注入（缺失接收方时的自动注入与错误路径处理）
- 权限与主机：可选权限查询/申请（`permissions.contains/request`）与`host_permissions`覆盖率
- 选项/弹窗页面：功能一致性与样式兼容（Ant Design Vue组件渲染与交互）
- 存储：`browser.storage.local`读写与迁移容错
- 安全：CSP沙箱策略与开发态`connect-src`放行的生产移除

## 验收标准
- 功能一致性：上述核心功能在四个浏览器版本全部可用、行为一致
- 样式兼容：UI无严重错位/闪烁，颜色方案切换即时生效
- 性能表现：批量高亮200项以内可接受（滚动与交互不卡顿），可中止与清理逻辑有效
- 错误处理：无未捕获异常，权限/路径问题能得到明确提示与可恢复路径

## 执行步骤（PowerShell）
- 开发验证：`pnpm dev:chrome`、`pnpm dev:edge`（或直接 `pnpm dev` 并在浏览器选择对应目标）
- 构建产物：`pnpm build:chrome`、`pnpm build:edge`；必要时 `pnpm zip:chrome`、`pnpm zip:edge` 以便在指定浏览器版本手动加载
- 手动加载：在目标浏览器版本打开扩展管理页面，启用开发者模式，加载解压目录（`.output/chrome-mv3`或`edge-mv3`）
- 用例执行：依序执行“右键菜单→选区→批量高亮→颜色方案切换→内容脚本注入→权限申请→存储读写→卸载/重载”场景，并记录日志与截图

## 交付物
- 审查报告：问题清单（含文件/行号）、改进建议、风险分析
- 测试记录：按矩阵列出每项用例在不同版本下的结果（通过/失败/注意事项），附关键日志/截图
- 修复清单：按优先级整理可实施改动（lint/format配置、构建校验、错误提示与遥测、性能开关等）

## 后续改动建议（获批后执行）
1. 增加ESLint与Prettier配置，统一类型/风格（最小改动，不影响运行时）
2. 构建期校验内容脚本路径与`manifest`一致性，避免注入路径错误
3. 遥测/日志：为迁移与权限相关错误增加可观察性输出（可选上报端点占位）
4. 性能开关：在选项页暴露“最大高亮数/节流间隔”设置，提升不同机器的自适应

请确认以上计划；获批后，我将按矩阵执行浏览器兼容性验证，并提交带实测结果的最终报告。