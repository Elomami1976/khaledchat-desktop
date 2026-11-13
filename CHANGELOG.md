# Changelog

## 0.1.0 (release candidate, unreleased)
First Khaled Chat build, based on Hob 0.2.6 (`hob-baseline-0.2.6`).

### Privacy and consent
- Every download (models and optional components) needs a confirmation. The dialog shows the name, size, source, destination and license.
- No automatic downloads at startup, during onboarding, after a restart, or as a fallback.
- Interrupted downloads resume only after a new confirmation.
- Only the bundled model catalog is used, and nothing is fetched at startup.
- Web access is off by default.
- No update checks and no auto-update.
- No Google or Microsoft accounts.

### Security
- The app window runs sandboxed with context isolation, no Node and no `<webview>`.
- Navigation and redirects are locked to the app page.
- Every IPC call is checked: the sender must be the app window, and privileged handlers validate their arguments.
- Connecting an app (it runs a program) and removing the app are confirmed in a system dialog.
- The release workflow is manual-only.

### Brand and interface
- Khaled Chat name, approved logo and icon, monochrome palette.
- Simple chat mode: short prompt, no tools, quick thinking. Auto turns it on for PCs without graphics acceleration; the first reply came about 5–10× faster on the test PC.
- Welcome greeting by local time, with an optional first name.
- New Settings sections: Hardware, About (version, website, source, licenses, Hob attribution) and Optional components.
- Mac-only email and calendar are no longer suggested on Windows.
- Arabic translations for all new text.

### Packaging
- Assisted NSIS installer: chooses the folder, adds shortcuts, keeps user data on upgrade and uninstall. It is unsigned.
