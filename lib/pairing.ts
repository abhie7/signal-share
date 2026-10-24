import { create } from "zustand"
import { newId, safeStorage, signaling, SignalingError } from "./signaling"
import type { PairedPeer } from "./protocol"
import { isDeviceKind, type DeviceKind } from "./device"
import { isSecret, newSecret } from "./transfer/handshake"

// "My devices", without accounts. Pairing shares one random secret between two devices (via a
// QR code); it lives only in their local storage. The server sees a pair id derived from it,
// which is enough to tell each device when the other is online, and never the secret. Shares
// between paired devices are keyed with it, so they are verified like a link share.

export interface Pair {
  id: string
  secret: string
  /** What the other device is, learned the first time both were online. */
  device: DeviceKind | null
  name: string | null
  pairedAt: number
}

const KEY = "signalshare-pairs"
/** A QR code nobody scanned stops counting after this long. */
const PENDING_MS = 15 * 60 * 1000

const subtle = () => globalThis.crypto.subtle
const enc = new TextEncoder()
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

async function hmac(secret: string, label: string) {
  const key = await subtle().importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  return new Uint8Array(await subtle().sign("HMAC", key, enc.encode(label)))
}

/** The public handle of a pairing: lets the server match the two devices, reveals nothing. */
export const pairIdOf = async (secret: string) =>
  b64url((await hmac(secret, "signalshare pair id")).subarray(0, 18))

/** Per-share secret for a share between paired devices (same shape as a link secret). */
export const pairShareSecret = async (secret: string, sessionId: string) =>
  b64url((await hmac(secret, `signalshare share ${sessionId}`)).subarray(0, 16))

function load(): Pair[] {
  const raw = safeStorage(() => localStorage.getItem(KEY))
  try {
    const list = JSON.parse(raw ?? "[]") as Pair[]
    return list.filter(
      (p) =>
        isSecret(p.secret) &&
        typeof p.id === "string" &&
        // Unscanned codes expire; real pairs keep their device once matched.
        (p.device !== null || Date.now() - p.pairedAt < PENDING_MS),
    )
  } catch {
    return []
  }
}

export const usePairs = create<{
  pairs: Pair[]
  online: PairedPeer[]
}>(() => ({ pairs: [], online: [] }))

function save(pairs: Pair[]) {
  usePairs.setState({ pairs })
  safeStorage(() => localStorage.setItem(KEY, JSON.stringify(pairs)))
  announce()
}

function announce() {
  if (signaling.status !== "online") return
  signaling.send({
    type: "pair.announce",
    pairIds: usePairs.getState().pairs.map((p) => p.id),
  })
}

export const pairFor = (id: string) =>
  usePairs.getState().pairs.find((p) => p.id === id)

/** Shown as a QR code on this device; the other device opens it to pair. */
export async function startPairing(): Promise<string> {
  const secret = newSecret()
  const pair: Pair = {
    id: await pairIdOf(secret),
    secret,
    device: null,
    name: null,
    pairedAt: Date.now(),
  }
  save([...usePairs.getState().pairs, pair])
  const origin = signaling.welcome?.publicUrl ?? window.location.origin
  return `${origin}/pair#${secret}`
}

/** The /pair page: store the secret from the link. Returns the pair id. */
export async function acceptPairing(secret: string): Promise<string> {
  const id = await pairIdOf(secret)
  if (!pairFor(id))
    save([
      ...usePairs.getState().pairs,
      { id, secret, device: null, name: null, pairedAt: Date.now() },
    ])
  return id
}

export function unpair(id: string) {
  signaling.send({ type: "pair.forget", pairId: id })
  usePairs.setState((s) => ({
    online: s.online.filter((o) => o.pairId !== id),
  }))
  save(usePairs.getState().pairs.filter((p) => p.id !== id))
}

/** Ask the server to push a wake-up to a paired device whose tab is closed. */
export async function wakePair(id: string): Promise<string | null> {
  try {
    await signaling.request(
      { type: "pair.wake", id: newId(), pairId: id },
      15_000,
    )
    return null
  } catch (err) {
    return err instanceof SignalingError ? err.message : "Couldn’t reach it."
  }
}

/** Subscribe this device so paired devices can wake it. Needs a service worker and permission. */
export async function enableWakeups(): Promise<boolean> {
  const key = signaling.welcome?.vapidKey
  if (!key || !("serviceWorker" in navigator) || !("PushManager" in window))
    return false
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission
  if (permission !== "granted") return false
  const reg = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  const current = sub?.options.applicationServerKey
  const keyBytes = Uint8Array.from(
    atob(key.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  )
  // The server's key changed (it restarted without fixed VAPID keys): subscribe again.
  if (
    sub &&
    current &&
    b64url(new Uint8Array(current as ArrayBuffer)) !== b64url(keyBytes)
  ) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes,
  })
  signaling.send({ type: "push.register", endpoint: sub.endpoint })
  return true
}

let watching = false

/** Called from boot(): announce pairs on every (re)connect and keep the online list current. */
export function watchPairs() {
  if (watching) return
  watching = true
  usePairs.setState({ pairs: load() })
  signaling.on("welcome", () => {
    announce()
    // Already allowed earlier: keep the push subscription registered with this server.
    if (
      usePairs.getState().pairs.length &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    )
      void enableWakeups().catch(() => {})
  })
  signaling.on("pairs", (m) => {
    usePairs.setState({ online: m.online })
    // First sight of the other device: remember what it is.
    const pairs = usePairs.getState().pairs
    let changed = false
    const next = pairs.map((p) => {
      const seen = m.online.find((o) => o.pairId === p.id)
      if (!seen || !isDeviceKind(seen.device)) return p
      if (p.device === seen.device && p.name === seen.name) return p
      changed = true
      return { ...p, device: seen.device, name: seen.name }
    })
    if (changed) {
      usePairs.setState({ pairs: next })
      safeStorage(() => localStorage.setItem(KEY, JSON.stringify(next)))
    }
  })
  signaling.on("unpaired", (m) => {
    usePairs.setState((s) => ({
      online: s.online.filter((o) => o.pairId !== m.pairId),
    }))
    save(usePairs.getState().pairs.filter((p) => p.id !== m.pairId))
  })
}
