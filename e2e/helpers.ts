import { expect, type Browser, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Shared by the browser specs: two isolated devices, sharing and joining.

export async function bigFile(name: string, mb: number) {
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

export const DIRECT = "http://127.0.0.1:3210"
export const RELAY = "http://127.0.0.1:3211"

export async function twoPages(browser: Browser, base = DIRECT) {
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

export async function shareFiles(
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

export async function joinByCode(page: Page, code: string) {
  await page.getByLabel("Share code").fill(code)
  await page.getByRole("button", { name: "Receive", exact: true }).click()
}

/** The code shown on the sender's waiting screen. */
export async function codeOf(page: Page) {
  return (await page.getByLabel(/^Code /).getAttribute("aria-label"))!.replace(
    /Code |\s/g,
    "",
  )
}
