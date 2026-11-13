/**
 * Khaled Chat: download consent, enforced in the main process.
 *
 * Every download (AI models, the vision model and its server, the dictation model, the Python runtime and its
 * packages, the web search engine) checks for a grant here right before it touches the network. A grant only comes
 * from the person confirming a download dialog (IPC `downloads:approve`). Grants:
 * - live in memory only, so a restart never carries one over: a saved, interrupted download needs a new OK;
 * - are single-use: the download that uses one gives it back when it ends (finished, failed or cancelled);
 * - expire if no download claims them soon after the OK.
 * Anything that would download without a grant (start-up, onboarding, a feature warming up, the agent) gets a
 * ConsentRequiredError instead.
 */

export type ComponentId = 'python' | 'search' | 'speech' | 'vision'
export const COMPONENTS: ComponentId[] = ['python', 'search', 'speech', 'vision']

export const modelKey = (modelId: string) => `model:${modelId}`
export const componentKey = (id: ComponentId) => `component:${id}`

/** what a confirmed download may be: a catalog model or an optional component */
export function parseKey(key: unknown): { kind: 'model'; id: string } | { kind: 'component'; id: ComponentId } | undefined {
  if (typeof key !== 'string') return undefined
  const m = /^model:([\w.-]{1,100})$/.exec(key)
  if (m) return { kind: 'model', id: m[1] }
  const c = /^component:(\w+)$/.exec(key)
  if (c && (COMPONENTS as string[]).includes(c[1])) return { kind: 'component', id: c[1] as ComponentId }
  return undefined
}

export class ConsentRequiredError extends Error {
  name = 'ConsentRequiredError'
  constructor(public key: string, message?: string) {
    super(message ?? `This download needs the user's OK first (${key}). Nothing was downloaded.`)
  }
}

/** an OK that no download picks up within this time lapses */
export const GRANT_TTL_MS = 2 * 60 * 1000

export class DownloadConsent {
  /** key → when the OK lapses if unused; Infinity once a download is using it */
  private grants = new Map<string, number>()
  constructor(private now: () => number = Date.now) {}

  /** the person confirmed the download dialog for this key */
  grant(key: string) {
    if (!parseKey(key)) throw new Error(`Unknown download: ${String(key)}`)
    this.grants.set(key, this.now() + GRANT_TTL_MS)
  }

  has(key: string): boolean {
    const until = this.grants.get(key)
    if (until === undefined) return false
    if (until < this.now()) { this.grants.delete(key); return false }
    return true
  }

  /** throws unless the person has OK'd this download */
  assert(key: string, message?: string) {
    if (!this.has(key)) throw new ConsentRequiredError(key, message)
  }

  /**
   * Run one download under its grant: throws ConsentRequiredError (before fn runs) without one, and gives the
   * grant back when fn ends, however it ends.
   */
  async use<T>(key: string, fn: () => Promise<T>, message?: string): Promise<T> {
    this.assert(key, message)
    this.grants.set(key, Infinity)
    try { return await fn() } finally { this.grants.delete(key) }
  }

  revoke(key: string) { this.grants.delete(key) }
  clear() { this.grants.clear() }
}

/** the app's one consent store (tests make their own) */
export const consent = new DownloadConsent()
