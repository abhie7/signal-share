import { test, expect, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  RELAY,
  bigFile,
  codeOf,
  joinByCode,
  shareFiles,
  twoPages,
} from "./helpers"

async function sendText(sender: Page, text: string) {
  await sender.getByRole("tab", { name: "Text" }).click()
  await sender.getByLabel("Text to send").fill(text)
}

/** Fires a real paste event with plain text, as ⌘V on the page would. */
async function pasteOnPage(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer()
    data.setData("text/plain", value)
    document.body.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true }),
    )
  }, text)
}

test("code is detected, sent as code and highlighted on arrival", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  const code = [
    "interface User { id: number; name: string }",
    "",
    "export function greet(user: User): string {",
    "  return `Hello, ${user.name}`",
    "}",
  ].join("\n")
  await sendText(sender, code)
  await expect(sender.getByRole("radio", { name: /^Code/ })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await sender.getByRole("button", { name: "Share text" }).click()
  await joinByCode(receiver, await codeOf(sender))
  await expect(
    receiver.getByRole("heading", { name: "Text received" }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    receiver.locator(".code-view .hljs-keyword").first(),
  ).toBeVisible()
  await expect(
    receiver.getByRole("button", { name: "Copy code" }),
  ).toBeVisible()
  await expect(receiver.getByLabel("Code", { exact: true })).toContainText(
    "greet(user: User)",
  )
  await close()
})

test("a link arrives as a card with its full domain, never auto-opened", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  await sendText(sender, "https://docs.example.org/guide?step=2")
  await expect(sender.getByRole("radio", { name: "Link" })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await sender.getByRole("button", { name: "Share text" }).click()
  await joinByCode(receiver, await codeOf(sender))
  await expect(
    receiver.getByText("docs.example.org", { exact: true }),
  ).toBeVisible({ timeout: 30_000 })
  const open = receiver.getByRole("link", { name: "Open link" })
  await expect(open).toHaveAttribute(
    "href",
    "https://docs.example.org/guide?step=2",
  )
  await expect(open).toHaveAttribute("rel", /noopener/)
  expect(receiver.context().pages()).toHaveLength(1)
  await close()
})

test("secrets in text are flagged and can be redacted before sending", async ({
  page,
}) => {
  await page.goto("/")
  await sendText(
    page,
    "PORT=3000\nSTRIPE_SECRET_KEY=sk_live_0123456789abcdefghij\ntoken ghp_" +
      "x".repeat(36),
  )
  const alert = page.getByRole("alert").filter({ hasText: "possible secrets" })
  await expect(alert).toContainText("2 possible secrets")
  await expect(page.getByRole("button", { name: "Send anyway" })).toBeVisible()
  await alert.getByRole("button", { name: "Redact" }).click()
  await expect(page.getByLabel("Text to send")).toHaveValue(
    "PORT=3000\nSTRIPE_SECRET_KEY=[redacted]\ntoken [redacted]",
  )
  await expect(page.getByRole("button", { name: "Share text" })).toBeVisible()
})

test("paste anywhere: text goes to Send, a code goes to Receive", async ({
  page,
}) => {
  await page.goto("/")
  await expect(
    page.getByRole("status").filter({ hasText: /\w/ }).first(),
  ).toBeVisible()
  await pasteOnPage(page, "Remember the milk")
  await expect(page.getByRole("tab", { name: "Text" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(page.getByLabel("Text to send")).toHaveValue("Remember the milk")
  await page.getByLabel("Text to send").blur()
  await pasteOnPage(page, "ABC·234")
  await expect(page.getByLabel("Share code")).toHaveValue("ABC234")
  await expect(page.locator("#receive-submit")).toBeFocused()
})

test("either side can pause a transfer; both see who paused it", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser, RELAY)
  await sender
    .locator("input[type=file][multiple]")
    .setInputFiles(await bigFile("pause.bin", 200))
  await sender.getByRole("button", { name: "Share file" }).click()
  const download = receiver.waitForEvent("download", { timeout: 120_000 })
  await joinByCode(receiver, await codeOf(sender))
  await expect(receiver.getByRole("button", { name: "Pause" })).toBeVisible({
    timeout: 30_000,
  })
  await receiver.getByRole("button", { name: "Pause" }).click()
  await expect(receiver.getByText("Paused by you")).toBeVisible()
  await expect(sender.getByText(/^Paused by (?!you)/)).toBeVisible()
  const bar = receiver.getByRole("progressbar")
  await receiver.waitForTimeout(800) // let bytes already in flight land
  const held = await bar.getAttribute("aria-valuenow")
  await receiver.waitForTimeout(1500)
  expect(await bar.getAttribute("aria-valuenow")).toBe(held)
  expect(Number(held)).toBeLessThan(100)
  await expect(receiver).toHaveTitle("Paused · SignalShare")

  // Only the side that paused can resume its pause.
  await expect(sender.getByRole("button", { name: "Pause" })).toBeVisible()
  await receiver.getByRole("button", { name: "Resume" }).click()
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 120_000 },
  )
  await download
  await close()
})

test("a program is never saved automatically and carries a warning", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  const { code } = await shareFiles(sender, [
    { name: "invoice.pdf.exe", buffer: randomBytes(2048) },
  ])
  let downloaded = false
  receiver.on("download", () => (downloaded = true))
  await joinByCode(receiver, code)
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 30_000 },
  )
  await expect(
    receiver.getByText(/looks like a PDF but is a program/),
  ).toBeVisible()
  await expect(receiver.getByText(/can’t scan files/)).toBeVisible()
  await receiver.waitForTimeout(1000)
  expect(downloaded).toBe(false)
  await close()
})

test("received images preview in the page; the server receipt explains what it saw", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  // 1×1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  )
  const { code } = await shareFiles(sender, [
    { name: "dot.png", buffer: png },
    { name: "notes.txt", buffer: Buffer.from("hello from the other side") },
  ])
  await joinByCode(receiver, code)
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 30_000 },
  )
  await receiver.getByRole("button", { name: "Preview notes.txt" }).click()
  const dialog = receiver.getByRole("dialog", { name: "Preview of notes.txt" })
  await expect(dialog).toContainText("hello from the other side")
  await dialog.getByRole("button", { name: "Close" }).click()
  await receiver.getByRole("button", { name: "Preview dot.png" }).click()
  await expect(
    receiver
      .getByRole("dialog", { name: "Preview of dot.png" })
      .getByRole("img"),
  ).toBeVisible()
  await receiver.keyboard.press("Escape")
  await receiver.getByLabel("Select notes.txt").uncheck()
  await expect(
    receiver.getByRole("button", { name: "Save 1 selected" }),
  ).toBeVisible()

  await receiver.getByRole("button", { name: "What the server saw" }).click()
  await expect(
    receiver.getByText("2 file names and sizes", { exact: false }),
  ).toBeVisible()
  await expect(receiver.getByText(/The files’ contents/)).toBeVisible()
  await close()
})

test("the sender can change how long an unused share stays open", async ({
  page,
}) => {
  await page.goto("/")
  await page
    .locator("input[type=file][multiple]")
    .setInputFiles([
      { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("a") },
    ])
  await page.getByRole("button", { name: "Share file" }).click()
  await expect(page.getByText(/30 min left|29 min left/)).toBeVisible()
  await page
    .getByLabel("How long the share stays open if nobody joins")
    .selectOption("1440")
  await expect(page.getByText("24 h left")).toBeVisible()
  await page.getByRole("button", { name: "Revoke link" }).click()
  await expect(
    page.getByRole("heading", { name: "Send", exact: true }),
  ).toBeVisible()
})

test("command palette and shortcut list", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Send", exact: true }),
  ).toBeVisible()
  await page.keyboard.press("ControlOrMeta+k")
  const palette = page.getByRole("dialog", { name: "Command palette" })
  await expect(palette).toBeVisible()
  await page.keyboard.type("send text")
  await page.keyboard.press("Enter")
  await expect(palette).toBeHidden()
  await expect(page.getByRole("tab", { name: "Text" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await page.getByLabel("Text to send").blur()
  await page.keyboard.press("?")
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await page.keyboard.press("r")
  await expect(page.getByLabel("Share code")).toBeFocused()
})

/** A small nested folder on disk: Trip/notes.txt, Trip/day1/a.txt, Trip/day1/b.txt */
function tripFolder() {
  const root = join(mkdtempSync(join(tmpdir(), "signalshare-")), "Trip")
  mkdirSync(join(root, "day1"), { recursive: true })
  writeFileSync(join(root, "notes.txt"), "packing list")
  writeFileSync(join(root, "day1", "a.txt"), "first")
  writeFileSync(join(root, "day1", "b.txt"), "second")
  return root
}

async function shareFolder(sender: Page, dir: string) {
  await sender.locator("input[webkitdirectory]").setInputFiles(dir)
  await expect(
    sender.getByRole("button", { name: "Share 3 files" }),
  ).toBeVisible()
  await expect(sender.getByText("day1", { exact: false }).first()).toBeVisible()
  await sender.getByRole("button", { name: "Share 3 files" }).click()
  return codeOf(sender)
}

test("a folder arrives as a folder in the place the receiver picked", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  // Headless Chrome has no folder picker UI: hand the app a folder in private storage.
  await receiver.evaluate(() => {
    ;(
      window as unknown as { showDirectoryPicker: () => unknown }
    ).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle("picked", {
        create: true,
      })
  })
  const code = await shareFolder(sender, tripFolder())
  await joinByCode(receiver, code)
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 30_000 },
  )
  await expect(
    receiver.getByText("Saved to the folder you chose."),
  ).toBeVisible()
  const tree = await receiver.evaluate(async () => {
    const picked = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("picked")
    const trip = await picked.getDirectoryHandle("Trip")
    const day1 = await trip.getDirectoryHandle("day1")
    const read = async (d: FileSystemDirectoryHandle, n: string) =>
      (await (await d.getFileHandle(n)).getFile()).text()
    return [
      await read(trip, "notes.txt"),
      await read(day1, "a.txt"),
      await read(day1, "b.txt"),
    ]
  })
  expect(tree).toEqual(["packing list", "first", "second"])
  await close()
})

test("without a folder picker, a received folder saves as one zip", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  await receiver.evaluate(() => {
    ;(
      window as unknown as { showDirectoryPicker?: unknown }
    ).showDirectoryPicker = undefined
  })
  const code = await shareFolder(sender, tripFolder())
  await joinByCode(receiver, code)
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 30_000 },
  )
  await expect(
    receiver.getByText("day1", { exact: false }).first(),
  ).toBeVisible()
  const download = receiver.waitForEvent("download")
  await receiver.getByRole("button", { name: "Save as zip" }).click()
  const dl = await download
  expect(dl.suggestedFilename()).toBe("Trip.zip")
  const listing = execFileSync("python3", [
    "-c",
    "import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps(sorted((n,z.read(n).decode()) for n in z.namelist())))",
    (await dl.path())!,
  ]).toString()
  expect(JSON.parse(listing)).toEqual([
    ["Trip/day1/a.txt", "first"],
    ["Trip/day1/b.txt", "second"],
    ["Trip/notes.txt", "packing list"],
  ])
  await close()
})

// Headless Chrome is a private window, where disk storage stops at about 128 MB per file:
// this checks the private-storage path and its fallback to memory, ending with intact bytes.
test("a big share goes to the browser's disk storage, falling back to memory when capped", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  await receiver.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    w.showDirectoryPicker = undefined
    w.showSaveFilePicker = undefined
  })
  const path = await bigFile("opfs.bin", 270)
  await sender.locator("input[type=file][multiple]").setInputFiles(path)
  await sender.getByRole("button", { name: "Share file" }).click()
  const download = receiver.waitForEvent("download", { timeout: 120_000 })
  await joinByCode(receiver, await codeOf(sender))
  await expect(receiver.getByRole("button", { name: "Pause" })).toBeVisible({
    timeout: 30_000,
  })
  const folders = () =>
    receiver.evaluate(async () => {
      const names: string[] = []
      const root = (await navigator.storage.getDirectory()) as unknown as {
        keys(): AsyncIterable<string>
      }
      for await (const n of root.keys()) names.push(n)
      return names.filter((n) => n.startsWith("signalshare-"))
    })
  expect(await folders()).toHaveLength(1)
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    { timeout: 120_000 },
  )
  expect(
    readFileSync((await (await download).path())!).equals(readFileSync(path)),
  ).toBe(true)
  await receiver.getByRole("button", { name: "Done" }).click()
  await expect.poll(folders).toHaveLength(0)
  await close()
})

async function makeRequest(
  asker: Page,
  want: "Files" | "Their screen",
  note = "",
) {
  await asker.getByRole("button", { name: "Request files or a screen" }).click()
  await asker.getByRole("radio", { name: want }).click()
  if (note) await asker.getByLabel("Note for them (optional)").fill(note)
  await asker.getByRole("button", { name: "Get link to send them" }).click()
  await expect(asker.getByText("Waiting for someone to answer")).toBeVisible()
  return asker.getByLabel("Request link").inputValue()
}

test("request files: a first-time visitor answers with one choice, the asker accepts", async ({
  browser,
}) => {
  const { sender: asker, receiver: helper, close } = await twoPages(browser)
  const link = await makeRequest(asker, "Files", "the photos from Saturday")
  await helper.goto(link)
  await expect(
    helper.getByRole("heading", { name: /is asking you for files$/ }),
  ).toBeVisible()
  await expect(helper.getByText("“the photos from Saturday”")).toBeVisible()
  await helper.locator("input[type=file][multiple]").setInputFiles([
    { name: "beach.jpg", mimeType: "image/jpeg", buffer: randomBytes(5000) },
    { name: "cake.jpg", mimeType: "image/jpeg", buffer: randomBytes(7000) },
  ])
  await helper.getByRole("button", { name: /^Send 2 files to / }).click()
  await expect(
    helper.getByRole("heading", { name: /^Waiting for .+ to accept/ }),
  ).toBeVisible()

  const card = asker.getByRole("dialog")
  await expect(card).toContainText("Answer to your request")
  await expect(card).toContainText("wants to send you 2 files")
  await card.getByRole("button", { name: "Accept" }).click()
  await expect(asker.getByRole("heading", { name: "Received" })).toBeVisible({
    timeout: 30_000,
  })
  await expect(helper.getByRole("heading", { name: "Sent" })).toBeVisible()
  await expect(
    asker.getByRole("button", { name: "Save beach.jpg" }),
  ).toBeVisible()

  // Single use: the link is finished now. (A fresh load: the same URL with a #fragment
  // would only scroll.)
  await helper.goto("about:blank")
  await helper.goto(link)
  await expect(
    helper.getByRole("heading", { name: "This request has ended" }),
  ).toBeVisible()
  await close()
})

test("request screen: the visitor shares in one click; declining tells them politely", async ({
  browser,
}) => {
  const { sender: asker, receiver: helper, close } = await twoPages(browser)
  let link = await makeRequest(asker, "Their screen")
  await helper.goto(link)
  await helper.getByRole("button", { name: /^Share my screen with / }).click()
  const card = asker.getByRole("dialog")
  await expect(card).toContainText("is ready to share their screen")
  await card.getByRole("button", { name: "View" }).click()
  await expect(asker.getByRole("heading", { name: /screen$/ })).toBeVisible({
    timeout: 30_000,
  })
  await expect(
    helper.getByRole("heading", { name: "You’re sharing your screen" }),
  ).toBeVisible({ timeout: 15_000 })
  await helper.getByRole("button", { name: "Stop sharing" }).click()
  await asker.getByRole("button", { name: "Done" }).click()

  link = await makeRequest(asker, "Their screen")
  await helper.goto(link)
  await helper.getByRole("button", { name: /^Share my screen with / }).click()
  await asker
    .getByRole("dialog")
    .getByRole("button", { name: "Decline" })
    .click()
  await expect(helper.getByText(/said no thanks/)).toBeVisible({
    timeout: 15_000,
  })
  await close()
})

test("request screen on a phone points to the computer with a QR code", async ({
  browser,
}) => {
  const asker = await browser.newPage()
  await asker.goto("/")
  const link = await makeRequest(asker, "Their screen")
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await phone.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      value: undefined,
    })
  })
  await page.goto(link)
  await expect(page.getByText("Open this on your computer")).toBeVisible()
  await expect(
    page.getByRole("img", { name: "QR code for this request" }),
  ).toBeVisible()
  await phone.close()
  await asker.close()
})

test("keys: a link verifies them with its secret; a code shows the same security code on both screens", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser, RELAY)
  const big = await bigFile("keys.bin", 60)
  await sender.locator("input[type=file][multiple]").setInputFiles(big)
  await sender.getByRole("button", { name: "Share file" }).click()
  const link = await sender.locator("#share-link").inputValue()
  expect(link).toMatch(/#[A-Za-z0-9_-]{22}$/)
  await receiver.goto(link)
  await receiver.getByRole("button", { name: "Receive" }).click()
  for (const page of [sender, receiver]) {
    const chip = page.getByLabel("Keys verified")
    await expect(chip).toBeVisible({ timeout: 30_000 })
    await chip.hover()
    await expect(page.getByRole("tooltip")).toContainText(
      "Keys verified with the link’s secret.",
    )
  }
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    {
      timeout: 60_000,
    },
  )
  await close()

  const second = await twoPages(browser)
  const { code } = await shareFiles(second.sender, [
    { name: "a.bin", buffer: randomBytes(4 * 1024 * 1024) },
  ])
  await joinByCode(second.receiver, code)
  const codes = await Promise.all(
    [second.sender, second.receiver].map(async (page) => {
      const label = page.getByLabel(/^Security code /)
      await expect(label).toBeVisible({ timeout: 30_000 })
      return label.textContent()
    }),
  )
  expect(codes[0]).toMatch(/^\d{4}$/)
  expect(codes[0]).toBe(codes[1])
  await second.close()
})

test("keys: a tampered link secret is caught before anything is sent", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser)
  const { link } = await shareFiles(sender, [
    { name: "secret.bin", buffer: randomBytes(1024) },
  ])
  // Change the first character after "#" (the last one partly holds padding bits).
  const flipped = link.replace(/#(.)/, (_, c) => `#${c === "A" ? "B" : "A"}`)
  await receiver.goto(flipped)
  await receiver.getByRole("button", { name: "Receive" }).click()
  await expect(
    receiver.getByRole("heading", { name: "Security check failed" }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(sender.getByRole("heading", { name: "Sent" })).toBeHidden()
  await close()
})

test("pair two devices once, then send to it from the waiting screen, verified by the pairing", async ({
  browser,
}) => {
  const { sender: laptop, receiver: phone, close } = await twoPages(browser)
  await laptop.getByRole("button", { name: "Pair a device" }).click()
  const link = await laptop.getByLabel("Pairing link").inputValue()
  expect(link).toMatch(/\/pair#[A-Za-z0-9_-]{22}$/)
  await phone.goto(link)
  await expect(
    phone.getByRole("heading", { name: /^Paired with / }),
  ).toBeVisible({
    timeout: 15_000,
  })
  expect(phone.url()).not.toContain("#") // the secret left the address bar
  const devices = laptop.getByRole("region", { name: "My devices" })
  // Listed by the other device's own name and kind ("Sage Albatross · Mac").
  const phoneName = await phone.evaluate(() =>
    localStorage.getItem("signalshare-device-name"),
  )
  const laptopName = await laptop.evaluate(() =>
    localStorage.getItem("signalshare-device-name"),
  )
  await expect(devices.getByText(`${phoneName} · Mac`)).toBeVisible()
  await expect(devices.getByText("Online", { exact: true })).toBeVisible()

  // Survives a reload: the pairing is in local storage on both sides.
  await phone.goto("/")
  await laptop
    .locator("input[type=file][multiple]")
    .setInputFiles([
      { name: "photo.jpg", mimeType: "image/jpeg", buffer: randomBytes(4096) },
    ])
  await laptop.getByRole("button", { name: "Share file" }).click()
  const target = laptop.getByRole("button", { name: `${phoneName} · Mac` })
  await expect(target).toBeEnabled({ timeout: 15_000 })
  await target.click()
  const card = phone.getByRole("dialog")
  await expect(
    card.getByRole("heading", { name: `${laptopName} · Mac` }),
  ).toBeVisible()
  await card.getByRole("button", { name: "Receive" }).click()
  await expect(phone.getByRole("heading", { name: "Received" })).toBeVisible({
    timeout: 30_000,
  })
  await phone.getByLabel("Keys verified").hover()
  await expect(phone.getByRole("tooltip")).toContainText(
    "Keys verified with your device pairing.",
  )

  // Unpairing on one side removes it on the other.
  await phone.getByRole("button", { name: "Done" }).click()
  phone.once("dialog", (d) => d.accept())
  await phone
    .getByRole("region", { name: "My devices" })
    .getByRole("button", { name: "Unpair" })
    .click()
  await laptop.getByRole("button", { name: "Done" }).click()
  await expect(devices.getByText(/^(Online|Offline)$/)).toHaveCount(0, {
    timeout: 15_000,
  })
  await close()
})

test("installable: manifest, icons and the wake-up service worker are served", async ({
  page,
}) => {
  await page.goto("/")
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json()
  expect(manifest.display).toBe("standalone")
  for (const icon of [
    "/icon-192.png",
    "/icon-512.png",
    "/apple-touch-icon.png",
  ])
    expect((await page.request.get(icon)).ok()).toBe(true)
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register("/sw.js")
    await navigator.serviceWorker.ready
    return reg.active?.scriptURL ?? reg.installing?.scriptURL ?? null
  })
  expect(registered).toMatch(/\/sw\.js$/)
})

// A closing tab normally ends its share (a beacon on pagehide). When that beacon is lost, the
// reloaded page reclaims its seat and must redo the key check with fresh keys.
test("a receiver whose leave beacon was lost reclaims its seat after a reload and gets every byte", async ({
  browser,
}) => {
  const { sender, receiver, close } = await twoPages(browser, RELAY)
  const path = await bigFile("reload.bin", 120)
  await sender.locator("input[type=file][multiple]").setInputFiles(path)
  await sender.getByRole("button", { name: "Share file" }).click()
  const link = await sender.locator("#share-link").inputValue()
  await receiver.goto(link)
  await receiver.getByRole("button", { name: "Receive" }).click()
  await receiver.waitForFunction(
    () =>
      Number(
        document
          .querySelector("[role=progressbar]")
          ?.getAttribute("aria-valuenow"),
      ) >= 5,
    null,
    { timeout: 30_000 },
  )
  const download = receiver.waitForEvent("download", { timeout: 120_000 })
  await receiver.route("**/api/sessions/*/leave", (route) => route.abort())
  await receiver.reload()
  await expect(receiver.getByRole("heading", { name: "Received" })).toBeVisible(
    {
      timeout: 120_000,
    },
  )
  expect(
    readFileSync((await (await download).path())!).equals(readFileSync(path)),
  ).toBe(true)
  await expect(sender.getByRole("heading", { name: "Sent" })).toBeVisible()
  await close()
})
