// Establece variables de entorno antes de requerir puppeteer
process.env.XDG_RUNTIME_DIR = '/tmp';

const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const MarkdownIt = require("markdown-it");

const app = express();
const PORT = 3000;

app.use(express.json());

// Crear carpeta para reports públicos
const PUBLIC_REPORTS_DIR = path.join(__dirname, "public-reports");
if (!fs.existsSync(PUBLIC_REPORTS_DIR)) {
  fs.mkdirSync(PUBLIC_REPORTS_DIR);
}

const REPORTS_DIR = path.join(__dirname, "reportes");
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR);
}

const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR);
}

app.use("/public-reports", express.static(PUBLIC_REPORTS_DIR));

// Nueva ruta para crear PDF a partir de markdown y devolver URL
app.post("/create-pdf", async (req, res) => {
  const { output, filename } = req.body;
  if (!output) {
    return res.status(400).json({ error: "Falta campo: output" });
  }

  try {
    // Renderizar Markdown a HTML
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    const htmlContent = md.render(output);
    const htmlTemplate = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Análisis</title><style>body{font-family:Arial,sans-serif;padding:40px;font-size:12px;line-height:1.5;color:#333;}h1,h2,h3{color:#2c3e50;}table{width:100%;border-collapse:collapse;margin:15px 0;}table,th,td{border:1px solid #ccc;}th,td{padding:6px;text-align:left;}code{background:#f4f4f4;padding:2px 4px;border-radius:4px;font-size:11px;}ul,ol{margin:10px 0 10px 20px;}hr{border:none;border-top:1px solid #ccc;margin:20px 0;} .page-break{page-break-after:always;}</style></head><body><h1>Análisis</h1>${htmlContent}</body></html>`;

      // Generar PDF de Markdown
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--single-process","--no-zygote","--disable-gpu"],
      ignoreDefaultArgs: ["--disable-extensions"],
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlTemplate, { waitUntil: "networkidle0" });
    
    // Generar nombre de archivo único
    const timestamp = Date.now();
    const pdfFilename = filename 
      ? `${filename}-${timestamp}.pdf` 
      : `pdf-reporte-${timestamp}.pdf`;
    
    const pdfPath = path.join(PUBLIC_REPORTS_DIR, pdfFilename);
    
    await page.pdf({ 
      path: pdfPath,
      format: "letter", 
      printBackground: true, 
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" }, 
      displayHeaderFooter: true, 
      headerTemplate: '<div style="font-size:10px;width:100%;text-align:center;"></div>', 
      footerTemplate: '<div style="font-size:10px;width:100%;text-align:center;padding:10px;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>' 
    });
    
    await browser.close();

    // Devolver la URL para descargar el PDF
    const pdfUrl = `/public-reports/${pdfFilename}`;
    
    res.json({ 
      success: true, 
      message: "PDF creado exitosamente", 
      pdfUrl: pdfUrl,
      downloadUrl: `http://localhost:${PORT}${pdfUrl}`
    });

  } catch (err) {
    console.error('❌ Error creando PDF:', err);
    res.status(500).json({ error: 'Error creando PDF', details: err.message });
  }
});


function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.post("/scrape", async (req, res) => {
  const { agencia, reporte_url } = req.body;
  if (!agencia || !reporte_url) {
    return res.status(400).json({ error: "Faltan campos: agencia o reporte_url" });
  }
  console.log(`📥 Recibido: ${agencia} - ${reporte_url}`);

  let browser;
  try {
    // Limpiar reportes previos
    fs.readdirSync(REPORTS_DIR).forEach(file => {
      if (file.endsWith('.pdf') || file.endsWith('.crdownload')) {
        fs.unlinkSync(path.join(REPORTS_DIR, file));
      }
    });

    // Lanzar Chromium en modo headless
    browser = await puppeteer.launch({
      headless: true,
      args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--single-process",
    "--no-zygote",
    "--disable-gpu",
    "--window-size=1920,1080"
  ]
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: REPORTS_DIR,
    });

    // Navegar y esperar carga
    await page.goto(reporte_url, { waitUntil: "domcontentloaded" });
        await delay(27000);

    // Exportar PDF si existe el botón
    await page.waitForSelector("#export-btn", { timeout: 35000 });
    await page.click("#export-btn");
    await delay(20000);

    // Desplazamiento suave
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let total = 0;
        const distance = 300;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          total += distance;
          if (total >= document.body.scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 300);
      });
    });
    await delay(20000);

    // Aplicar estilos para visibilidad completa
    await page.addStyleTag({
      content: `* { overflow: visible !important; } html, body { height: auto !important; } .hl-card-content { overflow: hidden !important; }`
    });
    await delay(3000);

    // Capturar screenshot
    const screenshotId = Date.now();
    const filename = `${screenshotId}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    await browser.close();

    // Enviar imagen al cliente
    const buffer = fs.readFileSync(filepath);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (err) {
    console.error("❌ Error en scraping:", err);
    if (browser) await browser.close();
    res.status(500).json({ error: "Error en el scraping", details: err.message });
  }
});

app.post("/editar-pdf", async (req, res) => {
  const { output } = req.body;
  if (!output) {
    return res.status(400).json({ error: "Falta campo: output" });
  }
  try {
    // Localizar último PDF
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith(".pdf"))
      .map(f => ({ name: f, time: fs.statSync(path.join(REPORTS_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    if (!files.length) return res.status(404).json({ error: "No hay ningún PDF en carpeta reportes" });

    const latestName = files[0].name;
    const existingPdfBytes = fs.readFileSync(path.join(REPORTS_DIR, latestName));

    // Renderizar Markdown a HTML
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    const htmlContent = md.render(output);
    const htmlTemplate = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Análisis</title><style>body{font-family:Arial,sans-serif;padding:40px;font-size:12px;line-height:1.5;color:#333;}h1,h2,h3{color:#2c3e50;}table{width:100%;border-collapse:collapse;margin:15px 0;}table,th,td{border:1px solid #ccc;}th,td{padding:6px;text-align:left;}code{background:#f4f4f4;padding:2px 4px;border-radius:4px;font-size:11px;}ul,ol{margin:10px 0 10px 20px;}hr{border:none;border-top:1px solid #ccc;margin:20px 0;} .page-break{page-break-after:always;}</style></head><body><h1>Análisis</h1>${htmlContent}</body></html>`;

    // Generar PDF de Markdown
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--single-process","--no-zygote","--disable-gpu"],
      ignoreDefaultArgs: ["--disable-extensions"],
      userDataDir: path.join(__dirname, "chrome-data")
    });
    const page = await browser.newPage();
    await page.setContent(htmlTemplate, { waitUntil: "networkidle0" });
    const newPdfBytes = await page.pdf({ format: "letter", printBackground: true, margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" }, displayHeaderFooter: true, headerTemplate: '<div style="font-size:12px;width:100%;text-align:center;"></div>', footerTemplate: '<div style="font-size:12px;width:100%;text-align:center;padding:10px;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>' });
    await browser.close();

    // Combinar PDFs
    const originalPdf = await PDFDocument.load(existingPdfBytes);
    const markdownPdf = await PDFDocument.load(newPdfBytes);
    const markdownPages = await originalPdf.copyPages(markdownPdf, markdownPdf.getPageIndices());
    markdownPages.forEach(p => originalPdf.addPage(p));
    const finalPdfBytes = await originalPdf.save();
    const editedName = latestName.replace(/\.pdf$/, '') + '-Análisis_IA_Rebeca_Insights.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${editedName}"`);
    res.send(Buffer.from(finalPdfBytes));

    // Limpieza
    fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.pdf')).forEach(f => fs.unlinkSync(path.join(REPORTS_DIR, f)));
  } catch (err) {
    console.error('❌ Error editando PDF:', err);
    res.status(500).json({ error: 'Error editando PDF', details: err.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => console.log(`🚀 Servidor escuchando en FTP http://localhost:${PORT}`));
