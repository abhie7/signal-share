import type { MetadataRoute } from "next"

// Installable app: needed on iPhone and iPad for wake-up notifications from paired devices.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SignalShare",
    short_name: "SignalShare",
    description: "Send files, text and your screen to any device.",
    start_url: "/",
    display: "standalone",
    background_color: "#17181b",
    theme_color: "#17181b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  }
}
