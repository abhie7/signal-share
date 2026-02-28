import { create } from 'zustand';

export interface NearbyPeer {
  id: string;
  name: string;
}

interface PeersState {
  nearbyPeers: NearbyPeer[];
  addPeer: (peer: NearbyPeer) => void;
  updatePeer: (peerId: string, name: string) => void;
  removePeer: (peerId: string) => void;
  setPeers: (peers: NearbyPeer[]) => void;
  clearPeers: () => void;
}

export const usePeersStore = create<PeersState>((set) => ({
  nearbyPeers: [],
  addPeer: (peer) =>
    set((state) => {
      // Avoid duplicates
      if (state.nearbyPeers.some((p) => p.id === peer.id)) return state;
      return { nearbyPeers: [...state.nearbyPeers, peer] };
    }),
  updatePeer: (peerId, name) =>
    set((state) => ({
      nearbyPeers: state.nearbyPeers.map((p) =>
        p.id === peerId ? { ...p, name } : p,
      ),
    })),
  removePeer: (peerId) =>
    set((state) => ({
      nearbyPeers: state.nearbyPeers.filter((p) => p.id !== peerId),
    })),
  setPeers: (peers) => set({ nearbyPeers: peers }),
  clearPeers: () => set({ nearbyPeers: [] }),
}));
