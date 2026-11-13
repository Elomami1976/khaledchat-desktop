# Release checklist

## 0.1.0 decisions
- Released unsigned (SmartScreen warning), with Code tools gated off on Windows and Web search gated off everywhere (`RELEASE_GATES` in `app/src/main/index.ts`; `HOB_ALLOW_ALL=1` lifts them for testing).
- Other languages ship with English for Khaled Chat text.

## Open items (were release blockers)

1. **Performance on low-end CPUs.** The real-model test passes on an i5-2450M. In Full mode the first reply takes 10–12 min. Simple chat mode (Auto on CPU-only PCs) brings it to about 1–2.5 min. Still to test on a newer CPU and a GPU, where Full mode should be usable.
   - check load, streaming, stop, switching and unloading on CPU-only Windows (this PC's CPU has AVX but not AVX2);
   - check the same with a GPU if one is available.
2. **Code tools on Windows aren't isolated.** Model-written Python runs at low integrity: writes are limited, but reads and network are not.
   - Before release, choose one:
     - (a) ask before every run on Windows;
     - (b) find a stronger sandbox (AppContainer);
     - (c) ship with Code tools hidden on Windows.
   - It is an optional, consent-gated download and is not installed by default.
3. **Unsigned installer.** SmartScreen will warn. A code-signing certificate or Azure Trusted Signing is needed.
4. **Localization.** English and Arabic are complete. The other 30 languages show English for the ~84 strings Khaled Chat added.
   - Options: translate them, or offer only English and Arabic in 0.1.0.
5. **SearXNG (AGPL-3.0)** stays opt-in and unbundled.
   - Decide keep, replace or remove after a licensing review (`docs/khaled-chat/searxng-agpl-audit.md`).
   - Recommended for 0.1.0: hide "Web search" in Optional components until that is decided.

## Before publishing

- [ ] Review `git log hob-baseline-0.2.6..HEAD`, then merge to `main`.
- [ ] Decide what happens to Hob's inherited `v0.2.x` tags and the `site/` folder (Hob's website) before pushing to `Elomami1976/khaledchat-desktop`.
- [ ] Run `pnpm licenses list --prod` and complete `THIRD_PARTY_NOTICES.md`.
- [ ] Run the full test suites (TESTING.md) on Windows 10 and Windows 11.
- [ ] Install, upgrade (over the previous version) and uninstall on a clean machine.
- [ ] Sign, then check the signature with `signtool verify /pa`.
- [ ] Publish the SHA-256 of the installer.
- [ ] Decide on a user-controlled update check, if any. None exists now. Any update check must not contact FrigadeHQ.

## Done

- [x] Consent for every download, with dialog details, cancel and confirmed resume.
- [x] No automatic network use at startup. Verified for the main process and Chromium, in dev and packaged builds.
- [x] Sandbox, context isolation, navigation lock, IPC sender and input validation.
- [x] No accounts. No Frigade endpoints (catalog, updates, OAuth).
- [x] Brand: name, app id, approved icon and logo, palette, About, Hob attribution.
- [x] Installer: assisted, per-user, shortcuts, license page, notices shipped, data kept on uninstall.
