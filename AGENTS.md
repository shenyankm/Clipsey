# Repository Guidelines

## Project Structure & Module Organization
`src/` hosts all runtime code: `content/` for page scripts (selection flow and highlight engine), `background/` for services, IndexedDB, and lifecycle handlers, and `entrypoints/` for WXT wiring. Shared utilities and types live in `src/utils/` and `src/types/`. Browser assets (icons, manifest output) are under `public/`, and Vitest suites live in `tests/` (including DOM-focused highlight specs). Generated bundles land in `.output/`.

## Build, Test, and Development Commands
- `pnpm dev` (or `pnpm dev:chrome|edge|firefox`) launches WXT with live reload for the selected browser.
- `pnpm build` (plus browser-specific variants) emits production-ready artifacts to `.output/`.
- `pnpm zip` or `pnpm zip:<browser>` packs the latest build for store submission.
- `pnpm test` runs the Vitest suite with V8 coverage; `pnpm test:visual` executes the visual regression spec.
- `pnpm typecheck` runs `vue-tsc` against `tsconfig.app.json` for strict typing.

## Coding Style & Naming Conventions
Use TypeScript + Vue 3 with ES modules, 2-space indentation, and descriptive PascalCase for classes/services (`HighlightEngine`, `ClipService`). File names are kebab-case under feature folders (e.g., `highlight-engine.ts`). Keep DOM-facing helpers in `src/content/highlight/*`, background-only logic under `src/background/*`. Prefer `async/await`, guard clauses, and lightweight inline comments only where logic is non-obvious. CSS classes for highlights must reuse `HIGHLIGHT_INLINE_CLASS` / `HIGHLIGHT_OVERLAY_CLASS` to stay consistent with `color-manager`.

## Testing Guidelines
Vitest with jsdom drives unit tests (`tests/highlight-engine*.spec.ts`). Name specs after the unit under test and keep Arrange/Act/Assert sections obvious. New DOM behaviors need coverage in jsdom or the visual regression spec. Ensure `pnpm test` stays green and coverage roughly matches current levels (highlight specs expect multiple spans for multi-node ranges).

## Commit & Pull Request Guidelines
Follow Conventional Commits as seen in history (`feat(options): …`, `refactor(storage): …`), keeping the scope aligned with folders. Each commit should be focused and include localized descriptions (Chinese is acceptable). Pull requests should summarize the change, list affected modules (e.g., `src/content/highlight-engine.ts`), link related issues, and attach screenshots/gifs when UI changes or highlight rendering shifts are involved. Mention any new permissions or manifest edits explicitly.

## Security & Configuration Tips
Optional host permissions (`https://*/*`, `http://*/*`) are requested at runtime; avoid widening them without product approval. Keep IndexedDB migrations in sync with `src/background/storage/*` utilities, and ensure new settings flow through `settings-local.ts` plus the background migration helpers.
