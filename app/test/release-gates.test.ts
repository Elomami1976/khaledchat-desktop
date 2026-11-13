// Khaled Chat 0.1.0: a component switched off by a release gate shows why, and can't be installed.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Components } from '../src/main/components'

const part = (o: Partial<{ supported: boolean; disabledReason: string; ready: boolean }> = {}) => ({
  supported: o.supported ?? true, ...(o.disabledReason ? { disabledReason: o.disabledReason } : {}),
  isReady: () => o.ready ?? false, ensure: vi.fn(async () => {}), cancel: () => false,
})

describe('release gates', () => {
  it('a gated part is unavailable, says why, and install does nothing', () => {
    const python = { ...part({ disabledReason: 'Not in this version.' }), root: 'x', platformKey: 'win32-x64' }
    const c = new Components({ python, onChange: () => {} })
    const row = c.list().find((r) => r.id === 'python')!
    expect(row).toMatchObject({ available: false, unavailableReason: 'Not in this version.' })
    c.install('python')
    expect(python.ensure).not.toHaveBeenCalled()
  })
  it('the shipped app gates code tools on Windows and web search everywhere; tests lift it', () => {
    const index = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')
    expect(index).toContain("const RELEASE_GATES = !FAKE && process.env.HOB_ALLOW_ALL !== '1'")
    expect(index).toMatch(/python: \{ supported: python\.supported, \.\.\.\(RELEASE_GATES && process\.platform === 'win32'/)
    expect(index).toMatch(/search: \{ supported: python\.supported, \.\.\.\(RELEASE_GATES \?/)
  })
})
