# Clipsey

Save useful passages from the web, keep their source links, and return to them later. Clipsey is a browser extension for Chrome, Edge, and Firefox that stores your clips locally without requiring an account.

## Features

- **Save selected text:** use the page context menu to capture an excerpt, its source URL, page title, and creation time.
- **Highlight and revisit:** restore saved highlights when you return to a page and locate passages with native Text Fragments in supported browsers or extension-assisted text location in others.
- **Manage your collection:** view clips for the current page in the popup, or search, sort, and browse a timeline in the Clip Manager. Search by title, website, or content.
- **Keep basic formatting:** preserve supported rich content such as emphasis, lists, and links. Saved HTML is sanitized before display; full page styling is not preserved.
- **Back up your clips:** export and restore JSON backups, including backups created with the older, formatted JSON export.
- **Customize highlighting:** choose amber, green, or blue and control automatic highlight restoration and navigation to the first saved passage.

## Install from source

Requirements: Node.js 22.22.2+ on the 22.x line, 24.15.0+ on the 24.x line, or 26+, and pnpm 10.28.2.

```sh
git clone https://github.com/shenyankm/Clipsey.git
cd Clipsey
pnpm install --frozen-lockfile
pnpm build:all
```

Load the build for your browser:

| Browser | Build directory | Local installation |
| --- | --- | --- |
| Chrome | `.output/chrome-mv3/` | Open `chrome://extensions`, enable Developer mode, and select **Load unpacked**. |
| Edge | `.output/edge-mv3/` | Open `edge://extensions`, enable Developer mode, and select **Load unpacked**. |
| Firefox | `.output/firefox-mv2/` | Open `about:debugging`, select **This Firefox**, then **Load Temporary Add-on** and choose the build's `manifest.json`. |

Select the corresponding directory when loading Chrome or Edge. Firefox's temporary installation lasts until the browser restarts. See the official installation guides for [Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-an-unpacked-extension), [Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading), and [Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

## Use Clipsey

The interface defaults to Simplified Chinese. You can switch to English in Settings; some context-menu labels and notifications are still in Chinese.

1. Select text on a regular HTTP or HTTPS page, then choose Clipsey's selection-saving entry in the context menu. Allow access to that website when prompted.
2. Click the Clipsey toolbar icon to see clips saved for the current page.
3. Open **Settings > Clip Manager** to search, sort, view details, use the timeline, or revisit a clip's source.
4. Use **Export Backup** before restoring a backup or clearing your collection.

## Data and permissions

Clips and diagnostic error logs are stored locally in IndexedDB. Preferences use the browser's local extension storage. Clipsey does not upload your clips to a server. Old clips are not automatically deleted when the collection grows; capacity depends on browser storage quotas.

Website access is requested when needed to capture content and restore highlights. Clipsey works on regular HTTP(S) pages, not browser settings pages or other restricted pages. Changes to the original page, repeated text, browser support, or a website's Text Fragment policy can affect passage location.

**Restoring a backup replaces your existing clips.** Clipsey validates the backup and asks for confirmation before restoring it. Export your current collection first. Backups include clips and up to 1,000 diagnostic error logs; they do not include preferences.

## Development

Built with WXT, Vue 3, TypeScript, Ant Design Vue, and DOMPurify.

```sh
pnpm dev:chrome       # Development build for Chrome
pnpm dev:edge         # Development build for Edge
pnpm dev:firefox      # Development build for Firefox
pnpm typecheck       # Application type check
pnpm test            # Unit tests with coverage
pnpm build:all       # Production builds for all three browsers
pnpm zip:all         # Package all three browser builds
```

Unit tests use jsdom and fake-indexeddb. Native browser behavior, including page scrolling and highlight restoration, also needs browser testing. Performance acceptance uses 10,000 clips as the main dataset, with 100 clips as a smaller comparison; this is a test scale, not a storage limit or a guarantee for every website. See the [performance notes](docs/performance.md) for measurements, limitations, and benchmark scripts.

## License and feedback

[Apache License 2.0](LICENSE). Report bugs or request features through [GitHub Issues](https://github.com/shenyankm/Clipsey/issues).
