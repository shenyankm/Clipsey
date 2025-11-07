# Clipsey 存储架构与 API 文档

本文件描述基础设置与摘要管理的存储架构、类型定义与访问 API。

## 一、基础设置（chrome.storage.local）

- 键名：`clipsey-options`
- 类型：
  - `language`: `'zh-CN' | 'zh-TW' | 'en-US'`
  - `highlightColor`: `'amber' | 'green' | 'blue'`
  - `autoHighlightPageSummary`: `boolean`
  - `autoLocateFirstSummary`: `boolean`
  - `schemaVersion`: `number`（当前为 `1`）

### API

文件：`src/utils/settings-local.ts`

- `readSettingsLocal(): Promise<SettingsOptions>`
  - 从 `chrome.storage.local` 读取设置并与默认值合并。
- `writeSettingsLocal(partial: Partial<SettingsOptions>): Promise<void>`
  - 写入设置，自动合并默认值与现有值。
- `watchSettingsLocal(listener: (newValue, oldValue) => void): () => void`
  - 监听设置变化，返回取消监听函数。

### 变更通知与即时生效

- 内容脚本监听 `chrome.storage.onChanged`，更新 CSS 变量：
  - `--clipsey-inline-highlight-color`
  - `--clipsey-overlay-highlight-color`
  - 高亮颜色即时生效，无需重新渲染 DOM。

### 异常与回退

- 读取失败：回退默认设置。
- 写入失败：记录日志，不阻塞业务。

## 二、摘要管理（IndexedDB）

- Store：`clips`
- 索引：`sourceUrl`, `createdAt`, `textContent`, `highlightId`, `sourceUrl_createdAt`

### API

文件：`src/background/storage.ts`, `src/background/indexeddb-query.ts`, `src/background/services/clip-service.ts`

- 列表与查询：`getClips()`, `getClipsForUrl(url)`
- 写入：`addClip(clip)`, `saveClips(clips)`, `clearClips()`
- 批量操作：`IndexedDBQuery.bulkAdd`, `bulkPut`, `bulkDelete`
- 事务与错误处理：`indexedDBManager.executeTransaction`

### 性能优化建议

- 使用批量操作（50~100 的批大小）降低事务开销。
- 使用组合索引 `sourceUrl_createdAt` 提升按 URL + 时间的查询效率。
- 缓存与索引：`storage.ts` 内维护内存索引与缓存，减少频繁 IO。

## 三、迁移与兼容

- 文件：`src/background/migration-settings.ts`
- 逻辑：如 `chrome.storage.local` 无设置，则从 IndexedDB(`settings`) 迁移；否则跳过。
- 失败回退：写入默认设置并继续运行。

## 四、测试

- 单元测试：`tests/settings-local.spec.ts`
- 覆盖：读写、监听、键名一致性。

## 五、最佳实践

- 明确两个存储方案的职责与边界；基础设置只在 `local`，摘要只在 `IndexedDB`。
- 保持接口与类型一致，避免各模块直接操作底层存储。
- 通过消息或监听实现跨模块通信与即时生效。