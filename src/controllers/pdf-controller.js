const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const MarkdownIt = require("markdown-it");
const { PDFDocument } = require("pdf-lib");

const PUBLIC_REPORTS_DIR = path.join(__dirname, "../../public-reports");
const REPORTS_DIR = path.join(__dirname, "../../reportes");

async function createPdf(req, res) {
  console.log("📥 RECIBIENDO /create-pdf");
  const { output, filename } = req.body;

  if (!output) {
    return res.status(400).json({ error: "Falta campo: output" });
  }

  try {
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    const htmlContent = md.render(output);
    const htmlTemplate = `<!DOCTYPE html>
<html>
  <head><meta charset="UTF-8"><title>Análisis</title></head>
  <body>${htmlContent}</body>
</html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setContent(htmlTemplate, { waitUntil: "networkidle0" });

    const timestamp = Date.now();
    const pdfFilename = filename
      ? `${filename}-${timestamp}.pdf`
      : `pdf-reporte-${timestamp}.pdf`;

    const pdfPath = path.join(PUBLIC_REPORTS_DIR, pdfFilename);

    await page.pdf({
      path: pdfPath,
      format: "letter",
      printBackground: true,
    });

    await browser.close();

    const pdfUrl = `/public-reports/${pdfFilename}`;
    res.json({
      success: true,
      message: "PDF creado exitosamente",
      pdfUrl,
      downloadUrl: `http://localhost:${req.app.get("port")}${pdfUrl}`,
    });
  } catch (err) {
    console.error("❌ Error creando PDF:", err);
    res.status(500).json({ error: "Error creando PDF", details: err.message });
  }
}

async function editPdf(req, res) {
  console.log("📥 RECIBIENDO /editar-pdf");
  const { output } = req.body;

  if (!output) {
    return res.status(400).json({ error: "Falta campo: output" });
  }

  try {
    const files = fs
      .readdirSync(REPORTS_DIR)
      .filter((f) => f.endsWith(".pdf"))
      .map((f) => ({ name: f, time: fs.statSync(path.join(REPORTS_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
      return res.status(404).json({ error: "No hay PDF en la carpeta reportes" });
    }

    const latestFile = path.join(REPORTS_DIR, files[0].name);
    const existingPdfBytes = fs.readFileSync(latestFile);

    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    const htmlContent = md.render(output);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const newPdfBytes = await page.pdf({ format: "letter", printBackground: true });
    await browser.close();

    const originalPdf = await PDFDocument.load(existingPdfBytes);
    const extraPdf = await PDFDocument.load(newPdfBytes);
    const pages = await originalPdf.copyPages(extraPdf, extraPdf.getPageIndices());

    pages.forEach((page) => originalPdf.addPage(page));
    const finalPdfBytes = await originalPdf.save();

    const editedFilename = `edited-${files[0].name}`;
    const editedPath = path.join(REPORTS_DIR, editedFilename);
    fs.writeFileSync(editedPath, finalPdfBytes);

    res.json({
      success: true,
      message: "PDF editado exitosamente",
      editedFile: editedFilename,
      fullPath: editedPath,
    });
  } catch (err) {
    console.error("❌ Error editando PDF:", err);
    res.status(500).json({ error: "Error editando PDF", details: err.message });
  }
}

module.exports = {
  createPdf,
  editPdf,
};