import { convertDataContentToBase64String } from "ai";

type PromptMessage = {
  content?: string | Array<Record<string, unknown>>;
} & Record<string, unknown>;

export function stringifyForTelemetry(prompt: PromptMessage[]): string {
  return JSON.stringify(
    prompt.map((message) => ({
      ...message,
      content:
        typeof message.content === "string"
          ? message.content
          : Array.isArray(message.content)
            ? message.content.map((part) => {
                if (part.type === "file" && part.data instanceof Uint8Array) {
                  return {
                    ...part,
                    data: convertDataContentToBase64String(part.data),
                  };
                }

                if (part.type === "image" && part.image instanceof Uint8Array) {
                  return {
                    ...part,
                    image: convertDataContentToBase64String(part.image),
                  };
                }

                return part;
              })
            : message.content,
    })),
  );
}
