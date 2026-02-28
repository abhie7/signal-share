'use client';

import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Image from 'next/image';

interface DeviceAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  showTooltip?: boolean;
}

const sizeMap = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
};

// Generate a consistent color based on name
function nameToColor(name: string): string {
  const colors = [
    'from-cyan-500 to-blue-500',
    'from-emerald-500 to-teal-500',
    'from-purple-500 to-indigo-500',
    'from-rose-500 to-pink-500',
    'from-amber-500 to-orange-500',
    'from-lime-500 to-emerald-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function DeviceAvatar({ name, size = 'md', active, showTooltip = true }: DeviceAvatarProps) {
  const colorClass = nameToColor(name);

  const avatar = (
    <motion.div className="relative inline-flex">
      {active && (
        <motion.div
          className={`absolute inset-0 rounded-full bg-gradient-to-br ${colorClass} opacity-40 blur-sm`}
          animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0.1, 0.4] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        />
      )}
      <motion.div
        className={`${sizeMap[size]} rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-white font-mono font-bold shadow-[0_0_10px_rgba(0,0,0,0.5)] relative z-10 border border-white/20 overflow-hidden`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Image
          src={`https://api.dicebear.com/9.x/big-smile/svg?seed=${encodeURIComponent(name)}&backgroundColor=transparent`}
          alt={name}
          className="w-full h-full object-cover scale-[1.1]"
        />
      </motion.div>
    </motion.div>
  );

  if (!showTooltip) return avatar;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs font-medium">{name}</p>
      </TooltipContent>
    </Tooltip>
  );
}
