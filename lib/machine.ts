// One explicit lifecycle for every share, sender or receiver, files or screen.
// The UI renders from `phase`; nothing else decides what the user sees.

export type Phase =
  | "idle"
  | "preparing" // packing folders / reading input
  | "requesting_permission" // screen capture picker is open
  | "creating" // registering the share with the server
  | "waiting" // share is live, nobody joined yet
  | "joining" // recipient: claiming the share
  | "connecting" // finding a working data/media path
  | "negotiating" // screen: path found, waiting for frames to decode
  | "transferring"
  | "streaming"
  | "reconnecting"
  | "completed"
  | "ended" // screen share stopped normally
  | "cancelled"
  | "failed"

export const TERMINAL: ReadonlySet<Phase> = new Set([
  "completed",
  "ended",
  "cancelled",
  "failed",
])

const T: Record<Phase, readonly Phase[]> = {
  idle: ["preparing", "requesting_permission", "creating", "joining"],
  preparing: ["creating", "cancelled", "failed"],
  requesting_permission: ["creating", "cancelled", "failed"],
  creating: ["waiting", "failed", "cancelled"],
  waiting: ["connecting", "negotiating", "failed", "cancelled", "ended"],
  joining: ["connecting", "failed", "cancelled"],
  connecting: [
    "negotiating",
    "transferring",
    "streaming",
    "reconnecting",
    "completed",
    "failed",
    "cancelled",
    "ended",
  ],
  negotiating: ["streaming", "reconnecting", "failed", "cancelled", "ended"],
  transferring: ["completed", "reconnecting", "failed", "cancelled"],
  streaming: ["reconnecting", "negotiating", "ended", "failed", "cancelled"],
  reconnecting: [
    "connecting",
    "negotiating",
    "transferring",
    "streaming",
    "completed",
    "failed",
    "cancelled",
    "ended",
  ],
  completed: [],
  ended: [],
  cancelled: [],
  failed: [],
}

export function canTransition(from: Phase, to: Phase): boolean {
  return from === to || to === "idle" || T[from].includes(to)
}

export const isActive = (p: Phase) => p !== "idle" && !TERMINAL.has(p)
