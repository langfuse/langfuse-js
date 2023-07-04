import Langfuse from 'langfuse';

async function main() {
  const langfuse = new Langfuse({
    secretKey: 'sk-lf-8a54ace4-27dd-41e3-a24c-cd63e76e0aaf',
    publicKey: 'pk-lf-4851918d-2369-4f99-a1d3-8de59ba35a6b',
  });

  const trace = langfuse.createTrace({
    name: 'test',
    metadata: {
      test: 'test',
    },
  });

  const span = langfuse.createSpan(
    {
      name: 'test',
    },
    trace
  );

  const generation = langfuse.logGeneration(
    {
      name: 'test',
    },
    trace,
    span
  );

  await langfuse.flush();
}

main();
