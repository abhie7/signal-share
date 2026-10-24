// What a piece of pasted or received text is: a link, code, or plain text. Pure, so it is
// unit-tested and shared by the composer (sender) and the result view (receiver).

export type TextKind = "link" | "code" | "text"

/** MIME type the sender attaches to a text share, so the receiver knows how it was meant. */
export const TEXT_TYPES: Record<TextKind, string> = {
  text: "text/plain",
  link: "text/uri-list",
  code: "text/x-code",
}

export function kindFromType(type: string): TextKind | null {
  const base = type.split(";")[0].trim()
  const hit = Object.entries(TEXT_TYPES).find(([, t]) => t === base)
  return hit ? (hit[0] as TextKind) : null
}

/** `text/x-code; lang=python` → "python". Only plain identifiers, never markup. */
export function langFromType(type: string): string | null {
  const m = /;\s*lang=([a-z0-9+#-]{1,24})\s*$/i.exec(type)
  return m ? m[1].toLowerCase() : null
}

/**
 * The text is exactly one http(s) link. Other schemes (javascript:, data:, file:…) are never
 * treated as links, so nothing dangerous becomes clickable.
 */
export function asLink(text: string): URL | null {
  const value = text.trim()
  if (!value || /\s/.test(value) || value.length > 4096) return null
  const withScheme = /^www\./i.test(value) ? `https://${value}` : value
  try {
    const url = new URL(withScheme)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null
    return url
  } catch {
    return null
  }
}

/** Parsed JSON object or array, or null. Scalars ("12", "true") are just text. */
export function asJson(text: string): unknown | null {
  const value = text.trim()
  if (!/^[[{]/.test(value)) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

/** One of these alone is enough. */
const STRONG_HINTS = [
  /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b[\s\S]*\b(FROM|INTO|SET|TABLE)\b/i,
  /^#!\//,
]

const CODE_HINTS = [
  /^\s*(import|export|from|package|using|#include|#!)\b/m,
  /^\s*(def|class|fn|func|function|interface|struct|enum|impl|module)\s+\w+/m,
  /^\s*(const|let|var|val|public|private|static|async|return|if|for|while)\b.*[=({;:]\s*$/m,
  /=>|::|->|!==|===|&&|\|\||\+=|:=/,
  /^\s*<\/?[a-z][\w-]*(\s[^>]*)?>\s*$/m,
  /^\s*[\w.-]+:\s*$/m, // YAML keys
  /^\s*[}\])];?\s*$/m,
]

/**
 * A cheap first pass: does this look like code? Only then is the syntax highlighter loaded.
 * Scores structural signals so prose with one semicolon or a URL doesn't qualify.
 */
export function looksLikeCode(text: string): boolean {
  const value = text.trim()
  if (value.length < 12 || asLink(value)) return false
  if (asJson(value) || STRONG_HINTS.some((re) => re.test(value))) return true
  const lines = value.split("\n")
  let score = CODE_HINTS.filter((re) => re.test(value)).length
  const indented = lines.filter((l) => /^( {2,}|\t)\S/.test(l)).length
  if (lines.length > 2 && indented / lines.length > 0.25) score++
  const endings = lines.filter((l) => /[;{}]\s*$/.test(l)).length
  if (lines.length > 1 && endings / lines.length > 0.3) score++
  return score >= 2
}

export function classify(text: string): TextKind {
  if (asLink(text)) return "link"
  return looksLikeCode(text) ? "code" : "text"
}

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
const CODE_RE = new RegExp(
  `^[${CODE_ALPHABET}]{3}[\\s·-]?[${CODE_ALPHABET}]{3}$`,
)

/**
 * Pasted text that is meant for Receive: a share code as SignalShare shows it (uppercase,
 * optionally split "ABC·123") or a share link on this origin.
 */
export function receiveTarget(
  text: string,
  origins: string[],
): { code: string } | { path: string } | null {
  const value = text.trim()
  if (CODE_RE.test(value)) return { code: value.replace(/[\s·-]/g, "") }
  const url = asLink(value)
  if (!url || !origins.includes(url.origin)) return null
  const m = /^\/receive\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname)
  return m ? { path: `/receive/${m[1]}${url.hash}` } : null
}
