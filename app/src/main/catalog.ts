import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { validateCatalog, type Catalog } from '@hob/picker'

/**
 * Khaled Chat: the model list is the one bundled with the app. Nothing is fetched at start-up (or ever, for now):
 * the app doesn't call loadCatalog below. A remote list may come back later as an opt-in, signed update.
 */
export function loadBundledCatalog(bundled: unknown, licenses: string[]): Catalog {
  const r = validateCatalog(bundled, licenses)
  if (!r.ok) throw new Error('Bundled catalog is invalid: ' + r.errors.join('; '))
  return r.catalog
}

/** Khaled Chat's remote catalog with cache and bundled fallback. Unused by Khaled Chat (no remote URL); kept for its tests */
export async function loadCatalog(opts: { url: string; cachePath: string; bundled: unknown; licenses: string[]; fetchFn?: typeof fetch }): Promise<Catalog> {
  const fetchFn = opts.fetchFn ?? fetch
  try {
    const res = await fetchFn(opts.url, { signal: AbortSignal.timeout(5000) })
    const r = validateCatalog(await res.json(), opts.licenses)
    if (r.ok) {
      writeFileSync(opts.cachePath, JSON.stringify(r.catalog))
      return r.catalog
    }
  } catch { /* offline or bad response: fall through */ }
  if (existsSync(opts.cachePath)) {
    try {
      const r = validateCatalog(JSON.parse(readFileSync(opts.cachePath, 'utf8')), opts.licenses)
      if (r.ok) return r.catalog
    } catch { /* corrupt cache */ }
  }
  const r = validateCatalog(opts.bundled, opts.licenses)
  if (!r.ok) throw new Error('Bundled catalog is invalid: ' + r.errors.join('; '))
  return r.catalog
}
