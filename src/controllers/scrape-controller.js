const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { delay } = require("./utils");

const REPORTS_DIR = path.join(__dirname, "../../reportes");

// SEGURO DE CONCURRENCIA: Solo permite 1 proceso a la vez
let isBusy = false;

async function scrape(req, res) {
  // Si ya hay un proceso, rechaza los nuevos para proteger el CPU
  if (isBusy) {
    console.log("⚠️ SERVIDOR OCUPADO: Rechazando petición para evitar saturación.");
    return res.status(429).json({
      success: false,
      error: "Servidor procesando otro PDF. Intenta en 1 minuto."
    });
  }

  const { agencia, reporte_url } = req.body;
  if (!agencia || !reporte_url) {
    return res.status(400).json({ error: "Faltan campos: agencia o reporte_url" });
  }

  console.log(`🎯 Iniciando descarga única para: ${agencia}`);
  isBusy = true; // Bloqueamos el servidor
  let browser;

  try {
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

    // Limpiar PDFs viejos para no confundir el archivo final
    fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith(".pdf") || f.endsWith(".crdownload"))
      .forEach(f => fs.unlinkSync(path.join(REPORTS_DIR, f)));

    browser = await puppeteer.launch({
      headless: "new", // Usa el nuevo modo headless más estable
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
        "--no-zygote",
        "--disable-gpu",
        "--window-size=1920,1080", // Fuerza un tamaño de pantalla de escritorio
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" // Imita a un usuario real
      ],
    });

    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: REPORTS_DIR,
    });

    await page.goto(reporte_url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(8000);

    console.log("🔍 Clic en exportar...");
    await page.waitForSelector("#export-btn", { timeout: 15000 });
    await page.click("#export-btn");

    // Tiempo para que el navegador termine de escribir el archivo en disco
    console.log("⏳ Descargando...");
    await delay(25000);

    await browser.close();
    console.log("✅ Navegador cerrado.");

    // Buscar el archivo descargado
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith(".pdf"))
      .map(f => ({ name: f, path: path.join(REPORTS_DIR, f), time: fs.statSync(path.join(REPORTS_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (!files.length) throw new Error("El PDF no se encontró tras la descarga");

    res.json({
      success: true,
      message: "PDF descargado correctamente",
      pdfFilename: files[0].name,
      agencia: agencia
    });

  } catch (err) {
    console.error("❌ ERROR EN SCRAPE:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    isBusy = false; // LIBERAMOS el servidor para la siguiente petición
    console.log("🔓 Servidor liberado.");
  }
}

module.exports = { scrape };