export const wait = async (t: number): Promise<void> => {
  await new Promise((r) => setTimeout(r, t));
};

export const waitForPromises = async (): Promise<void> => {
  jest.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 100) as any);
  jest.useFakeTimers();
};

export const parseBody = (mockCall: any): any => {
  const options = mockCall[1];
  const body = JSON.parse(options.body);
  return body;
};
