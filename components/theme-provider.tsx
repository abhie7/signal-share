"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

// next-themes renders an inline <script> that sets the theme before first paint. It only needs
// to run from the server HTML; on the client React 19 warns about rendering a script, so there
// it gets a non-executable type (the script element carries suppressHydrationWarning).
const scriptProps =
  typeof window === "undefined" ? undefined : { type: "application/json" }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute='class'
      defaultTheme='dark'
      enableSystem
      disableTransitionOnChange
      scriptProps={scriptProps}
    >
      {children}
    </NextThemesProvider>
  )
}
