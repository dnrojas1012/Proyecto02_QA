// Autenticación: ninguna ruta privada es accesible sin sesión válida (UTN-07c)
const db = require('../db');

// Carga el usuario de la BD en cada petición (así un cambio de rol o
// permisos aplica de inmediato). En la sesión solo se guarda el id.
async function cargarUsuario(req, res, next) {
  res.locals.usuario = null;
  if (!req.session || !req.session.usuarioId) return next();
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.nombre, u.rol_id, r.nombre AS rol,
              COALESCE(array_agg(p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permisos
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
         LEFT JOIN rol_permiso rp ON rp.rol_id = r.id
         LEFT JOIN permisos p ON p.id = rp.permiso_id
        WHERE u.id = $1 AND u.activo = TRUE
        GROUP BY u.id, r.nombre`,
      [req.session.usuarioId]
    );
    if (rows.length === 0) {
      // El usuario fue borrado o desactivado: se cierra su sesión
      return req.session.destroy(() => res.redirect('/login'));
    }
    req.usuario = rows[0];
    res.locals.usuario = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

function requiereSesion(req, res, next) {
  if (req.usuario) return next();
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Sesión requerida' });
  // Si el navegador trae cookie de sesión pero ya no es válida, venció por inactividad
  const teniaCookie = (req.headers.cookie || '').includes('gym.sid=');
  return res.redirect(teniaCookie ? '/login?expirada=1' : '/login');
}

module.exports = { cargarUsuario, requiereSesion };
