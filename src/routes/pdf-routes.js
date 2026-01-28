const express = require("express");
const { createPdf, editPdf } = require("../controllers/pdf-controller");

const router = express.Router();

// Ruta para crear un PDF
router.post("/create", createPdf);

// Ruta para editar un PDF
router.post("/edit", editPdf);

module.exports = router;