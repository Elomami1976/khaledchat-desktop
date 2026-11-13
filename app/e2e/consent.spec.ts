// Khaled Chat: downloads start only from the confirmation dialog, and a stray click can't confirm it.
import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const main = join(import.meta.dirname, '../out/main/index.js')
const launch = (userData: string) => electron.launch({ args: [main], env: { ...process.env, HOB_FAKE: '1', HOB_USER_DATA: userData } })

test('the download button only opens a confirmation; it shows what, how big, from where, to where, under which license', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'kc-e2e-'))
  const app = await launch(userData)
  const page = await app.firstWindow()
  await page.getByTestId('setup-download').click()
  const dialog = page.getByTestId('download-confirm')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('download-confirm-name')).toContainText('Gemma 4 26B')
  await expect(page.getByTestId('download-confirm-size')).toContainText('GB')
  await expect(page.getByTestId('download-confirm-source')).toHaveText('huggingface.co')
  await expect(page.getByTestId('download-confirm-destination')).toContainText(userData)
  await expect(page.getByTestId('download-confirm-license')).toHaveText('Apache-2.0')
  // focus starts on Cancel, never on Download
  await expect(page.getByTestId('download-confirm-ok')).not.toBeFocused()
  // Cancel: nothing starts, nothing is remembered
  await page.getByTestId('download-confirm-cancel').click()
  await expect(dialog).toBeHidden()
  await page.waitForTimeout(500)
  await expect(page.getByTestId('setup-downloading')).toHaveCount(0)
  const settings = join(userData, 'settings.json')
  expect(existsSync(settings) ? JSON.parse(readFileSync(settings, 'utf8')).pendingModelId : undefined).toBeUndefined()
  await app.close()
})

test('a click right after the dialog appears does nothing; Download works after the short delay', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'kc-e2e-'))
  const app = await launch(userData)
  const page = await app.firstWindow()
  await page.getByTestId('setup-download').click()
  const ok = page.getByTestId('download-confirm-ok')
  await expect(page.getByTestId('download-confirm-name')).toBeVisible()
  await expect(ok).toBeDisabled()
  // a click at once (as from a double-click or a click meant for another window) is ignored
  await ok.click({ force: true })
  await page.waitForTimeout(300)
  await expect(page.getByTestId('download-confirm')).toBeVisible()
  await expect(page.getByTestId('setup-downloading')).toHaveCount(0)
  // after the delay, a deliberate click starts it
  await expect(ok).toBeEnabled({ timeout: 3000 })
  await ok.click()
  await expect(page.getByTestId('status').or(page.getByTestId('setup-downloading'))).toBeVisible({ timeout: 20_000 })
  await app.close()
})

test('the main process ignores a start request with no confirmation (bypassing the dialog)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'kc-e2e-'))
  const app = await launch(userData)
  const page = await app.firstWindow()
  await expect(page.getByTestId('setup-download')).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => (window as unknown as { hob: { setup: { confirm(): Promise<void> } } }).hob.setup.confirm())
  await expect(page.getByTestId('setup-error')).toContainText('confirm', { timeout: 10_000 })
  await expect(page.getByTestId('setup-downloading')).toHaveCount(0)
  await app.close()
})

test('after a restart, an interrupted download is offered, not resumed', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'kc-e2e-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ pendingModelId: 'gemma-4-26b-a4b' }))
  const app = await launch(userData)
  const page = await app.firstWindow()
  await expect(page.getByTestId('setup-resume')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1000)
  await expect(page.getByTestId('setup-downloading')).toHaveCount(0)
  await app.close()
})
