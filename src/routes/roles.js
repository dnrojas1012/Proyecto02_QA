// Gestión de roles y asignación de permisos (UTN-05, UTN-06). Todo exige SuperAdmin.
const express = require('express');
const db = require('../db');
const { soloSuperAdmin } = require('../middleware/permisos');
const { registrar } = require('../services/bitacora');
const v = require('../services/validacion');

const router = express.Router();
router.use(soloSuperAdmin);

async function listarPermisos() {
  const { rows } = await db.query('SELECT id, codigo, nombre FROM permisos ORDER BY id');
  return rows;
}

async function buscarRol(id) {
  const { rows } = await db.query(
    `SELECT r.id, r.nombre, r.descripcion, r.es_sistema,
            COALESCE(array_agg(rp.permiso_id) FILTER (WHERE rp.permiso_id IS NOT NULL), '{}') AS permisos
       FROM roles r LEFT JOIN rol_permiso rp ON rp.rol_id = r.id
      WHERE r.id = $1 GROUP BY r.id`,
    [id]
  );
  return rows[0] || null;
}

// Convierte los checkboxes recibidos en una lista de ids de permisos válidos
function leerPermisos(body, permisosValidos) {
  const recibidos = [].concat(body.permisos || []).map(v.entero).filter(Boolean);
  const ids = new Set(permisosValidos.map((p) => p.id));
  return [...new Set(recibidos)].filter((id) => ids.has(id));
}

async function guardarPermisos(cliente, rolId, permisos) {
  await cliente.query('DELETE FROM rol_permiso WHERE rol_id = $1', [rolId]);
  for (const permisoId of permisos) {
    await cliente.query('INSERT INTO rol_permiso (rol_id, permiso_id) VALUES ($1, $2)', [rolId, permisoId]);
  }
}

function nombresPermisos(ids, permisos) {
  return permisos.filter((p) => ids.includes(p.id)).map((p) => p.codigo).join(', ') || 'ninguno';
}

// ---------- Lista ----------
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT r.id, r.nombre, r.descripcion, r.es_sistema,
              COALESCE(string_agg(p.nombre, ', ' ORDER BY p.id), 'Solo lectura') AS permisos,
              (SELECT COUNT(*)::int FROM usuarios u WHERE u.rol_id = r.id) AS usuarios
         FROM roles r
         LEFT JOIN rol_permiso rp ON rp.rol_id = r.id
         LEFT JOIN permisos p ON p.id = rp.permiso_id
        GROUP BY r.id ORDER BY r.id`
    );
    res.render('roles/lista', { titulo: 'Roles y permisos', roles: rows, ok: req.query.ok || null });
  } catch (err) { next(err); }
});

// ---------- Crear ----------
router.get('/nuevo', async (req, res, next) => {
  try {
    res.render('roles/form', {
      titulo: 'Nuevo rol', editar: null, errores: [], permisos: await listarPermisos(),
      datos: { nombre: '', descripcion: '', permisos: [] },
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const permisos = await listarPermisos().catch(next);
  if (!permisos) return;
  const datos = {
    nombre: v.texto(req.body.nombre),
    descripcion: v.texto(req.body.descripcion).slice(0, 200),
    permisos: leerPermisos(req.body, permisos),
  };
  const errores = [];
  v.validarCampo(errores, 'nombre', datos.nombre, v.patrones.nombreRol,
    'El nombre del rol debe tener de 3 a 50 letras, números o espacios.');
  if (errores.length === 0) {
    const cliente = await db.pool.connect();
    try {
      await cliente.query('BEGIN');
      const { rows } = await cliente.query(
        'INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING id', [datos.nombre, datos.descripcion]);
      await guardarPermisos(cliente, rows[0].id, datos.permisos);
      await cliente.query('COMMIT');
      await registrar(req, 'ROL_CREADO', `Rol ${datos.nombre} con permisos: ${nombresPermisos(datos.permisos, permisos)}`);
      return res.redirect('/roles?ok=creado');
    } catch (err) {
      await cliente.query('ROLLBACK');
      if (err.code !== '23505') return next(err);
      errores.push('Ya existe un rol con ese nombre.');
    } finally {
      cliente.release();
    }
  }
  res.status(400).render('roles/form', { titulo: 'Nuevo rol', editar: null, errores, datos, permisos });
});

// ---------- Editar ----------
router.get('/:id/editar', async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    const rol = id && (await buscarRol(id));
    if (!rol) return next();
    res.render('roles/form', {
      titulo: 'Editar rol', editar: rol, errores: [], datos: rol, permisos: await listarPermisos(),
    });
  } catch (err) { next(err); }
});

router.post('/:id', async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    const anterior = id && (await buscarRol(id));
    if (!anterior) return next();
    const permisos = await listarPermisos();
    const datos = {
      // Los nombres de los roles del sistema no cambian (el código depende de ellos)
      nombre: anterior.es_sistema ? anterior.nombre : v.texto(req.body.nombre),
      descripcion: v.texto(req.body.descripcion).slice(0, 200),
      // El SuperAdmin siempre conserva todos los permisos
      permisos: anterior.nombre === 'SuperAdmin' ? permisos.map((p) => p.id) : leerPermisos(req.body, permisos),
    };
    const errores = [];
    v.validarCampo(errores, 'nombre', datos.nombre, v.patrones.nombreRol,
      'El nombre del rol debe tener de 3 a 50 letras, números o espacios.');
    if (errores.length === 0) {
      const cliente = await db.pool.connect();
      try {
        await cliente.query('BEGIN');
        await cliente.query('UPDATE roles SET nombre = $1, descripcion = $2 WHERE id = $3',
          [datos.nombre, datos.descripcion, id]);
        await guardarPermisos(cliente, id, datos.permisos);
        await cliente.query('COMMIT');
      } catch (err) {
        await cliente.query('ROLLBACK');
        if (err.code !== '23505') throw err;
        errores.push('Ya existe un rol con ese nombre.');
      } finally {
        cliente.release();
      }
    }
    if (errores.length) {
      return res.status(400).render('roles/form', { titulo: 'Editar rol', editar: anterior, errores, datos, permisos });
    }
    const antes = nombresPermisos(anterior.permisos, permisos);
    const despues = nombresPermisos(datos.permisos, permisos);
    if (antes !== despues) {
      // UTN-09: cambio de permisos, quién y cuándo
      await registrar(req, 'CAMBIO_PERMISOS', `Rol ${datos.nombre}: [${antes}] -> [${despues}]`);
    }
    if (datos.nombre !== anterior.nombre) {
      await registrar(req, 'ROL_EDITADO', `Rol ${anterior.nombre} renombrado a ${datos.nombre}`);
    }
    res.redirect('/roles?ok=editado');
  } catch (err) { next(err); }
});

// ---------- Borrar ----------
router.post('/:id/eliminar', async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    const rol = id && (await buscarRol(id));
    if (!rol) return next();
    if (rol.es_sistema) return res.redirect('/roles?ok=sistema');
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM usuarios WHERE rol_id = $1', [id]);
    if (rows[0].n > 0) return res.redirect('/roles?ok=en-uso');
    await db.query('DELETE FROM roles WHERE id = $1', [id]);
    await registrar(req, 'ROL_BORRADO', `Rol ${rol.nombre} (id ${id})`);
    res.redirect('/roles?ok=borrado');
  } catch (err) { next(err); }
});

module.exports = router;
