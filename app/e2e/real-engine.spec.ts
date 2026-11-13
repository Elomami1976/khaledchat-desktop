import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Opt-in: downloads the real Qwen3 1.7B model (1.83 GB) through the confirmation dialog. Run with HOB_REAL=1.
// HOB_REAL_USER_DATA=<dir> keeps the profile (and the model) for later runs.
test.skip(process.env.HOB_REAL !== '1', 'set HOB_REAL=1 to run against the real engine')
test.setTimeout(60 * 60_000)

test('real engine: probe → confirm download → load → stream → stop → persist', async () => {
  const userData = process.env.HOB_REAL_USER_DATA ?? mkdtempSync(join(tmpdir(), 'hob-real-'))
  const env = { ...process.env, HOB_USER_DATA: userData }
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env })
  const page = await app.firstWindow()

  // a profile that already has the model goes straight to chat
  const ready = page.getByTestId('composer-input')
  const setup = page.getByTestId('setup-recommended')
  await expect(ready.or(setup)).toBeVisible({ timeout: 20 * 60_000 })
  if (await setup.isVisible()) {
    console.log('RECOMMENDED:', await setup.innerText())
    if (!(await setup.innerText()).includes('Qwen3 1.7B')) {
      await page.getByTestId('setup-other-options').click()
      await page.getByTestId('model-option').filter({ hasText: 'Qwen3 1.7B' }).click()
      await page.getByRole('button', { name: 'Use this model' }).click()
    }
    await page.getByTestId('setup-download').click()
    await expect(page.getByTestId('download-confirm-name')).toContainText('Qwen3 1.7B')
    console.log('DIALOG:', (await page.getByTestId('download-confirm').innerText()).replace(/\s+/g, ' '))
    const t0 = Date.now()
    await page.getByTestId('download-confirm-ok').click()
    await expect(page.getByTestId('status')).toContainText('Ready', { timeout: 55 * 60_000 })
    console.log('DOWNLOAD+LOAD ms:', Date.now() - t0)
  }
  await expect(page.getByTestId('status')).toContainText("Ready", { timeout: 20 * 60_000 })

  // a short reply
  await page.getByTestId('composer-input').fill('Reply with exactly one word: pong')
  let t0 = Date.now()
  await page.getByTestId('composer-send').click()
  await expect(page.getByTestId('message-assistant').last()).toContainText(/pong/i, { timeout: 10 * 60_000 })
  await expect(page.getByTestId('composer-send')).toBeVisible({ timeout: 10 * 60_000 })
  console.log('REPLY 1:', JSON.stringify(await page.getByTestId('message-assistant').last().innerText()), 'in', Date.now() - t0, 'ms')

  // streaming: a longer answer grows on screen; Stop ends it and keeps what was written
  await page.getByTestId('composer-input').fill('Write a numbered list of 30 fruits, one per line.')
  t0 = Date.now()
  await page.getByTestId('composer-send').click()
  const last = page.getByTestId('message-assistant').last()
  // the reply (thinking included) has started coming in; lists may render as bullets, so measure length
  await expect.poll(async () => (await last.innerText()).length, { timeout: 15 * 60_000, intervals: [2000] }).toBeGreaterThan(60)
  const first = (await last.innerText()).length
  await page.waitForTimeout(3000)
  const later = (await last.innerText()).length
  console.log('STREAMING chars:', first, '→', later, 'after 3 s; list reached item 3 after', Date.now() - t0, 'ms')
  expect(later).toBeGreaterThan(first)
  await page.getByTestId('composer-stop').click()
  await expect(page.getByTestId('composer-send')).toBeVisible({ timeout: 60_000 })
  console.log('AFTER STOP:', JSON.stringify((await last.innerText()).slice(-120)))
  await app.close()

  // the chat and the model are still there after a restart
  const app2 = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env })
  const page2 = await app2.firstWindow()
  await expect(page2.getByTestId('status')).toContainText("Ready", { timeout: 20 * 60_000 })
  // the sidebar can be collapsed in the hidden test window: ask the app for its saved chats instead
  expect((await page2.evaluate(() => (window as unknown as { hob: { chats: { list(): Promise<unknown[]> } } }).hob.chats.list())).length).toBeGreaterThan(0)
  console.log('RESTART: ready, chats kept')
  await app2.close()
})
