import createClient from 'openapi-fetch';
import { v4 as uuidv4 } from 'uuid';
import { paths } from './api/server';
import { LangfuseData } from './lib/types';
import { version } from './lib/version';

class Api {
  readonly get;
  readonly post;
  readonly patch;

  readonly baseUrl: string;

  constructor(params: { publicKey: string; secretKey: string; baseUrl?: string }) {
    this.baseUrl = params.baseUrl ?? 'https://cloud.langfuse.com';
    const { get, post, patch } = createClient<paths>({
      baseUrl: this.baseUrl,
      headers: {
        Authorization: 'Basic ' + btoa(params.publicKey + ':' + params.secretKey),
        'X-Langfuse-Sdk-Name': 'langfuse-js',
        'X-Langfuse-Sdk-Version': version,
        'X-Langfuse-Sdk-Variant': 'Server',
      },
    });
    this.get = get;
    this.post = post;
    this.patch = patch;
  }
}

type EventData = LangfuseData<
  paths['/api/public/events']['post']['responses']['200']['content']['application/json']
>;
type SpanData = LangfuseData<
  | paths['/api/public/spans']['post']['responses']['200']['content']['application/json']
  | paths['/api/public/spans']['patch']['responses']['200']['content']['application/json']
>;
type GenerationData = LangfuseData<
  | paths['/api/public/generations']['post']['responses']['200']['content']['application/json']
  | paths['/api/public/generations']['patch']['responses']['200']['content']['application/json']
>;
type TraceData = LangfuseData<
  paths['/api/public/traces']['post']['responses']['200']['content']['application/json']
>;
type ScoreData = LangfuseData<
  paths['/api/public/scores']['post']['responses']['200']['content']['application/json']
>;

// class logger with constructor to receive public and private keys
export class Langfuse {
  readonly api: Api;
  promises: Promise<any>[];

  constructor(params: { publicKey: string; secretKey: string; baseUrl?: string }) {
    this.promises = [];

    this.api = new Api({
      publicKey: params.publicKey,
      secretKey: params.secretKey,
      baseUrl: params.baseUrl,
    });
  }

  trace = (
    body: paths['/api/public/traces']['post']['requestBody']['content']['application/json']
  ): NestedTraceClient => {
    const promise = new Promise<TraceData>(async (resolve, reject) => {
      const res = this.api
        .post('/api/public/traces', { body })
        .then((res) => {
          if (res.error) return resolve({ status: 'error', error: res.error });
          if (!res.data) return resolve({ status: 'error', error: 'Not found' });
          return resolve({ status: 'success', ...res.data });
        })
        .catch((err) => resolve({ status: 'error', error: 'Failed to fetch' }));
    });
    this.promises.push(promise);
    return new NestedTraceClient({ client: this, data: promise });
  };

  generation = (
    body: WithTypedDates<
      paths['/api/public/generations']['post']['requestBody']['content']['application/json']
    >,
    trace?: Promise<{ id: string | null }>,
    parent?: Promise<{ id: string | null } | undefined>
  ): NestedGenerationClient => {
    const id = body.id ?? uuidv4();

    const promise = new Promise<GenerationData>(async (resolve, reject) => {
      const traceId = trace ? (await trace)?.id : body.traceId;
      const parentObservationId = parent ? (await parent)?.id : body.parentObservationId;

      const res = this.api
        .post('/api/public/generations', {
          body: {
            ...body,
            id: id,
            startTime: body.startTime?.toISOString(),
            endTime: body.endTime?.toISOString(),
            completionStartTime: body.completionStartTime?.toISOString(),
            traceId: traceId,
            parentObservationId: parentObservationId,
          },
        })
        .then((res) => {
          if (res.error) return resolve({ status: 'error', error: res.error });
          if (!res.data) return resolve({ status: 'error', error: 'Not found' });
          return resolve({ status: 'success', ...res.data });
        })
        .catch((err) => resolve({ status: 'error', error: 'Failed to fetch' }));
    });

    this.promises.push(promise);
    return new NestedGenerationClient({
      client: this,
      id: id,
      data: promise,
    });
  };

  span = (
    body: WithTypedDates<
      paths['/api/public/spans']['post']['requestBody']['content']['application/json']
    >,
    trace?: Promise<{ id: string | null }>,
    parent?: Promise<{ id: string | null } | undefined>
  ): NestedSpanClient => {
    const id = body.id ?? uuidv4();

    const promise = new Promise<SpanData>(async (resolve, reject) => {
      const traceId = trace ? (await trace)?.id : body.traceId;
      const parentObservationId = parent ? (await parent)?.id : body.parentObservationId;

      const res = this.api
        .post('/api/public/spans', {
          body: {
            ...body,
            id: id,
            startTime: body.startTime?.toISOString(),
            endTime: body.endTime?.toISOString(),
            traceId: traceId,
            parentObservationId: parentObservationId,
          },
        })
        .then((res) => {
          if (res.error) return resolve({ status: 'error', error: res.error });
          if (!res.data) return resolve({ status: 'error', error: 'Not found' });
          return resolve({ status: 'success', ...res.data });
        })
        .catch((err) => resolve({ status: 'error', error: 'Failed to fetch' }));
    });

    this.promises.push(promise);
    return new NestedSpanClient({
      client: this,
      id: id,
      data: promise,
    });
  };

  event = (
    body: WithTypedDates<
      paths['/api/public/events']['post']['requestBody']['content']['application/json']
    >,
    trace?: Promise<{ id: string | null }>,
    parent?: Promise<{ id: string | null } | undefined>
  ): NestedEventClient => {
    const id = body.id ?? uuidv4();

    const promise = new Promise<EventData>(async (resolve, reject) => {
      const traceId = trace ? (await trace)?.id : body.traceId;
      const parentObservationId = parent ? (await parent)?.id : body.parentObservationId;

      const res = this.api
        .post('/api/public/events', {
          body: {
            ...body,
            id: id,
            startTime: body.startTime?.toISOString(),
            traceId: traceId,
            parentObservationId: parentObservationId,
          },
        })
        .then((res) => {
          if (res.error) return resolve({ status: 'error', error: res.error });
          if (!res.data) return resolve({ status: 'error', error: 'Not found' });
          return resolve({ status: 'success', ...res.data });
        })
        .catch((err) => resolve({ status: 'error', error: 'Failed to fetch' }));
    });

    this.promises.push(promise);
    return new NestedEventClient({
      client: this,
      id: id,
      data: promise,
    });
  };

  score = (
    args:
      | {
          body: paths['/api/public/scores']['post']['requestBody']['content']['application/json'];
        }
      | {
          body: Omit<
            paths['/api/public/scores']['post']['requestBody']['content']['application/json'],
            'traceId' | 'observationId'
          >;
          trace: Promise<{ id: string | null }>;
          observation?: Promise<{ id: string | null }>;
        }
  ) => {
    const promise = new Promise<ScoreData>(async (resolve, reject) => {
      const traceId = 'trace' in args ? (await args.trace)?.id : args.body.traceId;
      const observationId =
        'trace' in args ? (await args.observation)?.id : args.body.observationId;

      if (!traceId) {
        return resolve({ status: 'error', error: 'No traceId' });
      }

      const res = this.api
        .post('/api/public/scores', {
          body: {
            ...args.body,
            traceId: traceId,
            observationId: observationId,
          },
        })
        .then((res) => {
          if (res.error) return resolve({ status: 'error', error: res.error });
          if (!res.data) return resolve({ status: 'error', error: 'Not found' });
          return resolve({ status: 'success', ...res.data });
        })
        .catch((err) => resolve({ status: 'error', error: 'Failed to fetch' }));
    });

    this.promises.push(promise);
    return promise;
  };

  flush = async () => {
    await Promise.all(this.promises);
    this.promises = [];
  };
}

type OptionalTypes<T> = T extends null | undefined ? T : never;

type WithTypedDates<T> = {
  [P in keyof T]: P extends 'startTime' | 'endTime' | 'timestamp' | 'completionStartTime'
    ? Date | OptionalTypes<T[P]>
    : T[P];
};

abstract class LangfuseNestedClient {
  protected readonly client: Langfuse;
  protected readonly traceId: Promise<string | null>;

  // promise for trace, all other strings
  public abstract readonly id: Promise<string | null> | string;

  // undefined for trace, promise for all other; used to await parent observation before creating children
  protected abstract readonly parentObservationId: Promise<string | null> | undefined;

  constructor(args: { client: Langfuse; traceId: Promise<string | null> }) {
    this.client = args.client;
    this.traceId = args.traceId;
  }

  generation = (
    body: Omit<
      WithTypedDates<
        paths['/api/public/generations']['post']['requestBody']['content']['application/json']
      >,
      'traceId' | 'traceIdType' | 'parentObservationId'
    >
  ) =>
    this.client.generation(
      body,
      this.traceId.then((id) => ({ id })),
      this.parentObservationId?.then((id) => ({ id }))
    );

  span = (
    body: Omit<
      WithTypedDates<
        paths['/api/public/spans']['post']['requestBody']['content']['application/json']
      >,
      'traceId' | 'traceIdType' | 'parentObservationId'
    >
  ) =>
    this.client.span(
      body,
      this.traceId.then((id) => ({ id })),
      this.parentObservationId?.then((id) => ({ id }))
    );

  event = (
    body: Omit<
      WithTypedDates<
        paths['/api/public/events']['post']['requestBody']['content']['application/json']
      >,
      'traceId' | 'traceIdType' | 'parentObservationId'
    >
  ) =>
    this.client.event(
      body,
      this.traceId.then((id) => ({ id })),
      this.parentObservationId?.then((id) => ({ id }))
    );

  score = (
    body: Omit<
      WithTypedDates<
        paths['/api/public/scores']['post']['requestBody']['content']['application/json']
      >,
      'traceId' | 'observationId'
    >
  ) =>
    this.client.score({
      body: body,
      trace: this.traceId.then((id) => ({ id })),
      observation: this.parentObservationId?.then((id) => ({ id })),
    });
}

class NestedSpanClient extends LangfuseNestedClient {
  readonly data: Promise<SpanData>;
  readonly id: string;
  protected readonly parentObservationId: Promise<string | null>;

  constructor(args: { client: Langfuse; id: string; data: Promise<SpanData> }) {
    super({
      client: args.client,
      traceId: args.data.then((d) => (d.status === 'success' ? d.traceId : null)),
    });
    this.data = args.data;
    this.id = args.id;
    this.parentObservationId = args.data.then((d) => (d.status === 'success' ? d.id : null));
  }

  update = (
    body: Omit<
      WithTypedDates<
        paths['/api/public/spans']['patch']['requestBody']['content']['application/json']
      >,
      'spanId'
    >
  ): NestedSpanClient => {
    const promise = new Promise<
      LangfuseData<
        paths['/api/public/spans']['patch']['responses']['200']['content']['application/json']
      >
    >(async (resolve, reject) => {
      const spanId = await this.id;

      if (!spanId) {
        return resolve({ status: 'error', error: 'No spanId' });
      }

      const res = this.client.api
        .patch('/api/public/spans', {
          body: {
            ...body,
            spanId: spanId,
            endTime: body.endTime?.toISOString(),
          },
        })
        .then((res) => {
          if (res.error) return resolve({ status: 'error', error: res.error });
          if (!res.data) return resolve({ status: 'error', error: 'Not found' });
          return resolve({ status: 'success', ...res.data });
        })
        .catch((err) => resolve({ status: 'error', error: 'Failed to fetch' }));
    });

    this.client.promises.push(promise);
    return new NestedSpanClient({ client: this.client, id: this.id, data: promise });
  };
}

class NestedGenerationClient extends LangfuseNestedClient {
  readonly data: Promise<GenerationData>;
  readonly id: string;
  protected readonly parentObservationId: Promise<string | null>;

  constructor(args: { client: Langfuse; id: string; data: Promise<GenerationData> }) {
    super({
      client: args.client,
      traceId: args.data.then((d) => (d.status === 'success' ? d.traceId : null)),
    });
    this.data = args.data;
    this.id = args.id;
    this.parentObservationId = args.data.then((d) => (d.status === 'success' ? d.id : null));
  }

  update = (
    body: Omit<
      WithTypedDates<
        paths['/api/public/generations']['patch']['requestBody']['content']['application/json']
      >,
      'generationId'
    >
  ): NestedGenerationClient => {
    const promise = new Promise<
      LangfuseData<
        paths['/api/public/generations']['patch']['responses']['200']['content']['application/json']
      >
    >(async (resolve, reject) => {
      const generationId = await this.id;
      if (!generationId) {
        return resolve({ status: 'error', error: 'No generationId' });
      }

      const res = this.client.api
        .patch('/api/public/generations', {
          body: {
            ...body,
            generationId: generationId,
            endTime: body.endTime?.toISOString(),
            completionStartTime: body.completionStartTime?.toISOString(),
          },
        })
        .then((res) => {
          if (res.error) return resolve({ status: 'error', error: res.error });
          if (!res.data) return resolve({ status: 'error', error: 'Not found' });
          return resolve({ status: 'success', ...res.data });
        })
        .catch((err) => resolve({ status: 'error', error: 'Failed to fetch' }));
    });

    this.client.promises.push(promise);
    return new NestedGenerationClient({ client: this.client, id: this.id, data: promise });
  };
}

class NestedEventClient extends LangfuseNestedClient {
  readonly data: Promise<EventData>;
  readonly id: string;
  protected readonly parentObservationId: Promise<string | null>;

  constructor(args: { client: Langfuse; id: string; data: Promise<EventData> }) {
    super({
      client: args.client,
      traceId: args.data.then((d) => (d.status === 'success' ? d.traceId : null)),
    });
    this.data = args.data;
    this.id = args.id;
    this.parentObservationId = args.data.then((d) => (d.status === 'success' ? d.id : null));
  }
}

class NestedTraceClient extends LangfuseNestedClient {
  readonly data: Promise<TraceData>;
  readonly id: Promise<string | null>;
  protected readonly parentObservationId = undefined;

  constructor(args: { client: Langfuse; data: Promise<TraceData> }) {
    super({
      client: args.client,
      traceId: args.data.then((d) => (d.status === 'success' ? d.id : null)),
    });
    this.data = args.data;
    this.id = args.data.then((d) => (d.status === 'success' ? d.id : null));
  }
}
