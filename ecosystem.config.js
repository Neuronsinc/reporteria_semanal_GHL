module.exports = {
  apps: [{
    name: "scraper-n8n",
    script: "index.js",
    cron_restart: "*/20 * * * *",
    cwd: "/www/wwwroot/scraper-n8n" // opcional si no lanzas desde esa carpeta
  }]
}
