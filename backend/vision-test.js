const { Ollama } = require('ollama');
const fs = require('fs');

console.log("Starting script...");

const ollama = new Ollama({
    host: 'http://127.0.0.1:11434'
});

async function run() {
    try {
        console.log("Reading image...");

        const image = fs
            .readFileSync('./test.png')
            .toString('base64');

        console.log("Image loaded");

        console.log("Sending request to Ollama...");

        const response = await ollama.chat({
            model: 'qwen2.5vl:3b',
            messages: [
                {
                    role: 'user',
                    content:
                        'Describe this image in detail',
                    images: [image]
                }
            ]
        });

        console.log("Response received");
        console.log(response);

    } catch (err) {
        console.error("ERROR:");
        console.error(err);
    }
}

run();