import OpenAI from "openai";
import { Langfuse } from "./langfuse";
import { config } from "process";
const client = new Langfuse();

interface ModelArgs {
    model: string,
    messages: Array<any>
}



const getModelParams = (modelsArgs: OpenAI.ChatCompletionCreateParams): Record<string, any> => {

    const params: Record<string, any> = {
        // frequency_penalty: modelsArgs.frequency_penalty,
        // function_call: modelsArgs.function_call,
        // functions: modelsArgs.functions,
        // logit_bias: modelsArgs.logit_bias,
        // logprobs: modelsArgs.logprobs,
        // max_tokens: modelsArgs.max_tokens,
        // messages: modelsArgs.messages,
        // n: modelsArgs.n,
        // presence_penalty: modelsArgs.presence_penalty,
        // response_format: modelsArgs.response_format,
        // seed: modelsArgs.seed,
        // stop: modelsArgs.stop,
        // stream: modelsArgs.stream,
        // temperature: modelsArgs.temperature,
        // tool_choice: modelsArgs.tool_choice,
        // tools: modelsArgs.tools,
        // top_logprobs: modelsArgs.top_logprobs,
        // top_p: modelsArgs.top_p,
        user: modelsArgs.user,
    }

    return params


}


export const traceable = <Func extends (...args: any[]) => any>(
    wrappedFunc: Func,
    config?: any
): (...args: Parameters<Func>) => Promise<ReturnType<Func>> => {
    type Inputs = Parameters<Func>;
    type Output = ReturnType<Func>;
    const traceableFunc = async (
        ...args: Inputs
    ): Promise<Output> => {
        const modelsArgs = args as unknown as Array<OpenAI.ChatCompletionCreateParams>
        modelsArgs
        console.log("ARGS: ", args, "\n\n\n")
        console.log("CONFIG:", config)
        const messages = modelsArgs[0].messages
        console.log("MESSAGES: ", messages)
        const res = await wrappedFunc(...args)
        console.log('IsAsync ? ', isAsyncIterable(res))
        if (isAsyncIterable(res)) {
            console.log("comes inside.,...")
            async function* wrapOutputForTracing(): AsyncGenerator<unknown, void, unknown> {
                const response = res
                const chunks: unknown[] = [];
                // TypeScript thinks this is unsafe
                for await (const chunk of response as AsyncIterable<unknown>) {
                    const _chunk = chunk as OpenAI.ChatCompletionChunk
                    chunks.push(_chunk.choices[0]?.delta?.content || "");
                    yield chunk;
                }
                const trace = client.trace({
                    name: config.traceName,
                    input: messages[0].content,
                    output: chunks.join(""),
                    metadata: { user: "noble@langfuse.com" },
                    tags: ["testing"]

                })
                trace.generation({
                    model: modelsArgs[0].model,
                    input: messages[0].content,
                    output: chunks.join(""),
                    modelParameters: getModelParams(modelsArgs[0])
                })
                client.flush()

                // await currentRunTree.end({ outputs: chunks });
                // await currentRunTree.patchRun();
            }
            return wrapOutputForTracing() as Output

        } else {
            const trace = client.trace({
                name: config.traceName,
                input: messages[0].content,
                output: (await res).choices[0].message.content,
                metadata: { user: "noble@langfuse.com" },
                tags: ["testing"],
            })
            trace.generation({
                model: modelsArgs[0].model,
                input: messages[0].content,
                output: (await res).choices[0].message.content
            })

        }

        client.flush()

        return res
    }
    Object.defineProperty(traceableFunc, "Langfuse:traceable", {
        value: config,
    });
    return traceableFunc
}

interface config {
    traceName: string
}

const isAsyncIterable = (x: unknown): x is AsyncIterable<unknown> =>
    x != null &&
    typeof x === "object" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (x as any)[Symbol.asyncIterator] === "function";

const OpenAIWrapper = <T extends object>(sdk: T, config?: config): T => {
    return new Proxy(sdk, {
        get(target, propKey, receiver) {
            // console.log("TARGET: ", target, "\n\n")
            // console.log("PROPKEY: ", propKey, "\n\n")
            // console.log("RECEIVER: ", receiver, "\n\n")
            const originalValue = target[propKey as keyof T];

            if (typeof originalValue === "function") {
                return traceable(originalValue.bind(target), { traceName: config?.traceName ?? `${sdk.constructor?.name}.${propKey.toString()}` })

            } else if (
                originalValue != null &&
                !Array.isArray(originalValue) &&
                !(originalValue instanceof Date) &&
                typeof originalValue === "object"
            ) {
                return OpenAIWrapper(
                    originalValue,
                    { traceName: config?.traceName ?? `${sdk.constructor?.name}.${propKey.toString()}` }
                );
            } else {
                return Reflect.get(target, propKey, receiver);
            }
        }
    })
}

export default OpenAIWrapper