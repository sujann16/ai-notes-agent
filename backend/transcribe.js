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

                    resolve(stdout);

                }
            );

        }
    );
}

module.exports = {
    transcribeAudio
};