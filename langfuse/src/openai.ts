import OpenAI from "openai";
import { Langfuse } from "./langfuse";

const client = new Langfuse();


// TODO: Change this approach to accomodate all the openAI methods and their params..
const getModelParams = (args: OpenAiArgs): Record<string, any> => {
    let params: Record<string, any> = {}
    params = {
        frequency_penalty: args.frequency_penalty,
        logit_bias: args.logit_bias,
        logprobs: args.logprobs,
        max_tokens: args.max_tokens,
        n: args.n,
        presence_penalty: args.presence_penalty,
        seed: args.seed,
        stop: args.stop,
        stream: args.stream,
        temperature: args.temperature,
        top_p: args.top_p,
        user: args.user,
    }
    let input;
    if ('messages' in args) {
        input = args.messages[0].content
    } else if ('prompt' in args) {
        input = args.prompt ?? ""
    }


    if ('function_call' in args) {
        params.function_call = args.function_call;
    }
    if ('functions' in args) {
        params.functions = args.functions;
    }
    if ('response_format' in args) {
        params.response_format = args.response_format;
    }
    if ('tool_choice' in args) {
        params.tool_choice = args.tool_choice;
    }
    if ('tools' in args) {
        params.tools = args.tools;
    }
    if ('top_logprobs' in args) {
        params.top_logprobs = args.top_logprobs;
    }

    return {
        model: args.model,
        input: input,
        modelParams: params
    }
}

type OpenAiArgs = OpenAI.ChatCompletionCreateParams | OpenAI.CompletionCreateParams

export const openaiTracer = async<T extends (...args: any[]) => any>(
    baseFunction: T,
    config?: WrapperConfig,
    ...args: Parameters<T>
): Promise<ReturnType<T>> => {
    const modelInput: OpenAiArgs = args[0]

    const inputParams = getModelParams(modelInput)
    const res = await baseFunction(...args)
    if (isAsyncIterable(res)) {
        async function* tracedOutputGenerator(): AsyncGenerator<unknown, void, unknown> {
            const response = res
            const chunks: unknown[] = [];
            // TypeScript thinks this is unsafe
            for await (const chunk of response as AsyncIterable<unknown>) {
                const _chunk = chunk as OpenAI.ChatCompletionChunk
                chunks.push(_chunk.choices[0]?.delta?.content || "");
                yield chunk;
            }
            const trace = client.trace({
                name: config?.trace_name,
                input: inputParams.input,
                output: chunks.join(""),
                metadata: config?.metadata,
                tags: config?.tags,
                userId: config?.user_id

            })
            trace.generation({
                model: inputParams.model,
                input: inputParams.input,
                output: chunks.join(""),
                modelParameters: inputParams.modelParams
            })
            client.flush()

        }
        return tracedOutputGenerator() as ReturnType<T>

    } else {
        const trace = client.trace({
            name: config?.trace_name,
            input: inputParams.input,
            output: (await res).choices[0].message.content,
            metadata: config?.metadata,
            tags: config?.tags,
            userId: config?.user_id

        })
        trace.generation({
            model: inputParams.model,
            input: inputParams.input,
            modelParameters: inputParams.modelParams,
            output: (await res).choices[0].message.content,
        })

    }

    client.flush()

    return res
}


const isAsyncIterable = (x: unknown): x is AsyncIterable<unknown> =>
    x != null &&
    typeof x === "object" &&
    typeof (x as any)[Symbol.asyncIterator] === "function";


export const wrappedTracer = <T extends (...args: any[]) => any>(
    baseFuntion: T,
    config?: any
): (...args: Parameters<T>) => Promise<ReturnType<T>> => {
    return (...args: Parameters<T>): Promise<ReturnType<T>> => openaiTracer(baseFuntion, config, ...args);
}

interface WrapperConfig {
    trace_name: string,
    session_id?: string,
    user_id?: string,
    release?: string,
    version?: string,
    metadata?: any // TODO: Add this to the doc
    tags?: any
}



/**
 * Wraps an OpenAI SDK object with tracing capabilities, allowing for detailed tracing of SDK method calls.
 * It wraps function calls with a tracer that logs detailed information about the call, including the method name,
 * input parameters, and output.
 * 
 * @template T - The SDK object to be wrapped.
 * @param {T} sdk - The OpenAI SDK object to be wrapped.
 * @param {WrapperConfig} [config] - Optional configuration object for the wrapper.
 * @param {string} [config.trace_name] - The name to use for tracing. If not provided, a default name based on the SDK's constructor name and the method name will be used.
 * @param {string} [config.session_id] - Optional session ID for tracing.
 * @param {string} [config.user_id] - Optional user ID for tracing.
 * @param {string} [config.release] - Optional release version for tracing.
 * @param {string} [config.version] - Optional version for tracing.
 * @returns {T} - A proxy of the original SDK object with methods wrapped for tracing.
 *
 * @example
 * const client = new OpenAI();
 * const res = OpenAIWrapper(client, { traceName: "My.OpenAI.Chat.Trace" }).chat.completions.create({
 *      messages: [{ role: "system", content: "Say this is a test!" }],
        model: "gpt-3.5-turbo",
        user: "langfuse",
        max_tokens: 300
 * });
 * console.log(res); // This call will be traced.
 * */
const OpenAIWrapper = <T extends object>(sdk: T, config?: WrapperConfig): T => {
    return new Proxy(sdk, {
        get(target, propKey, receiver) {
            const originalValue = target[propKey as keyof T];

            if (typeof originalValue === "function") {
                return wrappedTracer(originalValue.bind(target), { trace_name: config?.trace_name ?? `${sdk.constructor?.name}.${propKey.toString()}` })

            } else if (
                originalValue != null &&
                !Array.isArray(originalValue) &&
                !(originalValue instanceof Date) &&
                typeof originalValue === "object"
            ) {
                return OpenAIWrapper(
                    originalValue,
                    { trace_name: config?.trace_name ?? `${sdk.constructor?.name}.${propKey.toString()}` }
                );
            } else {
                return Reflect.get(target, propKey, receiver);
            }
        }
    })
}

export default OpenAIWrapper