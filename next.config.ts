import type { NextConfig } from "next"
import { networkInterfaces } from "node:os"

const dev = process.env.NODE_ENV !== "production"

// Next's dev server only serves its assets and HMR socket to localhost. Allow 127.0.0.1, common
// tunnel domains, this machine's LAN addresses (testing from a phone), plus ALLOWED_DEV_ORIGINS. Dev only.
const devOrigins = dev
  ? [
      "127.0.0.1",
      // Tunnels used to test on other devices over HTTPS.
      "*.trycloudflare.com",
      "*.ngrok-free.app",
      "*.ngrok.app",
      "*.ngrok.io",
      "*.loca.lt",
      ...Object.values(networkInterfaces())
        .flat()
        .filter((n) => n && n.family === "IPv4" && !n.internal)
        .map((n) => n!.address),
      ...(process.env.ALLOWED_DEV_ORIGINS?.split(",").map((s) => s.trim()) ??
        []),
    ]
  : undefined

// Same-origin everything. 'unsafe-inline' scripts are needed by Next's inline bootstrap without nonces;
// 'unsafe-eval' only in development (React refresh).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://api.dicebear.com", // device avatars
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:", // PDF previews
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: devOrigins,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), display-capture=(self)",
          },
          ...(dev
            ? []
            : [
                { key: "Strict-Transport-Security", value: "max-age=31536000" },
              ]),
        ],
      },
    ]
  },
}

export default nextConfig
