import { type LangfuseCoreOptions } from "./types";

export function assert(truthyValue: any, message: string): void {
  if (!truthyValue) {
    throw new Error(message);
  }
}

export function removeTrailingSlash(url: string): string {
  return url?.replace(/\/+$/, "");
}

export interface RetriableOptions {
  retryCount?: number;
  retryDelay?: number;
  retryCheck?: (err: any) => boolean;
}

export async function retriable<T>(
  fn: () => Promise<T>,
  props: RetriableOptions = {},
  log: (msg: string) => void
): Promise<T> {
  const { retryCount = 3, retryDelay = 5000, retryCheck = () => true } = props;
  let lastError = null;

  for (let i = 0; i < retryCount + 1; i++) {
    if (i > 0) {
      // don't wait when it's the first try
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      log(`Retrying ${i + 1} of ${retryCount + 1}`);
    }

    try {
      const res = await fn();
      return res;
    } catch (e) {
      lastError = e;
      if (!retryCheck(e)) {
        throw e;
      }
      log(`Retriable error: ${JSON.stringify(e)}`);
    }
  }

  throw lastError;
}

// https://stackoverflow.com/a/8809472
export function generateUUID(globalThis?: any): string {
  // Public Domain/MIT
  let d = new Date().getTime(); //Timestamp
  let d2 =
    (globalThis && globalThis.performance && globalThis.performance.now && globalThis.performance.now() * 1000) || 0; //Time in microseconds since page-load or 0 if unsupported
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    let r = Math.random() * 16; //random number between 0 and 16
    if (d > 0) {
      //Use timestamp until depleted
      r = (d + r) % 16 | 0;
      d = Math.floor(d / 16);
    } else {
      //Use microseconds since page-load if supported
      r = (d2 + r) % 16 | 0;
      d2 = Math.floor(d2 / 16);
    }
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function currentTimestamp(): number {
  return new Date().getTime();
}

export function currentISOTime(): string {
  return new Date().toISOString();
}

export function safeSetTimeout(fn: () => void, timeout: number): any {
  // NOTE: we use this so rarely that it is totally fine to do `safeSetTimeout(fn, 0)``
  // rather than setImmediate.
  const t = setTimeout(fn, timeout) as any;
  // We unref if available to prevent Node.js hanging on exit
  t?.unref && t?.unref();
  return t;
}

export function getEnv<T = string>(key: string): T | undefined {
  if (typeof process !== "undefined" && process.env[key]) {
    return process.env[key] as T;
  } else if (typeof globalThis !== "undefined") {
    return (globalThis as any)[key];
  }
  return;
}

export function configLangfuseSDK(params?: LangfuseCoreOptions, secretRequired: boolean = true): LangfuseCoreOptions {
  const { publicKey, secretKey, ...coreOptions } = params ?? {};

  // check environment variables if values not provided
  const finalPublicKey = publicKey ?? getEnv("LANGFUSE_PUBLIC_KEY");
  const finalSecretKey = secretRequired ? secretKey ?? getEnv("LANGFUSE_SECRET_KEY") : undefined;
  const finalBaseUrl = coreOptions.baseUrl ?? getEnv("LANGFUSE_BASEURL");

  const finalCoreOptions = {
    ...coreOptions,
    baseUrl: finalBaseUrl,
  };

  return {
    publicKey: finalPublicKey,
    ...(secretRequired ? { secretKey: finalSecretKey } : undefined),
    ...finalCoreOptions,
  };
}

export const encodeQueryParams = (params?: { [key: string]: any }): string => {
  const queryParams = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      // check for date
      if (value instanceof Date) {
        queryParams.append(key, value.toISOString());
      } else {
        queryParams.append(key, value.toString());
      }
    }
  });
  return queryParams.toString();
};

export function extractModelName(
  serialized: Record<string, any>,
  kwargs: Record<string, any> = {}
): string | undefined {
  const modelsById: [string, string[], "serialized" | "kwargs"][] = [
    ["ChatGoogleGenerativeAI", ["kwargs", "model"], "serialized"],
    ["ChatMistralAI", ["kwargs", "model"], "serialized"],
    ["ChatVertexAi", ["kwargs", "model_name"], "serialized"],
    ["ChatVertexAI", ["kwargs", "model_name"], "serialized"],
    ["OpenAI", ["invocation_params", "model_name"], "kwargs"],
    ["ChatOpenAI", ["invocation_params", "model_name"], "kwargs"],
    ["AzureChatOpenAI", ["invocation_params", "model"], "kwargs"],
    ["AzureChatOpenAI", ["invocation_params", "model_name"], "kwargs"],
    ["HuggingFacePipeline", ["invocation_params", "model_id"], "kwargs"],
    ["BedrockChat", ["kwargs", "model_id"], "serialized"],
    ["Bedrock", ["kwargs", "model_id"], "serialized"],
    ["ChatBedrock", ["kwargs", "model_id"], "serialized"],
    ["LlamaCpp", ["invocation_params", "model_path"], "kwargs"],
  ];

  for (const [modelName, keys, selectFrom] of modelsById) {
    const model = _extractModelByPathForId(modelName, serialized, kwargs, keys, selectFrom);
    if (model) {
      return model;
    }
  }

  if (serialized.id && serialized.id.slice(-1)[0] === "AzureOpenAI") {
    if (kwargs.invocation_params && kwargs.invocation_params.model_name) {
      return kwargs.invocation_params.model_name;
    }

    let deploymentVersion = undefined;
    if (serialized.kwargs && serialized.kwargs.openai_api_version) {
      deploymentVersion = serialized.kwargs.deployment_version;
    }
    let deploymentName = undefined;
    if (serialized.kwargs && serialized.kwargs.deployment_name) {
      deploymentName = serialized.kwargs.deployment_name;
    }
    return deploymentName + "-" + deploymentVersion;
  }

  const modelsByPattern: Array<[string, string, string | undefined]> = [
    ["Anthropic", "model", "anthropic"],
    ["ChatAnthropic", "model", undefined],
    ["ChatTongyi", "model_name", undefined],
    ["ChatCohere", "model", undefined],
    ["Cohere", "model", undefined],
    ["HuggingFaceHub", "model", undefined],
    ["ChatAnyscale", "model_name", undefined],
    ["TextGen", "model", "text-gen"],
    ["Ollama", "model", undefined],
    ["ChatOllama", "model", undefined],
    ["ChatFireworks", "model", undefined],
    ["ChatPerplexity", "model", undefined],
  ];

  for (const [modelName, pattern, defaultVal] of modelsByPattern) {
    const model = _extractModelFromReprByPattern(modelName, serialized, pattern, defaultVal);
    if (model) {
      return model;
    }
  }

  const randomPaths: Array<Array<string>> = [
    ["kwargs", "model_name"],
    ["kwargs", "model"],
    ["invocation_params", "model_name"],
    ["invocation_params", "model"],
  ];
  for (const select of ["kwargs", "serialized"]) {
    for (const path of randomPaths) {
      const model = _extractModelByPath(serialized, kwargs, path, select as "serialized" | "kwargs");
      if (model) {
        return model;
      }
    }
  }

  return undefined;
}

function _extractModelFromReprByPattern(
  id: string,
  serialized: Record<string, any>,
  pattern: string,
  defaultVal: string | undefined = undefined
): string | undefined {
  if (serialized.id && serialized.id.slice(-1)[0] === id) {
    if (serialized.repr) {
      const extracted = _extractModelWithRegex(pattern, serialized.repr);
      return extracted ? extracted : defaultVal;
    }
  }
  return undefined;
}

function _extractModelWithRegex(pattern: string, text: string): string | undefined {
  const match = new RegExp(`${pattern}="(.*?)"`).exec(text);
  return match ? match[1] : undefined;
}

function _extractModelByPathForId(
  id: string,
  serialized: Record<string, any>,
  kwargs: Record<string, any>,
  keys: Array<string>,
  selectFrom: "serialized" | "kwargs"
): string | undefined {
  if (serialized.id && serialized.id.slice(-1)[0] === id) {
    return _extractModelByPath(serialized, kwargs, keys, selectFrom);
  }
  return undefined;
}

function _extractModelByPath(
  serialized: Record<string, any>,
  kwargs: Record<string, any>,
  keys: Array<string>,
  selectFrom: "serialized" | "kwargs"
): string | undefined {
  let currentObj = selectFrom === "kwargs" ? kwargs : serialized;

  for (const key of keys) {
    currentObj = currentObj[key];
    if (!currentObj) {
      return undefined;
    }
  }

  if (typeof currentObj === "string") {
    return currentObj ? currentObj : undefined;
  } else {
    return undefined;
  }
}
