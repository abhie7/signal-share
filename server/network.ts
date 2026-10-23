import { isIP } from "node:net"

const strip = (ip: string) => ip.replace(/^::ffff:/, "")

export function isPrivateIP(raw: string): boolean {
  const ip = strip(raw)
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number)
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    )
  }
  return (
    ip === "::1" ||
    ip.startsWith("fe80:") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  )
}

/**
 * Devices that share a key are shown to each other as "nearby".
 * Public address: exact match (same NAT ≈ same network). Private address (server on the LAN):
 * the /24. Never the /24 of a public address : that groups strangers on the same ISP block.
 */
export function presenceKey(raw: string): string {
  const ip = strip(raw)
  if (!isPrivateIP(ip)) return ip
  if (isIP(ip) === 4) return ip.split(".").slice(0, 3).join(".") + ".0/24"
  return "lan6"
}
