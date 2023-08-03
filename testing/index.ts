import { Langfuse } from 'langfuse';

async function main() {
  const langfuse = new Langfuse({
    secretKey: 'sk-lf-1234567890',
    publicKey: 'pk-lf-1234567890',
    baseUrl: 'http://localhost:3000',
    release: '1.2.0',
  });

  langfuse.generation({
    name: 'gen-without-trace',
    version: '1.2.0',
  });

  const trace = langfuse.trace({
    version: 'test',
    name: 'test',
    metadata: {
      test: 'test',
    },
  });

  const span = trace.span({
    version: '1.2.0',
    name: 'test',
    metadata: {
      test: 'test',
    },
  });

  span.event({
    version: '1.2.0',
    name: 'test',
    metadata: {
      test: 'test',
    },
  });

  await langfuse.flush();
}

main();
