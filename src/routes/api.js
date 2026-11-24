// API JSON mínima. Usa las mismas reglas de sesión y permisos que las páginas.
const express = require('express');
const db = require('../db');
const { soloSuperAdmin } = require('../middleware/permisos');
const { borrarUsuario } = require('./usuarios');
const v = require('../services/validacion');

const router = express.Router();

router.get('/usuarios', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.nombre, r.nombre AS rol, u.ultimo_login
         FROM usuarios u JOIN roles r ON r.id = u.rol_id ORDER BY u.id`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// TC-07: un usuario que no es SuperAdmin recibe HTTP 403
router.delete('/usuarios/:id', soloSuperAdmin, async (req, res, next) => {
  try {
    const id = v.entero(req.params.id);
    if (!id) return res.status(400).json({ error: 'Id inválido' });
    const error = await borrarUsuario(req, id);
    if (error) return res.status(400).json({ error });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
