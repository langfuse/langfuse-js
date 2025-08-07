import { Span, TimeInput } from "@opentelemetry/api";

import {
  createEventAttributes,
  createGenerationAttributes,
  createSpanAttributes,
  createTraceAttributes,
} from "./attributes.js";
import {
  LangfuseGenerationAttributes,
  LangfuseSpanAttributes,
  LangfuseEventAttributes,
  LangfuseTraceAttributes,
} from "./types.js";
import { getLangfuseTracer } from "./utils.js";

import { createEvent, startGeneration, startSpan } from "./index.js";

export type LangfuseObservation =
  | LangfuseSpan
  | LangfuseGeneration
  | LangfuseEvent;

type LangfuseSpanWrapperParams = {
  otelSpan: Span;
  attributes?:
    | LangfuseSpanAttributes
    | LangfuseGenerationAttributes
    | LangfuseEventAttributes;
};

abstract class LangfuseSpanWrapper {
  public readonly otelSpan: Span;
  public id: string;
  public traceId: string;

  constructor(params: LangfuseSpanWrapperParams) {
    this.otelSpan = params.otelSpan;
    this.id = params.otelSpan.spanContext().spanId;
    this.traceId = params.otelSpan.spanContext().traceId;
  }

  protected get tracer() {
    return getLangfuseTracer();
  }

  public end(endTime?: TimeInput) {
    this.otelSpan.end(endTime);
  }

  public updateTrace(attributes: LangfuseTraceAttributes) {
    this.otelSpan.setAttributes(createTraceAttributes(attributes));

    return this;
  }
}

type LangfuseSpanParams = {
  otelSpan: Span;
  attributes?: LangfuseSpanAttributes;
};
export class LangfuseSpan extends LangfuseSpanWrapper {
  constructor(params: LangfuseSpanParams) {
    super(params);
    if (params.attributes) {
      this.otelSpan.setAttributes(createSpanAttributes(params.attributes));
    }
  }

  public update(attributes: LangfuseSpanAttributes): LangfuseSpan {
    this.otelSpan.setAttributes(createSpanAttributes(attributes));

    return this;
  }

  public startSpan(
    name: string,
    attributes?: LangfuseSpanAttributes,
  ): LangfuseSpan {
    return startSpan(name, attributes, {
      parentSpanContext: this.otelSpan.spanContext(),
    });
  }

  public startGeneration(
    name: string,
    attributes?: LangfuseGenerationAttributes,
  ): LangfuseGeneration {
    return startGeneration(name, attributes, {
      parentSpanContext: this.otelSpan.spanContext(),
    });
  }

  public createEvent(
    name: string,
    attributes?: LangfuseEventAttributes,
  ): LangfuseEvent {
    return createEvent(name, attributes, {
      parentSpanContext: this.otelSpan.spanContext(),
    });
  }
}

type LangfuseGenerationParams = {
  otelSpan: Span;
  attributes?: LangfuseGenerationAttributes;
};
export class LangfuseGeneration extends LangfuseSpanWrapper {
  constructor(params: LangfuseGenerationParams) {
    super(params);
    if (params.attributes) {
      this.otelSpan.setAttributes(
        createGenerationAttributes(params.attributes),
      );
    }
  }

  update(attributes: LangfuseGenerationAttributes): LangfuseGeneration {
    this.otelSpan.setAttributes(createGenerationAttributes(attributes));

    return this;
  }

  createEvent(
    name: string,
    attributes?: LangfuseEventAttributes,
  ): LangfuseEvent {
    return createEvent(name, attributes, {
      parentSpanContext: this.otelSpan.spanContext(),
    });
  }
}

type LangfuseEventParams = {
  otelSpan: Span;
  attributes?: LangfuseEventAttributes;
  timestamp: TimeInput;
};
export class LangfuseEvent extends LangfuseSpanWrapper {
  constructor(params: LangfuseEventParams) {
    super(params);

    if (params.attributes) {
      this.otelSpan.setAttributes(createEventAttributes(params.attributes));
    }

    this.otelSpan.end(params.timestamp);
  }
}
