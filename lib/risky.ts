// Files that can run code when opened. SignalShare can't scan contents (they're end-to-end
// encrypted), so the name is the only signal: warn plainly, never block.

export type Risk = "program" | "script" | "macro" | "disguised"

const PROGRAM = new Set(
  "exe msi msix appx app dmg pkg mpkg apk aab xapk ipa jar deb rpm appimage scr com cpl run".split(
    " ",
  ),
)
const SCRIPT = new Set(
  "sh bash zsh command bat cmd ps1 psm1 vbs vbe jse wsf wsh hta lnk reg scpt applescript workflow".split(
    " ",
  ),
)
const MACRO = new Set("docm dotm xlsm xltm xlam pptm potm ppam".split(" "))
/** Extensions people trust at a glance, used to disguise programs ("invoice.pdf.exe"). */
const LOOKS_SAFE = new Set(
  "pdf doc docx xls xlsx ppt pptx txt rtf csv jpg jpeg png gif heic mp3 mp4 mov zip".split(
    " ",
  ),
)
const BIDI = /[‪-‮⁦-⁩]/

const exts = (name: string) => name.toLowerCase().split(".").slice(1)

export function riskOf(name: string): Risk | null {
  const parts = exts(name)
  const last = parts.at(-1) ?? ""
  const runnable = PROGRAM.has(last) || SCRIPT.has(last)
  // Right-to-left override flips how the name reads: "photo‮gpj.exe" shows as "photoexe.jpg".
  if (BIDI.test(name)) return "disguised"
  if (runnable && parts.length > 1 && LOOKS_SAFE.has(parts.at(-2)!))
    return "disguised"
  if (PROGRAM.has(last)) return "program"
  if (SCRIPT.has(last)) return "script"
  if (MACRO.has(last)) return "macro"
  return null
}

export function riskMessage(name: string, risk: Risk, from: string): string {
  switch (risk) {
    case "program":
      return `This is a program. Only open it if you expected it from ${from}.`
    case "script":
      return `This is a script that can run commands on your computer. Only open it if you expected it from ${from}.`
    case "macro":
      return `This document can contain macros. Keep macros turned off unless you trust ${from}.`
    case "disguised": {
      const fake = exts(name.replace(BIDI, "")).at(-2)?.toUpperCase()
      return `This file looks like ${fake ? `a ${fake}` : "a document"} but is a program. Don’t open it unless you’re sure what it is.`
    }
  }
}

export const PRECAUTION =
  "Only accept files you expect. SignalShare can’t scan files because they’re end-to-end encrypted."
