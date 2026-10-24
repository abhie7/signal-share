import type { Metadata, Viewport } from "next"
import { Google_Sans_Code, Google_Sans } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const sans = Google_Sans({
  subsets: ["latin"],
  axes: ["opsz", "GRAD"],
  variable: "--font-flex",
  display: "swap",
  adjustFontFallback: false,
})
const code = Google_Sans_Code({
  subsets: ["latin"],
  variable: "--font-gcode",
  display: "swap",
  adjustFontFallback: false,
})

export const metadata: Metadata = {
  title: "SignalShare | send files, text and your screen to any device",
  description:
    "Share files, text and your screen between any two devices. No account. Direct when possible, encrypted relay when not.",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#17181b" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang='en'
      className={`${sans.variable} ${code.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
