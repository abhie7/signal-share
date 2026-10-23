import { test, expect, type Browser, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

async function bigFile(name: string, mb: number) {
  const path = join(tmpdir(), `signalshare-${name}`)
  const chunk = randomBytes(1024 * 1024)
  await writeFile(
    path,
    Buffer.concat(
      Array.from({ length: mb }, (_, i) => {
        const c = Buffer.from(chunk)
        c[0] = i & 0xff
        return c
      }),
    ),
  )
  return path
}

const DIRECT = "http://127.0.0.1:3210"
const RELAY = "http://127.0.0.1:3211"

async function twoPages(browser: Browser, base = DIRECT) {
  const a = await browser.newContext({ baseURL: base, acceptDownloads: true })
  const b = await browser.newContext({ baseURL: base, acceptDownloads: true })
  // Expose live WebSockets so tests can simulate a dropped network path.
  for (const ctx of [a, b]) {
    await ctx.addInitScript(() => {
      const Native = window.WebSocket
      const all: WebSocket[] = []
      ;(window as unknown as { __sockets: WebSocket[] }).__sockets = all
      window.WebSocket = class extends Native {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols)
          all.push(this)
        }
      } as typeof WebSocket
    })
  }
  const sender = await a.newPage()
  const receiver = await b.newPage()
  await Promise.all([sender.goto("/"), receiver.goto("/")])
  await expect(
    sender
      .getByRole("status")
      .filter({ hasText: /Online|[A-Z][a-z]+ [A-Z]/ })
      .first(),
  ).toBeVisible()
  return { sender, receiver, close: () => Promise.all([a.close(), b.close()]) }
}

async function shareFiles(
  page: Page,
  files: Array<{ name: string; buffer: Buffer }>,
) {
  await page
    .locator("input[type=file][multiple]")
    .setInputFiles(
      files.map((f) => ({ ...f, mimeType: "application/octet-stream" })),
    )
  await page.getByRole("button", { name: /^Share (file|\d+ files)$/ }).click()
  await expect(
    page.getByRole("heading", { name: "Ready to send" }),
  ).toBeVisible()
  const code = (await page
    .getByLabel(/^Code /)
    .getAttribute("aria-label"))!.replace(/Code |\s/g, "")
  const link = await page.locator("#share-link").inputValue()
  return { code, link }
}

async function joinByCode(page: Page, code: string) {
  await page.getByLabel("Share code").fill(code)
  await page.getByRole("button", { name: "Receive", exact: true }).click()
}

test("file share by code over a direct connection, verified byte-for-byte", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  const payload = randomBytes(3 * 1024 * 1024 + 123)
  const { code } = await shareFiles(sender, [
    { name: "report.bin", buffer: payload },
  ])

  const download = receiver.waitForEvent("download")
  await joinByCode(receiver, code)
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 30_000 },
  )
  await expect(sender.getByRole("heading", { name: "Sent" })).toBeVisible()
  await expect(
    receiver.getByText("Direct connection · encrypted end to end"),
  ).toBeVisible()

  const saved = await readFile((await (await download).path())!)
  expect(saved.equals(payload)).toBe(true)
  await close()
})

test("when direct WebRTC is impossible, multiple files arrive intact over the encrypted relay", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser, RELAY)
  const one = randomBytes(2 * 1024 * 1024)
  const two = randomBytes(70_001)
  const { link } = await shareFiles(sender, [
    { name: "one.bin", buffer: one },
    { name: "two.bin", buffer: two },
  ])

  await receiver.goto(link)
  await expect(receiver.getByText(/wants to send you 2 files/)).toBeVisible()
  await receiver.getByRole("button", { name: "Receive" }).click()
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 60_000 },
  )
  await expect(
    receiver.getByText("Via encrypted relay · encrypted end to end"),
  ).toBeVisible()
  await expect(sender.getByRole("heading", { name: "Sent" })).toBeVisible()

  for (const [name, buf] of [
    ["one.bin", one],
    ["two.bin", two],
  ] as const) {
    const dl = receiver.waitForEvent("download")
    await receiver.getByRole("button", { name: `Save ${name}` }).click()
    expect((await readFile((await (await dl).path())!)).equals(buf)).toBe(true)
  }
  await close()
})

test("a transfer resumes after its data path drops mid-way", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser, RELAY)
  const path = await bigFile("resume.bin", 300)
  await sender.locator("input[type=file][multiple]").setInputFiles(path)
  await sender.getByRole("button", { name: "Share file" }).click()
  const code = (await sender
    .getByLabel(/^Code /)
    .getAttribute("aria-label"))!.replace(/Code |\s/g, "")
  const download = receiver.waitForEvent("download", { timeout: 120_000 })
  await joinByCode(receiver, code)

  await receiver.waitForFunction(
    () =>
      Number(
        document
          .querySelector("[role=progressbar]")
          ?.getAttribute("aria-valuenow"),
      ) >= 3,
    null,
    { timeout: 30_000 },
  )
  const before = await receiver
    .getByRole("progressbar")
    .getAttribute("aria-valuenow")
  // Kill the relay socket under the transfer.
  const killed = await receiver.evaluate(() => {
    const live = (
      window as unknown as { __sockets: WebSocket[] }
    ).__sockets.filter(
      (s) => s.url.includes("/api/relay") && s.readyState === 1,
    )
    live.forEach((s) => s.close())
    return live.length
  })
  expect(killed).toBe(1)
  expect(Number(before)).toBeLessThan(100)

  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 120_000 },
  )
  expect(
    (await readFile((await (await download).path())!)).equals(
      await readFile(path),
    ),
  ).toBe(true)
  await close()
})

test("text share", async ({ browser }) => {
  const { sender, receiver, close } = await twoPages(browser)
  const message = "Wi‑Fi password: correct horse battery staple 🐎\nsecond line"
  await sender.getByRole("tab", { name: "Text" }).click()
  await sender.getByLabel("Text to send").fill(message)
  await sender.getByRole("button", { name: "Share text" }).click()
  const code = (await sender
    .getByLabel(/^Code /)
    .getAttribute("aria-label"))!.replace(/Code |\s/g, "")
  await joinByCode(receiver, code)
  await expect(
    receiver.getByRole("heading", { name: "Text received" }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(receiver.locator("pre")).toHaveText(message)
  await close()
})

test("receiver cancelling mid-transfer is shown to the sender", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser, RELAY)
  await sender
    .locator("input[type=file][multiple]")
    .setInputFiles(await bigFile("cancel.bin", 300))
  await sender.getByRole("button", { name: "Share file" }).click()
  const code = (await sender
    .getByLabel(/^Code /)
    .getAttribute("aria-label"))!.replace(/Code |\s/g, "")
  await joinByCode(receiver, code)
  await expect(receiver.getByRole("progressbar")).toBeVisible({
    timeout: 30_000,
  })
  await receiver.getByRole("button", { name: "Cancel" }).click()
  await expect(
    receiver.getByRole("heading", { name: "Send", exact: true }),
  ).toBeVisible()
  await expect(
    sender.getByRole("heading", { name: "Share cancelled" }),
  ).toBeVisible({ timeout: 15_000 })
  await close()
})

test("invalid codes and dead links explain themselves", async ({ page }) => {
  await page.goto("/")
  await page.getByLabel("Share code").fill("ZZZZZZ")
  await page.getByRole("button", { name: "Receive", exact: true }).click()
  await expect(page.locator("#code-error")).toContainText("Code not found")
  await page.goto("/receive/doesnotexist")
  await expect(
    page.getByRole("heading", { name: "This share has ended" }),
  ).toBeVisible()
})

test("a claimed share cannot be joined by a second device", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  const { link } = await shareFiles(sender, [
    { name: "a.bin", buffer: randomBytes(10) },
  ])
  await receiver.goto(link)
  await receiver.getByRole("button", { name: "Receive" }).click()
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 30_000 },
  )
  const third = await browser.newPage()
  await third.goto(link)
  await expect(
    third.getByRole("heading", { name: "This share has ended" }),
  ).toBeVisible()
  await third.close()
  await close()
})

test("screen share: viewer sees live frames, stop is propagated", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  await sender.getByRole("tab", { name: "Screen" }).click()
  await sender.getByRole("button", { name: "Choose what to share" }).click()
  await expect(
    sender.getByRole("heading", { name: "Ready to share your screen" }),
  ).toBeVisible({ timeout: 15_000 })
  const link = await sender.locator("#share-link").inputValue()

  await receiver.goto(link)
  await receiver.getByRole("button", { name: "View screen" }).click()
  await expect(receiver.getByRole("heading", { name: /screen$/ })).toBeVisible({
    timeout: 30_000,
  })
  await expect(
    sender.getByRole("heading", { name: "You’re sharing your screen" }),
  ).toBeVisible({ timeout: 15_000 })
  const frames = await receiver.evaluate(
    () => (document.querySelector("video") as HTMLVideoElement).videoWidth,
  )
  expect(frames).toBeGreaterThan(0)

  await sender.getByRole("button", { name: "Stop sharing" }).click()
  await expect(
    receiver.getByRole("heading", { name: "Screen sharing ended" }),
  ).toBeVisible({ timeout: 15_000 })
  await close()
})

test("denied screen capture recovers with an explanation and a retry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = () =>
      Promise.reject(new DOMException("Permission denied", "NotAllowedError"))
  })
  await page.goto("/")
  await page.getByRole("tab", { name: "Screen" }).click()
  await page.getByRole("button", { name: "Choose what to share" }).click()
  await expect(
    page.getByRole("heading", { name: "Screen sharing didn’t start" }),
  ).toBeVisible()
  await expect(page.getByText(/Screen & System Audio Recording/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
  await page.getByRole("button", { name: "Done" }).click()
  await expect(
    page.getByRole("heading", { name: "Send", exact: true }),
  ).toBeVisible()
})

test("mobile layout and keyboard access", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 740 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await page.goto("/")
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow, "horizontal overflow (px)").toBeLessThanOrEqual(0)
  await page.getByRole("tab", { name: "Text" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByLabel("Text to send")).toBeVisible()
  await ctx.close()
})
