const path = require('path');
const express = require('express');
const config = require('./config');
const seguridad = require('./middleware/seguridad');
const { middlewareSesion, controlInactividad } = require('./middleware/sesion');
const { cargarUsuario, requiereSesion } = require('./middleware/auth');
const { registrar } = require('./services/bitacora');

const app = express();

app.disable('x-powered-by');                      // no anunciar "Express"
if (config.produccion) app.set('trust proxy', 1); // Render está detrás de un proxy HTTPS

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(seguridad.encabezados);                   // UTN-08 (Daniela)

// Archivos estáticos ANTES de la sesión: pedir un .css no renueva los 60 s
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));

// Valores por defecto para todas las vistas (también las páginas de error)
app.use((req, res, next) => {
  res.locals.usuario = null;
  res.locals.csrfToken = '';
  res.locals.timeoutSegundos = config.sessionTimeoutMs / 1000;
  next();
});

app.use(middlewareSesion);                        // UTN-07c (Brandon)
app.use(controlInactividad);
app.use(seguridad.csrf);                          // UTN-07d (Daniela)
app.use(cargarUsuario);

// ---------- Rutas públicas ----------
app.use(require('./routes/auth'));

// ---------- De aquí en adelante TODO exige sesión ----------
app.use(requiereSesion);

app.get('/', (req, res) => res.render('inicio', { titulo: 'Inicio' }));

// Seguridad y administración (Daniela)
app.use('/usuarios', require('./routes/usuarios').router);
app.use('/roles', require('./routes/roles'));
app.use('/bitacora', require('./routes/bitacora'));
app.use('/api', require('./routes/api'));

// Dominio del gimnasio (Brandon)
app.use('/clientes', require('./routes/clientes'));
app.use('/membresias', require('./routes/membresias'));
app.use('/asistencia', require('./routes/asistencia'));
app.use('/reportes', require('./routes/reportes'));

// ---------- Errores (sin trazas ni datos internos) ----------
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ error: 'No encontrado' });
  res.status(404).render('error', { titulo: 'No encontrado', codigo: 404, mensaje: 'La página que busca no existe.' });
});

// eslint-disable-next-line no-unused-vars
app.use(async (err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    await registrar(req, 'CSRF_RECHAZADO', `${req.method} ${req.originalUrl}`);
    if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ error: 'Token CSRF inválido' });
    return res.status(403).render('error', {
      titulo: 'Solicitud rechazada', codigo: 403,
      mensaje: 'La solicitud fue rechazada por seguridad (token CSRF inválido o sesión vencida). Vuelva a intentarlo.',
    });
  }
  console.error(err);                              // el detalle solo queda en el servidor
  if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ error: 'Error interno' });
  res.status(500).render('error', { titulo: 'Algo salió mal', codigo: 500, mensaje: 'Ocurrió un error inesperado. Intente de nuevo.' });
});

module.exports = app;
