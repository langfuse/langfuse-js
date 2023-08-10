import { LangfuseCoreOptions, LangfuseFetchOptions, LangfuseFetchResponse } from '../../langfuse-core/src'

export type LangfuseOptions = LangfuseCoreOptions & {
  persistence?: 'memory'
  // Timeout in milliseconds for any calls. Defaults to 10 seconds.
  requestTimeout?: number
  // A custom fetch implementation. Defaults to axios in the node package.
  fetch?: (url: string, options: LangfuseFetchOptions) => Promise<LangfuseFetchResponse>
}
