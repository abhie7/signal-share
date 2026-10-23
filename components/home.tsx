"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ComputerScreenShareIcon,
  Delete02Icon,
  File01Icon,
  InboxDownloadIcon,
  TextIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons"
import { AnimatePresence, motion, MotionConfig } from "framer-motion"
import { Icon } from "@/components/icon"
import { Btn, Spinner } from "@/components/ui-kit"
import { Glass, SignalOrbit } from "@/components/brand"
import DynamicText from "@/components/kokonutui/dynamic-text"
import {
  join,
  screenShareSupported,
  shareFiles,
  shareScreen,
  shareText,
} from "@/lib/controller"
import { useConnection, type ShareError } from "@/lib/store"
import { LIMITS, normalizeCode } from "@/lib/protocol"
import { processDataTransfer, zipFolderSelection } from "@/lib/utils/zip"
import { cn, formatBytes } from "@/lib/utils"
import { useClientValue } from "@/lib/use-client-value"

type Mode = "files" | "text" | "screen"

// Each task has its own colour, used sparingly: the active tab icon and focus states.
const MODES: Array<{
  id: Mode
  label: string
  icon: typeof File01Icon
  color: string
}> = [
  { id: "files", label: "Files", icon: File01Icon, color: "var(--teal)" },
  { id: "text", label: "Text", icon: TextIcon, color: "var(--violet)" },
  {
    id: "screen",
    label: "Screen",
    icon: ComputerScreenShareIcon,
    color: "var(--coral)",
  },
]

// Where things go: letters shared between words travel, the rest drop in or fall away.
const HERO_WORDS = [
  "any device.",
  "your phone.",
  "your laptop.",
  "your tablet.",
  "a friend.",
  "anywhere.",
  "the other side.",
  "across the globe.",
  "another screen.",
  "your favorite human.",
  "the moon. (almost)",
  "wherever.",
  "literally anywhere.",
  "your other half.",
  "the next room.",
  "another timezone.",
  "the couch.",
  "your future self.",
  "someone special.",
  "a tiny screen.",
  "a bigger screen.",
  "the whole world.",
  "your crush.",
  "your bestie.",
]

const spring = { type: "spring", bounce: 0.15, duration: 0.45 } as const

/** Number of files being dragged, or 0 when the drag isn't carrying files. */
const draggedFiles = (e: DragEvent | React.DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files")
    ? Math.max(1, e.dataTransfer?.items?.length ?? 1)
    : 0

export function Home() {
  const [mode, setMode] = useState<Mode>("files")
  const [files, setFiles] = useState<File[]>([])
  const [windowDrag, setWindowDrag] = useState(0)

  // Drop or paste files anywhere on the page; a drag anywhere arms the drop zone.
  useEffect(() => {
    let depth = 0
    const onEnter = (e: DragEvent) => {
      const n = draggedFiles(e)
      if (!n) return
      depth++
      setWindowDrag(n)
      setMode("files")
    }
    const onLeave = (e: DragEvent) => {
      if (!draggedFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setWindowDrag(0)
    }
    const onOver = (e: DragEvent) => draggedFiles(e) && e.preventDefault()
    const onDrop = async (e: DragEvent) => {
      if (!draggedFiles(e) || !e.dataTransfer) return
      e.preventDefault()
      depth = 0
      setWindowDrag(0)
      const dropped = await processDataTransfer(e.dataTransfer)
      setFiles((prev) => [...prev, ...dropped])
    }
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('textarea, input, [contenteditable="true"]')) return
      const pasted = Array.from(e.clipboardData?.files ?? [])
      if (!pasted.length) return
      setMode("files")
      setFiles((prev) => [...prev, ...pasted])
    }
    window.addEventListener("dragenter", onEnter)
    window.addEventListener("dragleave", onLeave)
    window.addEventListener("dragover", onOver)
    window.addEventListener("drop", onDrop)
    window.addEventListener("paste", onPaste)
    return () => {
      window.removeEventListener("dragenter", onEnter)
      window.removeEventListener("dragleave", onLeave)
      window.removeEventListener("dragover", onOver)
      window.removeEventListener("drop", onDrop)
      window.removeEventListener("paste", onPaste)
    }
  }, [])

  const active = MODES.find((m) => m.id === mode)!
  const nearby = useConnection((st) => st.nearby)
  const me = useConnection((st) => st.name)
  const orbitCaption = nearby.length
    ? `${nearby.length} ${nearby.length === 1 ? "device" : "devices"} on your network`
    : "Works across any network"

  return (
    <MotionConfig reducedMotion='user' transition={spring}>
      <div className='mx-auto w-full max-w-5xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10'>
        <div className='grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_15rem] lg:grid-cols-[minmax(0,1fr)_17rem]'>
          <div className='enter'>
            <h1 className='display'>
              Send anything to
              <br />
              {/* Own line, so the changing word width never reflows the first line. */}
              <DynamicText
                className='text-teal'
                words={HERO_WORDS}
                interval={1400}
              />
            </h1>
            <p className='mt-4 max-w-xl text-pretty text-[17px] text-muted-foreground'>
              Files, text or your screen, to a phone, tablet or computer. Same
              Wi‑Fi or across the world. Direct, end-to-end encrypted, no
              account.
            </p>
          </div>
          <figure
            className='enter hidden md:block'
            aria-label='Devices on your network'
          >
            <SignalOrbit me={me} peers={nearby} />
            <figcaption className='mt-1 text-center text-xs text-muted-foreground'>
              {orbitCaption}
            </figcaption>
          </figure>
        </div>

        <div className='mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]'>
          <Glass
            as='section'
            className='p-4 sm:p-6'
            aria-labelledby='send-heading'
          >
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <h2 id='send-heading' className='title'>
                Send
              </h2>
              <div
                role='tablist'
                aria-label='What to send'
                className='relative flex rounded-full bg-surface-2 p-1'
              >
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    role='tab'
                    id={`tab-${m.id}`}
                    aria-selected={mode === m.id}
                    aria-controls={`panel-${m.id}`}
                    onClick={() => setMode(m.id)}
                    className={cn(
                      "pressable relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium",
                      mode === m.id
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mode === m.id && (
                      <motion.span
                        layoutId='send-tab'
                        className='absolute inset-0 rounded-full border border-border bg-[var(--popover)] shadow-sm'
                      />
                    )}
                    <span
                      className='relative'
                      style={{ color: mode === m.id ? m.color : undefined }}
                    >
                      <Icon icon={m.icon} className='size-4' />
                    </span>
                    <span className='relative'>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div
              className='mt-5'
              role='tabpanel'
              id={`panel-${mode}`}
              aria-labelledby={`tab-${mode}`}
              style={{ ["--accent" as string]: active.color }}
            >
              <AnimatePresence mode='wait' initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{
                    opacity: 0,
                    y: -4,
                    filter: "blur(3px)",
                    transition: { duration: 0.12 },
                  }}
                >
                  {mode === "files" && (
                    <FilesPanel
                      files={files}
                      setFiles={setFiles}
                      windowDrag={windowDrag}
                    />
                  )}
                  {mode === "text" && <TextPanel />}
                  {mode === "screen" && <ScreenPanel />}
                </motion.div>
              </AnimatePresence>
            </div>
          </Glass>

          <div className='flex flex-col gap-4'>
            <ReceiveCard />
            <figure className='md:hidden' aria-label='Devices on your network'>
              <SignalOrbit me={me} peers={nearby} className='max-w-[13rem]' />
              <figcaption className='mt-1 text-center text-xs text-muted-foreground'>
                {orbitCaption}
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}

// ── Files ────────────────────────────────────────────────────────────────────

const extension = (name: string) => {
  const dot = name.lastIndexOf(".")
  return dot > 0 && dot > name.length - 7
    ? name.slice(dot + 1).toUpperCase()
    : "FILE"
}

/** Object URLs for image thumbnails, revoked when the list changes. */
function useThumbnails(files: File[]) {
  const urls = useMemo(
    () =>
      new Map(
        files
          .filter(
            (f) => f.type.startsWith("image/") && f.size < 25 * 1024 * 1024,
          )
          .map((f) => [f, URL.createObjectURL(f)]),
      ),
    [files],
  )
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return urls
}

function FilesPanel({
  files,
  setFiles,
  windowDrag,
}: {
  files: File[]
  setFiles: React.Dispatch<React.SetStateAction<File[]>>
  windowDrag: number
}) {
  const input = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)
  const zone = useRef<HTMLButtonElement>(null)
  const [packing, setPacking] = useState(false)
  const [over, setOver] = useState(0)
  const thumbs = useThumbnails(files)
  const total = files.reduce((s, f) => s + f.size, 0)
  const tooBig = total > LIMITS.maxTotalBytes || files.length > LIMITS.maxFiles
  const armed = windowDrag > 0
  const count = over || windowDrag

  const title = over
    ? `Drop ${count === 1 ? "the file" : `${count} files`}`
    : armed
      ? "Drop here"
      : files.length
        ? "Add more, or "
        : "Drop files here, or "

  const remove = (i: number) => {
    setFiles((prev) => prev.filter((_, j) => j !== i))
    zone.current?.focus({ preventScroll: true }) // the clicked button leaves with its row
  }

  return (
    <div>
      <input
        ref={input}
        type='file'
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          setFiles((prev) => [...prev, ...picked])
          e.target.value = ""
        }}
      />
      <input
        ref={folder}
        type='file'
        hidden
        {...({ webkitdirectory: "" } as object)}
        onChange={async (e) => {
          const picked = Array.from(e.target.files ?? [])
          e.target.value = ""
          if (!picked.length) return
          setPacking(true)
          try {
            const zip = await zipFolderSelection(picked)
            setFiles((prev) => [...prev, zip])
          } finally {
            setPacking(false)
          }
        }}
      />

      <button
        ref={zone}
        type='button'
        onClick={() => input.current?.click()}
        onDragEnter={(e) => setOver(draggedFiles(e))}
        onDragOver={(e) => setOver(draggedFiles(e))}
        onDragLeave={(e) => {
          if (
            !(
              e.relatedTarget instanceof Node &&
              e.currentTarget.contains(e.relatedTarget)
            )
          )
            setOver(0)
        }}
        onDrop={() => setOver(0)}
        aria-describedby='drop-hint'
        className={cn(
          "group/zone flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed px-6 text-center transition-[border-color,background-color,padding] duration-200",
          files.length ? "py-5" : "py-10",
          over
            ? "border-solid border-[var(--accent)] bg-[color-mix(in_oklch,var(--accent)_10%,transparent)]"
            : armed
              ? "border-[var(--accent)] bg-surface-2"
              : "border-[color-mix(in_oklch,var(--foreground)_22%,transparent)] hover:border-[color-mix(in_oklch,var(--foreground)_40%,transparent)] hover:bg-surface-2/60",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-10 place-items-center rounded-xl border bg-[var(--popover)] shadow-sm transition-colors duration-150",
            armed || over
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-border text-muted-foreground",
          )}
        >
          <Icon
            icon={Upload04Icon}
            className={cn(
              "size-[18px] transition-transform duration-200",
              (armed || over) && "motion-safe:-translate-y-0.5",
            )}
          />
        </span>
        <span className='flex flex-col gap-1'>
          <span className='font-medium'>
            {title}
            {!armed && !over && (
              <span className='underline decoration-border underline-offset-[3px] transition-colors group-hover/zone:decoration-foreground'>
                browse
              </span>
            )}
          </span>
          <span id='drop-hint' className='text-xs text-muted-foreground'>
            Any file · folders are zipped · up to{" "}
            {formatBytes(LIMITS.maxTotalBytes)}
          </span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className='overflow-hidden'
          >
            <ul
              className='mt-3 max-h-72 overflow-auto'
              aria-label='Selected files'
            >
              <AnimatePresence initial={false}>
                {files.map((f, i) => (
                  <motion.li
                    key={`${f.name}-${f.size}-${f.lastModified}`}
                    layout='position'
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{
                      opacity: 0,
                      height: 0,
                      transition: { duration: 0.15 },
                    }}
                    className='overflow-hidden'
                  >
                    <div className='flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-surface-2'>
                      {thumbs.get(f) ? (
                        <span
                          className='size-9 shrink-0 rounded-lg bg-cover bg-center ring-1 ring-border'
                          style={{ backgroundImage: `url("${thumbs.get(f)}")` }}
                          aria-hidden
                        />
                      ) : (
                        <span
                          className='grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 font-mono text-[10px] font-medium text-muted-foreground ring-1 ring-border'
                          aria-hidden
                        >
                          {extension(f.name)}
                        </span>
                      )}
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate'>{f.name}</span>
                        <span className='block text-xs tabular-nums text-muted-foreground'>
                          {formatBytes(f.size)}
                        </span>
                      </span>
                      <button
                        type='button'
                        className='pressable grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-destructive'
                        aria-label={`Remove ${f.name}`}
                        onClick={() => remove(i)}
                      >
                        <Icon icon={Delete02Icon} className='size-4' />
                      </button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <div className='mt-3 flex flex-wrap items-center justify-between gap-3'>
        <span className='text-sm text-muted-foreground' aria-live='polite'>
          {files.length ? (
            <>
              <span className='text-foreground'>{files.length}</span>{" "}
              {files.length === 1 ? "file" : "files"} · {formatBytes(total)}
              {tooBig && (
                <span className='ml-2 text-destructive'>over the limit</span>
              )}
            </>
          ) : (
            <Btn
              variant='ghost'
              size='sm'
              className='-ml-3'
              onClick={() => folder.current?.click()}
              disabled={packing}
            >
              {packing && <Spinner className='size-3.5' />}
              {packing ? "Packing folder…" : "Choose a folder instead"}
            </Btn>
          )}
        </span>
        {files.length > 0 && (
          <div className='flex gap-2'>
            <Btn variant='ghost' onClick={() => setFiles([])}>
              Clear
            </Btn>
            <Btn
              variant='primary'
              disabled={tooBig}
              onClick={() => shareFiles(files)}
            >
              Share {files.length === 1 ? "file" : `${files.length} files`}
            </Btn>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Text ─────────────────────────────────────────────────────────────────────

function TextPanel() {
  const [text, setText] = useState("")
  const bytes = new TextEncoder().encode(text.trim()).length
  const over = bytes > LIMITS.maxTextBytes
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (bytes && !over) shareText(text)
      }}
    >
      <label htmlFor='share-text' className='sr-only'>
        Text to send
      </label>
      <textarea
        id='share-text'
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Paste a link, a note, an address…'
        className='well min-h-48 w-full resize-y rounded-2xl p-4 text-[15px] leading-relaxed outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 focus:border-[var(--accent)] focus:ring-4 focus:ring-[color-mix(in_oklch,var(--accent)_15%,transparent)]'
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && bytes && !over)
            shareText(text)
        }}
      />
      <div className='mt-3 flex flex-wrap items-center justify-between gap-3'>
        <span
          className={cn(
            "text-sm tabular-nums",
            over ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {over
            ? `Too long, ${formatBytes(LIMITS.maxTextBytes)} max`
            : `${text.length.toLocaleString()} characters · ⌘↵ to share`}
        </span>
        <Btn variant='primary' type='submit' disabled={!bytes || over}>
          Share text
        </Btn>
      </div>
    </form>
  )
}

// ── Screen ───────────────────────────────────────────────────────────────────

function ScreenPanel() {
  const supported = useClientValue(screenShareSupported, true)
  return (
    <div>
      <div className='well rounded-2xl p-5'>
        <p className='font-medium'>Show your screen to another device, live.</p>
        <ul className='mt-3 space-y-2 text-sm text-muted-foreground'>
          <li>
            Your browser asks what to share: a window, a tab or the whole
            screen.
          </li>
          <li>
            You get a code and link. Nothing is visible until someone joins.
          </li>
          <li>Pause, switch what you share, or stop at any time.</li>
        </ul>
      </div>
      {!supported && (
        <p className='mt-3 text-sm text-warning' role='note'>
          This browser can’t share its screen (phones and tablets can only
          view). You can still watch a shared screen from here.
        </p>
      )}
      <div className='mt-4 flex justify-end'>
        <Btn
          variant='primary'
          disabled={!supported}
          onClick={() => shareScreen()}
        >
          Choose what to share
        </Btn>
      </div>
    </div>
  )
}

// ── Receive ──────────────────────────────────────────────────────────────────

function ReceiveCard() {
  const [code, setCode] = useState("")
  const [error, setError] = useState<ShareError | null>(null)
  const [busy, setBusy] = useState(false)
  const clean = normalizeCode(code)

  const submit = async () => {
    if (clean.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    const err = await join({ code: clean })
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Glass
      as='section'
      className='p-4 sm:p-6'
      aria-labelledby='receive-heading'
    >
      <div className='flex items-center gap-2'>
        <Icon icon={InboxDownloadIcon} className='text-sky' />
        <h2 id='receive-heading' className='title'>
          Receive
        </h2>
      </div>
      <p className='mt-1.5 text-sm text-muted-foreground'>
        Enter the code shown on the other device, or open the link they sent.
      </p>
      <form
        className='mt-4'
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label htmlFor='code' className='sr-only'>
          Share code
        </label>
        <input
          id='code'
          value={code}
          onChange={(e) => {
            const next = normalizeCode(e.target.value)
              .replace(/[^A-Z0-9]/g, "")
              .slice(0, 6)
            setCode(next)
            setError(null)
          }}
          inputMode='text'
          autoComplete='one-time-code'
          autoCapitalize='characters'
          spellCheck={false}
          placeholder='ABC123'
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "code-error" : undefined}
          className={cn(
            "well h-14 w-full rounded-2xl border text-center font-mono text-2xl font-medium tracking-[0.35em] uppercase outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/35 focus:ring-4",
            error
              ? "border-destructive/60 focus:ring-destructive/15"
              : "focus:border-sky/60 focus:ring-sky/15",
          )}
        />
        {error && (
          <p
            id='code-error'
            role='alert'
            className='enter mt-2 text-sm text-destructive'
          >
            <span className='font-medium'>{error.title}.</span> {error.detail}
          </p>
        )}
        <Btn
          variant='primary'
          type='submit'
          className='mt-3 w-full'
          disabled={clean.length !== 6 || busy}
        >
          {busy && <Spinner className='size-3.5' />}
          {busy ? "Joining…" : "Receive"}
        </Btn>
      </form>
    </Glass>
  )
}
