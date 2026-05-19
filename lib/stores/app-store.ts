import { create } from 'zustand';

export type AppView = 'home' | 'sending' | 'receiving';
export type ShareType = 'files' | 'text' | 'screen' | 'receive';

interface AppState {
  deviceName: string;
  deviceId: string;
  isConnected: boolean;
  view: AppView;
  shareType: ShareType;
  setDeviceName: (name: string) => void;
  setDeviceId: (id: string) => void;
  setConnected: (connected: boolean) => void;
  setView: (view: AppView) => void;
  setShareType: (type: ShareType) => void;
}

export const useAppStore = create<AppState>((set) => ({
  deviceName: '',
  deviceId: '',
  isConnected: false,
  view: 'home',
  shareType: 'files',
  setDeviceName: (name) => set({ deviceName: name }),
  setDeviceId: (id) => set({ deviceId: id }),
  setConnected: (connected) => set({ isConnected: connected }),
  setView: (view) => set({ view }),
  setShareType: (shareType) => set({ shareType }),
}));
