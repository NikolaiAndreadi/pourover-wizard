export interface TransportObservers {
  onChunk(bytes: Uint8Array): void;
  onDisconnect(): void;
}
export interface ScaleTransport {
  connect(observers: TransportObservers): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): void;
}
