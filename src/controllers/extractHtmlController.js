const puppeteer = require("puppeteer");

/**
 * Extract structured JSON data from GoHighLevel dashboard.
 * 
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
async function extractHtml(req, res) {
  const { reporte_url } = req.body;

  if (!reporte_url) {
    return res.status(400).json({ error: "Falta campo: reporte_url" });
  }

  console.log(`🌐 Procesando reporte desde URL: ${reporte_url}`);

  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Navegar a la URL del reporte
    await page.goto(reporte_url, { waitUntil: "networkidle2", timeout: 60000 });
    console.log("✅ Página cargada");

    // Esperar el contenido dinámico
    await page.waitForSelector('[role="region"][aria-label^="Page Number"]', { timeout: 80000 });
    
    // Esperar 3 segundos usando Promise
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("🔍 Extrayendo datos estructurados...");

    /**
     * Función de delay inyectada
     */
    await page.addScriptTag({
      content: `window.delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));`
    });

    /**
     * EXTRACCIÓN DE DATOS - EJECUTADA EN EL NAVEGADOR
     */
    const extractedData = await page.evaluate(async () => {
      const allPages = [];
      
      // Función auxiliar para hacer hover y obtener texto completo
      async function getFullTextFromHover(textElement, echartContainer) {
        try {
          const rect = textElement.getBoundingClientRect();
          
          // Disparar eventos de hover
          textElement.dispatchEvent(new MouseEvent('mouseenter', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          }));
          
          textElement.dispatchEvent(new MouseEvent('mouseover', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          }));
          
          // Esperar a que aparezca el tooltip
          await window.delay(250);
          
          // Buscar tooltip visible en el contenedor del gráfico
          let tooltips = echartContainer.querySelectorAll('div[style*="position: absolute"]');
          
          for (let tooltip of tooltips) {
            let computedStyle = window.getComputedStyle(tooltip);
            if (computedStyle.visibility === 'visible' && parseFloat(computedStyle.opacity) > 0) {
              let fullTextSpan = tooltip.querySelector('span[style*="font-weight:400"]');
              if (fullTextSpan) {
                let fullText = fullTextSpan.textContent.trim();
                
                // Limpiar hover
                textElement.dispatchEvent(new MouseEvent('mouseout', {
                  view: window,
                  bubbles: true,
                  cancelable: true
                }));
                
                await window.delay(100);
                return fullText;
              }
            }
          }
          
          // Limpiar hover si no se encontró tooltip
          textElement.dispatchEvent(new MouseEvent('mouseout', {
            view: window,
            bubbles: true,
            cancelable: true
          }));
          
          await window.delay(100);
        } catch (error) {
          console.log('Error en hover:', error);
        }
        
        return null;
      }
      
      // Función auxiliar para hacer hover en barras/puntos
      async function getDataFromHover(element, echartContainer) {
        try {
          const rect = element.getBoundingClientRect();
          
          ['mouseenter', 'mouseover', 'mousemove'].forEach(eventType => {
            element.dispatchEvent(new MouseEvent(eventType, {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2
            }));
          });
          
          await window.delay(400);
          
          let tooltips = echartContainer.querySelectorAll('div[style*="position: absolute"]');
          
          for (let tooltip of tooltips) {
            let computedStyle = window.getComputedStyle(tooltip);
            if (computedStyle.visibility === 'visible' && parseFloat(computedStyle.opacity) > 0) {
              let labelEl = tooltip.querySelector('.text-sm.text-gray-600.font-normal');
              let valueEl = tooltip.querySelector('span b');
              
              if (labelEl && valueEl) {
                let result = {
                  label: labelEl.textContent.trim(),
                  value: valueEl.textContent.trim()
                };
                
                // Limpiar hover
                element.dispatchEvent(new MouseEvent('mouseout', {
                  view: window,
                  bubbles: true,
                  cancelable: true
                }));
                
                await window.delay(150);
                return result;
              }
            }
          }
          
          // Limpiar hover
          element.dispatchEvent(new MouseEvent('mouseout', {
            view: window,
            bubbles: true,
            cancelable: true
          }));
          
          await window.delay(150);
        } catch (error) {
          console.log('Error en hover de datos:', error);
        }
        
        return null;
      }
      
      // ==================== PROCESAR CADA PÁGINA ====================
      for (let pageEl of document.querySelectorAll('[role="region"][aria-label^="Page Number"]')) {
        let pageData = {
          pageNumber: parseInt(pageEl.getAttribute('aria-label').match(/\d+/)[0]),
          reportTitle: '',
          dateRange: '',
          widgets: [],
          circularCharts: [],
          barCharts: [],
          lineCharts: [],
          tables: []
        };
        
        // ========== HEADER DEL REPORTE ==========
        let header = pageEl.querySelector('[role="region"][aria-label*="header"]');
        if (header) {
          pageData.reportTitle = header.querySelector('.hl-text-lg-medium')?.textContent.trim() || '';
          pageData.dateRange = header.querySelector('.hl-text-xs-regular')?.textContent.trim() || '';
        }
        
        // ========== WIDGETS (VALORES SIMPLES) ==========
        pageEl.querySelectorAll('.grid-stack-item').forEach(item => {
          let widget = {};
          
          let titleEl = item.querySelector('p[role="heading"][aria-level="3"]');
          if (!titleEl) return;
          widget.title = titleEl.textContent.trim();
          
          let widgetDateEl = item.querySelector('.hl-text-xs-regular');
          if (widgetDateEl && widgetDateEl.textContent.includes('(')) {
            widget.specificDate = widgetDateEl.textContent.trim();
          }
          
          let noDataEl = item.querySelector('.hl-empty-title');
          if (noDataEl && noDataEl.textContent.trim() === 'No Data Found') {
            widget.value = 'sin datos';
          } else {
            let valueEl = item.querySelector('svg text[text-anchor="middle"]') || 
                          item.querySelector('.hl-display-sm-semibold');
            if (valueEl) {
              widget.value = valueEl.textContent.trim();
            }
          }
          
          let trendEl = item.querySelector('.hl-text-sm-medium[style*="color: rgb(51, 178, 84)"], .hl-text-sm-medium[style*="color: rgb(255, 77, 79)"]');
          if (trendEl) {
            widget.trend = trendEl.textContent.trim();
            let trendText = item.querySelector('p[style*="color: rgb(61, 72, 82)"]');
            if (trendText) {
              widget.trendComparison = trendText.textContent.trim();
            }
          }
          
          let hasChart = item.querySelector('.vue-echarts-inner');
          let hasTable = item.querySelector('.n-data-table');
          
          if (widget.value && !hasChart && !hasTable) {
            pageData.widgets.push(widget);
          }
        });

        // ========== GRÁFICOS CIRCULARES ==========
        for (let echartContainer of pageEl.querySelectorAll('.vue-echarts-inner')) {
          let svg = echartContainer.querySelector('svg');
          if (!svg) continue;
          
          let hasCircular = Array.from(svg.querySelectorAll('path')).some(path => {
            let d = path.getAttribute('d');
            return d && /[MA]\d+.*A\d+/.test(d) && /A\d+\.\d+ \d+\.\d+ 0 [01] [01]/.test(d);
          });
          
          if (!hasCircular) continue;
          
          let chart = { breakdown: {} };
          
          let widget = echartContainer.closest('.grid-stack-item');
          if (widget) {
            let title = widget.querySelector('p[role="heading"][aria-level="3"]');
            if (title) chart.title = title.textContent.trim();
          }
          
          // Valor central
          let maxFontSize = 0;
          let centerValue = null;
          
          svg.querySelectorAll('text').forEach(text => {
            let fontSize = parseFloat(text.style.fontSize || '0');
            if (fontSize > maxFontSize) {
              maxFontSize = fontSize;
              centerValue = text;
            }
          });
          
          if (centerValue) {
            chart.totalValue = centerValue.textContent.trim();
          }
          
          // Recopilar todos los items del breakdown
          let breakdownItems = [];
          svg.querySelectorAll('text').forEach(text => {
            if (text.getAttribute('xml:space') === 'preserve' && text.getAttribute('x') === '30') {
              let txt = text.textContent.trim();
              if (txt.includes(' - ')) {
                let parts = txt.split(' - ');
                breakdownItems.push({
                  label: parts[0].trim(),
                  value: parts[1].trim(),
                  numericValue: parseInt(parts[1]) || 0,
                  textElement: text
                });
              }
            }
          });
          
          // Procesar items con hover para obtener textos completos
          if (breakdownItems.length > 0) {
            for (let item of breakdownItems) {
              let finalLabel = item.label;
              
              // Si está truncado, hacer hover
              if (item.label.includes('...')) {
                let fullText = await getFullTextFromHover(item.textElement, echartContainer);
                if (fullText && fullText.length > item.label.length) {
                  finalLabel = fullText;
                }
              }
              
              chart.breakdown[finalLabel] = item.value;
            }
          }
          
          if (Object.keys(chart.breakdown).length === 0) {
            chart.breakdown = null;
          }
          
          if (chart.title || chart.totalValue) {
            pageData.circularCharts.push(chart);
          }
        }
        
        // ========== GRÁFICOS DE BARRAS ==========
        for (let echartContainer of pageEl.querySelectorAll('.vue-echarts-inner')) {
          let svg = echartContainer.querySelector('svg');
          if (!svg) continue;
          
          let barPaths = Array.from(svg.querySelectorAll('path')).filter(path => {
            let fill = path.getAttribute('fill');
            return fill === '#1f5263' || fill === 'rgb(31,82,99)' || fill === '#376879' || fill === '#003d4d';
          });
          
          let isCircular = barPaths.some(path => {
            let d = path.getAttribute('d');
            return d && /A\d+\.\d+ \d+\.\d+ 0 [01] [01]/.test(d);
          });
          
          if (isCircular || barPaths.length === 0) continue;
          
          let chart = { data: {} };
          
          let widget = echartContainer.closest('.grid-stack-item');
          if (widget) {
            let title = widget.querySelector('p[role="heading"][aria-level="3"]');
            if (title) chart.title = title.textContent.trim();
          }
          
          // Hacer hover en cada barra
          for (let bar of barPaths) {
            let result = await getDataFromHover(bar, echartContainer);
            if (result) {
              chart.data[result.label] = result.value;
            }
          }
          
          if (Object.keys(chart.data).length > 0 && chart.title) {
            pageData.barCharts.push(chart);
          }
        }
        
        // ========== GRÁFICOS DE LÍNEAS ==========
        for (let echartContainer of pageEl.querySelectorAll('.vue-echarts-inner')) {
          let svg = echartContainer.querySelector('svg');
          if (!svg) continue;
          
          let linePoints = Array.from(svg.querySelectorAll('path')).filter(path => {
            let d = path.getAttribute('d');
            let stroke = path.getAttribute('stroke');
            let fill = path.getAttribute('fill');
            
            return d && d.includes('M1 0A1 1 0 1 1 1 -0.0001') &&
                   (stroke === '#1f5263' || stroke === 'rgb(31,82,99)') &&
                   (fill === '#fff' || fill === 'rgb(255,255,255)');
          });
          
          if (linePoints.length === 0) continue;
          
          let chart = { data: {} };
          
          let widget = echartContainer.closest('.grid-stack-item');
          if (widget) {
            let title = widget.querySelector('p[role="heading"][aria-level="3"]');
            if (title) chart.title = title.textContent.trim();
          }
          
          // Hacer hover en cada punto
          for (let point of linePoints) {
            let result = await getDataFromHover(point, echartContainer);
            if (result) {
              chart.data[result.label] = result.value;
            }
          }
          
          if (Object.keys(chart.data).length > 0 && chart.title) {
            pageData.lineCharts.push(chart);
          }
        }
        
        // ========== TABLAS ==========
        pageEl.querySelectorAll('.n-data-table').forEach(tableContainer => {
          let table = {};
          
          let widget = tableContainer.closest('.grid-stack-item');
          if (widget) {
            let title = widget.querySelector('p[role="heading"][aria-level="3"]');
            if (title) table.title = title.textContent.trim();
          }
          
          let headers = [];
          tableContainer.querySelectorAll('.n-data-table-thead th').forEach(th => {
            let headerText = th.querySelector('.max-w-xs.truncate')?.textContent.trim();
            if (headerText) headers.push(headerText);
          });
          
          table.headers = headers;
          
          let rows = [];
          tableContainer.querySelectorAll('.n-data-table-tbody tr').forEach(tr => {
            let row = {};
            tr.querySelectorAll('td').forEach((cell, index) => {
              if (index < headers.length) {
                let cellText = cell.querySelector('.max-w-xs.truncate')?.textContent.trim() || 
                              cell.textContent.trim();
                row[headers[index]] = cellText;
              }
            });
            rows.push(row);
          });
          
          table.data = rows;
          
          if (table.title && rows.length > 0) {
            pageData.tables.push(table);
          }
        });
        
        allPages.push(pageData);
      }
      
      return allPages;
    });

    await browser.close();

    console.log(`✅ Extracción completada: ${extractedData.length} páginas procesadas`);
    
    // Mostrar resumen
    extractedData.forEach(page => {
      console.log(`  Página ${page.pageNumber}:`);
      console.log(`    - Widgets: ${page.widgets.length}`);
      console.log(`    - Gráficos circulares: ${page.circularCharts.length}`);
      console.log(`    - Gráficos de barras: ${page.barCharts.length}`);
      console.log(`    - Gráficos de líneas: ${page.lineCharts.length}`);
      console.log(`    - Tablas: ${page.tables.length}`);
    });

    res.json({
      success: true,
      message: "Datos extraídos exitosamente",
      totalPages: extractedData.length,
      data: extractedData,
    });

  } catch (error) {
    console.error("❌ Error en extracción de datos:", error);

    if (browser) {
      await browser.close();
    }

    res.status(500).json({
      error: "Error en el proceso de extracción",
      details: error.message,
    });
  }
}

module.exports = { extractHtml };