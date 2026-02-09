const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Configuración
const CONFIG = {
  outputDir: 'dist',
  
  excludePaths: [
    'node_modules',
    'dist',
    '.git',
    '.vscode',
    '.github',
    'coverage',
    'tests',
    '__tests__',
    'test',
    'chrome-data',
    '.well-known'
  ],
  
  excludeExtensions: [
    '.json', '.md', '.txt', '.yml', '.yaml', '.xml',
    '.html', '.css', '.scss', '.less', '.png', '.jpg',
    '.jpeg', '.gif', '.svg', '.ico', '.log', '.env',
    '.pma', '.htaccess', '.user.ini',
    '.gitignore', '.editorconfig'
  ],
  
  excludeFiles: [
    'build.js',
    'webpack.config.js',
    'jest.config.js',
    '.eslintrc.js',
    '.prettierrc.js',
    'babel.config.js',
    'tsconfig.json',
    'Dockerfile',
    'docker-compose.yml'
  ]
};

// SOLO este archivo se ofuscará
const FILE_TO_OBFUSCATE = 'src/app.js';

// Configuración para MINIFICACIÓN (todos los demás .js)
const minifyOptions = {
  compress: {
    drop_console: false,
    drop_debugger: true,
    dead_code: false,
    conditionals: true,
    evaluate: true,
    booleans: true,
    loops: true,
    unused: false,
    hoist_funs: true,
    hoist_vars: false,
    if_return: true,
    join_vars: true,
    collapse_vars: true,
    reduce_vars: false
  },
  mangle: false,
  format: {
    comments: false,
    beautify: false
  }
};

// Configuración para OFUSCAR (solo app.js)
const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: false,
  debugProtection: false,
  debugProtectionInterval: 0,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: true,
  reservedNames: [
    'require', 'exports', 'module', '__dirname', '__filename',
    'global', 'process', 'Buffer', 'console', 'setTimeout',
    'setInterval', 'clearTimeout', 'clearInterval', 'module.exports',
    'Promise', 'Error', 'Object', 'Array', 'String', 'Number',
    'Boolean', 'Date', 'Math', 'JSON', 'RegExp', 'Map', 'Set'
  ],
  selfDefending: true,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  unicodeEscapeSequence: false,
  target: 'node'
};

// Función para verificar si un path debe ser excluido
function shouldExclude(filePath) {
  const basename = path.basename(filePath);
  const extname = path.extname(filePath);
  
  if (CONFIG.excludeFiles.includes(basename)) return true;
  if (CONFIG.excludeExtensions.includes(extname)) return true;
  
  for (const excludePath of CONFIG.excludePaths) {
    if (filePath.includes(excludePath)) return true;
  }
  
  return false;
}

// Función para minificar un archivo
async function minifyFile(filePath) {
  try {
    console.log(`🔧 Minificando: ${path.relative('.', filePath)}`);
    
    const content = fs.readFileSync(filePath, 'utf8');
    const minified = await minify(content, minifyOptions);
    
    if (minified.error) {
      console.warn(`⚠️  Error: ${minified.error.message}`);
      return content; // Devolver original
    }
    
    const result = minified.code;
    const originalSize = Buffer.byteLength(content);
    const processedSize = Buffer.byteLength(result);
    const reduction = originalSize > 0 ? 
      ((originalSize - processedSize) / originalSize * 100).toFixed(1) : 0;
    
    console.log(`   📊 ${reduction}% reducido`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return null;
  }
}

// Función para ofuscar un archivo
async function obfuscateFile(filePath) {
  try {
    console.log(`🛡️  OFUSCANDO: ${path.relative('.', filePath)}`);
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Primero minificar
    const minified = await minify(content, {
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
      mangle: false,
      format: { comments: false }
    });
    
    if (minified.error) throw minified.error;
    
    // Luego ofuscar
    const obfuscated = JavaScriptObfuscator.obfuscate(
      minified.code,
      obfuscatorOptions
    );
    
    const result = obfuscated.getObfuscatedCode();
    
    const originalSize = Buffer.byteLength(content);
    const processedSize = Buffer.byteLength(result);
    const reduction = originalSize > 0 ? 
      ((originalSize - processedSize) / originalSize * 100).toFixed(1) : 0;
    
    console.log(`   🎯 ${reduction}% reducido (OFUSCADO)`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error ofuscando: ${error.message}`);
    return null;
  }
}

// Función para copiar archivos
function copyFile(filePath, outputPath) {
  try {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.copyFileSync(filePath, outputPath);
    return true;
  } catch (error) {
    console.error(`❌ Error copiando: ${error.message}`);
    return false;
  }
}

// Procesar package.json
async function processPackageJson(inputPath, outputPath) {
  try {
    const packageContent = fs.readFileSync(inputPath, 'utf8');
    const packageJson = JSON.parse(packageContent);
    
    delete packageJson.devDependencies;
    delete packageJson.scripts?.build;
    delete packageJson.scripts?.dev;
    delete packageJson.scripts?.test;
    
    if (packageJson.scripts) {
      const newScripts = { start: packageJson.scripts.start || 'node index.js' };
      packageJson.scripts = newScripts;
    }
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(packageJson, null, 2));
    console.log(`📦 package.json optimizado`);
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    copyFile(inputPath, outputPath);
  }
}

// Recorrer y procesar TODOS los archivos
async function processAllFiles() {
  console.log('📁 Procesando TODOS los archivos...\n');
  
  // Procesar recursivamente
  async function scanAndProcess(currentDir, outputDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const inputPath = path.join(currentDir, item);
      const outputPath = path.join(outputDir, item);
      
      // Excluir
      if (shouldExclude(inputPath)) continue;
      
      const stats = fs.statSync(inputPath);
      
      if (stats.isDirectory()) {
        // Crear directorio en output
        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }
        // Procesar subdirectorio
        await scanAndProcess(inputPath, outputPath);
        
      } else {
        const ext = path.extname(inputPath);
        
        if (ext === '.js') {
          // VERIFICAR: ¿Es app.js?
          const isAppJs = path.relative('.', inputPath) === FILE_TO_OBFUSCATE;
          
          if (isAppJs) {
            // Ofuscar solo app.js
            const processedCode = await obfuscateFile(inputPath);
            if (processedCode !== null) {
              fs.writeFileSync(outputPath, processedCode);
            }
          } else {
            // Minificar todos los demás .js
            const processedCode = await minifyFile(inputPath);
            if (processedCode !== null) {
              fs.writeFileSync(outputPath, processedCode);
            }
          }
          
        } else if (path.basename(inputPath) === 'package.json') {
          // Procesar package.json
          await processPackageJson(inputPath, outputPath);
          
        } else {
          // Copiar todos los demás archivos
          copyFile(inputPath, outputPath);
          console.log(`📄 Copiado: ${path.relative('.', inputPath)}`);
        }
      }
    }
  }
  
  // Procesar desde la raíz
  await scanAndProcess('.', CONFIG.outputDir);
}

// Función principal
async function build() {
  console.log('🚀 Iniciando build...');
  console.log('📝 Estrategia:');
  console.log(`   - 🛡️  OFUSCAR: ${FILE_TO_OBFUSCATE}`);
  console.log('   - 🔧 MINIFICAR: Todos los demás archivos .js');
  console.log('   - 📄 COPIAR: Archivos no .js\n');
  
  const startTime = Date.now();
  
  // Limpiar dist
  if (fs.existsSync(CONFIG.outputDir)) {
    console.log('🧹 Limpiando dist anterior...');
    fs.rmSync(CONFIG.outputDir, { recursive: true, force: true });
  }
  
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  
  // Procesar TODOS los archivos
  await processAllFiles();
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎉 BUILD COMPLETADO EN ${duration}s`);
  console.log(`📁 Carpeta: ${CONFIG.outputDir}/`);
  console.log(`\n📋 Para ejecutar:`);
  console.log(`   cd ${CONFIG.outputDir}`);
  console.log('   yarn install --production');
  console.log('   yarn start');
  console.log('='.repeat(50));
  
  // Verificar estructura
  console.log('\n📂 Estructura generada:');
  const checkPaths = [
    'dist/',
    'dist/index.js',
    'dist/src/',
    'dist/src/app.js',
    'dist/src/controllers/',
    'dist/src/routes/',
    'dist/package.json'
  ];
  
  for (const checkPath of checkPaths) {
    if (fs.existsSync(checkPath)) {
      const stats = fs.statSync(checkPath);
      if (stats.isDirectory()) {
        console.log(`   📁 ${checkPath} ✓`);
      } else {
        const size = (stats.size / 1024).toFixed(2);
        console.log(`   📄 ${checkPath} (${size} KB) ✓`);
      }
    } else {
      console.log(`   ❌ ${checkPath} FALTANTE`);
    }
  }
}

// Ejecutar
build().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});