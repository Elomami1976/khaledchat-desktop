# Third-party notices

## Hob (upstream)
Khaled Chat is based on Hob, Copyright (c) 2026 Frigade, MIT License: https://github.com/FrigadeHQ/hob.
The full license text is in [LICENSE](LICENSE). It is kept unchanged except for an added line for Khaled Chat's
modifications.

## Bundled in the installer (main components)
| Component | License | Notes |
|---|---|---|
| Electron (Chromium, Node.js) | MIT (Chromium: BSD-style and others) | Electron ships `LICENSES.chromium.html` inside the installed app |
| node-llama-cpp and llama.cpp prebuilt binaries | MIT | Local inference engine |
| React, Tailwind CSS, lucide-react | MIT / ISC | UI |
| better-sqlite3 / SQLite | MIT / public domain | Chat storage |
| onnxruntime-web, transformers.js | MIT / Apache-2.0 | Dictation runtime (the model itself is an optional download) |
| pdf.js | Apache-2.0 | PDF previews |
| Hanken Grotesk font | SIL OFL 1.1 | `app/resources/licenses/HankenGrotesk-OFL.txt` |

The full dependency list and licenses: `pnpm licenses list --prod` (run before each release, see RELEASE_CHECKLIST.md).

## Downloaded only with the user's consent (not bundled)
| Component | License | Notes |
|---|---|---|
| AI models (catalog) | Per model (Apache-2.0, MIT, Gemma, Llama, etc.) | The license is shown in the download dialog |
| Python (python-build-standalone) and PyPI packages | PSF and package licenses | Optional "Code tools" |
| SearXNG | **AGPL-3.0** | Optional "Web search": downloaded unmodified from upstream, not bundled. See `docs/khaled-chat/searxng-agpl-audit.md` |
| Whisper ONNX (dictation) | MIT (original Whisper); the conversion's license is unverified | Optional |
| Vision model and llama-server | Apache-2.0 / MIT | Optional "Image support" |

## Brand assets
The Khaled Chat logo and icon are the project's own approved assets (from the khaledchat-website repository). They
are not covered by the MIT license grant for code unless the project states otherwise.
