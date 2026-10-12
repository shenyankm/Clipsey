# Temporary allocation at page endpoints

Recorded on 2026-10-12 for commit `7699784`, against baseline `08326ed`. The main dataset contains 10,000 clips, with 100 clips as a smaller comparison. The [raw results](./performance-page-endpoints-results.json) retain all 28 main measurement runs and eight diagnostic repeats, native getter counts, Chrome V8 allocation samples, post-GC JavaScript heap snapshots, baseline test failures, source/build SHA-256 hashes, and UI checks. Earlier stage records are available in Git history. These are recorded results; this English documentation update did not rerun the measurements.

## Implementation and measurement scope

The production change modifies two lines in `src/background/indexeddb-query.ts`. Previously, each row read its index key, validated the key type, and constructed a boundary object, although only the first and last boundaries were retained. Keys are now captured only at those endpoints. When reading a partial final page forward from a cached boundary, the exact total from the same transaction determines the actual page length through `end`. This preserves the last boundary and avoids an extra EOF callback. A single-row page captures its endpoint once.

Cache eligibility, the 16-page/256 KiB field-weight budget, revision validation and invalidation, fresh full-record reads, and public APIs retain their existing rules. Cached content index keys may contain full text strings; the field budget is not an actual heap limit. This change reduces intermediate objects and getter calls, without establishing a smaller cache footprint.

Native probes for uncached full pages ran independently of timing. Each query closed and reopened its connection, warmed only the exact count, and did not warm that page or its boundaries. Two indexes were tested: long text strings and compound `[createdAt, id]` arrays, in both directions with page sizes of 1, 20, and 100. Probes restored browser getters in `try/finally`; the seven complete-method timing repetitions used no getter probes and asserted totals, page counts, order, and all fields. Target offsets for 10,000 clips were around 4,500. Offsets for 100 clips stayed below 256 and used the original shallow-page path.

Both browsers and both fixture execution orders confirmed the same counts. For a full 20-row page, index-key reads fell from 20 to 2 and primary-key reads from 40 to 22. For a full 100-row page, they fell from 100 to 2 and from 200 to 102. A single-row page used 1 index-key read and 2 primary-key reads. The 100-clip shallow path used 0/0, with no additional endpoint capture.

## Complete uncached-page timing

Each cell shows baseline production → final production, in milliseconds, using the median of seven repetitions. Normal and reverse columns refer to fixture execution order; ascending and descending rows refer to index traversal direction. Fewer getter calls do not imply a proportional improvement in complete query time: cursor positioning and full-record reads still cost time.

| Index / direction / page size | Chrome: normal run order | Chrome: reverse run order | Firefox: normal run order | Firefox: reverse run order |
| --- | --- | --- | --- | --- |
| Text ascending / 1 | 35.8 → 39.2 | 33.1 → 36.3 | 2.0 → 2.0 | 3.0 → 3.0 |
| Text ascending / 20 | 37.7 → 36.7 | 32.6 → 36.2 | 3.0 → 3.0 | 3.0 → 4.0 |
| Text ascending / 100 | 41.1 → 41.3 | 35.8 → 39.3 | 6.0 → 6.0 | 10.0 → 9.0 |
| Text descending / 1 | 37.9 → 51.2 | 30.3 → 34.3 | 2.0 → 2.0 | 2.0 → 3.0 |
| Text descending / 20 | 35.1 → 41.0 | 31.6 → 67.3 | 2.0 → 2.0 | 3.0 → 3.0 |
| Text descending / 100 | 38.6 → 38.1 | 34.5 → 38.2 | 6.0 → 6.0 | 8.0 → 9.0 |
| Compound time ascending / 1 | 16.5 → 16.7 | 13.7 → 17.9 | 1.0 → 1.0 | 1.0 → 1.0 |
| Compound time ascending / 20 | 17.2 → 17.4 | 14.9 → 16.8 | 1.0 → 1.0 | 2.0 → 2.0 |
| Compound time ascending / 100 | 19.2 → 19.1 | 21.8 → 19.7 | 5.0 → 4.0 | 6.0 → 6.0 |
| Compound time descending / 1 | 16.6 → 14.7 | 12.7 → 14.1 | 1.0 → 1.0 | 2.0 → 1.0 |
| Compound time descending / 20 | 29.1 → 15.7 | 13.6 → 14.2 | 1.0 → 2.0 | 2.0 → 2.0 |
| Compound time descending / 100 | 21.8 → 17.9 | 22.7 → 19.7 | 4.0 → 4.0 | 7.0 → 6.0 |

The slowest candidate cases for 100 clips are listed below, paired with the same baseline case. They do not establish a small-dataset speedup. In particular, Chrome's reverse run of compound descending / 100 increased from 21.4 to 24.8 ms. That path performs no endpoint-key reads, but the observed timing was still slower; the cause was not established.

| Browser / run order | Slowest candidate case | Same case: baseline → final (ms) |
| --- | --- | --- |
| chrome155 / normal | ('textContent', 'next', 100) | 1.9 → 2.1 |
| chrome155 / reverse | ('createdAt_id', 'prev', 100) | 21.4 → 24.8 |
| firefox / normal | ('textContent', 'next', 20) | 2.0 → 2.0 |
| firefox / reverse | ('createdAt_id', 'prev', 100) | 3.0 → 3.0 |

## Partial final pages

Five clips were added only at the end of the requested order, bringing the exact total to 10,005. Page 500 was read first, followed by the first visit to page 501. Ascending runs used future dates for the added clips, and descending runs used past dates. Native index-key reads fell from 6 to 3 and primary-key reads from 11 to 8, including one boundary-alignment read. Checks verified all five records, native ordering, and reuse of the final boundary with a different page size.

The following timings are in milliseconds, as baseline → final.

| Direction | Chrome: normal run order | Chrome: reverse run order | Firefox: normal run order | Firefox: reverse run order |
| --- | --- | --- | --- | --- |
| Ascending | 0.7 → 0.6 | 0.6 → 0.6 | 0.0 → 0.0 | 1.0 → 2.0 |
| Descending | 0.7 → 0.8 | 0.6 → 0.9 | 1.0 → 3.0 | 1.0 → 1.0 |

## Independent allocation sampling

Four additional Chrome runs were separate from timing, tests, and builds. HeapProfiler used a 16 KiB sampling interval and included objects collected by minor and major GC. Outside sampling, each case reset synthetic data, warmed the count, read reference fields, and ran GC. Inside sampling, it executed 100 complete pagination queries with field assertions. The 10,000-clip runs mostly queried different pages; the final queries beyond the last page were clamped to that page. The 100-clip runs cycled through shallow pages. Two indexes, two directions, two page sizes (20 and 100), and two dataset sizes produced 16 cases, with seven repetitions each. The table shows median sampled bytes across all allocation sites, in KiB. These are not exact total allocations, peak memory, or RSS.

| 10,000-clip case | Normal order: baseline → final | Reverse order: baseline → final |
| --- | --- | --- |
| textContent/next/size20 | 12205.7 → 12334.0 | 11937.5 → 12415.2 |
| textContent/next/size100 | 80014.3 → 79242.0 | 79586.4 → 79208.2 |
| textContent/prev/size20 | 19933.7 → 19990.0 | 19932.1 → 20017.4 |
| textContent/prev/size100 | 77225.6 → 76775.1 | 76507.7 → 76327.1 |
| createdAt_id/next/size20 | 19560.5 → 19392.8 | 19812.7 → 19393.0 |
| createdAt_id/next/size100 | 94676.0 → 93412.1 | 94403.9 → 93341.1 |
| createdAt_id/prev/size20 | 19544.0 → 19328.6 | 19584.0 → 19428.1 |
| createdAt_id/prev/size100 | 94277.0 → 93418.4 | 94249.2 → 94442.1 |

All allocation sites and individual samples are retained. The sum across sites was checked against each sample's total. Adding site medians does not produce the median total. Before/after snapshots from `Runtime.getHeapUsage` after GC are stored separately in the raw results; they show only the short-term JavaScript heap difference for that query batch. Long-term use, process peaks, and RSS were not measured.

Cursor-callback self-allocation is listed separately below, also as seven-sample medians in KiB. Do not add these medians to those from other sites. The site is `request.onsuccess` in the frozen source after Vite transformation, at URL path `/src/background/indexeddb-query.ts`, zero-based `lineNumber=65` / `columnNumber=23`. It includes sampled allocations attributed to the callback itself, not just boundary objects. Large allocations from full-record materialization and fixture field assertions belong to other sites.

| 10,000-clip cursor callback | Normal order: baseline → final | Reverse order: baseline → final |
| --- | --- | --- |
| textContent/next/size20 | 423.1 → 440.3 | 472.1 → 424.0 |
| textContent/next/size100 | 513.8 → 273.3 | 450.3 → 305.1 |
| textContent/prev/size20 | 658.4 → 575.0 | 557.5 → 591.5 |
| textContent/prev/size100 | 529.2 → 257.6 | 466.5 → 321.8 |
| createdAt_id/next/size20 | 716.2 → 438.8 | 633.5 → 508.0 |
| createdAt_id/next/size100 | 1169.5 → 305.4 | 1138.0 → 370.0 |
| createdAt_id/prev/size20 | 652.0 → 537.9 | 666.1 → 524.2 |
| createdAt_id/prev/size100 | 1170.1 → 289.1 | 1058.3 → 353.6 |

Across the eight 10,000-clip comparisons with 100-row pages, the median at this site fell by about 31%–75%. Two 20-row comparisons still rose by about 4.1% and 6.1%. Whole-batch sampled totals changed by about -2.1% to +4.0%, which does not establish a consistent reduction in total allocation. Changes at one site cannot be converted directly into overall extension memory savings, and short-term heap differences do not establish long-term memory use.

## Small datasets and existing paths

The existing count fixture and boundary fixture each ran eight complete comparisons, covering cold/warm queries, first/deep/empty pages, ranges, insertions/deletions, adjacent and distant navigation, early pages, and 20,000 duplicate-valued records. All exact-field assertions passed. Native counts, cursor advancement, and complete-method timings still included worse medians; these results do not establish a speedup for every query. The ten largest increases are shown below. The remaining comparisons and all 100-clip results are in the raw data. Scenario identifiers are retained verbatim.

| Scenario | Baseline → final (ms) |
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

## Interleaved repeats of slower samples

While preparing the report, slower text-descending / 20 and compound shallow-page samples prompted eight additional Chrome timing runs in reverse fixture order. Source code was unchanged, and these diagnostic runs followed the validation checks. Each fixture ran in candidate, baseline, baseline, candidate order, without overlap with tests, builds, or allocation sampling. Complete results are retained alongside the main measurements. The table selects the cases that triggered the review; timings are in milliseconds.

| Scenario | Candidate 1 | Baseline 2 | Baseline 3 | Candidate 4 |
| --- | --- | --- | --- | --- |
| page-endpoints / 10000 / ('textContent', 'prev', 20) | 36.9 | 29.5 | 30.1 | 30.0 |
| page-endpoints / 100 / ('createdAt_id', 'prev', 100) | 21.6 | 19.4 | 25.2 | 19.0 |
| page-anchors / 100 / ('createdAt_id', 'prev', 4, 5) | 7.2 | 18.0 | 16.7 | 17.8 |

The repeats still do not establish a general timing improvement. Execution order alone cannot attribute the differences to the environment. Shallow pages have no endpoint-key reads, but that structural check does not establish unchanged response time. Reduced local calls and allocation are verified; overall latency still needs further investigation.

## Validation and reproduction

The recorded coverage run passed 462 tests in 36 files with `maxWorkers=2`: statements 62.56%, branches 61.15%, functions 63.99%, and lines 62.3%. Seven related files passed 184 tests. Of the seven new tests, the baseline failed five and passed two; the candidate passed all seven. Coverage includes bounds on index-key reads, revisits without index-key reads, array keys, different page sizes, and reuse of the final endpoint of partial forward pages. Existing budget, type, revision, queued-write, failure, and data-field checks also passed.

Application and fixture type checks, script syntax checks, and diff checks passed, as did Chrome/Edge/Firefox builds. Chrome for Testing 153.0.8010.12 and a Playwright-patched Firefox Nightly 153.0 each passed 21 actual management-page checks against unmodified production builds. Page 500 read only two index keys; revisiting it read none; page 499 read one for alignment plus two endpoints. Ordering of all 20 rows and rich content in the detail view were correct. Checks also covered keywords, title sorting, backups, saving/deleting/clearing, warm empty pages, revision-request quota-error fallback, and absence of extension-page script errors. Injecting the quota-error condition is not equivalent to filling the disk. Getter probes were not used to measure UI latency.

After freezing the source, 24 ordinary measurement runs completed serially, followed by four allocation-sampling runs, validation checks, and the eight diagnostic repeats above. Timing did not overlap with getter probes, allocation sampling, tests, or builds. Allocation samples include complete-field assertions and cannot be treated as production byte counts without validation overhead. The environment was macOS / Node.js 22.23.2, installed Chrome 155.0.8059.39, and the Firefox Nightly above with geckodriver 0.37.1. Text content was about 640 characters and HTML about 840 characters. Isolated temporary origins and synthetic data left installed extensions untouched.

Install dependencies with the Node.js and pnpm versions in the [README](../README.md). Run each comparison separately:

```sh
BASELINE_REF=08326ed node scripts/performance.mjs --page-endpoints --baseline
node scripts/performance.mjs --page-endpoints
node scripts/performance.mjs --page-endpoints --reverse
BASELINE_REF=08326ed node scripts/performance.mjs --page-endpoints --baseline --reverse

BASELINE_REF=08326ed node scripts/performance.mjs --page-endpoints --allocations --baseline
node scripts/performance.mjs --page-endpoints --allocations
```

Chrome timing and allocation scripts use `CHROME_PATH` when set; otherwise they default to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Repeat both allocation commands with `--reverse` as well. For Firefox timing, replace `scripts/performance.mjs` with `scripts/firefox-highlight-scheduling.mjs`, keeping the timing flags, and set `FIREFOX_PATH` and `GECKODRIVER_PATH` to the appropriate executables. Firefox allocation sampling is not supported by that script. Use `--pagination-count` and `--page-anchors` for the existing fixtures.

For actual management-page checks, build first with `pnpm build:all`, then run `node scripts/search-acceptance.mjs` for Chrome or `node scripts/search-acceptance.mjs --firefox` for Firefox. Chrome requires `CHROME_PATH` pointing to Chrome for Testing and an available Playwright runtime; use `PLAYWRIGHT_MODULE` to specify its module path when it is not locally installed. Firefox requires `FIREFOX_PATH` and `GECKODRIVER_PATH` with support for the script's privileged WebDriver operations. `EXTENSION_PATH` can override the default build directory (`.output/chrome-mv3` or `.output/firefox-mv2`). Playwright and geckodriver are not project dependencies.

## Limits and publication status

These runs did not cover Firefox allocation sampling, stable Firefox, the Chrome 155 extension UI, the Edge runtime, low-end devices, actual user access patterns, long-term heap use, peak memory/RSS, or remote CI. Native counts and some duplicate-key positioning still cost time; overall performance has not been proved optimal. The measured implementation was subsequently committed as `7699784` and merged into `main`. The directory cleanup and this documentation update did not rerun measurements. Build artifacts removed during cleanup can be recreated using the commands above.

The raw JSON remains unchanged, including the original fixture source snapshot and its comments. Its temporary artifact paths may no longer exist; inline results and source/build hashes remain available as evidence.
