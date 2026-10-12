# Contributing to Clipsey

Bug reports, focused fixes, documentation improvements, and feature proposals are welcome. Use English for repository documentation, issue titles, and PR descriptions. Discuss substantial changes in an issue before implementing them.

## Report a problem or suggest a feature

Use the [issue templates](https://github.com/shenyankm/Clipsey/issues/new/choose) and search existing issues first. For bugs, include the extension version or commit, browser and OS versions, reproduction steps, and expected versus actual behavior. Page-specific problems need a public example URL or minimal HTML; performance reports need clip count and approximate content size. Sanitize logs and examples rather than sharing private clips or complete backups.

## Set up development

Fork the repository if you do not have write access, clone your fork, and branch from `main`. See the [README](README.md#install-from-source) for supported Node.js versions and local browser installation. The repository pins pnpm 10.28.2 in `package.json`; CI uses Node.js 22.23.2.

```sh
pnpm install --frozen-lockfile
pnpm dev:chrome
# Alternatively: pnpm dev:edge or pnpm dev:firefox
```

Installation runs `wxt prepare` to generate `.wxt/` types. Keep `pnpm-lock.yaml` in sync when changing dependencies. Generated `.wxt/`, `.output/`, and `coverage/` files must not be committed.

## Make a focused change

- Follow the surrounding TypeScript and Vue conventions and reuse existing helpers.
- Add a focused regression test for bug fixes and meaningful behavior changes. Documentation-only edits do not need new application tests.
- Preserve clip data, backup validation, transaction rollback, and rich-content sanitization. Explain any storage migration or compatibility change.
- Keep permissions scoped to the feature that needs them. Explain new permissions in the PR and user documentation.
- Update both `src/assets/locales/en-US.json` and `src/assets/locales/zh-CN.json` when adding localized UI text. Some existing context-menu labels and notifications are still hardcoded in Chinese.
- Measure performance changes with isolated synthetic data. Use 10,000 clips as the main acceptance scale and 100 as a smaller comparison; keep slower samples and distinguish local improvements from complete query or UI behavior. See the [performance notes](docs/performance.md).

There is currently no lint or format script. Avoid unrelated formatting and dependency changes.

## Validate your change

```sh
pnpm typecheck
pnpm test --maxWorkers=2
pnpm zip:all
git diff --check
```

`zip:all` builds and packages Chrome MV3, Edge MV3, and Firefox MV2; a separate `build:all` is unnecessary when running it. Unit tests use jsdom and fake-indexeddb, with V8 coverage over the configured source scope. They do not establish real-browser scrolling, highlight restoration, extension permissions, or store readiness.

For relevant browser changes, load the generated build and check capture, saved highlight restoration, passage navigation, popup clips, Clip Manager search/sort/timeline, and JSON backup export/restore with synthetic data. Restoring a backup replaces existing clips, so use an isolated browser profile. Record which browsers and scenarios you actually tested. The native acceptance scripts require external browser tooling; prerequisites are in the [page-endpoint report](docs/performance-page-endpoints.md#validation-and-reproduction).

CI runs frozen-lockfile installation, application type checking, unit tests with coverage, and all three browser packages on Ubuntu. CI uses `--testTimeout=15000` to allow runner headroom for IndexedDB fixtures; local tests retain Vitest's default timeout. It runs for PRs targeting `main`, pushes to `main`, `v*` tag pushes, and manual dispatches. It uploads browser ZIPs and SHA-256 checksums for 14 days. CI does not run native browser acceptance, performance measurements, or store publishing.

## Submit a pull request

Target `main` and complete the PR template with the problem, final behavior, validation results, skipped checks, and compatibility risks. Use an English [Conventional Commit](https://www.conventionalcommits.org/en/v1.0.0/) subject, such as `fix(highlight): restore stale-offset selections`, for commits and the PR title. Use an imperative subject of at most 72 characters without a trailing period. Preserve original authors and co-authors; commits created or amended through Codex include `Co-authored-by: Codex <codex@openai.com>` exactly once, after a blank line.

Resolve actionable review findings and pass CI for the latest revision before merging. Maintainers should configure the CI job as a required status check if they want GitHub to enforce this rule; adding a workflow alone does not enable branch protection.

Release preparation and publication follow the [release guidelines](docs/releases.md).
