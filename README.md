<p align="center">
  <img src="public/favicon.svg" width="72" alt="SignalShare logo" />
</p>

# SignalShare

Send files, text or your screen between any two devices : same Wi‑Fi or across the world.
No accounts, no storage. Direct WebRTC when the network allows it, TURN or an end-to-end
encrypted relay when it doesn't.

## How it works

```
 Sender ──WSS──┐                         ┌──WSS── Receiver
               ├── Fastify: signaling ───┤
               │   (sessions, routing)   │
               └─────────────────────────┘
        1. WebRTC data channel / media  (direct, or via TURN)        ← preferred
        2. /api/relay WebSocket, AES-GCM sealed by the devices      ← files & text fallback
```

- **One connection manager** (`lib/transfer/connect.ts`) walks the ladder with a deadline per rung
  and records why each failed. A path counts only after a ping/pong crossed it.
- **One transfer protocol** (`lib/transfer/frames.ts`, `sender.ts`, `receiver.ts`) over either pipe:
  the receiver announces where to (re)start, acknowledges bytes (backpressure + honest sender
  progress), verifies a per-file SHA-256 chain, and confirms completion. Drops resume from the last
  verified byte.
- **Sessions with participant tokens** (`server/sessions.ts`): reconnecting sockets re-attach
  instead of losing the share; create/join are idempotent; codes are single-use.
- **One lifecycle** (`lib/machine.ts`, `lib/controller.ts`): explicit phases with validated
  transitions drive the whole UI.

Details: [docs/AUDIT.md](docs/AUDIT.md) (what was broken and why) and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (environment, TURN, costs, macOS).

## Run locally

```bash
npm install
npm run dev            # http://localhost:3000
```

Open two browser windows (or a normal and a private window) to try a transfer. To use other
devices on your network, serve over HTTPS : see _macOS_ in the deployment guide.

## Production

```bash
npm run build
npm start
```

Behind a TLS proxy with WebSocket support. Configure TURN for reliable screen sharing across
restrictive networks. All variables are listed in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tests

```bash
npm test               # unit + server integration (node:test)
npm run build && npm run test:e2e        # Playwright: real browsers, real WebRTC
TURN_E2E=1 npm run test:e2e              # + real coturn (brew install coturn)
DEV_E2E=1 npm run test:e2e               # + dev-server navigation (stop npm run dev first)
npm run lint && npm run typecheck
```

The e2e suite covers direct transfer, forced relay fallback, mid-transfer drop and resume, text,
cancellation, invalid/claimed/expired shares, screen sharing with decoded frames, denied capture,
and mobile layout.

## Project layout

```
app/              Next.js routes (home, receive/[id], history, docs, privacy, change-logs)
components/       UI (brand, home, session-view, screen-stage, …)
lib/protocol.ts   Versioned signaling protocol + validation (shared with the server)
lib/signaling.ts  WebSocket client: reconnect, heartbeat, request/response
lib/controller.ts Share lifecycle orchestration
lib/transfer/     Pipes, connection manager, sender/receiver, crypto
server/           Fastify app, signaling hub + relay, session registry, config
tests/, e2e/      node:test and Playwright suites
```

## Credits

- [KokonutUI](https://kokonutui.com) (MIT): Topo Background, Morphic Navbar, Dynamic Text and Scroll Index, vendored in `components/kokonutui/`; File Upload inspired the drop zone.
- Type: Google Sans Flex and Google Sans Code.
- Avatars: [DiceBear](https://www.dicebear.com) voxel-art.

## License

MIT : see `LICENSE`.
