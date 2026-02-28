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
          <div className="p-6 bg-card/20 border border-primary/20 rounded-xl backdrop-blur-sm font-mono text-xs text-muted-foreground">
            <pre className="text-primary/80">
{`Client A
   ↕ (WebSocket signaling)
Server
   ↕ (WebSocket signaling)
Client B

[ WebRTC DataChannel ]
Direct P2P transmission happens here.`}
            </pre>
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
