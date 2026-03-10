'use client';

import { motion } from 'framer-motion';
import { AppShell } from '@/components/share/app-shell';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft02Icon as ArrowLeftIcon,
  Book01Icon as BookIcon,
  Timer02Icon,
} from '@hugeicons/core-free-icons';
import Link from 'next/link';

function EndpointNode({ label, active }: { label: string; active?: boolean }) {
  return (
    <motion.div
      animate={{
        scale: active ? 1.02 : 1,
      }}
      transition={{ duration: 0.35 }}
      className="relative w-40 rounded-xl border border-primary/30 bg-card/60 p-4 backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center justify-center text-primary">
        <svg
          viewBox="0 0 64 64"
          className="h-10 w-10"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="10"
            y="14"
            width="44"
            height="28"
            rx="4"
            className="stroke-current"
            strokeWidth="3"
          />
          <line
            x1="22"
            y1="50"
            x2="42"
            y2="50"
            className="stroke-current"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1="27"
            y1="42"
            x2="27"
            y2="50"
            className="stroke-current"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1="37"
            y1="42"
            x2="37"
            y2="50"
            className="stroke-current"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="text-center text-xs font-mono uppercase tracking-widest text-primary">
        {label}
      </div>
    </motion.div>
  );
}

function ServerNode({ active }: { active?: boolean }) {
  return (
    <motion.div
      animate={{
        scale: active ? 1.03 : 0.98,
        opacity: active ? 1 : 0.55,
      }}
      transition={{ duration: 0.35 }}
      className="relative w-44 rounded-xl border border-primary/30 bg-primary/5 p-4"
    >
      <div className="mb-2 flex items-center justify-center text-primary">
        <svg
          viewBox="0 0 64 64"
          className="h-10 w-10"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="12"
            y="10"
            width="40"
            height="14"
            rx="3"
            className="stroke-current"
            strokeWidth="3"
          />
          <rect
            x="12"
            y="26"
            width="40"
            height="14"
            rx="3"
            className="stroke-current"
            strokeWidth="3"
          />
          <rect
            x="12"
            y="42"
            width="40"
            height="12"
            rx="3"
            className="stroke-current"
            strokeWidth="3"
          />
          <circle cx="19" cy="17" r="1.8" className="fill-current" />
          <circle cx="19" cy="33" r="1.8" className="fill-current" />
          <circle cx="19" cy="48" r="1.8" className="fill-current" />
        </svg>
      </div>
      <div className="text-center text-xs font-mono uppercase tracking-widest text-primary">
        Signaling Server
      </div>
    </motion.div>
  );
}

function DottedPath() {
  return (
    <div className="absolute inset-0">
      <svg
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        <motion.line
          x1="100"
          y1="4"
          x2="0"
          y2="4"
          className="stroke-primary"
          strokeWidth="0.9"
          strokeDasharray="3 4"
          strokeLinecap="round"
          initial={{ strokeDashoffset: 0 }}
          animate={{
            strokeDashoffset: [0, 14],
            opacity: 1,
          }}
          transition={{
            strokeDashoffset: {
              repeat: Infinity,
              duration: 0.5,
              ease: 'linear',
            },
          }}
        />
      </svg>
    </div>
  );
}

function DataPacket({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      animate={{
        left: ['20%', '80%'],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        left: {
          repeat: Infinity,
          duration: 1.15,
          ease: 'linear',
          delay,
          repeatDelay: 1.15,
        },
        opacity: {
          repeat: Infinity,
          duration: 1.15,
          ease: 'easeInOut',
          delay,
          repeatDelay: 1.15,
        },
      }}
      className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-primary"
    />
  );
}

export function NetworkFlowDiagram() {
  const phaseLabel = 'WebSocket Signaling: A → Server → B';

  return (
    <div className="relative w-full rounded-2xl border border-border/50 bg-card/30 p-6">
      <div className="relative flex h-42 items-center justify-between gap-4 px-2 md:px-6">
        <EndpointNode label="Client A" active />
        <ServerNode active />
        <EndpointNode label="Client B" active />

        <div className="pointer-events-none absolute left-[17%] top-1/2 h-px w-[26%] -translate-y-1/2">
          <DottedPath />
          <DataPacket delay={0} />
        </div>

        <div className="pointer-events-none absolute right-[17%] top-1/2 h-px w-[26%] -translate-y-1/2">
          <DottedPath />
          <DataPacket delay={1.15} />
        </div>
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
        {phaseLabel}
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <AppShell>
      <div className="w-full max-w-4xl mx-auto px-6 pt-32 pb-24 flex flex-col gap-12">
        <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-mono text-xs uppercase tracking-widest"
          >
            <HugeiconsIcon icon={ArrowLeftIcon} className="w-4 h-4" />
            <span>Back to Scanner</span>
          </Link>

          <Link
            href="/change-logs"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-mono text-xs uppercase tracking-widest"
          >
            <HugeiconsIcon icon={Timer02Icon} className="w-4 h-4" />
            <span>View Change Logs</span>
          </Link>
        </div>
        <div>
          <div className="flex items-center gap-3 mb-4 text-primary">
            <HugeiconsIcon icon={BookIcon} className="w-8 h-8" />
            <h1 className="text-3xl font-bold tracking-widest uppercase text-foreground">
              Architecture and Docs
            </h1>
          </div>
          <p className="font-mono text-sm text-muted-foreground leading-relaxed">
            SignalShare is an open-source transfer engine focused on direct
            browser-to-browser delivery first, with secure relay fallback when
            required. This page summarizes how transport, signaling, security,
            and operational behavior work in the current codebase.
          </p>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">
            System Overview
          </h2>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-primary/15 bg-card/20 p-4 space-y-2">
              <p className="text-xs font-mono uppercase tracking-widest text-primary">Client Layer</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Next.js App Router UI with Zustand stores, transfer hooks,
                animated status views, and IndexedDB history.
              </p>
            </div>
            <div className="rounded-xl border border-primary/15 bg-card/20 p-4 space-y-2">
              <p className="text-xs font-mono uppercase tracking-widest text-primary">Signaling Layer</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Fastify WebSocket route (`/api/ws`) coordinates discovery,
                session creation, code/link joins, and WebRTC message relay.
              </p>
            </div>
            <div className="rounded-xl border border-primary/15 bg-card/20 p-4 space-y-2">
              <p className="text-xs font-mono uppercase tracking-widest text-primary">Transfer Layer</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Local mode uses WebRTC DataChannels. Remote mode streams chunks
                via in-memory relay + SSE progress channels.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">
            Network Flow
          </h2>
          <NetworkFlowDiagram />
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">
            Transmission Modes
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 bg-primary/5 border border-primary/10 rounded-xl space-y-3">
              <h3 className="font-bold tracking-widest uppercase text-primary">
                Direct Channel (LAN)
              </h3>
              <ul className="space-y-2 font-mono text-xs text-muted-foreground list-disc pl-4 marker:text-primary/50">
                <li>Devices must be on same local network</li>
                <li>Transfers via WebRTC data channels</li>
                <li>Zero bytes stored on any server</li>
                <li>Highest potential throughput</li>
              </ul>
            </div>

            <div className="p-6 bg-primary/5 border border-primary/10 rounded-xl space-y-3">
              <h3 className="font-bold tracking-widest uppercase text-primary">
                Relay Mode (Remote)
              </h3>
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
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">
            Session Lifecycle
          </h2>
          <div className="space-y-3 font-mono text-xs text-muted-foreground">
            <p>1. Sender creates session (`create-session`) and receives code + share link.</p>
            <p>2. Receiver joins via code (`join-by-code`) or link (`join-by-link`).</p>
            <p>3. Server determines `local` or `remote` based on subnet relation.</p>
            <p>4. Local mode: `receiver-rtc-ready` triggers offer/answer + ICE exchange.</p>
            <p>5. Remote mode: sender streams chunks; receiver consumes SSE download + progress.</p>
            <p>6. Session completes, errors, or cancels, then cleanup occurs automatically.</p>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">
            API Endpoints
          </h2>

          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-card/20 p-4">
              <p className="text-xs font-mono uppercase tracking-widest text-primary mb-2">HTTP</p>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <p><code>GET /health</code> - service heartbeat and timestamp.</p>
                <p><code>GET /api/transfer/:id</code> - transfer metadata for a session.</p>
                <p><code>GET /api/transfer/:id/download</code> - SSE stream for relay chunks.</p>
                <p><code>GET /api/transfer/:id/progress</code> - SSE stream for progress events.</p>
              </div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-card/20 p-4">
              <p className="text-xs font-mono uppercase tracking-widest text-primary mb-2">WebSocket (`/api/ws`)</p>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <p><code>create-session</code>, <code>join-by-code</code>, <code>join-by-link</code></p>
                <p><code>send-to-peer</code>, <code>accept-transfer</code>, <code>decline-transfer</code></p>
                <p><code>rtc-offer</code>, <code>rtc-answer</code>, <code>rtc-ice-candidate</code>, <code>receiver-rtc-ready</code></p>
                <p><code>file-chunk</code>, <code>file-chunk-end</code>, <code>transfer-progress</code>, <code>transfer-complete</code></p>
                <p><code>transfer-cancel</code>, <code>transfer-error</code>, <code>update-identity</code></p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">
            Security Philosophy
          </h2>
          <div className="space-y-4 font-mono text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span> No account system or
              identity tracking
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span> No permanent storage
              (SSD/HDD) used
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span> Files are streamed
              directly in-memory
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span> Relay data
              automatically detonates after transmission
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span> Local Transfer History
              is securely stored in your browser&apos;s IndexedDB
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">
            Client Capabilities
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 bg-card/20 border border-primary/20 rounded-xl space-y-3 backdrop-blur-sm">
              <h3 className="font-bold tracking-widest uppercase text-primary">
                Global Drag & Drop
              </h3>
              <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                Drag files anywhere on the application window to initiate an
                instant transfer overlay. Highly optimized for desktop users.
              </p>
            </div>
            <div className="p-6 bg-card/20 border border-primary/20 rounded-xl space-y-3 backdrop-blur-sm">
              <h3 className="font-bold tracking-widest uppercase text-primary">
                Directory Auto-Zipping
              </h3>
              <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                Drop entire folders onto the scanner. The client uses{' '}
                <code>jszip</code> to aggregate and compress the directory tree
                into a single archive before sending it over WebRTC.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">
            Open Source Notes
          </h2>
          <div className="rounded-xl border border-primary/20 bg-card/20 p-5 space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              SignalShare is maintained as an open-source project with active
              changelog tracking and architecture-first documentation.
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Start with <code>README.md</code> for setup and architecture, then
              see the in-app timeline at <code>/change-logs</code> for release
              history.
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Contributions are welcome via issues and pull requests on GitHub.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-widest uppercase text-foreground border-b border-border/10 pb-2">
            Known Constraints
          </h2>
          <div className="space-y-2 font-mono text-xs text-muted-foreground bg-destructive/5 border border-destructive/20 p-5 rounded-xl">
            <p>• Requires a browser with WebRTC support.</p>
            <p>
              • Strict NATs or corporate firewalls may block direct P2P
              connections.
            </p>
            <p>
              • Heavy background tabs on mobile OS (iOS/Android) may pause
              WebSocket signaling.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
