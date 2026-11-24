// Control de acceso: permisos granulares (UTN-05) y RBAC (UTN-06)
const { registrar } = require('../services/bitacora');

// Responde 403 con una página genérica (sin trazas) y lo anota en la bitácora (UTN-09)
async function denegar(req, res, motivo) {
  await registrar(req, 'ACCESO_DENEGADO', `${req.method} ${req.originalUrl} - ${motivo}`);
  const quiereJson = req.originalUrl.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';
  if (quiereJson) return res.status(403).json({ error: 'Acceso denegado' });
  return res.status(403).render('error', {
    titulo: 'Acceso denegado',
    codigo: 403,
    mensaje: 'No tiene permiso para realizar esta acción.',
  });
}

// Exige uno de los 4 permisos (CREAR, EDITAR, BORRAR, VER_REPORTES) en el rol del usuario
function requierePermiso(codigo) {
  return (req, res, next) => {
    if (req.usuario && req.usuario.permisos.includes(codigo)) return next();
    return denegar(req, res, `falta permiso ${codigo}`);
  };
}

// Exige pertenecer a alguno de los roles indicados
function requiereRol(...roles) {
  return (req, res, next) => {
    if (req.usuario && roles.includes(req.usuario.rol)) return next();
    return denegar(req, res, `rol ${req.usuario ? req.usuario.rol : 'anónimo'} no autorizado`);
  };
}

const soloSuperAdmin = requiereRol('SuperAdmin');

module.exports = { denegar, requierePermiso, requiereRol, soloSuperAdmin };
