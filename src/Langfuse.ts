import createClient from 'openapi-fetch';
import { paths } from './api/server';

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
      },
    });
    this.get = get;
    this.post = post;
    this.patch = patch;
  }
}

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
    const res = this.api.post('/api/public/traces', { body }).then((res) => {
      if (res.error) {
        throw new Error(res.error);
      }
      if (!res.data) {
        throw new Error('No data');
      }
      return res.data;
    });
    this.promises.push(res);
    return new NestedTraceClient(this, res);
  };

  generation = (
    body: WithTypedDates<
      paths['/api/public/generations']['post']['requestBody']['content']['application/json']
    >,
    trace?: Promise<{ id: string }>,
    parent?: Promise<{ id: string } | undefined>
  ): NestedGenerationClient => {
    const promise = new Promise<
      paths['/api/public/generations']['post']['responses']['200']['content']['application/json']
    >(async (resolve, reject) => {
      const traceId = trace ? (await trace)?.id : body.traceId;
      const parentObservationId = parent ? (await parent)?.id : body.parentObservationId;

      const res = this.api
        .post('/api/public/generations', {
          body: {
            ...body,
            startTime: body.startTime?.toISOString(),
            endTime: body.endTime?.toISOString(),
            traceId: traceId,
            parentObservationId: parentObservationId,
          },
        })
        .then((res) => {
          if (res.error) {
            reject(res.error);
          } else if (!res.data) {
            reject('Not found');
          } else {
            resolve(res.data);
          }
        });
    });

    this.promises.push(promise);
    return new NestedGenerationClient(this, promise);
  };

  span = (
    body: WithTypedDates<
      paths['/api/public/spans']['post']['requestBody']['content']['application/json']
    >,
    trace?: Promise<{ id: string }>,
    parent?: Promise<{ id: string } | undefined>
  ): NestedSpanClient => {
    const promise = new Promise<
      paths['/api/public/spans']['post']['responses']['200']['content']['application/json']
    >(async (resolve, reject) => {
      const traceId = trace ? (await trace)?.id : body.traceId;
      const parentObservationId = parent ? (await parent)?.id : body.parentObservationId;

      const res = this.api
        .post('/api/public/spans', {
          body: {
            ...body,
            startTime: body.startTime?.toISOString(),
            endTime: body.endTime?.toISOString(),
            traceId: traceId,
            parentObservationId: parentObservationId,
          },
        })
        .then((res) => {
          if (res.error) {
            reject(res.error);
          } else if (!res.data) {
            reject('Not found');
          } else {
            resolve(res.data);
          }
        });
    });

    this.promises.push(promise);
    return new NestedSpanClient(this, promise);
  };

  event = (
    body: WithTypedDates<
      paths['/api/public/events']['post']['requestBody']['content']['application/json']
    >,
    trace?: Promise<{ id: string }>,
    parent?: Promise<{ id: string } | undefined>
  ): NestedEventClient => {
    const promise = new Promise<
      paths['/api/public/events']['post']['responses']['200']['content']['application/json']
    >(async (resolve, reject) => {
      const traceId = trace ? (await trace)?.id : body.traceId;
      const parentObservationId = parent ? (await parent)?.id : body.parentObservationId;

      const res = this.api
        .post('/api/public/events', {
          body: {
            ...body,
            startTime: body.startTime?.toISOString(),
            traceId: traceId,
            parentObservationId: parentObservationId,
          },
        })
        .then((res) => {
          if (res.error) {
            reject(res.error);
          } else if (!res.data) {
            reject('Not found');
          } else {
            resolve(res.data);
          }
        });
    });

    this.promises.push(promise);
    return new NestedEventClient(this, promise);
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
          trace: Promise<{ id: string }>;
          observation?: Promise<{ id: string }>;
        }
  ) => {
    const promise = new Promise<
      paths['/api/public/scores']['post']['responses']['200']['content']['application/json']
    >(async (resolve, reject) => {
      const traceId = 'trace' in args ? (await args.trace)?.id : args.body.traceId;
      const observationId =
        'trace' in args ? (await args.observation)?.id : args.body.observationId;

      const res = this.api
        .post('/api/public/scores', {
          body: {
            ...args.body,
            traceId: traceId,
            observationId: observationId,
          },
        })
        .then((res) => {
          if (res.error) {
            reject(res.error);
          } else if (!res.data) {
            reject('Not found');
          } else {
            resolve(res.data);
          }
        });
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
  [P in keyof T]: P extends 'startTime' | 'endTime' | 'timestamp'
    ? Date | OptionalTypes<T[P]>
    : T[P];
};

type EventData =
  paths['/api/public/events']['post']['responses']['200']['content']['application/json'];
type SpanData =
  | paths['/api/public/spans']['post']['responses']['200']['content']['application/json']
  | paths['/api/public/spans']['patch']['responses']['200']['content']['application/json'];
type GenerationData =
  | paths['/api/public/generations']['post']['responses']['200']['content']['application/json']
  | paths['/api/public/generations']['patch']['responses']['200']['content']['application/json'];
type TraceData =
  paths['/api/public/traces']['post']['responses']['200']['content']['application/json'];

abstract class LangfuseNestedClient {
  protected readonly client: Langfuse;
  protected readonly id: Promise<string>;
  protected readonly traceId: Promise<string>;
  protected readonly parentObservationId: Promise<string> | undefined;

  constructor(args: {
    client: Langfuse;
    id: Promise<string>;
    traceId: Promise<string>;
    parentObservationId: Promise<string> | undefined;
  }) {
    this.client = args.client;
    this.id = args.id;
    this.traceId = args.traceId;
    this.parentObservationId = args.parentObservationId;
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

  constructor(client: Langfuse, data: Promise<SpanData>) {
    super({
      client,
      id: data.then((d) => d.id),
      parentObservationId: data.then((d) => d.id),
      traceId: data.then((d) => d.traceId),
    });
    this.data = data;
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
      paths['/api/public/spans']['patch']['responses']['200']['content']['application/json']
    >(async (resolve, reject) => {
      const spanId = await this.id;

      const res = this.client.api
        .patch('/api/public/spans', {
          body: {
            ...body,
            spanId: spanId,
            endTime: body.endTime?.toISOString(),
          },
        })
        .then((res) => {
          if (res.error) {
            reject(res.error);
          } else if (!res.data) {
            reject('Not found');
          } else {
            resolve(res.data);
          }
        });
    });

    this.client.promises.push(promise);
    return new NestedSpanClient(this.client, promise);
  };
}

class NestedGenerationClient extends LangfuseNestedClient {
  readonly data: Promise<GenerationData>;

  constructor(client: Langfuse, data: Promise<GenerationData>) {
    super({
      client,
      id: data.then((d) => d.id),
      parentObservationId: data.then((d) => d.id),
      traceId: data.then((d) => d.traceId),
    });
    this.data = data;
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
      paths['/api/public/generations']['patch']['responses']['200']['content']['application/json']
    >(async (resolve, reject) => {
      const generationId = await this.id;

      const res = this.client.api
        .patch('/api/public/generations', {
          body: {
            ...body,
            generationId: generationId,
            endTime: body.endTime?.toISOString(),
          },
        })
        .then((res) => {
          if (res.error) {
            reject(res.error);
          } else if (!res.data) {
            reject('Not found');
          } else {
            resolve(res.data);
          }
        });
    });

    this.client.promises.push(promise);
    return new NestedGenerationClient(this.client, promise);
  };
}

class NestedEventClient extends LangfuseNestedClient {
  readonly data: Promise<EventData>;

  constructor(client: Langfuse, data: Promise<EventData>) {
    super({
      client,
      id: data.then((d) => d.id),
      parentObservationId: data.then((d) => d.id),
      traceId: data.then((d) => d.traceId),
    });
    this.data = data;
  }
}

class NestedTraceClient extends LangfuseNestedClient {
  readonly data: Promise<TraceData>;

  constructor(client: Langfuse, data: Promise<TraceData>) {
    super({
      client,
      id: data.then((d) => d.id),
      parentObservationId: undefined,
      traceId: data.then((d) => d.id),
    });
    this.data = data;
  }
}
