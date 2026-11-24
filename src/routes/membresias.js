// Membresía = entidad principal (UTN-03). Venta (RFD-3.2) y renovación (RFD-3.4).
const express = require('express');
const db = require('../db');
const { requierePermiso } = require('../middleware/permisos');
const v = require('../services/validacion');
const { PLANES, DIAS_POR_VENCER, calcularVencimiento, buscarTraslape } = require('../services/membresias');

const router = express.Router();
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function listarClientes() {
  const { rows } = await db.query('SELECT id, nombre FROM clientes ORDER BY nombre');
  return rows;
}

async function hoy() {
  const { rows } = await db.query("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS hoy");
  return rows[0].hoy;
}

function leerFormulario(body) {
  const datos = {
    cliente_id: v.entero(body.cliente_id),
    plan: v.texto(body.plan).toUpperCase(),
    fecha_inicio: v.texto(body.fecha_inicio),
    monto: v.texto(body.monto).replace(',', '.'),
  };
  const errores = [];
  if (!datos.cliente_id) errores.push('Seleccione un cliente.');
  if (!PLANES[datos.plan]) errores.push('Seleccione un plan válido (mensual, trimestral o anual).');
  if (!FECHA.test(datos.fecha_inicio) || Number.isNaN(Date.parse(datos.fecha_inicio))) {
    errores.push('La fecha de inicio no es válida.');
  }
  const monto = Number(datos.monto);
  // RN-3.3: el monto debe ser mayor que cero (también lo exige un CHECK en la BD)
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(datos.monto) || !(monto > 0)) {
    errores.push('El monto debe ser un número mayor que cero (máximo 2 decimales).');
  }
  return { datos, errores };
}

// Guarda una membresía nueva o editada dentro de una transacción.
// Bloquea la fila del cliente (FOR UPDATE) para que dos ventas simultáneas no rompan RN-3.1.
async function guardar({ datos, idEditar = null, renovadaDe = null, usuarioId }) {
  const cliente = await db.pool.connect();
  try {
    await cliente.query('BEGIN');
    const existe = await cliente.query('SELECT id FROM clientes WHERE id = $1 FOR UPDATE', [datos.cliente_id]);
    if (!existe.rowCount) throw new Error('CLIENTE_NO_EXISTE');
    const vence = await calcularVencimiento(cliente, datos.fecha_inicio, datos.plan);
    const choque = await buscarTraslape(cliente, datos.cliente_id, datos.fecha_inicio, vence, idEditar);
    if (choque) {
      await cliente.query('ROLLBACK');
      return { error: `El cliente ya tiene la membresía ${choque.codigo} vigente hasta el ${choque.vence}. Solo puede tener una (RN-3.1).` };
    }
    let codigo;
    if (idEditar) {
      const r = await cliente.query(
        `UPDATE membresias SET plan = $1, fecha_inicio = $2, fecha_vencimiento = $3, monto = $4
          WHERE id = $5 RETURNING codigo`,
        [datos.plan, datos.fecha_inicio, vence, datos.monto, idEditar]
      );
      codigo = r.rows[0].codigo;
    } else {
      const r = await cliente.query(
        `INSERT INTO membresias (cliente_id, plan, fecha_inicio, fecha_vencimiento, monto, renovada_de, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING codigo`,
        [datos.cliente_id, datos.plan, datos.fecha_inicio, vence, datos.monto, renovadaDe, usuarioId]
      );
      codigo = r.rows[0].codigo;
    }
    await cliente.query('COMMIT');
    return { codigo, vence };
  } catch (err) {
    await cliente.query('ROLLBACK');
    if (err.message === 'CLIENTE_NO_EXISTE') return { error: 'El cliente no existe.' };
    throw err;
  } finally {
    cliente.release();
  }
}

// ---------- Lista y búsqueda ----------
router.get('/', async (req, res, next) => {
  try {
    const q = v.texto(req.query.q).slice(0, 50);
    // UTN-07a: el texto buscado va como parámetro ($1). ' UNION SELECT ... no se ejecuta como SQL.
    const { rows } = await db.query(
      `SELECT m.id, m.codigo, c.nombre AS cliente, m.plan, m.monto,
              m.fecha_inicio, m.fecha_vencimiento,
              CASE WHEN CURRENT_DATE < m.fecha_inicio THEN 'Futura'
                   WHEN CURRENT_DATE > m.fecha_vencimiento THEN 'Vencida'
                   WHEN m.fecha_vencimiento - CURRENT_DATE <= $2 THEN 'Por vencer'
                   ELSE 'Vigente' END AS estado
         FROM membresias m JOIN clientes c ON c.id = m.cliente_id
        WHERE $1 = '' OR m.codigo ILIKE '%' || $1 || '%' OR c.nombre ILIKE '%' || $1 || '%'
        ORDER BY m.fecha_vencimiento DESC`,
      [q, DIAS_POR_VENCER]
    );
    // UTN-07b: q se muestra con <%= %> en la vista (escapado), así <script> no se ejecuta
    res.render('membresias/lista', { titulo: 'Membresías', membresias: rows, q, ok: req.query.ok || null, codigo: req.query.codigo || null });
  } catch (err) { next(err); }
});

// ---------- Venta (crear) ----------
router.get('/nueva', requierePermiso('CREAR'), async (req, res, next) => {
  try {
    res.render('membresias/form', {
      titulo: 'Vender membresía', editar: null, errores: [], clientes: await listarClientes(),
      datos: { cliente_id: v.entero(req.query.cliente_id), plan: 'MENSUAL', fecha_inicio: await hoy(), monto: '' },
    });
  } catch (err) { next(err); }
});

router.post('/', requierePermiso('CREAR'), async (req, res, next) => {
  try {
    const { datos, errores } = leerFormulario(req.body);
    if (errores.length === 0) {
      const r = await guardar({ datos, usuarioId: req.usuario.id });
      if (!r.error) return res.redirect(`/membresias?ok=vendida&codigo=${encodeURIComponent(r.codigo)}`);
      errores.push(r.error);
    }
    res.status(400).render('membresias/form', {
      titulo: 'Vender membresía', editar: null, errores, datos, clientes: await listarClientes(),
    });
  } catch (err) { next(err); }
});

// ---------- Editar ----------
async function buscar(id) {
  const { rows } = await db.query(
    `SELECT m.id, m.codigo, m.cliente_id, m.plan, m.monto::text AS monto,
            to_char(m.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
            to_char(m.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
            m.fecha_vencimiento - CURRENT_DATE AS dias_restantes, c.nombre AS cliente
       FROM membresias m JOIN clientes c ON c.id = m.cliente_id WHERE m.id = $1`,
    [id]
  );
  return rows[0] || null;
}

router.get('/:id/editar', requierePermiso('EDITAR'), async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    const m = id && (await buscar(id));
    if (!m) return next();
    res.render('membresias/form', { titulo: `Editar membresía ${m.codigo}`, editar: m, errores: [], datos: m, clientes: await listarClientes() });
  } catch (err) { next(err); }
});

router.post('/:id', requierePermiso('EDITAR'), async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    const m = id && (await buscar(id));
    if (!m) return next();
    const { datos, errores } = leerFormulario({ ...req.body, cliente_id: String(m.cliente_id) }); // el cliente no cambia
    if (errores.length === 0) {
      const r = await guardar({ datos, idEditar: id, usuarioId: req.usuario.id });
      if (!r.error) return res.redirect('/membresias?ok=editado');
      errores.push(r.error);
    }
    res.status(400).render('membresias/form', { titulo: `Editar membresía ${m.codigo}`, editar: m, errores, datos, clientes: await listarClientes() });
  } catch (err) { next(err); }
});

// ---------- Borrar ----------
router.post('/:id/eliminar', requierePermiso('BORRAR'), async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    if (!id) return next();
    await db.query('DELETE FROM membresias WHERE id = $1', [id]);
    res.redirect('/membresias?ok=borrado');
  } catch (err) {
    if (err.code === '23503') return res.redirect('/membresias?ok=renovada-no-borra');
    next(err);
  }
});

// ---------- Renovación (RFD-3.4) ----------
// Solo si está vencida o vence en 7 días o menos. Crea una membresía nueva
// que empieza el día después del vencimiento (o hoy, si ya venció).
router.get('/:id/renovar', requierePermiso('CREAR'), async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    const m = id && (await buscar(id));
    if (!m) return next();
    res.render('membresias/renovar', { titulo: `Renovar ${m.codigo}`, m, errores: [], datos: { plan: m.plan, monto: m.monto } });
  } catch (err) { next(err); }
});

router.post('/:id/renovar', requierePermiso('CREAR'), async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    const m = id && (await buscar(id));
    if (!m) return next();
    const errores = [];
    if (m.dias_restantes > DIAS_POR_VENCER) {
      errores.push(`Solo se renueva una membresía vencida o que vence en ${DIAS_POR_VENCER} días o menos.`);
    }
    const { rows } = await db.query(
      "SELECT to_char(GREATEST(CURRENT_DATE, $1::date + 1), 'YYYY-MM-DD') AS inicio", [m.fecha_vencimiento]);
    const leido = leerFormulario({ ...req.body, cliente_id: String(m.cliente_id), fecha_inicio: rows[0].inicio });
    errores.push(...leido.errores);
    if (errores.length === 0) {
      const r = await guardar({ datos: leido.datos, renovadaDe: m.id, usuarioId: req.usuario.id });
      if (!r.error) return res.redirect(`/membresias?ok=renovada&codigo=${encodeURIComponent(r.codigo)}`);
      errores.push(r.error);
    }
    res.status(400).render('membresias/renovar', { titulo: `Renovar ${m.codigo}`, m, errores, datos: leido.datos });
  } catch (err) { next(err); }
});

module.exports = router;
