# Privacy

Khaled Chat is local-first. It needs no account and uses no cloud AI service.

## Stored on your computer only

These live under `%APPDATA%\Khaled Chat` and `Documents\Khaled Chat`:
- chats;
- files you add;
- models;
- your optional first name;
- settings.

Delete them in Settings → Files & storage. You can delete all chats, or remove the app and its data.

## Network use: the complete list

| What | When | Destination |
|---|---|---|
| Model download | Only after you confirm it in the download dialog | The host named in the dialog (huggingface.co for catalog models) |
| Optional component download (code tools, web search, dictation, image support) | Only after you confirm it | The hosts named in the dialog: python.org builds on GitHub, PyPI, huggingface.co, github.com |
| Web access (search, reading pages) | Only if you turn Web access on (off by default) | The pages and search engines involved. Web search sends queries to public search engines through a local SearXNG |
| Connectors / plugins you add | Only if you add one; connecting asks first | The server or program you chose |
| Links you click | Opened in your normal browser | That site |

Not used:
- automatic updates or update checks;
- a remote model catalog;
- telemetry or analytics;
- crash reporting;
- Google or Microsoft sign-in.

## What has been verified

- **Startup through to the model-choice screen:** no requests from the main process or Chromium. This is the automated test `app/e2e/netlog.spec.ts`, run on Windows.
- **Not verified:** requests from child processes (engine, Python, llama-server) and behaviour during real-model chats. We don't claim complete network isolation.
- **Code tools on Windows:** model-written Python runs at low integrity. That limits where it can write, but it can still read your files and use the network. See RELEASE_CHECKLIST.md.
