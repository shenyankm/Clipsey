# 分页端点的临时分配验收

2026-10-12；基线 `08326ed`，承接[冷深页近末端读取](./performance-pagination-tail.md)。以 10,000 条为主、100 条为辅。全部 28 轮主测量及八轮诊断复测、原生 getter 计数、Chrome V8 分配采样与 GC 后 JS 堆快照、红测试、源码/构建 SHA-256、界面检查见[原始数据](./performance-page-endpoints-results.json)。

## 实现与测量边界

生产只改两行。此前逐行读取索引键、校验键类型并创建边界对象，最终只保留首尾两个。现在只在首尾行采集；沿已有边界向前读取部分末页时，使用同事务精确总数给出的 end 确定实际页量，保证最后一个边界仍被采集，并省去末页多余的 EOF 回调。单行页只采集一次。

缓存资格、16 页/256 KiB 字段预算、版本校验与失效、新鲜正文读取及公开 API 保持原有规则。缓存正文索引键可能包含正文字符串，字段预算不是真实堆上限；这次减少中间对象和 getter 调用，不宣称缓存容量变小。

完整新页的原生探针独立于计时，查询前关闭/重开连接、只预热精确 count，不预热该页或边界。两种索引：长正文字符串与 `[createdAt, id]` 复合数组；双方向、1/20/100 条页量。探针用 try/finally 恢复浏览器 getter，七次完整方法计时不安装探针，包含总数、页数、顺序和全部字段断言。10,000 条目标 offset 约 4,500；100 条的 offset 小于 256，保持原浅页路径。

两个浏览器、两种执行顺序均核对：20 条完整页的索引键读取 20 → 2，主键读取 40 → 22；100 条为 100 → 2、200 → 102；单行页为 1/2 次，100 条小数据为 0/0 次，没有额外采集。

## 完整新页时间

每格基线生产 → 最终生产，单位 ms，七次中位数。getter 次数下降不等于完整查询按相同比例提速，游标定位与正文读取仍有成本。

| 索引 / 方向 / 页量 | Chrome 正序 | Chrome 反序 | Firefox 正序 | Firefox 反序 |
| --- | --- | --- | --- | --- |
| 正文升序 / 1 | 35.8 → 39.2 | 33.1 → 36.3 | 2.0 → 2.0 | 3.0 → 3.0 |
| 正文升序 / 20 | 37.7 → 36.7 | 32.6 → 36.2 | 3.0 → 3.0 | 3.0 → 4.0 |
| 正文升序 / 100 | 41.1 → 41.3 | 35.8 → 39.3 | 6.0 → 6.0 | 10.0 → 9.0 |
| 正文降序 / 1 | 37.9 → 51.2 | 30.3 → 34.3 | 2.0 → 2.0 | 2.0 → 3.0 |
| 正文降序 / 20 | 35.1 → 41.0 | 31.6 → 67.3 | 2.0 → 2.0 | 3.0 → 3.0 |
| 正文降序 / 100 | 38.6 → 38.1 | 34.5 → 38.2 | 6.0 → 6.0 | 8.0 → 9.0 |
| 复合时间升序 / 1 | 16.5 → 16.7 | 13.7 → 17.9 | 1.0 → 1.0 | 1.0 → 1.0 |
| 复合时间升序 / 20 | 17.2 → 17.4 | 14.9 → 16.8 | 1.0 → 1.0 | 2.0 → 2.0 |
| 复合时间升序 / 100 | 19.2 → 19.1 | 21.8 → 19.7 | 5.0 → 4.0 | 6.0 → 6.0 |
| 复合时间降序 / 1 | 16.6 → 14.7 | 12.7 → 14.1 | 1.0 → 1.0 | 2.0 → 1.0 |
| 复合时间降序 / 20 | 29.1 → 15.7 | 13.6 → 14.2 | 1.0 → 2.0 | 2.0 → 2.0 |
| 复合时间降序 / 100 | 21.8 → 17.9 | 22.7 → 19.7 | 4.0 → 4.0 | 7.0 → 6.0 |

100 条小数据最慢的候选案例如下，基线列为同一案例；不能据此宣称小数据提速。尤其 Chrome 反序中的复合降序 / 100 从 21.4 到 24.8 ms，原路径没有端点键读取，但观测仍较慢，原因未建立。

| 浏览器 / 顺序 | 候选最慢案例 | 同案例基线 → 最终 (ms) |
| --- | --- | --- |
| chrome155 / normal | ('textContent', 'next', 100) | 1.9 → 2.1 |
| chrome155 / reverse | ('createdAt_id', 'prev', 100) | 21.4 → 24.8 |
| firefox / normal | ('textContent', 'next', 20) | 2.0 → 2.0 |
| firefox / reverse | ('createdAt_id', 'prev', 100) | 3.0 → 3.0 |


## 部分末页

增加五条仅位于请求顺序末端的摘录，精确 total 为 10,005。先读第 500 页，再首次访问第 501 页；升序用未来日期，降序用过去日期。原生索引键读取 6 → 3、主键 11 → 8，其中含一次边界对齐。完整五条、原生顺序及之后不同页量对末端边界的复用均验证。

| 方向 | Chrome 正序 | Chrome 反序 | Firefox 正序 | Firefox 反序 |
| --- | --- | --- | --- | --- |
| 升序 | 0.7 → 0.6 | 0.6 → 0.6 | 0.0 → 0.0 | 1.0 → 2.0 |
| 降序 | 0.7 → 0.8 | 0.6 → 0.9 | 1.0 → 3.0 | 1.0 → 1.0 |


## 独立分配采样

另跑四轮 Chrome，和计时、测试、构建分开。沿用 HeapProfiler 的 16 KiB 采样间隔，包含 minor/major GC 收集对象。每个案例在采样外重置合成数据、预热 count、读取参考字段并执行 GC；采样内连续执行 100 次完整分页及字段断言。10,000 条主要是不同页（超出末页的末几次按末页处理），100 条循环浅页。索引、方向与 20/100 页量共 16 案例，各七次。下表为所有站点采样字节的中位数，单位 KiB；不是精确分配总量、峰值或 RSS。

| 10,000 条案例 | 正序基线 → 最终 | 反序基线 → 最终 |
| --- | --- | --- |
| textContent/next/size20 | 12205.7 → 12334.0 | 11937.5 → 12415.2 |
| textContent/next/size100 | 80014.3 → 79242.0 | 79586.4 → 79208.2 |
| textContent/prev/size20 | 19933.7 → 19990.0 | 19932.1 → 20017.4 |
| textContent/prev/size100 | 77225.6 → 76775.1 | 76507.7 → 76327.1 |
| createdAt_id/next/size20 | 19560.5 → 19392.8 | 19812.7 → 19393.0 |
| createdAt_id/next/size100 | 94676.0 → 93412.1 | 94403.9 → 93341.1 |
| createdAt_id/prev/size20 | 19544.0 → 19328.6 | 19584.0 → 19428.1 |
| createdAt_id/prev/size100 | 94277.0 → 93418.4 | 94249.2 → 94442.1 |

全部站点及每次样本保留，站点样本总和逐次核对一致；不能将各站点中位数之和当作总中位数。GC 后 Runtime.getHeapUsage 的 before/after 快照单列于原始数据，只表示该批查询的短期 JS 堆差值，未测长期占用、进程峰值或 RSS。

游标回调的自分配另列如下，仍为七次采样中位数（KiB），不与其他站点中位数相加。站点是冻结源码经 Vite 转换后的 request.onsuccess，URL 路径 /src/background/indexeddb-query.ts、零基 lineNumber=65 / columnNumber=23；包含该回调自身的采样分配，并非仅边界对象。正文还原与夹具字段断言的大量分配不属于这一站点。

| 10,000 条游标回调 | 正序基线 → 最终 | 反序基线 → 最终 |
| --- | --- | --- |
| textContent/next/size20 | 423.1 → 440.3 | 472.1 → 424.0 |
| textContent/next/size100 | 513.8 → 273.3 | 450.3 → 305.1 |
| textContent/prev/size20 | 658.4 → 575.0 | 557.5 → 591.5 |
| textContent/prev/size100 | 529.2 → 257.6 | 466.5 → 321.8 |
| createdAt_id/next/size20 | 716.2 → 438.8 | 633.5 → 508.0 |
| createdAt_id/next/size100 | 1169.5 → 305.4 | 1138.0 → 370.0 |
| createdAt_id/prev/size20 | 652.0 → 537.9 | 666.1 → 524.2 |
| createdAt_id/prev/size100 | 1170.1 → 289.1 | 1058.3 → 353.6 |

1 万条、100 条页量的八组中，该站点中位数下降约 31%–75%；20 条页量仍有上升约 4.1% 与 6.1% 的两组。完整批次总量变化约 -2.1% 到 +4.0%，不能建立一致的总分配改善结论。局部站点变化不能直接换算为扩展总内存收益，短期堆差值也不能建立长期占用结论。

## 小数据及原有路径

另完整重跑原计数夹具八轮与原边界夹具八轮，覆盖冷/热、第一/深/空页、范围、插入/删除、相邻与远跳、早页及 20,000 条重复值。精确字段断言全部通过；原生计数、游标推进及完整方法仍有不利中位数，不宣称所有查询提速。最大十个变化如下，其余及 100 条的全部结果见原始数据。

| 场景 | 基线 → 最终 (ms) |
| --- | --- |
| page-endpoints-chrome155-baseline-reverse/10000/('textContent', 'prev', 20, 226, None, None, None)/scenarios | 31.6 → 67.3 |
| pagination-count-chrome155-baseline-reverse/10000/('sourceUrl', 'prev', None, None, None, None, False)/501/cold | 37.6 → 65.3 |
| pagination-count-chrome155-baseline-normal/10000/('textContent', 'prev', None, None, None, None, False)/451/cold | 89.7 → 111.6 |
| page-anchors-chrome155-baseline-reverse/100/('createdAt_id', 'prev', None, None, 4, 5, None)/scenarios | 0.9 → 21.5 |
| pagination-count-chrome155-baseline-reverse/10000/('sourceUrl', 'prev', None, None, None, None, False)/1/cold | 38.9 → 59.4 |
| pagination-count-chrome155-baseline-reverse/10000/('sourceUrl', 'next', None, None, None, None, False)/afterInsert | 44.0 → 62.9 |
| pagination-count-chrome155-baseline-reverse/10000/('textContent', 'next', None, None, None, None, False)/451/cold | 97.0 → 114.1 |
| pagination-count-chrome155-baseline-reverse/10000/('sourceUrl', 'prev', None, None, None, None, False)/451/cold | 46.2 → 61.6 |
| pagination-count-chrome155-baseline-reverse/10000/('sourceUrl', 'next', None, None, None, None, False)/1/cold | 48.0 → 62.8 |
| pagination-count-chrome155-baseline-reverse/10000/('sourceUrl', 'next', None, None, None, None, False)/afterDelete | 43.5 → 58.0 |


## 较慢样本的交错复测

报告整理时发现正文降序 / 20 与复合浅页的较慢样本，随后在源码不变、gates 结束后，单独追加八轮 Chrome 反序计时；每个夹具执行顺序为候选、基线、基线、候选。未与测试、构建或采样重叠。完整结果保留，不替代主测量；下表选取触发复查的案例。

| 场景 | 候选 1 | 基线 2 | 基线 3 | 候选 4 |
| --- | --- | --- | --- | --- |
| page-endpoints / 10000 / ('textContent', 'prev', 20) | 36.9 | 29.5 | 30.1 | 30.0 |
| page-endpoints / 100 / ('createdAt_id', 'prev', 100) | 21.6 | 19.4 | 25.2 | 19.0 |
| page-anchors / 100 / ('createdAt_id', 'prev', 4, 5) | 7.2 | 18.0 | 16.7 | 17.8 |

复测仍不能建立普遍耗时改善，也不能仅凭执行顺序将差异归因于环境。浅页没有端点键读取，这一结构性检查不等于响应时间没有回退；局部调用与分配减少是已验证结果，整体延迟仍需后续定位。



## 验证与复跑

462 项测试、36 个文件通过 coverage（maxWorkers=2）；语句 62.56%、分支 61.15%、函数 63.99%、行 62.3%。七个相关文件 184 项通过，新增七项在基线 5 失败、2 通过，候选全部通过。覆盖键读取次数上界、复访不读取索引键、数组键、不同页量以及部分向前页的末端复用；原有预算、类型、版本、排队写入、失败与数据字段检查继续通过。

应用与夹具类型检查、脚本语法与 diff 检查通过，Chrome/Edge/Firefox 构建通过。Chrome for Testing 153.0.8010.12 与带 Playwright 补丁的 Firefox Nightly 153.0 各通过 21 项原始生产构建的实际管理页检查：第 500 页索引键读取仅 2 次，复访为 0，第 499 页为对齐 1 次加端点 2 次；20 条顺序与详情富文本正确。保留关键词、标题、备份、保存/删除/清空、热空页、配额回退与无脚本错误。配额错误身份模拟不等于填满磁盘，getter 探针不用于界面延迟测量。

冻结源码后串行完成 24 轮普通测量，再完成四轮分配采样，随后运行 gates，再追加上述八轮诊断。计时期间没有 getter 探针、采样、测试或构建；分配采样包含完整字段断言，不能当作不含校验的生产字节量。环境为 macOS / Node 22.23.2、安装版 Chrome 155.0.8059.39 与上述 Firefox Nightly / geckodriver 0.37.1，正文约 640 字符、HTML 约 840 字符。独立临时来源和合成数据不影响已安装扩展。

```sh
BASELINE_REF=08326ed node scripts/performance.mjs --page-endpoints --baseline
node scripts/performance.mjs --page-endpoints
node scripts/performance.mjs --page-endpoints --reverse
BASELINE_REF=08326ed node scripts/performance.mjs --page-endpoints --baseline --reverse

BASELINE_REF=08326ed node scripts/performance.mjs --page-endpoints --allocations --baseline
node scripts/performance.mjs --page-endpoints --allocations
```

分配采样同样运行 --reverse 两组；Firefox 普通测量用 `scripts/firefox-highlight-scheduling.mjs` 相同参数，需要 FIREFOX_PATH、GECKODRIVER_PATH。原有夹具用 --pagination-count 和 --page-anchors。真实界面使用 `scripts/search-acceptance.mjs` 及 --firefox，需 PLAYWRIGHT_MODULE 与对应路径。

未测 Firefox 分配采样、正式版 Firefox、Chrome 155 扩展界面、Edge 运行时、低端设备、实际用户访问分布、长期堆占用、峰值/RSS 或远程 CI；未推送。原生计数与部分重复键定位仍有成本，性能目标继续进行。
