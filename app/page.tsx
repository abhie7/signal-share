"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AppShell } from "@/components/app-shell"
import { Home } from "@/components/home"
import { SessionView } from "@/components/session-view"
import { useShare } from "@/lib/store"

export default function Page() {
  const idle = useShare((s) => s.phase === "idle")
  return (
    <AppShell>
      <AnimatePresence mode='wait' initial={false}>
        <motion.div
          key={idle ? "home" : "session"}
          className='flex flex-1 flex-col'
          initial={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
          // A leftover `filter` on an ancestor would stop the glass cards from
          // blurring the background behind it, so clear it once settled.
          animate={{
            opacity: 1,
            scale: 1,
            filter: "blur(0px)",
            transitionEnd: { filter: "none" },
          }}
          exit={{
            opacity: 0,
            scale: 0.98,
            filter: "blur(6px)",
            transition: { duration: 0.14 },
          }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        >
          {idle ? <Home /> : <SessionView />}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  )
}
