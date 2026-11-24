// Registro de auditoría (UTN-09)
const db = require('../db');

async function registrar(req, evento, detalle = '', usuarioForzado = null) {
  const usuario = usuarioForzado || req.usuario || null;
  try {
    await db.query(
      `INSERT INTO bitacora (evento, usuario_id, username, ip, ruta, detalle)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        evento,
        usuario ? usuario.id : null,
        usuario ? usuario.username : null,
        req.ip,
        req.originalUrl.slice(0, 255),
        String(detalle).slice(0, 500),
      ]
    );
  } catch (err) {
    // La bitácora nunca debe tumbar la petición; se deja rastro en consola.
    console.error('No se pudo escribir en la bitácora:', err.message);
  }
}

module.exports = { registrar };
