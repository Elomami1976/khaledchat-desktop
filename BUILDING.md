# Building

```bash
cd app
pnpm exec electron-vite build                     # compiles to app/out
pnpm exec electron-builder --win nsis --x64       # installer in app/dist
```

## What you get

- `app/dist/KhaledChat-Setup-<version>-x64.exe`: an assisted NSIS installer.
  - It can install per user without admin rights, and lets you choose the folder.
  - It creates Start menu and desktop shortcuts.
  - It shows the MIT license.
- `app/dist/win-unpacked/`: the unpacked app, for testing without installing.

## Notes

- **Unsigned.** There are no code-signing credentials, so Windows SmartScreen warns on first run. Signing needs a certificate (`CSC_LINK` / `CSC_KEY_PASSWORD`, or Azure Trusted Signing) before public release.
- **No models are bundled.** Only `node-llama-cpp`'s prebuilt Windows engine binaries are, unpacked from the asar.
- **No update feed** (`publish: null`).
- **Upgrades keep user data.** Uninstalling keeps chats and models too (`deleteAppDataOnUninstall: false`). Settings → Files & storage → Remove deletes them.
- The app icon is `app/build/icon.png`, rendered from the approved `khaled-chat-icon.svg`. electron-builder makes the `.ico`.
- The GitHub `release.yml` workflow is manual-only. It still contains Hob's Mac signing steps, which need review before use.
