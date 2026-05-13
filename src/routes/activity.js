'use strict';
/**
 * routes/activity.js
 * Responsable: Sistema
 * Gestión de activity log (registro de actividades del usuario)
 */
const router = require('express').Router();
const pool   = require('../db');
const { verifyToken } = require('../middlewares/auth');

/* GET /api/activity-log - Obtener actividad reciente del usuario */
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.query.user_id || req.user?.id;
    const limit = parseInt(req.query.limit || 20);

    if (!userId) {
      return res.status(400).json({ error: 'user_id requerido' });
    }

    const { rows } = await pool.query(
      `SELECT id, actor_id, event, entity_type, entity_id, payload, created_at
       FROM activity_log
       WHERE actor_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json(rows);
  } catch (e) {
    console.error('[activity GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* POST /api/activity-log - Crear un registro de actividad */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { event, entity_type, entity_id, payload } = req.body;
    const actor_id = req.user?.id;

    if (!actor_id || !event || !entity_type || !entity_id) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const { rows } = await pool.query(
      `INSERT INTO activity_log (actor_id, event, entity_type, entity_id, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [actor_id, event, entity_type, entity_id, JSON.stringify(payload || {})]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[activity POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
