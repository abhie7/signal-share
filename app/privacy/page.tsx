import { ContentPage } from "@/components/content-page"

export const metadata = {
  title: "Privacy : SignalShare",
  description:
    "What SignalShare sees, what it keeps, and what it never touches.",
}

export default function PrivacyPage() {
  return (
    <ContentPage
      title='Privacy'
      lead='SignalShare moves data between your devices. It is not a storage service.'
    >
      <section>
        <h2>No accounts</h2>
        <p>
          There is nothing to sign up for. Each device gets a random name (you
          can change it); it is stored only in your browser.
        </p>
      </section>
      <section>
        <h2>What goes through the server</h2>
        <ul>
          <li>
            The coordination server sees the names, sizes and types of files you
            offer, so the recipient can preview them. It never sees text you
            share.
          </li>
          <li>
            Direct connections carry your data device-to-device, encrypted by
            WebRTC (DTLS). A TURN relay, if one is used, forwards encrypted
            packets it cannot read.
          </li>
          <li>
            When a direct connection is impossible, data flows through the
            SignalShare relay. It is encrypted on your device with a key the two
            devices agree on (ECDH + AES-GCM), so the relay only forwards
            ciphertext. It is never written to disk.
          </li>
        </ul>
      </section>
      <section>
        <h2>What is kept</h2>
        <ul>
          <li>
            Shares live in server memory only, and are deleted when they finish,
            are cancelled, or expire (30 minutes unused).
          </li>
          <li>
            Server logs record events such as “share created” or “connected via
            relay” with a random reference : never file contents, text, keys or
            credentials.
          </li>
          <li>
            Your transfer history (names and sizes, not contents) is stored in
            your own browser and can be cleared from the History page.
          </li>
        </ul>
      </section>
      <section>
        <h2>Who can join a share</h2>
        <p>
          Anyone with the link or code can claim a share, and only one device
          can. Codes are single-use, expire, and guessing is rate-limited : but
          treat a link like a key and send it only to the person it is meant
          for.
        </p>
      </section>
      <section>
        <h2>No tracking</h2>
        <p>
          No analytics, advertising or third-party scripts are loaded. Device
          avatars are images from DiceBear (api.dicebear.com), generated from
          the random device name : DiceBear sees that name and your IP address
          when the image loads, and nothing else.
        </p>
      </section>
    </ContentPage>
  )
}
