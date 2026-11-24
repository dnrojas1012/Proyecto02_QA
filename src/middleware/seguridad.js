// Protecciones transversales: encabezados HTTP (UTN-08) y CSRF (UTN-07d)
const helmet = require('helmet');
const { csrfSync } = require('csrf-sync');
const config = require('../config');

// ---------- UTN-08: encabezados HTTP ----------
const encabezados = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],          // sin scripts en línea ni de otros dominios: frena XSS
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],     // nadie puede meter la app en un iframe
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  frameguard: { action: 'deny' },     // X-Frame-Options: DENY
  noSniff: true,                      // X-Content-Type-Options: nosniff
  referrerPolicy: { policy: 'same-origin' },
  // Strict-Transport-Security solo cuando hay HTTPS (producción)
  strictTransportSecurity: config.produccion ? { maxAge: 31536000, includeSubDomains: true } : false,
});

// ---------- UTN-07d: token anti-CSRF (patrón sincronizado) ----------
// El token se guarda en la sesión del servidor y viaja en un campo oculto _csrf
// (formularios) o en el encabezado x-csrf-token (llamadas fetch a la API).
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => (req.body && req.body._csrf) || req.headers['x-csrf-token'],
});

function csrf(req, res, next) {
  csrfSynchronisedProtection(req, res, (err) => {
    if (err) return next(err);
    res.locals.csrfToken = generateToken(req);   // disponible en todas las vistas
    next();
  });
}

module.exports = { encabezados, csrf };
