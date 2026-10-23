import { test, expect } from "@playwright/test"
// Runs against the dev server (port 3213): client navigation there depends on
// Next's HMR socket being routed correctly by server/index.ts.
const DEV = "http://127.0.0.1:3213"

test.skip(!process.env.DEV_E2E, "set DEV_E2E=1 (stop `npm run dev` first)")

test("client navigation works in development", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${DEV}/`)
  const nav = page.locator("header nav")
  await nav.getByRole("link", { name: "History" }).click()
  await expect(page).toHaveURL(/\/history$/, { timeout: 30_000 })
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("History")
  await nav.getByRole("link", { name: "How it works" }).click()
  await expect(page).toHaveURL(/\/docs$/, { timeout: 30_000 })
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "How it works",
  )
  await page.getByRole("link", { name: "Privacy" }).click()
  await expect(page).toHaveURL(/\/privacy$/, { timeout: 30_000 })
  await nav.getByRole("link", { name: "Share" }).click()
  await expect(page).toHaveURL(`${DEV}/`, { timeout: 30_000 })
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Send anything",
  )
  expect(errors.filter((e) => !e.includes("DevTools"))).toEqual([])
})
