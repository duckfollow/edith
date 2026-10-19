export interface EdithOptions {
  /** Explicitly enable only in development. Defaults to false. */
  enabled?: boolean;
  endpoint?: string;
  token?: string;
  appId?: string;
  appName?: string;
  /** Opt in to limited text body previews. Bodies may contain secrets. */
  captureBodies?: boolean;
}
export interface DeliveryStatus {
  enabled: boolean;
  pending: number;
  sent: number;
  dropped: number;
  lastError: string;
}
export interface EdithClient {
  fetch: typeof globalThis.fetch;
  log(level: string, ...values: unknown[]): void;
  captureError(error: unknown): void;
  install(options?: {
    captureConsole?: boolean;
    captureErrors?: boolean;
  }): () => void;
  uninstall(): void;
  flush(): Promise<DeliveryStatus>;
  status(): DeliveryStatus;
  dispose(): void;
}
export function createEdith(options?: EdithOptions): EdithClient;
