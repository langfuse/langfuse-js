/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */

/** WithRequired type helpers */
type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }

export interface paths {
  '/api/public/events': {
    /** @description Add an event to the database */
    post: operations['event_create']
  }
  '/api/public/generations': {
    post: operations['generations_log']
    patch: operations['generations_update']
  }
  '/api/public/observations/{observationId}': {
    /** @description Get a specific observation */
    get: operations['observations_get']
  }
  '/api/public/scores': {
    /** @description Get scores */
    get: operations['score_get']
    /** @description Add a score to the database */
    post: operations['score_create']
  }
  '/api/public/spans': {
    /** @description Add a span to the database */
    post: operations['span_create']
    /** @description Update a span to the database */
    patch: operations['span_update']
  }
  '/api/public/traces': {
    /** @description Get list of traces */
    get: operations['trace_list']
    /** @description Add a trace to the database */
    post: operations['trace_create']
  }
  '/api/public/traces/{traceId}': {
    /** @description Get a specific trace */
    get: operations['trace_get']
  }
}

export type webhooks = Record<string, never>

export interface components {
  schemas: {
    /** CreateEventRequest */
    CreateEventRequest: {
      id?: string | null
      traceId?: string | null
      traceIdType?: components['schemas']['TraceIdTypeEnum']
      name?: string | null
      /** Format: date-time */
      startTime?: string | null
      metadata?: Record<string, unknown> | null
      input?: Record<string, unknown> | null
      output?: Record<string, unknown> | null
      level?: components['schemas']['ObservationLevel']
      statusMessage?: string | null
      parentObservationId?: string | null
      version?: string | null
    }
    /** CreateSpanRequest */
    CreateSpanRequest: {
      /** Format: date-time */
      endTime?: string | null
    } & components['schemas']['CreateEventRequest']
    /** CreateGenerationRequest */
    CreateGenerationRequest: {
      /** Format: date-time */
      completionStartTime?: string | null
      model?: string | null
      modelParameters?: {
        [key: string]: components['schemas']['MapValue'] | undefined
      } | null
      prompt?: Record<string, unknown> | null
      completion?: string | null
      usage?: components['schemas']['LLMUsage']
    } & components['schemas']['CreateSpanRequest']
    /** Trace */
    Trace: {
      /** @description The unique identifier of a trace */
      id: string
      /** Format: date-time */
      timestamp: string
      externalId?: string | null
      name?: string | null
      release?: string | null
      version?: string | null
      userId?: string | null
      metadata?: Record<string, unknown> | null
    }
    /** TraceWithDetails */
    TraceWithDetails: WithRequired<
      {
        /** @description List of observation ids */
        observations: string[]
        /** @description List of score ids */
        scores: string[]
      } & components['schemas']['Trace'],
      'observations' | 'scores'
    >
    /** TraceWithFullDetails */
    TraceWithFullDetails: WithRequired<
      {
        observations: components['schemas']['Observation'][]
        scores: components['schemas']['Score'][]
      } & components['schemas']['Trace'],
      'observations' | 'scores'
    >
    /** Observation */
    Observation: {
      id: string
      traceId: string
      type: string
      name?: string | null
      /** Format: date-time */
      startTime: string
      /** Format: date-time */
      endTime?: string | null
      /** Format: date-time */
      completionStartTime?: string | null
      model?: string | null
      modelParameters?: {
        [key: string]: components['schemas']['MapValue'] | undefined
      } | null
      prompt?: Record<string, unknown> | null
      version?: string | null
      metadata?: Record<string, unknown> | null
      completion?: string | null
      promptTokens: number
      completionTokens: number
      totalTokens: number
      level: components['schemas']['ObservationLevel']
      statusMessage?: string | null
      parentObservationId?: string | null
    }
    /** Score */
    Score: {
      id: string
      traceId: string
      name: string
      value: number
      observationId?: string | null
      /** Format: date-time */
      timestamp: string
      comment?: string | null
    }
    /**
     * ObservationLevel
     * @enum {string}
     */
    ObservationLevel: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR'
    /** MapValue */
    MapValue: (string | null) | (number | null) | (boolean | null)
    /**
     * TraceIdTypeEnum
     * @enum {string}
     */
    TraceIdTypeEnum: 'LANGFUSE' | 'EXTERNAL'
    /** LLMUsage */
    LLMUsage: {
      promptTokens?: number | null
      completionTokens?: number | null
      totalTokens?: number | null
    }
    /** UpdateGenerationRequest */
    UpdateGenerationRequest: {
      generationId: string
      name?: string | null
      /** Format: date-time */
      endTime?: string | null
      /** Format: date-time */
      completionStartTime?: string | null
      model?: string | null
      modelParameters?: {
        [key: string]: components['schemas']['MapValue'] | undefined
      } | null
      prompt?: Record<string, unknown> | null
      version?: string | null
      metadata?: Record<string, unknown> | null
      completion?: string | null
      usage?: components['schemas']['LLMUsage']
      level?: components['schemas']['ObservationLevel']
      statusMessage?: string | null
    }
    /** CreateScoreRequest */
    CreateScoreRequest: {
      id?: string | null
      traceId: string
      traceIdType?: components['schemas']['TraceIdTypeEnum']
      name: string
      value: number
      observationId?: string | null
      comment?: string | null
    }
    /** Scores */
    Scores: {
      data: components['schemas']['Score'][]
      meta: components['schemas']['utilsMetaResponse']
    }
    /** UpdateSpanRequest */
    UpdateSpanRequest: {
      spanId: string
      /** Format: date-time */
      endTime?: string | null
      metadata?: Record<string, unknown> | null
      input?: Record<string, unknown> | null
      output?: Record<string, unknown> | null
      level?: components['schemas']['ObservationLevel']
      version?: string | null
      statusMessage?: string | null
    }
    /** CreateTraceRequest */
    CreateTraceRequest: {
      id?: string | null
      name?: string | null
      userId?: string | null
      externalId?: string | null
      release?: string | null
      version?: string | null
      metadata?: Record<string, unknown> | null
    }
    /** Traces */
    Traces: {
      data: components['schemas']['TraceWithDetails'][]
      meta: components['schemas']['utilsMetaResponse']
    }
    /** utilsMetaResponse */
    utilsMetaResponse: {
      /** @description current page number */
      page: number
      /** @description number of items per page */
      limit: number
      /** @description number of total items given the current filters/selection (if any) */
      totalItems: number
      /** @description number of total pages given the current limit */
      totalPages: number
    }
  }
  responses: never
  parameters: never
  requestBodies: never
  headers: never
  pathItems: never
}

export type external = Record<string, never>

export interface operations {
  /** @description Add an event to the database */
  event_create: {
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateEventRequest']
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['Observation']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
  generations_log: {
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateGenerationRequest']
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['Observation']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
  generations_update: {
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateGenerationRequest']
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['Observation']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
  /** @description Get a specific observation */
  observations_get: {
    parameters: {
      path: {
        /** @description The unique langfuse identifier of an observation, can be an event, span or generation */
        observationId: string
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['Observation']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
  /** @description Get scores */
  score_get: {
    parameters: {
      query?: {
        page?: number | null
        limit?: number | null
        userId?: string | null
        name?: string | null
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['Scores']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
  /** @description Add a score to the database */
  score_create: {
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateScoreRequest']
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['Score']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
  /** @description Add a span to the database */
  span_create: {
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateSpanRequest']
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['Observation']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
  /** @description Update a span to the database */
  span_update: {
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateSpanRequest']
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['Observation']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
  /** @description Get list of traces */
  trace_list: {
    parameters: {
      query?: {
        page?: number | null
        limit?: number | null
        userId?: string | null
        name?: string | null
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['Traces']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
  /** @description Add a trace to the database */
  trace_create: {
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateTraceRequest']
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['Trace']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
  /** @description Get a specific trace */
  trace_get: {
    parameters: {
      path: {
        /** @description The unique langfuse identifier of a trace */
        traceId: string
      }
    }
    responses: {
      200: {
        content: {
          'application/json': components['schemas']['TraceWithFullDetails']
        }
      }
      400: {
        content: {
          'application/json': string
        }
      }
      401: {
        content: {
          'application/json': string
        }
      }
      403: {
        content: {
          'application/json': string
        }
      }
      404: {
        content: {
          'application/json': string
        }
      }
      405: {
        content: {
          'application/json': string
        }
      }
    }
  }
}