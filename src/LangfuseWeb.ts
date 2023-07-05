import createClient from 'openapi-fetch';
import { paths } from './api/client';
import { LangfuseData } from './lib/types';

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

  score = async (
    body: paths['/api/public/scores']['post']['requestBody']['content']['application/json']
  ) => {
    const promise = new Promise<
      LangfuseData<
        paths['/api/public/scores']['post']['responses']['200']['content']['application/json']
      >
    >((resolve, reject) => {
      this.post('/api/public/scores', { body })
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
