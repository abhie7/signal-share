import { create } from "zustand"
import type { FileMeta, SessionView, ShareKind } from "./protocol"
import type { SignalingStatus } from "./signaling"
import type { PathKind } from "./transfer/pipe"
import type { Attempt } from "./transfer/connect"
import { canTransition, type Phase } from "./machine"

export interface ShareError {
  title: string
  detail: string
  retryable: boolean
  code: string
}

export interface ReceivedItem {
  name: string
  size: number
  type: string
  url: string
}

export interface ShareState {
  phase: Phase
  role: "sender" | "receiver" | null
  kind: ShareKind | null
  session: SessionView | null
  files: FileMeta[]
  totalBytes: number
  doneBytes: number
  speed: number
  path: PathKind | null
  attempts: Attempt[]
  peerName: string | null
  peerOnline: boolean
  error: ShareError | null
  /** Free-form status line for the current phase ("Direct connection blocked : using relay"). */
  note: string | null
  received: ReceivedItem[]
  text: string | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  paused: boolean
  startedAt: number | null
}

export const initialShare: ShareState = {
  phase: "idle",
  role: null,
  kind: null,
  session: null,
  files: [],
  totalBytes: 0,
  doneBytes: 0,
  speed: 0,
  path: null,
  attempts: [],
  peerName: null,
  peerOnline: false,
  error: null,
  note: null,
  received: [],
  text: null,
  localStream: null,
  remoteStream: null,
  paused: false,
  startedAt: null,
}

export const useShare = create<ShareState>(() => ({ ...initialShare }))

/** Validated phase change. Invalid transitions are refused (and logged) instead of corrupting the UI. */
export function setPhase(to: Phase, patch: Partial<ShareState> = {}): boolean {
  const from = useShare.getState().phase
  if (!canTransition(from, to)) {
    console.warn(`[share] ignored transition ${from} → ${to}`)
    return false
  }
  useShare.setState({ ...patch, phase: to })
  return true
}

export const patchShare = (patch: Partial<ShareState>) =>
  useShare.setState(patch)

export interface NearbyPeer {
  id: string
  name: string
}

export interface IncomingInvite {
  sessionId: string
  from: string
  kind: ShareKind
  files: FileMeta[]
  totalSize: number
}

interface ConnectionState {
  status: SignalingStatus
  name: string
  peerId: string
  relay: boolean
  turn: boolean
  nearby: NearbyPeer[]
  invite: IncomingInvite | null
}

export const useConnection = create<ConnectionState>(() => ({
  status: "offline",
  name: "",
  peerId: "",
  relay: true,
  turn: false,
  nearby: [],
  invite: null,
}))
