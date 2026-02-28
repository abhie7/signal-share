import type { WebSocket } from 'ws';
import { extractSubnet } from './network.js';

export interface PeerInfo {
  id: string;
  name: string;
  ip: string;
  subnet: string;
  ws: WebSocket;
  connectedAt: number;
}

class PeerRegistry {
  private peers = new Map<string, PeerInfo>();

  add(peer: PeerInfo): void {
    this.peers.set(peer.id, peer);
  }

  remove(id: string): PeerInfo | undefined {
    const peer = this.peers.get(id);
    this.peers.delete(id);
    return peer;
  }

  get(id: string): PeerInfo | undefined {
    return this.peers.get(id);
  }

  getSubnetPeers(subnet: string, excludeId?: string): PeerInfo[] {
    const result: PeerInfo[] = [];
    for (const peer of this.peers.values()) {
      if (peer.subnet === subnet && peer.id !== excludeId) {
        result.push(peer);
      }
    }
    return result;
  }

  getAll(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  size(): number {
    return this.peers.size;
  }
}

export const peerRegistry = new PeerRegistry();
