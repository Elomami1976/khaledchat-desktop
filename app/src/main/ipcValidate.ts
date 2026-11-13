/**
 * Khaled Chat: runtime checks for what the renderer sends over IPC. TypeScript types say nothing at run time, so
 * every privileged handler (files, downloads, models, plugins that run programs, settings, deletion) checks its
 * arguments here first. A bad argument throws InvalidIpcInput; nothing is done.
 */
import { isAbsolute } from 'node:path'
import type { ApprovalAnswer, Attachment } from '../shared/agent'

export class InvalidIpcInput extends Error {
  constructor(what: string) { super(`Invalid input: ${what}`); this.name = 'InvalidIpcInput' }
}

const MAX_PATH = 4096
const MAX_ID = 200

export function str(v: unknown, what: string, max = 10_000): string {
  if (typeof v !== 'string' || v.length > max) throw new InvalidIpcInput(what)
  return v
}
export function optStr(v: unknown, what: string, max = 10_000): string | undefined {
  return v === undefined || v === null ? undefined : str(v, what, max)
}
/** ids: chat, request, model, plugin… no control characters, no path separators beyond what ids use */
export function id(v: unknown, what = 'id'): string {
  const s = str(v, what, MAX_ID)
  if (!s || !/^[\w.:@+-]+$/.test(s)) throw new InvalidIpcInput(what)
  return s
}
export function optId(v: unknown, what = 'id'): string | undefined {
  return v === undefined || v === null || v === '' ? undefined : id(v, what)
}
export function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new InvalidIpcInput(what)
  return v
}
export function int(v: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new InvalidIpcInput(what)
  return v
}
/** an absolute file-system path, with no NUL byte */
export function absPath(v: unknown, what = 'path'): string {
  const s = str(v, what, MAX_PATH)
  if (!s || s.includes('\0') || !isAbsolute(s)) throw new InvalidIpcInput(what)
  return s
}
export function absPaths(v: unknown, what = 'paths', max = 1000): string[] {
  if (!Array.isArray(v) || v.length > max) throw new InvalidIpcInput(what)
  return v.filter((p) => p !== '' && p !== null && p !== undefined).map((p) => absPath(p, what))
}
export function plainObject(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new InvalidIpcInput(what)
  return v as Record<string, unknown>
}
export function approvalAnswer(v: unknown): ApprovalAnswer {
  if (v !== 'allow' && v !== 'always' && v !== 'deny') throw new InvalidIpcInput('approval answer')
  return v
}
export function attachments(v: unknown): Attachment[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v) || v.length > 200) throw new InvalidIpcInput('attachments')
  return v.map((a) => {
    const o = plainObject(a, 'attachment')
    return { ...o, name: str(o.name, 'attachment name', 1024), path: absPath(o.path, 'attachment path') } as Attachment
  })
}
