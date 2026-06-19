const { exec } = require("child_process");

function transcribeAudio(audioPath) {

    return new Promise(
        (resolve, reject) => {

            exec(
                `python3 transcribe.py "${audioPath}"`,
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