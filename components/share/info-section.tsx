'use client';

import { motion, type Variants } from 'framer-motion';
import { HugeiconsIcon } from '@hugeicons/react';
import { GithubIcon, Link01Icon as LinkIcon, Wifi01Icon as NetworkIcon, Shield01Icon as ShieldIcon, CodeIcon, FlashIcon } from '@hugeicons/core-free-icons';
import Link from 'next/link';

const features = [
  {
    icon: NetworkIcon,
    color: 'primary',
    title: 'Peer-to-peer file transfer in your browser',
    description: 'This tool uses WebRTC to establish direct device-to-device channels over local networks. When devices are remote, a temporary relay is generated. Files are not stored.',
    iconBg: 'bg-primary/10 border-primary/20 text-primary',
    glowColor: 'via-primary/40',
  },
  {
    icon: FlashIcon,
    color: 'emerald',
    title: 'Transfer files over local network instantly',
    description: 'Devices on the same WiFi connect directly without uploading files to any server. No accounts required.',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    glowColor: 'via-emerald-500/40',
  },
  {
    icon: LinkIcon,
    color: 'blue',
    title: 'Generate temporary file relay links',
    description: 'When peers are remote, files are streamed through a temporary relay and auto-deleted immediately after completion.',
    iconBg: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    glowColor: 'via-blue-500/40',
  },
  {
    icon: ShieldIcon,
    color: 'purple',
    title: 'Zero storage. Zero tracking.',
    description: 'No databases, no permanent storage, and no tracking. Your transfer is a direct signal transmission.',
    iconBg: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
    glowColor: 'via-purple-500/40',
  },
];

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' as const },
  }),
};

export function InfoSection() {
  return (
    <div className="w-full border-t border-border/10 bg-background/50 backdrop-blur-xl pt-24 pb-12 px-6 flex flex-col items-center">
      <div className="max-w-4xl w-full flex flex-col gap-24">

        {/* Features / SEO Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
              whileHover={{ scale: 1.02, y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative group rounded-2xl border border-border/20 bg-card/10 p-6 backdrop-blur-sm overflow-hidden transition-colors hover:border-border/40 hover:bg-card/20"
            >
              {/* Top gradient accent line */}
              <div className={`absolute top-0 inset-x-4 h-px bg-gradient-to-r from-transparent ${feature.glowColor} to-transparent opacity-60 group-hover:opacity-100 transition-opacity`} />

              <div className="relative space-y-4">
                <div className={`h-10 w-10 rounded-full ${feature.iconBg} flex items-center justify-center border`}>
                  <HugeiconsIcon icon={feature.icon} className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold tracking-widest uppercase text-foreground/90">
                  {feature.title}
                </h2>
                <p className="text-sm font-mono text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Open Source & Tech Stack */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative flex flex-col md:flex-row items-start justify-between gap-12 p-8 rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden group hover:border-primary/40 transition-colors"
        >
          {/* Subtle top glow */}
          <div className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />

          <div className="space-y-6 flex-1">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-widest uppercase text-foreground">Open Source</h2>
              <p className="text-sm font-mono text-muted-foreground leading-relaxed">
                SignalShare is fully open source. Inspect the architecture. Run it locally. Contribute.
              </p>
            </div>
            <div className="flex gap-4">
              <a href="https://github.com/abhie7/signal-share" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 transition-all hover:shadow-[0_0_20px_rgba(var(--primary),0.2)] font-mono uppercase tracking-widest text-xs">
                <HugeiconsIcon icon={GithubIcon} className="w-4 h-4" />
                View Repository
              </a>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <h3 className="text-sm border-b border-border/20 pb-2 font-bold tracking-widest uppercase text-foreground/70">Built With</h3>
            <div className="flex flex-wrap gap-2">
              {['Next.js', 'Fastify', 'WebRTC', 'WebSockets', 'TailwindCSS', 'Framer Motion'].map((tech) => (
                <span key={tech} className="px-3 py-1.5 rounded-lg bg-background/50 border border-border/50 text-xs font-mono text-muted-foreground hover:border-primary/30 hover:text-primary/80 transition-colors cursor-default">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <footer className="pt-12 border-t border-border/10 flex flex-col md:flex-row items-center justify-between gap-6 text-xs font-mono text-muted-foreground uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            SignalShare © <a href="https://github.com/abhie7" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Abhiraj Chaudhuri</a> {new Date().getFullYear()}
          </div>
          <div className="flex gap-6">
            <Link href="/docs" className="hover:text-primary transition-colors">Docs</Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="/change-logs" className="hover:text-primary transition-colors">Changelog</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
