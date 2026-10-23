"use client"

import { useEffect, useState } from "react"
import { ContentPage } from "@/components/content-page"
import { Btn } from "@/components/ui-kit"
import { historyDB, type TransferHistoryRecord } from "@/lib/db/history"
import { formatBytes } from "@/lib/utils"

export default function HistoryPage() {
  const [items, setItems] = useState<TransferHistoryRecord[] | null>(null)

  useEffect(() => {
    historyDB.getAllTransactions().then(setItems, () => setItems([]))
  }, [])

  return (
    <ContentPage
      title='History'
      lead='Transfers made from this browser. Stored only on this device : contents are never kept.'
    >
      {items === null ? null : items.length === 0 ? (
        <p>Nothing yet. Completed transfers show up here.</p>
      ) : (
        <section>
          <ul className='!list-none !pl-0 !space-y-0 divide-y divide-border rounded-2xl border border-border bg-surface'>
            {items.map((r) => (
              <li key={r.id} className='flex items-center gap-3 px-4 py-3'>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.type === "sent" ? "bg-primary/10 text-primary" : "bg-success/15 text-success"}`}
                >
                  {r.type === "sent" ? "Sent" : "Received"}
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='truncate !text-foreground'>
                    {r.files.length === 1
                      ? r.files[0].name
                      : `${r.files.length} files`}
                  </p>
                  <p className='text-xs'>
                    {r.type === "sent" ? "to" : "from"} {r.peerName} ·{" "}
                    {new Date(r.timestamp).toLocaleString()}
                  </p>
                </div>
                <span className='text-sm tabular-nums'>
                  {formatBytes(r.totalSize)}
                </span>
              </li>
            ))}
          </ul>
          <div className='mt-4 flex justify-end'>
            <Btn
              variant='danger'
              size='sm'
              onClick={async () => {
                if (!confirm("Clear your transfer history on this device?"))
                  return
                await historyDB.clearHistory()
                setItems([])
              }}
            >
              Clear history
            </Btn>
          </div>
        </section>
      )}
    </ContentPage>
  )
}
