# SignalShare : project guide for Claude

Cross-device sharing (files, text, screen) in the browser. No accounts, nothing stored server-side.
One Node process: Fastify (API + signaling + relay) in front of Next.js 16 (App Router, React 19).

Deeper docs: `docs/AUDIT.md` (why v1 failed and how it was fixed), `docs/DEPLOYMENT.md` (env vars,
TURN, costs, macOS), `README.md`.

## Commands

```bash
npm run dev                 # tsx watch server/index.ts → http://localhost:3000 (binds loopback)
npm run build && npm start  # production (binds 0.0.0.0)
npm test                    # node:test via tsx: tests/*.test.ts (unit + server integration)
npm run build && npm run test:e2e        # Playwright; starts its own servers on 3210/3211
TURN_E2E=1 npm run test:e2e              # + real coturn on 3478 (brew install coturn) and server on 3212
DEV_E2E=1 npm run test:e2e               # + dev-server navigation test (stop your own `npm run dev` first)
npm run lint && npm run typecheck
```

E2E runs against the **production build** : rebuild after UI changes or the tests exercise stale code.
Always run all of: `npm test`, `npm run lint`, `npm run typecheck`, build, e2e before calling work done.

## Architecture

```
lib/protocol.ts     Versioned signaling protocol (PROTOCOL_VERSION=3) + validation. Shared by client & server.
lib/signaling.ts    Singleton WebSocket client: reconnect w/ jittered backoff forever, 20 s ping / 45 s dead,
                    request()/reply correlation; in-flight requests are replayed after reconnect.
lib/controller.ts   Owns the ONE active share: start/join/cancel/retry, resume after reconnect, screen share.
                    UI calls these functions; components never touch sockets/peer connections/timers.
lib/device.ts       Device kind (Mac, iPhone, Android…) from the UA; sent in hello, shown next to names.
lib/pairing.ts      My devices: pair secrets in localStorage, pair ids announced, online list, wake pushes.
lib/recent.ts       Recent devices (name + device kind) in localStorage, with an off switch (History page).
lib/request.ts      Requester side of request links (create/cancel/decline, resume on reconnect, Accept card).
lib/content.ts      Text classification (link / code / text), share-code and share-link detection for paste.
lib/secrets.ts      Credential patterns + redact(); runs only in the sender's browser, warns, never blocks.
lib/risky.ts        Program / script / macro / disguised-name detection and the precaution copy.
lib/preview.ts      Which received files preview in-page, typed by extension (markup never rendered).
lib/machine.ts      Phase union + allowed transitions. lib/store.ts setPhase() refuses invalid transitions.
lib/store.ts        zustand: useShare (share state), useConnection (socket status, name, nearby, invite).
lib/transfer/
  connect.ts        Connection ladder: WebRTC data channel (STUN/TURN) → /api/relay WS. Receiver initiates
                    (`connect` signal), sender picks the rung. A path counts only after ping/pong over it.
  rtc.ts            Peer: RTCPeerConnection bound to (session, attempt); queues early ICE candidates.
  pipe.ts           Pipe abstraction: dataChannelPipe, relayPipe (AES-GCM sealed), memoryPipePair (tests).
  frames.ts         Wire format: binary [u32 file][f64 offset][≤60 KiB] + JSON control frames (incl. pause).
  sender.ts         FileSender: windowed (8 MiB unacked), resumes from receiver's `ready`.
  receiver.ts       FileReceiver: authoritative position, per-chunk SHA-256 folded per file, `complete`.
                    Writes through a FileSink; switches to its fallback sink if a write fails (quota).
  sink.ts           FileSink: memory (Blobs), disk (File System Access file/folder the user picked) or opfs
                    (private storage). pickSink() runs inside the Receive click; safePath() for folders.
  crypto.ts         WebCrypto helpers (needs secure context).
  handshake.ts      Share keys: ECDH + link secret (HKDF), HMAC confirmations, DTLS fingerprint labels, SAS.
server/
  index.ts          Next + Fastify wiring, HMR upgrade routing, SIGTERM drain.
  app.ts            buildApp(): routes (/health /ready /metrics /api/sessions/:id[/leave] /api/ws /api/relay),
                    origin check, security headers. Importable without Next (used by tests).
  hub.ts            Signaling hub + relay rooms, presence, rate limits, sweep timer, structured logs.
  push.ts           Payload-less Web Push (VAPID JWT), push-service host allowlist.
  requests.ts       RequestRegistry: request links (want files|screen, note), single-use claim, 30 min expiry.
  sessions.ts       SessionRegistry: create/join idempotent by request id, participant tokens, resume,
                    single-use 6-char codes, expiry + away-grace sweep. Pure; takes `now` for tests.
  config.ts         Env parsing; iceServersFor() makes TURN REST credentials (HMAC-SHA1).
components/
  brand.tsx         Identity: LogoMark/LogoTile (rocket), Ambient (topo + washes), Glass, Morph, Avatar,
                    SignalOrbit, SignalBridge.
  kokonutui/       Vendored KokonutUI (MIT): topo-background, morphic-navbar, dynamic-text, scroll-index. Patches noted in headers.
  home.tsx          Send (Files/Text/Screen) + Receive; page-wide paste routing; listens for `ss:command`.
  session-view.tsx  The active share; text-result.tsx (link card / code / text), received-files.tsx
                    (thumbnails, preview dialog, selection, risk notes), code-view.tsx (lazy highlight.js).
  shortcuts.tsx     ⌘K palette, ? list, R/S/Esc; dispatches `ss:command` events that Home acts on.
  screen-stage.tsx, invite-prompt.tsx, content-page.tsx, ui-kit.tsx
app/                page.tsx (home ↔ session), receive/[id], request/[id], pair, history, docs, privacy,
                    change-logs, manifest.ts. public/sw.js is the wake-up service worker.
```

### Invariants : don't break these

- **Success is confirmed by the other side.** Sender completes only on the receiver's `complete`;
  screen "streaming" only once frames decode (`getStats` framesDecoded > 0). Never mark success on a
  signaling message.
- **Only the receiver retries** path establishment; the sender only answers. Prevents dueling attempts.
- **Every server request is idempotent** (keyed by request `id`) so `signaling.request` can replay it.
- **Signals are routed by session membership**, never to an arbitrary peer id.
- **Tokens never go in URLs** (relay auth is the first WS frame) : URLs end up in logs.
- **`getDisplayMedia` must be called synchronously inside the click handler** (`shareScreen`,
  `changeSource`); any `await` before it loses user activation in Safari/Firefox.
- **Boot is idempotent** (`boot()` in AppShell) : React StrictMode double-mounts; the old app died here.
- Server state is in memory → single instance. Don't add features that assume durability.
- **Proxies/tunnels:** `TRUST_PROXY` defaults to `loopback` (cloudflared/nginx on this machine), so `req.ip`
  is the real visitor. The WS origin check accepts `req.host` (forwarded host from a trusted proxy).
  Tunnel domains are in `allowedDevOrigins`; restart dev after changing next.config.ts.
- **Render:** `RENDER` makes proxy trust `true`; in production `RENDER_EXTERNAL_URL/health` is pinged every 14 min
  (`selfPingTarget`/`trustProxySetting` in server/config.ts, unit-tested). Don't remove the keep-alive: free instances sleep.
- **GitHub link:** `/api/repo` fetches the star count server-side (hourly cache, failures back off 5 min) so clients never
  call GitHub and the CSP stays same-origin. `GITHUB_REPO` sets the repo ("" hides it).
- **Screen quality:** capture capped at 1080p60 (`CAPTURE_SIZE`); `QUALITY.smooth` (motion, maintain-framerate,
  12 Mbps, 60 fps, default) / `QUALITY.sharp` (detail, maintain-resolution, 8 Mbps, 30 fps). Encoding limits go in
  `addTransceiver(..., { sendEncodings })` (Chrome refuses adding them later); H.264 preferred; the sharer munges the
  answer with `withStartBitrate(sdp, 4000)` so the stream isn't 360p for the first seconds. Headless e2e can't show 60 fps.
- **Received content is untrusted.** Previews build their own blob with a type from the extension
  (`previewOf`), never the sender's MIME type; HTML/SVG/XML are shown as text, never rendered (a blob URL
  runs with this origin). Only http(s) links become clickable (`asLink`). highlight.js output is escaped.
- **Risky files** (`riskOf`) are never auto-saved, even when they are the only file.
- **Esc cancels only before data moves** (creating/waiting/joining/connecting). Single-key shortcuts never
  fire in text fields or while a dialog is open; ⌘K is the only browser shortcut we take.
- **Share keys (handshake.ts):** per-share ECDH via signaling (`k:"key"`/`"key-ok"`), HKDF-mixed with the
  link's `#secret` (`isSecret`, 128-bit, never sent; kept with the seat in sessionStorage). The sender
  proves first ("confirm sender") and the receiver checks it with its own copy of the secret. The relay
  uses `keys.relay`; WebRTC data channels exchange `{t:"auth"}` tags over `dtlsLabel` before counting;
  screen shares exchange `k:"auth"` signals and the sharer attaches tracks (`replaceTrack`) only after
  the viewer's tag checks out. Any mismatch is a `SECURITY` failure, never retried. Request links carry
  the requester's secret; answers set `keyed` so the asker uses it, and the answering sender sets
  `strictKeys` (secret-less joins refused). Other senders accept code joins, so they are protected from
  a malicious server only via the security code. A new hello clears the sender's old keys; a receiver
  timing out clears its keys so the next attempt redoes the handshake. PROTOCOL_VERSION is 3.
- **Relay frames are all sealed** (control too), with AAD = sending role + per-direction sequence:
  no forged, reordered, replayed or reflected frames. Pipes buffer messages while `onmessage` is null,
  so the handover from the path check to the transfer can't drop the first frames.
- **Pause** is per side (`pauseMine`/`pausePeer`, FileSender `pausedHere`/`pausedThere`); each side
  resumes only its own pause, and every new pipe carries our pause state.
- **Disk writes commit only after the digest matches** (writable `close()` in `finish`). The disk sink never
  overwrites (`freeName`), and sender paths go through `safePath` (no "..", absolute or empty segments).
- **Folders** travel as files whose `name` is the relative path (`pathOf`); only folders over 500 files or
  48 KB of names are zipped by the sender. Receivers without a folder picker get `zipStore` (store-only zip).
- **Request links:** answering creates an ordinary share owned by the person answering, then `request.fulfil`
  (after `watchSession`, so a fast Accept isn't missed). The requester gets `requested` → Accept card →
  `join({sessionId})`. First answer uses the request up; `request.decline` ends that share with reason
  `declined`. The request page must stay one sentence and one button: it is usually a first visit.
- **Pairing:** the server only ever sees pair ids (`pairIdOf` = HMAC of the secret). Invitations across
  networks are allowed only between devices that both announced the pair id. Shares between paired
  devices are keyed with `pairShareSecret(secret, sessionId)` (mode `pair`), so they verify like links.
- **Wake pushes** have no payload (nothing to leak, no payload encryption), go only to allowlisted push
  hosts (`isPushEndpoint`), and are rate limited per pair. Endpoints live in memory.
- **Expiry:** `session.expire` (10/30/60/1440 min) only while unclaimed; a claim gets 12 h from the claim.
- Requires a secure context (HTTPS or localhost). `http://192.168.x.x` disables crypto/capture.
- **Dev server routes every `/_next/` WebSocket upgrade to Next** (`server/index.ts`). Next 16.4 moved
  HMR to `/_next/hmr`; routing only the old path broke client navigation in dev. `e2e/navigation.spec.ts`
  (DEV_E2E=1) runs against a dev server to catch this. `allowedDevOrigins` (next.config.ts) admits 127.0.0.1/LAN IPs.

## Design identity (user preference : keep it)

SignalShare has its own look, kept restrained. Rejected so far: a generic minimal redesign, an
over-saturated one (loud blobs), pointer-following card highlights, and "vibe-coded" decoration
(gradient text, glowing gradient icon tiles, pulsing dots, numbered gradient steps, eyebrow pills).

- **Brand:** original rocket logo (`LOGO_PATH` in brand.tsx, `public/favicon.svg`). Teal `#03dad3`
  anchor (`--teal`), plus `--sky --violet --coral --amber --mint` used sparingly (task icons, states).
  Task colours: files = teal, text = violet, screen = coral, receive = sky. Default theme dark.
- **Type:** Google Sans Flex (`--font-flex`, axes opsz/wdth/ROND/GRAD; display uses `ROND`) and
  Google Sans Code for codes (`--font-gcode`), self-hosted via `next/font`.
- **Background:** KokonutUI TopoBackground with `listenOn="window"` (our documented patch): the
  cursor raises a hill, clicks on empty space send a ripple. Slow (`speed 0.35`), no labels, tinted by
  mood (`[data-mood]` on `.ambient`), two very faint washes. Keep it **toned down**.
- **Glass:** `.liquid` = translucent, not frosted: thin fill (`--glass-a/-b`, roughly 16 to 26% alpha) over a
  12px backdrop blur, faint top glow, gradient rim. Never put `filter`/`opacity` < 1 on an ancestor of a card
  (it stops the backdrop blur); animated wrappers clear `filter` via `transitionEnd`.
  It never reacts to the pointer. "Fluid" comes from shape change: `Morph` springs the session
  card's height, `layoutId` tab pill, blur-swap transitions, spring page transitions.
- **Navigation:** KokonutUI MorphicNavbar (split segments, scrub, folds on scroll), centred in the
  header on `sm+`, floating bottom bar on phones. Patched to import `framer-motion` and use
  `--nav-surface/--nav-text/--nav-text-active` + teal accent. It relies on Tailwind's default radius
  scale (`rounded-xl` = 12px); don't redefine `--radius-*` in `@theme`.
- **Avatars:** DiceBear `https://api.dicebear.com/10.x/voxel-art/svg?seed=<name>&backgroundColor=00000000`
  on a bevelled voxel-block tile (`.voxel`), initials fallback. CSP allows api.dicebear.com.
- **Hero:** "Send anything to" + `HeroLine` in `components/home.tsx`: `HERO_WORDS` drawn from a shuffle bag
  (`lib/shuffle.ts`, no repeats within a round), word-wrapped with canvas measurement at full heading size, one
  controlled KokonutUI DynamicText (unmodified, single-line only) per wrapped line. The block reserves rows for
  the longest phrase at the current width, so the page never moves. Phrases can be any length.
- **Changelog:** KokonutUI ScrollIndex (`scroller="window"`, `selector="h2"`, `offset={96}` for the sticky
  header) beside the release list; release `<h2>` holds only the version because it becomes the tick label.
  Add new releases at the top of `changelogs` in `app/change-logs/page.tsx` with every change listed.
  The page opens with a first-person **Devlog** (V1 to V2) written in the owner's voice, with before/after
  landing screenshots in `public/devlog/` (`DevlogCompare`). Keep it; it's a keepsake, not marketing.
- **How it works:** `ArchitectureDiagram` (hand-built SVG, SMIL packets, route switcher Direct/TURN/Relay that
  auto-walks the fallback ladder; static under reduced motion). Keep it in sync if the connection ladder changes.
- **Signal motifs, not decoration:** SignalOrbit (real nearby devices), SignalBridge (data flow).
- **Upload UX** (after KokonutUI file-upload): page-wide drag arms the zone, zone hover shows file
  count, image thumbnails, extension badges, summary row, focus returns to the zone on remove.
- Every clickable element gets `cursor: pointer` (global base rule in globals.css; disabled =
  `not-allowed`). Non-interactive buttons opt out with `cursor-default`.
- Motion: springs (`bounce` ≤ 0.2), transform/opacity except Morph height, everything respects
  `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`.
- CSS: Tailwind v4; component classes in `@layer components` so utilities can override them.

## Conventions

- Formatting: Prettier with `.prettierrc` (no semicolons, double quotes, single quotes in JSX).
  Run `npx prettier --write` on files you touch. Don't reformat `components/kokonutui/**`.
- **No em dashes** anywhere (code, copy, docs). Use a comma, colon, period or parentheses.
- TypeScript strict; small focused files.
- Server modules import with `.js` suffix (ESM under tsx); client code uses `@/` alias.
- Tests: node:test + assert for logic; Playwright e2e for real browser/WebRTC flows. Add a test with
  every protocol or lifecycle change. Use `memoryPipePair` for transfer-protocol tests.
- Browser-only values in render: `useClientValue` (useSyncExternalStore), not setState-in-effect.
- Vendored third-party UI lives in `components/kokonutui/` with its MIT header and a note on any
  patch; ESLint's React-compiler rules are disabled for that folder only.
- No new dependencies without a clear reason; framer-motion, zustand, sonner, qrcode, jszip, idb,
  @hugeicons are the UI stack. highlight.js is loaded with a dynamic `import()` only when text looks like code. Verify an icon exists in
  `node_modules/@hugeicons/core-free-icons/dist/esm/<Name>.js` before using it.
- Copy is plain and specific; errors say what happened and what to do (see `errorFrom`, `noPathError`).

## Known limits / debt

- A reload restarts a receive (the sender's files live only in the sender's tab).
- Code joins and nearby invites can't be verified against a malicious server automatically (the server
  issues codes); they rely on users comparing the 4-digit security code. Link and QR shares are verified.
- First device to open a link/code claims the share; no sender approval step.
- Screen share is 1:1; no fallback without TURN.
- Not yet verified on real separate devices/networks, Safari, or Firefox (Chromium e2e only).
