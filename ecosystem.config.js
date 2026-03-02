module.exports = {
  apps: [
    {
      name: "scraper-n8n",
      // CAMBIO: Apuntamos a dist para usar el código optimizado
      script: "./dist/index.js", 
      cwd: "/www/wwwroot/scraper-n8n",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      
      // --- OPTIMIZACIÓN DE RECURSOS ---
      max_memory_restart: "400M", 
      
      // --- CONTROL DE BUCLES ---
      restart_delay: 5000, 
      max_restarts: 10,
      min_uptime: "20s",

      // --- LOGS Y ENTORNO ---
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      kill_timeout: 10000 
    }
  ]
};