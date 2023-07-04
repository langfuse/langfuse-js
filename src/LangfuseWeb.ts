import createClient from 'openapi-fetch';
import { paths } from './api/client';

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
