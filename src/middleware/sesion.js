// Sesión segura (UTN-07c)
// - La sesión vive en PostgreSQL (tabla session); la cookie solo lleva un id aleatorio firmado.
// - Se invalida tras 60 s sin actividad: cookie con maxAge + rolling y un control en el servidor.
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { pool } = require('../db');
const config = require('../config');

const middlewareSesion = session({
  store: new PgSession({ pool, tableName: 'session', pruneSessionInterval: 60 }),
  name: 'gym.sid',               // no revela la tecnología (en vez de connect.sid)
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,      // no se crean sesiones para visitantes anónimos
  rolling: true,                 // cada petición renueva los 60 s
  cookie: {
    httpOnly: true,              // JavaScript del navegador no puede leerla
    secure: config.produccion,   // solo viaja por HTTPS en producción
    sameSite: 'strict',          // el navegador no la envía desde otros sitios (ayuda contra CSRF)
    maxAge: config.sessionTimeoutMs,
  },
});

// Control extra en el servidor: aunque alguien conserve la cookie,
// si pasaron más de 60 s desde la última actividad, la sesión se destruye.
function controlInactividad(req, res, next) {
  if (!req.session || !req.session.usuarioId) return next();
  const ahora = Date.now();
  const ultima = req.session.ultimaActividad || ahora;
  if (ahora - ultima > config.sessionTimeoutMs) {
    return req.session.destroy(() => {
      res.clearCookie('gym.sid');
      res.redirect('/login?expirada=1');
    });
  }
  req.session.ultimaActividad = ahora;
  next();
}

module.exports = { middlewareSesion, controlInactividad };
