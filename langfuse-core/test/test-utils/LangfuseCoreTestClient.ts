import {
  LangfuseCore,
  type LangfuseCoreOptions,
  type LangfuseFetchOptions,
  type LangfuseFetchResponse,
} from "../../src";

const version = "2.0.0-alpha.2";

export interface LangfuseCoreTestClientMocks {
  fetch: jest.Mock<Promise<LangfuseFetchResponse>, [string, LangfuseFetchOptions]>;
  storage: {
    getItem: jest.Mock<any | undefined, [string]>;
    setItem: jest.Mock<void, [string, any | null]>;
  };
}

export class LangfuseCoreTestClient extends LangfuseCore {
  public _cachedDistinctId?: string;

  constructor(
    private mocks: LangfuseCoreTestClientMocks,
    params?: { publicKey: string; secretKey: string } & LangfuseCoreOptions
  ) {
    super(params);
  }

  getPersistedProperty<T>(key: string): T {
    return this.mocks.storage.getItem(key);
  }
  setPersistedProperty<T>(key: string, value: T | null): void {
    return this.mocks.storage.setItem(key, value);
  }
  fetch(url: string, options: LangfuseFetchOptions): Promise<LangfuseFetchResponse> {
    return this.mocks.fetch(url, options);
  }
  getLibraryId(): string {
    return "langfuse-core-tests";
  }
  getLibraryVersion(): string {
    return version;
  }
  getCustomUserAgent(): string {
    return "langfuse-core-tests";
  }
}

export const createTestClient = (
  params?: {
    publicKey: string;
    secretKey: string;
  } & LangfuseCoreOptions,
  setupMocks?: (mocks: LangfuseCoreTestClientMocks) => void
): [LangfuseCoreTestClient, LangfuseCoreTestClientMocks] => {
  const storageCache: { [key: string]: string | undefined } = {};
  const mocks = {
    fetch: jest.fn<Promise<LangfuseFetchResponse>, [string, LangfuseFetchOptions]>(),
    storage: {
      getItem: jest.fn<any | undefined, [string]>((key) => storageCache[key]),
      setItem: jest.fn<void, [string, any | null]>((key, val) => {
        storageCache[key] = val == null ? undefined : val;
      }),
    },
  };

  mocks.fetch.mockImplementation(() =>
    Promise.resolve({
      status: 200,
      text: () => Promise.resolve("ok"),
      json: () => Promise.resolve({ status: "ok" }),
    })
  );

  setupMocks?.(mocks);

  return [new LangfuseCoreTestClient(mocks, params), mocks];
};
