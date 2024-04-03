import OpenAI from "openai";
import { OpenAIWrapper } from "langfuse";


const openai = OpenAIWrapper(new OpenAI());

// @Observer()
// @tracer()
const main = async () => {
    const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content: "Who is the president of America ?" }],
        model: "gpt-3.5-turbo",
        stream: true,
        user: "robinhood@gmail.com"
    });

    // console.log(completion.choices[0]);
    for await (const chunk of completion) {
        console.log(chunk.choices[0]?.delta?.content || "")
    }
}

main();
