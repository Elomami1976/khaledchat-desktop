import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '@hob/picker'
import bundled from '../../catalog/catalog.json'
import { computerName, SetupController, type SetupDeps } from '../src/main/setup'
import { FakeEngine, fakeDownloadDeps } from '../src/main/fake'
import { fileNameFor } from '../src/main/downloader'
import { saveSettings } from '../src/main/settings'
import type { SetupState } from '../src/shared/types'
import { DownloadConsent } from '../src/main/consent'

const catalog = bundled as Catalog
const m1max = { os: 'darwin' as const, arch: 'arm64', cpuModel: 'Apple M1 Max', totalRamGB: 32, freeDiskGB: 500, gpu: { kind: 'unified' as const, name: 'Apple M1 Max', vramGB: 24 } }

/**
 * Khaled Chat: these tests are about what happens once the person has confirmed a download, so their consent store
 * says yes to every model. consent.test.ts covers downloads without an OK (refused, nothing fetched).
 */
class ConfirmedConsent extends DownloadConsent { override has() { return true } override assert() {} }

function setup(over: Partial<SetupDeps> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hob-setup-'))
  const engine = new FakeEngine()
  const deps: SetupDeps = {
    engine, modelsDir: root, settingsPath: join(root, 'settings.json'),
    getHardware: async () => m1max, getCatalog: async () => catalog,
    download: fakeDownloadDeps(), sha256Override: 'FAKE', consent: new ConfirmedConsent(),
  }
  // keeps getters (a models folder that moves) as getters
  Object.defineProperties(deps, Object.getOwnPropertyDescriptors(over))
  const c = new SetupController(deps)
  const states: SetupState[] = []
  c.onState((s) => states.push(s))
  return { c, engine, deps, states, root }
}

/** a model already downloaded and verified (fake hash), as if from an earlier, confirmed download */
function have(root: string, id: string) {
  const url = catalog.models.find((m) => m.id === id)!.builds[0].url
  writeFileSync(join(root, fileNameFor(url)), 'x'); writeFileSync(join(root, fileNameFor(url) + '.ok'), 'FAKE')
}

describe('SetupController', () => {
  it('keeps the small starter model loaded next to the big one for side jobs, only with memory to spare', async () => {
    const big = setup({ getHardware: async () => ({ ...m1max, totalRamGB: 64, gpu: { kind: 'unified' as const, name: 'Apple M1 Max', vramGB: 48 } }) })
    // Khaled Chat: the starter is never fetched alongside; here it's already downloaded
    await big.c.start(); have(big.root, 'gemma-4-e4b'); await big.c.confirm()
    const { vi } = await import('vitest')
    await vi.waitFor(() => expect(big.engine.side).toMatch(/E4B/i))
    // 32 GB: a second model next to the big one slowed the first reply (~1 s → ~5 s on gpt-oss-20b, M1 Max)
    const mid = setup()
    await mid.c.start(); await mid.c.confirm()
    await new Promise((r) => setTimeout(r, 50))
    expect(mid.engine.side).toBeUndefined()
  })

  it('a pick smaller than the starter is downloaded on its own, without the starter first', async () => {
    const { c, engine, states } = setup()
    await c.start(); await c.confirm('gemma-4-e2b')
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-e2b' } })
    expect(states.some((s) => s.phase === 'downloading' && !!s.starter)).toBe(false)
    expect(engine.loaded).toContain('gemma-4-E2B')
  })

  it('lists models with downloaded/active flags and switches without dropping chat', async () => {
    const { c, engine } = setup()
    await c.start(); await c.confirm()
    const active = c.listModels().find((r) => r.active)!
    expect(active.downloaded).toBe(true)
    const other = c.listModels().find((r) => r.available && !r.active && !r.downloaded)!
    const states: SetupState[] = []
    c.onState((s) => states.push(s))
    await c.useModel(other.id)
    const downloading = states.filter((s) => s.phase === 'downloading')
    expect(downloading.length).toBeGreaterThan(0)
    expect(downloading.every((s) => s.phase === 'downloading' && s.chatReady)).toBe(true)
    expect(downloading).not.toEqual(expect.arrayContaining([expect.objectContaining({ initialUpgrade: true })]))
    expect(c.listModels().find((r) => r.active)?.id).toBe(other.id)
    const url = catalog.models.find((m) => m.id === other.id)!.builds[0].url
    expect(engine.loaded).toContain(fileNameFor(url))
    expect(c.state.phase).toBe('ready')
  })

  it('deletes a downloaded model that is not in use, never the active one', async () => {
    const { c, root } = setup()
    await c.start(); have(root, 'gemma-4-e4b'); await c.confirm()
    const active = c.listModels().find((r) => r.active)!
    expect(c.deleteModel(active.id)).toBe(false)
    const spare = c.listModels().find((r) => r.downloaded && !r.active)! // downloaded earlier
    expect(c.deleteModel(spare.id)).toBe(true)
    expect(c.listModels().find((r) => r.id === spare.id)?.downloaded).toBe(false)
  })
  it('keeps the user settings when a model finishes loading', async () => {
    const { c, deps } = setup()
    saveSettings(deps.settingsPath, { webAccess: true, filesDir: '/somewhere' })
    await c.start(); await c.confirm()
    const saved = JSON.parse(readFileSync(deps.settingsPath, 'utf8'))
    expect(saved).toMatchObject({ webAccess: true, filesDir: '/somewhere', activeModelId: expect.any(String) })
    expect(saved.pendingModelId).toBeUndefined()
  })
  it('start-up knows whether this is the first launch (no model set up yet)', async () => {
    const { c, deps } = setup()
    expect(c.state).toEqual({ phase: 'probing', firstRun: true })
    await c.start(); await c.confirm()
    const again = new SetupController(deps)
    expect(again.state).toEqual({ phase: 'probing', firstRun: false })
  })
  it('a model download from Settings can be cancelled: chat stays on the current model, nothing is flagged as failed', async () => {
    const { c, engine, deps } = setup({ download: fakeDownloadDeps({ stepMs: 200 }) })
    await c.start(); await c.confirm()
    const before = (c.state as { model: { id: string } }).model.id
    const other = c.listModels().find((m) => m.available && !m.downloaded && !m.active)!
    const going = c.useModel(other.id)
    await new Promise((r) => setTimeout(r, 250))
    expect(c.state.phase).toBe('downloading')
    expect(c.cancel()).toBe(true)
    await going
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: before } })
    expect(c.state).not.toHaveProperty('note')
    expect(JSON.parse(readFileSync(deps.settingsPath, 'utf8')).pendingModelId).toBeUndefined()
    expect(c.cancel()).toBe(false)
  })
  it('start → choose with recommendation', async () => {
    const { c } = setup()
    await c.start()
    expect(c.state).toMatchObject({ phase: 'choose', recommended: { id: 'gemma-4-26b-a4b' }, liteMode: false, needsDiskGB: 0 })
  })
  it('choose says what computer it picked for and that a small model comes first', async () => {
    const { c } = setup()
    await c.start()
    expect(c.state).toMatchObject({ phase: 'choose', computer: 'Apple M1 Max · 32 GB memory', starter: { id: 'gemma-4-e4b' } })
    expect(computerName({ ...m1max, os: 'win32', cpuModel: 'Intel i7', totalRamGB: 31.9, gpu: { kind: 'discrete', name: 'NVIDIA GeForce RTX 4070', vramGB: 12 } })).toBe('NVIDIA GeForce RTX 4070 (12 GB) · 32 GB memory')
    expect(computerName({ ...m1max, cpuModel: 'Intel(R) Core(TM) i5-8250U CPU @ 1.60GHz', gpu: { kind: 'none', name: '', vramGB: 0 }, totalRamGB: 16 })).toBe('Intel Core i5-8250U · 16 GB memory')
  })
  // Khaled Chat: Hob fetched a small starter model first, unasked; only the confirmed model is downloaded now
  it('the first download is only the model that was confirmed, no starter model first', async () => {
    let fetched: string[] = []
    const dl = fakeDownloadDeps()
    const { c, states } = setup({ download: { ...dl, download: async (u, d, f, p, s) => { fetched.push(f); return dl.download(u, d, f, p, s) } } })
    await c.start(); await c.confirm()
    expect(states.some((s) => s.phase === 'downloading' && !!s.starter)).toBe(false)
    expect(fetched).toEqual([fileNameFor(catalog.models.find((m) => m.id === 'gemma-4-26b-a4b')!.builds[0].url)])
    fetched = []
  })
  it('choosing a model manually after choosing the starter is not the initial upgrade', async () => {
    const { c, states } = setup()
    await c.start(); await c.confirm('gemma-4-e4b')
    states.length = 0
    await c.useModel('gpt-oss-20b')
    const downloading = states.filter((s) => s.phase === 'downloading')
    expect(downloading.length).toBeGreaterThan(0)
    expect(downloading).not.toEqual(expect.arrayContaining([expect.objectContaining({ initialUpgrade: true })]))
  })
  // Khaled Chat: a saved, interrupted download never resumes on its own after a restart
  it.each([undefined, 'gemma-4-e4b'])('a saved, interrupted download does not resume on relaunch (active model: %s)', async (activeModelId) => {
    const { deps, root } = setup()
    if (activeModelId) have(root, activeModelId)
    saveSettings(deps.settingsPath, { activeModelId, pendingModelId: 'gemma-4-26b-a4b' })
    const c = new SetupController(deps)
    const states: SetupState[] = []
    c.onState((s) => states.push(s))
    await c.start()
    expect(states.some((s) => s.phase === 'downloading')).toBe(false)
    if (activeModelId) expect(c.state).toMatchObject({ phase: 'ready', model: { id: activeModelId } })
    else expect(c.state).toMatchObject({ phase: 'choose', resume: { id: 'gemma-4-26b-a4b' } })
  })
  it('choose lists the catalog models: runnable ones selectable, others greyed with a reason', async () => {
    const { c } = setup()
    await c.start()
    const s = c.state as Extract<SetupState, { phase: 'choose' }>
    // on this 32 GB Mac the tiny last-resort model and the squeezed builds aren't offered: better ones run
    expect(s.models.map((m) => m.id)).not.toContain('qwen3-1.7b')
    expect(s.models.map((m) => m.id)).not.toContain('gemma-4-26b-a4b-compact')
    expect(s.models.map((m) => m.id)).not.toContain('gemma-4-e4b-compact')
    expect(s.models).toHaveLength(catalog.models.length - 3)
    expect(s.models.find((m) => m.id === 'gemma-4-26b-a4b')).toMatchObject({ available: true, recommended: true })
    expect(s.models.find((m) => m.id === 'gpt-oss-120b')).toMatchObject({ available: false, reason: 'memory' })
    expect(s.models.every((m) => m.description.length > 0)).toBe(true)
  })
  it('confirm with an unavailable model is ignored', async () => {
    const { c } = setup()
    await c.start(); await c.confirm('gpt-oss-120b')
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-26b-a4b' } })
  })
  it('confirm → the chosen model downloads, then → ready (no starter first)', async () => {
    const { c, engine, states } = setup()
    await c.start(); await c.confirm()
    expect(states.some((s) => s.phase === 'downloading' && !s.chatReady)).toBe(true)
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-26b-a4b' } })
    expect(engine.loaded).toContain('gemma-4-26B_q4_0')
  })
  it('first-run starter download reports progress (bar must not sit at 0%)', async () => {
    const { c, states } = setup()
    await c.start(); await c.confirm()
    const beforeChat = states.filter((s) => s.phase === 'downloading' && !s.chatReady) as { progress: number }[]
    expect(beforeChat.some((s) => s.progress > 0 && s.progress < 1)).toBe(true)
  })
  it('starter fails to load → skip it and still install the main model', async () => {
    const { c, engine } = setup()
    engine.failLoadFor.add('gemma-4-E4B')
    await c.start(); await c.confirm()
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-26b-a4b' } })
  })
  it('quit mid-download → relaunch keeps chatting on the model in use; the download waits for a new OK', async () => {
    const { deps, root } = setup()
    have(root, 'gemma-4-e4b')
    saveSettings(deps.settingsPath, { activeModelId: 'gemma-4-e4b', pendingModelId: 'gemma-4-26b-a4b' })
    const c = new SetupController(deps)
    const states: SetupState[] = []
    c.onState((s) => states.push(s))
    await c.start()
    expect(states.some((s) => s.phase === 'downloading')).toBe(false)
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-e4b' } })
  })
  it('first run remembers the download in progress, so a relaunch can offer to resume it', async () => {
    const { c, deps } = setup()
    let seen: unknown
    c.onState((s) => { if (s.phase === 'downloading' && !seen) seen = JSON.parse(readFileSync(deps.settingsPath, 'utf8')) })
    await c.start(); await c.confirm()
    expect(seen).toMatchObject({ pendingModelId: 'gemma-4-26b-a4b' })
    expect(JSON.parse(readFileSync(deps.settingsPath, 'utf8')).pendingModelId).toBeUndefined()
  })
  it('relaunch with saved, verified model → straight to ready, no download', async () => {
    const { deps, root } = setup()
    const url = catalog.models.find((m) => m.id === 'gpt-oss-20b')!.builds[0].url
    writeFileSync(join(root, fileNameFor(url)), 'x'); writeFileSync(join(root, fileNameFor(url) + '.ok'), 'FAKE')
    saveSettings(deps.settingsPath, { activeModelId: 'gpt-oss-20b' })
    let downloads = 0
    const c = new SetupController({ ...deps, download: { ...deps.download, download: async () => { downloads++ } } })
    await c.start()
    expect(c.state).toMatchObject({ phase: 'ready' })
    expect(downloads).toBe(0)
  })
  it('a model copied over from another computer is used on first launch, no download', async () => {
    const { deps, root } = setup()
    const url = catalog.models.find((m) => m.id === 'gpt-oss-20b')!.builds[0].url
    writeFileSync(join(root, fileNameFor(url)), 'x'); writeFileSync(join(root, fileNameFor(url) + '.ok'), 'FAKE')
    let downloads = 0
    const c = new SetupController({ ...deps, download: { ...deps.download, download: async () => { downloads++ } } })
    await c.start()
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gpt-oss-20b' } })
    expect(downloads).toBe(0)
  })
  it('not enough disk → choose shows needsDiskGB, confirm → error', async () => {
    const { c } = setup({ getHardware: async () => ({ ...m1max, freeDiskGB: 20 }), download: fakeDownloadDeps({ freeDiskGB: 20 }) })
    await c.start()
    expect(c.state).toMatchObject({ phase: 'choose', needsDiskGB: 4.44 })
    await c.confirm()
    expect(c.state.phase).toBe('error')
    expect((c.state as { message: string }).message).toMatch(/Free up \d+ GB/)
  })
  it('OOM on load → falls back to a smaller model already downloaded, with a note', async () => {
    const { c, engine, root } = setup()
    engine.failLoadFor.add('gemma-4-26B_q4_0')
    await c.start(); have(root, 'gemma-4-e4b'); await c.confirm()
    expect(c.state).toMatchObject({ phase: 'ready', note: 'Ready · lighter model', model: { id: 'gemma-4-e4b' } })
  })
  // Khaled Chat: Hob downloaded a lighter model unasked here
  it('OOM on load with no smaller model downloaded → an error, and no other model is downloaded', async () => {
    const fetched: string[] = []
    const dl = fakeDownloadDeps()
    const { c, engine } = setup({ download: { ...dl, download: async (u, d, f, p, s) => { fetched.push(f); return dl.download(u, d, f, p, s) } } })
    engine.failLoadFor.add('gemma-4-26B_q4_0')
    await c.start(); await c.confirm()
    expect(c.state.phase).toBe('error')
    expect(fetched).toEqual([fileNameFor(catalog.models.find((m) => m.id === 'gemma-4-26b-a4b')!.builds[0].url)])
  })
  it('the main model fails to load for another reason (a graphics driver) → chat on a model already downloaded, nothing new downloaded', async () => {
    const { c, engine, states, root } = setup()
    engine.brokenLoadFor.add('gemma-4-26B_q4_0')
    await c.start(); have(root, 'gemma-4-e4b'); await c.confirm()
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-e4b' }, note: 'Ready · lighter model' })
    expect(states.some((s) => s.phase === 'downloading' && s.note === 'Switching to a lighter model…')).toBe(false)
  })
  it('nothing fits → friendly error', async () => {
    const { c } = setup({ getHardware: async () => ({ ...m1max, totalRamGB: 2, gpu: { kind: 'none', name: '', vramGB: 0 } }) })
    await c.start()
    expect(c.state).toMatchObject({ phase: 'error', message: expect.stringMatching(/needs at least 8 GB/) })
  })
  it('user can pick a different option', async () => {
    const { c } = setup()
    await c.start(); await c.confirm('gpt-oss-20b')
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gpt-oss-20b' } })
  })
})

describe('SetupController review fixes', () => {
  it('I1: not enough disk → error before ANY download (starter included)', async () => {
    let downloads = 0
    const dl = fakeDownloadDeps({ freeDiskGB: 20 })
    const { c } = setup({ getHardware: async () => ({ ...m1max, freeDiskGB: 20 }), download: { ...dl, download: async (...a) => { downloads++; return dl.download(...a) } } })
    await c.start(); await c.confirm()
    expect(c.state).toMatchObject({ phase: 'error', message: expect.stringMatching(/Free up \d+ GB/) })
    expect(downloads).toBe(0)
  })
  it('I1: counts the model against free disk (no starter any more)', async () => {
    // 14.44 + 10 = 24.44 needed; 23 free → must refuse up front
    let downloads = 0
    const dl = fakeDownloadDeps({ freeDiskGB: 23 })
    const { c } = setup({ download: { ...dl, download: async (...a) => { downloads++; return dl.download(...a) } } })
    await c.start(); await c.confirm()
    expect(c.state.phase).toBe('error')
    expect(downloads).toBe(0)
  })
  it('I3: engine crash after ready → model is reloaded automatically', async () => {
    const { c, engine } = setup()
    await c.start(); await c.confirm()
    const loaded = engine.loaded
    engine.crash()
    expect(engine.loaded).toBeUndefined()
    await new Promise((r) => setTimeout(r, 50))
    expect(engine.loaded).toBe(loaded)
    expect(c.state).toMatchObject({ phase: 'ready' })
  })
  // Khaled Chat: a lighter model that would need a download is never fetched as a fallback
  it('I4: lighter-model fallback never starts a download of its own', async () => {
    const { c, engine, states } = setup()
    engine.failLoadFor.add('gemma-4-26B_q4_0')
    await c.start(); await c.confirm()
    expect(states.some((s) => s.phase === 'downloading' && s.note === 'Switching to a lighter model…')).toBe(false)
  })
  it('I5: a saved choice other than the recommended one is reused on relaunch', async () => {
    const m1 = { ...m1max, cpuModel: 'Apple M1', totalRamGB: 16, gpu: { kind: 'unified' as const, name: 'Apple M1', vramGB: 12 } }
    const { c, deps } = setup({ getHardware: async () => m1 })
    await c.start()
    // a pick other than the recommended one, selectable on a base M1
    const models = (c.state as Extract<SetupState, { phase: 'choose' }>).models
    expect(models.find((m) => m.id === 'gemma-4-e2b')).toMatchObject({ available: true })
    await c.confirm('gemma-4-e2b')
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-e2b' } })
    const c2 = new SetupController(deps)
    await c2.start()
    expect(c2.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-e2b' } })
  })
  it('I6: confirm twice → second call ignored (one download per file)', async () => {
    const counts = new Map<string, number>()
    const dl = fakeDownloadDeps()
    const { c } = setup({ download: { ...dl, download: async (u, d, f, p) => { counts.set(f, (counts.get(f) ?? 0) + 1); return dl.download(u, d, f, p) } } })
    await c.start()
    await Promise.all([c.confirm(), c.confirm()])
    expect([...counts.values()].every((n) => n === 1)).toBe(true)
    expect(c.state.phase).toBe('ready')
  })
  it('I9: background download failure while chatting keeps the user in chat with a retry', async () => {
    const dl = fakeDownloadDeps()
    let fail = true
    const { c, states, root, deps } = setup({
      retryDelaysMs: [1, 1],
      download: { ...dl, download: async (u, d, f, p) => { if (f.includes('gemma-4-26B') && fail) throw new Error('fetch failed'); return dl.download(u, d, f, p) } },
    })
    // chatting on a model downloaded earlier, then the person chooses a bigger one
    have(root, 'gemma-4-e4b')
    saveSettings(deps.settingsPath, { activeModelId: 'gemma-4-e4b' })
    await c.start(); await c.useModel('gemma-4-26b-a4b')
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-e4b' }, canRetry: true, note: expect.stringMatching(/connection/i) })
    fail = false
    states.length = 0
    await c.retry()
    expect(states).toContainEqual(expect.objectContaining({ phase: 'downloading', chatReady: true }))
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-26b-a4b' } })
  })
  it('I9: transient download failures are retried with backoff', async () => {
    const dl = fakeDownloadDeps()
    let failures = 2
    const { c } = setup({
      retryDelaysMs: [1, 1],
      download: { ...dl, download: async (u, d, f, p) => { if (f.includes('gemma-4-26B') && failures-- > 0) throw new Error('fetch failed'); return dl.download(u, d, f, p) } },
    })
    await c.start(); await c.confirm()
    expect(c.state).toMatchObject({ phase: 'ready', model: { id: 'gemma-4-26b-a4b' } })
  })
})

describe('SetupController disk re-check', () => {
  it('downloads can go to another drive before the first download, and the space there is what counts', async () => {
    const data = mkdtempSync(join(tmpdir(), 'hob-data-'))
    const drive = mkdtempSync(join(tmpdir(), 'hob-drive-'))
    let dir = data
    const { c } = setup({
      get modelsDir() { return join(dir, 'models') },
      downloads: { dir: () => dir, move: (d) => { dir = join(d, 'Khaled Chat'); mkdirSync(join(dir, 'models'), { recursive: true }) } },
      // C: is nearly full, the other drive has room
      getHardware: async () => ({ ...m1max, freeDiskGB: dir === data ? 5 : 500 }),
    })
    await c.start()
    expect(c.state).toMatchObject({ phase: 'choose', downloadsDir: data, needsDiskGB: expect.any(Number) })
    expect((c.state as { needsDiskGB: number }).needsDiskGB).toBeGreaterThan(0)
    await c.pickDownloads(drive)
    expect(c.state).toMatchObject({ phase: 'choose', downloadsDir: join(drive, 'Khaled Chat'), needsDiskGB: 0 })
    await c.confirm()
    expect(c.state.phase).toBe('ready')
    expect(readdirSync(join(drive, 'Khaled Chat', 'models')).some((f) => f.endsWith('.gguf'))).toBe(true)
    // only before the first download
    await c.pickDownloads(data)
    expect(dir).toBe(join(drive, 'Khaled Chat'))
  })
  it('retry on the choose screen re-checks disk after the user frees space', async () => {
    let free = 20
    const { c } = setup({ getHardware: async () => ({ ...m1max, freeDiskGB: free }) })
    await c.start()
    expect(c.state).toMatchObject({ phase: 'choose', needsDiskGB: 4.44 })
    free = 200
    await c.retry()
    expect(c.state).toMatchObject({ phase: 'choose', needsDiskGB: 0 })
  })
})
