const fs = require("fs");
const path = require("path");
const StorageManager = require("./utils/StorageManager");
const NoteGenerator = require("./services/NoteGenerator");

async function run() {
  console.log("=== STARTING VISUAL NOTES INTEGRATION TEST ===");

  // 1. Initialize session and folder structures
  console.log("Initializing session...");
  const metadata = StorageManager.initSession("current");

  // 2. Copy the test image to current frames folder
  const testImgSrc = path.join(__dirname, "test.png");
  const testImgDest = path.join(StorageManager.getFramesDir("current"), "frame_1.png");
  
  if (fs.existsSync(testImgSrc)) {
    fs.copyFileSync(testImgSrc, testImgDest);
    console.log(`Copied test image from ${testImgSrc} to ${testImgDest}`);
  } else {
    // If test.png doesn't exist, create a tiny empty file so PDF generation doesn't fail
    fs.writeFileSync(testImgDest, "");
    console.log(`Created empty placeholder image at ${testImgDest}`);
  }

  // 3. Create mock metadata with visual/diagram information
  const mockMetadata = {
    startTime: Date.now(),
    uniqueSlides: [
      {
        slide: "frame_1.png",
        timestamp: 10,
        slideContent: null
      },
      {
        slide: "frame_2.png",
        timestamp: 60,
        slideContent: {
          title: "Gradient Descent Optimization",
          visibleText: "Iterative optimization algorithm to minimize loss.",
          bullets: [
            "Gradient points in the direction of steepest increase.",
            "Move in the opposite direction of the gradient to minimize loss.",
            "Learning rate controls the step size."
          ],
          equations: [
            "theta_next = theta - eta * grad_loss(theta)"
          ],
          tables: [],
          detectedVisuals: {
            flowchart: false,
            blockDiagram: false,
            architectureDiagram: false,
            uml: false,
            erDiagram: false,
            graph: false,
            table: false,
            mathematicalDerivation: true
          },
          diagrams: [],
          figures: [],
          charts: []
        }
      }
    ],
    transcriptSegments: [
      {
        start: 0,
        text: "Today we are studying the structure of neural networks. The diagram on the right side of the slide depicts a simple feedforward neural network structure."
      },
      {
        start: 35,
        text: "The input layer feeds directly into the hidden layer with ReLU activation, which then maps to the output layer using Softmax to produce probabilities."
      },
      {
        start: 60,
        text: "Now, to optimize this neural network, we use gradient descent. The parameter theta is updated iteratively by subtracting the learning rate times the gradient of the loss function."
      }
    ]
  };

  StorageManager.writeMetadata("current", mockMetadata);
  console.log("Mock metadata written successfully.");

  // 4. Generate notes and PDF
  console.log("Invoking NoteGenerator.generate()...");
  try {
    const notes = await NoteGenerator.generate("current");
    console.log("Notes successfully generated!");
    console.log("\n--- Generated Notes Content Preview ---");
    console.log(notes);
    console.log("----------------------------------------\n");

    // 5. Verification checks
    const notesPath = StorageManager.getNotesPath("current");
    const pdfPath = StorageManager.getPdfPath("current");

    if (!fs.existsSync(notesPath)) {
      throw new Error(`FAIL: Lecture notes file not found at ${notesPath}`);
    }
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`FAIL: PDF file not found at ${pdfPath}`);
    }

    const notesContent = fs.readFileSync(notesPath, "utf8");
    if (!notesContent.includes("[DIAGRAM: frame_1.png]")) {
      throw new Error("FAIL: Note content does not contain diagram reference tag [DIAGRAM: frame_1.png]");
    }
    
    console.log("SUCCESS: Notes contain the expected [DIAGRAM: frame_1.png] tag!");
    console.log(`SUCCESS: PDF file generated successfully at ${pdfPath} (${fs.statSync(pdfPath).size} bytes)`);
    console.log("=== TEST COMPLETED SUCCESSFULLY ===");
  } catch (err) {
    console.error("=== TEST FAILED ===");
    console.error(err);
    process.exit(1);
  }
}

run();
