const express = require("express");
const { scrape } = require("../controllers/scrape-controller");

const router = express.Router();

// Definir la ruta para /scrape
router.post("/", scrape);

module.exports = router;