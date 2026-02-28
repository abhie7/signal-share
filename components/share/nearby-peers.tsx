'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePeersStore, type NearbyPeer } from '@/lib/stores/peers-store';
import { DeviceAvatar } from './device-avatar';

interface NearbyPeersProps {
  onPeerClick?: (peer: NearbyPeer) => void;
}

export function NearbyPeers({ onPeerClick }: NearbyPeersProps) {
  const nearbyPeers = usePeersStore((s) => s.nearbyPeers);

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border/20 bg-background/20 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/10 bg-background/40">
        <h3 className="text-xs font-bold tracking-widest uppercase text-foreground/90">Active Nodes</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
            {nearbyPeers.length} ACTIVE {nearbyPeers.length === 1 ? 'SIGNAL' : 'SIGNALS'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <AnimatePresence mode="popLayout">
          {nearbyPeers.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full gap-4 py-12 text-center"
            >
              {/* Radar animation */}
              <div className="relative h-12 w-12">
                <motion.div
                  className="absolute inset-0 rounded-full border border-primary/30"
                  animate={{ scale: [1, 2.5], opacity: [0.8, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeOut' }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border border-primary/30"
                  animate={{ scale: [1, 2.5], opacity: [0.8, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeOut', delay: 0.75 }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
                </div>
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Scanning local network...
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="peers"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-2"
            >
              <AnimatePresence mode="popLayout">
                {nearbyPeers.map((peer, index) => (
                  <motion.button
                    key={peer.id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.05,
                      type: 'spring',
                      stiffness: 300,
                      damping: 25,
                    }}
                    onClick={() => onPeerClick?.(peer)}
                    className="group relative flex items-center gap-3 rounded-xl border border-border/10 bg-card/30 px-4 py-3 text-left transition-all hover:bg-primary/5 hover:border-primary/30 hover:shadow-[0_0_15px_rgba(var(--primary),0.15)]"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="relative">
                      <DeviceAvatar name={peer.name} size="sm" active showTooltip={false} />
                      <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-background shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm font-bold tracking-wide text-foreground/90 truncate">
                        {peer.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                        Channel Strength: High
                      </span>
                    </div>

                    {/* Signal Bars */}
                    <div className="flex items-end gap-0.5 h-4 opacity-50 group-hover:opacity-100 transition-opacity">
                      {[1, 2, 3, 4].map((bar) => (
                        <motion.div
                          key={bar}
                          className="w-1 bg-primary rounded-t-sm"
                          initial={{ height: '20%' }}
                          animate={{ height: ['20%', `${Math.random() * 60 + 40}%`, '20%'] }}
                          transition={{
                            repeat: Infinity,
                            duration: 1 + Math.random(),
                            delay: bar * 0.1,
                          }}
                        />
                      ))}
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
