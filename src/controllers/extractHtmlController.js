const puppeteer = require("puppeteer");

/**
 * Extract the relevant HTML from a webpage containing widgets and statistics.
 * 
 * @param {string} url - The URL of the webpage to scrape.
 * @returns {Object} An object containing page number and HTML snippet for each part.
 */
async function extractHtml(req, res) {
  const { reporte_url } = req.body;

  if (!reporte_url) {
    return res.status(400).json({ error: "Falta campo: reporte_url" });
  }

  console.log(`🌐 Procesando reporte desde URL: ${reporte_url}`);

  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    // Navigate to the report URL
    await page.goto(reporte_url, { waitUntil: "domcontentloaded" });

    console.log("✅ Página cargada");

    /**
     * Extract HTML content from the widgets
     */
    const extractedContent = await page.evaluate(() => {
      const widgetSelector = '[data-v-071e971a]'; // Widgets are usually wrapped with this attribute
      const widgets = document.querySelectorAll(widgetSelector);

      const widgetData = [...widgets].map((widget, index) => ({
        page: index + 1,
        html: widget.outerHTML, // Extract the full widget HTML
      }));

      return widgetData;
    });

    console.log("🔄 Extracted data:", extractedContent);

    await browser.close();

    res.json({
      success: true,
      message: "HTML extraído exitosamente",
      data: extractedContent,
    });

  } catch (error) {
    console.error("❌ Error en extracción de HTML:", error);

    if (browser) {
      await browser.close();
    }

    res.status(500).json({
      error: "Error en el proceso de extracción",
      details: error.message,
    });
  }
}

module.exports = { extractHtml };