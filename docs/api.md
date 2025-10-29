# Clipsey API 使用手册

## 背景脚本 API

### MessageHandlers
- `registerMessageRouter()`：注册统一的消息处理路由。

处理的消息类型：
- `SAVE_CLIP`：保存剪藏（payload: Partial<Clip>）。
- `REQUEST_CLIPS`：获取全部剪藏。
- `CLEAR_CLIPS`：清空剪藏。
- `OPEN_CLIP`：根据 ID 打开剪藏来源页面并定位。

### Services
- `ClipService`
  - `listAll(): Promise<Clip[]>`
  - `listByUrl(url: string): Promise<Clip[]>`
  - `add(clip: Clip): Promise<void>`
  - `replaceAll(clips: Clip[]): Promise<void>`
  - `clear(): Promise<void>`

- `ContentScriptService`
  - `registerContentScript(): Promise<void>`
  - `injectContentScript(tabId: number): Promise<boolean>`
  - `sendMessageToTab<T>(tabId: number, message: unknown): Promise<T>`
  - 错误辅助：`isMissingReceiverError`, `getErrorMessage` 等。

- `SettingsService`
  - `read<T>(): Promise<T | null>`
  - `write<T>(value: T): Promise<void>`
  - 常量：`SETTINGS_STORE_KEY`。

## 内容脚本 API

- `HighlightEngine`
  - `setThrottle(ms: number): void`：设置批处理节流毫秒数。
  - `abort(): void`：中断进行中的高亮任务。
  - `clear(): void`：清除所有高亮。
  - `undo(highlightId: string): boolean`：撤销指定高亮。
  - `focusClip(payload: { textContent?: string; id?: string }): Promise<boolean>`：定位并滚动到文本。
  - `activateHighlights(highlights: RemoteHighlight[]): Promise<boolean>`：批量应用高亮。

消息协议兼容：
- `REQUEST_SELECTION`：selection.ts 保留现有逻辑。
- `FOCUS_CLIP` / `ACTIVATE_HIGHLIGHTS`：统一转发给 HighlightEngine。