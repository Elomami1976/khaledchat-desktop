// Khaled Chat: greeting by local time, the optional first name, branding metadata, Arabic coverage.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dayPart, greeting, SECONDARY } from '../src/shared/greeting'
import { cleanFirstName } from '../src/main/settings'

const at = (h: number, day = 13) => new Date(2026, 10, day, h, 30)
const app = join(__dirname, '..')

describe('greeting', () => {
  it('follows the local time of day', () => {
    expect([4, 5, 11, 12, 17, 18, 23, 0].map(dayPart)).toEqual(['evening', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'evening'])
  })
  it('uses the first name when there is one', () => {
    expect(greeting(at(9), 'Alex')).toMatchObject({ key: 'Good morning, {name}.', name: 'Alex' })
    expect(greeting(at(14), 'Alex').key).toBe('Good afternoon, {name}.')
    expect(greeting(at(20), '  ').key).toBe('Good evening.')
    expect(greeting(at(20), undefined).name).toBeUndefined()
  })
  it('the secondary line varies from day to day', () => {
    const lines = new Set([1, 2, 3, 4, 5, 6].map((d) => greeting(at(9, d), 'A').secondary))
    expect(lines.size).toBeGreaterThan(1)
    for (const l of lines) expect(SECONDARY).toContain(l)
  })
})

describe('first name', () => {
  it('is trimmed, one line, at most 40 characters; empty removes it', () => {
    expect(cleanFirstName('  Alex ')).toBe('Alex')
    expect(cleanFirstName('خالد')).toBe('خالد')
    expect(cleanFirstName('A\nB\tC')).toBe('A B C')
    expect(cleanFirstName('x'.repeat(60))).toHaveLength(40)
    expect(cleanFirstName('')).toBeUndefined()
    expect(cleanFirstName(42)).toBeUndefined()
  })
})

describe('branding', () => {
  it('package and installer say Khaled Chat, with no Frigade update feed', () => {
    const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    expect(pkg.productName).toBe('Khaled Chat')
    const yml = readFileSync(join(app, 'electron-builder.yml'), 'utf8')
    expect(yml).toMatch(/^appId: com\.khaledchat\.desktop$/m)
    expect(yml).toMatch(/^productName: Khaled Chat$/m)
    expect(yml).toMatch(/^publish: null$/m)
    expect(yml).not.toMatch(/com\.frigade/)
    expect(yml).toContain('Based on Hob, Copyright © 2026 Frigade (MIT)')
  })
  it('keeps the Hob MIT notice', () => {
    expect(readFileSync(join(app, '../LICENSE'), 'utf8')).toContain('Copyright (c) 2026 Frigade')
  })
})

describe('Arabic', () => {
  it('translates every string Khaled Chat added', () => {
    const ar = JSON.parse(readFileSync(join(app, 'src/shared/locales/ar.json'), 'utf8')) as Record<string, unknown>
    const english = Object.keys(ar).filter((k) => ar[k] === k && !['PDF', 'Khaled Chat'].includes(k))
    expect(english).toEqual([])
  })
})
