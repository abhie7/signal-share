"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Alert02Icon,
  Download04Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { Btn } from "@/components/ui-kit"
import { CodeView } from "@/components/code-view"
import { downloadItem } from "@/lib/controller"
import type { ReceivedItem } from "@/lib/store"
import { looksLikeCode } from "@/lib/content"
import { previewOf, TEXT_PREVIEW_BYTES, type PreviewKind } from "@/lib/preview"
import { PRECAUTION, riskMessage, riskOf } from "@/lib/risky"
import { cn, formatBytes } from "@/lib/utils"
import { zipStore } from "@/lib/utils/store-zip"
import { toast } from "sonner"

type Entry = ReceivedItem & {
  /** Name as the sender wrote it: the risk check needs it before sanitising. */
  original: string
  preview: { kind: PreviewKind; url: string } | null
}

/**
 * Object URLs with a type taken from the extension, not the sender's MIME type, so a file
 * can only ever render as the safe kind its name says it is.
 */
function useEntries(items: ReceivedItem[], originals: string[]): Entry[] {
  const entries = useMemo(
    () =>
      items.map((item, i) => {
        const p = previewOf(item.name)
        return {
          ...item,
          original: originals[i] ?? item.name,
          preview: p
            ? {
                kind: p.kind,
                url: URL.createObjectURL(
                  new Blob([item.blob], { type: p.type }),
                ),
              }
            : null,
        }
      }),
    [items, originals],
  )
  useEffect(
    () => () =>
      entries.forEach((e) => e.preview && URL.revokeObjectURL(e.preview.url)),
    [entries],
  )
  return entries
}

const extension = (name: string) =>
  name.includes(".")
    ? name.split(".").at(-1)!.slice(0, 4).toUpperCase()
    : "FILE"

function Thumb({ entry }: { entry: Entry }) {
  const box =
    "size-11 shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border"
  if (entry.preview?.kind === "image")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={entry.preview.url} alt='' className={cn(box, "object-cover")} />
    )
  if (entry.preview?.kind === "video")
    return (
      <video
        src={entry.preview.url}
        muted
        playsInline
        preload='metadata'
        className={cn(box, "object-cover")}
        aria-hidden
      />
    )
  return (
    <span
      className={cn(
        box,
        "grid place-items-center font-mono text-[10px] font-medium text-muted-foreground",
      )}
      aria-hidden
    >
      {extension(entry.name)}
    </span>
  )
}

/** Received files: thumbnails, previews, risk warnings, and saving all or some. */
/** One download for a received folder: the files keep their paths inside the zip. */
async function saveZip(entries: Entry[]) {
  const tops = new Set(entries.map((e) => e.name.split("/")[0]))
  const name =
    tops.size === 1 && entries[0].name.includes("/")
      ? [...tops][0]
      : "SignalShare"
  try {
    const blob = await zipStore(
      entries.map((e) => ({ path: e.name, blob: e.blob })),
    )
    const url = URL.createObjectURL(blob)
    downloadItem({ url, name: `${name}.zip` })
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    toast.error("Too large for one zip", {
      description: "Save the files one by one instead.",
    })
  }
}

export function ReceivedFiles({
  items,
  originals,
  from,
  saved,
}: {
  items: ReceivedItem[]
  originals: string[]
  from: string
  /** Already written into the file or folder the user picked. */
  saved: boolean
}) {
  const entries = useEntries(items, originals)
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(items.map((i) => i.url)),
  )
  const [open, setOpen] = useState<Entry | null>(null)
  const [zipping, setZipping] = useState(false)
  const many = entries.length > 1 && !saved
  const chosen = entries.filter((e) => picked.has(e.url))
  const folder = entries.some((e) => e.name.includes("/"))

  const toggle = (url: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (!next.delete(url)) next.add(url)
      return next
    })

  return (
    <div>
      {saved && (
        <p className='mb-3 text-sm text-muted-foreground'>
          Saved to the {entries.length === 1 && !folder ? "file" : "folder"} you
          chose.
        </p>
      )}
      <ul className='well max-h-96 divide-y divide-border overflow-auto rounded-2xl'>
        {entries.map((entry) => {
          const risk = riskOf(entry.original)
          return (
            <li key={entry.url} className='px-3 py-2.5 text-sm'>
              <div className='flex items-center gap-3'>
                {many && (
                  <input
                    type='checkbox'
                    checked={picked.has(entry.url)}
                    onChange={() => toggle(entry.url)}
                    aria-label={`Select ${entry.name}`}
                    className='size-4 shrink-0 accent-[var(--teal)]'
                  />
                )}
                <Thumb entry={entry} />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate'>
                    {entry.name.split("/").at(-1)}
                  </span>
                  <span className='block truncate text-xs tabular-nums text-muted-foreground'>
                    {formatBytes(entry.size)}
                    {entry.name.includes("/") &&
                      ` · ${entry.name.split("/").slice(0, -1).join(" / ")}`}
                  </span>
                </span>
                {entry.preview && (
                  <Btn
                    size='sm'
                    variant='ghost'
                    onClick={() => setOpen(entry)}
                    aria-label={`Preview ${entry.name}`}
                  >
                    <Icon icon={ViewIcon} className='size-4' />
                    <span className='hidden sm:inline'>Preview</span>
                  </Btn>
                )}
                {!saved && (
                  <Btn
                    size='sm'
                    onClick={() => downloadItem(entry)}
                    aria-label={`Save ${entry.name}`}
                  >
                    <Icon icon={Download04Icon} className='size-4' /> Save
                  </Btn>
                )}
              </div>
              {risk && (
                <p className='mt-2 flex gap-2 text-xs text-warning' role='note'>
                  <Icon
                    icon={Alert02Icon}
                    className='mt-px size-3.5 shrink-0'
                  />
                  {riskMessage(entry.original, risk, from)}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {many && (
        <div className='mt-3 flex items-center justify-between gap-3'>
          <button
            type='button'
            className='text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
            onClick={() =>
              setPicked(
                chosen.length === entries.length
                  ? new Set()
                  : new Set(entries.map((e) => e.url)),
              )
            }
          >
            {chosen.length === entries.length ? "Select none" : "Select all"}
          </button>
          <span className='flex flex-wrap justify-end gap-2'>
            {folder && (
              <Btn
                disabled={!chosen.length || zipping}
                onClick={async () => {
                  setZipping(true)
                  await saveZip(chosen)
                  setZipping(false)
                }}
              >
                {zipping ? "Zipping…" : "Save as zip"}
              </Btn>
            )}
            <Btn
              variant='primary'
              disabled={!chosen.length}
              onClick={async () => {
                for (const entry of chosen) {
                  downloadItem(entry)
                  await new Promise((r) => setTimeout(r, 350)) // browsers drop rapid-fire downloads
                }
              }}
            >
              {chosen.length === entries.length
                ? "Save all"
                : `Save ${chosen.length} selected`}
            </Btn>
          </span>
        </div>
      )}
      <p className='mt-3 text-xs text-muted-foreground'>
        {PRECAUTION}
        {!saved && " Files stay in this tab until you close it or press Done."}
      </p>
      <PreviewDialog entry={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function PreviewDialog({
  entry,
  onClose,
}: {
  entry: Entry | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (entry && !dialog.open) dialog.showModal()
    if (!entry && dialog.open) dialog.close()
    setText(null)
    if (entry?.preview?.kind !== "text") return
    let live = true
    entry.blob
      .slice(0, TEXT_PREVIEW_BYTES)
      .text()
      .then((t) => live && setText(t))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [entry])

  const p = entry?.preview
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={entry ? `Preview of ${entry.name}` : "Preview"}
      className='liquid m-auto w-[min(56rem,calc(100vw-2rem))] p-0 text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-[2px]'
    >
      {entry && p && (
        <div className='flex max-h-[85dvh] flex-col'>
          <div className='flex items-center gap-3 border-b border-border px-4 py-3'>
            <span className='min-w-0 flex-1 truncate font-medium'>
              {entry.name}
            </span>
            <Btn size='sm' onClick={() => downloadItem(entry)}>
              <Icon icon={Download04Icon} className='size-4' /> Save
            </Btn>
            <Btn size='sm' variant='ghost' onClick={onClose}>
              Close
            </Btn>
          </div>
          <div className='min-h-0 flex-1 overflow-auto p-4'>
            {p.kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.url}
                alt={entry.name}
                className='mx-auto max-h-[70dvh] rounded-lg object-contain'
              />
            )}
            {p.kind === "video" && (
              <video
                src={p.url}
                controls
                playsInline
                className='mx-auto max-h-[70dvh] rounded-lg'
              />
            )}
            {p.kind === "audio" && (
              <audio src={p.url} controls className='w-full' />
            )}
            {p.kind === "pdf" && (
              <iframe
                src={p.url}
                title={entry.name}
                className='h-[70dvh] w-full rounded-lg bg-white'
              />
            )}
            {p.kind === "text" &&
              text !== null &&
              (looksLikeCode(text) ? (
                <CodeView code={text} />
              ) : (
                <pre className='well whitespace-pre-wrap break-words rounded-2xl p-4 font-mono text-[13px]'>
                  {text}
                </pre>
              ))}
            {p.kind === "text" && entry.size > TEXT_PREVIEW_BYTES && (
              <p className='mt-2 text-xs text-muted-foreground'>
                Showing the first {formatBytes(TEXT_PREVIEW_BYTES)}.
              </p>
            )}
          </div>
        </div>
      )}
    </dialog>
  )
}
