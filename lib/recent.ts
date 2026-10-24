import { safeStorage } from "./signaling"
import { isDeviceKind, type DeviceKind } from "./device"

// Devices you recently shared with, kept only in this browser (local storage), with an off
// switch. Names are the other device's SignalShare name, which it keeps across visits.

export interface RecentDevice {
  name: string
  device: DeviceKind
  lastAt: number
  sent: number
  received: number
}

const KEY = "signalshare-recent"
const OFF_KEY = "signalshare-recent-off"
const MAX = 12

export const recentEnabled = () =>
  safeStorage(() => localStorage.getItem(OFF_KEY)) !== "1"

export function setRecentEnabled(on: boolean) {
  safeStorage(() => {
    if (on) localStorage.removeItem(OFF_KEY)
    else {
      localStorage.setItem(OFF_KEY, "1")
      localStorage.removeItem(KEY)
    }
  })
}

export function recentDevices(): RecentDevice[] {
  try {
    const list = JSON.parse(
      safeStorage(() => localStorage.getItem(KEY)) ?? "[]",
    ) as RecentDevice[]
    return list.filter(
      (d) => typeof d.name === "string" && isDeviceKind(d.device),
    )
  } catch {
    return []
  }
}

/** Pure, for tests: the list after one more share with `name`. Newest first, deduplicated. */
export function withShare(
  list: RecentDevice[],
  share: { name: string; device: DeviceKind; direction: "sent" | "received" },
  now = Date.now(),
): RecentDevice[] {
  const prev = list.find(
    (d) => d.name === share.name && d.device === share.device,
  )
  const entry: RecentDevice = {
    name: share.name,
    device: share.device,
    lastAt: now,
    sent: (prev?.sent ?? 0) + (share.direction === "sent" ? 1 : 0),
    received: (prev?.received ?? 0) + (share.direction === "received" ? 1 : 0),
  }
  return [entry, ...list.filter((d) => d !== prev)].slice(0, MAX)
}

export function recordShare(share: {
  name: string
  device: DeviceKind
  direction: "sent" | "received"
}) {
  if (!recentEnabled()) return
  const next = withShare(recentDevices(), share)
  safeStorage(() => localStorage.setItem(KEY, JSON.stringify(next)))
}

export function clearRecent() {
  safeStorage(() => localStorage.removeItem(KEY))
}
