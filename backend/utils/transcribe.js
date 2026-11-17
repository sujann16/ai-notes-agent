const path = require("path");
const { exec } = require("child_process");

function transcribeAudio(audioPath) {
    const scriptPath = path.join(__dirname, "transcribe.py");

    return new Promise(
        (resolve, reject) => {
            exec(
                `python3 "${scriptPath}" "${audioPath}"`,
                (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    try {
                        const parsed = JSON.parse(stdout);
                        resolve(parsed);
                    } catch (e) {
                        resolve([{ start: 0, end: 9999, text: stdout.trim() }]);
                    }
                }
            );
        }
    );
}

module.exports = {
    transcribeAudio
};
