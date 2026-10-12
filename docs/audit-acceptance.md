# Audit fixes and acceptance results

Recorded on 2026-10-11, against baseline `06323a7`.

This report records the initial audit stage: nine bug fixes and three improvements, with no new dependencies or database schema upgrade at that stage. The regression tests remain in the repository. The counts and browser checks below are historical results, not checks rerun for this documentation update. Later performance work changed the query implementation; see the [latest performance summary](./performance.md).

| No. | Issue and resulting behavior | Regression coverage |
| --- | --- | --- |
| 1 | Validate required fields, URLs, dates, optional field types, and duplicate IDs before restoring a backup. Invalid records cannot replace existing clips. | `storage.spec.ts`, `backup-controls.spec.ts`: missing or invalid fields, duplicate IDs, invalid log arrays, valid rich-content round trips, empty backups, and restoring 300 clips |
| 2 | Check selected text after an offset match. If the offset is stale, continue with other location strategies. | `highlight-offset-locator.spec.ts`: inserted prefixes, missing text, and negative or fractional offsets |
| 3 | Capture context and offsets before wrapping a selection in highlights, accounting for trimmed leading and trailing whitespace. | `selection-save.spec.ts`: single text nodes, surrounding whitespace, selections spanning elements, and original page structure |
| 4 | Clear a rejected database-open Promise so later operations can retry. | `indexeddb-init.spec.ts`: concurrent initial failures, closing and reopening the manager, and retrying a failed reopen on the same instance |
| 5 | Only the latest search request can update results and loading state. Clearing the search invalidates older requests. | `clip-search.spec.ts`: late successes and failures, loading state, clearing a search, and failure of the current request |
| 6 | Remove the new temporary highlight when saving fails or messaging throws, while preserving existing highlights and page content. | `selection-save.spec.ts`: unsuccessful responses and thrown errors |
| 7 | Locate the newest clip that can be found, in descending creation order, instead of selecting the lowest highlight on the page. | `selection-save.spec.ts`: the newest clip above an older one, missing newest text, and automatic location running only once |
| 8 | Use the existing URL/creation-time compound index for popup pagination on the current URL. | `storage.spec.ts`: both directions, page transitions, totals, out-of-range pages, other URLs, and Text Fragment URLs |
| 9 | Group timeline entries by local date and parse date labels in local time. | `clip-format.spec.ts`, `clip-manager.spec.ts`: midnight, year boundaries, invalid dates, and rendered timeline labels |
| 10 | Add JSON export and restore controls to the Clip Manager. Valid files still require a clip count and overwrite confirmation; cancelling performs no write. | `backup-controls.spec.ts`: download contents, object URL cleanup, confirmation, cancellation, invalid JSON, and restore failures; `clip-manager.spec.ts`: mounted controls |
| 11 | Enable title, URL, content, and time sorting. Title sorting includes untitled clips, with filtering and sorting before pagination; clearing the sort restores descending creation order. | `search-service.spec.ts`: both title directions, missing titles, stable ties, pagination, filtering, and other indexed sorts; `clip-manager.spec.ts`: table configuration and page reset |
| 12 | Remove README promises of an unimplemented dark mode and full preservation of page styles. Document the actual management entry point and backup contents. | Wording checked against components, rich-content sanitization, and export implementation |

Native browser acceptance also reproduced a scrolling bug affecting item 7: two extra `scrollBy` calls interrupted native smooth `scrollTo`, leaving distant targets outside the viewport. Those adjustments and their otherwise unused helper were removed. Fixed top-obstruction calculation and native smooth scrolling remain. `scroll-manager.spec.ts` covers distant absolute targets, no additional interfering scrolls, top obstructions, and clamping at zero.

## Automated acceptance at the audit stage

Environment: macOS, Node.js 22.23.2, and the project's existing dependencies. npm invoked the existing package scripts without changing `packageManager` or the lockfile. The project currently pins pnpm; use the commands in the [README](../README.md) for routine development.

| Command | Recorded result |
| --- | --- |
| `npm test` | All 137 tests in 22 files passed, including V8 coverage |
| `npm run typecheck` | Passed |
| `npm run build:all` | Chrome MV3, Edge MV3, and Firefox MV2 production builds passed |
| `TZ=Asia/Singapore node node_modules/vitest/vitest.mjs run tests/clip-format.spec.ts tests/clip-manager.spec.ts` | 8 tests passed |
| `TZ=America/Los_Angeles node node_modules/vitest/vitest.mjs run tests/clip-format.spec.ts tests/clip-manager.spec.ts` | 8 tests passed |
| `git diff --check` | Passed |

Vue component tests used the installed Vue Vite plugin and component stubs; backend sorting and storage tests used fake-indexeddb. Coverage followed the repository's configured scope, which excludes the options page. Passing tests do not establish coverage of every feature.

## Native Chrome acceptance at the audit stage

Headless Chrome for Testing **153.0.8010.12** used an isolated temporary profile and synthetic data. The browser was closed and the profile removed afterward; the user's regular browser and clips were untouched. A one-off Playwright acceptance script used a runtime already available in the tool environment, without adding a project dependency or a routine test command.

- The management page loaded the actual Chrome build with real extension messaging, IndexedDB, and Ant Design components. Checks covered invalid backups preserving existing data, URL/time pagination, title sorting in both directions including untitled clips, the local-date timeline, actual JSON downloads, invalid-file rejection, cancelling a restore, refreshing the list after confirmed replacement, and clearing clips with a confirmed empty backup. No page errors occurred.
- Content-script checks granted localhost access in the manifest of a temporary build copy so the extension could load synthetic local pages automatically; the production manifest was unchanged. Saved selections had correct context and offsets. When the backend rejected a save exceeding 50,000 characters, the new highlight disappeared and existing highlights remained. Text was located correctly after a prefix was inserted. When the newest clip appeared above an older clip, automatic scrolling brought the newest clip into the viewport while the older one remained far away.

## Limitations and current implementation notes

- At the audit stage, title sorting read all candidates before filtering, sorting, and pagination. The current implementation scans in batches of 256, keeps candidate IDs and sort keys through the requested page, and fetches full records for that page. A revision-validated search snapshot can retain up to 10,000 records within a 16 MiB field-weight budget; larger inputs still use batched scans. These budgets are not exact heap limits, and cold searches or deep title-sorted pages can still be costly. See `src/background/services/search-service.ts`, `src/background/indexeddb-query.ts`, and `tests/search-cache.spec.ts`.
- Backups contain all clips and up to 1,000 diagnostic error logs, without preferences. Clip replacement uses transaction rollback; logs are imported individually on a best-effort basis. Restoring clips and logs is not one atomic operation.
- This audit stage did not run native Edge or Firefox interaction checks, store publication checks, remote CI, exhaustive real-site compatibility checks, or tests of headers changing during scrolling. Later Chrome and Firefox management-page checks are recorded in the [page-endpoint report](./performance-page-endpoints.md).
- Audit-stage builds reported a shared UI chunk of about 643 kB and Firefox publication warnings about an extension ID and data-collection permissions. These are recorded build warnings, not measurements rerun for this documentation update.
