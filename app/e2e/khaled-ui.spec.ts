// Khaled Chat: logo and greeting on the home screen, the optional first name, Settings → Hardware and About.
import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const main = join(import.meta.dirname, '../out/main/index.js')

test('greeting with first name, hardware and about', async () => {
  test.setTimeout(120_000)
  const userData = mkdtempSync(join(tmpdir(), 'kc-ui-'))
  const env = { ...process.env, HOB_FAKE: '1', HOB_USER_DATA: userData }
  const app = await electron.launch({ args: [main], env })
  const page = await app.firstWindow()
  await page.getByTestId('setup-download').click(); await page.getByTestId('download-confirm-ok').click()
  await expect(page.getByTestId('status')).toHaveText(/^Ready$/, { timeout: 30_000 })
  expect(await page.title()).toBe('Khaled Chat')

  // no name: a plain greeting by time of day, and the logo
  await expect(page.getByTestId('welcome-greeting')).toHaveText(/^Good (morning|afternoon|evening)\.$/)
  await expect(page.getByTestId('welcome-secondary')).not.toBeEmpty()
  await expect(page.locator('.chat-greeting').getByTestId('brand-logo')).toBeVisible()

  // Settings → General: set the first name; the greeting uses it
  await page.keyboard.press('Control+,')
  await page.getByTestId('first-name-input').fill('Alex')
  await page.getByTestId('first-name-input').press('Enter')
  await expect(page.getByTestId('first-name-clear')).toBeVisible()

  // Hardware and About
  await page.getByTestId('settings-nav-hardware').click()
  await expect(page.getByTestId('hardware-info')).toContainText('threads')
  await page.getByTestId('settings-nav-about').click()
  await expect(page.getByTestId('about-version')).toContainText('0.1.0')
  await expect(page.getByTestId('about-attribution')).toContainText('Hob by Frigade')
  await expect(page.getByTestId('about-website')).toHaveAttribute('href', 'https://khaledchat.com')
  await page.getByTestId('settings-close').click()
  await expect(page.getByTestId('welcome-greeting')).toHaveText(/^Good (morning|afternoon|evening), Alex\.$/)

  // saved locally: still there after a restart
  await app.close()
  const app2 = await electron.launch({ args: [main], env })
  const page2 = await app2.firstWindow()
  await expect(page2.getByTestId('welcome-greeting')).toHaveText(/Alex\.$/, { timeout: 30_000 })
  // and it can be removed
  await page2.keyboard.press('Control+,')
  await page2.getByTestId('first-name-clear').click()
  await page2.getByTestId('settings-close').click()
  await expect(page2.getByTestId('welcome-greeting')).toHaveText(/^Good (morning|afternoon|evening)\.$/)
  await app2.close()
})
