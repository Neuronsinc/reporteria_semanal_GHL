const express = require("express");
const { extractHtml } = require("../controllers/extractHtmlController");

const router = express.Router();

/**
 * Define POST /extract-html route
 * The route allows extracting HTML relevant to widgets and statistics.
 */
router.post("/extract-html", extractHtml);

module.exports = router;