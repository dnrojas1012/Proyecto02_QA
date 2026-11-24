// Consulta de la bitácora de auditoría (UTN-09). Solo SuperAdmin.
const express = require('express');
const db = require('../db');
const { soloSuperAdmin } = require('../middleware/permisos');

const router = express.Router();
const EVENTOS = ['LOGIN_OK', 'LOGIN_FALLIDO', 'ACCESO_DENEGADO', 'CAMBIO_ROL', 'CAMBIO_PERMISOS',
  'ROL_CREADO', 'ROL_EDITADO', 'ROL_BORRADO', 'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_BORRADO'];

router.get('/', soloSuperAdmin, async (req, res, next) => {
  try {
    // El filtro solo acepta valores de la lista blanca; igual va como parámetro
    const evento = EVENTOS.includes(req.query.evento) ? req.query.evento : null;
    const { rows } = await db.query(
      `SELECT fecha, evento, username, ip, ruta, detalle
         FROM bitacora
        WHERE ($1::text IS NULL OR evento = $1)
        ORDER BY fecha DESC
        LIMIT 300`,
      [evento]
    );
    res.render('bitacora', { titulo: 'Bitácora', registros: rows, eventos: EVENTOS, evento });
  } catch (err) { next(err); }
});

module.exports = router;
