import { LangfuseCoreOptions } from '../../langfuse-core/src'

export type LangfuseOptions = {
  // autocapture?: boolean
  persistence?: 'localStorage' | 'sessionStorage' | 'cookie' | 'memory'
  persistence_name?: string
} & LangfuseCoreOptions
