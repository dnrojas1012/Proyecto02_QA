// RFD-3.1 Registro de clientes (CRUD).
// Dato sensible: teléfono y contacto de emergencia. Solo lo ve quien tiene permiso EDITAR.
const express = require('express');
const db = require('../db');
const { requierePermiso } = require('../middleware/permisos');
const v = require('../services/validacion');

const router = express.Router();

const puedeVerSensibles = (usuario) => usuario.permisos.includes('EDITAR');
// 2-0701-0101 -> 2-****-**01
const enmascarar = (cedula) => cedula.slice(0, 2) + cedula.slice(2, -2).replace(/[0-9A-Za-z]/g, '*') + cedula.slice(-2);

function leerFormulario(body) {
  const datos = {
    cedula: v.texto(body.cedula),
    nombre: v.texto(body.nombre),
    telefono: v.texto(body.telefono),
    emergencia_nombre: v.texto(body.emergencia_nombre),
    emergencia_telefono: v.texto(body.emergencia_telefono),
  };
  const errores = [];
  v.validarCampo(errores, 'cédula', datos.cedula, v.patrones.cedula, 'La cédula debe tener de 5 a 20 números, letras o guiones.');
  v.validarNombre(errores, datos.nombre);
  v.validarCampo(errores, 'teléfono', datos.telefono, v.patrones.telefono, 'El teléfono debe tener de 8 a 20 dígitos.');
  v.validarNombre(errores, datos.emergencia_nombre, 'contacto de emergencia');
  v.validarCampo(errores, 'teléfono de emergencia', datos.emergencia_telefono, v.patrones.telefono,
    'El teléfono de emergencia debe tener de 8 a 20 dígitos.');
  return { datos, errores };
}

const vacio = { cedula: '', nombre: '', telefono: '', emergencia_nombre: '', emergencia_telefono: '' };

// ---------- Lista ----------
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.cedula, c.nombre, c.telefono, c.emergencia_nombre, c.emergencia_telefono,
              (SELECT MAX(m.fecha_vencimiento) FROM membresias m WHERE m.cliente_id = c.id) AS vence
         FROM clientes c ORDER BY c.nombre`
    );
    const sensibles = puedeVerSensibles(req.usuario);
    const clientes = sensibles ? rows : rows.map((c) => ({
      id: c.id, nombre: c.nombre, cedula: enmascarar(c.cedula), vence: c.vence,
    }));
    res.render('clientes/lista', { titulo: 'Clientes', clientes, sensibles, ok: req.query.ok || null });
  } catch (err) { next(err); }
});

// ---------- Crear ----------
router.get('/nuevo', requierePermiso('CREAR'), (req, res) => {
  res.render('clientes/form', { titulo: 'Nuevo cliente', editar: null, errores: [], datos: vacio });
});

router.post('/', requierePermiso('CREAR'), async (req, res, next) => {
  try {
    const { datos, errores } = leerFormulario(req.body);
    if (errores.length === 0) {
      try {
        await db.query(
          `INSERT INTO clientes (cedula, nombre, telefono, emergencia_nombre, emergencia_telefono)
           VALUES ($1, $2, $3, $4, $5)`,
          [datos.cedula, datos.nombre, datos.telefono, datos.emergencia_nombre, datos.emergencia_telefono]
        );
        return res.redirect('/clientes?ok=creado');
      } catch (err) {
        if (err.code !== '23505') throw err;
        errores.push('Ya existe un cliente con esa cédula.');
      }
    }
    res.status(400).render('clientes/form', { titulo: 'Nuevo cliente', editar: null, errores, datos });
  } catch (err) { next(err); }
});

// ---------- Editar ----------
router.get('/:id/editar', requierePermiso('EDITAR'), async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    const { rows } = id ? await db.query('SELECT * FROM clientes WHERE id = $1', [id]) : { rows: [] };
    if (!rows[0]) return next();
    res.render('clientes/form', { titulo: 'Editar cliente', editar: rows[0], errores: [], datos: rows[0] });
  } catch (err) { next(err); }
});

router.post('/:id', requierePermiso('EDITAR'), async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    if (!id) return next();
    const { datos, errores } = leerFormulario(req.body);
    if (errores.length === 0) {
      try {
        const { rowCount } = await db.query(
          `UPDATE clientes SET cedula = $1, nombre = $2, telefono = $3,
                  emergencia_nombre = $4, emergencia_telefono = $5 WHERE id = $6`,
          [datos.cedula, datos.nombre, datos.telefono, datos.emergencia_nombre, datos.emergencia_telefono, id]
        );
        if (!rowCount) return next();
        return res.redirect('/clientes?ok=editado');
      } catch (err) {
        if (err.code !== '23505') throw err;
        errores.push('Ya existe un cliente con esa cédula.');
      }
    }
    res.status(400).render('clientes/form', { titulo: 'Editar cliente', editar: { id }, errores, datos });
  } catch (err) { next(err); }
});

// ---------- Borrar ----------
router.post('/:id/eliminar', requierePermiso('BORRAR'), async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    if (!id) return next();
    await db.query('DELETE FROM clientes WHERE id = $1', [id]);
    res.redirect('/clientes?ok=borrado');
  } catch (err) {
    if (err.code === '23503') return res.redirect('/clientes?ok=con-membresias'); // tiene membresías
    next(err);
  }
});

module.exports = router;
