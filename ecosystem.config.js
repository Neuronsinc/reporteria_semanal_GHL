module.exports = {
  apps: [
    {
      name: "scraper-n8n",
      script: "./index.js",
      cwd: "/www/wwwroot/scraper-n8n",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      
      // --- OPTIMIZACIÓN DE RECURSOS ---
      // Reinicia si pasa de 400MB para evitar que el sistema use SWAP (disco) y se congele.
      max_memory_restart: "400M", 
      
      // --- CONTROL DE BUCLES (Importante para tu CPU) ---
      // Si la app falla, espera 5 segundos antes de reintentar. 
      // Esto evita que el CPU suba al 100% intentando arrancar mil veces.
      restart_delay: 5000, 
      
      // Si falla 10 veces seguidas, se detiene definitivamente. 
      // Es mejor que la app esté 'offline' a que el servidor esté inaccesible.
      max_restarts: 10,
      
      // Una app se considera "estable" solo si dura más de 20s encendida.
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
      
      // Si la app no responde al cierre, mátala en 10s para liberar RAM.
      kill_timeout: 10000 
    }
  ]
};