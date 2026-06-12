const express = require("express");
const cors = require("cors");
const multer = require("multer");

const upload = multer({
    dest: "uploads/"
});

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        status: "AI Learning Agent Backend Running"
    });
});

app.post(
    "/upload-frame",
    upload.single("frame"),
    async (req, res) => {

        console.log(
            "Frame received:",
            req.file.path
        );

        res.json({
            success: true
        });

    }
);

app.listen(3000, () => {
    console.log("Server running on port 3000");
});