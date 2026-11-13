// Khaled Chat: Electron hardening, IPC sender checks, IPC input validation, and no online accounts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { guardIpc, hardenAllWebContents, IpcRefusedError, isAppUrl, isExternalWebUrl, SECURE_WEB_PREFERENCES } from '../src/main/security'
import { fromAppWindow } from '../src/main/ipcGuard'
import { absPath, absPaths, approvalAnswer, attachments, bool, id, int, InvalidIpcInput, optId, plainObject, str } from '../src/main/ipcValidate'
import { accountsOff, ACCOUNTS_DISABLED_MESSAGE } from '../src/main/accountsOff'

const src = (p: string) => readFileSync(join(__dirname, '../src', p), 'utf8')
const INDEX = 'file:///C:/Program%20Files/Khaled/resources/app.asar/out/renderer/index.html'
const abs = process.platform === 'win32' ? 'C:\\Users\\me\\a.txt' : '/home/me/a.txt'

describe('window settings', () => {
  it('runs the app page sandboxed, isolated, with no Node and no <webview>', () => {
    expect(SECURE_WEB_PREFERENCES).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, webviewTag: false, webSecurity: true, allowRunningInsecureContent: false })
  })
  it('the app window uses them, and nothing turns the sandbox off', () => {
    const index = src('main/index.ts')
    expect(index).toMatch(/preload\/index\.cjs'\), \.\.\.SECURE_WEB_PREFERENCES/)
    expect(index).not.toMatch(/sandbox:\s*false/)
    expect(index).not.toMatch(/contextIsolation:\s*false/)
    expect(index).not.toMatch(/nodeIntegration:\s*true/)
    expect(index).toContain('hardenAllWebContents(app)')
  })
  it('the preload needs nothing a sandboxed preload lacks (only the electron module)', () => {
    const requires = [...src('preload/index.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1]).filter((m) => !m.startsWith('../shared'))
    expect(requires).toEqual(['electron'])
  })
  it('every web contents refuses new windows and <webview>', () => {
    let created: ((e: unknown, wc: unknown) => void) | undefined
    hardenAllWebContents({ on: (_ev, cb) => { created = cb as typeof created } })
    const handlers: Record<string, (e: { preventDefault(): void }) => void> = {}
    let opener: (() => { action: string }) | undefined
    created!({}, { on: (ev: string, cb: (e: { preventDefault(): void }) => void) => { handlers[ev] = cb }, setWindowOpenHandler: (h: () => { action: string }) => { opener = h } })
    const prevent = vi.fn()
    handlers['will-attach-webview']({ preventDefault: prevent })
    expect(prevent).toHaveBeenCalled()
    expect(opener!().action).toBe('deny')
  })
})

describe('navigation: only the app page', () => {
  it('accepts the bundled index.html, with a route', () => {
    expect(isAppUrl(INDEX, INDEX)).toBe(true)
    expect(isAppUrl(`${INDEX}#/settings`, INDEX)).toBe(true)
  })
  it('refuses other files, web pages and odd schemes', () => {
    for (const u of ['file:///C:/Users/me/Downloads/evil.html', 'file:///C:/Users/me/sales.csv', 'https://example.com/', 'about:blank', 'data:text/html,hi', 'javascript:alert(1)', 'hob-file://f/x', 'not a url', ''])
      expect(isAppUrl(u, INDEX), u).toBe(false)
  })
  it('in development, only the dev server origin (not a look-alike port or host)', () => {
    const dev = 'http://localhost:5173'
    expect(isAppUrl('http://localhost:5173/#/x', INDEX, dev)).toBe(true)
    expect(isAppUrl('http://localhost:51730/', INDEX, dev)).toBe(false)
    expect(isAppUrl('http://localhost:5173.evil.com/', INDEX, dev)).toBe(false)
    expect(isAppUrl(INDEX, INDEX, dev)).toBe(false)
  })
  it('hands only http(s) links to the browser', () => {
    expect(isExternalWebUrl('https://example.com/a')).toBe(true)
    expect(isExternalWebUrl('http://example.com')).toBe(true)
    for (const u of ['file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'ms-settings:privacy', 'smb://host/share', 'mailto:a@b.c', 'x'])
      expect(isExternalWebUrl(u), u).toBe(false)
  })
})

describe('IPC sender checks', () => {
  const webContents = {}
  const win = { webContents }
  const own = (u: string) => isAppUrl(u, INDEX)
  it('accepts only the app window, top frame, app page', () => {
    expect(fromAppWindow({ sender: webContents, senderFrame: { url: INDEX } }, win, undefined, own)).toBe(true)
    expect(fromAppWindow({ sender: {}, senderFrame: { url: INDEX } }, win, undefined, own)).toBe(false)
    expect(fromAppWindow({ sender: webContents, senderFrame: { url: 'file:///C:/other.html' } }, win, undefined, own)).toBe(false)
    expect(fromAppWindow({ sender: webContents, senderFrame: { url: INDEX, parent: {} } }, win, undefined, own)).toBe(false)
    expect(fromAppWindow({ sender: webContents, senderFrame: null }, win, undefined, own)).toBe(false)
  })
  it('guardIpc refuses every channel for an untrusted sender and runs nothing', async () => {
    const registered: Record<string, (e: unknown, ...a: unknown[]) => unknown> = {}
    const guarded = guardIpc({ handle: (ch: string, fn: never) => { registered[ch] = fn } } as never, (e) => (e as unknown as { ok: boolean }).ok)
    const fn = vi.fn(() => 'done')
    guarded.handle('models:remove', fn)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => registered['models:remove']({ ok: false, senderFrame: { url: 'https://evil' } }, 'x')).toThrow(IpcRefusedError)
    expect(fn).not.toHaveBeenCalled()
    expect(registered['models:remove']({ ok: true }, 'x')).toBe('done')
    expect(fn).toHaveBeenCalledWith({ ok: true }, 'x')
    warn.mockRestore()
  })
  it('every handler in ipc.ts goes through the guard', () => {
    const ipc = src('main/ipc.ts')
    expect(ipc).toContain('const ipcMain = guardIpc(electronIpcMain, fromApp)')
    expect(ipc).not.toMatch(/electronIpcMain\.(handle|on)\(/)
    expect(ipc).not.toMatch(/import \{[^}]*\bipcMain\b(?! as)/)
    // no other module registers IPC handlers
    for (const f of ['main/index.ts', 'main/setup.ts', 'main/components.ts', 'main/plugins/registry.ts']) expect(src(f)).not.toMatch(/ipcMain\.(handle|on)\(/)
  })
})

describe('IPC input validation', () => {
  const bad = (f: () => unknown) => expect(f).toThrow(InvalidIpcInput)
  it('strings and ids', () => {
    expect(str('hi', 'x')).toBe('hi')
    bad(() => str(1, 'x')); bad(() => str('x'.repeat(11), 'x', 10)); bad(() => str({ toString: () => 'x' }, 'x'))
    expect(id('qwen3-1.7b')).toBe('qwen3-1.7b')
    expect(id('3f0e8a5c-1b2d-4c1a-9e6f-0a1b2c3d4e5f')).toBe('3f0e8a5c-1b2d-4c1a-9e6f-0a1b2c3d4e5f')
    for (const v of ['', '../../etc', 'a/b', 'a\\b', 'a b', 'a\0b', 7, null, ['x'], 'x'.repeat(201)]) bad(() => id(v))
    expect(optId(undefined)).toBeUndefined(); expect(optId(null)).toBeUndefined(); expect(optId('')).toBeUndefined()
  })
  it('numbers, booleans, objects, answers', () => {
    expect(int(3, 'n')).toBe(3); bad(() => int(-1, 'n')); bad(() => int(1.5, 'n')); bad(() => int('3', 'n')); bad(() => int(NaN, 'n'))
    expect(bool(true, 'b')).toBe(true); bad(() => bool('true', 'b'))
    expect(plainObject({ a: 1 }, 'o')).toEqual({ a: 1 }); bad(() => plainObject([], 'o')); bad(() => plainObject(null, 'o'))
    expect(approvalAnswer('allow')).toBe('allow'); bad(() => approvalAnswer('yes')); bad(() => approvalAnswer(undefined))
  })
  it('paths must be absolute, without NUL', () => {
    expect(absPath(abs)).toBe(abs)
    for (const v of ['a.txt', '../x', '', `${abs}\0.png`, 5, null]) bad(() => absPath(v))
    expect(absPaths([abs, '', null])).toEqual([abs])
    bad(() => absPaths('x')); bad(() => absPaths([abs, 'relative'])); bad(() => absPaths(new Array(1001).fill(abs)))
  })
  it('attachments: names and absolute paths', () => {
    expect(attachments(undefined)).toEqual([])
    expect(attachments([{ name: 'a.txt', path: abs, sizeBytes: 1 }])[0]).toMatchObject({ name: 'a.txt', path: abs })
    bad(() => attachments([{ name: 'a', path: 'rel' }])); bad(() => attachments('x')); bad(() => attachments([1]))
  })
  it('privileged handlers check their arguments', () => {
    const ipc = src('main/ipc.ts')
    const checks: [string, RegExp][] = [
      ['files:add', /absPaths\(rawPaths\)/], ['files:open', /absPath\(raw\)/], ['files:show', /absPath\(raw\)/],
      ['models:use', /useModel\(idIn\(id, 'model id'\)\)/], ['models:remove', /deleteModel\(idIn\(id, 'model id'\)\)/],
      ['setup:confirm', /confirm\(optId\(modelId, 'model id'\)\)/], ['plugins:addFile', /addPlugin\(absPath\(path\), true\)/],
      ['plugins:connectApp', /plainObject\(raw, 'app'\)/], ['approval:answer', /approvalAnswer\(rawAnswer\)/],
      ['chat:send', /attachmentsIn\(rawAttachments\)/], ['settings:set', /plainObject\(rawPatch, 'settings'\)/],
      ['task:undo', /int\(rawMessage, 'message id'\)/],
    ]
    for (const [ch, re] of checks) expect(ipc, ch).toMatch(re)
  })
  it('running a program (connect app) and removing the app are confirmed by the main process', () => {
    const ipc = src('main/ipc.ts')
    const connect = ipc.slice(ipc.indexOf("'plugins:connectApp'"), ipc.indexOf('d.plugins.connectApp('))
    expect(connect).toContain('dialog.showMessageBox')
    const remove = ipc.slice(ipc.indexOf("'storage:removeHob'"), ipc.indexOf('await d.removeHob()'))
    expect(remove).toContain('dialog.showMessageBox')
  })
})

describe('no online accounts', () => {
  it('offers nothing, has no account, refuses to sign in', async () => {
    const a = accountsOff()
    expect(a.available()).toEqual([])
    expect(a.current()).toBeUndefined()
    expect(a.calMail()).toBeUndefined()
    await expect(a.signIn('google')).rejects.toThrow(ACCOUNTS_DISABLED_MESSAGE)
    await expect(a.signIn('microsoft')).rejects.toThrow(ACCOUNTS_DISABLED_MESSAGE)
  })
  it('the app uses it in every mode and never builds the real Accounts', () => {
    const index = src('main/index.ts')
    expect(index).toContain('const accounts = accountsOff()')
    expect(index).not.toMatch(/new Accounts\(/)
    expect(src('main/ipc.ts')).toMatch(/'accounts:signIn', async \([^)]*\) => \{ throw new Error\(ACCOUNTS_DISABLED_MESSAGE\) \}/)
  })
  it('ships no OAuth client IDs or secrets', () => {
    const p = src('main/accounts/providers.ts')
    expect(p).toMatch(/GOOGLE_CLIENT_ID = ''/)
    expect(p).toMatch(/GOOGLE_CLIENT_SECRET = ''/)
    expect(p).toMatch(/MICROSOFT_CLIENT_ID = ''/)
  })
})
