import { test, expect } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"

// Requires coturn (`brew install coturn`) and TURN_E2E=1.
test.skip(!process.env.TURN_E2E, "set TURN_E2E=1 with coturn installed")

const TURN = "http://127.0.0.1:3212"

test("files and screen go through a real TURN server with generated credentials", async ({
  browser,
}) => {
  const a = await browser.newContext({ baseURL: TURN, acceptDownloads: true })
  const b = await browser.newContext({ baseURL: TURN, acceptDownloads: true })
  const sender = await a.newPage()
  const receiver = await b.newPage()
  await Promise.all([sender.goto("/"), receiver.goto("/")])

  const payload = randomBytes(2 * 1024 * 1024)
  await sender
    .locator("input[type=file][multiple]")
    .setInputFiles({
      name: "turn.bin",
      mimeType: "application/octet-stream",
      buffer: payload,
    })
  await sender.getByRole("button", { name: "Share file" }).click()
  const code = (await sender
    .getByLabel(/^Code /)
    .getAttribute("aria-label"))!.replace(/Code |\s/g, "")
  const download = receiver.waitForEvent("download")
  await receiver.getByLabel("Share code").fill(code)
  await receiver.getByRole("button", { name: "Receive", exact: true }).click()
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 30_000 },
  )
  await expect(
    receiver.getByText("Via TURN relay · encrypted end to end"),
  ).toBeVisible()
  expect(
    (await readFile((await (await download).path())!)).equals(payload),
  ).toBe(true)

  await receiver.getByRole("button", { name: "Done" }).click()
  await sender.getByRole("button", { name: "Done" }).click()
  await sender.getByRole("tab", { name: "Screen" }).click()
  await sender.getByRole("button", { name: "Choose what to share" }).click()
  await expect(
    sender.getByRole("heading", { name: "Ready to share your screen" }),
  ).toBeVisible({ timeout: 15_000 })
  await receiver.goto(await sender.locator("#share-link").inputValue())
  await receiver.getByRole("button", { name: "View screen" }).click()
  await expect(receiver.getByRole("heading", { name: /screen$/ })).toBeVisible({
    timeout: 30_000,
  })
  await expect(
    sender.getByRole("heading", { name: "You’re sharing your screen" }),
  ).toBeVisible({ timeout: 15_000 })
  await Promise.all([a.close(), b.close()])
})
