import { create } from 'zustand';

export type AppView = 'home' | 'sending' | 'receiving';

interface AppState {
  deviceName: string;
  deviceId: string;
  isConnected: boolean;
  view: AppView;
  setDeviceName: (name: string) => void;
  setDeviceId: (id: string) => void;
  setConnected: (connected: boolean) => void;
  setView: (view: AppView) => void;
}

export const useAppStore = create<AppState>((set) => ({
  deviceName: '',
  deviceId: '',
  isConnected: false,
  view: 'home',
  setDeviceName: (name) => set({ deviceName: name }),
  setDeviceId: (id) => set({ deviceId: id }),
  setConnected: (connected) => set({ isConnected: connected }),
  setView: (view) => set({ view }),
}));
