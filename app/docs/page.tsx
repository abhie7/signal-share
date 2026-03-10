import { AppShell } from '@/components/share/app-shell';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft02Icon as ArrowLeftIcon, Book01Icon as BookIcon } from '@hugeicons/core-free-icons';
import Link from 'next/link';

export const metadata = {
  title: 'Architecture & Documentation | SignalShare',
  description: 'Technical overview and architecture of the SignalShare peer-to-peer transmission protocol.',
};

export default function DocsPage() {
  return (
    <AppShell>
      <div className="w-full max-w-3xl mx-auto px-6 pt-32 pb-24 flex flex-col gap-12">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-mono text-xs uppercase tracking-widest w-fit">
          <HugeiconsIcon icon={ArrowLeftIcon} className="w-4 h-4" />
          Back to Scanner
        </Link>

        <div>
          <div className="flex items-center gap-3 mb-4 text-primary">
            <HugeiconsIcon icon={BookIcon} className="w-8 h-8" />
            <h1 className="text-3xl font-bold tracking-widest uppercase text-foreground">Architecture</h1>
          </div>
          <p className="font-mono text-sm text-muted-foreground leading-relaxed">
            SignalShare uses WebRTC to establish direct peer-to-peer data channels between devices on the same network. A Fastify server handles signaling and relay when required.
          </p>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">Network Flow</h2>
          <div className="relative p-8 md:p-12 bg-card/20 border border-primary/20 rounded-xl backdrop-blur-sm overflow-hidden">
            
            {/* Vertical Signaling Path */}
            <div className="flex flex-col items-center gap-0">
              {/* Client A Node */}
              <div className="relative z-10 flex items-center gap-3 px-6 py-3 rounded-2xl border border-primary/40 bg-primary/10 backdrop-blur-md shadow-[0_0_20px_rgba(var(--primary),0.15)]">
                <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)] animate-pulse" />
                <span className="text-sm font-bold tracking-widest uppercase text-primary">Client A</span>
              </div>

              {/* Animated Dashed Line A→Server */}
              <div className="relative w-[2px] h-16">
                <div className="absolute inset-0 border-l-2 border-dashed border-primary/40" style={{ animation: 'dashFlow 1.5s linear infinite' }} />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">WebSocket Signaling</span>
              </div>

              {/* Server Node */}
              <div className="relative z-10 flex items-center gap-3 px-6 py-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 backdrop-blur-md shadow-[0_0_20px_rgba(52,211,153,0.15)]">
                <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                <span className="text-sm font-bold tracking-widest uppercase text-emerald-400">Server</span>
              </div>

              {/* Animated Dashed Line Server→B */}
              <div className="relative w-[2px] h-16">
                <div className="absolute inset-0 border-l-2 border-dashed border-primary/40" style={{ animation: 'dashFlow 1.5s linear infinite reverse' }} />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-mono text-muted-foreground uppercase tracking-widest whitespace-nowrap">WebSocket Signaling</span>
              </div>

              {/* Client B Node */}
              <div className="relative z-10 flex items-center gap-3 px-6 py-3 rounded-2xl border border-primary/40 bg-primary/10 backdrop-blur-md shadow-[0_0_20px_rgba(var(--primary),0.15)]">
                <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)] animate-pulse" />
                <span className="text-sm font-bold tracking-widest uppercase text-primary">Client B</span>
              </div>
            </div>

            {/* WebRTC DataChannel Bridge */}
            <div className="mt-10 relative flex flex-col items-center">
              <div className="relative w-full max-w-sm mx-auto">
                {/* Glowing line */}
                <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary to-transparent rounded-full shadow-[0_0_15px_rgba(var(--primary),0.6)]" />
                
                {/* Pulsing data particle */}
                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-[0_0_12px_rgba(var(--primary),0.9)]" style={{ animation: 'dataPacket 2s ease-in-out infinite' }} />

                {/* Labels on each end */}
                <div className="absolute -left-1 -top-6 text-[9px] font-mono text-primary/80 uppercase tracking-widest">A</div>
                <div className="absolute -right-1 -top-6 text-[9px] font-mono text-primary/80 uppercase tracking-widest">B</div>
              </div>

              <div className="mt-4 flex flex-col items-center gap-1">
                <span className="text-xs font-bold tracking-widest uppercase text-primary/90">WebRTC DataChannel</span>
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Direct P2P Transmission</span>
              </div>
            </div>

            {/* Injected keyframes via style tag */}
            <style>{`
              @keyframes dashFlow {
                0% { background-position: 0 0; }
                100% { background-position: 0 20px; }
              }
              @keyframes dataPacket {
                0% { left: 0%; opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { left: calc(100% - 12px); opacity: 0; }
              }
            `}</style>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">Transmission Modes</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 bg-primary/5 border border-primary/10 rounded-xl space-y-3">
              <h3 className="font-bold tracking-widest uppercase text-primary">Direct Channel (LAN)</h3>
              <ul className="space-y-2 font-mono text-xs text-muted-foreground list-disc pl-4 marker:text-primary/50">
                <li>Devices must be on same local network</li>
                <li>Transfers via WebRTC data channels</li>
                <li>Zero bytes stored on any server</li>
                <li>Highest potential throughput</li>
              </ul>
            </div>

            <div className="p-6 bg-primary/5 border border-primary/10 rounded-xl space-y-3">
              <h3 className="font-bold tracking-widest uppercase text-primary">Relay Mode (Remote)</h3>
              <ul className="space-y-2 font-mono text-xs text-muted-foreground list-disc pl-4 marker:text-primary/50">
                <li>Temporary server memory stream</li>
                <li>Used when peers are not local</li>
                <li>Complete auto-deletion upon reception</li>
                <li>Time-limited secure keys</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">Security Philosophy</h2>
          <div className="space-y-4 font-mono text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span> No account system or identity tracking
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span> No permanent storage (SSD/HDD) used
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span> Files are streamed directly in-memory
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span> Relay data automatically detonates after transmission
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">Known Constraints</h2>
          <div className="space-y-2 font-mono text-xs text-muted-foreground bg-destructive/5 border border-destructive/20 p-5 rounded-xl">
            <p>• Requires a browser with WebRTC support.</p>
            <p>• Strict NATs or corporate firewalls may block direct P2P connections.</p>
            <p>• Heavy background tabs on mobile OS (iOS/Android) may pause WebSocket signaling.</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
