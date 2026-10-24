"use client"

import { useEffect, useState } from "react"
import { CopyButton } from "@/components/ui-kit"
import { asJson } from "@/lib/content"
import { cn } from "@/lib/utils"

/** Past this, highlighting stalls the page; the code is still shown, just uncoloured. */
const HIGHLIGHT_LIMIT = 200 * 1024

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Splits highlighted HTML into lines, closing and reopening spans that cross a line break. */
export function splitLines(html: string): string[] {
  const open: string[] = []
  return html.split("\n").map((raw) => {
    const prefix = open.join("")
    for (const tag of raw.match(/<span[^>]*>|<\/span>/g) ?? []) {
      if (tag === "</span>") open.pop()
      else open.push(tag)
    }
    return prefix + raw + "</span>".repeat(open.length)
  })
}

type Highlighted = { lines: string[]; language: string | null }

/** Language names as people say them. */
const LABEL: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  json: "JSON",
  xml: "HTML/XML",
  css: "CSS",
  bash: "Shell",
  shell: "Shell",
  sql: "SQL",
  yaml: "YAML",
  go: "Go",
  rust: "Rust",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  cpp: "C++",
  c: "C",
  csharp: "C#",
  php: "PHP",
  ruby: "Ruby",
  markdown: "Markdown",
  ini: "Config",
  diff: "Diff",
}
export const languageLabel = (lang: string | null) =>
  lang ? (LABEL[lang] ?? lang) : "Code"

/**
 * Detects the language and colours it. highlight.js (about 40 KB gzipped) is only fetched
 * once something actually looks like code. Its output escapes the source, so the HTML is safe.
 */
export async function highlight(
  code: string,
  hint?: string | null,
): Promise<Highlighted> {
  if (code.length > HIGHLIGHT_LIMIT)
    return { lines: escape(code).split("\n"), language: hint ?? null }
  const hljs = (await import("highlight.js/lib/common")).default
  const result =
    hint && hljs.getLanguage(hint)
      ? hljs.highlight(code, { language: hint, ignoreIllegals: true })
      : hljs.highlightAuto(code, Object.keys(LABEL))
  return { lines: splitLines(result.value), language: result.language ?? null }
}

/** Code with line numbers, a wrap toggle and copy. JSON is pretty-printed. */
export function CodeView({
  code,
  lang,
  className,
}: {
  code: string
  lang?: string | null
  className?: string
}) {
  const json = asJson(code)
  const isJson = json !== null
  const shown = isJson ? JSON.stringify(json, null, 2) : code
  const [result, setResult] = useState<Highlighted | null>(null)
  const [wrap, setWrap] = useState(false)

  useEffect(() => {
    let live = true
    highlight(shown, isJson ? "json" : lang)
      .then((r) => live && setResult(r))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [shown, isJson, lang])

  const lines = result?.lines ?? escape(shown).split("\n")
  return (
    <div className={cn("well overflow-hidden rounded-2xl", className)}>
      <div className='flex items-center justify-between gap-2 border-b border-border px-3 py-1.5'>
        <span className='text-xs font-medium text-muted-foreground'>
          {languageLabel(
            result?.language ?? (isJson ? "json" : (lang ?? null)),
          )}
          {isJson && shown !== code && " · formatted"}
        </span>
        <div className='flex items-center gap-1'>
          <button
            type='button'
            aria-pressed={wrap}
            onClick={() => setWrap((w) => !w)}
            className='pressable rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground aria-pressed:text-foreground'
          >
            Wrap
          </button>
          <CopyButton value={code} label='Copy code' />
        </div>
      </div>
      <pre
        className='code-view max-h-[28rem] overflow-auto py-3 font-mono text-[13px] leading-[1.6]'
        tabIndex={0}
        aria-label='Code'
      >
        <code
          className='grid min-w-max grid-cols-[auto_1fr] data-[wrap=true]:min-w-0'
          data-wrap={wrap}
        >
          {lines.map((html, i) => (
            <span key={i} className='contents'>
              <span
                className='select-none pl-3 pr-4 text-right tabular-nums text-muted-foreground/50'
                aria-hidden
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  "pr-4",
                  wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
                )}
                dangerouslySetInnerHTML={{ __html: html || " " }}
              />
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
