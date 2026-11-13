# Khaled Chat: download consent and network defaults (Phase 3)

Khaled Chat is based on [Hob](https://github.com/FrigadeHQ/hob) (MIT, © 2026 Frigade), baseline tag
`hob-baseline-0.2.6` (commit `74a09d6`). Hob's `LICENSE` is kept unchanged.

## Rule

Nothing is downloaded unless the person confirms that specific download. This holds at start-up, during onboarding,
when a feature is first used, after a restart, and for the agent.

## How it is enforced

- `app/src/main/consent.ts` is the one consent store, in the main process. Grants:
  - come only from the `downloads:approve` IPC call, which is accepted from the app window's own page only (`ipcGuard.ts`);
  - are kept in memory, so a restart never carries one over;
  - are single-use: the download that uses one releases it when it ends, whether it finished, failed or was cancelled;
  - lapse after 2 minutes if no download uses them.
- Each download path checks for a grant just before it reaches the network:
  - catalog models: `SetupController.install`, plus `ensureModelFile` as a second check;
  - image support: `VisionInstaller.ensure` and its server archives;
  - dictation: `SpeechModel.ensure`;
  - code tools: `PythonRuntime.ensure`;
  - web search: `PythonRuntime.ensureSearxng`.
- Without a grant these throw `ConsentRequiredError` before anything is fetched or run. The agent gets a message
  telling the user where to install the component.
- PyPI package installs requested by the agent (`install_packages`, skill packages) are refused. There is no
  confirmation flow for them yet.

## What changed from Hob's behaviour

| Hob | Khaled Chat |
|---|---|
| "Download and start" downloaded at once | It opens a confirmation dialog first |
| A saved `pendingModelId` resumed the download on every launch | The choose screen offers to resume; it continues only after a new confirmation |
| A small "starter" model was downloaded alongside the chosen one | Only the confirmed model is downloaded |
| Out of memory → a lighter model was downloaded automatically | Falls back only to models already on disk |
| Image model, llama-server, Whisper, Python, SearXNG installed in the background once chat worked | Optional components in Settings, installed only after confirmation; each can be cancelled |
| Remote model catalog fetched from FrigadeHQ's GitHub at every start | Only the catalog bundled with the app is used; nothing is fetched |
| Web access on by default | Off by default |
| electron-updater checked FrigadeHQ releases, then downloaded and installed updates | No update check, download or install; `publish: null` in `electron-builder.yml` |

## The confirmation dialog

`app/src/renderer/src/components/DownloadConfirm.tsx`. It shows:
- the component name;
- the size, or an estimate clearly labelled as one;
- the source host or hosts, with each file's URL under "Files";
- the destination folder;
- the license, when known.

Protection against accidental confirmation:
- focus starts on Cancel;
- the Download button stays disabled for 1.2 s after the details appear;
- clicks earlier than that are ignored even if the button somehow renders enabled.

Escape, the close button or a click outside the dialog all cancel.

## Checking network activity

`KHALED_NET_LOG=<file>` logs every outgoing request to that file (`app/src/main/netlog.ts`).

Covered:
- the main process's Node `fetch`, `http` and `https`;
- everything Chromium sends for the app window and for Electron's `net` module.

Not covered:
- child processes (the engine utility process, Python, llama-server);
- raw sockets.

`app/e2e/netlog.spec.ts` uses this log to check that start-up makes no requests, with a positive control.
