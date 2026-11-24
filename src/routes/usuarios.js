// Gestión de usuarios con auditoría (UTN-04)
// Leer: cualquier usuario con sesión. Crear/editar/borrar: solo SuperAdmin (UTN-06).
const express = require('express');
const argon2 = require('argon2');
const db = require('../db');
const { soloSuperAdmin } = require('../middleware/permisos');
const { registrar } = require('../services/bitacora');
const v = require('../services/validacion');

const router = express.Router();

async function listarRoles() {
  const { rows } = await db.query('SELECT id, nombre FROM roles ORDER BY id');
  return rows;
}

async function buscarUsuario(id) {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.identificacion, u.nombre, u.correo, u.rol_id, u.activo, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Lee y valida el formulario. En edición la contraseña es opcional.
async function leerFormulario(body, esNuevo) {
  const datos = {
    username: v.texto(body.username),
    identificacion: v.texto(body.identificacion),
    nombre: v.texto(body.nombre),
    correo: v.texto(body.correo).toLowerCase(),
    rol_id: v.entero(body.rol_id),
    activo: body.activo === 'on' || body.activo === 'true',
  };
  const password = typeof body.password === 'string' ? body.password : '';
  const errores = [];
  v.validarCampo(errores, 'usuario', datos.username, v.patrones.username,
    'El usuario debe tener de 3 a 30 letras, números, punto, guion o guion bajo.');
  v.validarCampo(errores, 'identificación', datos.identificacion, v.patrones.identificacion,
    'La identificación debe tener de 5 a 20 números, letras o guiones.');
  v.validarNombre(errores, datos.nombre);
  v.validarCampo(errores, 'correo', datos.correo, v.patrones.correo, 'El correo no es válido.');
  if (!datos.rol_id) errores.push('Seleccione un rol.');
  else {
    const { rowCount } = await db.query('SELECT 1 FROM roles WHERE id = $1', [datos.rol_id]);
    if (!rowCount) errores.push('El rol seleccionado no existe.');
  }
  if (esNuevo || password) v.validarPassword(errores, password);
  return { datos, password, errores };
}

function mensajeDuplicado(err) {
  if (err.code !== '23505') return null;
  if (err.constraint === 'usuarios_username_key') return 'Ese nombre de usuario ya existe.';
  if (err.constraint === 'usuarios_correo_key') return 'Ese correo ya está registrado.';
  if (err.constraint === 'usuarios_identificacion_key') return 'Esa identificación ya está registrada.';
  return 'Ya existe un registro con esos datos.';
}

// ---------- Lista ----------
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.nombre, u.identificacion, u.correo, u.activo, u.ultimo_login,
              r.nombre AS rol,
              COALESCE(string_agg(p.nombre, ', ' ORDER BY p.id), 'Solo lectura') AS permisos
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
         LEFT JOIN rol_permiso rp ON rp.rol_id = r.id
         LEFT JOIN permisos p ON p.id = rp.permiso_id
        GROUP BY u.id, r.nombre
        ORDER BY u.id`
    );
    res.render('usuarios/lista', { titulo: 'Usuarios', usuarios: rows, ok: req.query.ok || null });
  } catch (err) { next(err); }
});

// ---------- Crear ----------
router.get('/nuevo', soloSuperAdmin, async (req, res, next) => {
  try {
    res.render('usuarios/form', {
      titulo: 'Nuevo usuario', editar: null, errores: [], roles: await listarRoles(),
      datos: { username: '', identificacion: '', nombre: '', correo: '', rol_id: null, activo: true },
    });
  } catch (err) { next(err); }
});

router.post('/', soloSuperAdmin, async (req, res, next) => {
  try {
    const { datos, password, errores } = await leerFormulario(req.body, true);
    if (errores.length === 0) {
      try {
        const hash = await argon2.hash(password, { type: argon2.argon2id });
        const { rows } = await db.query(
          `INSERT INTO usuarios (username, identificacion, nombre, correo, password_hash, rol_id, activo)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [datos.username, datos.identificacion, datos.nombre, datos.correo, hash, datos.rol_id, datos.activo]
        );
        await registrar(req, 'USUARIO_CREADO', `Usuario ${datos.username} (id ${rows[0].id})`);
        return res.redirect('/usuarios?ok=creado');
      } catch (err) {
        const msg = mensajeDuplicado(err);
        if (!msg) throw err;
        errores.push(msg);
      }
    }
    res.status(400).render('usuarios/form', {
      titulo: 'Nuevo usuario', editar: null, errores, datos, roles: await listarRoles(),
    });
  } catch (err) { next(err); }
});

// ---------- Editar ----------
router.get('/:id/editar', soloSuperAdmin, async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    const usuario = id && (await buscarUsuario(id));
    if (!usuario) return next();
    res.render('usuarios/form', {
      titulo: 'Editar usuario', editar: usuario, errores: [], datos: usuario, roles: await listarRoles(),
    });
  } catch (err) { next(err); }
});

router.post('/:id', soloSuperAdmin, async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    const anterior = id && (await buscarUsuario(id));
    if (!anterior) return next();
    const { datos, password, errores } = await leerFormulario(req.body, false);
    if (anterior.id === req.usuario.id && (datos.rol_id !== anterior.rol_id || !datos.activo)) {
      errores.push('No puede cambiar su propio rol ni desactivarse.');
    }
    if (errores.length === 0) {
      try {
        const hash = password ? await argon2.hash(password, { type: argon2.argon2id }) : null;
        await db.query(
          `UPDATE usuarios SET username = $1, identificacion = $2, nombre = $3, correo = $4,
                  rol_id = $5, activo = $6, password_hash = COALESCE($7, password_hash)
            WHERE id = $8`,
          [datos.username, datos.identificacion, datos.nombre, datos.correo,
            datos.rol_id, datos.activo, hash, id]
        );
        if (datos.rol_id !== anterior.rol_id) {
          // UTN-09: cambio de rol, quién y cuándo
          const { rows } = await db.query('SELECT nombre FROM roles WHERE id = $1', [datos.rol_id]);
          await registrar(req, 'CAMBIO_ROL',
            `Usuario ${anterior.username}: rol ${anterior.rol} -> ${rows[0].nombre}`);
        }
        await registrar(req, 'USUARIO_EDITADO', `Usuario ${datos.username} (id ${id})${hash ? ', contraseña cambiada' : ''}`);
        return res.redirect('/usuarios?ok=editado');
      } catch (err) {
        const msg = mensajeDuplicado(err);
        if (!msg) throw err;
        errores.push(msg);
      }
    }
    res.status(400).render('usuarios/form', {
      titulo: 'Editar usuario', editar: anterior, errores, datos, roles: await listarRoles(),
    });
  } catch (err) { next(err); }
});

// ---------- Borrar ----------
async function borrarUsuario(req, id) {
  if (id === req.usuario.id) return 'No puede borrar su propio usuario.';
  const usuario = await buscarUsuario(id);
  if (!usuario) return 'El usuario no existe.';
  await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
  await registrar(req, 'USUARIO_BORRADO', `Usuario ${usuario.username} (id ${id})`);
  return null;
}

router.post('/:id/eliminar', soloSuperAdmin, async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    if (!id) return next();
    const error = await borrarUsuario(req, id);
    res.redirect(error ? '/usuarios?ok=no-borrado' : '/usuarios?ok=borrado');
  } catch (err) { next(err); }
});

module.exports = { router, borrarUsuario };
