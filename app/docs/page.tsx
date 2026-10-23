import { ContentPage } from "@/components/content-page"
import { ArchitectureDiagram } from "@/components/architecture-diagram"

export const metadata = {
  title: "How it works : SignalShare",
  description:
    "How SignalShare connects two devices, keeps data private, and what to do when a connection fails.",
}

export default function DocsPage() {
  return (
    <ContentPage
      title='How it works'
      lead='Two devices, one code. Here’s what happens in between : and what to do when a network gets in the way.'
    >
      <section>
        <h2>Sharing</h2>
        <ul>
          <li>
            <strong className='text-foreground'>Send</strong> files, a folder
            (zipped automatically), text, or your screen. You get a 6‑character
            code, a link and a QR code.
          </li>
          <li>
            <strong className='text-foreground'>Receive</strong> by opening the
            link, scanning the QR code, or typing the code. Devices on the same
            network can also be invited with one tap.
          </li>
          <li>A share works once. Unused shares expire after 30 minutes.</li>
        </ul>
      </section>

      <section>
        <h2>How devices connect</h2>
        <p>
          Being on Wi‑Fi doesn’t mean two devices can reach each other :
          routers, firewalls, VPNs and guest networks often block it.
          SignalShare tries routes in order and uses the first one that actually
          carries data:
        </p>
        <ArchitectureDiagram />
        <ul>
          <li>
            <strong className='text-foreground'>Direct.</strong> A WebRTC
            connection straight between the devices. Fastest; works on most home
            networks and many across the internet.
          </li>
          <li>
            <strong className='text-foreground'>TURN relay</strong> (if the
            operator configured one). Still WebRTC and still end-to-end
            encrypted; works through strict NATs and firewalls, including over
            port 443.
          </li>
          <li>
            <strong className='text-foreground'>Encrypted relay.</strong> For
            files and text, the SignalShare server forwards data it cannot read
            (AES‑GCM with a key only the two devices know).
          </li>
        </ul>
        <p>
          Screen sharing needs a direct or TURN connection; the file relay can’t
          carry live video.
        </p>
        <p>
          If a connection drops mid-transfer, SignalShare reconnects and resumes
          from the last verified byte. A transfer is marked complete only after
          the recipient has checked every file.
        </p>
      </section>

      <section>
        <h2>Troubleshooting</h2>
        <ul>
          <li>
            <strong className='text-foreground'>
              “Couldn’t connect the devices.”
            </strong>{" "}
            Every route failed. Try another network (a phone hotspot is a good
            test), turn off a VPN, or ask the operator to enable a TURN server.
          </li>
          <li>
            <strong className='text-foreground'>
              Screen sharing won’t start on a Mac.
            </strong>{" "}
            Open System Settings › Privacy &amp; Security › Screen &amp; System
            Audio Recording and enable your browser, then quit and reopen it.
          </li>
          <li>
            <strong className='text-foreground'>
              macOS asks to allow incoming connections.
            </strong>{" "}
            You don’t need to allow it to use SignalShare in a browser : all
            connections are outgoing. The prompt only appears if you run the
            SignalShare server yourself and expose it to your network.
          </li>
          <li>
            <strong className='text-foreground'>
              Devices on the same Wi‑Fi don’t see each other.
            </strong>{" "}
            Guest networks and “client isolation” block local traffic. Use the
            code or link : the share still works through the relay.
          </li>
          <li>
            <strong className='text-foreground'>
              “Not a secure connection.”
            </strong>{" "}
            SignalShare must be opened over HTTPS (or localhost). Encryption and
            screen capture are disabled on plain http.
          </li>
          <li>
            <strong className='text-foreground'>Large files.</strong> Received
            files are held by your browser until you save them. Very large
            transfers need free disk space on the receiving device.
          </li>
        </ul>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          No accounts, no storage, no tracking. The server sees file names and
          sizes (to show a preview) but never contents. See the privacy page for
          details.
        </p>
      </section>
    </ContentPage>
  )
}
