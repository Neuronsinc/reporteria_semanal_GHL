const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { delay, convertPdfToImages } = require("./utils");

const REPORTS_DIR = path.join(__dirname, "../../reportes");
const PDF_IMAGES_DIR = path.join(__dirname, "../../pdf-images");

async function scrape(req, res) {
  console.log("📥 RECIBIENDO SOLICITUD /scrape");
  console.log("📦 Body recibido:", req.body);

  const { agencia, reporte_url } = req.body;

  if (!agencia || !reporte_url) {
    console.log("❌ Faltan campos requeridos");
    return res.status(400).json({
      error: "Faltan campos: agencia o reporte_url",
      received: req.body,
    });
  }

  console.log(`🎯 Procesando: ${agencia} - ${reporte_url}`);

  let browser;
  const executionId = Date.now();
  const executionDir = path.join(PDF_IMAGES_DIR, executionId.toString());

  try {
    // Crear directorio para esta ejecución
    if (!fs.existsSync(executionDir)) {
      fs.mkdirSync(executionDir, { recursive: true });
      console.log(`📁 Directorio creado: ${executionDir}`);
    }

    // Limpiar reportes previos
    const oldFiles = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".pdf") || f.endsWith(".crdownload"));

    if (oldFiles.length > 0) {
      console.log(`🧹 Limpiando ${oldFiles.length} archivos antiguos`);
      oldFiles.forEach((file) => {
        try {
          fs.unlinkSync(path.join(REPORTS_DIR, file));
        } catch (e) {
          console.log(`⚠️ No se pudo eliminar ${file}:`, e.message);
        }
      });
    }

    // Descargar el PDF
    console.log("🌐 Iniciando descarga del PDF...");
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
        "--no-zygote",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
    });

    console.log("✅ Navegador iniciado");

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: REPORTS_DIR,
    });

    console.log("🌐 Navegando a:", reporte_url);
    await page.goto(reporte_url, { waitUntil: "domcontentloaded" });
    console.log("✅ Página cargada");

    await delay(8000);

    console.log("🔍 Buscando botón #export-btn...");
    try {
      await page.waitForSelector("#export-btn", { timeout: 10000 });
      console.log("✅ Botón encontrado");
      await page.click("#export-btn");
      console.log("✅ Clic en botón realizado");
    } catch (buttonError) {
      console.log("❌ Botón no encontrado:", buttonError.message);
      throw new Error("No se encontró el botón de exportar");
    }

    console.log("⏳ Esperando descarga del PDF...");
    await delay(25000);
    await browser.close();
    console.log("✅ Navegador cerrado");

    const files = fs
      .readdirSync(REPORTS_DIR)
      .filter((f) => f.endsWith(".pdf"))
      .map((f) => ({
        name: f,
        path: path.join(REPORTS_DIR, f),
        time: fs.statSync(path.join(REPORTS_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    if (!files.length) {
      return res.status(404).json({ error: "No se pudo descargar el PDF" });
    }

    const pdfPath = files[0].path;
    console.log(`📄 PDF encontrado: ${files[0].name}`);

    console.log("🎨 Convirtiendo PDF a imágenes...");
    const imageUrls = await convertPdfToImages(pdfPath, executionDir, executionId);

    res.json({
      success: true,
      executionId: executionId,
      pdfFilename: files[0].name,
      totalPages: imageUrls.length,
      imageUrls: imageUrls,
      fullUrls: imageUrls.map((url) => `http://localhost:${req.app.get("port")}${url}`),
    });
  } catch (err) {
    console.error("❌ ERROR EN EL PROCESO:", err);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.log("⚠️ Error cerrando navegador:", e.message);
      }
    }
    res.status(500).json({ error: "Error en el proceso", details: err.message });
  }
}

module.exports = {
  scrape,
};