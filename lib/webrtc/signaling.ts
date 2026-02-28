export type WsMessageHandler = (msg: Record<string, unknown>) => void;

class SignalingClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<WsMessageHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private url: string = '';
  private _isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private connectionResolve: (() => void) | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  connect(): Promise<void> {
    if (this._isConnected && this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = new Promise((resolve) => {
      this.connectionResolve = resolve;

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      this.url = `${protocol}://${window.location.host}/api/ws`;

      this.createConnection();
    });

    return this.connectionPromise;
  }

  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.connectionResolve?.();
        this.connectionPromise = null;
        this.connectionResolve = null;
        this.emit('_connected', {});
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type) {
            this.emit(msg.type, msg);
          }
        } catch {
          // Ignore invalid messages
        }
      };

      this.ws.onclose = () => {
        this._isConnected = false;
        this.emit('_disconnected', {});
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // Error handling is done in onclose
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('_reconnect-failed', {});
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      this.createConnection();
    }, delay);
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(type: string, handler: WsMessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  off(type: string, handler: WsMessageHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  private emit(type: string, data: Record<string, unknown>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.maxReconnectAttempts = 0; // Prevent reconnection
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
    this.connectionPromise = null;
    this.connectionResolve = null;
  }
}

// Singleton instance
export const signaling = new SignalingClient();
