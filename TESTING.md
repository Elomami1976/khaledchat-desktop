# Testing

```bash
cd app
pnpm exec tsc -p . --noEmit                               # typecheck
pnpm exec vitest run                                      # unit and integration
pnpm exec electron-vite build
HOB_BACKGROUND=1 pnpm exec playwright test --workers=1    # end-to-end (needs the build)
```

- Use `--workers=1` on slower PCs. Parallel Electron launches time out on the 2011 test machine.
- `e2e/packaged.spec.ts` runs only after `electron-builder --win`. It skips otherwise.

## Latest results (2026-11-13, Windows 10 22H2, i5-2450M, 8 GB, no supported GPU)

| Check | Result |
|---|---|
| Typecheck | Pass |
| Unit (vitest) | **676 passed, 4 failed, 22 skipped** (702) |
| End-to-end, full run (playwright, before the last spec fix) | **52 passed, 8 failed, 7 skipped** (67) |
| Installer build | `KhaledChat-Setup-0.1.0-x64.exe` built (unsigned) |
| Packaged app (`packaged.spec`) | Pass: real mode, branded, sandboxed, model-choice screen reached, no network requests |
| Silent install and uninstall (`/S`) | Install: exe, Start menu and desktop shortcuts, Apps entry (name, version 0.1.0, publisher). Uninstall: all removed |

### Failures, classified

| Failure | Cause |
|---|---|
| Unit: 4 symlink tests (`workspace` ×3, `tools-files` ×1) | **Baseline.** Creating symlinks needs Developer Mode or admin rights on Windows. Unmodified Hob fails the same way |
| e2e `chat-menu:14`, `navigation:181`, `onboarding-design:7`, `plugins:141` | **Baseline.** They fail identically on unmodified Hob on this machine: sub-pixel layout values and one timeout |
| e2e `access:8`, `agent:478`, `charts:8` | **Timing.** Each passed on re-run. `access` is usually the first spec, with a cold start |
| e2e `navigation:139` (home ideas) | **Expected behaviour change.** The email/calendar suggestion no longer shows on Windows. Spec updated, and it passes |
| e2e `mascot.spec` | Removed, along with Hob's mascot (replaced by the Khaled Chat logo) |

New regressions: none known after the fixes above.

### Khaled Chat test files

| File | What it covers |
|---|---|
| `test/consent.test.ts` | Download consent |
| `test/security.test.ts` | Electron settings, IPC sender and input checks, accounts off |
| `test/khaled-ui.test.ts` | Greeting, first name, branding metadata, Arabic coverage |
| `e2e/consent.spec.ts`, `security.spec.ts`, `netlog.spec.ts`, `khaled-ui.spec.ts`, `packaged.spec.ts` | The same areas, in the running app |

## Real-model test (approved download, 2026-11-13)

`HOB_REAL=1 HOB_REAL_USER_DATA=<dir> pnpm exec playwright test e2e/real-engine.spec.ts` with Qwen3 1.7B Q8_0 (1.83 GB, Apache-2.0), on this PC (i5-2450M, AVX without AVX2, 8 GB RAM, CPU only).

| Step | Result |
|---|---|
| Recommendation | Qwen3 1.7B, recommended by the picker for this PC |
| Consent dialog | Name, 1.83 GB, huggingface.co, destination folder, Apache-2.0, SHA-256 note. Nothing was fetched before Download was clicked |
| Download and verify | 1,834,426,016 bytes; SHA-256 verified (`.ok` marker) |
| Load | Works on the CPU. Download plus first load took about 27 min. Later starts reach Ready in under 20 min, sometimes after the engine restarts itself "without the graphics card" |
| First reply ("pong") | Correct, but slow: **10–12 min**. Reading the 4,240-token agent prompt takes about 460–500 s (≈9 tok/s); generation runs at about 0.7–1 tok/s, plus Qwen3's thinking |
| Streaming | Verified: the reply grows on screen while it is generated |
| Stop | Verified: the reply ends with "Stopped." and the composer comes back |
| Persistence | Verified: after a restart the app reaches Ready again, and the SQLite store holds all chats and messages, including the stopped reply |
| Spec status | 1 run passed every step up to the restart. The spec's final check (sidebar chat item) failed because the sidebar is hidden in the background window. It is now checked through the app API; that fix hasn't been re-run |

### Simple chat mode (added after this test)

Settings → General → **Chat mode** (Auto, Simple or Full). Auto turns Simple on when the engine finds no graphics acceleration, which is the case on this PC. Simple uses a 63-token system prompt instead of 4,240 tokens, offers no tools, and thinks briefly.

| Measure on this PC | Full mode | Simple mode |
|---|---|---|
| First reply ("pong") | 10–12 min (2 runs) | **73 s and 148 s** (2 runs) |
| Full real-engine spec (reply, streaming, stop, restart) | not completed | **passed** (15.7 min including the app's two start-ups) |

**Earlier conclusion (Full mode):** local inference works end to end on a 2011 dual-core CPU without AVX2, but it is too slow to be pleasant there. 8 GB machines with a newer CPU (AVX2) or a GPU should be much faster; that is not measured. The agent's long system prompt dominates the first reply. Simple chat mode (above) addresses this.

## Not tested

- **Real-model inference on GPU machines,** and on any other machine.
- Windows 11.
- Machines with NVIDIA, AMD or Intel GPUs.
- High-DPI and multi-monitor setups.
- An upgrade-install over a previous version.
