// Khaled Chat: the packaged Windows build (dist/win-unpacked) starts in real mode on a new profile, shows the model
// choice with the Khaled Chat name, runs sandboxed, and makes no network requests at start-up.
// Runs only when the build exists: pnpm exec electron-builder --win nsis --x64 first.
import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exe = join(import.meta.dirname, '../dist/win-unpacked/Khaled Chat.exe')

test('packaged Windows build: starts, branded, sandboxed, quiet on the network', async () => {
  test.skip(process.platform !== 'win32' || !existsSync(exe), 'needs the packaged Windows build')
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'kc-pkg-'))
  const log = join(userData, 'net.log')
  const app = await electron.launch({ executablePath: exe, args: [], env: { ...process.env, HOB_FAKE: '', HOB_USER_DATA: userData, KHALED_NET_LOG: log } })
  const page = await app.firstWindow()
  await expect(page.getByTestId('setup-download')).toBeVisible({ timeout: 120_000 })
  expect(await page.title()).toBe('Khaled Chat')
  expect(await app.evaluate(({ app }) => ({ name: app.getName(), packaged: app.isPackaged }))).toEqual({ name: 'Khaled Chat', packaged: true })
  const sandbox = await app.evaluate(({ BrowserWindow }) => (BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences(): { sandbox: boolean } }).getLastWebPreferences().sandbox)
  expect(sandbox).toBe(true)
  await expect(page.getByTestId('brand-logo').first()).toBeVisible()
  await page.waitForTimeout(10_000)
  const lines = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  expect(lines).toHaveLength(1)
  await app.close()
})
