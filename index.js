const app = require("./src/app");

const PORT = 3000;

// Establecemos el puerto en la aplicación
app.set("port", PORT);

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🔥 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📌 Endpoints disponibles:`);
  console.log(`   POST /scrape        - Descargar PDF y convertir a imágenes`);
  console.log(`   POST /pdf/create    - Crear PDF desde Markdown`);
  console.log(`   POST /pdf/edit      - Editar PDF existente`);
});