# Deploying SignalShare

SignalShare is one Node.js process: Fastify serves the API, the signaling WebSocket (`/api/ws`),
the encrypted relay WebSocket (`/api/relay`) and the Next.js app.

```bash
npm ci
npm run build
NODE_ENV=production npm start        # listens on 0.0.0.0:$PORT
```

Health: `GET /health` (liveness), `GET /ready` (503 until Next is prepared and during shutdown).
`SIGTERM` drains: new sockets are refused, existing ones get close code 1012 so clients reconnect.

## Requirements

- **HTTPS in production.** Browsers only expose WebCrypto, screen capture and the async clipboard in
  a secure context. Put SignalShare behind a TLS-terminating proxy (or set `HTTPS_KEY_FILE` /
  `HTTPS_CERT_FILE`). The proxy must allow WebSocket upgrades on `/api/ws` and `/api/relay` and
  must not buffer them; set idle timeouts ≥ 60 s (clients ping every 20 s).
- **Single instance.** Shares live in memory. Running several instances needs sticky sessions keyed
  on the share _and_ a shared store; neither is implemented. Restarting the process ends active
  shares : clients detect it and say so (direct transfers that are already flowing still finish).

## Environment

| Variable                             | Default                               | Purpose                                                                                                                                                              |
| ------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                               | `3000`                                | Listen port                                                                                                                                                          |
| `BIND_HOST`                          | `localhost` in dev, `0.0.0.0` in prod | Listen address. Dev binds loopback so macOS doesn't prompt about incoming connections                                                                                |
| `TRUST_PROXY`                        | `loopback` (`true` on Render)         | Proxies allowed to set X-Forwarded-For/-Host. Default trusts proxies on this machine (cloudflared, nginx), or Render's load balancer when `RENDER` is set. `true`, `false` or a CIDR list to override |
| `PUBLIC_URL`                         | :                                     | Origin used in share links/QR codes (e.g. `https://share.example.com`). Defaults to the page's own origin                                                            |
| `ALLOWED_ORIGINS`                    | :                                     | Extra origins (comma-separated) allowed to open WebSockets. Same-origin is always allowed                                                                            |
| `STUN_URLS`                          | Google public STUN                    | Comma-separated; set empty to disable                                                                                                                                |
| `TURN_URLS`                          | :                                     | e.g. `turn:turn.example.com:3478,turns:turn.example.com:443?transport=tcp`                                                                                           |
| `TURN_SECRET`                        | :                                     | coturn `static-auth-secret`; enables short-lived credentials (recommended)                                                                                           |
| `TURN_USERNAME` / `TURN_CREDENTIAL`  | :                                     | Static TURN credentials (only if your provider can't do REST auth)                                                                                                   |
| `TURN_TTL_SECONDS`                   | `3600`                                | Lifetime of generated TURN credentials                                                                                                                               |
| `ICE_TRANSPORT_POLICY`               | `all`                                 | `relay` forces TURN-only (hides device IPs from each other; costs TURN bandwidth)                                                                                    |
| `RELAY_ENABLED`                      | `true`                                | Server WebSocket relay fallback for files and text                                                                                                                   |
| `RELAY_MAX_BYTES`                    | `5368709120` (5 GiB)                  | Relay cap per share (cost control)                                                                                                                                   |
| `MAX_SOCKETS_PER_IP`                 | `30`                                  | Concurrent sockets per client IP                                                                                                                                     |
| `MAX_SESSIONS`                       | `5000`                                | Concurrent shares                                                                                                                                                    |
| `METRICS_TOKEN`                      | :                                     | Enables `GET /metrics` (JSON counters) with `Authorization: Bearer <token>`                                                                                          |
| `HTTPS_KEY_FILE` / `HTTPS_CERT_FILE` | :                                     | Serve TLS directly (e.g. mkcert certificates for LAN testing)                                                                                                        |
| `SELF_PING_URL`                      | `$RENDER_EXTERNAL_URL/health` on Render | Keep-alive ping every 14 min so free hosts don't sleep (Render sleeps after 15 min idle). Automatic on Render in production; set a URL elsewhere, or `""` to disable |
| `GITHUB_REPO`                        | `abhie7/signal-share`                   | Repo linked in the header and footer; the star count is fetched server-side hourly. `""` hides the link                                                              |
| `PUSH_ENABLED`                       | on                                      | `false` turns off wake-up pushes for paired devices                                                                                                                 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | generated per process               | Fixed VAPID keys (base64url raw P-256) so push subscriptions survive restarts. Without them devices re-subscribe after a restart, the next time they open the app |
| `VAPID_SUBJECT`                      | `PUBLIC_URL` or a mailto                | Contact URL or `mailto:` sent to push services                                                                                                                     |
| `ALLOWED_DEV_ORIGINS`                | 127.0.0.1, LAN IPs, tunnels           | Dev only: extra hosts allowed to load Next's dev assets and hot-reload socket (comma-separated, `*.example.com` wildcards)                                           |

## Render

SignalShare runs on Render as a Web Service with no extra settings:

- Build `npm ci && npm run build`, start `npm start`. Render provides `PORT`, and WebSockets work out of the box.
- **Keep-alive is automatic:** with `NODE_ENV=production`, the server pings `RENDER_EXTERNAL_URL/health` every 14 minutes, so a
  free instance never reaches the 15-minute idle sleep (which would end waiting shares and add a cold start). The log line
  `keep-alive: pinging every 14 min` confirms it at start-up. A free instance kept awake uses about 744 of the 750 free hours per
  month, so run one free service this way, not two.
- **Proxy trust is automatic:** Render sets `RENDER=true`, so visitor IPs come from Render's load balancer
  (`X-Forwarded-For`). Without it every visitor would share one rate limit and look "nearby".
- Shares live in memory: keep the service at one instance.

## Testing on other devices through a tunnel

A tunnel gives the dev server a public HTTPS address, which is the easiest way to test on phones and
across networks (HTTPS is required for encryption and screen capture):

```bash
npm run dev
cloudflared tunnel --url http://localhost:3000     # or: ngrok http 3000
```

- Restart `npm run dev` after changing `next.config.ts`; `allowedDevOrigins` is read at start-up.
- `*.trycloudflare.com`, ngrok and localtunnel hosts are allowed by default; add others with
  `ALLOWED_DEV_ORIGINS`.
- The tunnel connects from 127.0.0.1, so the default `TRUST_PROXY=loopback` takes each visitor's real
  IP from `X-Forwarded-For` (rate limits and "nearby" grouping stay per visitor).
- Anyone with the tunnel URL can reach your dev server while it runs. Stop the tunnel when done.

## Connection paths and what they need

1. **Direct WebRTC** : free. Works when NATs allow hole punching (most home networks).
2. **TURN** : needed for screen sharing across strict NATs/firewalls and for symmetric NAT on both
   ends. Requires a TURN server; bandwidth flows through it (but it can't decrypt : DTLS is
   end-to-end).
3. **Server relay** (files/text only) : uses the app server's bandwidth: every relayed byte crosses
   it twice (in + out). Payloads are AES-GCM encrypted with the share keys (below).

**Share keys.** Every share runs one ephemeral ECDH through signaling, mixed (HKDF) with the share
secret from the link's `#fragment`, which never reaches the server. Both devices confirm the keys
with HMACs, the relay is sealed with them, and WebRTC (data and screen) is only accepted after each
side MACs its view of the DTLS fingerprints. So whoever opens a link (or answers with a request
link, or receives on a paired device) is protected from a modified server on every route. Code
joins and nearby invites have no secret (the server issues the code): there both screens show a
4-digit security code to compare. Because a code join is always possible, a modified server could
claim a share before the real recipient; the sender is protected automatically only when answering
a request (secret-less joins are refused there), otherwise by comparing the security code.

### Running coturn

```conf
# /etc/turnserver.conf
listening-port=3478
tls-listening-port=443          # TURN over TLS on 443 gets through most corporate firewalls
fingerprint
use-auth-secret
static-auth-secret=<same value as TURN_SECRET>
realm=share.example.com
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
total-quota=200
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
```

Open UDP/TCP 3478, TCP 443, and the relay port range (default UDP 49152–65535). The
`denied-peer-ip` lines stop the TURN server being used to reach your private network.

**Cost guide.** TURN and relay costs are pure egress. A 1 GB file relayed costs ~2 GB of server
traffic; a 1080p screen share uses ~1–3 Mbit/s (≈0.5–1.4 GB/hour) when relayed. Managed TURN
(Cloudflare Calls, Twilio, Metered) bills per GB; self-hosted coturn on a small VM is usually the
cheapest option. Direct connections cost nothing.

## macOS

- **Using SignalShare in a browser needs no firewall change.** All connections from the browser are
  outgoing (HTTPS/WSS to the server, WebRTC/TURN outbound). Never disable the macOS firewall for it.
- **Running the server on a Mac for other devices** (`BIND_HOST=0.0.0.0`) makes macOS ask whether
  `node` may accept incoming connections. Allow it, or other devices can't load the page. The rule
  is per binary path : upgrading Node through nvm creates a new path and a new prompt. If you once
  clicked _Deny_: System Settings › Network › Firewall › Options, remove or allow `node`.
- Other devices must reach the dev server over **HTTPS** (`HTTPS_KEY_FILE`/`HTTPS_CERT_FILE`, e.g.
  with mkcert, trusting its CA on the phone) or via a tunnel; plain `http://192.168.x.x` disables
  encryption and screen capture in the browser.
- **Local Network privacy (macOS 15+).** A browser denied _Local Network_ access can't reach LAN
  addresses, so same-Wi-Fi direct connections fail. SignalShare then falls back to TURN or the
  relay automatically. To restore direct LAN transfers: System Settings › Privacy & Security ›
  Local Network › enable the browser.
- **Screen Recording permission.** Browsers need System Settings › Privacy & Security › Screen &
  System Audio Recording. Without it capture fails with `NotAllowedError`; the app explains this.

## Observability

Structured JSON logs (pino). Each share has a random `logId` (shown to users as "Reference" in
connection details) that ties together `session.created/joined/resumed/ended`, `relay.paired` and
client-reported events (`client.connect.ok {path, ms, tries}`, `client.connect.failed {reasons}`,
`client.transfer.done {bytes, ms, path}`, `client.share.failed {code}`,
`client.screen.capture_failed {name}`, `client.screen.streaming`). Logs never contain file
contents, text, keys, tokens or TURN credentials. `/metrics` exposes the same counters.

## Paired devices and wake-up pushes

Pairing secrets live only in the two browsers' local storage; the server sees a pair id derived
from them, which lets it say when the other device is online and allow invitations across
networks. If a device allowed notifications, the server keeps its push endpoint (in memory) and
can send it an empty push when the other device taps Wake. Pushes carry no content, only go to
browser push services (FCM, Mozilla, Apple, Windows), and are rate limited per pair. Generate
fixed keys once with:

```bash
node -e "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'jwk'});console.log('VAPID_PUBLIC_KEY='+Buffer.concat([Buffer.from([4]),Buffer.from(k.x,'base64url'),Buffer.from(k.y,'base64url')]).toString('base64url'));console.log('VAPID_PRIVATE_KEY='+k.d)"
```

On iPhone and iPad, web push only works once SignalShare is added to the Home Screen.
