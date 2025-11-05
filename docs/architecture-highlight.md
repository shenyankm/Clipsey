# 文本高亮功能重构架构设计（Clipsey）

本文档描述“文本高亮”功能的重构方案，围绕配置解耦、统一颜色管理、跨浏览器兼容以及性能监控四个方面进行设计与实现说明。

## 背景与目标

- 现状：高亮颜色在内容脚本中通过常量硬编码，无法根据“基础设置”中的“内容高亮”动态调整；不同模块（highlight-engine、selection）分别定义颜色与类名，存在重复与耦合。
- 目标：
  1. 高亮颜色配置必须动态读取“基础设置”中的“内容高亮”对应值；
  2. 优化代码结构，实现配置与功能逻辑的解耦；
  3. 建立统一的颜色管理机制，支持后续可能的配置扩展；
  4. 确保高亮功能在不同浏览器和设备上的兼容性；
  5. 添加必要的性能监控指标，确保高亮操作不会影响页面渲染性能。

## 架构概览

重构后模块划分：

- 内容层（Content Scripts）：
  - color-manager.ts（新增）：统一管理颜色读取、计算与样式注入。
  - highlight-engine.ts：改为使用 CSS 类与变量，不再硬编码颜色，按 Range 应用高亮。
  - selection.ts：创建高亮元素时仅设置类名与数据属性，初始化时调用颜色管理器。

- 后台层（Background）：
  - settings-service.ts：IndexedDB 读写设置。
  - handlers/request-settings.ts（新增）：处理 REQUEST_SETTINGS 消息，向内容脚本提供设置值。
  - handlers/message-router.ts：新增 REQUEST_SETTINGS 分支，路由统一管理。

## 关键设计

### 1. 配置动态读取

- 内容脚本通过 chrome.runtime.sendMessage({ type: 'REQUEST_SETTINGS' }) 向后台请求设置；
- 后台处理器从 IndexedDB 中读取 key=“clipsey-options”的值并返回；
- color-manager.ts 缓存读取结果，并将“highlightColor”转换为 rgba，用于内联与覆盖两类高亮颜色。

### 2. 配置与逻辑解耦

- 颜色不再在功能逻辑中以常量出现；统一由 color-manager 以 CSS 变量注入：
  - --clipsey-inline-highlight-color：内联高亮颜色（默认 rgba(251,191,36,0.45)）
  - --clipsey-overlay-highlight-color：覆盖高亮颜色（默认 rgba(251,191,36,0.30)）
- 功能模块只关心类名（clipsey-inline-highlight / clipsey-overlay-highlight）与位置计算，避免逻辑与配置耦合。

### 3. 统一颜色管理机制

- 提供 API：
  - ensureHighlightColorsReady(): 初始化并注入样式；
  - getInlineHighlightColor()/getOverlayHighlightColor(): 返回当前颜色；
  - updateCachedOptions(options): 更新缓存并刷新 CSS 变量；
  - 常量：HIGHLIGHT_INLINE_CLASS、HIGHLIGHT_OVERLAY_CLASS。

### 4. 跨浏览器兼容性

- 选择标准 API：TreeWalker + Range 操作，避免依赖特定浏览器特性；
- CSS 变量与类选择器在 Chrome/Firefox 均有良好支持；
- 对 CSS.escape 采用降级实现；
- overlay 高亮采用绝对定位与 pointer-events: none，避免对页面交互造成影响；
- 平滑滚动与视口偏移计算保留原逻辑（selection.ts），在移动端考虑安全区与粘性头部。

### 5. 性能监控与优化

- 在 HighlightEngine.activateHighlights 中添加基础打点：
  - durationMs：一次批量高亮的耗时；
  - appliedCount：成功应用的高亮数量；
- 提供 getLastPerfStats() 以便调试与记录；
- 优化点：
  - 颜色通过 CSS 变量统一管理，减少每次创建元素的样式设置次数，降低样式重计算；
  - 采用批处理与轻微节流（默认 16ms）以避免长任务阻塞渲染；

## 数据流与序列图（文字描述）

1. 用户在“基础设置”中选择“内容高亮”颜色（Options 页面通过 settings-store 写入 IndexedDB）。
2. 内容脚本初始化时，color-manager 发送 REQUEST_SETTINGS 消息到后台。
3. 后台 message-router 将消息转发到 request-settings 处理器，从 settings-service 读取配置并返回。
4. color-manager 解析 highlightColor，计算 rgba 并注入 CSS 变量与类样式。
5. highlight-engine/selection 在应用高亮时，仅设置类名与位置，不直接设置颜色。
6. 性能数据在 activateHighlights 完成后记录，可由 DevTools 或日志收集。

## 接口与类型

- 请求消息：{ type: 'REQUEST_SETTINGS' }
- 响应：{ success: boolean; data?: { highlightColor?: string } }
- CSS 变量：--clipsey-inline-highlight-color、--clipsey-overlay-highlight-color
- 类名：.clipsey-inline-highlight、.clipsey-overlay-highlight

## 迁移策略

- 保留旧颜色作为默认值，确保在未设置或读取失败时功能可用；
- 渐进式接入：先统一颜色管理，再逐步将其他相关样式（如下划线/overlay边框等）纳入变量体系；

## 风险与应对

- 设置读取失败：提供默认颜色与错误吞噬；
- 不同页面样式隔离：采用类名选择器与 CSS 变量注入到内容文档，避免污染宿主页面；
- 性能波动：保持轻微节流与批处理，必要时进一步引入 requestIdleCallback（可选）。

## 验收与测试

- 单元测试：
  - highlight-engine 行为不回归（已有测试覆盖）
  - color-manager 初始化与更新变量（新增测试）
- 跨浏览器手动验证：
  - Chrome / Firefox 最新版本
  - 检查高亮颜色与位置正确性
- 性能报告：在 docs/performance-report.md 中记录前后对比与采样数据。

---

本架构确保高亮颜色从“基础设置”动态读取，配置与功能解耦，并为未来的主题与更多样式定制提供了统一扩展点。