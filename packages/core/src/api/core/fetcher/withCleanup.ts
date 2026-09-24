export function withCleanup<T>(
  stream: ReadableStream<T>,
  cleanup?: () => void,
): ReadableStream<T> {
  if (cleanup == null) {
    return stream;
  }

  const reader = stream.getReader();
  let isFinished = false;

  const finish = () => {
    if (isFinished) {
      return;
    }

    isFinished = true;
    cleanup();
  };

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          finish();
          reader.releaseLock();
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      } catch (error) {
        finish();
        reader.releaseLock();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finish();
        reader.releaseLock();
      }
    },
  });
}
