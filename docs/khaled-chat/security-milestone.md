# Khaled Chat Desktop: security milestone (Electron hardening, IPC, accounts, SearXNG)

Date: 2026-11-13 · Branch `phase-3-consent` · Commits `1f534bd` (Phase 3 consent gate), `9b8ca21` (this milestone),
plus this report. Nothing pushed. Website repo untouched. No branding work.

## 1. Electron audit: before → after

| Area | Hob 0.2.6 | Khaled Chat now |
|---|---|---|
| Sandbox | `sandbox: false` on the app window | `sandbox: true` (`SECURE_WEB_PREFERENCES`, `security.ts`) |
| Context isolation | Electron default (on), not stated | Explicitly on |
| Node in page/workers/sub-frames | Default off, not stated | Explicitly off (`nodeIntegration`, `…InWorker`, `…InSubFrames`) |
| `<webview>` | Default off | `webviewTag: false`, and every web contents prevents `will-attach-webview` |
| web security / insecure content | Defaults | `webSecurity: true`, `allowRunningInsecureContent: false`, `navigateOnDragDrop: false` |
| New windows | App window: denied, http(s) to browser | Same, plus **every** web contents (incl. offscreen page renderer) denies by default |
| Navigation | `will-navigate`: dev URL by `startsWith` (look-alike ports passed), or exact index.html | `isAppUrl`: exact bundled `index.html` (any route) or exact dev origin; `will-redirect` locked too; sub-frames can't load `file:` or custom schemes |
| External links | http(s) regex | `isExternalWebUrl` (URL-parsed, http/https only) |
| CSP | Strict CSP in shipped builds (already present) | Unchanged |
| Preload exposure | `window.hob` via `contextBridge` only; no raw `ipcRenderer` | Unchanged surface; verified it needs only the `electron` module, so it runs sandboxed |
| Permissions | Microphone (audio) only | Unchanged |

**Sandbox tradeoff:** enabling it needed **no architectural change**. The bundled preload requires only `electron`
and uses `process.platform`/`process.env`, all available to sandboxed preloads. Dictation (onnxruntime-web WASM in a
worker) and PDF previews still work (e2e). So no disruptive modification was needed and none was made.

## 2. IPC sender validation
- `guardIpc` wraps `ipcMain` inside `registerIpc`: **all ~70 handlers** refuse (throw `IpcRefusedError`, log a
  warning) unless the request comes from the app window's web contents, its **top frame**, showing the **app page**.
- A test asserts `ipc.ts` registers nothing on the raw `ipcMain` and no other module registers handlers.
- e2e: a second window loaded with the app's own preload on a `data:` page is refused for `settings.get`,
  `downloads.approve` and `models.remove`.

## 3. Runtime validation of IPC inputs (`ipcValidate.ts`)
Typed checks that throw `InvalidIpcInput` before anything runs:
- **Files:** `files:add` (array ≤1000 absolute paths, no NUL), `files:open/show` (absolute path, then the existing `allowed()` check), `files:paste` (chat id; type/size checks were already there).
- **Downloads / models:** `models:use`, `models:remove`, `setup:confirm` (id pattern `[\w.:@+-]`, ≤200, so no `../`); `downloads:*` and `components:*` already used `parseKey`.
- **Process execution:** `plugins:connectApp` (object, bounded strings) **plus a main-process system dialog showing the exact command or server URL** before anything is saved. `plugins:addFile` needs an absolute path (and still shows Hob's existing trust dialog).
- **Agent control:** `approval:answer` (only `allow|always|deny`), `chat:send` (ids, text ≤2 MB, attachments with absolute paths), `chat:stop`, `task:undo` (integer).
- **Settings and data:** `settings:set` (plain object; fields were already sanitised), chat/project/plugin ids everywhere, `chats:keep` (integer).
- **Deletion:** `storage:removeHob` now also asks in a **main-process system dialog** (the page's own confirm remains).

## 4. Google / Microsoft OAuth
- Finding (correcting the Phase 3 report): this checkout ships **empty** client IDs (`providers.ts`), so sign-in was already not offered. It did not use Frigade's credentials at run time. Frigade's builds may inject them; ours do not.
- Now disabled outright: `accountsOff()` replaces `Accounts` in every mode. Nothing is offered, `accounts.bin` is never read, no token refresh happens, and `accounts:signIn` always throws. A test pins the client IDs to empty strings.
- **No account is required anywhere.** Mac Calendar & Mail (system apps, no OAuth) is untouched. The Accounts code stays, unused, for simpler upstream merges.

## 5. SearXNG
Audited in [`searxng-agpl-audit.md`](searxng-agpl-audit.md). Nothing shipped or replaced. Still off by default (web
access off; component install needs consent). Recommendation: don't bundle; decide keep/replace/remove before release.

## 6. Tests
New:
- `test/security.test.ts`: 20 unit tests (window prefs, preload deps, webview/new-window denial, `isAppUrl`, external URLs, sender checks, guard on every handler, validators, privileged handlers wired, accounts off).
- `e2e/security.spec.ts`: the real window's prefs, no Node globals in the page, `window.open` → null, `file://` navigation blocked, invalid arguments refused, accounts refused, foreign-window IPC refused, the real page still works.

| Suite | Result |
|---|---|
| Typecheck | exit 0 |
| Unit (full) | **669 passed, 4 failed, 22 skipped** (695). The 4 are the **baseline** symlink `EPERM` tests (`workspace` ×3, `tools-files` ×1), identical on unmodified Hob on this Windows account |
| e2e (full, `--workers=1`, 19.9 min) | **57 passed, 5 failed, 7 skipped** |
| → 4 of 5 | `chat-menu:14`, `navigation:181`, `onboarding-design:7`, `plugins:141`: **baseline**, the same 4 that fail on unmodified Hob here (Phase 3 comparison) |
| → 1 of 5 | `agent:248` PDF thumbnail (5 s timeout): re-run **3/3 passed**; same intermittent failure seen in Phase 3. Not a regression |
| New regressions | **None found** |

Windows startup, onboarding and local model management:
- `netlog.spec` passed in the full run. That is real (non-fake) mode on Windows, sandboxed, launching to the model-choice screen with zero network requests.
- `onboarding`, `consent`, `settings` and model-management specs passed (fake engine).
- **Not tested:** a real model download or inference (not authorized).

## 7. Remaining risks
- **A compromised page is still powerful.** Sandboxing plus the sender checks stop other frames and windows, but the app page itself can call any exposed API with valid arguments, for example `files:add` (copy any readable file into a chat folder) or approve agent actions. The CSP and the navigation lock are the main defenses against getting script into that page.
- **Not every argument has a deep schema.** `projects:*` uses Hob's `cleanProject`; `plugins:saveSkill` and several string fields are only type- and length-checked.
- **The new system dialogs** (connect app, Remove) are skipped in fake/test mode, so e2e can't click native dialogs. They are covered by source-level unit tests only.
- **Agent tools are outside this review.** `run_python` (low-integrity sandbox on Windows) and plugin and MCP programs are a separate, large attack surface.
- **The offscreen page renderer** (`render.ts`, used with web access) loads arbitrary sites in a sandboxed, isolated, separate session; it has no preload.
- **Not done:** signing the bundled catalog, removing the unused `electron-updater` dependency, and translating the 7 new strings (English placeholders).
- **Network:** still only startup is verified to make no requests; child processes are not covered.

## 8. Recommended next steps
1. Review, then merge `phase-3-consent` to local `main`; decide when to push to `Elomami1976/khaledchat-desktop`.
2. Decide the SearXNG option (A, C or D).
3. Audit agent tool permissions and the Python sandbox on Windows.
4. With approval: a first real model download (Qwen3 1.7B, 1.83 GB) for a real inference test.
5. Phase 4: branding.
