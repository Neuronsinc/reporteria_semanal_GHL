const express = require("express");
const path = require("path");

// Crear instancia de la aplicación
const app = express();
app.use(express.json());

// Rutas estáticas
const PUBLIC_REPORTS_DIR = path.join(__dirname, "../public-reports");
const PDF_IMAGES_DIR = path.join(__dirname, "../pdf-images");

app.use("/public-reports", express.static(PUBLIC_REPORTS_DIR));
app.use("/pdf-images", express.static(PDF_IMAGES_DIR));

// Importar y usar las rutas
const scrapeRoutes = require("./routes/scrape-routes");
const pdfRoutes = require("./routes/pdf-routes");
const extractHtmlRoutes = require("./routes/extractHtmlRoute"); // Nueva incorporación

app.use("/scrape", scrapeRoutes);
app.use("/pdf", pdfRoutes);
app.use("/extract-html", extractHtmlRoutes);

module.exports = app;