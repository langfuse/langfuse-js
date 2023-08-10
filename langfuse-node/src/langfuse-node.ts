import { version } from '../package.json'

import {
  // JsonType,
  LangfuseCore,
  LangfuseFetchOptions,
  LangfuseFetchResponse,
  LangfusePersistedProperty,
} from '../../langfuse-core/src'
import { LangfuseMemoryStorage } from '../../langfuse-core/src/storage-memory'
import { LangfuseOptions } from './types'
import { fetch } from './fetch'

// The actual exported Nodejs API.
export default class Langfuse extends LangfuseCore {
  private _memoryStorage = new LangfuseMemoryStorage()

  private options: LangfuseOptions

  constructor(params: { publicKey: string; secretKey: string } & LangfuseOptions) {
    const { publicKey, secretKey, ...options } = params
    super(params)
    this.options = options
  }

  getPersistedProperty(key: LangfusePersistedProperty): any | undefined {
    return this._memoryStorage.getProperty(key)
  }

  setPersistedProperty(key: LangfusePersistedProperty, value: any | null): void {
    return this._memoryStorage.setProperty(key, value)
  }

  fetch(url: string, options: LangfuseFetchOptions): Promise<LangfuseFetchResponse> {
    return this.options.fetch ? this.options.fetch(url, options) : fetch(url, options)
  }

  getLibraryId(): string {
    return 'langfuse-node'
  }
  getLibraryVersion(): string {
    return version
  }
  getCustomUserAgent(): string {
    return `langfuse-node/${version}`
  }
}
