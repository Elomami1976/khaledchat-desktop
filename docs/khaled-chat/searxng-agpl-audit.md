# Khaled Chat: SearXNG (web search) and AGPL-3.0 audit

Status: **audit only. Nothing about SearXNG is shipped, replaced or changed in this milestone.** It stays off by
default and installs only after the person confirms it (Phase 3 consent gate). This is an engineering summary, not
legal advice; get a lawyer's view before any public release that offers web search.

## How Hob uses SearXNG today (inherited, unchanged)

| Aspect | What the code does | Where |
|---|---|---|
| Source | Upstream SearXNG at pinned commit `4e2c1ea7…`, tarball from `github.com/searxng/searxng`, checked against a SHA-256 | `app/src/main/search/searxng.ts` |
| Distribution | **Not bundled in the installer.** Downloaded onto the person's computer only when they install "Web search" (consent `component:search`) | `python/runtime.ts` `ensureSearxng` |
| Changes to it | The source is unpacked **without its `utils/` folder** (deploy scripts with a symlink Windows can't create). No SearXNG file is edited | `SEARXNG_SKIP` |
| Configuration | A `settings.yml` written by the app: bound to `127.0.0.1` on a random port, JSON output only, limiter and image proxy off, a chosen engine list | `searxSettings()` |
| Process | Separate Python process, started on first search; talks to the app over local HTTP only | `SearxngServer` |
| Who reaches it | Only this app on this computer (loopback). Not exposed to the network | `bind_address: "127.0.0.1"` |
| What leaves the computer | **The person's search query, sent by SearXNG to up to 9 public engines** (Google, Bing, Brave, DuckDuckGo, Mojeek, Startpage, Wikipedia, Yahoo, Yandex) | `ENGINES` |
| When it runs | Only if web access is on (off by default since Phase 3) **and** the component is installed. With web access off, web tools are hidden from the model and denied if called | `tools/index.ts specsFor`, `agent/permissions.ts` |

## AGPL-3.0 implications (engineering view)

1. **Conveying (distribution).** AGPL §4–6 obligations (license text, notices, Corresponding Source) apply when a
   copy of SearXNG is *conveyed*. Today the app doesn't ship SearXNG; it fetches the unmodified upstream tarball
   from upstream's own repository on the person's request. Whether that makes Khaled Chat's publisher the conveyor
   is the key open legal question. If SearXNG were ever **bundled** in the installer, Khaled Chat would convey it
   and must ship the license and offer the exact source (the pinned commit).
2. **Modification.** Leaving out `utils/` and supplying a `settings.yml` are probably configuration, not
   modification of the work, but this should be confirmed. Any patch to SearXNG files would make it a modified
   version with stronger notice duties.
3. **Network use (§13).** §13 applies to a *modified* version that users interact with *remotely over a network*.
   Here SearXNG is unmodified, bound to loopback, and used only by the same person on the same computer, so §13 is
   unlikely to bite. That changes if it is ever exposed beyond 127.0.0.1 or patched.
4. **Combined work.** The app talks to SearXNG over HTTP as a separate program and doesn't link it. That is the
   usual "aggregate / separate programs" arrangement, which normally keeps the app's own (MIT) license separate.
   It should stay that way: no importing SearXNG code into the app.
5. **Notices.** Even if not strictly required, the Optional components dialog already names the license
   (AGPL-3.0) and the source URL. Before release, an "Open-source notices" screen should list SearXNG, its license
   and a source link.

## Privacy implications (independent of licensing)

- Turning on web search sends the person's queries to third-party search engines from their own IP address.
  SearXNG doesn't add tracking, but each engine sees the query.
- Several engines (Google, Brave, DuckDuckGo) often block automated queries, which is why Hob queries many at once.
  That's a reliability and terms-of-service consideration for a shipped product.

## Options (for a decision; none implemented)

| Option | Licensing | Effort | Notes |
|---|---|---|---|
| A. Keep as is: opt-in download of unmodified upstream | Lowest exposure while not bundled; needs notices | None | Current state; off by default |
| B. Bundle SearXNG in the installer | Must ship license + Corresponding Source | Low | Not recommended: makes Khaled Chat a conveyor of AGPL code |
| C. Replace with a permissively licensed search client | Removes AGPL question | Medium–high | Needs a provider choice, maybe an API key, and its own privacy review |
| D. Remove web search entirely | None | Low | Loses a feature; web-page reading (`fetch`) would remain, also gated by web access |

**Recommendation:** keep option A (off by default, consent-gated, unmodified upstream, loopback only) until a
licensing review is done. Don't bundle it (B). Decide between A, C and D before a public release.
