// Inicio y cierre de sesión (UTN-02, UTN-04, UTN-09)
const express = require('express');
const argon2 = require('argon2');
const db = require('../db');
const { registrar } = require('../services/bitacora');

const router = express.Router();

// Hash ficticio: si el usuario no existe igual se ejecuta argon2.verify,
// así la respuesta tarda lo mismo y no se puede adivinar qué usuarios existen.
const HASH_FICTICIO =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$Vt6WzqVwJ7tQmYwqzG8b0B9n0VQ8xg3nq3cQ4oQb1Yk';

router.get('/login', (req, res) => {
  if (req.usuario) return res.redirect('/');
  res.render('login', {
    titulo: 'Iniciar sesión',
    error: null,
    expirada: req.query.expirada === '1',
    username: '',
  });
});

router.post('/login', async (req, res, next) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const mostrarError = (status) =>
    res.status(status).render('login', {
      titulo: 'Iniciar sesión',
      error: 'Usuario o contraseña incorrectos.',
      expirada: false,
      username,
    });

  try {
    if (!username || !password || username.length > 30 || password.length > 128) {
      await registrar(req, 'LOGIN_FALLIDO', `Datos inválidos (usuario: ${username.slice(0, 30)})`);
      return mostrarError(400);
    }

    // Consulta parametrizada: ' OR '1'='1 se trata como texto, no como SQL
    const { rows } = await db.query(
      'SELECT id, username, password_hash, activo FROM usuarios WHERE username = $1',
      [username]
    );
    const usuario = rows[0];
    const valido = await argon2.verify(usuario ? usuario.password_hash : HASH_FICTICIO, password)
      .catch(() => false);

    if (!usuario || !valido || !usuario.activo) {
      await registrar(req, 'LOGIN_FALLIDO', `Intento con usuario: ${username}`, usuario || null);
      return mostrarError(401);
    }

    // Nuevo id de sesión al autenticarse (evita fijación de sesión)
    req.session.regenerate(async (err) => {
      if (err) return next(err);
      req.session.usuarioId = usuario.id;      // SOLO el id; ningún dato personal en la sesión
      req.session.ultimaActividad = Date.now();
      try {
        await db.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [usuario.id]);
        await registrar(req, 'LOGIN_OK', 'Inicio de sesión exitoso', usuario);
      } catch (e) {
        return next(e);
      }
      req.session.save((e) => (e ? next(e) : res.redirect('/')));
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('gym.sid');
    res.redirect('/login');
  });
});

module.exports = router;
