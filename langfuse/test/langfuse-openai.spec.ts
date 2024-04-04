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

describe("Langfuse-OpenAI-Intergation", () => {
    let langfuse: Langfuse;

    beforeEach(() => {
        langfuse = new Langfuse({
            flushAt: 100,
            fetchRetryDelay: 100,
            fetchRetryCount: 3,
        });
        langfuse.debug(true);
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
            langfuse.flush()
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
            expect(generation.output).toBeDefined()

        }, 10000);

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
            expect(generation.output).toBeDefined()

        }, 10000);

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
        }, 10000);

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
        }, 10000);

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
        }, 10000);

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
        }, 10000);


        it("Function Calling on openai", async () => {
            const name = `FunctionCalling-NonStreaming-${randomUUID()}`
            const res = await OpenAIWrapper(openai, { trace_name: name }).chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ "role": "user", "content": "What's the weather like in Boston today?" }],
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
        }, 10000);
    });
});