import { type paths } from './openapi/server'

export type LangfuseCoreOptions = {
  // Langfuse API host (https://cloud.langfuse.com by default)
  host?: string
  // The number of events to queue before sending to Langfuse (flushing)
  flushAt?: number
  // The interval in milliseconds between periodic flushes
  flushInterval?: number
  // How many times we will retry HTTP requests
  fetchRetryCount?: number
  // The delay between HTTP request retries
  fetchRetryDelay?: number
  // Timeout in milliseconds for any calls. Defaults to 10 seconds.
  requestTimeout?: number
}

export enum LangfusePersistedProperty {
  Props = 'props',
  Queue = 'queue',
  OptedOut = 'opted_out',
}

export type LangfuseFetchOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH'
  headers: { [key: string]: string }
  body?: string
  signal?: AbortSignal
}

export type LangfuseFetchResponse = {
  status: number
  text: () => Promise<string>
  json: () => Promise<any>
}

export type LangfuseQueueItem = {
  apiRoute: keyof paths
  method: 'POST' | 'PATCH'
  id: string
  body: any
  callback?: (err: any) => void
}

export type LangfuseEventProperties = {
  [key: string]: any
}

export type LangfuseMetadataProperties = {
  [key: string]: any
}

export type CreateLangfuseTraceBody = FixTypes<
  paths['/api/public/traces']['post']['requestBody']['content']['application/json']
>
export type CreateLangfuseEventBody = FixTypes<
  paths['/api/public/events']['post']['requestBody']['content']['application/json']
>
export type CreateLangfuseSpanBody = FixTypes<
  paths['/api/public/spans']['post']['requestBody']['content']['application/json']
>
export type CreateLangfuseGenerationBody = FixTypes<
  paths['/api/public/generations']['post']['requestBody']['content']['application/json']
>

export type CreateLangfuseScoreBody = FixTypes<
  paths['/api/public/scores']['post']['requestBody']['content']['application/json']
>

export type UpdateLangfuseSpanBody = FixTypes<
  paths['/api/public/spans']['patch']['requestBody']['content']['application/json']
>
export type UpdateLangfuseGenerationBody = FixTypes<
  paths['/api/public/generations']['patch']['requestBody']['content']['application/json']
>

export type LangfuseObject =
  | 'createTrace'
  | 'createEvent'
  | 'createSpan'
  | 'createGeneration'
  | 'createScore'
  | 'updateSpan'
  | 'updateGeneration'

export const LangfusePostApiRoutes: Record<LangfuseObject, [LangfuseQueueItem['method'], keyof paths]> = {
  createTrace: ['POST', '/api/public/traces'],
  createEvent: ['POST', '/api/public/events'],
  createSpan: ['POST', '/api/public/spans'],
  updateSpan: ['PATCH', '/api/public/spans'],
  createGeneration: ['POST', '/api/public/generations'],
  updateGeneration: ['PATCH', '/api/public/generations'],
  createScore: ['POST', '/api/public/scores'],
}

export type JsonType = string | number | boolean | null | { [key: string]: JsonType } | Array<JsonType>

type OptionalTypes<T> = T extends null | undefined ? T : never
type FixTypes<T> = Omit<
  {
    [P in keyof T]: P extends 'startTime' | 'endTime' | 'timestamp' | 'completionStartTime'
      ? // Dates instead of strings
        Date | OptionalTypes<T[P]>
      : T[P]
  },
  'externalId' | 'traceIdType'
>
