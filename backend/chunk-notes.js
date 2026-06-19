const fs = require("fs");

const notes =
    fs.readFileSync(
        "lecture-notes.md",
        "utf8"
    );

const chunks =
    notes
        .split("\n\n")
        .filter(
            chunk =>
                chunk.trim().length > 30
        )
        .map(
            (text, index) => ({
                id: index + 1,
                text
            })
        );

fs.writeFileSync(
    "chunks.json",
    JSON.stringify(
        chunks,
        null,
        2
    )
);

console.log(
    `Created ${chunks.length} chunks`
);