import { AppShell } from '@/components/share/app-shell';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft02Icon as ArrowLeftIcon, Shield01Icon as ShieldIcon } from '@hugeicons/core-free-icons';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | SignalShare',
  description: 'Our transparent privacy policy. No tracking, no storage, no accounts.',
};

export default function PrivacyPage() {
  return (
    <AppShell>
      <div className="w-full max-w-3xl mx-auto px-6 pt-32 pb-24 flex flex-col gap-12">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-mono text-xs uppercase tracking-widest w-fit">
          <HugeiconsIcon icon={ArrowLeftIcon} className="w-4 h-4" />
          Back to Scanner
        </Link>

        <div>
          <div className="flex items-center gap-3 mb-4 text-primary">
            <HugeiconsIcon icon={ShieldIcon} className="w-8 h-8" />
            <h1 className="text-3xl font-bold tracking-widest uppercase text-foreground">Transparency & Privacy</h1>
          </div>
          <p className="font-mono text-sm text-muted-foreground leading-relaxed">
            SignalShare is a decentralized transmission tool, not a data storage service. Our privacy policy is absolute zero.
          </p>
        </div>

        <div className="grid gap-6">
          <div className="p-6 bg-card/20 border border-primary/20 rounded-xl space-y-4 backdrop-blur-sm">
            <h2 className="text-lg font-bold tracking-widest uppercase text-foreground">1. Zero User Accounts</h2>
            <p className="font-mono text-sm text-muted-foreground">
              We do not ask for emails, passwords, or OAuth logins. Your device identity is generated locally via a random hash.
            </p>
          </div>

          <div className="p-6 bg-card/20 border border-primary/20 rounded-xl space-y-4 backdrop-blur-sm">
            <h2 className="text-lg font-bold tracking-widest uppercase text-foreground">2. Zero Permanent Storage</h2>
            <p className="font-mono text-sm text-muted-foreground">
              When transferring via direct LAN mode, files go directly from your machine to the receiver. They never touch our servers. During remote Relay mode, packets stream through our server&apos;s RAM and are immediately obliterated upon download completion.
            </p>
          </div>

          <div className="p-6 bg-card/20 border border-primary/20 rounded-xl space-y-4 backdrop-blur-sm">
            <h2 className="text-lg font-bold tracking-widest uppercase text-foreground">3. Zero Third-Party Analytics</h2>
            <p className="font-mono text-sm text-muted-foreground">
              We do not inject Google Analytics, Meta Pixel, or any behavioral tracking scripts into the payload. The network remains pure and untracked.
            </p>
          </div>

          <div className="p-6 bg-card/20 border border-primary/20 rounded-xl space-y-4 backdrop-blur-sm">
            <h2 className="text-lg font-bold tracking-widest uppercase text-foreground">4. Ephemeral Logs</h2>
            <p className="font-mono text-sm text-muted-foreground">
              Fastify application server connection logs are rotated hourly. We do not index IP addresses mapped to device hashes.
            </p>
          </div>
        </div>

        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground/50 text-center mt-12 border-t border-border/10 pt-12">
          Effective Date: {new Date().getFullYear()}
        </p>
      </div>
    </AppShell>
  );
}
