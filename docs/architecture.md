# Clipsey 架构设计文档

## 概览
- 背景脚本采用三层架构：MessageHandlers 层、Services 层、背景入口（调度）。
- 内容脚本重构为 HighlightEngine，使用 TreeWalker + Range 精准定位与高亮。
- 数据持久化通过 IndexedDB（`indexedDBManager`、`IndexedDBQuery`），剪藏数据由 `ClipService` 封装。

## 模块划分
- Background
  - `handlers/`：
    - `message-router.ts`：集中路由 `SAVE_CLIP`、`REQUEST_CLIPS`、`CLEAR_CLIPS`、`OPEN_CLIP`。
    - `save-clip.ts`、`request-clips.ts`、`clear-clips.ts`、`open-clip.ts`：单一职责处理器。
  - `services/`：
    - `clip-service.ts`：封装剪藏读写查询，面向业务。
    - `content-script-service.ts`：注册、注入内容脚本与跨进程通信。
    - `settings-service.ts`：设置读写（通过 IndexedDB）。
  - `index.ts`：仅负责初始化、事件注册（安装、启动、上下文菜单、tab 更新）、调用 Services。
- Content
  - `highlight-engine.ts`：高亮引擎；支持可撤销、节流、中断与内存友好操作。
  - `selection.ts`：内容脚本入口，消息转发至 HighlightEngine，保留向后兼容的请求选区逻辑。

## 职责边界
- MessageHandlers：仅解析消息并调用 Services，不包含状态与业务细节。
- Services：实现可复用的业务逻辑；无 UI；无全局事件注册。
- Index（背景入口）：只做初始化与事件订阅、调度调用，不参与业务细节。
- HighlightEngine：处理页面 DOM；提供高亮与定位 API；独立的错误处理与性能策略。

## 兼容性
- 保持原 `settings-store.ts`、`api.ts` 等对外 API 路径不变，通过内部委托实现。
- `manifest.json`、打包入口与内容脚本文件名不变（仍输出 `scripts/content.js`）。
- 消息协议保持：`REQUEST_SELECTION`、`SAVE_CLIP`、`REQUEST_CLIPS`、`CLEAR_CLIPS`、`OPEN_CLIP`、`ACTIVATE_HIGHLIGHTS`。

## 设计权衡
- 在不破坏现有 UI 的前提下，增加服务与处理器分层以提升可维护性。
- HighlightEngine 采用最小可行实现，逐步替换旧逻辑，保留 selection.ts 作为入口与兼容层。