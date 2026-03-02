// Usamos 'puppeteer-extra' en lugar del puppeteer normal
const puppeteer = require('puppeteer-extra');

// Cargamos el plugin de sigilo (Stealth)
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    console.log('🥷 Iniciando navegador en modo SIGILO...');

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: './chatgpt_session', // Tu carpeta de sesión
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--start-maximized',
            // Estos argumentos ayudan a parecer un navegador normal
            '--disable-blink-features=AutomationControlled' 
        ],
        ignoreDefaultArgs: ['--enable-automation'], // Quita la barra de "Chrome está siendo controlado..."
        defaultViewport: null
    });

    const page = await browser.newPage();

    // Establecemos un User Agent real para asegurar que nos vean como Chrome normal en Windows
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Vamos al login
    await page.goto('https://chatgpt.com/auth/login', { waitUntil: 'networkidle2' });

    console.log('⚠️  INTENTA LOGUEARTE AHORA:');
    console.log('   Si te pide verificar humano, haz clic. El modo Stealth debería permitirte pasar.');

    // Mantiene vivo el proceso
    await new Promise(() => {}); 
})();