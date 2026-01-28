const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

// Función de delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== FUNCIÓN PARA CONVERTIR PDF A IMÁGENES ====================
async function convertPdfToImages(pdfPath, outputDir, executionId) {
  console.log("🔄 Convirtiendo PDF a imágenes...");

  try {
    const { exec } = require("child_process");
    const util = require("util");
    const execPromise = util.promisify(exec);

    // 1. Contar páginas del PDF
    console.log("📊 Contando páginas...");
    let pageCount = 1;

    try {
      const { stdout: pageCountStr } = await execPromise(
        `pdfinfo "${pdfPath}" 2>/dev/null | grep Pages | awk '{print $2}' || echo 1`
      );
      pageCount = parseInt(pageCountStr.trim()) || 1;
    } catch (countError) {
      console.log("⚠️ No se pudo contar páginas: ", countError.message);
      try {
        const pdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        pageCount = pdfDoc.getPages().length;
      } catch {
        pageCount = 1;
      }
    }

    console.log(`📄 El PDF tiene ${pageCount} páginas`);

    // 2. Convertir usando pdftoppm
    console.log("🔄 Convirtiendo con pdftoppm...");
    const baseName = `page_${executionId}`;
    try {
      await execPromise(`pdftoppm -png -r 150 "${pdfPath}" "${path.join(outputDir, baseName)}"`);
      console.log("✅ pdftoppm completado");
    } catch (pdftoppmError) {
      console.log("❌ pdftoppm falló: ", pdftoppmError.message);
      throw new Error("No se pudo convertir el PDF a imágenes");
    }

    // 3. Buscar y renombrar imágenes generadas
    const imageUrls = [];
    const files = fs
      .readdirSync(outputDir)
      .filter((f) => f.includes(baseName) && f.endsWith(".png"))
      .sort();

    console.log(`📸 Encontradas ${files.length} imágenes`);

    files.forEach((file, index) => {
      const oldPath = path.join(outputDir, file);
      const newName = `page.${executionId}.${index + 1}.png`;
      const newPath = path.join(outputDir, newName);

      try {
        fs.renameSync(oldPath, newPath);
        imageUrls.push(`/pdf-images/${executionId}/${newName}`);
        console.log(`✅ Renombrado: ${file} -> ${newName}`);
      } catch (renameError) {
        console.log(`⚠️ Error renombrando ${file}:`, renameError.message);
        imageUrls.push(`/pdf-images/${executionId}/${file}`);
      }
    });

    if (imageUrls.length === 0 && pageCount > 0) {
      console.log("⚠️ No se generaron imágenes");
    }

    return imageUrls;
  } catch (error) {
    console.error("❌ Error en conversión:", error);
    throw error;
  }
}

module.exports = {
  delay,
  convertPdfToImages,
};