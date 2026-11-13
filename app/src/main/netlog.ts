import { appendFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import type { Session } from 'electron'

/**
 * Khaled Chat: an opt-in record of every outgoing request, for checking what the app contacts (for example "nothing
 * at start-up"). Set KHALED_NET_LOG to a file path; one line per request: time, layer, method, URL. Off otherwise.
 *
 * Covers the main process's Node networking (fetch, http, https) and everything Chromium sends for the window and
 * Electron's net module (session webRequest). Not covered: separate processes (the engine utility process, Python,
 * llama-server) and raw sockets.
 */
export function installNetLog(file = process.env.KHALED_NET_LOG): ((session: Session) => void) | undefined {
  if (!file) return undefined
  const t0 = Date.now()
  const log = (layer: string, method: string, url: string) => {
    try { appendFileSync(file, `${Date.now() - t0}ms\t${layer}\t${method}\t${url}\n`) } catch { /* never break the app */ }
  }
  const origFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    log('node-fetch', init?.method ?? 'GET', url)
    return origFetch(input, init)
  }) as typeof fetch
  for (const [name, mod] of [['node-http', http], ['node-https', https]] as const) {
    const wrap = (orig: typeof http.request) => ((...args: unknown[]) => {
      const a = args[0]
      const url = typeof a === 'string' ? a : a instanceof URL ? a.href : `${(a as http.RequestOptions)?.protocol ?? ''}//${(a as http.RequestOptions)?.hostname ?? (a as http.RequestOptions)?.host ?? '?'}${(a as http.RequestOptions)?.path ?? ''}`
      log(name, (a as http.RequestOptions)?.method ?? 'GET', url)
      return (orig as (...x: unknown[]) => http.ClientRequest)(...args)
    }) as typeof http.request
    mod.request = wrap(mod.request)
    mod.get = wrap(mod.get) as typeof http.get
  }
  // ES-module named imports of node:http(s) see the wrapped functions too
  syncBuiltinESMExports()
  log('netlog', '-', 'started')
  return (session) => {
    session.webRequest.onBeforeRequest((details, cb) => {
      if (!/^(file|devtools|chrome|chrome-extension|data|blob|hob-file):/i.test(details.url)) log('chromium', details.method, details.url)
      cb({})
    })
  }
}
