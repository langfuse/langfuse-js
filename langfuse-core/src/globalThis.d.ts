export {};

declare interface DeferLangFuseTrace {
  id: string;
  name: string;
  url: string;
}

declare global {
  namespace globalThis {
    // eslint-disable-next-line no-var
    var __deferRuntime: {
      langfuseTraces: (traces: DeferLangFuseTrace[]) => void;
    };
  }
}
