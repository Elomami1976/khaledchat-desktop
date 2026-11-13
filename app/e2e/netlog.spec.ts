// Khaled Chat: start-up makes no network requests. Runs the real app (not the stand-in model), with the request
// log on (src/main/netlog.ts), on a new profile, until the model choice screen shows, and a while after.
// A positive control then makes two requests to this computer (127.0.0.1, nothing leaves it) through the main
// process's fetch and Electron's net.fetch, to show the log would have caught a request.
import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const main = join(import.meta.dirname, '../out/main/index.js')

test('no requests at start-up, through onboarding to the model choice', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'kc-net-'))
  const log = join(userData, 'net.log')
  const app = await electron.launch({ args: [main], env: { ...process.env, HOB_FAKE: '', HOB_USER_DATA: userData, KHALED_NET_LOG: log } })
  const page = await app.firstWindow()
  await expect(page.getByTestId('setup-download')).toBeVisible({ timeout: 120_000 })
  await page.waitForTimeout(15_000)
  const lines = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [])
  expect(lines()).toHaveLength(1)
  expect(lines()[0]).toMatch(/\tnetlog\t-\tstarted$/)

  // positive control: the log does see requests (to a server on this computer)
  const server = createServer((_req, res) => res.end('ok')).listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/control`
  await app.evaluate(async (_e, u) => { await fetch(u) }, url)
  await app.evaluate(async ({ net }, u) => { await net.fetch(u) }, url)
  server.close()
  const seen = lines().filter((l) => l.endsWith('/control'))
  expect(seen.some((l) => l.includes('\tnode-fetch\t'))).toBe(true)
  expect(seen.some((l) => l.includes('\tchromium\t'))).toBe(true)
  await app.close()
})
