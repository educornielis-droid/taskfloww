'use strict';
/**
 * routes/mensajes.js
 * Responsable: Cristina
 * Jue 1 may: GET/POST /api/mensajes
 * Mar 6 may: chat funcional conectado al frontend
 */
const router = require('express').Router();
const pool   = require('../db');
const { verifyToken } = require('../middlewares/auth');

/* GET /api/mensajes?usuario_id=&limite=50 */
router.get('/', verifyToken, async (req, res) => {
  const { usuario_id, limite } = req.query;
  try {
    let q = `
      SELECT m.*, p.full_name AS autor_nombre, p.initials AS autor_iniciales
      FROM chat_messages m
      LEFT JOIN profiles p ON p.id = m.usuario_id
      WHERE 1=1`;
    const params = [];

    if (usuario_id) {
      params.push(usuario_id);
      q += ` AND m.usuario_id = $${params.length}`;
    }

    params.push(parseInt(limite) || 50);
    q += ` ORDER BY m.fecha_hora DESC LIMIT $${params.length}`;

    const { rows } = await pool.query(q, params);
    res.json(rows.reverse()); // Orden cronológico ascendente
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/mensajes */
// Body: { usuario_id, mensaje }
router.post('/', verifyToken, async (req, res) => {
  const { usuario_id, mensaje } = req.body;
  if (!usuario_id || !mensaje) {
    return res.status(400).json({ error: 'usuario_id y mensaje son requeridos.' });
  }
  if (mensaje.trim().length === 0) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO chat_messages (usuario_id, mensaje, fecha_hora)
       VALUES ($1, $2, NOW())
       RETURNING *,
         (SELECT full_name FROM profiles WHERE id=$1) AS autor_nombre,
         (SELECT initials  FROM profiles WHERE id=$1) AS autor_iniciales`,
      [usuario_id, mensaje.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* DELETE /api/mensajes/:id — solo Admin */
router.delete('/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Solo Admin puede eliminar mensajes.' });
  }
  try {
    await pool.query('DELETE FROM chat_messages WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
