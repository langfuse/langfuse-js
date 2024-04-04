import OpenAI from "openai";
import { OpenAIWrapper } from "../index";
import { randomUUID } from "crypto";
import axios, { type AxiosResponse } from "axios";
import { LANGFUSE_BASEURL, getHeaders } from "../../integration-test/integration-utils";
import Langfuse from "../index";

const openai = new OpenAI();

const getGeneration = async (name: string): Promise<AxiosResponse<any, any>> => {
    const url = `${LANGFUSE_BASEURL}/api/public/observations?name=${name}&type=GENERATION`
    const res = await axios.get(url, {
        headers: getHeaders(),
    });
    return res
}

const getTrace = async (id: string): Promise<AxiosResponse<any, any>> => {
    const url = `${LANGFUSE_BASEURL}/api/public/traces/${id}`
    const res = await axios.get(url, {
        headers: getHeaders(),
    });
    return res
}
describe("Langfuse-OpenAI-Integation", () => {
    let langfuse: Langfuse;

    beforeEach(() => {
        langfuse = new Langfuse({
            flushAt: 100,
            fetchRetryDelay: 100,
            fetchRetryCount: 3,
        });
        langfuse.debug(true);
    });

    afterEach(async () => {
        await langfuse.shutdownAsync();
    });

    describe("Core Methods", () => {

        it("Chat-completion without streaming", async () => {
            const name = `ChatCompletion-Nonstreaming-${randomUUID()}`
            const res = await OpenAIWrapper(openai, { trace_name: name }).chat.completions.create({
                messages: [{ role: "system", content: "Tell me a story about a king." }],
                model: "gpt-3.5-turbo",
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });
            expect(res).toBeDefined()
            const usage = res.usage
            await langfuse.flushAsync()
            let response = await getGeneration(name)
            expect(response.status).toBe(200)
            expect(response.data).toBeDefined()
            if (response.data.data.length == 0) {
                response = await getGeneration(name)
            }
            expect(response.data.data).toBeDefined()
            expect(response.data.data.length).toBeGreaterThan(0)
            const generation = response.data.data[0]
            expect(generation.name).toBe(name)
            expect(generation.modelParameters).toBeDefined()
            expect(generation.modelParameters).toMatchObject(
                { user: 'langfuse-user@gmail.com', max_tokens: 300 }
            )
            expect(generation.usage).toBeDefined()
            expect(generation.model).toBe("gpt-3.5-turbo")
            expect(generation.totalTokens).toBeDefined()
            expect(generation.promptTokens).toBeDefined()
            expect(generation.completionTokens).toBeDefined()
            expect(generation.input).toBeDefined()
            expect(generation.output).toBeDefined()
            expect(generation.output).toMatchObject(res.choices[0].message)
            expect(generation.usage).toMatchObject({
                unit: "TOKENS",
                input: usage?.prompt_tokens,
                output: usage?.completion_tokens,
                total: usage?.total_tokens
            })
            expect(generation.calculatedInputCost).toBeDefined()
            expect(generation.calculatedOutputCost).toBeDefined()
            expect(generation.calculatedTotalCost).toBeDefined()
            expect(generation.statusMessage).toBeNull()

        }, 40000);

        it("Chat-completion with streaming", async () => {
            const name = `ChatComplete-Streaming-${randomUUID()}`
            const stream = await OpenAIWrapper(openai, { trace_name: name }).chat.completions.create({
                messages: [{ role: "system", content: "Who is the president of America ?" }, { "role": "system", content: "Hi Iam the president of America!" }],
                model: "gpt-3.5-turbo",
                stream: true,
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });
            let content = ""
            for await (const chunk of stream) {
                content += chunk.choices[0]?.delta?.content || '';
            }

            expect(content).toBeDefined()
            await langfuse.flushAsync()

            let response = await getGeneration(name)
            expect(response.status).toBe(200)
            expect(response.data).toBeDefined()
            if (response.data.data.length == 0) {
                response = await getGeneration(name)
            }
            expect(response.data.data).toBeDefined()
            expect(response.data.data.length).toBeGreaterThan(0)
            const generation = response.data.data[0]
            expect(generation.name).toBe(name)
            expect(generation.modelParameters).toBeDefined()
            expect(generation.modelParameters).toMatchObject(
                { user: 'langfuse-user@gmail.com', max_tokens: 300, stream: true }
            )
            expect(generation.usage).toBeDefined()
            expect(generation.model).toBe("gpt-3.5-turbo")
            expect(generation.totalTokens).toBeDefined()
            expect(generation.promptTokens).toBeDefined()
            expect(generation.completionTokens).toBeDefined()
            expect(generation.input).toBeDefined()
            expect(generation.output).toBeDefined()
            expect(generation.output).toMatch(content)

        }, 40000);

        it("Completion without streaming", async () => {
            const name = `Completion-NonStreaming-${randomUUID()}`
            const res = await OpenAIWrapper(openai, { trace_name: name }).completions.create({
                prompt: "Say this is a test!",
                model: "gpt-3.5-turbo-instruct",
                stream: false,
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });
            expect(res).toBeDefined()
            const usage = res.usage
            await langfuse.flushAsync()

            let response = await getGeneration(name)
            expect(response.status).toBe(200)
            expect(response.data).toBeDefined()
            if (response.data.data.length == 0) {
                response = await getGeneration(name)
            }
            expect(response.data.data).toBeDefined()
            expect(response.data.data.length).toBeGreaterThan(0)
            const generation = response.data.data[0]
            expect(generation.name).toBe(name)
            expect(generation.modelParameters).toBeDefined()
            expect(generation.modelParameters).toMatchObject(
                { user: 'langfuse-user@gmail.com', max_tokens: 300, stream: false }
            )
            expect(generation.usage).toBeDefined()
            expect(generation.model).toBe("gpt-3.5-turbo-instruct")
            expect(generation.totalTokens).toBeDefined()
            expect(generation.promptTokens).toBeDefined()
            expect(generation.completionTokens).toBeDefined()
            expect(generation.input).toBeDefined()
            expect(generation.output).toBeDefined()
            expect(generation.output).toMatch(res.choices[0].text)
            expect(generation.usage).toMatchObject({
                unit: "TOKENS",
                input: usage?.prompt_tokens,
                output: usage?.completion_tokens,
                total: usage?.total_tokens
            })
            expect(generation.calculatedInputCost).toBeDefined()
            expect(generation.calculatedOutputCost).toBeDefined()
            expect(generation.calculatedTotalCost).toBeDefined()
            expect(generation.statusMessage).toBeNull()
        }, 40000);

        it("Completion with streaming", async () => {
            const name = `Completions-streaming-${randomUUID()}`
            const stream = await OpenAIWrapper(openai, { trace_name: name }).completions.create({
                prompt: "Say this is a test",
                model: "gpt-3.5-turbo-instruct",
                stream: true,
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });
            let content = ""
            for await (const chunk of stream) {
                content += chunk.choices[0].text || '';
            }

            expect(content).toBeDefined()
            await langfuse.flushAsync()

            let response = await getGeneration(name)
            expect(response.status).toBe(200)
            expect(response.data).toBeDefined()
            if (response.data.data.length == 0) {
                response = await getGeneration(name)
            }
            expect(response.data.data).toBeDefined()
            expect(response.data.data.length).toBeGreaterThan(0)
            const generation = response.data.data[0]
            expect(generation.name).toBe(name)
            expect(generation.modelParameters).toBeDefined()
            expect(generation.modelParameters).toMatchObject(
                { user: 'langfuse-user@gmail.com', max_tokens: 300, stream: true }
            )
            expect(generation.usage).toBeDefined()
            expect(generation.model).toBe("gpt-3.5-turbo-instruct")
            expect(generation.totalTokens).toBeDefined()
            expect(generation.promptTokens).toBeDefined()
            expect(generation.completionTokens).toBeDefined()
            expect(generation.input).toBeDefined()
            expect(generation.output).toBeDefined()
            expect(generation.output).toMatch(content)
        }, 40000);

        it("Few Short learning with streaming", async () => {
            const name = `FewShortLearning-Streaming-${randomUUID()}`
            const stream = await OpenAIWrapper(openai, { trace_name: name }).chat.completions.create({
                messages: [
                    {
                        "role": "system",
                        "content": "You output candidate notes in JSON format when given a candidate profile and a job description.",
                    },
                    {
                        "role": "user",
                        "content": "Candidate Profile: Experienced software engineer with a background in developing scalable web applications using Python. Job Description: We’re looking for a Python developer to help us build and scale our web platform.",
                    },
                    {
                        "role": "assistant",
                        "content": "{'one-line-intro': 'Experienced Python developer with a track record of building scalable web applications.', 'move-forward': 'Yes', 'priority': 'P1', 'pros': '1. Relevant experience in Python. 2. Has built and scaled web applications. 3. Likely to fit well with the job requirements.', 'cons': 'None apparent from the provided profile.'}",
                    },
                    {
                        "role": "user",
                        "content": "Candidate Profile: Recent graduate with a degree in computer science and a focus on data analysis. Job Description: Seeking a seasoned data scientist to analyze large data sets and derive insights."
                    },
                    {
                        "role": "assistant",
                        "content": "{'one-line-intro': 'Recent computer science graduate with a focus on data analysis.', 'move-forward': 'Maybe', 'priority': 'P2', 'pros': '1. Has a strong educational background in computer science. 2. Specialized focus on data analysis.', 'cons': '1. Lack of professional experience. 2. Job requires a seasoned data scientist.' }"
                    },
                    {
                        "role": "user",
                        "content": "Candidate Profile: computer science graduate \n Job Description: data-scientist"
                    },
                ],
                model: "gpt-3.5-turbo",
                stream: true,
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });
            let content = ""
            for await (const chunk of stream) {
                content += chunk.choices[0].delta.content || '';
            }

            expect(content).toBeDefined()
            await langfuse.flushAsync()

            let response = await getGeneration(name)
            expect(response.status).toBe(200)
            expect(response.data).toBeDefined()
            if (response.data.data.length == 0) {
                response = await getGeneration(name)
            }
            expect(response.data.data).toBeDefined()
            expect(response.data.data.length).toBeGreaterThan(0)
            const generation = response.data.data[0]
            expect(generation.name).toBe(name)
            expect(generation.modelParameters).toBeDefined()
            expect(generation.modelParameters).toMatchObject(
                { user: 'langfuse-user@gmail.com', max_tokens: 300, stream: true }
            )
            expect(generation.usage).toBeDefined()
            expect(generation.model).toBe("gpt-3.5-turbo")
            expect(generation.totalTokens).toBeDefined()
            expect(generation.promptTokens).toBeDefined()
            expect(generation.completionTokens).toBeDefined()
            expect(generation.input).toBeDefined()
            expect(generation.output).toBeDefined()
            expect(generation.output).toMatch(content)
        }, 40000);

        it("Few Short learning without streaming", async () => {
            const name = `FewShortLearning-NonStreaming-${randomUUID()}`
            const res = await OpenAIWrapper(openai, { trace_name: name }).chat.completions.create({
                messages: [
                    {
                        "role": "system",
                        "content": "You output candidate notes in JSON format when given a candidate profile and a job description.",
                    },
                    {
                        "role": "user",
                        "content": "Candidate Profile: Experienced software engineer with a background in developing scalable web applications using Python. Job Description: We’re looking for a Python developer to help us build and scale our web platform.",
                    },
                    {
                        "role": "assistant",
                        "content": "{'one-line-intro': 'Experienced Python developer with a track record of building scalable web applications.', 'move-forward': 'Yes', 'priority': 'P1', 'pros': '1. Relevant experience in Python. 2. Has built and scaled web applications. 3. Likely to fit well with the job requirements.', 'cons': 'None apparent from the provided profile.'}",
                    },
                    {
                        "role": "user",
                        "content": "Candidate Profile: Recent graduate with a degree in computer science and a focus on data analysis. Job Description: Seeking a seasoned data scientist to analyze large data sets and derive insights."
                    },
                    {
                        "role": "assistant",
                        "content": "{'one-line-intro': 'Recent computer science graduate with a focus on data analysis.', 'move-forward': 'Maybe', 'priority': 'P2', 'pros': '1. Has a strong educational background in computer science. 2. Specialized focus on data analysis.', 'cons': '1. Lack of professional experience. 2. Job requires a seasoned data scientist.' }"
                    },
                    {
                        "role": "user",
                        "content": "Candidate Profile: computer science graduate \n Job Description: data-scientist"
                    },
                ],
                model: "gpt-3.5-turbo",
                stream: false,
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });
            const content = res.choices[0].message

            expect(content).toBeDefined()
            await langfuse.flushAsync()
            const usage = res.usage

            let response = await getGeneration(name)
            expect(response.status).toBe(200)
            expect(response.data).toBeDefined()
            if (response.data.data.length == 0) {
                response = await getGeneration(name)
            }
            expect(response.data.data).toBeDefined()
            expect(response.data.data.length).toBeGreaterThan(0)
            const generation = response.data.data[0]
            expect(generation.name).toBe(name)
            expect(generation.modelParameters).toBeDefined()
            expect(generation.modelParameters).toMatchObject(
                { user: 'langfuse-user@gmail.com', max_tokens: 300, stream: false }
            )
            expect(generation.usage).toBeDefined()
            expect(generation.model).toBe("gpt-3.5-turbo")
            expect(generation.totalTokens).toBeDefined()
            expect(generation.promptTokens).toBeDefined()
            expect(generation.completionTokens).toBeDefined()
            expect(generation.input).toBeDefined()
            expect(generation.output).toBeDefined()
            expect(generation.output).toMatchObject(content)
            expect(generation.usage).toMatchObject({
                unit: "TOKENS",
                input: usage?.prompt_tokens,
                output: usage?.completion_tokens,
                total: usage?.total_tokens
            })
            expect(generation.calculatedInputCost).toBeDefined()
            expect(generation.calculatedOutputCost).toBeDefined()
            expect(generation.calculatedTotalCost).toBeDefined()
            expect(generation.statusMessage).toBeNull()
        }, 40000);

        it("Function Calling on openai", async () => {
            const name = `FunctionCalling-NonStreaming-${randomUUID()}`
            const res = await OpenAIWrapper(openai, { trace_name: name }).chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ "role": "user", "content": "Explain how to assemble a PC" }],
                functions: [
                    {
                        "name": "get_answer_for_user_query",
                        "description": "Get user answer in series of steps",
                        "parameters": { 'title': 'StepByStepAIResponse', 'type': 'object', 'properties': { 'title': { 'title': 'Title', 'type': 'string' }, 'steps': { 'title': 'Steps', 'type': 'array', 'items': { 'type': 'string' } } }, 'required': ['title', 'steps'] }
                    }
                ],
                function_call: { "name": "get_answer_for_user_query" },
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });
            const content = res.choices[0].message
            const usage = res.usage

            expect(content).toBeDefined()
            await langfuse.flushAsync()

            let response = await getGeneration(name)
            expect(response.status).toBe(200)
            expect(response.data).toBeDefined()
            if (response.data.data.length == 0) {
                response = await getGeneration(name)
            }
            expect(response.data.data).toBeDefined()
            expect(response.data.data.length).toBeGreaterThan(0)
            const generation = response.data.data[0]
            expect(generation.name).toBe(name)
            expect(generation.modelParameters).toBeDefined()
            expect(generation.modelParameters).toMatchObject(
                { user: 'langfuse-user@gmail.com', "max_tokens": 300 }
            )
            expect(generation.usage).toBeDefined()
            expect(generation.model).toBe("gpt-3.5-turbo")
            expect(generation.totalTokens).toBeDefined()
            expect(generation.promptTokens).toBeDefined()
            expect(generation.completionTokens).toBeDefined()
            expect(generation.input).toBeDefined()
            expect(generation.output).toBeDefined()
            expect(generation.output).toMatchObject(content)
            expect(generation.usage).toMatchObject({
                unit: "TOKENS",
                input: usage?.prompt_tokens,
                output: usage?.completion_tokens,
                total: usage?.total_tokens
            })
            expect(generation.calculatedInputCost).toBeDefined()
            expect(generation.calculatedOutputCost).toBeDefined()
            expect(generation.calculatedTotalCost).toBeDefined()
            expect(generation.statusMessage).toBeNull()
        }, 40000);

        it("Tools and Toolchoice Calling on openai", async () => {
            const name = `Tools-and-Toolchoice-NonStreaming-${randomUUID()}`
            const res = await OpenAIWrapper(openai, { trace_name: name }).chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ "role": "user", "content": "What's the weather like in Boston today?" }],
                tool_choice: "auto",
                tools: [
                    {
                        "type": "function",
                        "function": {
                            "name": "get_current_weather",
                            "description": "Get the current weather in a given location",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "location": {
                                        "type": "string",
                                        "description": "The city and state, e.g. San Francisco, CA",
                                    },
                                    "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] },
                                },
                                "required": ["location"],
                            },
                        },
                    }
                ],
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });
            const content = res.choices[0].message
            const usage = res.usage

            expect(content).toBeDefined()
            await langfuse.flushAsync()

            let response = await getGeneration(name)
            expect(response.status).toBe(200)
            expect(response.data).toBeDefined()
            if (response.data.data.length == 0) {
                response = await getGeneration(name)
            }
            expect(response.data.data).toBeDefined()
            expect(response.data.data.length).toBeGreaterThan(0)
            const generation = response.data.data[0]
            expect(generation.name).toBe(name)
            expect(generation.modelParameters).toBeDefined()
            expect(generation.modelParameters).toMatchObject(
                { user: 'langfuse-user@gmail.com', "max_tokens": 300 }
            )
            expect(generation.usage).toBeDefined()
            expect(generation.model).toBe("gpt-3.5-turbo")
            expect(generation.totalTokens).toBeDefined()
            expect(generation.promptTokens).toBeDefined()
            expect(generation.completionTokens).toBeDefined()
            expect(generation.input).toBeDefined()
            expect(generation.output).toBeDefined()
            expect(generation.output).toMatchObject(content)
            expect(generation.usage).toMatchObject({
                unit: "TOKENS",
                input: usage?.prompt_tokens,
                output: usage?.completion_tokens,
                total: usage?.total_tokens
            })
            expect(generation.calculatedInputCost).toBeDefined()
            expect(generation.calculatedOutputCost).toBeDefined()
            expect(generation.calculatedTotalCost).toBeDefined()
            expect(generation.statusMessage).toBeNull()
        }, 40000);

        it("Using a common OpenAI client for multiple requests", async () => {
            const name = `Common-client-initialisation-${randomUUID()}`
            const client = OpenAIWrapper(openai, { trace_name: name })
            const res1 = await client.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ "role": "user", "content": "What's the weather like in Boston today?" }],
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });

            await client.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ "role": "user", "content": "What's the weather like in Boston today?" }],
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });

            await client.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ "role": "user", "content": "What's the weather like in Boston today?" }],
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });

            await langfuse.flushAsync()
            const content = res1.choices[0].message

            expect(content).toBeDefined()

            // Fetches the generation by name. According to the condition it should return 3 generations.
            // Since the returned results may not be in the order we expect, avoiding the comparison of the 
            // langfuse trace output against model output. We only check the existence. Similarly for few other params.
            const response = await getGeneration(name)
            expect(response.status).toBe(200)
            expect(response.data).toBeDefined()
            expect(response.data.data).toBeDefined()
            // Greater than 2 becuase the data is not immediately consistent on langfuse. So it might miss 
            // the last value when fetching from db.
            // TODO: Make the trace save immediately consistent, ensuring always the latest data is returned.
            expect(response.data.data.length).toBeGreaterThanOrEqual(2)
            const generation = response.data.data[0]
            const traceId = generation.id
            for (const i of response.data.data.splice(1)) {
                expect(i.id).not.toBe(traceId)
            }
            expect(generation.name).toBe(name)
            expect(generation.modelParameters).toBeDefined()
            expect(generation.modelParameters).toMatchObject(
                { user: 'langfuse-user@gmail.com', "max_tokens": 300 }
            )
            expect(generation.usage).toBeDefined()
            expect(generation.model).toBe("gpt-3.5-turbo")
            expect(generation.totalTokens).toBeDefined()
            expect(generation.promptTokens).toBeDefined()
            expect(generation.completionTokens).toBeDefined()
            expect(generation.input).toBeDefined()
            expect(generation.output).toBeDefined()
            expect(generation.calculatedInputCost).toBeDefined()
            expect(generation.calculatedOutputCost).toBeDefined()
            expect(generation.calculatedTotalCost).toBeDefined()
            expect(generation.statusMessage).toBeNull()
        }, 40000);

        it("Extra Wrapper params", async () => {
            const name = `Extra-wrapper-params-${randomUUID()}`
            const res = await OpenAIWrapper(openai, {
                trace_name: name,
                metadata: {
                    hello: 'World'
                },
                tags: ["hello", "World"],
                session_id: "Langfuse",
                user_id: "LangfuseUser"
            }).chat.completions.create({
                messages: [{ role: "system", content: "Tell me a story about a king." }],
                model: "gpt-3.5-turbo",
                user: "langfuse-user@gmail.com",
                max_tokens: 300
            });
            expect(res).toBeDefined()
            const usage = res.usage
            await langfuse.flushAsync()
            let response = await getGeneration(name)
            expect(response.status).toBe(200)
            expect(response.data).toBeDefined()
            if (response.data.data.length == 0) {
                response = await getGeneration(name)
            }
            expect(response.data.data).toBeDefined()
            expect(response.data.data.length).toBeGreaterThan(0)
            const generation = response.data.data[0]
            expect(generation.name).toBe(name)
            expect(generation.modelParameters).toBeDefined()
            expect(generation.modelParameters).toMatchObject(
                { user: 'langfuse-user@gmail.com', max_tokens: 300 }
            )
            expect(generation.usage).toBeDefined()
            expect(generation.model).toBe("gpt-3.5-turbo")
            expect(generation.totalTokens).toBeDefined()
            expect(generation.promptTokens).toBeDefined()
            expect(generation.completionTokens).toBeDefined()
            expect(generation.input).toBeDefined()
            expect(generation.output).toBeDefined()
            expect(generation.output).toMatchObject(res.choices[0].message)
            expect(generation.usage).toMatchObject({
                unit: "TOKENS",
                input: usage?.prompt_tokens,
                output: usage?.completion_tokens,
                total: usage?.total_tokens
            })
            expect(generation.calculatedInputCost).toBeDefined()
            expect(generation.calculatedOutputCost).toBeDefined()
            expect(generation.calculatedTotalCost).toBeDefined()
            expect(generation.statusMessage).toBeNull()

            const traceId = generation.traceId
            const resp = await getTrace(traceId)
            expect(resp.status).toBe(200)
            expect(resp.data).toBeDefined()
            const trace = resp.data
            expect(trace.metada)
            expect(trace.metadata).toBeDefined()
            expect(trace.metadata).toMatchObject({
                hello: 'World'
            })
            expect(trace.tags).toBeDefined()
            expect(trace.tags).toEqual(expect.arrayContaining(["hello", "World"]))
            expect(trace.sessionId).toBeDefined()
            expect(trace.sessionId).toBe("Langfuse")
            expect(trace.userId).toBeDefined()
            expect(trace.userId).toBe("LangfuseUser")

        }, 40000);

        it("Error Handling in openai", async () => {
            const name = `Error-Handling-in-wrapper-${randomUUID()}`
            try {
                await OpenAIWrapper(openai, {
                    trace_name: name,
                    metadata: {
                        hello: 'World'
                    },
                    tags: ["hello", "World"],
                    session_id: "Langfuse",
                    user_id: "LangfuseUser"
                }).chat.completions.create({
                    messages: [{ role: "system", content: "Tell me a story about a king." }],
                    model: "gpt-3.5-turbo-instruct", // Purposely changed the model to completions.
                    user: "langfuse-user@gmail.com",
                    max_tokens: 300
                });
            } catch (error) {
                await langfuse.flushAsync()
                let response = await getGeneration(name)
                expect(response.status).toBe(200)
                expect(response.data).toBeDefined()
                if (response.data.data.length == 0) {
                    response = await getGeneration(name)
                }
                expect(response.data.data).toBeDefined()
                expect(response.data.data.length).toBeGreaterThan(0)
                const generation = response.data.data[0]
                expect(generation.name).toBe(name)
                expect(generation.modelParameters).toBeDefined()
                expect(generation.modelParameters).toMatchObject(
                    { user: 'langfuse-user@gmail.com', max_tokens: 300 }
                )
                expect(generation.model).toBe("gpt-3.5-turbo-instruct")
                expect(generation.input).toBeDefined()
                expect(generation.output).toBeNull()
                expect(generation.statusMessage).toBeDefined()

                const traceId = generation.traceId
                const resp = await getTrace(traceId)
                expect(resp.status).toBe(200)
                expect(resp.data).toBeDefined()
                const trace = resp.data
                expect(trace.metada)
                expect(trace.metadata).toBeDefined()
                expect(trace.metadata).toMatchObject({
                    hello: 'World'
                })
                expect(trace.tags).toBeDefined()
                expect(trace.tags).toEqual(expect.arrayContaining(["hello", "World"]))
                expect(trace.sessionId).toBeDefined()
                expect(trace.sessionId).toBe("Langfuse")
                expect(trace.userId).toBeDefined()
                expect(trace.userId).toBe("LangfuseUser")
            }

        }, 40000);
    });
});