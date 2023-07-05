export type LangfuseData<T extends Object> =
  | ({
      status: 'success';
    } & T)
  | {
      status: 'error';
      error: string;
    };
