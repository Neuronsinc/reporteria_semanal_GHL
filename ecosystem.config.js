module.exports = {
  apps: [
    {
      name: "scraper-n8n",
      // CAMBIO: Apunta a la carpeta dist donde está el código procesado
      script: "./dist/index.js", 
      cron_restart: "*/20 * * * *",
      cwd: "/www/wwwroot/scraper-n8n",
      // Opcional: Recomendado para manejar errores
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};

// prueba de publiacion