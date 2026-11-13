# Development

## Prerequisites (Windows)

- **Node 24.** This machine uses nvm-windows. Node 24 isn't the global default, so put it first on PATH:
  `export PATH="$APPDATA/../Local/nvm/v24.22.3:$PATH"` (Git Bash).
- **pnpm 10.7.0.** Installed locally here in `../tools`; `corepack` works too.
- **Python 3.12.** Only for building native helpers and Python tool tests.

## Setup

```bash
pnpm install
node node_modules/electron/install.js   # if pnpm skipped Electron's binary download
cd app
pnpm exec electron-vite dev             # runs the app with hot reload
```

## Useful environment variables

| Variable | Effect |
|---|---|
| `HOB_FAKE=1` | Stand-in engine and downloads. No model needed and nothing fetched (all UI and e2e tests use it) |
| `HOB_USER_DATA=<dir>` | Use a separate profile folder |
| `HOB_BACKGROUND=1` | Keep the window off screen (tests) |
| `KHALED_NET_LOG=<file>` | Log every outgoing request from the main process and Chromium |

## Rules for changes

- Every download goes through `consent.use()` or `consent.assert()`. Never add a download path without it.
- Every IPC handler is registered inside `registerIpc` (guarded). Validate arguments with `ipcValidate.ts`.
- User-facing text goes through `t()`. After adding text, add it to the locale tables and give Arabic a real translation (see TESTING.md).
- Don't rename internal `hob` identifiers. Product text says "Khaled Chat".

Progress is logged in `docs/khaled-chat/PROGRESS.md`.
