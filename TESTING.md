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

## Not tested

- **Real-model inference:** downloading a model, loading it, streaming, and GPU vs CPU behaviour. No model download was authorized, so chat behaviour is verified only with the stand-in engine (`HOB_FAKE=1`). The real engine was exercised only for the hardware probe, in the packaged build.
- Windows 11.
- Machines with NVIDIA, AMD or Intel GPUs.
- High-DPI and multi-monitor setups.
- An upgrade-install over a previous version.
