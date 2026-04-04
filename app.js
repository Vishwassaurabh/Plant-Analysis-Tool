require("dotenv").config();
const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { rejects } = require("assert");

const app = express();
const port = process.env.PORT || 3000;

//configure multer
const upload = multer({ dest: "upload/" });
app.use(express.json({ limit: "10mb" }));

//initialize google gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.static("public"));

//routes
//!analyze
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "please upload an image" });
    }
    const imagePath = req.file.path;

    const imageData = await fsPromises.readFile(imagePath, {
      encoding: "base64",
    });

    //use the gemini ai analyze the image
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const results = await model.generateContent([
      "Analyze this plant image and provide detailed analysis of its species and health and care recommendations, its characteristics , care instructions, and any interesting facts. please provide the response plain text without using any markdown formating ",
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: imageData,
        },
      },
    ]);

    const plantInfo = results.response.text();

    //remove the uploaded  images
    await fsPromises.unlink(imagePath);

    //send the response
    res.json({
      results: plantInfo,
      image: `data:${req.file.mimetype};base64,${imageData}`,
    });
  } catch (error) {
    console.error("REAL ERROR:", error); // 👈 VERY IMPORTANT
    res.status(500).json({ error: error.message });
  }
});

//!download pdf
app.post("/download", express.json(), async (req, res) => {
  const { results, image } = req.body;
  try {
    //Ensure the report directory exists
    const reportsDir = path.join(__dirname, "reports");
    await fsPromises.mkdir(reportsDir, { recursive: true });

    //generate pdf
    const filename = `plant_analysis_report_${Date.now()}.pdf`;
    const filePath = path.join(reportsDir, filename);
    const writeStream = fs.createWriteStream(filePath);
    const doc = new PDFDocument();
    doc.pipe(writeStream);

    //add content to the pdf
    doc.fontSize(24).text("Plant Analysis Report", {
      align: "center",
    });
    doc.moveDown();
    doc.fontSize(24).text(`Date:${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.fontSize(14).text(results, { align: "left" });

    //insert the image pdf
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      doc.moveDown();
      doc.image(buffer, {
        fit: [300, 300],
        align: "center",
        valign: "center",
      });
    }
    doc.end();

    //wait for the pdf to be created
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    // Send the PDF to the client
    res.download(filePath, (err) => {
      if (err) {
        res.status(500).json({ error: "Error downloading the PDF report" });
      }
      // Delete the temporary file
      fsPromises.unlink(filePath);
    });
  } catch (error) {
    console.log("Error generating PDF report:", error);
    res
      .status(500)
      .json({ error: "An error accurred while generating the PDF report" });
  }
});

//! start the server
app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
