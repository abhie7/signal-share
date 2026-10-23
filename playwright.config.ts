import { defineConfig } from "@playwright/test"

// Run `npm run build` first. Two servers: a normal one, and one where ICE may only use relay
// candidates but no TURN is configured : so WebRTC can never connect and the app must fall back.
const server = (port: number, env: Record<string, string> = {}) => ({
  command: "node --import tsx server/index.ts",
  url: `http://127.0.0.1:${port}/ready`,
  reuseExistingServer: false,
  timeout: 60_000,
  env: {
    NODE_ENV: "production",
    PORT: String(port),
    BIND_HOST: "127.0.0.1",
    ...env,
  },
})

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3210",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--auto-select-desktop-capture-source=Entire screen",
      ],
    },
  },
  webServer: [
    server(3210, { STUN_URLS: "" }),
    server(3211, { STUN_URLS: "", ICE_TRANSPORT_POLICY: "relay" }),
    // DEV_E2E=1: a dev server, for dev-only regressions (HMR routing broke navigation once).
    // Opt-in because Next refuses a second dev server while `npm run dev` is running.
    ...(process.env.DEV_E2E
      ? [
          {
            ...server(3213),
            env: {
              NODE_ENV: "development",
              PORT: "3213",
              BIND_HOST: "127.0.0.1",
            },
            url: "http://127.0.0.1:3213/ready",
            timeout: 120_000,
          },
        ]
      : []),
    // TURN_E2E=1: real coturn on loopback; SignalShare may only use TURN relay candidates.
    ...(process.env.TURN_E2E
      ? [
          {
            command:
              "turnserver -n --listening-ip=127.0.0.1 --relay-ip=127.0.0.1 --listening-port=3478 --use-auth-secret --static-auth-secret=e2e-secret --realm=signalshare.test --allow-loopback-peers --no-tls --no-cli --log-file=stdout",
            port: 3478,
            reuseExistingServer: false,
          },
          server(3212, {
            STUN_URLS: "",
            TURN_URLS: "turn:127.0.0.1:3478?transport=udp",
            TURN_SECRET: "e2e-secret",
            ICE_TRANSPORT_POLICY: "relay",
          }),
        ]
      : []),
  ],
})
