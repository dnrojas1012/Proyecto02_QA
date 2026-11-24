// RFD-3.5 Membresías que vencen en los próximos 7 días. Exige permiso VER_REPORTES.
const express = require('express');
const db = require('../db');
const { requierePermiso } = require('../middleware/permisos');
const { DIAS_POR_VENCER } = require('../services/membresias');

const router = express.Router();

router.get('/por-vencer', requierePermiso('VER_REPORTES'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT m.id, m.codigo, c.nombre AS cliente, c.telefono, m.plan, m.fecha_vencimiento,
              m.fecha_vencimiento - CURRENT_DATE AS dias
         FROM membresias m JOIN clientes c ON c.id = m.cliente_id
        WHERE m.fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int
          -- no se listan las que ya tienen una renovación registrada
          AND NOT EXISTS (SELECT 1 FROM membresias r WHERE r.renovada_de = m.id)
        ORDER BY m.fecha_vencimiento`,
      [DIAS_POR_VENCER]
    );
    res.render('reportes/por-vencer', { titulo: 'Membresías por vencer', filas: rows, dias: DIAS_POR_VENCER });
  } catch (err) { next(err); }
});

module.exports = router;
