# 性能验收摘要

最近一次验收对应提交 `7699784`，以 **10,000 条摘录为主、100 条为辅**。详细对照与限制见[分页端点验收报告](./performance-page-endpoints.md)，全部样本见[原始数据](./performance-page-endpoints-results.json)。性能优化已停止继续执行，当前结果不代表已达到性能极限。

已验证的阶段结果：

- 深整数页只采集首尾索引键。100 条完整页的索引键读取从 100 次降到 2 次，20 条页从 20 次降到 2 次；部分末页仍能复用最后一个边界。
- 1 万条、100 条页量的八组 Chrome 采样中，游标回调自身的分配中位数下降约 31%–75%。整批分配与完整查询耗时没有一致改善，较慢样本及交错复测均保留在报告中。
- 当次验收通过 462 项测试、应用及夹具类型检查、Chrome/Edge/Firefox 构建，以及 Chrome 和 Firefox 各 21 项实际管理页检查。本次目录清理没有重跑这些检查，也没有修改实现或测试。

小数据仍使用原浅页路径。缓存版本校验、字段预算、失败处理与数据新鲜性继续受现有回归测试约束。未测长期内存、峰值/RSS、低端设备、实际用户访问分布、Edge 运行时或远程 CI；不能据局部分配减少宣称扩展整体提速。

复跑时使用现有脚本及隔离的合成数据：

```sh
BASELINE_REF=08326ed node scripts/performance.mjs --page-endpoints --baseline
node scripts/performance.mjs --page-endpoints
node scripts/performance.mjs --page-endpoints --reverse
BASELINE_REF=08326ed node scripts/performance.mjs --page-endpoints --baseline --reverse
```

分配采样另加 `--allocations`；Firefox 对照使用 `scripts/firefox-highlight-scheduling.mjs`，浏览器路径及原有夹具的复跑方式见详细报告。

旧阶段报告、旧原始 JSON 和 CPU profile 已从工作目录移除，可从提交 `7699784` 及更早的 Git 历史恢复。测试与复跑脚本保留。本地 `.output/` 与 `coverage/` 是可再生产物，分别运行 `pnpm build:all` 和 `pnpm test` 可重新生成；`.wxt/` 为现有 TypeScript 配置所需，继续保留。
