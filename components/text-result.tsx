"use client"

import { LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { CopyButton } from "@/components/ui-kit"
import { CodeView } from "@/components/code-view"
import {
  asLink,
  kindFromType,
  langFromType,
  looksLikeCode,
} from "@/lib/content"

/**
 * Received text, shown as what it is: a link card, highlighted code, or plain text. The sender's
 * hint is a preference, not trusted: only http(s) links ever become clickable.
 */
export function TextResult({ text, type }: { text: string; type: string }) {
  const declared = kindFromType(type)
  const link = declared !== "code" ? asLink(text) : null
  if (link) return <LinkCard url={link} />
  if (declared === "code" || (declared !== "text" && looksLikeCode(text)))
    return <CodeView code={text} lang={langFromType(type)} />
  return (
    <div>
      <pre className='well max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl p-4 font-sans text-[15px] leading-relaxed'>
        {text}
      </pre>
      <div className='mt-3 flex justify-end'>
        <CopyButton value={text} size='md' label='Copy text' />
      </div>
    </div>
  )
}

/** The full domain up front (punycode, so look-alike domains show their real name), never auto-opened. */
function LinkCard({ url }: { url: URL }) {
  const href = url.toString()
  return (
    <div className='well rounded-2xl p-4'>
      <p className='eyebrow'>Link</p>
      <p className='mt-1 break-all text-lg font-semibold'>{url.hostname}</p>
      <p className='mt-1 break-all font-mono text-xs text-muted-foreground'>
        {href}
      </p>
      {url.protocol === "http:" && (
        <p className='mt-2 text-xs text-warning'>
          Not encrypted (http). Don’t enter passwords on this page.
        </p>
      )}
      <div className='mt-4 flex flex-wrap gap-2'>
        <a
          href={href}
          target='_blank'
          rel='noopener noreferrer'
          className='pressable btn-primary inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold'
        >
          <Icon icon={LinkSquare02Icon} className='size-4' /> Open link
        </a>
        <CopyButton value={href} size='md' label='Copy link' />
      </div>
      <p className='mt-3 text-xs text-muted-foreground'>
        Check the address before you sign in or download anything.
      </p>
    </div>
  )
}
