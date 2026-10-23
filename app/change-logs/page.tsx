import { ContentPage } from "@/components/content-page"
import ScrollIndex from "@/components/kokonutui/scroll-index"
import { DevlogCompare } from "@/components/devlog-compare"

export const metadata = {
  title: "Changelog : SignalShare",
  description: "Latest updates and improvements to SignalShare.",
}

const changelogs: Array<{
  date: string
  version: string
  summary?: string
  changes: Array<{ type: string; title: string; description: string }>
}> = [
  {
    date: "October 23, 2026",
    version: "2.5.0",
    summary:
      "The GitHub link is back, How it works gets a living diagram, and Render deploys stay awake on their own.",
    changes: [
      {
        type: "new",
        title: "GitHub link with star count",
        description:
          "SignalShare is open source again on every page: a GitHub pill with the live star count in the header on wide screens, and “Open source on GitHub” in the footer everywhere. Unlike 1.x’s embedded widget, the count is fetched by our server once an hour, so your browser never contacts GitHub and the security policy stays same-origin. If GitHub is unreachable the link still shows, without a count.",
      },
      {
        type: "new",
        title: "Architecture diagram on How it works",
        description:
          "A hand-built, theme-aware SVG of how two devices connect: both find each other through the SignalShare server, then data takes the first route that works. Packets flow along the active route; switch between Direct, Via TURN and Encrypted relay, or let it walk the fallback ladder on its own, with blocked routes marked. Static with reduced motion, and it scrolls sideways on narrow phones so labels stay readable.",
      },
      {
        type: "fix",
        title: "Render instances no longer fall asleep",
        description:
          "1.x pinged its own /health every 14 minutes; 2.0 only did that when SELF_PING_URL was set, so a free Render instance slept after 15 idle minutes, ending waiting shares and adding a cold start. In production on Render the server now pings RENDER_EXTERNAL_URL/health automatically and logs that it is doing so; failures are logged too.",
      },
      {
        type: "fix",
        title: "Real visitor IPs on Render",
        description:
          "Behind Render’s load balancer every request arrived from the balancer, so all visitors shared one rate limit and showed up as “nearby”. When Render’s RENDER variable is present, forwarded client IPs are trusted automatically.",
      },
      {
        type: "testing",
        title: "Tests for deploy defaults and the repo link",
        description:
          "Unit tests for the keep-alive target and proxy-trust defaults (local, Render, explicit overrides), and a server test that the repo link survives GitHub being down without retrying on every request.",
      },
      {
        type: "docs",
        title: "Deploying on Render",
        description:
          "docs/DEPLOYMENT.md has a Render section (build and start commands, automatic keep-alive, free-hour budget, one instance) and new GITHUB_REPO and SELF_PING_URL defaults.",
      },
    ],
  },
  {
    date: "October 23, 2026",
    version: "2.4.2",
    summary: "A devlog at the top of this page.",
    changes: [
      {
        type: "docs",
        title: "Devlog: from 1.2.4 to 2.4",
        description:
          "A first-person story of how SignalShare started, what 1.2.4 got wrong (and right), and what changed in the rebuild, with real before and after screenshots of the landing page on desktop and phone. The 1.2.4 shots were taken from the original public repository, built and run locally; images live in public/devlog/.",
      },
    ],
  },
  {
    date: "October 23, 2026",
    version: "2.4.1",
    summary:
      "Works when the dev server is shared through a tunnel such as cloudflared.",
    changes: [
      {
        type: "fix",
        title: "Tunnels blocked by the dev server (403 and failed wss)",
        description:
          "Next’s dev server only serves its own assets and hot-reload socket to localhost, so through a cloudflared tunnel the dev font returned 403 and wss://…/_next/hmr failed. *.trycloudflare.com, ngrok and localtunnel hosts are now allowed in development (restart npm run dev after changing next.config.ts).",
      },
      {
        type: "fix",
        title: "Every tunnel visitor looked like the same person",
        description:
          "Behind a tunnel or local proxy all requests arrive from 127.0.0.1, so everyone shared one rate limit and all devices showed up as “nearby”. Proxies on this machine are now trusted by default (TRUST_PROXY=loopback), so each visitor keeps their real IP. Remote proxies still need TRUST_PROXY=true.",
      },
      {
        type: "security",
        title: "Origin check understands forwarded hosts",
        description:
          "The WebSocket origin check also accepts the host forwarded by a trusted proxy, so the app’s own socket works through a tunnel while other sites are still refused.",
      },
      {
        type: "testing",
        title: "Tunnel tests",
        description:
          "Two new server tests simulate a tunnel: forwarded host accepted, visitors on different IPs kept apart, and a foreign origin refused even with forwarded headers.",
      },
      {
        type: "docs",
        title: "Testing through a tunnel",
        description:
          "docs/DEPLOYMENT.md explains how to share the dev server with cloudflared or ngrok, what is allowed by default, and to stop the tunnel when done.",
      },
    ],
  },
  {
    date: "October 23, 2026",
    version: "2.4.0",
    summary: "A living headline and an easier-to-navigate changelog.",
    changes: [
      {
        type: "new",
        title: "Scroll index on the changelog",
        description:
          "KokonutUI’s Scroll Index adds a rail beside the release list with a tick per release, placed where it sits on the page, and a marker for where you are. Hover to magnify nearby ticks and see the version, click to jump (landing below the sticky header), drag to scrub, or use the arrow keys. Patched with an offset for the header and SignalShare colours. Phones keep the version chips instead.",
      },
      {
        type: "tweak",
        title: "Changelog layout",
        description:
          "Each release heading is now just its version (in monospace), with the date and change count on the line below and the summary in full contrast.",
      },
      {
        type: "new",
        title: "Dynamic hero text",
        description:
          "The headline now reads “Send anything to” and then cycles through any device, your phone, your laptop, your tablet, a friend and anywhere, using KokonutUI’s Dynamic Text. Letters shared between words travel to their new place, the rest fall away or drop in and land. The changing phrase sits on its own line so nothing below it moves, it pauses when off screen or in a background tab, swaps instantly with reduced motion, and screen readers aren’t interrupted by each change.",
      },
    ],
  },
  {
    date: "October 23, 2026",
    version: "2.3.1",
    summary:
      "Bugs found right after 2.3.0: page navigation froze in development, the glass cards were never actually blurring, and the nav marked the wrong page.",
    changes: [
      {
        type: "fix",
        title: "Navigation stuck on “rendering” in development",
        description:
          "Next.js 16.4 moved its dev hot-reload socket from /_next/webpack-hmr to /_next/hmr. The custom server only handed the old path to Next, so two handlers answered the new socket (“Invalid frame header”) and the dev client waited forever for a compile signal. Every /_next/ WebSocket upgrade now goes to Next. Production was never affected.",
      },
      {
        type: "fix",
        title: "Hot reload refused from 127.0.0.1 and LAN addresses",
        description:
          "Next’s dev server only accepts its hot-reload socket from localhost. next.config.ts now allows 127.0.0.1 and this machine’s LAN IPs in development (for testing from a phone), plus anything in ALLOWED_DEV_ORIGINS.",
      },
      {
        type: "fix",
        title: "Glass cards did not blur the background",
        description:
          "The page transition left filter: blur(0px) on the wrapper around every page. A filter on a parent cuts the cards off from the background behind it, so backdrop-filter had nothing to blur. The filter is now cleared when the transition settles, and the blur is 22px for a properly frosted look.",
      },
      {
        type: "fix",
        title: "Nav highlighted “Share” on unrelated pages",
        description:
          "On pages that aren’t in the navigation bar (Changelog, Privacy, a receive link) the bar fell back to its first link and marked Share as current. It now highlights nothing there.",
      },
      {
        type: "tweak",
        title: "Translucent glass",
        description:
          "Cards were too frosted once the blur started working. Their fill is now much thinner (16 to 24% in light, 18 to 26% in dark) with a 12px blur, so the background shows through, softly blurred, instead of a milky panel.",
      },
      {
        type: "testing",
        title: "Development-mode navigation test",
        description:
          "New e2e/navigation.spec.ts (run with DEV_E2E=1, since Next allows only one dev server per folder) runs against a real dev server: Share → History → How it works → Privacy → Share, checking each page loads with zero console errors. Added a check that nothing above the cards blocks their blur.",
      },
    ],
  },
  {
    date: "October 23, 2026",
    version: "2.3.0",
    summary:
      "New type, a morphing navigation bar, a better drop zone, and a pass to strip out generic “AI-made” decoration.",
    changes: [
      {
        type: "new",
        title: "Google Sans Flex and Google Sans Code",
        description:
          "Google Sans Flex is the interface font (headings use its rounded axis a little); share codes use Google Sans Code. Both are bundled at build time, so no request goes to Google when the page loads.",
      },
      {
        type: "new",
        title: "Morphic navigation bar",
        description:
          "KokonutUI’s Morphic Navbar (Share, History, How it works) is centred in the header. Segments split apart around the active page, follow a drag, and fold down to the active link when you scroll. On phones it floats as a bottom bar so the header never overflows.",
      },
      {
        type: "new",
        title: "Copy button for the share code",
        description:
          "The code on the waiting screen has its own Copy button with the same “Copied” confirmation as the link.",
      },
      {
        type: "new",
        title: "Background reacts to the mouse",
        description:
          'The contour map raises a hill under the cursor and sends a ripple when you click empty space, like the original KokonutUI component. Added a small listenOn="window" option so it works as a background layer; clicks on cards, buttons and fields don’t ripple; touch and reduced-motion turn it off.',
      },
      {
        type: "improvement",
        title: "Better file drop zone",
        description:
          "Ideas from KokonutUI’s File Upload: dragging a file anywhere on the page highlights the zone, hovering it shows “Drop 3 files”, images get thumbnails, other files an extension badge, a count and size summary row, and focus returns to the zone after removing a file.",
      },
      {
        type: "improvement",
        title: "Pointer cursor on everything clickable",
        description:
          "Tailwind v4 no longer gives buttons a pointer cursor. One global rule now covers buttons, tabs, links, labels and file inputs; disabled controls show not-allowed.",
      },
      {
        type: "removed",
        title: "Less “vibe-coded” decoration",
        description:
          "Removed the animated gradient headline, the eyebrow pill, pulsing dots, glowing gradient icon tiles, the numbered gradient “how it works” steps, decorative orbit dots and button glows. Primary buttons are plain teal; status icons use a soft tint of their colour.",
      },
      {
        type: "fix",
        title: "Navigation bar seams",
        description:
          "The theme had redefined Tailwind’s corner sizes, turning nav segments into pills that their 12px corner patches couldn’t cover. Restored the default radius scale, which also makes corners slightly crisper everywhere.",
      },
      {
        type: "fix",
        title: "File sizes",
        description:
          "Sizes drop a trailing “.0” (“50 GB”, not “50.0 GB”), which also stopped the drop-zone hint wrapping on phones.",
      },
      {
        type: "tweak",
        title: "Slight glass blur",
        description:
          "Cards became more transparent so the contour map reads through them (the blur itself turned out not to be applying; fixed in 2.3.1).",
      },
      {
        type: "infra",
        title: "Formatting and lint",
        description:
          "Added .prettierrc matching the house style (no semicolons, double quotes, single quotes in JSX). Vendored KokonutUI components live in components/kokonutui/ with their MIT headers and a note on each patch; React-compiler lint rules are off for that folder only.",
      },
    ],
  },
  {
    date: "October 23, 2026",
    version: "2.2.0",
    summary:
      "Calmer identity: a living contour map instead of colour blobs, real glass, voxel avatars, and a project guide.",
    changes: [
      {
        type: "new",
        title: "Topographic background",
        description:
          "KokonutUI’s Topo Background (a Perlin-noise contour map drawn on canvas) replaced the bright blobs, with two very faint colour washes. Lines are teal at rest, sky while moving data, mint on success and coral on failure. It pauses when the tab is hidden.",
      },
      {
        type: "new",
        title: "Fluid glass",
        description:
          "Cards are a frosted material with light pooled along the top edge and a gradient rim. They no longer track the mouse. Motion comes from shape instead: the share card springs to its new height when content changes, and pages swap with a short blur.",
      },
      {
        type: "new",
        title: "Voxel avatars",
        description:
          "Devices get a DiceBear voxel-art character standing on a bevelled block in a colour pair taken from the device name, with initials if the image can’t load. Used in the header, orbit, connection line and invite prompt.",
      },
      {
        type: "removed",
        title: "Pointer-following highlight",
        description:
          "The glare that followed the mouse across cards was removed as distracting.",
      },
      {
        type: "improvement",
        title: "Reduced motion everywhere",
        description:
          "All spring animations respect the operating system’s reduce-motion setting, alongside reduced transparency and increased contrast.",
      },
      {
        type: "docs",
        title: "CLAUDE.md project guide",
        description:
          "Commands, architecture, rules that must not be broken, design identity, conventions and known limits, so future work keeps the same direction.",
      },
    ],
  },
  {
    date: "October 23, 2026",
    version: "2.1.0",
    summary:
      "A new interface built around four tasks: send files, send text, share screen, receive. Teal identity restored.",
    changes: [
      {
        type: "new",
        title: "Task-first home",
        description:
          "One Send card (Files, Text, Screen tabs) and one Receive card with a code box. Drop or paste files anywhere on the page; folders are zipped in a background worker.",
      },
      {
        type: "new",
        title: "One status view for every share",
        description:
          "Shows what is happening (waiting, connecting, sending, receiving, live, done), a step bar, who you are connected to, the route in use (direct, TURN or encrypted relay), speed and time left. Errors explain what happened and what to do, with Try again.",
      },
      {
        type: "new",
        title: "Waiting screen",
        description:
          "Large code, link with Copy, QR code on demand, native Share on phones, expiry countdown, and one-tap invites to devices on your network.",
      },
      {
        type: "new",
        title: "Received files",
        description:
          "Save each file or Save all; a single file saves automatically. Received text is shown with a Copy button.",
      },
      {
        type: "new",
        title: "Signal orbit and connection line",
        description:
          "Replaced the radar sweep with something true: you at the centre with devices on your network orbiting you, and a line between the two devices with data visibly flowing during a transfer.",
      },
      {
        type: "new",
        title: "Brand identity",
        description:
          "Original rocket logo across the site, teal #03dad3 plus sky, violet, coral, amber and mint, dark theme by default, light theme kept.",
      },
      {
        type: "new",
        title: "Helpful banners",
        description:
          "Warns when the page isn’t on HTTPS (encryption and screen capture need it) and when SignalShare has been updated and needs a reload.",
      },
      {
        type: "improvement",
        title: "Accessibility",
        description:
          "Semantic headings and landmarks, labelled controls, visible focus rings, live regions for status, keyboard-operable tabs and dialogs, Escape closes the invite prompt, no horizontal scroll on phones.",
      },
      {
        type: "tweak",
        title: "History, How it works, Privacy and Changelog pages",
        description:
          "Rewritten and restyled. History shows what was sent or received, to whom and when (names and sizes only). Privacy states exactly what the server sees.",
      },
      {
        type: "removed",
        title: "Clutter",
        description:
          "Confetti, the GitHub star widget, the top loading bar and the external avatar service of the old design (avatars returned later with DiceBear).",
      },
      {
        type: "fix",
        title: "Header overflow on phones",
        description:
          "While connecting, the longer “Connecting…” label pushed the header 11px off-screen; the status pill now shows only the avatar and dot on small screens.",
      },
      {
        type: "fix",
        title: "Wrong code error disappeared",
        description:
          "Joining by code swapped the screen before the server answered, so a “Code not found” message vanished. The form now stays until the code is accepted.",
      },
    ],
  },
  {
    date: "October 23, 2026",
    version: "2.0.0",
    summary:
      "Reliability overhaul. Every failure was traced to a root cause (see docs/AUDIT.md) and fixed: sharing now works across networks, survives drops, and only reports success once the other device confirms it.",
    changes: [
      {
        type: "fix",
        title: "Sharing across networks failed",
        description:
          "Only STUN was configured, with no TURN, so devices behind most NATs could not connect; the relay fallback button only appeared after a transfer had already started, so it was unreachable. Replaced by an automatic connection ladder.",
      },
      {
        type: "fix",
        title: "App dead in development",
        description:
          "React StrictMode mounts twice; the second mount tore down every WebSocket handler, and disconnecting also disabled reconnection for good after any page change. Now one signaling client lives for the whole page and start-up is idempotent.",
      },
      {
        type: "fix",
        title: "Waiting shares silently died",
        description:
          "There was no heartbeat, so proxies dropped idle sockets; a reconnect produced a new device id and the server deleted the share while the old code stayed on screen. Now both sides heartbeat and a reconnecting device resumes its seat with a secret token.",
      },
      {
        type: "fix",
        title: "Share links and QR codes were broken",
        description:
          "Links were built as http:///receive/… whenever HOST was unset. They now use the page’s own address (or PUBLIC_URL).",
      },
      {
        type: "fix",
        title: "“Complete” shown before data arrived",
        description:
          "The sender declared success with up to 4 MB still buffered, and the server raced a completion message ahead of the data. Completion is now confirmed by the receiver after verifying every file.",
      },
      {
        type: "fix",
        title: "Intermittent connection failures",
        description:
          "Network candidates that arrived before the connection was ready were thrown away. They are now queued, and brief “disconnected” blips get a 6 second grace period instead of failing the transfer.",
      },
      {
        type: "fix",
        title: "Large files crashed the receiving tab",
        description:
          "Whole files were held in JavaScript memory, and the relay base64-encoded everything. Data now leaves the JS heap every 4 MB, and the relay carries binary frames.",
      },
      {
        type: "fix",
        title: "Multi-file relay transfers were truncated",
        description:
          "Finishing the first file closed the relay stream. The old relay was replaced entirely.",
      },
      {
        type: "fix",
        title: "Screen share prompt failed in Safari and Firefox",
        description:
          "The capture prompt was requested from a network message long after the click; browsers require it inside the click. Capture now starts from the click itself.",
      },
      {
        type: "fix",
        title: "Viewer froze when sharing stopped",
        description:
          "Stopping was never sent to the viewer, and “live” was shown on connection rather than on real video. Stop is now propagated and “live” means frames are decoding.",
      },
      {
        type: "fix",
        title: "Text and screen sharing broke on plain http",
        description:
          "Opening the app via a LAN IP over http disables browser encryption and capture, and the errors were swallowed. The app now explains this clearly.",
      },
      {
        type: "fix",
        title: "Races and stuck states",
        description:
          "Effect chains, a module-level transfer lock and duplicate listeners could double-start or wedge transfers. One controller now owns the active share, double clicks are ignored, and every server request is safe to repeat.",
      },
      {
        type: "fix",
        title: "Text arrived but wasn’t shown",
        description:
          "Decoded text could be dropped if the sender’s goodbye arrived first; completion now waits for it (found by the test suite).",
      },
      {
        type: "fix",
        title: "Relay used when direct would have worked",
        description:
          "The receiver could miss the first connection check while still setting up, so the sender fell back unnecessarily. It now listens before doing anything else (found in review).",
      },
      {
        type: "new",
        title: "Automatic connection ladder",
        description:
          "Direct WebRTC first (local, STUN or TURN), then an encrypted relay through the server. Each step has a deadline (network 10 s, channel 5 s, check 5 s, relay 12 s) and records why it failed. A route only counts after data has actually crossed it. WebRTC is skipped instantly when it cannot work.",
      },
      {
        type: "new",
        title: "End-to-end encrypted relay",
        description:
          "Devices agree a key (ECDH P-256) and seal every chunk with AES-GCM, so the server only forwards ciphertext. The access token is sent inside the socket, never in a URL. The server applies backpressure, caps relay traffic per share, and closes both sides if one drops so they reconnect cleanly.",
      },
      {
        type: "new",
        title: "Resumable, verified transfers",
        description:
          "60 KiB chunks with file index and offset, an 8 MiB in-flight window acknowledged every 1 MiB, a SHA-256 for every chunk folded into a per-file check, and automatic re-send (twice) of a file that fails it. After a drop the receiver says exactly where to resume, so nothing is sent twice or skipped.",
      },
      {
        type: "new",
        title: "Reconnection",
        description:
          "The receiver retries with backoff (1, 2, 4, 8, 8 s) and immediately when the other device comes back online; the sender waits up to 60 s. A direct transfer keeps going even if the server restarts.",
      },
      {
        type: "new",
        title: "TURN support",
        description:
          "Configure TURN_URLS with TURN_SECRET for short-lived credentials (TURN REST API, HMAC-SHA1) or static credentials. ICE_TRANSPORT_POLICY=relay forces TURN-only.",
      },
      {
        type: "new",
        title: "Safer, sturdier shares",
        description:
          "Single-use 6-character codes from an unambiguous alphabet (no 0/O or 1/I/L), secret per-device tokens, reload-safe rejoining for recipients, expiry after 30 minutes unclaimed, a 2 minute grace when a device drops, and distinct reasons when a share ends (left, failed, expired, went offline).",
      },
      {
        type: "new",
        title: "Signaling client",
        description:
          "Versioned protocol (v2) validated on both ends; old pages are told to reload. Reconnects forever with jittered backoff, reconnects instantly when the network or tab comes back, and replays in-flight requests after reconnecting.",
      },
      {
        type: "new",
        title: "Screen sharing controls",
        description:
          "Pause and resume, share something else without reconnecting, optional tab or system audio with an Unmute button for viewers, the current tab excluded from the picker (no hall of mirrors), sharpness kept over frame rate, and up to 5 automatic viewer retries with a clear TURN explanation if all fail.",
      },
      {
        type: "new",
        title: "Page lifecycle",
        description:
          "Warns before closing mid-transfer, ends your share immediately when you close the tab, and lets a recipient reload the link page and pick up where they were.",
      },
      {
        type: "new",
        title: "Connection details",
        description:
          "“Show connection details” lists the server connection, route in use, TURN and relay availability, every attempt with its reason and timing, and a reference id that matches server logs.",
      },
      {
        type: "security",
        title: "Abuse protection",
        description:
          "Rate limits on joining (20/min per IP), creating (30/min), messages (50/s per socket) and previews; at most 30 sockets per IP and 5000 shares. Messages are only routed between the two devices of the same share, and nearby invites only reach devices on your own network.",
      },
      {
        type: "security",
        title: "Origin and proxy checks",
        description:
          "WebSockets and the leave endpoint reject other sites; open CORS removed. X-Forwarded-For is only trusted with TRUST_PROXY=true, and nearby devices are grouped by exact public address instead of a whole ISP block.",
      },
      {
        type: "security",
        title: "Security headers",
        description:
          "Content-Security-Policy, X-Frame-Options DENY, nosniff, no-referrer, Permissions-Policy, HSTS in production, and no-store on API responses.",
      },
      {
        type: "security",
        title: "Input validation",
        description:
          "Every message is validated: up to 500 files, 255-character names without control characters, 50 GB per share, 1 MB of text. Received file names are sanitised before saving, and the share preview no longer reveals the code.",
      },
      {
        type: "security",
        title: "Next.js 16.1.6 → 16.4.2",
        description:
          "Fixes published advisories including remote code execution and server-side request forgery on custom servers. npm audit reports 0 vulnerabilities.",
      },
      {
        type: "security",
        title: "Honest encryption labels",
        description:
          "“100% E2E via WebRTC” was shown even when data went through the server unencrypted. Labels now name the real route.",
      },
      {
        type: "infra",
        title: "Operations",
        description:
          "/health, /ready and token-protected /metrics; graceful shutdown that tells clients to reconnect; structured logs with a reference per share and client-reported outcomes, never contents, keys or credentials.",
      },
      {
        type: "infra",
        title: "Configuration",
        description:
          "Dev server binds to localhost so macOS doesn’t ask about incoming connections (BIND_HOST to expose it), optional HTTPS for LAN testing, PUBLIC_URL, ALLOWED_ORIGINS, RELAY_ENABLED and RELAY_MAX_BYTES, and SELF_PING_URL in place of the node-cron keep-alive.",
      },
      {
        type: "removed",
        title: "Unused dependencies",
        description:
          "Dropped @fastify/cors, @fastify/static, node-cron, canvas-confetti, react-github-btn, nextjs-toploader, uuid, date-fns, qrcode.react, nanoid, Radix, Base UI, the shadcn component kit, class-variance-authority and tw-animate-css.",
      },
      {
        type: "removed",
        title: "Features that never worked",
        description: "“Request their screen” and the remote-control stub.",
      },
      {
        type: "testing",
        title: "Automated tests",
        description:
          "31 unit and integration tests (transfer protocol, resume, corruption recovery, sessions, state machine, validation, rate limits, TURN credentials, the server over real WebSockets) and Playwright tests on real Chromium and WebRTC: direct, forced relay, dropping the path mid-transfer, text, cancel, bad codes and links, screen sharing with real frames, denied capture, mobile and keyboard. An optional run uses a real coturn TURN server.",
      },
      {
        type: "docs",
        title: "Documentation",
        description:
          "docs/AUDIT.md (every failure and its root cause), docs/DEPLOYMENT.md (environment variables, coturn setup, costs, macOS firewall, Local Network and Screen Recording permissions) and a rewritten README.",
      },
    ],
  },
  {
    date: "May 28, 2026",
    version: "1.2.4",
    changes: [
      {
        type: "fix",
        title: "Screen Share Stability Improvements",
        description:
          "Addressed various stability issues with the new screen sharing feature, including improved handling of different screen resolutions and better performance on lower-end devices.",
      },
      {
        type: "tweak",
        title: "Updated UI for Multiple Share Types and Receiver Experience",
        description:
          "Tweaked UI to improve Share or Recieve section for better clarity and user experience. Mobile UI is not easier to use and select.",
      },
    ],
  },
  {
    date: "May 19, 2026",
    version: "1.2.3",
    changes: [
      {
        type: "feature",
        title: "New Share Type: Share Screen",
        description:
          "Added a new share type that allows users to share their screen in real-time with a remote peer. This feature supports sharing the entire screen, a specific application window, or a browser tab. It is designed to facilitate remote collaboration and presentations.",
      },
      {
        type: "tweak",
        title: "New UI for Multiple Share Types",
        description:
          "Added a new user interface that allows users to select from multiple share types (e.g., file, folder, text) when initiating a transfer. This provides a more intuitive and streamlined experience for users with different sharing needs.",
      },
    ],
  },
  {
    date: "April 24, 2026",
    version: "1.2.2",
    changes: [
      {
        type: "fix",
        title:
          "Fix large file WebRTC disconnection and large folder ZIP page refresh",
        description:
          "Two distinct bugs affecting large transfers: (1) WebRTC peer connections drop mid-transfer on large files due to send-buffer overflow; (2) dropping a large folder either hangs or causes a tab crash that looks like a page refresh, and no ZIP is produced.",
      },
    ],
  },
  {
    date: "April 11, 2026",
    version: "1.2.1",
    changes: [
      {
        type: "new",
        title: "Now Send Encrypted Text Messages",
        description:
          "Users can now send encrypted text messages alongside file transfers. This allows for secure communication of transfer details, instructions, or any other information without leaving the app.",
      },
      {
        type: "new",
        title: "Copy and Paste File Transfers",
        description:
          "Users can now copy files to their clipboard and paste them directly into the app to initiate a transfer. This provides an alternative to drag-and-drop for quick sharing.",
      },
      {
        type: "improvement",
        title: "Drag & Drop Behavior Improvements",
        description:
          "Fixed an issue where the global drag-and-drop overlay would not consistently appear on certain browsers or when dragging from specific sources. Improved event handling to ensure reliable detection of drag events across all supported platforms.",
      },
      {
        type: "improvement",
        title: "Large Folder Upload Performance",
        description:
          "Improved performance and memory usage when uploading large folders by optimizing the zipping process and streaming files directly to WebRTC without full in-memory buffering. Displaying a fallback loader for large uploads to improve user feedback during processing.",
      },
    ],
  },
  {
    date: "March 10, 2026",
    version: "v1.2.0",
    changes: [
      {
        type: "new",
        title: "Global Drag & Drop",
        description:
          "Files can now be dropped anywhere in the window to initiate transfer. Supports overlay state and immediate transfer initialization.",
      },
      {
        type: "new",
        title: "Folder Uploads",
        description:
          "Entire directories are accepted. Client compresses folder structure before WebRTC transmission.",
      },
      {
        type: "new",
        title: "Transfer History",
        description:
          "Transfers are now stored in IndexedDB to maintain session history and enable client-side retrieval without server dependency.",
      },
      {
        type: "new",
        title: "Confetti & Sound Feedback",
        description:
          "Added celebratory confetti animation and optional sound effects upon successful file transfer completion to improve user feedback loops.",
      },
      {
        type: "new",
        title: "QR Code Sharing",
        description:
          "Enabled instant session sharing via dynamically generated QR codes. Allows seamless device-to-device pairing without manual signal entry.",
      },
      {
        type: "new",
        title: "Theme Toggling",
        description:
          "Implemented system-aware light and dark theme switching with persistent user preference storage.",
      },
      {
        type: "new",
        title: "Pre-Transfer File Management Modal",
        description:
          "Added a confirmation modal allowing users to remove selected files or append additional files before initiating transfer.",
      },
      {
        type: "new",
        title: "Changelog Page",
        description:
          "Introduced a dedicated changelog page for structured version tracking and product evolution transparency.",
      },
      {
        type: "improvement",
        title: "Layout Refactor",
        description:
          "Improved grid alignment and responsive behavior across connection states.",
      },
      {
        type: "improvement",
        title: "Connection Dialog Alignment",
        description:
          "Corrected layout issue causing the connection request dialog to render off-center on certain viewport sizes.",
      },
      {
        type: "improvement",
        title: "Transfer State Feedback Refinement",
        description:
          "Improved visual clarity of connection states including awaiting peer, negotiating, connected, and transferring.",
      },
      {
        type: "improvement",
        title: "Session Lifecycle Handling",
        description:
          "Improved cleanup logic after completed or aborted transfers to prevent residual peer state conflicts.",
      },
      {
        type: "tweak",
        title: "Animated Network Flow Diagram",
        description:
          "Introduced a real-time animated network visualization to represent peer-to-peer data transfer. Improves clarity of connection states and enhances onboarding experience.",
      },
      {
        type: "fix",
        title: "Mobile File Upload Retry Bug",
        description:
          "Resolved issue where mobile devices failed to register file input on first selection attempt due to input event handling inconsistency.",
      },
    ],
  },
  {
    date: "March 3, 2026",
    version: "v1.1.2",
    changes: [
      {
        type: "fix",
        title: "Relay Transfer Mode",
        description:
          "Added fallback relay transfer mode for unstable or restricted peer-to-peer environments. Automatically prompts users when direct WebRTC connection degrades.",
      },
      {
        type: "improvement",
        title: "WebRTC Stability Enhancements",
        description:
          "Improved ICE candidate handling, retry logic, and connection timeouts to reduce failed session attempts.",
      },
      {
        type: "improvement",
        title: "Robust Error Handling",
        description:
          "Standardized error states and improved UI messaging for failed connections, dropped peers, and transfer interruptions.",
      },
    ],
  },
  {
    date: "February 28, 2026",
    version: "v1.1.1",
    changes: [
      {
        type: "new",
        title: "Health Check Endpoint",
        description:
          "Introduced a dedicated health check API endpoint to monitor server availability and uptime status.",
      },
      {
        type: "new",
        title: "Automated Health Pings",
        description:
          "Integrated node-cron to schedule periodic uptime verification and prevent cold-start latency.",
      },
      {
        type: "improvement",
        title: "Footer Attribution Update",
        description:
          "Updated footer to include author attribution link and improved layout consistency.",
      },
      {
        type: "improvement",
        title: "Analytics Configuration Update",
        description:
          "Refined analytics setup and later removed Vercel Analytics to reduce client bundle overhead.",
      },
      {
        type: "improvement",
        title: "Documentation Update",
        description:
          "Expanded README with updated setup instructions, architecture overview, and deployment notes.",
      },
      {
        type: "fix",
        title: "Type Definitions for node-cron",
        description:
          "Added missing TypeScript type definitions to improve development reliability.",
      },
    ],
  },
  {
    date: "February 27, 2026",
    version: "v1.0.0",
    changes: [
      {
        type: "new",
        title: "Project Initialization",
        description:
          "Bootstrapped project using Create Next App with initial routing, layout structure, and TypeScript configuration.",
      },
      {
        type: "new",
        title: "Core Application Scaffold",
        description:
          "Established foundational project structure including environment configuration, basic UI shell, and deployment setup.",
      },
    ],
  },
]

const TYPES: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "var(--teal)" },
  feature: { label: "New", color: "var(--teal)" },
  improvement: { label: "Improved", color: "var(--sky)" },
  fix: { label: "Fixed", color: "var(--coral)" },
  security: { label: "Security", color: "var(--violet)" },
  testing: { label: "Tests", color: "var(--mint)" },
  docs: { label: "Docs", color: "var(--amber)" },
  infra: { label: "Ops", color: "var(--muted-foreground)" },
  removed: { label: "Removed", color: "var(--muted-foreground)" },
  tweak: { label: "Changed", color: "var(--muted-foreground)" },
}

const anchor = (version: string) => `v${version.replace(/^v/, "")}`

export default function ChangelogPage() {
  return (
    <ContentPage title='Changelog' lead='What changed, release by release.'>
      <nav aria-label='Releases' className='flex flex-wrap gap-2'>
        <a
          href='#devlog'
          className='rounded-full border border-teal/50 px-2.5 py-1 text-xs text-teal hover:border-teal'
        >
          Devlog
        </a>
        {changelogs.map((log) => (
          <a
            key={log.version}
            href={`#${anchor(log.version)}`}
            className='rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground hover:border-teal hover:text-foreground'
          >
            {log.version.replace(/^v/, "")}
          </a>
        ))}
      </nav>
      {/* Rail of release ticks beside the list (hidden on phones, where the chips above do the job).
          offset clears the sticky header when jumping to a release. */}
      <ScrollIndex
        scroller='window'
        selector='h2'
        offset={96}
        className='max-sm:grid-cols-1 max-sm:[&>nav]:hidden'
      >
        <div className='space-y-12'>
          <Devlog />
          {changelogs.map((log) => (
            <section
              key={log.version}
              id={anchor(log.version)}
              className='scroll-mt-24'
            >
              {/* The heading is only the version: the index labels its tick with it. */}
              <h2 className='!mb-1 font-mono'>
                {log.version.replace(/^v/, "")}
              </h2>
              <p className='text-sm'>
                {log.date} · {log.changes.length}{" "}
                {log.changes.length === 1 ? "change" : "changes"}
              </p>
              {log.summary && (
                <p className='mt-3 mb-5 !text-foreground'>{log.summary}</p>
              )}
              <ul className='mt-4 !list-none !pl-0 !space-y-4'>
                {log.changes.map((change, i) => {
                  const type = TYPES[change.type] ?? {
                    label: change.type,
                    color: "var(--muted-foreground)",
                  }
                  return (
                    <li key={i}>
                      <p className='!text-foreground font-medium'>
                        <span
                          className='mr-2 inline-block min-w-[4.75rem] rounded-full px-2 py-0.5 text-center text-xs font-medium'
                          style={{
                            color: type.color,
                            background: `color-mix(in oklch, ${type.color} 14%, transparent)`,
                          }}
                        >
                          {type.label}
                        </span>
                        {change.title}
                      </p>
                      <p className='mt-1 text-sm'>{change.description}</p>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </ScrollIndex>
    </ContentPage>
  )
}

/** V1 to V2. Some decisions were made. Others were hard-coded. */
function Devlog() {
  return (
    <section id='devlog' className='scroll-mt-24'>
      <h2 className='!mb-1'>Devlog</h2>
      <p className='text-sm'>October 23, 2026 · 1.2.4 → 2.4</p>

      <p className='mt-5 text-[17px] font-medium !text-foreground'>
        I rewrote SignalShare. The old screenshots are staying for documentation
        purposes. And evidence.
      </p>

      <div className='mt-5'>
        <DevlogCompare />
      </div>

      <div className='mt-8 space-y-4'>
        <p>
          SignalShare started on February 27, 2026, because I wanted to move
          files between my devices without creating yet another account.
          Next.js, Fastify, WebRTC. Seemed straightforward. Historically, a
          dangerous thought.
        </p>

        <p>
          Then came three months of adding things. Relay mode in March. QR
          codes, history, themes, folder uploads, and, for reasons that made
          sense at the time, confetti in 1.2.0. Encrypted text in April. Screen
          sharing in May. Every release was another evening of getting something
          to work and immediately finding something else to add.
        </p>

        <p>
          Looking back at 1.2.4 is an experience. The entire interface was
          uppercase monospace, apparently designed for someone operating a
          satellite. You didn&apos;t send a file. You{" "}
          <em>initiated a transmission</em>. Nearby devices were{" "}
          <em>Active Nodes</em>. Every node reported{" "}
          <em>Channel Strength: High</em>, which sounds impressive until you
          learn it was a string literal.
        </p>

        <p>
          There was a radar. It spun. It detected absolutely nothing. Peer names
          floated over the instructions, including Noble Alpaca, who can be seen
          occupying &quot;drag n drop&quot; in the screenshot. Buttons said
          Abort and Acknowledge, as though transferring a PDF required clearance
          from mission control. And yes, there was confetti. That part worked
          reliably.
        </p>

        <p>The code had its own personality. Mostly undefined behaviour.</p>

        <ul>
          <li>
            A badge proudly announced &quot;100% E2E encrypted via WebRTC&quot;.
            Meanwhile, the server was happily relaying some files as plain
            base64. An ambitious interpretation of 100%.
          </li>
          <li>
            Share links occasionally started with <code>http:///receive/…</code>{" "}
            because I&apos;d forgotten to configure <code>HOST</code>. The QR
            code worked perfectly. It just pointed to nowhere.
          </li>
          <li>
            React StrictMode mounted the app twice in development. My WebSocket
            survived the first mount. It did not survive the second. Development
            was effectively a screenshot generator.
          </li>
          <li>
            Waiting shares expired after about a minute. The relay option
            appeared after a transfer had already begun. Screen sharing
            requested permission from a network callback, which Safari quite
            reasonably rejected.
          </li>
          <li>
            Cross-network transfers were more of a suggestion. No TURN server,
            no proper fallback. If WebRTC couldn&apos;t establish a direct
            connection, that was the end of the conversation.
          </li>
        </ul>

        <p>
          Despite all that, V1 did something useful. On the same Wi-Fi,
          transfers were fast. No accounts, no uploads to some random cloud
          drive, no ceremony. Seven people even starred it on GitHub. Seven real
          people, presumably. I didn&apos;t check.
        </p>

        <p>
          More importantly, building it taught me WebRTC, signaling, NAT
          traversal, and the remarkable number of things that can go wrong when
          two browsers try to exchange a file. The phrase
          &quot;peer-to-peer&quot; does a lot of heavy lifting.
        </p>

        <p>
          So I rebuilt it. Version 2.0 happened over one very long day, with
          Claude pair-programming and me discovering increasingly creative ways
          my previous code could fail. Instead of patching symptoms, I traced
          each issue to its root cause. The full list lives in{" "}
          <code>docs/AUDIT.md</code>, for anyone interested in archaeological
          research.
        </p>

        <p>
          Transfers now negotiate a route automatically: direct connection
          first, TURN if necessary, encrypted relay if everything else fails.
          Interrupted transfers can resume. Every byte gets verified. And
          &quot;done&quot; actually means the receiving device confirmed it, not
          that the sender felt optimistic.
        </p>

        <p>
          The interface also stopped pretending to be a spacecraft. Files, text,
          screen sharing, receiving. Four things you can understand without
          reading a manual or obtaining a radio operator&apos;s licence. The
          releases below have the technical details.
        </p>

        <p>
          Not everything from V1 needed fixing. The rocket stayed. So did the{" "}
          <span className='text-teal'>#03dad3</span> teal, random animal names,
          drop-anywhere, worker-based folder zipping, and local history. The
          radar became the orbit on the home page. It now displays actual
          devices on your network. A fairly significant upgrade for a radar.
        </p>

        <p>
          V1 was overengineered in the wrong places and underengineered in the
          important ones. But it worked often enough to prove the idea, and
          broke often enough to teach me how to build it properly.
        </p>

        <p>
          I&apos;m keeping the screenshots. Partly for the memories. Mostly to
          prevent myself from ever adding a fake signal-strength indicator
          again.
        </p>
      </div>
    </section>
  )
}
