const express = require("express");
const cors = require("cors");
const apiRouter = require("./routes/api");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Register routing middleware
app.use("/", apiRouter);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});