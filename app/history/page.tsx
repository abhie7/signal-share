'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AppShell } from '@/components/share/app-shell';
import { historyDB, type TransferHistoryRecord } from '@/lib/db/history';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft02Icon as ArrowLeftIcon, Time02Icon as HistoryIcon, Download02Icon as ReceiveIcon, Upload02Icon as SendIcon, WasteIcon as TrashIcon } from '@hugeicons/core-free-icons';
import { formatBytes } from '@/lib/webrtc/file-chunker';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { format } from 'date-fns';

export default function HistoryPage() {
  const [history, setHistory] = useState<TransferHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const records = await historyDB.getAllTransactions();
      setHistory(records);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (confirm('Are you sure you want to clear all transfer history?')) {
      await historyDB.clearHistory();
      setHistory([]);
    }
  };

  return (
    <AppShell>
      <div className="w-full max-w-4xl mx-auto px-6 pt-32 pb-24 flex flex-col gap-8">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-mono text-xs uppercase tracking-widest w-fit">
          <HugeiconsIcon icon={ArrowLeftIcon} className="w-4 h-4" />
          Back to Scanner
        </Link>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-primary">
              <HugeiconsIcon icon={HistoryIcon} className="w-8 h-8" />
              <h1 className="text-3xl font-bold tracking-widest uppercase text-foreground">Transfer History</h1>
            </div>
            {history.length > 0 && (
              <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 font-mono text-xs uppercase tracking-widest" onClick={clearHistory}>
                <HugeiconsIcon icon={TrashIcon} className="w-4 h-4 mr-2" />
                Clear
              </Button>
            )}
          </div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider pl-11">
            All past file, text, and screen share sessions on this device
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-border/30 rounded-3xl p-8 bg-card/5 backdrop-blur-sm">
            <div className="relative mb-6">
              <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 blur-md" />
              <HugeiconsIcon icon={HistoryIcon} className="relative w-14 h-14 text-muted-foreground/20" />
            </div>
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider text-center">No past transfers found on this device.</p>
            <p className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider text-center mt-2">Transfers will appear here after completion</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {history.map((record) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-card/20 border border-primary/20 p-5 rounded-2xl backdrop-blur-sm hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border ${record.type === 'sent' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'}`}>
                    <HugeiconsIcon icon={record.type === 'sent' ? SendIcon : ReceiveIcon} className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-bold tracking-widest uppercase text-foreground/90">
                        {record.type === 'sent' ? 'Sent to' : 'Received from'}
                      </span>
                      <span className={`font-mono text-sm uppercase ${record.type === 'sent' ? 'text-primary' : 'text-emerald-400'}`}>
                        {record.peerName}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                      {new Date(record.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end w-full md:w-auto mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/20 md:border-transparent">
                  <span className="font-mono text-xs text-foreground/80 uppercase tracking-widest">
                    {record.files.length} {record.files.length === 1 ? 'File' : 'Files'} ({formatBytes(record.totalSize)})
                  </span>
                  <div className="opacity-60 max-w-[200px] truncate">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                      {record.files.map(f => f.name).join(', ')}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
