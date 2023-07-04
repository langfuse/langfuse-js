import createClient, { FetchResponse } from 'openapi-fetch';
import { paths } from './api/server';

// class logger with constructor to receive public and private keys
export default class Langfuse {
  private publicKey: string;
  private secretKey: string;
  private get;
  private post;

  public baseUrl = 'https://cloud.langfuse.com';

  private promises: Promise<any>[];

  constructor(params: { publicKey: string; secretKey: string; baseUrl?: string }) {
    this.publicKey = params.publicKey;
    this.secretKey = params.secretKey;
    this.baseUrl = params.baseUrl ?? this.baseUrl;

    this.promises = [];

    const { get, post } = createClient<paths>({
      baseUrl: this.baseUrl,
      headers: {
        Authorization: 'Basic ' + btoa(this.publicKey + ':' + this.secretKey),
      },
    });
    this.get = get;
    this.post = post;
  }

  createTrace = async (
    body: paths['/api/public/traces']['post']['requestBody']['content']['application/json']
  ) => {
    const res = this.post('/api/public/traces', { body }).then((res) => {
      if (res.error) {
        throw new Error(res.error);
      }
      return res.data;
    });
    this.promises.push(res);
    return res;
  };

  logGeneration = async (
    body: paths['/api/public/generations']['post']['requestBody']['content']['application/json'],
    trace?: ReturnType<typeof this.createTrace>,
    parent?: Promise<{ id: string } | undefined>
  ) => {
    const promise = new Promise<
      paths['/api/public/generations']['post']['responses']['200']['content']['application/json']
    >(async (resolve, reject) => {
      const traceId = trace ? (await trace)?.id : undefined;
      const parentId = parent ? (await parent)?.id : undefined;

      const res = this.post('/api/public/generations', {
        body: {
          ...body,
          traceId: traceId ?? body.traceId,
          parentObservationId: parentId ?? body.parentObservationId,
        },
      }).then((res) => {
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

  createSpan = async (
    body: paths['/api/public/spans']['post']['requestBody']['content']['application/json'],
    trace?: ReturnType<typeof this.createTrace>,
    parent?: Promise<{ id: string } | undefined>
  ) => {
    const promise = new Promise<
      paths['/api/public/spans']['post']['responses']['200']['content']['application/json']
    >(async (resolve, reject) => {
      const traceId = trace ? (await trace)?.id : undefined;
      const parentId = parent ? (await parent)?.id : undefined;

      const res = this.post('/api/public/spans', {
        body: {
          ...body,
          traceId: traceId ?? body.traceId,
          parentObservationId: parentId ?? body.parentObservationId,
        },
      }).then((res) => {
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

  createEvent = async (
    body: paths['/api/public/events']['post']['requestBody']['content']['application/json'],
    trace?: ReturnType<typeof this.createTrace>,
    parent?: Promise<{ id: string } | undefined>
  ) => {
    const promise = new Promise<
      paths['/api/public/events']['post']['responses']['200']['content']['application/json']
    >(async (resolve, reject) => {
      const traceId = trace ? (await trace)?.id : undefined;
      const parentId = parent ? (await parent)?.id : undefined;

      const res = this.post('/api/public/events', {
        body: {
          ...body,
          traceId: traceId ?? body.traceId,
          parentObservationId: parentId ?? body.parentObservationId,
        },
      }).then((res) => {
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

  createScore = async (
    body: paths['/api/public/scores']['post']['requestBody']['content']['application/json'],
    trace?: ReturnType<typeof this.createTrace>,
    observation?: Promise<{ id: string } | undefined>
  ) => {
    const promise = new Promise<
      paths['/api/public/scores']['post']['responses']['200']['content']['application/json']
    >(async (resolve, reject) => {
      const traceId = trace ? (await trace)?.id : undefined;
      const observationId = observation ? (await observation)?.id : undefined;

      const res = this.post('/api/public/scores', {
        body: {
          ...body,
          traceId: traceId ?? body.traceId,
          observationId: observationId ?? body.observationId,
        },
      }).then((res) => {
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

export class LangfuseWeb {
  private publicKey: string;
  private get;
  private post;

  public baseUrl = 'https://cloud.langfuse.com';

  private promises: Promise<any>[];

  constructor(params: { publicKey: string; baseUrl?: string }) {
    this.publicKey = params.publicKey;
    this.baseUrl = params.baseUrl ?? this.baseUrl;

    this.promises = [];

    const { get, post } = createClient<paths>({
      baseUrl: this.baseUrl,
      headers: {
        Authorization: 'Bearer ' + this.publicKey,
      },
    });
    this.get = get;
    this.post = post;
  }

  createScore = async (
    body: paths['/api/public/scores']['post']['requestBody']['content']['application/json']
  ) => {
    const res = this.post('/api/public/scores', { body }).then((res) => {
      if (res.error) {
        throw new Error(res.error);
      }
      return res.data;
    });
    this.promises.push(res);
    return res;
  };

  flush = async () => {
    await Promise.all(this.promises);
    this.promises = [];
  };
}
