import { PY_BUILDS, PY_PACKAGES, PY_VERSION, pyUrl } from './python/runtime'
import { SEARXNG_URL } from './search/searxng'
import { WHISPER } from './speech'
import { componentKey, type ComponentId } from './consent'
import type { ComponentState, DownloadInfo } from '../shared/types'
import { msg } from '../shared/i18n'

/**
 * Khaled Chat: the optional parts (code tools, web search, dictation, image support). None is installed on its
 * own: each one only after the person confirms its download (Settings → Optional components).
 */
export type Installable = {
  supported: boolean
  /** Khaled Chat: switched off in this version, with the reason shown in Settings (release gate) */
  disabledReason?: string
  isReady(): boolean
  /** downloads it; rejects with ConsentRequiredError without the person's OK */
  ensure(): Promise<unknown>
  cancel(): boolean
}

export type ComponentDeps = {
  python?: Installable & { root: string; platformKey: string }
  search?: Installable
  speech?: Installable & { root: string }
  vision?: Installable & { root: string; plan(): Promise<{ model: { name: string }; files: { name: string; url: string; bytes: number }[] }> }
  onChange(list: ComponentState[]): void
}

const GB = 1e9
const round = (gb: number) => Math.round(gb * 100) / 100
const hostOf = (url: string) => new URL(url).host

export class Components {
  private busy = new Map<ComponentId, { progress?: number }>()
  private errors = new Map<ComponentId, string>()
  constructor(private d: ComponentDeps) {}

  private part(id: ComponentId): Installable | undefined { return this.d[id] }

  list(): ComponentState[] {
    return (['python', 'search', 'speech', 'vision'] as ComponentId[]).map((id) => {
      const p = this.part(id)
      const available = !!p?.supported && !p.disabledReason && (id !== 'search' || !!this.d.python?.isReady())
      const unavailableReason = p?.disabledReason ? p.disabledReason : !p?.supported ? msg('Not available on this computer.') : id === 'search' && !this.d.python?.isReady() ? msg('Install Code tools first.') : undefined
      const err = this.errors.get(id)
      return {
        id, installed: !!p?.isReady(), installing: this.busy.has(id), available,
        ...(this.busy.get(id)?.progress !== undefined ? { progress: this.busy.get(id)!.progress } : {}),
        ...(err ? { error: err } : {}), ...(unavailableReason ? { unavailableReason } : {}),
      }
    })
  }

  /** what the confirmation dialog shows */
  async info(id: ComponentId): Promise<DownloadInfo | undefined> {
    const key = componentKey(id)
    if (id === 'python' && this.d.python) {
      const b = PY_BUILDS[this.d.python.platformKey]
      if (!b) return undefined
      return {
        key, name: `Code tools (Python ${PY_VERSION} and ${PY_PACKAGES.length} pinned packages)`,
        // the Python archive's size is known; what pip fetches for the packages depends on the computer
        sizeGB: 0.2, sizeEstimated: true, sources: [hostOf(pyUrl(this.d.python.platformKey)), 'pypi.org', 'files.pythonhosted.org'],
        destination: this.d.python.root,
        license: 'Python: PSF License 2.0. Each package keeps its own open-source license (BSD, MIT, Apache-2.0 and others).',
        parts: [
          { name: `Python ${PY_VERSION} (python-build-standalone)`, source: pyUrl(this.d.python.platformKey), sizeGB: b.sizeGB, license: 'PSF-2.0' },
          { name: `${PY_PACKAGES.length} prebuilt packages (pandas, numpy, matplotlib, …), exact versions pinned`, source: 'https://pypi.org', license: 'various' },
        ],
        note: 'Size is an estimate. The Python archive is checked against its SHA-256 checksum; packages come from PyPI at pinned versions.',
      }
    }
    if (id === 'search' && this.d.python) {
      return {
        key, name: 'Web search (SearXNG, runs on this computer)', sizeGB: 0.01, sizeEstimated: true,
        sources: [hostOf(SEARXNG_URL)], destination: this.d.python.root, license: 'AGPL-3.0 (SearXNG)',
        parts: [{ name: 'SearXNG source', source: SEARXNG_URL, license: 'AGPL-3.0' }],
        note: 'Size is an estimate. Checked against its SHA-256 checksum. Searches only run while Web access is on.',
      }
    }
    if (id === 'speech' && this.d.speech) {
      const bytes = WHISPER.files.reduce((s, f) => s + f.bytes, 0)
      return {
        key, name: 'Dictation (Whisper base, multilingual)', sizeGB: round(bytes / GB), sizeEstimated: false,
        sources: ['huggingface.co'], destination: this.d.speech.root,
        license: 'Apache-2.0 as published for openai/whisper-base (this ONNX conversion: see its model card)',
        parts: WHISPER.files.map((f) => ({ name: f.path, source: `https://huggingface.co/${WHISPER.id}/resolve/${WHISPER.revision}/${f.path}`, sizeGB: round(f.bytes / GB) })),
        note: 'Every file is checked against its SHA-256 checksum.',
      }
    }
    if (id === 'vision' && this.d.vision) {
      const plan = await this.d.vision.plan()
      const bytes = plan.files.reduce((s, f) => s + f.bytes, 0)
      return {
        key, name: `Image support (${plan.model.name} and the llama.cpp image server)`, sizeGB: round(bytes / GB), sizeEstimated: false,
        sources: [...new Set(plan.files.map((f) => hostOf(f.url)))], destination: this.d.vision.root,
        license: 'Model: Apache-2.0 (Qwen3-VL). Server: MIT (llama.cpp).',
        parts: plan.files.map((f) => ({ name: f.name, source: f.url, sizeGB: round(f.bytes / GB), license: f.url.includes('huggingface.co') ? 'Apache-2.0' : 'MIT' })),
        note: 'Every file is checked against its SHA-256 checksum.',
      }
    }
    return undefined
  }

  /** after the person's OK (the IPC handler checks it): download in the background, reporting progress */
  install(id: ComponentId): ComponentState[] {
    const p = this.part(id)
    if (!p || p.disabledReason || this.busy.has(id) || p.isReady()) return this.list()
    this.errors.delete(id)
    this.busy.set(id, {})
    const done = (err?: unknown) => {
      this.busy.delete(id)
      if (err) this.errors.set(id, err instanceof Error && err.name === 'AbortError' ? 'Download cancelled.' : err instanceof Error ? err.message : String(err))
      this.d.onChange(this.list())
    }
    p.ensure().then(() => done(), done)
    this.d.onChange(this.list())
    return this.list()
  }

  cancel(id: ComponentId): boolean {
    return !!this.part(id)?.cancel()
  }
}
