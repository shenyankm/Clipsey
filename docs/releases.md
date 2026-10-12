# Release guidelines

Clipsey releases contain versioned browser-extension packages. GitHub Releases and browser-store publication are separate processes. CI builds downloadable artifacts; it does not create a GitHub Release, sign extensions, or submit to stores.

## Version and source

- Use a three-part numeric `package.json` version (`X.Y.Z`) and a matching tag (`vX.Y.Z`). WXT derives the extension manifest version from this file. Increase the version for every public release; do not retag or replace an already published version.
- Use patch versions for fixes, minor versions for compatible features, and major versions for incompatible changes. Explain storage migrations, changed permissions, or backup incompatibilities in release notes.
- Prepare the version bump and documentation in a PR targeting `main`. Tag the merged commit after its CI passes. The tag CI also checks that the tag matches `package.json` and builds packages from that tagged source.
- Mark testing releases as GitHub prereleases. Keep the package version numeric; a prerelease label on GitHub does not require adding an unsupported suffix to the extension manifest version.

## Before creating a draft

1. Ensure the release commit is on `main`, has passed CI, and has no unresolved release-blocking review findings. If checks are skipped, report them and do not claim they passed.
2. Test the intended release browsers using isolated profiles and synthetic clips. Check capture, highlight restoration and navigation, popup clips, Clip Manager search/sort/timeline, and backup export/restore. Include an upgrade check from the previous public version when available. Use 10,000 clips and a 100-clip comparison when the change affects performance; keep the limits of the measurements explicit.
3. Check generated manifests for the expected version, permissions, and browser format: Chrome/Edge MV3 and Firefox MV2. Inspect build warnings and generated packages before publication.
4. Write English release notes describing changes, fixes, any migration or backup precautions, validation actually performed, known limitations, and installation instructions. Never imply store availability unless the corresponding listing is live.

## Tag and obtain the packages

The following commands are a maintainer example. Run them from a clean checkout after merging the version-bump PR; `X.Y.Z` is read from `package.json`.

```sh
git switch main
git pull --ff-only origin main
release_version=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).version')
git tag -a "v${release_version}" -m "Release v${release_version}"
git push origin "v${release_version}"
```

Wait for the **CI** run for that tag to succeed. Check the run's commit SHA against the tag, then download its artifact named `clipsey-<commit-sha>` from the Actions page or with the [GitHub CLI](https://cli.github.com/manual/gh_run_download):

```sh
# Replace RUN_ID with the successful tag run ID.
gh run view RUN_ID --repo shenyankm/Clipsey
release_sha=$(git rev-list -n 1 "v${release_version}")
mkdir release-assets
gh run download RUN_ID --repo shenyankm/Clipsey \
  --name "clipsey-${release_sha}" --dir release-assets
cd release-assets
sha256sum -c SHA256SUMS
# On macOS, use: shasum -a 256 -c SHA256SUMS
cd ..
```

The artifact contains these files, with the actual version in place of `X.Y.Z`:

| File | Purpose |
| --- | --- |
| `clipsey-X.Y.Z-chrome.zip` | Chrome MV3 extension package |
| `clipsey-X.Y.Z-edge.zip` | Edge MV3 extension package |
| `clipsey-X.Y.Z-firefox.zip` | Unsigned Firefox MV2 extension package |
| `SHA256SUMS` | SHA-256 checksums for those three packages |

Download artifacts within their 14-day retention period. If they expire, rerun CI for the same tag and validate the new artifacts; do not substitute a local build or a different commit's packages without recording and checking that change. Builds contain a generated CSP nonce, so rebuilding the same source does not promise byte-identical ZIPs.

Local reproduction uses `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test --maxWorkers=2`, and `pnpm zip:all`. WXT also generates `clipsey-X.Y.Z-sources.zip` during Firefox packaging. CI uploads only the three browser packages and their checksums. Review a source ZIP before submitting it to a store: the default WXT source selection can include non-hidden generated files such as coverage reports. Supply source and build instructions if required by store review.

## Create, review, and publish

Create a draft release for the existing tag, attach the three packages and `SHA256SUMS`, and review the notes before publishing. With a prepared `release-notes.md`, the [GitHub CLI](https://cli.github.com/manual/gh_release_create) command from the checkout root is:

```sh
gh release create "v${release_version}" \
  release-assets/clipsey-*-chrome.zip \
  release-assets/clipsey-*-edge.zip \
  release-assets/clipsey-*-firefox.zip \
  release-assets/SHA256SUMS \
  --repo shenyankm/Clipsey \
  --verify-tag --draft \
  --title "Clipsey v${release_version}" \
  --notes-file release-notes.md
```

For a testing release, add `--prerelease`. Check the exact tag, commit, assets, checksums, notes, and installation wording in the draft. A maintainer then publishes it through GitHub. Verify the public page and asset downloads after publication. Drafts are not public downloads.

Chrome and Edge ZIPs can be extracted and loaded as unpacked extensions using the [README instructions](../README.md#install-from-source). Firefox's unsigned package is for temporary loading during development and testing; it is not a signed add-on for permanent installation in standard Firefox. Store publication requires separate accounts, review, and any required signing or manifest metadata. Address Firefox extension-ID and data-collection metadata requirements before claiming store readiness. Follow [WXT's publishing guidance](https://wxt.dev/guide/essentials/publishing.html) and the target store's current requirements.

## Release notes outline

```markdown
## Changes
- User-visible changes and fixes, with issue or PR links.

## Compatibility and data
- Browser support, new permissions, migration steps, and backup precautions.

## Validation
- Commands, browser versions, and scenarios actually checked.
- Explicitly list unrun checks and known limitations.

## Installation
- Explain which asset to download and how to load it.
- Link store listings only when available.
```

If a published release is faulty, document the issue and publish a new version. Do not silently replace its assets or move the tag. Store releases may need a separate rollback or follow-up submission.
