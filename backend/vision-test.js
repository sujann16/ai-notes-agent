const { Ollama } = require('ollama');
const fs = require('fs');

const ollama = new Ollama({
    host: 'http://127.0.0.1:11434'
});

async function run() {

    const image = fs
        .readFileSync('./test.png')
        .toString('base64');

    const response = await ollama.chat({
        model: 'qwen2.5vl:3b',
        messages: [
            {
                role: 'user',
                content:
                    'Analyze this lecture slide and explain all concepts.',
                images: [image]
            }
        ]
    });

    console.log(
        response.message.content
    );
}

run();