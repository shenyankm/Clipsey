# 模块耦合评估与优化建议（Clipsey）

## 概览
- 评估范围：内容脚本（selection.ts、highlight-engine.ts、color-manager.ts）、后台脚本（message-router.ts、handlers/*、services/*）、前端页面（popup、options）。
- 目标：识别消息交互与数据访问耦合点，量化交互频率与扇入/扇出，提出解耦与可扩展性优化方案。
- 近期改动：统一 `sendMessage` 封装（复用 `src/utils/chrome.ts`），`color-manager.ts` 通过消息读取设置并注入 CSS 变量，实现颜色配置与功能解耦。

## 组件与消息流
- 内容脚本入口：`selection.ts`
  - 监听消息：`REQUEST_SELECTION`、`FOCUS_CLIP`、`ACTIVATE_HIGHLIGHTS`
  - 发送消息：`SAVE_CLIP`
  - 将选择范围包装为高亮（内联），收集上下文与定位信息。
- 高亮引擎：`highlight-engine.ts`
  - 方法：`focusClip`、`activateHighlights`、`undo`、`clear`
  - 依赖：`color-manager.ts` 提供类名与颜色注入，基于 `TreeWalker + Range` 应用高亮。
- 颜色管理器：`color-manager.ts`
  - 读取：向后台发送 `REQUEST_SETTINGS`，获取 `highlightColor`
  - 注入：通过 CSS 变量与类名统一颜色（`clipsey-inline-highlight`、`clipsey-overlay-highlight`）
- 后台路由：`message-router.ts`
  - 处理：`SAVE_CLIP`、`REQUEST_CLIPS`、`CLEAR_CLIPS`、`OPEN_CLIP`、`REQUEST_SETTINGS`
- 内容脚本服务：`content-script-service.ts`
  - 背景主动向标签页发送：`REQUEST_SELECTION`、`FOCUS_CLIP`、`ACTIVATE_HIGHLIGHTS`
  - 注入内容脚本并处理无接收者场景的重试与降级。

## 调用频率与耦合指标（静态近似）
- 内容脚本 → 后台（`chrome.runtime.sendMessage`）：
  - 统一后主要分布：`selection.ts`（`SAVE_CLIP`）、`color-manager.ts`（`REQUEST_SETTINGS`）
- 后台 → 内容脚本（`chrome.tabs.sendMessage`）：
  - 主要分布：`content-script-service.ts`，用于请求选区与激活高亮。
- 关键消息使用位置：
  - `REQUEST_SELECTION`：`selection.ts` 处理；`background/index.ts` 发起
  - `FOCUS_CLIP`：`selection.ts` 处理；`background/index.ts` 与 `handlers/open-clip.ts` 发起
  - `ACTIVATE_HIGHLIGHTS`：`selection.ts` 处理；`background/index.ts` 发起
  - `REQUEST_SETTINGS`：`message-router.ts` 路由；`color-manager.ts` 发起
  - `SAVE_CLIP`：`message-router.ts` 路由；`selection.ts` 发起

## 数据访问层耦合
- 直接 `IndexedDB` 依赖集中在后台：`indexeddb.ts`、`indexeddb-query.ts`、`api.ts`、`storage.ts`、`services/settings-service.ts`。
- 内容脚本完全通过消息对接设置与剪藏，不直接依赖数据访问层，耦合度较低。

## 扇入/扇出（简述）
- 扇入高：`content/color-manager.ts` 被 `selection.ts` 与 `highlight-engine.ts` 使用（颜色与类名统一来源）。
- 扇出高：`content-script-service.ts` 与 `message-router.ts`（多消息类型的集中路由与分发）。

## 风险与问题
- 内容脚本内存在重复的消息封装（已统一到 `utils/chrome.ts`）。
- 设置读取链路依赖消息交互，中断时需默认回退（`color-manager.ts` 已提供默认颜色与错误吞吐）。
- 背景脚本主动消息在特定页面场景可能出现无接收者或 frame 移除（已有重试与注入逻辑，建议保持指数退避与错误分类）。

## 优化建议
- 统一消息封装：
  - 在内容脚本中全部通过 `utils/chrome.sendMessage` 封装调用，避免重复实现与错误处理分散。
- 配置解耦与缓存：
  - `color-manager.ts` 继续作为颜色的单一来源；支持增量更新 `updateCachedOptions`，减少全量刷新样式。
- 性能监控：
  - 保持 `HighlightEngine.activateHighlights` 的节流与打点，输出 `getLastPerfStats()` 供 DevTools 收集。
- 错误分类与重试：
  - 背景 → 内容消息失败时区分：无接收者、frame 移除、权限不足；针对首两类保持注入与有限次重试。
- 可测试性：
  - 为 `color-manager` 注入 `sendMessage` 适配层或在测试环境中模拟响应，确保单元测试不依赖真实 `chrome` 对象。

## 分阶段实施计划
- 第 1 阶段（已完成）：
  - 内容脚本统一 `sendMessage` 封装；`color-manager` 通过消息读取设置并注入 CSS 变量。
- 第 2 阶段：
  - 增强错误分类与重试策略（content-script-service），记录失败次数与原因；完善日志与打点。
- 第 3 阶段：
  - 扩展 `color-manager` 支持更多样式变量（如下划线颜色、overlay 边框），并在 `selection.ts` 迁移相关常量。
- 第 4 阶段：
  - 引入端到端集成测试（激活高亮、焦点定位、保存剪藏），覆盖跨进程消息链路。

### 分阶段任务细化（示例）
- 错误分类与重试：
  - 在 `content-script-service` 中区分 `MissingReceiver`、`FrameRemoved`、`PermissionDenied`，分别采取注入脚本、延迟重试、提示用户授权。
  - 采用指数退避：100ms、200ms、400ms，最多 3 次。
- 样式变量扩展：
  - `--clipsey-underline-color`、`--clipsey-overlay-border-color`；在 `selection.ts` 与 `highlight-engine.ts` 只使用类名与变量。
- 集成测试：
  - 使用 `jsdom`/浏览器环境模拟消息与 DOM，验证消息路由、选区请求、保存剪藏与批量高亮流程。

## 重构代码示例（统一消息封装）
- 优化前（示例，内容脚本内手写封装）：

```ts
// selection.ts 内部定义
function sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response as TResponse);
      });
    } catch (error) {
      reject(error);
    }
  });
}
```

- 优化后：

```ts
// 统一复用 utils/chrome.ts
import { sendMessage } from '@/utils/chrome';

// 使用统一封装
await sendMessage({ type: 'SAVE_CLIP', payload });
```

## 结论
- 当前架构的消息交互清晰，内容脚本对数据访问层低耦合；通过统一封装与颜色管理器，进一步降低重复与提升可扩展性。
- 后续建议以渐进方式完善错误分类、样式变量扩展与集成测试覆盖，确保稳定性与跨浏览器一致性。