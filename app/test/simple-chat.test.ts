// Khaled Chat: simple chat mode sends a short prompt, no tools, and thinks briefly; Auto picks it with no GPU.
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FakeEngine } from '../src/main/fake'
import { Store } from '../src/main/store'
import { allTools } from '../src/main/tools'
import { runTurn, type TurnDeps } from '../src/main/agent/turn'
import { SIMPLE_SYSTEM_PROMPT } from '../src/main/agent/prompt'
import { isChatMode, simpleChatOn } from '../src/main/settings'

function world(simple: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'kc-simple-'))
  const chatDir = join(root, 'chat'); mkdirSync(chatDir)
  const store = new Store(':memory:')
  store.createChat('c', chatDir, undefined, null)
  const engine = new FakeEngine()
  const deps: TurnDeps = {
    engine, store, tools: allTools(), python: undefined, webAccess: () => true, simple: () => simple,
    trash: async () => {}, undoDir: join(root, 'undo'), runTmp: join(root, 'tmp'),
    approve: async () => 'allow', emit: { token: () => {}, step: () => {} },
  }
  const turn = (text: string) => runTurn(deps, { chatId: 'c', requestId: 'r', text, attachments: [], signal: new AbortController().signal })
  return { engine, turn, store }
}
const systemOf = (e: FakeEngine) => String((e.lastRequest?.messages ?? []).find((m: { role: string }) => m.role === 'system')?.content ?? '')

describe('simple chat', () => {
  it('short system prompt, no tools, quick thinking; the reply is stored as usual', async () => {
    const w = world(true)
    const reply = await w.turn('hello there')
    expect(reply.content).toBe('You said: hello there')
    expect(w.engine.lastRequest?.tools ?? []).toEqual([])
    expect(systemOf(w.engine)).toBe(SIMPLE_SYSTEM_PROMPT)
    expect(w.engine.lastRequest?.thoughtBudget).toBe(64)
    expect(w.store.messages('c')).toHaveLength(2)
  })
  it('full chat keeps the tools and the long prompt', async () => {
    const w = world(false)
    await w.turn('hello there')
    expect((w.engine.lastRequest?.tools ?? []).length).toBeGreaterThan(5)
    expect(systemOf(w.engine).length).toBeGreaterThan(SIMPLE_SYSTEM_PROMPT.length * 5)
  })
  it('the simple prompt is far shorter than the full one', () => {
    expect(SIMPLE_SYSTEM_PROMPT.length).toBeLessThan(400)
  })
  it('auto: simple only when the engine found no GPU acceleration', () => {
    expect(simpleChatOn({}, true)).toBe(true)
    expect(simpleChatOn({}, false)).toBe(false)
    expect(simpleChatOn({}, undefined)).toBe(false)
    expect(simpleChatOn({ chatMode: 'full' }, true)).toBe(false)
    expect(simpleChatOn({ chatMode: 'simple' }, false)).toBe(true)
    expect(isChatMode('auto')).toBe(true); expect(isChatMode('fast')).toBe(false)
  })
})
