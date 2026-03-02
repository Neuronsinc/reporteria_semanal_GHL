const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const MarkdownIt = require("markdown-it");
const { PDFDocument } = require("pdf-lib");

const PUBLIC_REPORTS_DIR = path.join(__dirname, "../../public-reports");
const EDIT_REPORTS_DIR = path.join(__dirname, "../../public-reports/edit-reportes");
const REPORTS_DIR = path.join(__dirname, "../../reportes");

// Asegurar que exista el directorio de reportes editados
if (!fs.existsSync(EDIT_REPORTS_DIR)) {
  fs.mkdirSync(EDIT_REPORTS_DIR, { recursive: true });
}

/**
 * Template HTML mejorado con estilos profesionales
 */
function getHtmlTemplate(htmlContent) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Análisis de Reporte</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
      padding: 40px 50px;
      background: #fff;
    }
    
    h1 {
      font-size: 20pt;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid #0066cc;
    }
    
    h2 {
      font-size: 16pt;
      font-weight: 600;
      color: #0066cc;
      margin-top: 30px;
      margin-bottom: 15px;
      padding-left: 10px;
      border-left: 4px solid #0066cc;
    }
    
    h3 {
      font-size: 13pt;
      font-weight: 600;
      color: #444;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    
    p {
      text-align: justify;
      margin-bottom: 12px;
      line-height: 1.7;
    }
    
    ul, ol {
      margin-left: 25px;
      margin-bottom: 15px;
    }
    
    li {
      margin-bottom: 8px;
      text-align: justify;
      line-height: 1.6;
    }
    
    strong {
      font-weight: 600;
      color: #1a1a1a;
    }
    
    em {
      font-style: italic;
      color: #555;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 10pt;
    }
    
    table th {
      background-color: #0066cc;
      color: white;
      font-weight: 600;
      padding: 10px;
      text-align: left;
      border: 1px solid #0055aa;
    }
    
    table td {
      padding: 8px 10px;
      border: 1px solid #ddd;
      text-align: left;
    }
    
    table tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    
    table tr:hover {
      background-color: #f0f0f0;
    }
    
    hr {
      border: none;
      border-top: 2px solid #e0e0e0;
      margin: 25px 0;
    }
    
    blockquote {
      border-left: 4px solid #0066cc;
      padding-left: 15px;
      margin: 15px 0;
      color: #555;
      font-style: italic;
      background-color: #f5f5f5;
      padding: 10px 15px;
    }
    
    code {
      background-color: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 10pt;
      color: #d63384;
    }
    
    pre {
      background-color: #f4f4f4;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      margin: 15px 0;
    }
    
    pre code {
      background: none;
      padding: 0;
      color: #333;
    }
    
    .page-break {
      page-break-after: always;
    }
    
    @media print {
      body {
        padding: 20px;
      }
      
      h1, h2, h3 {
        page-break-after: avoid;
      }
      
      table, figure, img {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
}

async function createPdf(req, res) {
  console.log("📥 RECIBIENDO /create-pdf");
  const { output, filename } = req.body;

  if (!output) {
    return res.status(400).json({ error: "Falta campo: output" });
  }

  try {
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: true });
    const htmlContent = md.render(output);
    const htmlTemplate = getHtmlTemplate(htmlContent);

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
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm"
      }
    });

    await browser.close();

    const pdfUrl = `/public-reports/${pdfFilename}`;
    
    // Obtener el puerto y construir la URL completa
    const port = req.app.get("port") || 3000;
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${port}`;
    
    res.json({
      success: true,
      message: "PDF creado exitosamente",
      pdfUrl,
      downloadUrl: `${protocol}://${host}${pdfUrl}`,
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

    const md = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: true });
    const htmlContent = md.render(output);
    const htmlTemplate = getHtmlTemplate(htmlContent);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setContent(htmlTemplate, { waitUntil: "networkidle0" });
    
    const newPdfBytes = await page.pdf({ 
      format: "letter", 
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm"
      }
    });
    
    await browser.close();

    const originalPdf = await PDFDocument.load(existingPdfBytes);
    const extraPdf = await PDFDocument.load(newPdfBytes);
    const pages = await originalPdf.copyPages(extraPdf, extraPdf.getPageIndices());

    pages.forEach((page) => originalPdf.addPage(page));
    const finalPdfBytes = await originalPdf.save();

const originalName = files[0].name;
const idMatch = originalName.match(/([a-f0-9]{24}_\d+)\.pdf$/i);
const uniqueId = idMatch ? idMatch[1] : Date.now();
const editedFilename = `reporteria-rendimiento-rebeca-${uniqueId}.pdf`;

    const editedPath = path.join(EDIT_REPORTS_DIR, editedFilename);
    fs.writeFileSync(editedPath, finalPdfBytes);

    console.log(`✅ PDF editado guardado en: ${editedPath}`);

    const pdfUrl = `/public-reports/edit-reportes/${editedFilename}`;
    
    // Obtener el puerto y construir la URL completa
    const port = req.app.get("port") || 3000;
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${port}`;
    const fullUrl = `${protocol}://${host}${pdfUrl}`;

    res.json({
      success: true,
      message: "PDF editado exitosamente",
      editedFile: editedFilename,
      pdfUrl: pdfUrl,
      downloadUrl: fullUrl,
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