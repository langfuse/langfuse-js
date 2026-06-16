![GitHub Banner](https://github.com/langfuse/langfuse-js/assets/2834609/d1613347-445f-4e91-9e84-428fda9c3659)

# @langfuse/browser

Browser SDK for sending Langfuse scores from public-key environments.

```ts
import { LangfuseBrowser } from "@langfuse/browser";

const langfuse = new LangfuseBrowser({
  publicKey: "pk-lf-...",
  baseUrl: "https://cloud.langfuse.com",
});

await langfuse.score({
  traceId: "trace-id",
  name: "user_feedback",
  value: 1,
});
```

This package only supports score ingestion and uses public-key Bearer auth.
Do not pass Langfuse secret keys to browser code.

## Documentation

- Docs: https://langfuse.com/docs/sdk/typescript
- Reference: https://js.reference.langfuse.com

## License

[MIT](LICENSE)
