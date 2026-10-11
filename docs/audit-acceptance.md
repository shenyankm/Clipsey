# 项目审查修复与验收

日期：2026-10-11。基线：`06323a7`。

完成审查报告中的 9 项 bug 修复和 3 项改进。未新增依赖、未升级数据库结构。以下测试随代码保留在仓库内。

| 编号 | 问题与最终行为 | 回归测试 |
| --- | --- | --- |
| 1 | 恢复前校验必填字段、URL、日期、可选字段类型和重复 ID；无效记录不会覆盖现有摘录 | `storage.spec.ts`、`backup-controls.spec.ts`：缺失/无效字段、重复 ID、无效日志数组、有效富文本往返、空备份、300 条恢复 |
| 2 | 文本偏移命中后校验选区内容；偏移失效时继续使用其他定位策略 | `highlight-offset-locator.spec.ts`：插入前缀、文本消失、负数/小数偏移 |
| 3 | 包裹高亮前捕获上下文和偏移，考虑保存文本的首尾空白裁剪 | `selection-save.spec.ts`：单节点、首尾空白、跨元素选区和原文结构 |
| 4 | 数据库打开失败后清除被拒绝的 Promise，后续操作可以重试 | `indexeddb-init.spec.ts`：并发首次失败、管理器关闭重开、同一实例重开失败后重试 |
| 5 | 搜索结果和 loading 只由最新请求更新；清空搜索会使旧请求失效 | `clip-search.spec.ts`：旧成功/失败晚到、loading、清空、当前请求失败 |
| 6 | 保存失败或消息异常时移除此次临时高亮，保留已有高亮和原文 | `selection-save.spec.ts`：响应失败、异常失败 |
| 7 | 按创建时间倒序定位最近一条能找到的摘录，不再选择页面最下方的高亮 | `selection-save.spec.ts`：最新摘录在上方、最新文本缺失、只自动定位一次 |
| 8 | popup 的当前 URL 分页使用已有 URL/创建时间复合索引 | `storage.spec.ts`：正反顺序、跨页、总数、越界、其他 URL、Text Fragment URL |
| 9 | 时间轴按本地日期分组，日期标签也按本地时间解析 | `clip-format.spec.ts`、`clip-manager.spec.ts`：午夜、年界、无效日期、实际时间轴标签 |
| 10 | 摘要管理增加 JSON 导出和恢复入口；有效文件仍需显示条数并确认覆盖，取消不写入 | `backup-controls.spec.ts`：下载内容、URL 回收、确认、取消、无效 JSON、恢复失败；`clip-manager.spec.ts`：入口挂载 |
| 11 | 表格启用标题/网址/内容/时间排序；标题排序包含空标题，先过滤排序再分页；清除排序恢复默认时间倒序 | `search-service.spec.ts`：标题双向、空标题、同名稳定顺序、分页、过滤和其他索引排序；`clip-manager.spec.ts`：表头配置和页码重置 |
| 12 | README 去掉未实现的暗色模式和完整保留原文样式承诺，说明真实管理入口和备份范围 | 对照组件、富文本净化和导出实现检查文案 |

真实浏览器验收还复现了影响第 7 项的滚动问题：额外两次 `scrollBy` 中断原生平滑 `scrollTo`，远处目标未进入视口。删除该补偿逻辑及其无其他调用方的辅助函数，保留固定顶部遮挡计算和原生平滑滚动。`scroll-manager.spec.ts` 覆盖远距离绝对目标、不追加干扰滚动、顶部遮挡和零边界。

## 自动验收结果

环境：macOS、Node.js 22.23.2、项目已有依赖。使用 npm 调用现有 package scripts，不修改 packageManager 或锁文件。

| 命令 | 结果 |
| --- | --- |
| `npm test` | 22 个测试文件、137 个测试全部通过；包含 V8 coverage |
| `npm run typecheck` | 通过 |
| `npm run build:all` | Chrome MV3、Edge MV3、Firefox MV2 生产构建全部通过 |
| `TZ=Asia/Singapore node node_modules/vitest/vitest.mjs run tests/clip-format.spec.ts tests/clip-manager.spec.ts` | 8 个测试通过 |
| `TZ=America/Los_Angeles node node_modules/vitest/vitest.mjs run tests/clip-format.spec.ts tests/clip-manager.spec.ts` | 8 个测试通过 |
| `git diff --check` | 通过 |

Vue 组件测试使用已安装的 Vue Vite 插件和组件桩；排序后台与存储测试使用 fake-indexeddb。覆盖率按仓库原有统计范围计算，不包含 options 页面，不把测试全绿解释为覆盖全部功能。

## 真实 Chrome 验收

使用 Headless Chrome for Testing **153.0.8010.12**，独立临时用户目录和合成数据；验收结束关闭浏览器并删除用户目录，未操作日常浏览器或真实摘录。一次性 Playwright 验收脚本使用工具环境内已有运行库，未加入项目依赖或常规测试命令。

- 管理页面加载实际 Chrome 构建，使用真实扩展消息、IndexedDB 和 Ant Design 组件。通过无效备份保留旧数据、URL 时间分页、标题升降序含空标题、本地日期时间轴、JSON 实际下载、无效文件拦截、取消恢复、确认覆盖后刷新列表、确认空备份清空。没有页面异常。
- 内容脚本验收在临时构建副本的 manifest 中授予 localhost 权限，方便自动加载本地合成页面；生产 manifest 未变。实际选区保存的上下文/偏移正确；超过 50,000 字符的保存请求被后台拒绝后，新高亮消失且已有高亮保留；原文插入前缀后仍定位正确文字；最新摘录位于旧摘录上方时，自动滚动后最新摘录在视口内，旧摘录仍在远处。

## 限制与保留事项

- 标题排序为包含无标题记录而读取全部候选，再过滤排序分页。大数据集仍可能变慢；代码中保留 `shortcut:` 说明，后续出现实测卡顿再考虑含空标题的索引。
- 备份包含全部摘录及最多 1,000 条错误日志，不包含偏好设置。摘录替换使用已有事务回滚机制；日志仍沿用逐条尽力导入语义，不保证与摘录整体原子恢复。
- 未运行 Edge/Firefox 的真实交互验收、商店发布检查、远端 CI、真实站点完整兼容性和滚动期间动态变化的页头场景。
- 三浏览器仍有约 643 kB 共享 UI chunk 警告；Firefox 仍有 extension ID 和 data collection permissions 发布配置警告。本次未改变这些既有配置。
