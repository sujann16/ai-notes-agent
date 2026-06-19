const fs = require("fs");
const { Ollama } = require("ollama");

const ollama = new Ollama({
    host: "http://127.0.0.1:11434"
});

function cosineSimilarity(a, b) {

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for(let i = 0; i < a.length; i++) {

        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];

    }

    return dot /
        (
            Math.sqrt(magA) *
            Math.sqrt(magB)
        );
}

async function ask(question) {

    const embeddings =
        JSON.parse(
            fs.readFileSync(
                "embeddings.json",
                "utf8"
            )
        );

    const queryEmbedding =
        await ollama.embed({
            model: "nomic-embed-text",
            input: question
        });

    const queryVector =
        queryEmbedding.embeddings[0];

    const scored =
        embeddings.map(chunk => ({
            ...chunk,
            score:
                cosineSimilarity(
                    queryVector,
                    chunk.embedding
                )
        }));

    scored.sort(
        (a, b) =>
            b.score - a.score
    );

    const topChunks =
        scored.slice(0, 3);

    const context =
        topChunks
            .map(c => c.text)
            .join("\n\n");

    console.log(
        "\n===== RETRIEVED CONTEXT =====\n"
    );

    console.log(context);

    const answer =
        await ollama.chat({
            model: "qwen3:4b",
            messages: [
                {
                    role: "user",
                    content: `
Answer ONLY using the context below.

Context:

${context}

Question:

${question}
`
                }
            ]
        });

    console.log(
        "\n===== ANSWER =====\n"
    );

    console.log(
        answer.message.content
    );

}

const question =
    process.argv.slice(2).join(" ");

ask(question);