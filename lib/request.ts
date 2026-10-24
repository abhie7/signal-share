import { create } from "zustand"
import { newId, signaling, SignalingError } from "./signaling"
import type { RequestView, RequestWant } from "./protocol"
import { useConnection, type IncomingInvite } from "./store"
import { newSecret } from "./transfer/handshake"

// The requester's side of "send me your files / show me your screen". The other side answers
// with an ordinary share (controller.ts, `answer`); this file only creates, keeps alive and
// closes the request, and turns an answer into an Accept card.

/** The server's view plus the link secret, which stays on this device. */
export type MyRequest = RequestView & { secret: string }

export const useRequest = create<{ mine: MyRequest | null }>(() => ({
  mine: null,
}))

export function requestLink(r: MyRequest) {
  const origin = signaling.welcome?.publicUrl ?? window.location.origin
  return `${origin}/request/${r.requestId}#${r.secret}`
}

export async function createRequest(
  want: RequestWant,
  note: string,
): Promise<string | null> {
  try {
    const view = await signaling.request<RequestView>(
      { type: "request.create", id: newId(), want, note: note.trim() },
      12_000,
    )
    useRequest.setState({ mine: { ...view, secret: newSecret() } })
    return null
  } catch (err) {
    return err instanceof SignalingError
      ? err.message
      : "Couldn’t create the request."
  }
}

/** Forget the request here and on the server. */
export function cancelRequest() {
  const mine = useRequest.getState().mine
  useRequest.setState({ mine: null })
  if (!mine) return
  signaling
    .request({
      type: "request.cancel",
      id: newId(),
      requestId: mine.requestId,
      token: mine.token,
    })
    .catch(() => {})
}

/** Turn down an answer: the sender is told, and the request closes. */
export function declineRequested(invite: IncomingInvite) {
  const mine = useRequest.getState().mine
  useConnection.setState({ invite: null })
  if (!mine || mine.requestId !== invite.requestId) return
  useRequest.setState({ mine: null })
  signaling
    .request({
      type: "request.decline",
      id: newId(),
      requestId: mine.requestId,
      token: mine.token,
      sessionId: invite.sessionId,
    })
    .catch(() => {})
}

/** Called from boot(): keeps the request attached across reconnects and surfaces answers. */
export function watchRequests() {
  let welcomed = false
  signaling.on("welcome", () => {
    const mine = useRequest.getState().mine
    if (welcomed && mine)
      signaling
        .request({
          type: "request.resume",
          id: newId(),
          requestId: mine.requestId,
          token: mine.token,
        })
        .catch(() => useRequest.setState({ mine: null })) // expired while we were away
    welcomed = true
  })
  signaling.on("requested", (m) => {
    if (useRequest.getState().mine?.requestId !== m.requestId) return
    useConnection.setState({
      invite: {
        sessionId: m.sessionId,
        from: m.from,
        kind: m.kind,
        files: m.files,
        totalSize: m.totalSize,
        requestId: m.requestId,
        keyed: m.keyed,
      },
    })
  })
}
