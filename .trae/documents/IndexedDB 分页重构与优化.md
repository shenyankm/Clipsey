## 核心目标

* 彻底消除 `popup.html?tab=basic` 中由运行时 DOM 操作引发的 `nextSibling` 空引用。

* 在全项目落地“Vue3 组件 5 条黄金规则”，从源头避免类似问题复发。

## 代码改造范围

* 弹窗页：`src/popup/**`（Header、List、Item、组合式函数）

* 选项页：`src/options/**`（表格、卡片、分页等）

* 公共工具：`src/utils/**`（异步/广播、富文本）

## 具体实施步骤

### 1. 组件命名与引入统一（PascalCase 全面治理）

* 审查 `src/popup/**` 与 `src/options/**` 模板：将所有自定义组件标签统一为 PascalCase。

* 校验每个组件是否在 `<script setup>` 中显式 `import` 并使用同名标签。

* 引入处与模板处一一对齐（示例：`import PopupHeader ...` → `<PopupHeader />`）。

### 2. 列表渲染稳定性（key 的唯一与稳定）

* 审查所有 `v-for`，统一为实体主键（如 `item.id`），禁止 `index`。

* 表格列/列表项的 `:key` 与 `rowKey` 保持稳定（ClipManager、ClipList、ClipItem）。

### 3. 条件渲染与异步竞态治理

* 将可能快速切换的显示/隐藏从 `v-if` 改为 `v-show`（仅限对 UI 无副作用区域）。

* 在异步流程中加入卸载保护：

  * 在 `onMounted/onUnmounted` 中维护 `isUnmounted` 标志或 `AbortController`，卸载后阻断 `setState`。

  * 广播/订阅型组合式函数在卸载时显式 `unsubscribe/close`。

### 4. Tooltip/Teleport 与弹窗环境的兼容处理

* 弹窗内禁用会 Teleport 的 Tooltip/Popover/Modal 自动挂载逻辑：

  * 优先改为原生 `title` 或 CSS 方案（已对 Header 按钮改造）。

  * 如确需 Tooltip：统一配置 `getPopupContainer: () => document.body` 或固定容器，并确保容器存在。

* Typography 的 `ellipsis.tooltip` 全量替换为纯 CSS 省略（已对 Header 处理，其余位置一并治理）。

### 5. 富文本与 v-html 安全渲染

* 保持 `DOMPurify` 的严格白名单与转义策略；对 `v-html` 容器增加稳定父节点，避免内容切换时兄弟节点空引用。

### 6. 构建与拆分不变更功能逻辑（保持可缓存分块）

* 维持 `wxt.config.ts` 的 `manualChunks` 策略与冲突守卫插件；避免对弹窗运行时造成影响。

## 验证与回归

* 开发验证：

  * 打开 `popup.html?tab=basic`，执行快速刷新、立即关闭、快速重复打开操作，观察控制台无错误。

  * 切换选项页与弹窗交互，确保无 Tooltip/Teleport 报错。

* 构建验证：

  * `pnpm run build` 成功，产物结构与分块正常。

* 自动化验证（新增）：

  * 使用 `vitest` 在 jsdom 环境下模拟组件挂载→立即卸载场景，断言无 `setState` 或 DOM 访问错误。

## 交付物

* 组件与模板的命名/引入统一改造提交。

* 列表渲染 `key` 稳定性修复提交。

* 异步竞态保护与广播取消提交。

* Tooltip/ellipsis 兼容修复提交（弹窗与选项页）。

* 构建与验证报告（含体积与错误检查结论）。

## 风险与回滚

* UI 交互提示从 Tooltip 改为 `title` 可能轻微影响用户体验；如需恢复 Tooltip，将在固定容器下逐步启用并验证。

* 改动均保持低风险、可按文件粒度回滚。

