import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { updatesOn } from '../src/main/updates'

const installed = { packaged: true, fake: false, profile: false, platform: 'darwin' as NodeJS.Platform, appImage: false }

// Khaled Chat: no automatic update checks, downloads or installs, on any system
it('never looks for, downloads or installs updates by itself', () => {
  for (const platform of ['darwin', 'win32', 'linux'] as NodeJS.Platform[]) {
    expect(updatesOn({ ...installed, platform })).toBe(false)
    expect(updatesOn({ ...installed, platform, appImage: true })).toBe(false)
  }
  expect(updatesOn({ ...installed, packaged: false })).toBe(false)
})

it('the app no longer loads electron-updater or points at FrigadeHQ for updates', () => {
  const src = readFileSync(join(__dirname, '../src/main/updates.ts'), 'utf8')
  expect(src).not.toMatch(/import\(['"]electron-updater['"]\)|from ['"]electron-updater['"]/)
  const index = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')
  expect(index).not.toMatch(/startUpdates/)
  const builder = readFileSync(join(__dirname, '../electron-builder.yml'), 'utf8')
  expect(builder).not.toMatch(/owner:\s*FrigadeHQ/)
})
