import {
  dropMetadataOverSpanAttributeLimit,
  LangfuseOtelSpanAttributes,
} from "@langfuse/core";
import { trace, type Attributes, type Tracer } from "@opentelemetry/api";

const METADATA_PREFIX = `${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.`;

/**
 * Wraps a tracer so observation metadata is written last, right before the
 * span ends.
 *
 * The AI SDK sets the attributes from `enrichSpan` at span start, and its own
 * attributes (output, usage, ...) later. OpenTelemetry drops new attributes
 * once a span reaches its attribute count limit, so metadata set at start
 * could push them out. Writing metadata last lets it use only the room that
 * is left; excess keys are dropped with a warning.
 *
 * @internal
 */
export function createMetadataDeferringTracer(tracer?: Tracer): Tracer {
  // Same default as the AI SDK's OpenTelemetry integration
  const delegate = tracer ?? trace.getTracer("gen_ai");

  return {
    startSpan(name, options, context) {
      const attributes: Attributes = {};
      const metadata: Attributes = {};

      for (const [key, value] of Object.entries(options?.attributes ?? {})) {
        if (key.startsWith(METADATA_PREFIX)) {
          metadata[key] = value;
        } else {
          attributes[key] = value;
        }
      }

      const span = delegate.startSpan(
        name,
        options ? { ...options, attributes } : options,
        context,
      );

      if (Object.keys(metadata).length > 0) {
        const end = span.end.bind(span);

        span.end = (endTime) => {
          span.setAttributes(
            dropMetadataOverSpanAttributeLimit(span, metadata),
          );
          end(endTime);
        };
      }

      return span;
    },
    startActiveSpan: delegate.startActiveSpan.bind(
      delegate,
    ) as Tracer["startActiveSpan"],
  };
}
