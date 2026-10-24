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
    date: "October 24, 2026",
    version: "2.10.1",
    summary:
      "Clearer requests, calmer screens, paired devices by name, a sealed relay, and a round of review fixes.",
    changes: [
      {
        type: "improvement",
        title: "The Send panel fills its card",
        description:
          "The drop zone, the text box and the screen panel now grow to the height of the row, instead of leaving an empty band under the drop zone next to Receive and My devices.",
      },
      {
        type: "improvement",
        title: "Paired devices go by their name",
        description:
          'Paired devices are listed as the other device\'s own name and kind ("Sage Albatross · iPhone") on My devices, the waiting screen, the Accept card and the pairing page, instead of "Your Mac".',
      },
      {
        type: "improvement",
        title: "Request links are easier to find and understand",
        description:
          'Under Receive, "No code to enter?" now leads to a real button, Request files or a screen, with an info tooltip that explains the idea in one go. The form asks "What do you need from them?", the button reads Get link to send them, and the waiting state lists the three steps.',
      },
      {
        type: "improvement",
        title: "Calmer session screen",
        description:
          'How the keys were checked is now a small chip in the footer ("Verified", or the 4-digit security code when there is one to compare) with the explanation in a tooltip, instead of a paragraph in the middle of the card.',
      },
      {
        type: "feature",
        title: "Info tooltips",
        description:
          "A small accessible tooltip component: opens on hover and keyboard focus, on tap for touch screens, and closes with Escape or a tap elsewhere.",
      },
      {
        type: "fix",
        title: "Hydration error from the command palette",
        description:
          "The palette's appearance command rendered a different label on the server and in the browser. It now renders the neutral label until the page has hydrated.",
      },
      {
        type: "fix",
        title: "Script tag warning from the theme script",
        description:
          "The theme script that prevents a flash of the wrong theme now only runs from the server HTML, so React no longer warns about rendering a script on the client.",
      },
      {
        type: "security",
        title: "Relay control messages are sealed too",
        description:
          'Only file data used to be encrypted on the relay; control messages (ready, ack, end, complete, cancel, pause) crossed it as plain JSON, so a modified relay could have faked "Delivered and verified". Every relay frame is now sealed with the share keys, and bound to its direction and position, so frames can\'t be forged, reordered, replayed or bounced back.',
      },
      {
        type: "fix",
        title: "Reloading the receiver no longer trips the security check",
        description:
          'A receiver that reloaded and reclaimed its seat redid the key exchange, but the sender could still use the previous keys for a moment and the share failed with "Security check failed". A new hello now clears the sender\'s old keys.',
      },
      {
        type: "fix",
        title: "A lost key confirmation no longer stalls the share",
        description:
          "If the sender missed the receiver's key confirmation (it was briefly offline), every later attempt timed out and the share ended with a misleading \"couldn't connect\". A timed-out attempt now redoes the key check.",
      },
      {
        type: "fix",
        title: "No frames lost at the start of a transfer",
        description:
          "The first message of a transfer could arrive while the connection was still finishing its security check and be dropped. Messages now wait for the transfer to pick them up.",
      },
      {
        type: "tweak",
        title: "Pause belongs to whoever paused",
        description:
          "Each side now resumes only its own pause (both can be paused at once), and every new connection carries your pause state, so a reloaded device can't leave the transfer stuck paused.",
      },
      {
        type: "fix",
        title: "Request answers survive a reconnect",
        description:
          'Answering a request twice with the same share (a replayed message after a reconnect) is accepted instead of failing with "already answered", and declining can only end the share that actually answered the request.',
      },
      {
        type: "security",
        title: "Request answers require the link's secret",
        description:
          "A device answering a request link now refuses anyone who connects without that link's secret, so the person who asked is the only one who can receive.",
      },
      {
        type: "fix",
        title: "Two files with the same name kept apart",
        description:
          'Saving into a picked folder or private storage gave two loose files with the same name one file, losing the first. Each now gets its own name ("IMG (2).jpg").',
      },
      {
        type: "fix",
        title: "Previews stay open",
        description:
          "An open preview (PDF, video, image) could go blank when anything else on the page updated. It no longer rebuilds.",
      },
      {
        type: "improvement",
        title: "Fewer resends after a resync",
        description:
          "After asking the sender to restart a file, chunks already in flight are dropped quietly instead of each triggering another restart.",
      },
      {
        type: "fix",
        title: "Smaller fixes",
        description:
          'An answer to your request that arrives during another share waits (Accept is disabled until you\'re done) instead of getting lost. The "device came back" retry now really cuts the wait short and stays bounded. Screen-share retries no longer leave old listeners behind.',
      },
      {
        type: "docs",
        title: "Security claims corrected",
        description:
          "How it works, Privacy, the deployment guide and the 2.9.0 notes now say exactly who is protected automatically: whoever opens a link, answers a request or receives on a paired device. Senders are protected automatically only when answering a request; otherwise by comparing the security code, because a modified server could claim a share as a code join before the real recipient.",
      },
      {
        type: "testing",
        title: "Review fixes covered",
        description:
          "New tests: sealed relay frames (tampering, replay and reflection refused), two same-named files, an idempotent request answer and a decline that can't touch other shares, per-side pause, and a receiver that reloads mid-transfer without its leave beacon and still gets every byte.",
      },
      {
        type: "tweak",
        title: "Small fixes",
        description:
          "The code box placeholder no longer uses a character codes never contain, and the devlog's first screenshot loads eagerly (it is the largest image on the changelog).",
      },
    ],
  },
  {
    date: "October 24, 2026",
    version: "2.10.0",
    summary:
      "My devices: pair once, send with one tap, wake a closed tab, and see what each device is.",
    changes: [
      {
        type: "feature",
        title: "My devices",
        description:
          'Pair your phone, tablet or laptop once by scanning a QR code (or opening the pairing link). From then on it appears under My devices with its kind ("Your iPhone", "Your Mac") and whether it\'s online, and every waiting share offers "Send to your devices" with one tap, on any network. No account: the pairing secret lives only on the two devices, and the server sees a pair id derived from it.',
      },
      {
        type: "security",
        title: "Shares between paired devices are verified",
        description:
          'A share sent to a paired device is keyed with the pairing\'s secret, so it is verified like a link share ("Keys verified with your device pairing"). Invitations across networks are only allowed between devices that are paired with each other.',
      },
      {
        type: "feature",
        title: "Unpair from either side",
        description:
          "Unpair removes the pairing on this device and, if the other one is online, on that one too. A QR code nobody scanned stops counting after 15 minutes.",
      },
      {
        type: "feature",
        title: "Wake a paired device",
        description:
          'If a paired device\'s tab is closed, Wake sends it a notification ("One of your devices wants to send you something"), as long as that device allowed it once under My devices. Notifications carry no content at all. On iPhone and iPad this needs SignalShare on the Home Screen, which the card explains.',
      },
      {
        type: "feature",
        title: "Installable app",
        description:
          "SignalShare now has a web app manifest, app icons drawn from the rocket logo, and a small service worker used only for wake-up notifications.",
      },
      {
        type: "feature",
        title: "Device kinds everywhere",
        description:
          "Each device reports what it is (Mac, Windows PC, Linux computer, Chromebook, Android device, iPhone or iPad). It shows next to names in the nearby list and on Accept cards, and paired devices are named by it.",
      },
      {
        type: "feature",
        title: "Recent devices",
        description:
          'The History page lists devices you shared with, with their kind, how often you sent and received, and when. It\'s kept only in this browser, can be cleared, and has an off switch ("Stop remembering devices").',
      },
      {
        type: "fix",
        title: "PDF previews are allowed to load",
        description:
          "The content security policy now allows blob: frames, which the in-page PDF preview needs.",
      },
      {
        type: "tweak",
        title: "No duplicate entries",
        description:
          "A paired device on the same network is listed once, under your devices, not again under nearby devices.",
      },
      {
        type: "docs",
        title: "Push setup documented",
        description:
          "The deployment guide covers PUSH_ENABLED, fixed VAPID keys (with a one-line generator) and VAPID_SUBJECT.",
      },
      {
        type: "testing",
        title: "Pairing and push tested",
        description:
          "Server tests cover paired devices finding each other across networks, invitations allowed only with the pairing, wake permissions and unpairing. Unit tests cover device detection, recent devices, the push host allowlist and VAPID signatures. A browser test pairs two devices, sends between them with pairing-verified keys and unpairs; another checks the manifest, icons and service worker.",
      },
    ],
  },
  {
    date: "October 24, 2026",
    version: "2.9.0",
    summary:
      "The link is the key: share links are verified end to end, even against a modified server.",
    changes: [
      {
        type: "security",
        title: "Link shares are verified against the server",
        description:
          'Share links now end with a 128-bit secret after the #. Browsers never send that part to a server, and the two devices mix it into a fresh key exchange for every share. The person who opens the link checks the sender\'s keys before anything reaches them, so a server that swapped keys in the middle is caught ("Security check failed"). QR codes carry the secret too. (Corrected in 2.10.1: the sender is only protected automatically when answering a request; otherwise compare the security code.)',
      },
      {
        type: "security",
        title: "Every route is bound to those keys",
        description:
          "The encrypted relay is now sealed with the share keys. Direct and TURN connections (files and screen) only count once each side has signed its view of the connection's DTLS fingerprints, so a relaying man-in-the-middle shows up as a mismatch. A screen share sends no picture until the viewer has passed this check.",
      },
      {
        type: "feature",
        title: "Security code for codes and nearby invites",
        description:
          "Codes are issued by the server, so a code join can't be verified against a malicious server automatically. Instead both screens show the same 4-digit security code to compare, also in the screen viewer's header. Link shares show \"Keys verified with the link's secret\" instead.",
      },
      {
        type: "security",
        title: "Request links carry the secret too",
        description:
          "A request link includes the requester's secret, and the answer is keyed with it, so the asker verifies the person answering in the same way. If an app stripped the # from the link, the share falls back to the security code.",
      },
      {
        type: "improvement",
        title: "The server receipt mentions key checks",
        description:
          '"What the server saw" says when the keys were checked against the link\'s secret, which never reaches the server.',
      },
      {
        type: "infra",
        title: "Protocol version 3",
        description:
          "The handshake is required, so the protocol version is now 3; pages left open from an older version are asked to reload. The per-connection ECDH of the relay was removed: one share-wide exchange now covers every route and every reconnect.",
      },
      {
        type: "docs",
        title: "Security docs updated",
        description:
          "The privacy page, How it works and the deployment guide explain the link secret, the key checks and the security code, replacing the old caveat that a modified server could intercept relay keys.",
      },
      {
        type: "testing",
        title: "Key checks tested",
        description:
          "Unit tests cover key agreement with and without a secret, a man-in-the-middle without the secret, a guessed secret, a different session and fingerprint parsing. Browser tests check that a link share is verified on both sides, that a code join shows the same security code on both screens, and that a tampered link secret stops the share before anything is sent. The real-TURN test passes with the new checks.",
      },
    ],
  },
  {
    date: "October 24, 2026",
    version: "2.8.0",
    summary: "Request links: ask someone for files or their screen.",
    changes: [
      {
        type: "feature",
        title: "Ask someone for files or their screen",
        description:
          'Under Receive, "Or ask someone to send you something" creates a request link for files or their screen, with an optional note. Send the link (copy, share sheet or QR code) and wait; nothing arrives until you accept.',
      },
      {
        type: "feature",
        title: "A one-button page for the person you asked",
        description:
          'Opening a request link shows who is asking, their note, and one big button: Choose files to send (the photo and file picker on a phone, a drop zone on a computer), or Share my screen ("You choose what to share. You can stop any time."). No codes, no networks, no account.',
      },
      {
        type: "feature",
        title: "Phones are pointed to a computer for screens",
        description:
          'Phones and tablets can\'t share their screen from a browser, so a screen request opened on one says "Open this on your computer" with a QR code and a copy button for the same link.',
      },
      {
        type: "feature",
        title: "Accept before anything arrives",
        description:
          "An answer reaches the asker as an Accept card with the sender's avatar, what they want to send (and how big), and the usual program warnings. Accept starts an ordinary share; Decline tells the other person politely and closes the request.",
      },
      {
        type: "security",
        title: "Request links work once",
        description:
          "A request is used up by its first answer, so a leaked link can't be used to send a stream of offers. Answers must be of the kind that was asked for, only the owner of a share can offer it, the requester's key never leaves their device, and requests expire after 30 minutes. This does properly what V1's \"Request their screen\" tried to do.",
      },
      {
        type: "fix",
        title: "Accepting from another page opens the share",
        description:
          "Accepting a nearby invitation or a request answer while on History or How it works now takes you to the share instead of leaving it running out of sight.",
      },
      {
        type: "testing",
        title: "Request flows covered end to end",
        description:
          "Server tests cover previews without secrets, wrong-kind and stranger answers, single use, declining and accepting. Browser tests cover a files request answered by a first-time visitor and accepted, a screen request viewed and then declined, and the phone fallback with its QR code.",
      },
    ],
  },
  {
    date: "October 24, 2026",
    version: "2.7.0",
    summary: "Big shares save straight to disk, and folders arrive as folders.",
    changes: [
      {
        type: "feature",
        title: "Big shares save straight to disk",
        description:
          'For shares of 256 MB or more, Chrome and Edge ask where to save as soon as you press Receive, then write each file directly into it. Nothing has to be saved afterwards and memory stays flat. Writes go to a temporary file that is only committed once the file passes its integrity check, and existing files are never overwritten (a second copy is named "report (2).pdf").',
      },
      {
        type: "feature",
        title: "Large shares stay off memory everywhere else",
        description:
          "Other browsers write big shares into the browser's private disk storage and download from there at the end. If that storage runs out (private windows cap it at about 128 MB per file), the transfer switches to memory and receives that file again, without losing anything. Storage is cleared when you press Done, and anything left by a closed tab is removed after 12 hours.",
      },
      {
        type: "feature",
        title: "Folders arrive as folders",
        description:
          'A folder you pick or drop is sent as its files with their paths, instead of being zipped first. On Chrome and Edge the receiver picks a location and gets the same folder structure. Elsewhere, "Save as zip" downloads the folder in one go; the zip is assembled from the received files without copying or recompressing them. Very large folders (over 500 files) are still zipped before sending.',
      },
      {
        type: "security",
        title: "Received paths can't escape the folder",
        description:
          'Folder paths from the other device are checked segment by segment. Anything that tries to climb out of the chosen folder ("..", absolute or empty segments) is flattened into a single safe file name.',
      },
      {
        type: "improvement",
        title: "Folder files show where they live",
        description:
          "Files picked from a folder show their folder path under the name, on both the sending list and the received list.",
      },
      {
        type: "testing",
        title: "Tests for disk saving and folders",
        description:
          "Unit tests cover path safety, the disk writer (folders recreated, no overwrites, discarded half-written files), a transfer written through it, the fallback when storage runs out, and the zip writer (checked with Python's zipfile). Browser tests cover a folder arriving in a picked location, a folder saved as one zip, and a 270 MB share through private storage and its fallback.",
      },
    ],
  },
  {
    date: "October 24, 2026",
    version: "2.6.0",
    summary:
      "Share anything faster and more safely: paste anywhere, smart text, previews, pause, warnings, shortcuts.",
    changes: [
      {
        type: "feature",
        title: "Paste anywhere to share",
        description:
          "Press ⌘V (Ctrl+V) anywhere on the Share page. Files go to Files, a SignalShare code or link goes straight to Receive, and anything else becomes text to send. Inside a text field, paste works as usual.",
      },
      {
        type: "feature",
        title: "Text knows what it is",
        description:
          'The Text box recognises links and code as you type and shows a "Send as" choice (Text, Code or Link) that you can correct. Code switches the box to a monospace font and shows the detected language.',
      },
      {
        type: "feature",
        title: "Links arrive as links",
        description:
          "A received link shows its full domain first (in punycode, so look-alike domains show their real name), the whole address underneath, and Open and Copy buttons. Nothing opens by itself, plain http links get a warning, and only http(s) links are ever clickable.",
      },
      {
        type: "feature",
        title: "Code snippets with highlighting",
        description:
          "Received code is coloured in the brand palette with line numbers, a Wrap toggle and Copy. The language is detected automatically (or taken from the sender's hint). JSON is pretty-printed. The highlighter (highlight.js, about 40 KB) only loads when something looks like code.",
      },
      {
        type: "security",
        title: "Secret check before sending text",
        description:
          'Before text leaves your device, it is checked in the browser for AWS keys, GitHub, Slack and Stripe tokens, Google and AI API keys, private keys, JWTs and .env-style secrets. You see "2 possible secrets" with a Redact button (which replaces only the secret values) or send anyway. It warns, never blocks.',
      },
      {
        type: "feature",
        title: "Previews before saving",
        description:
          "Received images and videos show thumbnails. Images, video, audio, PDFs and text files open in an in-page preview. With several files you can pick which ones to save. Previews take their type from the file extension, never the sender's claim, and HTML, SVG and XML are only ever shown as source text.",
      },
      {
        type: "security",
        title: "Warnings for programs and scripts",
        description:
          "Programs and installers (.exe, .dmg, .pkg, .apk and more), scripts (.sh, .bat, .ps1, .command and more), macro-enabled Office files and disguised names (invoice.pdf.exe, right-to-left tricks) are flagged on the receive page, in nearby invitations and next to the received file, in plain words. A single program is never saved automatically. Every receive also says: only accept files you expect; SignalShare can't scan files because they're end-to-end encrypted.",
      },
      {
        type: "security",
        title: "Bidi characters stripped from file names",
        description:
          'Right-to-left override characters, which make "photo‮gpj.exe" read as "photoexe.jpg", are removed from received file names.',
      },
      {
        type: "feature",
        title: "Pause and resume",
        description:
          'Either side can pause a file transfer. Both see who paused it ("Paused by Clever Lynx"), and either can resume. Pausing while the connection is down still reaches the other device when it comes back.',
      },
      {
        type: "feature",
        title: "Progress in the tab and a done notification",
        description:
          'The tab title shows "42% · SignalShare" while a transfer runs, then Done or Stopped. After 10 seconds a "Notify me when done" button appears; the notification only fires if the tab is in the background and never contains file names.',
      },
      {
        type: "improvement",
        title: "Visible recovery",
        description:
          'A dropped connection now says where it stopped ("Connection dropped at 64%, reconnecting… Nothing received so far is lost.") and, once back, "Resumed at 64%, nothing lost", including a plain note when the route changed (for example to the encrypted relay).',
      },
      {
        type: "feature",
        title: "Connection quality for screen sharing",
        description:
          "The stream badge now has signal bars (good, fair, poor) from the live round-trip time and packet loss, with the exact numbers on hover. File transfers keep showing their route and measured speed.",
      },
      {
        type: "feature",
        title: "Revoke and choose an expiry",
        description:
          "While waiting, the button reads Revoke link, and you can choose how long an unused share stays open: 10 minutes, 30 minutes (default), 1 hour or 24 hours. The server enforces it.",
      },
      {
        type: "fix",
        title: "Late claims no longer expire at once",
        description:
          "A claimed share's 12-hour lifetime now counts from the moment it was claimed, not from when it was created, so a share claimed late in a long expiry keeps working.",
      },
      {
        type: "feature",
        title: "What the server saw",
        description:
          "After every share, a receipt lists what the server saw (names and sizes, device names, the code, IP addresses used to connect), what it never saw (contents), which route the data took, and when the share left server memory.",
      },
      {
        type: "feature",
        title: "Keyboard shortcuts and a command palette",
        description:
          "⌘K (Ctrl+K) opens a command palette. R focuses the code box, S starts screen sharing, Esc cancels a share that hasn't started yet (never a running transfer), and ? lists every shortcut. Single keys never fire while you type, and no browser shortcut is overridden except ⌘K.",
      },
      {
        type: "tweak",
        title: "Text receipts read correctly",
        description:
          'A received text says "Verified intact" instead of talking about files.',
      },
      {
        type: "testing",
        title: "Browser tests for every new feature",
        description:
          "Nine new Playwright tests cover code detection and highlighting, link cards, secret redaction, paste routing, pause and resume, program warnings, previews and the server receipt, expiry changes, and the command palette. New unit tests cover link, code and receive-target detection, secret patterns and redaction, risky names, preview types, expiry rules and the pause frames. Shared browser test helpers moved to e2e/helpers.ts.",
      },
    ],
  },
  {
    date: "October 24, 2026",
    version: "2.5.2",
    summary: "The landing headline fits every screen.",
    changes: [
      {
        type: "fix",
        title: "Long hero phrases ran off small screens",
        description:
          'The rotating phrase is a single line of physics-driven letters, so the longer phrases spilled past the edge on phones. It now wraps at full heading size, the same size as "Send anything to", and each wrapped line morphs on its own. The heading always reserves room for the longest phrase at the current width, so nothing below it moves when the words change.',
      },
      {
        type: "improvement",
        title: "Hero phrases never repeat within a round",
        description:
          'Phrases are drawn from a shuffle bag: every phrase shows once, in random order, before any repeats, and a new round never starts with the phrase that just ended the last one. "any device." still opens the page.',
      },
    ],
  },
  {
    date: "October 24, 2026",
    version: "2.5.1",
    summary: "Screen sharing is smoother and sharp from the first second.",
    changes: [
      {
        type: "fix",
        title: "Janky screen sharing",
        description:
          "Capture asked for 30 fps at full native resolution (up to 5K on a Retina Mac), the encoder was told to protect sharpness by dropping frames, and no bitrate ceiling was set. Screen sharing now captures at 1080p and 60 fps, defaults to a Smooth profile that keeps 60 fps and lowers resolution first under pressure, allows up to 12 Mbps, and prefers H.264, which most Macs and PCs encode in hardware.",
      },
      {
        type: "fix",
        title: "Soft, blurry first seconds",
        description:
          "WebRTC starts its bandwidth estimate near 0.3 Mbps, so a new share began at 640×360 and took a while to sharpen. The screen-share connection now starts around 4 Mbps; in testing the viewer received full 1920×1080 within two seconds instead of 360p after six.",
      },
      {
        type: "new",
        title: "Smooth or sharp, while live",
        description:
          "The sharer can switch between “Smooth · 60 fps” and “Sharp text” (30 fps, keeps every pixel of small text) without reconnecting.",
      },
      {
        type: "new",
        title: "Live stream stats",
        description:
          "Viewers see the resolution and frame rate actually arriving (for example “1080p · 60 fps”) next to the title; sharers see what they are sending.",
      },
      {
        type: "testing",
        title: "Quality checks",
        description:
          "A unit test for the start-bitrate SDP rewrite, and a measured run confirming 1080p capture, the encoder limits for both profiles and full resolution reaching the viewer within two seconds. 60 fps could not be confirmed in headless testing: its fake screen source produces about 20 frames a second.",
      },
    ],
  },
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
