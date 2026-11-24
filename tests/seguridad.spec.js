// Suite de pruebas automatizadas de seguridad - Gimnasio Seguro (UTN-10)
// Casos TC-01 a TC-10 del enunciado + 5 casos extra de control de acceso.
const { test, expect, request } = require('@playwright/test');
const { iniciarSesion, tokenCsrf, vigilarAlertas } = require('./utilidades');

test.describe('SQL Injection (UTN-07a)', () => {
  test("TC-01 Login con ' OR '1'='1 en el usuario es rechazado", async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', "' OR '1'='1");
    await page.fill('#password', "' OR '1'='1");
    await page.click('#btn-ingresar');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('.alerta.error')).toHaveText('Usuario o contraseña incorrectos.');
  });

  test('TC-02 Búsqueda con UNION SELECT no expone datos', async ({ page }) => {
    await iniciarSesion(page, 'auditor');
    const ataque = "' UNION SELECT username, password_hash FROM usuarios --";
    const resp = await page.goto('/membresias?q=' + encodeURIComponent(ataque));
    expect(resp.status()).toBe(200);                       // sin error 500
    const html = await page.content();
    expect(html).not.toContain('$argon2');                 // ningún hash expuesto
    await expect(page.locator('#resultado-busqueda')).toContainText('(0)');
  });
});

test.describe('XSS (UTN-07b)', () => {
  test('TC-03 XSS reflejado: <script> en la URL no se ejecuta', async ({ page }) => {
    const alertas = vigilarAlertas(page);
    await iniciarSesion(page, 'auditor');
    await page.goto('/membresias?q=' + encodeURIComponent('<script>alert(1)</script>'));
    await expect(page.locator('#resultado-busqueda')).toContainText('<script>alert(1)</script>'); // se ve como texto
    expect(alertas.hubo).toBe(false);
  });

  test('TC-04 XSS almacenado: <img onerror> en un campo no se ejecuta al mostrarlo', async ({ page }) => {
    const alertas = vigilarAlertas(page);
    await iniciarSesion(page, 'recepcion');
    const cedula = 'X-' + Date.now().toString().slice(-8);
    await page.goto('/clientes/nuevo');
    await page.fill('#cedula', cedula);
    await page.fill('#nombre', '<img src=x onerror=alert(1)>');
    await page.fill('#telefono', '8888-0000');
    await page.fill('#emergencia_nombre', '<script>alert(2)</script>');
    await page.fill('#emergencia_telefono', '8888-0001');
    await page.click('form[action="/clientes"] button[type=submit]');   // ojo: no el botón Salir
    await expect(page).toHaveURL(/\/clientes\?ok=creado/);
    await expect(page.locator('#tabla-clientes')).toContainText('<img src=x onerror=alert(1)>');
    expect(await page.locator('#tabla-clientes img').count()).toBe(0); // no se creó ninguna etiqueta <img>
    expect(alertas.hubo).toBe(false);
  });
});

test.describe('Sesión y cookies (UTN-07c)', () => {
  test('TC-05 La sesión se cierra tras más de 60 s de inactividad', async ({ page }) => {
    test.setTimeout(120_000);
    await iniciarSesion(page, 'recepcion');
    await page.goto('/');                                          // última actividad
    await page.waitForTimeout(62_000);                            // 62 s sin peticiones
    await page.goto('/membresias');
    await expect(page).toHaveURL(/\/login\?expirada=1/);
  });

  test('TC-09 La cookie de sesión es HttpOnly, SameSite y no lleva datos del usuario', async ({ page, context }) => {
    await iniciarSesion(page, 'recepcion');
    const cookie = (await context.cookies()).find((c) => c.name === 'gym.sid');
    expect(cookie).toBeTruthy();
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    const valor = decodeURIComponent(cookie.value).toLowerCase();
    expect(valor).not.toContain('recepcion');
    expect(valor).not.toContain('rol');
    expect(await page.evaluate(() => document.cookie)).not.toContain('gym.sid'); // JS no la ve
  });

  test('TC-11 Sin sesión ninguna ruta privada es accesible', async ({ baseURL }) => {
    const anonimo = await request.newContext({ baseURL, maxRedirects: 0 });
    for (const ruta of ['/', '/usuarios', '/clientes', '/membresias', '/roles', '/bitacora', '/reportes/por-vencer']) {
      const r = await anonimo.get(ruta);
      expect(r.status(), ruta).toBe(302);
      expect(r.headers()['location'], ruta).toMatch(/\/login/);
    }
    // Se notifica en el login por qué se le redirigió
    const login = await anonimo.get('/login?requiere=1');
    expect(await login.text()).toContain('Debe iniciar sesión');
    const api = await anonimo.get('/api/usuarios');
    expect(api.status()).toBe(401);
    await anonimo.dispose();
  });
});

test.describe('Control de acceso 403 (UTN-05, UTN-06)', () => {
  test('TC-06 Auditor entra directo a la URL de roles y recibe 403 sin trazas', async ({ page }) => {
    await iniciarSesion(page, 'auditor');
    const resp = await page.goto('/roles');
    expect(resp.status()).toBe(403);
    await expect(page.locator('h1')).toHaveText('Acceso denegado');   // mensaje claro, sin código crudo
    const html = await page.content();
    expect(html).not.toMatch(/at .*\.js:\d+/);   // sin stack trace
    expect(html).not.toContain('node_modules');
  });

  test('TC-07 Rol operativo intenta borrar un usuario por la API y recibe 403', async ({ page }) => {
    await iniciarSesion(page, 'recepcion');
    const token = await tokenCsrf(page);           // con token válido: lo que se prueba es el permiso
    const r = await page.request.delete('/api/usuarios/2', { headers: { 'x-csrf-token': token } });
    expect(r.status()).toBe(403);
    expect(await r.json()).toEqual({ error: 'Acceso denegado' });
  });

  test('TC-12 Recepción no puede ver la bitácora y el 403 queda registrado', async ({ browser }) => {
    const ctxRecepcion = await browser.newContext();
    const recepcion = await ctxRecepcion.newPage();
    await iniciarSesion(recepcion, 'recepcion');
    const resp = await recepcion.goto('/bitacora');
    expect(resp.status()).toBe(403);

    const ctxAdmin = await browser.newContext();
    const admin = await ctxAdmin.newPage();
    await iniciarSesion(admin, 'admin');
    await admin.goto('/bitacora?evento=ACCESO_DENEGADO');
    await expect(admin.locator('#tabla-bitacora tbody tr').first()).toContainText('/bitacora');
    await ctxRecepcion.close();
    await ctxAdmin.close();
  });

  test('TC-13 Auditor no puede vender una membresía (falta permiso Crear)', async ({ page }) => {
    await iniciarSesion(page, 'auditor');
    const token = await tokenCsrf(page);
    const r = await page.request.post('/membresias', {
      form: { _csrf: token, cliente_id: '1', plan: 'MENSUAL', fecha_inicio: '2027-01-01', monto: '25000' },
      maxRedirects: 0,
    });
    expect(r.status()).toBe(403);
  });

  test('TC-14 Auditor no ve el contacto de emergencia (dato sensible)', async ({ page }) => {
    await iniciarSesion(page, 'auditor');
    await page.goto('/clientes');
    const tabla = page.locator('#tabla-clientes');
    await expect(tabla).not.toContainText('8800-1001');      // teléfono de emergencia del seed
    await expect(tabla).not.toContainText('(madre)');
    await expect(tabla).toContainText('*');                   // cédulas enmascaradas
  });
});

test.describe('CSRF (UTN-07d)', () => {
  test('TC-08 Formulario modificador enviado sin token es rechazado', async ({ page }) => {
    await iniciarSesion(page, 'recepcion');
    const sinToken = await page.request.post('/asistencia', { form: { cedula: '2-0705-0505' }, maxRedirects: 0 });
    expect(sinToken.status()).toBe(403);
    const tokenFalso = await page.request.post('/asistencia', {
      form: { _csrf: 'token-inventado', cedula: '2-0705-0505' }, maxRedirects: 0,
    });
    expect(tokenFalso.status()).toBe(403);
  });
});

test.describe('Encabezados HTTP (UTN-08)', () => {
  test('TC-10 La respuesta trae CSP, X-Frame-Options y nosniff', async ({ request: req }) => {
    const r = await req.get('/login');
    const h = r.headers();
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-powered-by']).toBeUndefined();              // no revela la tecnología
  });

  test('TC-15 El mismo mensaje de error para usuario inexistente y contraseña incorrecta', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'usuario-que-no-existe');
    await page.fill('#password', 'cualquier-cosa');
    await page.click('#btn-ingresar');
    const msgInexistente = await page.locator('.alerta.error').textContent();
    await page.fill('#username', 'admin');
    await page.fill('#password', 'clave-incorrecta');
    await page.click('#btn-ingresar');
    const msgClaveMala = await page.locator('.alerta.error').textContent();
    expect(msgInexistente).toBe(msgClaveMala);              // no se puede adivinar qué usuarios existen
  });
});
