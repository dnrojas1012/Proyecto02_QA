// RFD-3.3 Control de asistencia. RN-3.2: una entrada por cliente por día.
const express = require('express');
const db = require('../db');
const { requierePermiso } = require('../middleware/permisos');
const v = require('../services/validacion');

const router = express.Router();

async function entradasDeHoy() {
  const { rows } = await db.query(
    `SELECT a.hora, c.nombre, m.codigo
       FROM asistencias a JOIN clientes c ON c.id = a.cliente_id JOIN membresias m ON m.id = a.membresia_id
      WHERE a.fecha = CURRENT_DATE ORDER BY a.hora DESC`
  );
  return rows;
}

router.get('/', async (req, res, next) => {
  try {
    res.render('asistencia/index', { titulo: 'Asistencia', entradas: await entradasDeHoy(), mensaje: null, cedula: '' });
  } catch (err) { next(err); }
});

router.post('/', requierePermiso('CREAR'), async (req, res, next) => {
  const cedula = v.texto(req.body.cedula);
  const responder = async (status, tipo, texto) =>
    res.status(status).render('asistencia/index', {
      titulo: 'Asistencia', entradas: await entradasDeHoy(), mensaje: { tipo, texto }, cedula,
    });
  try {
    if (!v.patrones.cedula.test(cedula)) return responder(400, 'error', 'Digite una cédula válida.');

    const { rows: clientes } = await db.query('SELECT id, nombre FROM clientes WHERE cedula = $1', [cedula]);
    if (!clientes[0]) return responder(404, 'error', 'No existe un cliente con esa cédula.');
    const cliente = clientes[0];

    // Membresía vigente hoy: inicio <= hoy <= vencimiento
    const { rows: vigentes } = await db.query(
      `SELECT id, codigo FROM membresias
        WHERE cliente_id = $1 AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_vencimiento LIMIT 1`,
      [cliente.id]
    );
    if (!vigentes[0]) {
      return responder(409, 'error', `Entrada rechazada: ${cliente.nombre} no tiene una membresía vigente (vencida o inexistente).`);
    }

    try {
      await db.query(
        'INSERT INTO asistencias (cliente_id, membresia_id, registrado_por) VALUES ($1, $2, $3)',
        [cliente.id, vigentes[0].id, req.usuario.id]
      );
    } catch (err) {
      // La restricción UNIQUE (cliente_id, fecha) de la BD garantiza RN-3.2
      if (err.code === '23505') return responder(409, 'error', `${cliente.nombre} ya registró su entrada hoy.`);
      throw err;
    }
    return responder(201, 'ok', `Entrada registrada: ${cliente.nombre} (membresía ${vigentes[0].codigo}).`);
  } catch (err) { next(err); }
});

module.exports = router;
