# Architecture

This is a pnpm workspace:
- `app/`: the Electron application (electron-vite, React 19, Tailwind 4, TypeScript).
- `packages/picker`: `@hob/picker`, the model recommender.
- `catalog/`: the bundled model catalog.

## Processes

| Process | Code | Role |
|---|---|---|
| Main | `app/src/main/` | Windows, IPC, settings, downloads, chats (SQLite), agent loop, plugins |
| Engine (utility process) | `app/src/engine/worker.ts` | node-llama-cpp: GPU probe, loading GGUF models, streaming tokens. Keeps inference off the UI thread |
| Renderer (sandboxed) | `app/src/renderer/` | The React UI. It reaches the main process only through `window.hob` (`app/src/preload/index.ts`) |
| Optional children | `python/`, `vision/`, `search/` | Python for code tools, llama-server for image support, SearXNG for web search. Each is installed only with consent |

## Khaled Chat additions to Hob

| Area | Files |
|---|---|
| Download consent | `main/consent.ts`, `main/components.ts`, `renderer/src/components/DownloadConfirm.tsx`. See `docs/khaled-chat/consent-gate.md` |
| Electron hardening | `main/security.ts` (window settings, `isAppUrl`, `guardIpc`, web-contents hardening) and `main/ipcGuard.ts` |
| IPC input validation | `main/ipcValidate.ts`, used by every privileged handler in `main/ipc.ts` |
| No accounts | `main/accountsOff.ts` |
| Network log | `main/netlog.ts` (`KHALED_NET_LOG=<file>`) |
| Branding and greeting | `renderer/src/components/Welcome.tsx`, `shared/greeting.ts`, `renderer/src/assets/brand/` (approved logo SVGs) |
| Settings → Hardware, About, first name | `renderer/src/components/SettingsExtra.tsx`; `system:info` IPC |

## Model selection

1. Setup probes the GPU in the engine process.
2. It reads the CPU, RAM and disk (`main/hardware.ts`).
3. `@hob/picker` ranks the bundled catalog: memory fit, GPU and unified memory, disk space. Its recommendation tiers come from the catalog's metadata, not from benchmarks run here.
4. Models that don't fit are shown but cannot be picked.

Downloads are checked against the catalog's SHA-256, can resume from a partial file, and need consent each time.

## Storage

Everything lives under `%APPDATA%\Khaled Chat`:
- `settings.json`, written atomically (write, then rename);
- chats in SQLite;
- `models/`, `python/`, `vision/`, `speech/`.

Chat files go in `Documents\Khaled Chat`. The internal identifiers `hob-file:`, `HobApi` and `window.hob` keep their upstream names, which keeps merging from upstream simple.
