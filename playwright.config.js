// Configuración de la suite de pruebas de seguridad (UTN-10)
// Un solo comando:  npm test   ->  reporte HTML en playwright-report/ y XML en test-results/
const { defineConfig } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  workers: 1,                 // en orden: las pruebas comparten la misma base de datos
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/resultados.xml' }],
  ],
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
  },
  // Si se prueba en local, levanta la app sola (npm start) si no está corriendo
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm start',
    url: BASE_URL + '/login',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
