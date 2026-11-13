import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { DEFAULT_EFFORT, isEffort, type Effort } from '../shared/effort'
import { isLocale } from '../shared/i18n'

/** pendingModelId: a model download that was still in progress when Khaled Chat last ran. downloadsDir: where models go, when not in app data */
/** theme: light or dark regardless of the system; follows the system when left out. effort: how long Khaled Chat thinks. language: the interface's, the computer's when left out */
export type Settings = { activeModelId?: string; pendingModelId?: string; webAccess?: boolean; filesDir?: string; downloadsDir?: string; theme?: 'light' | 'dark'; effort?: Effort; language?: string; firstName?: string }

/** Khaled Chat: the optional first name used in the greeting. Trimmed, one line, at most 40 characters; '' removes it. */
export function cleanFirstName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  return s || undefined
}

export function loadSettings(path: string): Settings {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {} } catch { return {} }
}
export function saveSettings(path: string, s: Settings) {
  // write-then-rename so a crash mid-save never leaves a half-written file
  writeFileSync(path + '.tmp', JSON.stringify(s, null, 2))
  renameSync(path + '.tmp', path)
}

/** Merge a patch into the saved settings; undefined values remove a key. */
export function updateSettings(path: string, patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(path), ...patch }
  saveSettings(path, next)
  return next
}

/** Khaled Chat: web access is off until the person switches it on (Khaled Chat had it on by default). */
export const webAccessOn = (s: Settings) => s.webAccess === true

/** Normal unless the user picked another */
export const effortOf = (s: Settings): Effort => (isEffort(s.effort) ? s.effort : DEFAULT_EFFORT)

/** The language picked in Settings; the computer's when none (or one Khaled Chat no longer has) */
export const localeOf = (s: Settings, system: string): string => (isLocale(s.language) ? s.language : system)
