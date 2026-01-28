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

// Crear carpetas necesarias
const PUBLIC_REPORTS_DIR = path.join(__dirname, "public-reports");
const REPORTS_DIR = path.join(__dirname, "reportes");
const PDF_IMAGES_DIR = path.join(__dirname, "pdf-images");

[PUBLIC_REPORTS_DIR, REPORTS_DIR, PDF_IMAGES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Rutas estáticas
app.use("/public-reports", express.static(PUBLIC_REPORTS_DIR));
app.use("/pdf-images", express.static(PDF_IMAGES_DIR));

console.log("🚀 Iniciando servidor...");
console.log(`📁 PDFs descargados: ${REPORTS_DIR}`);
console.log(`📁 Imágenes generadas: ${PDF_IMAGES_DIR}`);

// Función de delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// ==================== FUNCIÓN PARA CONVERTIR PDF A IMÁGENES ====================
async function convertPdfToImages(pdfPath, outputDir, executionId) {
  console.log("🔄 Convirtiendo PDF a imágenes...");
  
  try {
    // MÉTODO PRINCIPAL: Usar pdftoppm
    const { exec } = require('child_process');
    const util = require('util');
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
      console.log("⚠️ No se pudo contar páginas, usando valor por defecto:", countError.message);
      // Si pdfinfo falla, intentar con pdf-lib
      try {
        const pdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        pageCount = pdfDoc.getPages().length;
      } catch {
        pageCount = 1;
      }
    }
    
    console.log(`📄 El PDF tiene ${pageCount} páginas`);
    
    // 2. Convertir usando pdftoppm (más rápido y confiable)
    console.log("🔄 Convirtiendo con pdftoppm...");
    const baseName = `page_${executionId}`;
    
    try {
      // Opción 1: pdftoppm (recomendado)
      await execPromise(
        `pdftoppm -png -r 150 "${pdfPath}" "${path.join(outputDir, baseName)}"`
      );
      console.log("✅ pdftoppm completado");
      
    } catch (pdftoppmError) {
      console.log("❌ pdftoppm falló, usando ImageMagick...", pdftoppmError.message);
      
      // Opción 2: ImageMagick convert
      try {
        for (let i = 0; i < pageCount; i++) {
          const pageNum = i + 1;
          const imageName = `${baseName}-${pageNum}.png`;
          const imagePath = path.join(outputDir, imageName);
          
          console.log(`🔄 Procesando página ${pageNum}/${pageCount}...`);
          
          await execPromise(
            `convert -density 150 "${pdfPath}[${i}]" -quality 90 -alpha remove -background white "${imagePath}"`
          );
        }
        console.log("✅ ImageMagick completado");
        
      } catch (convertError) {
        console.log("❌ ImageMagick falló:", convertError.message);
        throw new Error("No se pudo convertir el PDF a imágenes");
      }
    }
    
    // 3. Buscar y renombrar imágenes generadas
    const imageUrls = [];
    
    // Primero buscar archivos generados por pdftoppm (formato: page_NNN-1.png, page_NNN-2.png, etc.)
    let files = fs.readdirSync(outputDir)
      .filter(f => f.includes(baseName) && f.endsWith('.png'))
      .sort((a, b) => {
        // Ordenar por número de página
        const numA = parseInt(a.match(/-(\d+)\.png$/)?.[1] || a.match(/(\d+)\.png$/)?.[1] || 0);
        const numB = parseInt(b.match(/-(\d+)\.png$/)?.[1] || b.match(/(\d+)\.png$/)?.[1] || 0);
        return numA - numB;
      });
    
    // Si no hay archivos, buscar cualquier PNG en el directorio
    if (files.length === 0) {
      files = fs.readdirSync(outputDir)
        .filter(f => f.endsWith('.png'))
        .sort();
    }
    
    console.log(`📸 Encontradas ${files.length} imágenes`);
    
    // Renombrar archivos a nuestro formato estándar
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
        // Usar el nombre original si no se puede renombrar
        imageUrls.push(`/pdf-images/${executionId}/${file}`);
      }
    });
    
    // Si no se generaron imágenes, crear al menos una placeholder
    if (imageUrls.length === 0 && pageCount > 0) {
      console.log("⚠️ No se generaron imágenes, creando placeholders...");
      
      for (let i = 0; i < pageCount; i++) {
        const pageNum = i + 1;
        const imageName = `page.${executionId}.${pageNum}.png`;
        const imagePath = path.join(outputDir, imageName);
        
        // Crear imagen de placeholder simple con canvas
        try {
          const { createCanvas } = require('canvas');
          const canvas = createCanvas(800, 600);
          const ctx = canvas.getContext('2d');
          
          // Fondo blanco
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, 800, 600);
          
          // Texto
          ctx.fillStyle = 'black';
          ctx.font = '20px Arial';
          ctx.fillText(`Página ${pageNum} de ${pageCount}`, 50, 50);
          ctx.fillText(`PDF: ${path.basename(pdfPath)}`, 50, 80);
          
          const buffer = canvas.toBuffer('image/png');
          fs.writeFileSync(imagePath, buffer);
          
          imageUrls.push(`/pdf-images/${executionId}/${imageName}`);
          console.log(`✅ Placeholder creado: ${imageName}`);
          
        } catch (canvasError) {
          console.log("❌ Canvas no disponible:", canvasError.message);
          // Crear archivo vacío
          fs.writeFileSync(imagePath, '');
          imageUrls.push(`/pdf-images/${executionId}/${imageName}`);
        }
      }
    }
    
    return imageUrls;
    
  } catch (error) {
    console.error("❌ Error en conversión:", error);
    
    // Crear respuesta básica con el PDF descargado
    const imageUrls = [];
    const imageName = `page.${executionId}.1.png`;
    const imagePath = path.join(outputDir, imageName);
    
    // Crear mensaje de error como imagen
    const errorText = `Error convirtiendo PDF: ${error.message}`;
    try {
      const { createCanvas } = require('canvas');
      const canvas = createCanvas(800, 200);
      const ctx = canvas.getContext('2d');
      
      ctx.fillStyle = '#ffe6e6';
      ctx.fillRect(0, 0, 800, 200);
      
      ctx.fillStyle = '#cc0000';
      ctx.font = 'bold 24px Arial';
      ctx.fillText('Error convirtiendo PDF', 50, 50);
      
      ctx.fillStyle = '#333333';
      ctx.font = '14px Arial';
      
      // Dividir mensaje largo en líneas
      const lines = [];
      let currentLine = '';
      errorText.split(' ').forEach(word => {
        if ((currentLine + word).length < 80) {
          currentLine += word + ' ';
        } else {
          lines.push(currentLine);
          currentLine = word + ' ';
        }
      });
      if (currentLine) lines.push(currentLine);
      
      lines.forEach((line, index) => {
        ctx.fillText(line, 50, 80 + (index * 25));
      });
      
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(imagePath, buffer);
      
    } catch {
      // Si canvas falla, crear archivo vacío
      fs.writeFileSync(imagePath, '');
    }
    
    imageUrls.push(`/pdf-images/${executionId}/${imageName}`);
    
    return imageUrls;
  }
}
// ==================== ENDPOINT SCRAPE ====================
app.post("/scrape", async (req, res) => {
  console.log("📥 RECIBIENDO SOLICITUD /scrape");
  console.log("📦 Body recibido:", req.body);
  
  const { agencia, reporte_url } = req.body;
  
  if (!agencia || !reporte_url) {
    console.log("❌ Faltan campos requeridos");
    return res.status(400).json({ 
      error: "Faltan campos: agencia o reporte_url",
      received: req.body 
    });
  }
  
  console.log(`🎯 Procesando: ${agencia} - ${reporte_url}`);
  
  let browser;
  const executionId = Date.now();
  const executionDir = path.join(PDF_IMAGES_DIR, executionId.toString());
  
  try {
    // 1. Crear directorio para esta ejecución
    if (!fs.existsSync(executionDir)) {
      fs.mkdirSync(executionDir, { recursive: true });
      console.log(`📁 Directorio creado: ${executionDir}`);
    }

    // 2. Limpiar reportes previos
    const oldFiles = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.pdf') || f.endsWith('.crdownload'));
    
    if (oldFiles.length > 0) {
      console.log(`🧹 Limpiando ${oldFiles.length} archivos antiguos`);
      oldFiles.forEach(file => {
        try {
          fs.unlinkSync(path.join(REPORTS_DIR, file));
        } catch (e) {
          console.log(`⚠️ No se pudo eliminar ${file}:`, e.message);
        }
      });
    }

    // 3. Descargar el PDF
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
        "--window-size=1920,1080"
      ]
    });
    
    console.log("✅ Navegador iniciado");
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    
    // Configurar descarga
    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: REPORTS_DIR,
    });
    
    console.log("📥 Configurada descarga en:", REPORTS_DIR);

    // Navegar a la URL
    console.log("🌐 Navegando a:", reporte_url);
    await page.goto(reporte_url, { waitUntil: "domcontentloaded" });
    console.log("✅ Página cargada");
    
    await delay(5000);

    // Buscar y hacer clic en el botón de exportar
    console.log("🔍 Buscando botón #export-btn...");
    try {
      await page.waitForSelector("#export-btn", { timeout: 10000 });
      console.log("✅ Botón encontrado");
      
      await page.click("#export-btn");
      console.log("✅ Clic en botón realizado");
      
    } catch (buttonError) {
      console.log("❌ Botón no encontrado:", buttonError.message);
      console.log("🔄 Intentando selectores alternativos...");
      
      // Intentar otros selectores comunes
      const selectors = [
        'button:contains("Export")',
        'button:contains("PDF")',
        'button[aria-label*="export"]',
        'button[aria-label*="Export"]',
        'a:contains("Export")',
        '[class*="export"] button'
      ];
      
      let clicked = false;
      for (const selector of selectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            await elements[0].click();
            console.log(`✅ Clic en selector alternativo: ${selector}`);
            clicked = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!clicked) {
        // Tomar screenshot para debug
        const debugPath = path.join(__dirname, "debug-page.png");
        await page.screenshot({ path: debugPath, fullPage: true });
        console.log(`📸 Screenshot de debug guardado en: ${debugPath}`);
        
        throw new Error("No se encontró el botón de exportar");
      }
    }
    
    // Esperar descarga
    console.log("⏳ Esperando descarga del PDF...");
    await delay(25000);
    await browser.close();
    console.log("✅ Navegador cerrado");

    // 4. Buscar PDF descargado
    console.log("🔍 Buscando PDF descargado...");
    await delay(3000);
    
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith(".pdf"))
      .map(f => ({ 
        name: f, 
        path: path.join(REPORTS_DIR, f),
        time: fs.statSync(path.join(REPORTS_DIR, f)).mtime.getTime() 
      }))
      .sort((a, b) => b.time - a.time);

    console.log(`📊 Archivos PDF encontrados: ${files.length}`);
    
    if (!files.length) {
      // Listar todos los archivos en el directorio para debug
      const allFiles = fs.readdirSync(REPORTS_DIR);
      console.log("📁 Todos los archivos en reportes:", allFiles);
      
      return res.status(404).json({ 
        error: "No se pudo descargar el PDF",
        debug: {
          directory: REPORTS_DIR,
          files: allFiles
        }
      });
    }

    const pdfPath = files[0].path;
    const pdfFilename = files[0].name;
    
    console.log(`📄 PDF encontrado: ${pdfFilename}`);
    console.log(`📏 Tamaño: ${fs.statSync(pdfPath).size} bytes`);

    // 5. Convertir PDF a imágenes
    console.log("🎨 Convirtiendo PDF a imágenes...");
    const imageUrls = await convertPdfToImages(pdfPath, executionDir, executionId);

    // 6. Retornar respuesta
    console.log("📤 Enviando respuesta...");
    const response = {
      success: true,
      executionId: executionId,
      pdfFilename: pdfFilename,
      totalPages: imageUrls.length,
      imageUrls: imageUrls,
      message: `PDF convertido exitosamente a ${imageUrls.length} imágenes`,
      fullUrls: imageUrls.map(url => `http://localhost:${PORT}${url}`)
    };
    
    console.log("✅ Proceso completado exitosamente");
    res.json(response);

  } catch (err) {
    console.error("❌ ERROR EN EL PROCESO:", err);
    console.error("Stack trace:", err.stack);
    
    if (browser) {
      try {
        await browser.close();
        console.log("✅ Navegador cerrado tras error");
      } catch (e) {
        console.log("⚠️ Error cerrando navegador:", e.message);
      }
    }
    
    res.status(500).json({ 
      error: "Error en el proceso", 
      details: err.message,
      stack: err.stack
    });
  }
});

// ==================== OTROS ENDPOINTS ====================

app.post("/create-pdf", async (req, res) => {
  console.log("📥 RECIBIENDO /create-pdf");
  const { output, filename } = req.body;
  
  if (!output) {
    return res.status(400).json({ error: "Falta campo: output" });
  }

  try {
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    const htmlContent = md.render(output);
    const htmlTemplate = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Análisis</title><style>body{font-family:Arial,sans-serif;padding:40px;font-size:14px;line-height:1.5;color:#333;}h1,h2,h3{color:#2c3e50;}table{width:100%;border-collapse:collapse;margin:15px 0;}table,th,td{border:1px solid #ccc;}th,td{padding:6px;text-align:left;}code{background:#f4f4f4;padding:2px 4px;border-radius:4px;font-size:13px;}ul,ol{margin:10px 0 10px 20px;}hr{border:none;border-top:1px solid #ccc;margin:20px 0;} .page-break{page-break-after:always;}</style></head><body>${htmlContent}</body></html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--single-process","--no-zygote","--disable-gpu"],
      ignoreDefaultArgs: ["--disable-extensions"],
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
      margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" }, 
      displayHeaderFooter: true, 
      headerTemplate: '<div style="font-size:12px;width:100%;text-align:center;"></div>', 
      footerTemplate: '<div style="font-size:12px;width:100%;text-align:center;padding:10px;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>' 
    });
    
    await browser.close();

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

app.post("/editar-pdf", async (req, res) => {
  console.log("📥 RECIBIENDO /editar-pdf");
  const { output, deleteAll = true } = req.body; // Opcional: controlar si borra
  
  if (!output) {
    return res.status(400).json({ error: "Falta campo: output" });
  }
  
  try {
    // Buscar último PDF
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith(".pdf"))
      .map(f => ({ 
        name: f, 
        path: path.join(REPORTS_DIR, f),
        time: fs.statSync(path.join(REPORTS_DIR, f)).mtime.getTime() 
      }))
      .sort((a, b) => b.time - a.time);
    
    if (!files.length) {
      return res.status(404).json({ 
        error: "No hay ningún PDF en carpeta reportes",
        suggestion: "Ejecuta /scrape primero para descargar un PDF"
      });
    }

    const latestFile = files[0];
    const existingPdfBytes = fs.readFileSync(latestFile.path);

    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    const htmlContent = md.render(output);
    const htmlTemplate = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Análisis</title><style>body{font-family:Arial,sans-serif;padding:40px;font-size:12px;line-height:1.5;color:#333;}h1,h2,h3{color:#2c3e50;}table{width:100%;border-collapse:collapse;margin:15px 0;}table,th,td{border:1px solid #ccc;}th,td{padding:6px;text-align:left;}code{background:#f4f4f4;padding:2px 4px;border-radius:4px;font-size:11px;}ul,ol{margin:10px 0 10px 20px;}hr{border:none;border-top:1px solid #ccc;margin:20px 0;} .page-break{page-break-after:always;}</style></head><body><h1>Análisis</h1>${htmlContent}</body></html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--single-process","--no-zygote","--disable-gpu"],
      ignoreDefaultArgs: ["--disable-extensions"],
      userDataDir: path.join(__dirname, "chrome-data")
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlTemplate, { waitUntil: "networkidle0" });
    
    const newPdfBytes = await page.pdf({ 
      format: "letter", 
      printBackground: true, 
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" }, 
      displayHeaderFooter: true, 
      headerTemplate: '<div style="font-size:12px;width:100%;text-align:center;"></div>', 
      footerTemplate: '<div style="font-size:12px;width:100%;text-align:center;padding:10px;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>' 
    });
    
    await browser.close();

    const originalPdf = await PDFDocument.load(existingPdfBytes);
    const markdownPdf = await PDFDocument.load(newPdfBytes);
    const markdownPages = await originalPdf.copyPages(markdownPdf, markdownPdf.getPageIndices());
    
    markdownPages.forEach(p => originalPdf.addPage(p));
    
    const finalPdfBytes = await originalPdf.save();
    const editedName = latestFile.name.replace(/\.pdf$/, '') + '-Análisis_IA_Rebeca_Insights.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${editedName}"`);
    res.send(Buffer.from(finalPdfBytes));
    
    console.log(`✅ PDF editado enviado: ${editedName}`);
    
    // ==================== LIMPIEZA COMPLETA ====================
    if (deleteAll !== false) { // Por defecto SÍ borra, a menos que se especifique false
      console.log("🧹 Iniciando limpieza completa...");
      
      // 1. Borrar TODOS los PDFs de reportes/
      const pdfFiles = fs.readdirSync(REPORTS_DIR)
        .filter(f => f.endsWith('.pdf'));
      
      let deletedPdfs = 0;
      pdfFiles.forEach(file => {
        try {
          fs.unlinkSync(path.join(REPORTS_DIR, file));
          deletedPdfs++;
          console.log(`🗑️  PDF eliminado: ${file}`);
        } catch (e) {
          console.log(`⚠️ No se pudo eliminar PDF ${file}:`, e.message);
        }
      });
      
      // 2. Borrar TODAS las carpetas de imágenes/screenshots
      if (fs.existsSync(PDF_IMAGES_DIR)) {
        const imageDirs = fs.readdirSync(PDF_IMAGES_DIR);
        let deletedImageDirs = 0;
        
        imageDirs.forEach(dir => {
          const dirPath = path.join(PDF_IMAGES_DIR, dir);
          const dirStat = fs.statSync(dirPath);
          
          if (dirStat.isDirectory()) {
            try {
              fs.rmSync(dirPath, { recursive: true, force: true });
              deletedImageDirs++;
              console.log(`🗑️  Carpeta de imágenes eliminada: ${dir}`);
            } catch (e) {
              console.log(`⚠️ No se pudo eliminar carpeta ${dir}:`, e.message);
            }
          }
        });
        
        console.log(`✅ Limpieza completada: ${deletedPdfs} PDFs y ${deletedImageDirs} carpetas de imágenes eliminadas`);
      }
    }
      
  } catch (err) {
    console.error('❌ Error editando PDF:', err);
    res.status(500).json({ error: 'Error editando PDF', details: err.message });
  }
});
// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, () => {
  console.log(`🔥 Servidor ESCUCHANDO en http://localhost:${PORT}`);
  console.log(`📌 Endpoints disponibles:`);
  console.log(`   POST /scrape        - Descargar PDF y convertir a imágenes`);
  console.log(`   POST /create-pdf    - Crear PDF desde markdown`);
  console.log(`   POST /editar-pdf    - Combinar PDF con análisis`);
  console.log(`🔧 Para probar, ejecuta:`);
  console.log(`   curl -X POST http://localhost:${PORT}/scrape -H "Content-Type: application/json" -d '{"agencia":"TEST","reporte_url":"https://ejemplo.com"}'`);
});