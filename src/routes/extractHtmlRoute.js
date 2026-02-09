const express = require("express");
const { extractHtml } = require("../controllers/extractHtmlController");

const router = express.Router();

router.post("/", extractHtml); // Ruta raíz para /extract-html

module.exports = router;