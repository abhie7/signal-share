"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Alert02Icon,
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
import { signaling } from "@/lib/signaling"
import {
  asLink,
  classify,
  receiveTarget,
  TEXT_TYPES,
  type TextKind,
} from "@/lib/content"
import { describeSecrets, findSecrets, redact } from "@/lib/secrets"
import { highlight, languageLabel } from "@/components/code-view"
import { RequestSection } from "@/components/request-section"
import { MyDevices } from "@/components/my-devices"
import { LIMITS, normalizeCode } from "@/lib/protocol"
import { folderSelection, pathOf, processDataTransfer } from "@/lib/utils/zip"
import { cn, formatBytes } from "@/lib/utils"
import { useClientValue } from "@/lib/use-client-value"
import { shuffleBag } from "@/lib/shuffle"
import { useRouter } from "next/navigation"

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
  "another screen.",
  "your favorite human.",
  "the moon. (almost)",
  "literally anywhere.",
  "your other half.",
  "the next room.",
  "another timezone.",
  "the couch.",
  "your future self.",
  "someone special.",
  "the whole world.",
  "your crush.",
  "your bestie.",
  "a potato with WiFi.",
  "your emotional support screen.",
  "the void.",
  "the digital abyss.",
  "your favorite gremlin.",
  "a suspiciously tiny rectangle.",
  "your internet soulmate.",
  "the shadow realm.",
  "a very confused toaster.",
  "your secret admirer.",
  "the mothership.",
  "a parallel universe.",
  "your favorite menace.",
  "the land of pixels.",
  "your long-distance pookie.",
  "a screen far, far away.",
  "the forbidden rectangle.",
  "your designated yapper.",
  "your favorite yapper.",
  "the group chat goblins.",
  "your digital twin.",
  "someone who owes you money.",
  "your sworn enemy.",
  "your situationship.",
  "the silly little cloud.",
  "the other side of the planet.",
  "your favorite NPC.",
  "the chosen one.",
  "the council of frogs.",
  "a technologically advanced potato.",
  "your tiny internet kingdom.",
  "the depths of cyberspace.",
  "your partner in silliness.",
  "your future ex.",
  "your favorite walking red flag.",
  "the mysterious beyond.",
  "the land of zero bars.",
  "the intergalactic pigeon network.",
  "your favorite little weirdo.",
  "someone's glowing rectangle.",
  "the quantum banana dimension.",
  "your emergency contact.",
  "the raccoon headquarters.",
  "your favorite carbon-based lifeform.",
  "the other side of the couch.",
  "the secret frog society.",
  "your crush's crush.",
  "your mom's fridge. (maybe)",
  "the spaghetti dimension.",
  "your favorite collection of atoms.",
  "someone who gets your memes.",
  "your nemesis's toaster.",
  "the cosmic soup.",
  "your emotionally unavailable printer.",
  "a raccoon with a MacBook.",
  "the pigeon headquarters.",
  "the last brain cell.",
  "your digital pookie bear.",
  "a goose with internet access.",
  "the tiny hamster running the internet.",
  "the secret third location.",
  "your favorite unpaid therapist.",
  "the interdimensional snack drawer.",
  "the council of tiny ducks.",
  "your legally assigned bestie.",
  "the other side of the simulation.",
  "a worm with big dreams.",
  "your favorite silly little creature.",
  "the place where lost socks go.",
  "your favorite human-shaped problem.",
  "the forbidden group chat.",
  "the other end of the noodle.",
  "your favorite cosmic accident.",
]

const spring = { type: "spring", bounce: 0.15, duration: 0.45 } as const

/** Greedy word wrap of `phrase` into lines no wider than `width`. */
function wrapWords(
  ctx: CanvasRenderingContext2D,
  phrase: string,
  width: number,
) {
  const lines: string[] = []
  let line = ""
  for (const word of phrase.split(" ")) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  lines.push(line)
  return lines
}

/**
 * The rotating phrase at full heading size. DynamicText lays out a single line, so the
 * phrase is wrapped here and each line morphs on its own. The block always holds as many
 * lines as the longest phrase needs at this width, so changing words never moves the page.
 */
function HeroLine() {
  const [words] = useState(() => shuffleBag(HERO_WORDS))
  const [step, setStep] = useState(0)
  const [fit, setFit] = useState<{
    wrap: (phrase: string) => string[]
    rows: number
  } | null>(null)
  const host = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = host.current
    const ctx = document.createElement("canvas").getContext("2d")
    if (!el || !ctx) return
    const measure = () => {
      const font = getComputedStyle(el)
      ctx.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`
      // Canvas skips the heading's rounded axis; 3% slack keeps lines inside the box.
      const width = el.clientWidth * 0.97
      const wrap = (phrase: string) => wrapWords(ctx, phrase, width)
      const rows = Math.max(...HERO_WORDS.map((w) => wrap(w).length))
      setFit({ wrap, rows })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    void document.fonts?.ready.then(measure)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setStep((s) => s + 1)
    }, 1400)
    return () => clearInterval(id)
  }, [])

  const phrase = words[step % words.length]
  const lines = fit ? fit.wrap(phrase) : [phrase]
  return (
    <span ref={host} className='block text-teal'>
      {/* Read once, not every 1.4 s. */}
      <span className='sr-only'>{HERO_WORDS[0]}</span>
      <span aria-hidden>
        {Array.from({ length: fit?.rows ?? 2 }, (_, i) => (
          <span key={i} className='block'>
            <DynamicText text={lines[i] ?? ""} />
          </span>
        ))}
      </span>
    </span>
  )
}

/** Runs `fn` once `selector` is on the page (panels mount after their exit animation). */
function whenReady<T extends HTMLElement>(
  selector: string,
  fn: (el: T) => void,
) {
  let frames = 0
  const tick = () => {
    const el = document.querySelector<T>(selector)
    if (el) return fn(el)
    if (++frames < 40) requestAnimationFrame(tick)
  }
  tick()
}

/** Number of files being dragged, or 0 when the drag isn't carrying files. */
const draggedFiles = (e: DragEvent | React.DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files")
    ? Math.max(1, e.dataTransfer?.items?.length ?? 1)
    : 0

export function Home() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("files")
  const [files, setFiles] = useState<File[]>([])
  const [text, setText] = useState("")
  const [code, setCode] = useState("")
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
    // Paste anywhere: files go to Files, a share code or link goes to Receive, anything else
    // becomes text to send. Inside a field, paste behaves normally.
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('textarea, input, [contenteditable="true"]')) return
      const pasted = Array.from(e.clipboardData?.files ?? [])
      if (pasted.length) {
        setMode("files")
        setFiles((prev) => [...prev, ...pasted])
        return
      }
      const value = e.clipboardData?.getData("text/plain") ?? ""
      if (!value.trim()) return
      e.preventDefault()
      const origins = [location.origin, signaling.welcome?.publicUrl ?? ""]
      const goal = receiveTarget(value, origins)
      if (goal && "path" in goal) return router.push(goal.path)
      if (goal) {
        setCode(goal.code)
        whenReady("#receive-submit:enabled", (el) => el.focus())
        return
      }
      setMode("text")
      setText((prev) => (prev.trim() ? `${prev}\n${value}` : value))
      whenReady<HTMLTextAreaElement>("#share-text", (el) => el.focus())
    }
    // Commands from the palette and keyboard shortcuts (components/shortcuts.tsx).
    const onCommand = (e: Event) => {
      const what = (e as CustomEvent<string>).detail
      if (what === "screen") return shareScreen() // still inside the key press or click
      if (what === "receive") return whenReady("#code", (el) => el.focus())
      if (what !== "files" && what !== "text") return
      setMode(what)
      if (what === "files")
        whenReady<HTMLInputElement>("input[type=file][multiple]", (el) =>
          el.click(),
        )
      else whenReady("#share-text", (el) => el.focus())
    }
    window.addEventListener("ss:command", onCommand)
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
      window.removeEventListener("ss:command", onCommand)
    }
  }, [router])

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
              <HeroLine />
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
          {/* Fills the row's height: the panel inside grows instead of leaving a gap. */}
          <Glass
            as='section'
            className='flex flex-col p-4 sm:p-6'
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
              className='mt-5 flex flex-1 flex-col'
              role='tabpanel'
              id={`panel-${mode}`}
              aria-labelledby={`tab-${mode}`}
              style={{ ["--accent" as string]: active.color }}
            >
              <AnimatePresence mode='wait' initial={false}>
                <motion.div
                  key={mode}
                  className='flex flex-1 flex-col'
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
                  {mode === "text" && (
                    <TextPanel text={text} setText={setText} />
                  )}
                  {mode === "screen" && <ScreenPanel />}
                </motion.div>
              </AnimatePresence>
            </div>
          </Glass>

          <div className='flex flex-col gap-4'>
            <ReceiveCard code={code} setCode={setCode} />
            <MyDevices />
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
    <div className='flex flex-1 flex-col'>
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
            const inside = await folderSelection(picked)
            setFiles((prev) => [...prev, ...inside])
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
          if (!(
            e.relatedTarget instanceof Node &&
            e.currentTarget.contains(e.relatedTarget)
          ))
            setOver(0)
        }}
        onDrop={() => setOver(0)}
        aria-describedby='drop-hint'
        className={cn(
          "group/zone flex min-h-40 w-full flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 text-center transition-[border-color,background-color,padding] duration-200",
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
            Any file or folder · up to {formatBytes(LIMITS.maxTotalBytes)}
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
                    key={`${pathOf(f)}-${f.size}-${f.lastModified}`}
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
                        <span className='block truncate text-xs tabular-nums text-muted-foreground'>
                          {formatBytes(f.size)}
                          {pathOf(f) !== f.name &&
                            ` · ${pathOf(f).slice(0, -f.name.length - 1)}`}
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
              {packing ? "Reading folder…" : "Choose a folder instead"}
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

/** Language of code being typed, detected a moment after typing stops. */
function useDetectedLang(code: string | null) {
  const [found, setFound] = useState<string | null>(null)
  useEffect(() => {
    if (!code) return
    const t = setTimeout(() => {
      highlight(code)
        .then((r) => setFound(r.language))
        .catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [code])
  return code ? found : null
}

const AS_LABEL: Record<TextKind, string> = {
  text: "Text",
  code: "Code",
  link: "Link",
}

function TextPanel({
  text,
  setText,
}: {
  text: string
  setText: React.Dispatch<React.SetStateAction<string>>
}) {
  const [override, setOverride] = useState<TextKind | null>(null)
  const bytes = new TextEncoder().encode(text.trim()).length
  const over = bytes > LIMITS.maxTextBytes
  const detected = useMemo(() => classify(text), [text])
  const link = asLink(text)
  // What the receiver will see. A manual choice wins, unless it stopped making sense.
  const kind = override === "link" && !link ? detected : (override ?? detected)
  const lang = useDetectedLang(kind === "code" ? text : null)
  const secrets = useMemo(() => findSecrets(text), [text])
  const type =
    kind === "code" && lang
      ? `${TEXT_TYPES.code}; lang=${lang}`
      : TEXT_TYPES[kind]
  const send = () => bytes && !over && shareText(text, type)
  const options: TextKind[] = link ? ["text", "link"] : ["text", "code"]

  return (
    <form
      className='flex flex-1 flex-col'
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <label htmlFor='share-text' className='sr-only'>
        Text to send
      </label>
      <textarea
        id='share-text'
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (!e.target.value) setOverride(null)
        }}
        placeholder='Paste a link, some code, a note, an address…'
        spellCheck={kind !== "code"}
        className={cn(
          "well min-h-48 w-full flex-1 resize-y rounded-2xl p-4 leading-relaxed outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 focus:border-[var(--accent)] focus:ring-4 focus:ring-[color-mix(in_oklch,var(--accent)_15%,transparent)]",
          kind === "code" ? "font-mono text-[13px]" : "text-[15px]",
        )}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send()
        }}
      />
      {secrets.length > 0 && (
        <div
          role='alert'
          className='enter mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[color-mix(in_oklch,var(--warning)_45%,transparent)] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] p-3 text-sm'
        >
          <Icon icon={Alert02Icon} className='size-4 shrink-0 text-warning' />
          <span className='min-w-0 flex-1'>
            <span className='font-medium'>
              {secrets.length === 1
                ? "1 possible secret"
                : `${secrets.length} possible secrets`}
            </span>{" "}
            <span className='text-muted-foreground'>
              ({describeSecrets(secrets)}). Whoever receives this can use them.
            </span>
          </span>
          <Btn size='sm' onClick={() => setText(redact(text, secrets))}>
            Redact
          </Btn>
        </div>
      )}
      <div className='mt-3 flex flex-wrap items-center justify-between gap-3'>
        {text.trim() && !over ? (
          <div
            role='radiogroup'
            aria-label='Send as'
            className='flex items-center gap-1 text-sm'
          >
            <span className='mr-1 text-muted-foreground'>Send as</span>
            {options.map((k) => (
              <button
                key={k}
                type='button'
                role='radio'
                aria-checked={kind === k}
                onClick={() => setOverride(k)}
                className={cn(
                  "pressable rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  kind === k
                    ? "border-[var(--accent)] bg-[color-mix(in_oklch,var(--accent)_12%,transparent)] text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {k === "code" && kind === "code" && lang
                  ? `Code · ${languageLabel(lang)}`
                  : AS_LABEL[k]}
              </button>
            ))}
          </div>
        ) : (
          <span
            className={cn(
              "text-sm tabular-nums",
              over ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {over
              ? `Too long, ${formatBytes(LIMITS.maxTextBytes)} max`
              : "Tip: paste anywhere on this page · ⌘↵ to share"}
          </span>
        )}
        <Btn variant='primary' type='submit' disabled={!bytes || over}>
          {secrets.length ? "Send anyway" : "Share text"}
        </Btn>
      </div>
    </form>
  )
}

// ── Screen ───────────────────────────────────────────────────────────────────

function ScreenPanel() {
  const supported = useClientValue(screenShareSupported, true)
  return (
    <div className='flex flex-1 flex-col'>
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
      <div className='mt-auto flex justify-end pt-4'>
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

function ReceiveCard({
  code,
  setCode,
}: {
  code: string
  setCode: (code: string) => void
}) {
  const router = useRouter()
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
          onPaste={(e) => {
            // A pasted share link opens it, instead of being cut down to six characters.
            const goal = receiveTarget(e.clipboardData.getData("text/plain"), [
              location.origin,
              signaling.welcome?.publicUrl ?? "",
            ])
            if (goal && "path" in goal) {
              e.preventDefault()
              router.push(goal.path)
            }
          }}
          inputMode='text'
          autoComplete='one-time-code'
          autoCapitalize='characters'
          spellCheck={false}
          placeholder='ABC234'
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
          id='receive-submit'
          variant='primary'
          type='submit'
          className='mt-3 w-full'
          disabled={clean.length !== 6 || busy}
        >
          {busy && <Spinner className='size-3.5' />}
          {busy ? "Joining…" : "Receive"}
        </Btn>
      </form>
      <RequestSection />
    </Glass>
  )
}
