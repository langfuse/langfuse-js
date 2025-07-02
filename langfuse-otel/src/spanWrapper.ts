import { Span } from "@opentelemetry/api";
import {
  LangfuseGenerationAttributes,
  LangfuseSpanAttributes,
  LangfuseEventAttributes,
} from "./types";
import { Langfuse } from "./client";

type LangfuseSpanWrapperParams = {
  otelSpan: Span;
  client: Langfuse;
  attributes?:
    | LangfuseSpanAttributes
    | LangfuseGenerationAttributes
    | LangfuseEventAttributes;
};

abstract class LangfuseSpanWrapper {
  protected readonly otelSpan: Span;
  protected readonly client: Langfuse;

  constructor(params: LangfuseSpanWrapperParams) {
    this.otelSpan = params.otelSpan;
    this.client = params.client;
  }

  end() {
    this.otelSpan.end();
  }

  updateTrace() {}

  score() {}

  scoreTrace() {}
}

type LangfuseSpanParams = {
  otelSpan: Span;
  client: Langfuse;
  attributes?: LangfuseSpanAttributes;
};
export class LangfuseSpan extends LangfuseSpanWrapper {
  constructor(params: LangfuseSpanParams) {
    super(params);
  }

  update(attributes: LangfuseSpanAttributes) {
    this.otelSpan.setAttributes();
  }
}

type LangfuseGenerationParams = {
  otelSpan: Span;
  client: Langfuse;
  attributes?: LangfuseGenerationAttributes;
};
export class LangfuseGeneration extends LangfuseSpanWrapper {
  constructor(params: LangfuseGenerationParams) {
    super(params);
  }

  update() {}
}

type LangfuseEventParams = {
  otelSpan: Span;
  client: Langfuse;
  attributes?: LangfuseEventAttributes;
};
export class LangfuseEvent extends LangfuseSpanWrapper {
  constructor(params: LangfuseEventParams) {
    super(params);
  }
}
