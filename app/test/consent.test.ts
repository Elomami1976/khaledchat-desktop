// Khaled Chat: nothing is downloaded without the person's OK, enforced in the main process.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Catalog } from '@hob/picker'
import bundled from '../../catalog/catalog.json'
import licenses from '../../catalog/licenses.json'
import { componentKey, ConsentRequiredError, DownloadConsent, GRANT_TTL_MS, modelKey, parseKey } from '../src/main/consent'
import { ensureModelFile, fileNameFor, type DownloadDeps } from '../src/main/downloader'
import { SetupController, type SetupDeps } from '../src/main/setup'
import { FakeEngine, fakeDownloadDeps } from '../src/main/fake'
import { saveSettings, loadSettings } from '../src/main/settings'
import { PACKAGES_OFF, PythonRuntime, type RuntimeDeps } from '../src/main/python/runtime'
import { SpeechModel } from '../src/main/speech'
import { VisionInstaller } from '../src/main/vision/install'
import { VISION_MODELS } from '../src/main/vision/catalog'
import { Components } from '../src/main/components'
import { fromAppWindow } from '../src/main/ipcGuard'
import { loadBundledCatalog } from '../src/main/catalog'
import type { SetupState } from '../src/shared/types'

const catalog = bundled as Catalog
const tmp = () => mkdtempSync(join(tmpdir(), 'kc-consent-'))
const m1max = { os: 'darwin' as const, arch: 'arm64', cpuModel: 'Apple M1 Max', totalRamGB: 32, freeDiskGB: 500, gpu: { kind: 'unified' as const, name: 'Apple M1 Max', vramGB: 24 } }
const urlOf = (id: string) => catalog.models.find((m) => m.id === id)!.builds[0].url

/** a download layer that records every file it is asked for */
function recording(over: Partial<DownloadDeps> = {}) {
  const fetched: string[] = []
  const dl = fakeDownloadDeps()
  const deps: DownloadDeps = { ...dl, download: async (u, d, f, p, s) => { fetched.push(f); return dl.download(u, d, f, p, s) }, ...over }
  return { deps, fetched }
}

function setup(consent: DownloadConsent, over: Partial<SetupDeps> = {}) {
  const root = tmp()
  const deps: SetupDeps = {
    engine: new FakeEngine(), modelsDir: root, settingsPath: join(root, 'settings.json'),
    getHardware: async () => m1max, getCatalog: async () => catalog, download: fakeDownloadDeps(), sha256Override: 'FAKE', consent, ...over,
  }
  const c = new SetupController(deps)
  const states: SetupState[] = []
  c.onState((s) => states.push(s))
  return { c, deps, root, states }
}

describe('the consent store', () => {
  it('only knows real downloads: catalog models and the four optional components', () => {
    expect(parseKey('model:gemma-4-e4b')).toEqual({ kind: 'model', id: 'gemma-4-e4b' })
    expect(parseKey('component:vision')).toEqual({ kind: 'component', id: 'vision' })
    for (const bad of ['component:python-packages', 'component:anything', 'model:../x', 'model:', 'update:1', 42, undefined]) expect(parseKey(bad)).toBeUndefined()
    expect(() => new DownloadConsent().grant('component:python-packages')).toThrow()
  })
  it('an OK is single-use: the download that uses it gives it back, however it ends', async () => {
    const c = new DownloadConsent()
    c.grant(modelKey('a'))
    await c.use(modelKey('a'), async () => { expect(c.has(modelKey('a'))).toBe(true) })
    expect(c.has(modelKey('a'))).toBe(false)
    c.grant(modelKey('a'))
    await expect(c.use(modelKey('a'), async () => { throw new Error('network') })).rejects.toThrow('network')
    expect(c.has(modelKey('a'))).toBe(false)
  })
  it('without an OK, use() refuses before the download runs', async () => {
    const run = vi.fn(async () => 'x')
    await expect(new DownloadConsent().use(modelKey('a'), run)).rejects.toBeInstanceOf(ConsentRequiredError)
    expect(run).not.toHaveBeenCalled()
  })
  it('an OK nobody uses lapses', () => {
    let now = 0
    const c = new DownloadConsent(() => now)
    c.grant(componentKey('speech'))
    now = GRANT_TTL_MS - 1
    expect(c.has(componentKey('speech'))).toBe(true)
    now = GRANT_TTL_MS + 1
    expect(c.has(componentKey('speech'))).toBe(false)
  })
  it('lives in memory only: a new store (a restart) has no OKs', () => {
    const before = new DownloadConsent()
    before.grant(modelKey('a'))
    expect(new DownloadConsent().has(modelKey('a'))).toBe(false)
  })
})

describe('model files', () => {
  it('ensureModelFile refuses to fetch without an OK, and never calls the network layer', async () => {
    const { deps, fetched } = recording()
    await expect(ensureModelFile({ url: urlOf('qwen3-1.7b'), sha256: 'FAKE', sizeGB: 1, dir: tmp(), consentKey: modelKey('qwen3-1.7b'), consent: new DownloadConsent() }, deps))
      .rejects.toBeInstanceOf(ConsentRequiredError)
    expect(fetched).toEqual([])
  })
  it('a file already downloaded and verified needs no OK (nothing is fetched)', async () => {
    const dir = tmp()
    const name = fileNameFor(urlOf('qwen3-1.7b'))
    writeFileSync(join(dir, name), 'x'); writeFileSync(join(dir, name + '.ok'), 'FAKE')
    const { deps, fetched } = recording()
    await expect(ensureModelFile({ url: urlOf('qwen3-1.7b'), sha256: 'FAKE', sizeGB: 1, dir, consentKey: modelKey('qwen3-1.7b'), consent: new DownloadConsent() }, deps)).resolves.toContain(name)
    expect(fetched).toEqual([])
  })
})

describe('onboarding and restarts', () => {
  it('start-up never downloads: it stops at the choose screen', async () => {
    const { deps, fetched } = recording()
    const { c, states } = setup(new DownloadConsent(), { download: deps })
    await c.start()
    expect(c.state.phase).toBe('choose')
    expect(states.some((s) => s.phase === 'downloading')).toBe(false)
    expect(fetched).toEqual([])
  })
  it('confirm without an OK (a stray click, a script) downloads nothing and remembers nothing', async () => {
    const { deps, fetched } = recording()
    const { c, deps: sd } = setup(new DownloadConsent(), { download: deps })
    await c.start(); await c.confirm('qwen3-1.7b')
    expect(fetched).toEqual([])
    expect(c.state).toMatchObject({ phase: 'error', message: expect.stringMatching(/confirm/) })
    expect(loadSettings(sd.settingsPath).pendingModelId).toBeUndefined()
  })
  it('with the OK for that model, only that model downloads, and the OK is used up', async () => {
    const consent = new DownloadConsent()
    const { deps, fetched } = recording()
    const { c } = setup(consent, { download: deps })
    await c.start()
    consent.grant(modelKey('gemma-4-e4b'))
    await c.confirm('gemma-4-e4b')
    expect(fetched).toEqual([fileNameFor(urlOf('gemma-4-e4b'))])
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-e4b' } })
    expect(consent.has(modelKey('gemma-4-e4b'))).toBe(false)
  })
  it('an OK for one model does not cover another', async () => {
    const consent = new DownloadConsent()
    const { deps, fetched } = recording()
    const { c } = setup(consent, { download: deps })
    await c.start()
    consent.grant(modelKey('gemma-4-e2b'))
    await c.confirm('gemma-4-e4b')
    expect(fetched).toEqual([])
  })
  it('a saved, interrupted download is offered after a restart, not resumed; it continues only after a new OK', async () => {
    const { deps, fetched } = recording()
    const consent = new DownloadConsent()
    const first = setup(consent, { download: deps })
    saveSettings(first.deps.settingsPath, { pendingModelId: 'gemma-4-e4b' })
    // "restart": a new controller and a new (empty) consent store over the same profile
    const restarted = new DownloadConsent()
    const c = new SetupController({ ...first.deps, consent: restarted })
    await c.start()
    expect(c.state).toMatchObject({ phase: 'choose', resume: { id: 'gemma-4-e4b' } })
    expect(fetched).toEqual([])
    await c.retry() // "Try again" with no OK
    expect(fetched).toEqual([])
    restarted.grant(modelKey('gemma-4-e4b'))
    await c.confirm('gemma-4-e4b')
    expect(fetched).toEqual([fileNameFor(urlOf('gemma-4-e4b'))])
  })
  it('switching models in Settings needs an OK too', async () => {
    const consent = new DownloadConsent()
    const { deps, fetched } = recording()
    const { c } = setup(consent, { download: deps })
    await c.start()
    consent.grant(modelKey('gemma-4-e4b')); await c.confirm('gemma-4-e4b')
    fetched.length = 0
    await c.useModel('gemma-4-e2b')
    expect(fetched).toEqual([])
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-e4b' }, note: expect.stringMatching(/confirm/) })
  })
  it('a cancelled download stops, forgets the pending download and gives the OK back; Try again needs a new OK', async () => {
    const consent = new DownloadConsent()
    let fetchCalls = 0
    const slow: DownloadDeps = {
      ...fakeDownloadDeps(),
      download: (_u, _d, _f, _p, signal) => { fetchCalls++; return new Promise((_r, reject) => signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) },
    }
    const { c, deps: sd, states } = setup(consent, { download: slow })
    await c.start()
    consent.grant(modelKey('gemma-4-e4b'))
    const running = c.confirm('gemma-4-e4b')
    await vi.waitFor(() => expect(states.some((s) => s.phase === 'downloading')).toBe(true))
    expect(c.cancel()).toBe(true)
    await running
    expect(c.state).toMatchObject({ phase: 'error', message: expect.stringMatching(/stopped/i) })
    expect(loadSettings(sd.settingsPath).pendingModelId).toBeUndefined()
    expect(consent.has(modelKey('gemma-4-e4b'))).toBe(false)
    const calls = fetchCalls
    await c.retry(); await c.confirm('gemma-4-e4b')
    expect(fetchCalls).toBe(calls)
  })
  it('the confirmation shows name, exact size, source, destination and license for a model', async () => {
    const { c, root } = setup(new DownloadConsent())
    await c.start()
    const info = c.downloadInfo('qwen3-1.7b') ?? c.downloadInfo('gemma-4-e4b')!
    expect(info).toMatchObject({ key: expect.stringMatching(/^model:/), sizeEstimated: false, sources: ['huggingface.co'], destination: root, license: 'Apache-2.0' })
    expect(info.sizeGB).toBeGreaterThan(0)
    expect(c.downloadInfo('not-a-model')).toBeUndefined()
  })
})

describe('optional components', () => {
  const runtimeDeps = () => {
    const calls: string[] = []
    const deps: RuntimeDeps = {
      fetchFile: vi.fn(async (url: string, _s: string, _g: number, dir: string, _p: (f: number) => void, name = 'python.tar.gz') => { calls.push(url); const p = join(dir, name); writeFileSync(p, ''); return p }),
      exec: vi.fn(async () => {}),
    }
    return { deps, calls }
  }

  it('code tools (Python) are not installed on first use without an OK; nothing is fetched or run', async () => {
    const { deps, calls } = runtimeDeps()
    const py = new PythonRuntime(tmp(), deps, 'linux-x64', new DownloadConsent())
    await expect(py.ensure()).rejects.toBeInstanceOf(ConsentRequiredError)
    await expect(py.ensure()).rejects.toThrow(/Settings → Optional components/)
    expect(calls).toEqual([])
    expect(deps.exec).not.toHaveBeenCalled()
  })
  it('with an OK, code tools install once and the OK is used up', async () => {
    const { deps, calls } = runtimeDeps()
    const consent = new DownloadConsent()
    const py = new PythonRuntime(tmp(), deps, 'linux-x64', consent)
    consent.grant(componentKey('python'))
    await py.ensure()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/python-build-standalone/)
    expect(consent.has(componentKey('python'))).toBe(false)
  })
  it('installing a code-tools download can be cancelled', async () => {
    const consent = new DownloadConsent()
    const deps: RuntimeDeps = {
      fetchFile: (_u, _s, _g, _d, _p, _n, signal) => new Promise((_r, reject) => signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
      exec: vi.fn(async () => {}),
    }
    const py = new PythonRuntime(tmp(), deps, 'linux-x64', consent)
    consent.grant(componentKey('python'))
    const running = py.ensure()
    await new Promise((r) => setTimeout(r, 10))
    expect(py.cancel()).toBe(true)
    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    expect(py.isReady()).toBe(false)
    expect(consent.has(componentKey('python'))).toBe(false)
  })
  it('web search (SearXNG) is not installed without its own OK', async () => {
    const { deps, calls } = runtimeDeps()
    const consent = new DownloadConsent()
    const py = new PythonRuntime(tmp(), deps, 'linux-x64', consent)
    consent.grant(componentKey('python'))
    await expect(py.ensureSearxng()).rejects.toThrow(/Web search isn't installed/)
    expect(calls).toEqual([])
  })
  it('the agent can no longer install PyPI packages (no consent flow for them yet)', async () => {
    const { deps, calls } = runtimeDeps()
    const py = new PythonRuntime(tmp(), deps, 'linux-x64', new DownloadConsent())
    await expect(py.installPackages(['yfinance'])).resolves.toEqual({ ok: false, error: PACKAGES_OFF })
    expect(calls).toEqual([])
    expect(deps.exec).not.toHaveBeenCalled()
  })
  it('dictation (Whisper) is not downloaded without an OK', async () => {
    const { deps, calls } = runtimeDeps()
    await expect(new SpeechModel(tmp(), deps, new DownloadConsent()).ensure()).rejects.toBeInstanceOf(ConsentRequiredError)
    expect(calls).toEqual([])
  })
  it('image support (vision model and server) is not downloaded without an OK, model files included', async () => {
    const { deps: rd, calls } = runtimeDeps()
    const { deps: dl, fetched } = recording()
    const v = new VisionInstaller(tmp(), { platformKey: 'linux-x64', choose: async () => VISION_MODELS['2b'], download: dl, fetchFile: rd.fetchFile, exec: rd.exec, sha256Override: 'FAKE', consent: new DownloadConsent() })
    await expect(v.ensure()).rejects.toBeInstanceOf(ConsentRequiredError)
    expect(fetched).toEqual([])
    expect(calls).toEqual([])
  })
  it('with an OK, image support downloads both servers at once, so a graphics fallback later needs no download', async () => {
    const { deps: rd, calls } = runtimeDeps()
    const { deps: dl, fetched } = recording()
    const consent = new DownloadConsent()
    const root = tmp()
    // the fake unpack makes the server binary appear where the installer looks for it
    const exec = vi.fn(async (_cmd: string, args: string[]) => { const dir = args[args.indexOf('-C') + 1]; writeFileSync(join(dir, 'llama-server'), '') })
    const v = new VisionInstaller(root, { platformKey: 'linux-x64', choose: async () => VISION_MODELS['2b'], download: dl, fetchFile: rd.fetchFile, exec, sha256Override: 'FAKE', consent })
    consent.grant(componentKey('vision'))
    await v.ensure()
    expect(fetched).toHaveLength(2)
    expect(calls).toHaveLength(2)
    expect(consent.has(componentKey('vision'))).toBe(false)
    calls.length = 0
    await expect(v.cpuServerBinary()).resolves.toMatch(/llama-server$/)
    expect(calls).toEqual([])
  })
  it('the components list and its confirmations: sizes (or labelled estimates), sources, destinations, licenses', async () => {
    const { deps } = runtimeDeps()
    const root = tmp()
    const py = new PythonRuntime(root, deps, 'linux-x64', new DownloadConsent())
    const speech = new SpeechModel(join(root, 'speech'), deps, new DownloadConsent())
    const c = new Components({
      python: { supported: true, isReady: () => py.isReady(), ensure: () => py.ensure(), cancel: () => py.cancel(), root, platformKey: 'linux-x64' },
      search: { supported: true, isReady: () => py.searchReady, ensure: () => py.ensureSearxng(), cancel: () => py.cancel() },
      speech: { supported: true, isReady: () => speech.isReady(), ensure: () => speech.ensure(), cancel: () => speech.cancel(), root: join(root, 'speech') },
      onChange: () => {},
    })
    expect(c.list().map((x) => [x.id, x.installed, x.available])).toEqual([['python', false, true], ['search', false, false], ['speech', false, true], ['vision', false, false]])
    const python = await c.info('python')
    expect(python).toMatchObject({ sizeEstimated: true, sources: expect.arrayContaining(['github.com', 'pypi.org']), destination: root, license: expect.stringMatching(/PSF/) })
    expect(await c.info('search')).toMatchObject({ license: expect.stringMatching(/AGPL-3.0/), sizeEstimated: true })
    expect(await c.info('speech')).toMatchObject({ sizeEstimated: false, sources: ['huggingface.co'], parts: expect.any(Array) })
    // installing without an OK ends in an error, nothing downloaded
    c.install('python')
    await vi.waitFor(() => expect(c.list()[0]).toMatchObject({ installing: false, installed: false, error: expect.stringMatching(/never downloads/) }))
  })
})

describe('network at start-up', () => {
  it('the model list is the bundled one; loading it makes no request', () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(loadBundledCatalog(bundled, licenses).models.length).toBeGreaterThan(0)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it('start-up code wires no remote catalog, updater or background installs', () => {
    const index = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')
    expect(index).not.toMatch(/CATALOG_URL|loadCatalog\(|raw\.githubusercontent/)
    expect(index).not.toMatch(/startUpdates|electron-updater/)
    // Khaled Chat's background installs once chat worked: image support, dictation, code tools and web search
    expect(index).not.toMatch(/=> \{ if \([^)]*\) vision\.start\(\) \}|fetchingSpeech|void python\.ensure\(\)|ensureSearxng\(\)\.catch/)
  })
  it('web access is off unless switched on', async () => {
    const { webAccessOn } = await import('../src/main/settings')
    expect(webAccessOn({})).toBe(false)
  })
})

describe('who can OK a download', () => {
  const webContents = {}
  const win = { webContents }
  it('only the app window\'s own page', () => {
    expect(fromAppWindow({ sender: webContents, senderFrame: { url: 'file:///C:/app/out/renderer/index.html' } }, win)).toBe(true)
    expect(fromAppWindow({ sender: webContents, senderFrame: { url: 'http://localhost:5173/' } }, win, 'http://localhost:5173')).toBe(true)
    expect(fromAppWindow({ sender: {}, senderFrame: { url: 'file:///x' } }, win)).toBe(false)
    expect(fromAppWindow({ sender: webContents, senderFrame: { url: 'https://evil.example/' } }, win)).toBe(false)
    expect(fromAppWindow({ sender: webContents, senderFrame: null }, win)).toBe(false)
    expect(fromAppWindow({ sender: webContents }, undefined)).toBe(false)
  })
})
