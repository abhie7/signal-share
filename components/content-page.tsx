import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Glass } from "@/components/brand"

/** Layout for text pages: readable measure, clear way back. */
export function ContentPage({
  title,
  lead,
  children,
}: {
  title: string
  lead?: string
  children: React.ReactNode
}) {
  return (
    <AppShell>
      <article className='mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12'>
        <Link
          href='/'
          className='text-sm text-muted-foreground hover:text-foreground'
        >
          ← SignalShare
        </Link>
        <h1 className='display mt-4'>{title}</h1>
        {lead && (
          <p className='mt-3 text-[17px] text-muted-foreground'>{lead}</p>
        )}
        <Glass className='mt-8 p-6 sm:p-8'>
          <div className='space-y-10 text-[15px] leading-relaxed [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground [&_h2]:title [&_h2]:mb-3 [&_li]:text-muted-foreground [&_p]:text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5'>
            {children}
          </div>
        </Glass>
      </article>
    </AppShell>
  )
}
