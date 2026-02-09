const puppeteer = require("puppeteer");

/**
 * Extract HTML relevant to widgets and statistics from a webpage.
 * 
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
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
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    // Navegar a la URL del reporte
    await page.goto(reporte_url, { waitUntil: "networkidle2" });

    console.log("✅ Página cargada");

    /**
     * Esperar el contenido dinámico (si aplica)
     */
    await page.waitForSelector('[data-v-071e971a]', { timeout: 80000 }).catch(() => {
      console.log("⚠️ No se encontraron elementos con el selector específico. Intentando extraer todo el HTML visible.");
    });

    /**
     * Extraer datos específicos o todo el HTML si no hay matches visibles.
     */
    const extractedContent = await page.evaluate(() => {
      const widgetSelector = '[data-v-071e971a]';
      const widgets = document.querySelectorAll(widgetSelector);

      // Si no se encuentran widgets, devolver el HTML completo
      if (widgets.length === 0) {
        return {
          fullHtml: document.documentElement.outerHTML, // Todo el HTML visible
          warning: "No se encontraron widgets específicos. Se retornó el HTML completo.",
        };
      }

      // Mapear los widgets específicos y devolver su HTML
      const widgetData = [...widgets].map((widget, index) => ({
        page: index + 1,
        html: widget.outerHTML, // Extract the full widget HTML
      }));

      return {
        widgets: widgetData,
        totalWidgets: widgetData.length,
      };
    });

    console.log("🔄 Datos extraídos:", extractedContent);

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