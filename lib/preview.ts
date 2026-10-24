// Which received files can be previewed in the page, and as what. The type comes from the
// extension, never from the sender's declared MIME type, and markup (HTML, SVG, XML) is never
// rendered: a blob URL runs with this site's origin, so rendered markup could run script.

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text"

const TYPES: Record<string, [PreviewKind, string]> = {
  png: ["image", "image/png"],
  jpg: ["image", "image/jpeg"],
  jpeg: ["image", "image/jpeg"],
  gif: ["image", "image/gif"],
  webp: ["image", "image/webp"],
  avif: ["image", "image/avif"],
  bmp: ["image", "image/bmp"],
  mp4: ["video", "video/mp4"],
  m4v: ["video", "video/mp4"],
  webm: ["video", "video/webm"],
  mov: ["video", "video/quicktime"],
  mp3: ["audio", "audio/mpeg"],
  m4a: ["audio", "audio/mp4"],
  wav: ["audio", "audio/wav"],
  ogg: ["audio", "audio/ogg"],
  flac: ["audio", "audio/flac"],
  pdf: ["pdf", "application/pdf"],
}
const TEXT =
  "txt md csv tsv json log yaml yml toml ini env conf js mjs ts tsx jsx py rb go rs java kt swift c h cpp hpp cs php sh css scss sql xml html svg".split(
    " ",
  )

export function previewOf(
  name: string,
): { kind: PreviewKind; type: string } | null {
  const ext = name.toLowerCase().split(".").at(-1) ?? ""
  if (!name.includes(".")) return null
  const known = TYPES[ext]
  if (known) return { kind: known[0], type: known[1] }
  // Markup is shown as source text, never rendered.
  return TEXT.includes(ext) ? { kind: "text", type: "text/plain" } : null
}

/** Biggest text file worth reading into the page for a preview. */
export const TEXT_PREVIEW_BYTES = 256 * 1024
