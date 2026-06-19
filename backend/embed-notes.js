const fs = require("fs");
const { Ollama } = require("ollama");

const ollama =
    new Ollama({
        host:
        "http://127.0.0.1:11434"
    });

async function run() {

    const chunks =
        JSON.parse(
            fs.readFileSync(
                "chunks.json",
                "utf8"
            )
        );

    let embeddings = [];

    for(const chunk of chunks) {

        console.log(
            "Embedding chunk",
            chunk.id
        );

        const response =
            await ollama.embed({
                model:
                "nomic-embed-text",
                input:
                chunk.text
            });

        embeddings.push({
            id: chunk.id,
            text: chunk.text,
            embedding:
            response.embeddings[0]
        });

    }

    fs.writeFileSync(
        "embeddings.json",
        JSON.stringify(
            embeddings
        )
    );

    console.log(
        "Embeddings saved"
    );

}

run();