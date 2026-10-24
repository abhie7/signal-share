// Spots credentials in text before it is sent. Runs only in the sender's browser; it warns,
// it never blocks. Patterns favour precision: a false alarm on every paste trains people to
// click through.

export interface SecretMatch {
  label: string
  start: number
  end: number
}

const PATTERNS: Array<{ label: string; re: RegExp; group?: number }> = [
  {
    label: "Private key",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { label: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    label: "GitHub token",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
  },
  { label: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    label: "Slack webhook",
    re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g,
  },
  { label: "Stripe key", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: "API key", re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g },
  {
    label: "JWT",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  {
    // .env style: only the value is a secret; keep the key so the text stays useful.
    label: "Secret in .env",
    re: /^[ \t]*(?:export[ \t]+)?[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_?KEY|PRIVATE_KEY|ACCESS_KEY|AUTH|CREDENTIALS?)[A-Z0-9_]*[ \t]*[=:][ \t]*["']?([^\s"'#[][^\s"'#]{5,})/gm,
    group: 1,
  },
]

export function findSecrets(text: string): SecretMatch[] {
  const found: SecretMatch[] = []
  for (const { label, re, group } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const value = group ? m[group] : m[0]
      const start = m.index! + (group ? m[0].indexOf(value) : 0)
      found.push({ label, start, end: start + value.length })
    }
  }
  // One finding per span: drop matches inside an earlier, longer one.
  found.sort((a, b) => a.start - b.start || b.end - a.end)
  return found.filter((m, i) => !found.slice(0, i).some((p) => m.start < p.end))
}

export function redact(text: string, matches: SecretMatch[]): string {
  let out = text
  for (const m of [...matches].sort((a, b) => b.start - a.start))
    out = `${out.slice(0, m.start)}[redacted]${out.slice(m.end)}`
  return out
}

/** "GitHub token, 2 × Secret in .env" */
export function describeSecrets(matches: SecretMatch[]): string {
  const counts = new Map<string, number>()
  for (const m of matches) counts.set(m.label, (counts.get(m.label) ?? 0) + 1)
  return [...counts]
    .map(([label, n]) => (n > 1 ? `${n} × ${label}` : label))
    .join(", ")
}
