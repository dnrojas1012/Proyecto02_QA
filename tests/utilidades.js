// Funciones de apoyo para las pruebas
const USUARIOS = {
  admin: { username: 'admin', password: 'Admin#Gym2026' },
  auditor: { username: 'auditor', password: 'Auditor#Gym2026' },
  recepcion: { username: 'recepcion', password: 'Recepcion#Gym2026' },
};

// Inicia sesión desde el formulario, como lo haría una persona
async function iniciarSesion(page, quien) {
  const u = USUARIOS[quien];
  await page.goto('/login');
  await page.fill('#username', u.username);
  await page.fill('#password', u.password);
  await page.click('#btn-ingresar');
  await page.waitForURL((url) => url.pathname === '/');
}

// Lee el token anti-CSRF que la página publica en <meta name="csrf-token">
async function tokenCsrf(page) {
  return page.locator('meta[name="csrf-token"]').getAttribute('content');
}

// Registra si aparece algún alert(): si aparece, el XSS funcionó
function vigilarAlertas(page) {
  const estado = { hubo: false };
  page.on('dialog', async (d) => { estado.hubo = true; await d.dismiss(); });
  return estado;
}

module.exports = { USUARIOS, iniciarSesion, tokenCsrf, vigilarAlertas };
