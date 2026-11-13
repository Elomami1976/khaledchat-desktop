// Khaled Chat: the real app window is sandboxed and isolated, stays on its own page, and its IPC answers only the
// app's page, with checked arguments. Google/Microsoft sign-in is gone.
import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const main = join(import.meta.dirname, '../out/main/index.js')
const preload = join(import.meta.dirname, '../out/preload/index.cjs')

test('sandbox, isolation, navigation lock, IPC sender and input checks, no accounts', async () => {
  test.setTimeout(120_000)
  const userData = mkdtempSync(join(tmpdir(), 'kc-sec-'))
  const app = await electron.launch({ args: [main], env: { ...process.env, HOB_FAKE: '1', HOB_USER_DATA: userData } })
  const page = await app.firstWindow()
  await expect(page.getByTestId('setup-download')).toBeVisible({ timeout: 60_000 })

  // the window's real settings
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const p = (BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences(): Record<string, unknown> }).getLastWebPreferences()
    return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, webviewTag: p.webviewTag, webSecurity: p.webSecurity }
  })
  expect(prefs).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, webSecurity: true })

  // the page has the bridge, and no Node
  const env = await page.evaluate(() => ({
    bridge: typeof (window as unknown as { hob?: unknown }).hob, require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process, ipc: typeof (window as unknown as { ipcRenderer?: unknown }).ipcRenderer,
  }))
  expect(env).toEqual({ bridge: 'object', require: 'undefined', process: 'undefined', ipc: 'undefined' })

  // no new windows, no leaving the app's page
  const before = page.url()
  expect(await page.evaluate(() => window.open('https://example.com/') === null)).toBe(true)
  await page.evaluate(() => { location.href = 'file:///C:/Windows/win.ini' })
  await page.waitForTimeout(500)
  expect(page.url()).toBe(before)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)

  // bad arguments are refused before anything runs
  const refused = (f: () => Promise<unknown>) => f().then(() => 'ran', (e: Error) => String(e.message))
  type Hob = { models: { use(a: unknown): Promise<unknown>; remove(a: unknown): Promise<unknown> }; files: { open(a: unknown): Promise<unknown>; add(a: unknown, b: unknown): Promise<unknown> }; approval: { answer(a: unknown, b: unknown): Promise<unknown> }; accounts: { get(): Promise<{ available: string[]; current: unknown }>; signIn(p: string): Promise<unknown> }; settings: { set(a: unknown): Promise<unknown> } }
  const msgs = await page.evaluate(async () => {
    const hob = (window as unknown as { hob: Hob }).hob
    const r = (p: Promise<unknown>) => p.then(() => 'ran', (e: Error) => String(e.message))
    return {
      useNumber: await r(hob.models.use(123)),
      removeTraversal: await r(hob.models.remove('../../secrets')),
      openRelative: await r(hob.files.open('win.ini')),
      addNotArray: await r(hob.files.add('x', 'C:\\Windows')),
      answer: await r(hob.approval.answer('a', 'yes-please')),
      settings: await r(hob.settings.set('webAccess')),
    }
  })
  for (const [k, v] of Object.entries(msgs)) expect(v, k).toContain('Invalid input')
  void refused

  // accounts: nothing offered, signing in refused
  const acc = await page.evaluate(async () => {
    const hob = (window as unknown as { hob: Hob }).hob
    const state = await hob.accounts.get()
    const signIn = await hob.accounts.signIn('google').then(() => 'ran', (e: Error) => String(e.message))
    return { state, signIn }
  })
  expect(acc.state).toEqual({ available: [], current: null })
  expect(acc.signIn).toContain('does not use online accounts')

  // IPC from any other web contents (even with the app's own preload) is refused
  const foreign = await app.evaluate(async ({ BrowserWindow }, p) => {
    const w = new BrowserWindow({ show: false, webPreferences: { preload: p, sandbox: true, contextIsolation: true } })
    await w.loadURL('data:text/html,<p>not the app</p>')
    const out = await w.webContents.executeJavaScript(`Promise.all([
      window.hob.settings.get().then(() => 'ran', (e) => String(e.message)),
      window.hob.downloads.approve('model:qwen3-1.7b').then((v) => 'ran:' + v, (e) => String(e.message)),
      window.hob.models.remove('qwen3-1.7b').then(() => 'ran', (e) => String(e.message)),
    ])`)
    w.destroy()
    return out as string[]
  }, preload)
  for (const m of foreign) expect(m).toContain('Refused IPC call')

  // the real page still works
  const s = await page.evaluate(() => (window as unknown as { hob: { settings: { get(): Promise<{ webAccess: boolean }> } } }).hob.settings.get())
  expect(s.webAccess).toBe(false)
  await app.close()
})
