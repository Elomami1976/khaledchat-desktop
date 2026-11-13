/**
 * Khaled Chat: Electron hardening shared by the app window and its IPC.
 *
 * - SECURE_WEB_PREFERENCES: the app window runs sandboxed, with context isolation, no Node in the page, no
 *   <webview>, and web security on. The preload only uses what a sandboxed preload may (contextBridge,
 *   ipcRenderer, webUtils, process.platform/env).
 * - isAppUrl: the one rule for "this is the app's own page" (navigation and IPC sender checks).
 * - hardenAllWebContents: every web contents the app ever creates refuses new windows and <webview>s.
 * - guardIpc: every IPC handler answers only the app window's own page.
 */
import type { IpcMain, IpcMainInvokeEvent, WebContents, WebPreferences } from 'electron'

export const SECURE_WEB_PREFERENCES = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webviewTag: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  navigateOnDragDrop: false,
} as const satisfies WebPreferences

/**
 * Is this URL the app's own page? Shipped builds: exactly the bundled index.html (any #route or ?query).
 * Development: the dev server's origin. Anything else (another file://, a web page, about:blank, data:) is not.
 */
export function isAppUrl(url: string, indexFileUrl: string, devUrl?: string): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (devUrl) {
    try { return u.origin === new URL(devUrl).origin && u.origin !== 'null' } catch { return false }
  }
  let own: URL
  try { own = new URL(indexFileUrl) } catch { return false }
  return u.protocol === 'file:' && own.protocol === 'file:' && decodeURIComponent(u.pathname).toLowerCase() === decodeURIComponent(own.pathname).toLowerCase() && u.host === own.host
}

/** Links that may be handed to the system browser: http and https only (never file:, javascript:, custom schemes). */
export function isExternalWebUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

type AppLike = { on(event: 'web-contents-created', cb: (e: unknown, wc: WebContents) => void): unknown }
/** No web contents in the app may open a new window or attach a <webview>. Registered once, at start-up. */
export function hardenAllWebContents(app: AppLike) {
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (ev) => ev.preventDefault())
    // the app window replaces this with its own handler (links go to the browser); all others just refuse
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
}

export class IpcRefusedError extends Error {
  constructor(channel: string) { super(`Refused IPC call "${channel}": not from the app window.`); this.name = 'IpcRefusedError' }
}

type Handler = (e: IpcMainInvokeEvent, ...args: any[]) => unknown // eslint-disable-line @typescript-eslint/no-explicit-any
/** ipcMain whose handlers run only for requests from the app window's own page; others are refused (and logged). */
export function guardIpc(ipc: Pick<IpcMain, 'handle'>, trusted: (e: IpcMainInvokeEvent) => boolean): Pick<IpcMain, 'handle'> {
  return {
    handle(channel: string, fn: Handler) {
      ipc.handle(channel, (e, ...args) => {
        if (!trusted(e)) {
          console.warn(`[security] refused IPC "${channel}" from ${e.senderFrame?.url ?? 'unknown frame'}`)
          throw new IpcRefusedError(channel)
        }
        return fn(e, ...args)
      })
    },
  }
}
