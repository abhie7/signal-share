'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/stores/app-store';

export function useDeviceName() {
  const { deviceName, setDeviceName } = useAppStore();

  useEffect(() => {
    const stored = localStorage.getItem('p2p-device-name');
    if (stored) {
      setDeviceName(stored);
    }
  }, [setDeviceName]);

  const updateName = (name: string) => {
    setDeviceName(name);
    localStorage.setItem('p2p-device-name', name);
  };

  return { deviceName, updateName };
}
