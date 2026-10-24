// What kind of device this is, from what the browser reports. Shared with the server, which
// passes it along so the other side can show "iPhone" or "Mac" next to a name.

export const DEVICE_KINDS = [
  "mac",
  "windows",
  "linux",
  "chromeos",
  "android",
  "iphone",
  "ipad",
  "other",
] as const
export type DeviceKind = (typeof DEVICE_KINDS)[number]

export const DEVICE_LABEL: Record<DeviceKind, string> = {
  mac: "Mac",
  windows: "Windows PC",
  linux: "Linux computer",
  chromeos: "Chromebook",
  android: "Android device",
  iphone: "iPhone",
  ipad: "iPad",
  other: "Device",
}

export const isDeviceKind = (v: unknown): v is DeviceKind =>
  DEVICE_KINDS.includes(v as DeviceKind)

export function detectDevice(env: {
  userAgent: string
  platform?: string
  maxTouchPoints?: number
}): DeviceKind {
  const ua = env.userAgent
  const platform = env.platform ?? ""
  if (/iPhone|iPod/.test(ua)) return "iphone"
  // iPadOS asks for desktop sites and says "Macintosh"; touch gives it away.
  if (
    /iPad/.test(ua) ||
    (/Macintosh/.test(ua) && (env.maxTouchPoints ?? 0) > 1)
  )
    return "ipad"
  if (/Android/.test(ua)) return "android"
  if (/CrOS/.test(ua)) return "chromeos"
  if (/Mac/.test(platform) || /Macintosh/.test(ua)) return "mac"
  if (/Win/.test(platform) || /Windows/.test(ua)) return "windows"
  if (/Linux/.test(platform) || /Linux|X11/.test(ua)) return "linux"
  return "other"
}

export function thisDevice(): DeviceKind {
  if (typeof navigator === "undefined") return "other"
  const n = navigator as Navigator & { userAgentData?: { platform?: string } }
  return detectDevice({
    userAgent: n.userAgent,
    platform: n.userAgentData?.platform || n.platform,
    maxTouchPoints: n.maxTouchPoints,
  })
}
