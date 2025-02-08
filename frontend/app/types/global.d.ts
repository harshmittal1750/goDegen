interface Window {
  ethereum?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on: (eventName: string, handler: (params: unknown) => void) => void;
    removeListener: (
      eventName: string,
      handler: (params: unknown) => void
    ) => void;
  };
}
