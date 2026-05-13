'use strict';
/**
 * app.js — TaskFlow API principal
 * Cristina: register, login, refresh, recover, reset-password, change-password, tiempos, mensajes
 * Eduardo:  GET/PUT preferencias, PATCH mover tarea, dashboard con API, cronómetro persistente
 */
const express = require('express');
const cors    = require('cors');
const pool    = require('./db');
require('dotenv').config();

const { verifyToken, authorize } = require('./middlewares/auth');
const authRouter = require('./routes/auth');
const prefRouter = require('./routes/preferencias');
const chatRouter = require('./routes/mensajes');
const activityRouter = require('./routes/activity');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname + '/../public'));

/* HEALTH CHECK */
app.get('/api/ping', (req, res) => res.json({ ok: true, ts: new Date() }));

/* AUTH — endpoints públicos */
app.use('/api', authRouter);

/* PREFERENCIAS — protegidas con JWT */
app.use('/api/preferencias', prefRouter);

/* MENSAJES CHAT — protegidos con JWT */
app.use('/api/mensajes', chatRouter);

/* ACTIVITY LOG — protegido con JWT */
app.use('/api/activity-log', activityRouter);

/* PERFILES */
app.get('/api/perfiles', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, full_name, initials, role, organization, phone, empresa FROM profiles WHERE is_active=true ORDER BY full_name'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/perfiles/:id', verifyToken, async (req, res) => {
  const isSelf = req.user.id === req.params.id;
  const isAdmin = req.user.role === 'Admin';
  if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Solo puedes editar tu propio perfil.' });
  const { full_name, initials, phone, empresa } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE profiles SET full_name=COALESCE($1,full_name), initials=COALESCE($2,initials),
       phone=COALESCE($3,phone), empresa=COALESCE($4,empresa), updated_at=NOW()
       WHERE id=$5 RETURNING id,full_name,initials,role,organization,phone,empresa`,
      [full_name, initials, phone, empresa, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/perfiles/:id/rol', verifyToken, authorize(['Admin']), async (req, res) => {
  const { role } = req.body;
  if (!['Admin','Gerente','Empleado'].includes(role)) return res.status(400).json({ error: 'Rol inválido.' });
  try {
    const { rows } = await pool.query(
      'UPDATE profiles SET role=$1::user_role, updated_at=NOW() WHERE id=$2 RETURNING *',
      [role, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/perfiles/:id/desactivar', verifyToken, authorize(['Admin']), async (req, res) => {
  try {
    await pool.query('UPDATE profiles SET is_active=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* PROYECTOS */
app.get('/api/proyectos', verifyToken, async (req, res) => {
  try {
    let query = `
      SELECT p.*,
        (SELECT json_agg(json_build_object('id',pf.id,'full_name',pf.full_name,'initials',pf.initials,'role',pm.role))
         FROM project_members pm JOIN profiles pf ON pf.id=pm.profile_id WHERE pm.project_id=p.id) AS members
      FROM projects p
      WHERE 1=1`;

    const params = [];

    // Role-based filtering: Empleados only see projects they're members of
    if (req.user.role === 'Empleado') {
      query += ` AND p.id IN (SELECT project_id FROM project_members WHERE profile_id = $1)`;
      params.push(req.user.id);
    }
    // Admin and Gerente see all projects

    query += ` ORDER BY p.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/proyectos/:id', verifyToken, async (req, res) => {
  try {
    let query = `
      SELECT p.*,
        (SELECT json_agg(json_build_object('id',pf.id,'full_name',pf.full_name,'initials',pf.initials,'role',pm.role))
         FROM project_members pm JOIN profiles pf ON pf.id=pm.profile_id WHERE pm.project_id=p.id) AS members
      FROM projects p WHERE p.id=$1`;

    const params = [req.params.id];

    // Empleados can only view projects they're members of
    if (req.user.role === 'Empleado') {
      query += ` AND p.id IN (SELECT project_id FROM project_members WHERE profile_id = $2)`;
      params.push(req.user.id);
    }

    const { rows } = await pool.query(query, params);
    if (!rows.length) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/proyectos', verifyToken, authorize(['Admin','Gerente']), async (req, res) => {
  const { name, description, color, status, priority, start_date, end_date, created_by } = req.body;
  if (!name || !start_date || !end_date) return res.status(400).json({ error: 'Nombre, fechas son requeridos.' });
  const creatorId = created_by || req.user.id;
  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (name,description,color,status,priority,start_date,end_date,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name.trim(), description||null, color||'#2462E9', status||'Activo', priority||'Media', start_date, end_date, creatorId]
    );
    await pool.query(`INSERT INTO project_members (project_id,profile_id,role) VALUES ($1,$2,'Admin') ON CONFLICT DO NOTHING`, [rows[0].id, creatorId]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/proyectos/:id', verifyToken, authorize(['Admin','Gerente']), async (req, res) => {
  const { name, description, color, status, priority, start_date, end_date } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE projects SET name=COALESCE($1,name),description=COALESCE($2,description),
       color=COALESCE($3,color),status=COALESCE($4::project_status,status),
       priority=COALESCE($5::priority_level,priority),start_date=COALESCE($6,start_date),
       end_date=COALESCE($7,end_date),updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name,description,color,status,priority,start_date,end_date,req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/proyectos/:id', verifyToken, authorize(['Admin']), async (req, res) => {
  try { await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/proyectos/:id/miembros', verifyToken, authorize(['Admin','Gerente']), async (req, res) => {
  const { profile_id, role } = req.body;
  try {
    await pool.query(`INSERT INTO project_members (project_id,profile_id,role) VALUES ($1,$2,$3)
       ON CONFLICT (project_id,profile_id) DO UPDATE SET role=$3`, [req.params.id, profile_id, role||'Empleado']);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* TAREAS */
app.get('/api/tareas', async (req, res) => {
  const { proyecto_id, assigned_to } = req.query;
  try {
    let q = 'SELECT * FROM v_kanban_tasks WHERE 1=1';
    const p = [];
    if (proyecto_id) { p.push(proyecto_id); q += ` AND project_id=$${p.length}`; }
    if (assigned_to) { p.push(assigned_to); q += ` AND assigned_to=$${p.length}`; }
    q += ' ORDER BY due_date_iso ASC NULLS LAST, created_at ASC';
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tareas', verifyToken, async (req, res) => {
  const { project_id, title, description, column_status, priority, due_date, due_date_iso, assigned_to, created_by } = req.body;

  console.log('[POST /api/tareas] Body recibido:', JSON.stringify(req.body));
  console.log('[POST /api/tareas] User ID:', req.user.id);

  if (!project_id || !title) {
    console.log('[POST /api/tareas] Falta project_id o title');
    return res.status(400).json({ error: 'project_id y title requeridos.' });
  }

  const creatorId = created_by || req.user.id;
  const colStatus = column_status || 'todo';
  const prio = priority || 'Media';

  // Validar enums
  const validCols = ['todo','progress','review','done'];
  const validPrios = ['Alta','Media','Baja'];

  if (!validCols.includes(colStatus)) {
    console.log('[POST /api/tareas] column_status inválido:', colStatus);
    return res.status(400).json({ error: `column_status inválido: "${colStatus}" (debe ser: todo, progress, review, done)` });
  }
  if (!validPrios.includes(prio)) {
    console.log('[POST /api/tareas] priority inválido:', prio);
    return res.status(400).json({ error: `priority inválido: "${prio}" (debe ser: Alta, Media, Baja)` });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO tasks (project_id,title,description,column_status,priority,due_date,due_date_iso,assigned_to,created_by)
       VALUES ($1,$2,$3,$4::task_column,$5::priority_level,$6,$7,$8,$9) RETURNING *`,
      [project_id, title.trim(), description||null, colStatus, prio, due_date||null, due_date_iso||null, assigned_to||null, creatorId]
    );
    console.log('[POST /api/tareas] ✅ Tarea creada:', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[POST /api/tareas] ❌ ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/tareas/:id', verifyToken, async (req, res) => {
  const { title, description, column_status, priority, progress, due_date, due_date_iso, assigned_to } = req.body;
  if (req.user.role === 'Empleado' && assigned_to && assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Empleados no pueden reasignar tareas.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET title=COALESCE($1,title),description=COALESCE($2,description),
       column_status=COALESCE($3::task_column,column_status),priority=COALESCE($4::priority_level,priority),
       progress=COALESCE($5,progress),due_date=COALESCE($6,due_date),due_date_iso=COALESCE($7,due_date_iso),
       assigned_to=COALESCE($8,assigned_to),updated_at=NOW() WHERE id=$9 RETURNING *`,
      [title,description,column_status,priority,progress,due_date,due_date_iso,assigned_to,req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tarea no encontrada.' });

    const task = rows[0];
    const projectId = task.project_id;

    // ⭐ AUTO-COMPLETE: Si todas las tareas del proyecto están en 'done', cambiar proyecto a 'Completado'
    if (column_status === 'done') {
      try {
        const { rows: tasksCount } = await pool.query(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN column_status='done' THEN 1 ELSE 0 END) as done
           FROM tasks WHERE project_id=$1`,
          [projectId]
        );

        if (tasksCount.length > 0) {
          const row = tasksCount[0];
          const total = parseInt(row.total) || 0;
          const done = parseInt(row.done) || 0;

          // Si todas las tareas están completadas, cambiar proyecto a Completado
          if (total > 0 && total === done) {
            await pool.query(
              `UPDATE projects SET status='Completado', updated_at=NOW() WHERE id=$1`,
              [projectId]
            );
            console.log(`[AUTO-COMPLETE] ✅ Proyecto ${projectId} marcado como Completado (${done}/${total} tareas)`);
          }
        }
      } catch (countErr) {
        console.error('[AUTO-COMPLETE ERROR]', countErr.message);
      }
    }

    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* PATCH mover columna Kanban — Eduardo Vie 2 may / Sáb 3 may */
app.patch('/api/tareas/:id/mover', verifyToken, async (req, res) => {
  const { column_status } = req.body;
  const validCols = ['todo','progress','review','done'];
  if (!validCols.includes(column_status)) return res.status(400).json({ error: 'column_status inválido.' });
  try {
    const progreso = column_status === 'done' ? 100 : column_status === 'todo' ? 0 : null;
    const { rows } = await pool.query(
      `UPDATE tasks SET column_status=$1::task_column, progress=COALESCE($2,progress), updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [column_status, progreso, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tarea no encontrada.' });

    const task = rows[0];
    const projectId = task.project_id;

    // ⭐ AUTO-COMPLETE: Si todas las tareas del proyecto están en 'done', cambiar proyecto a 'Completado'
    if (column_status === 'done') {
      try {
        const { rows: tasksCount } = await pool.query(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN column_status='done' THEN 1 ELSE 0 END) as done
           FROM tasks WHERE project_id=$1`,
          [projectId]
        );

        if (tasksCount.length > 0) {
          const row = tasksCount[0];
          const total = parseInt(row.total) || 0;
          const done = parseInt(row.done) || 0;

          // Si todas las tareas están completadas, cambiar proyecto a Completado
          if (total > 0 && total === done) {
            await pool.query(
              `UPDATE projects SET status='Completado', updated_at=NOW() WHERE id=$1`,
              [projectId]
            );
            console.log(`[AUTO-COMPLETE] ✅ Proyecto ${projectId} marcado como Completado (${done}/${total} tareas)`);
          }
        }
      } catch (countErr) {
        console.error('[AUTO-COMPLETE ERROR]', countErr.message);
      }
    }

    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tareas/:id', verifyToken, authorize(['Admin','Gerente']), async (req, res) => {
  try { await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* COMENTARIOS */
app.get('/api/tareas/:id/comentarios', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,p.full_name AS author_name,p.initials AS author_initials
       FROM comments c JOIN profiles p ON p.id=c.author_id WHERE c.task_id=$1 ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tareas/:id/comentarios', verifyToken, async (req, res) => {
  const { author_id, content } = req.body;
  if (!author_id || !content) return res.status(400).json({ error: 'Faltan campos.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO comments (task_id,author_id,content) VALUES ($1,$2,$3)
       RETURNING *,(SELECT initials FROM profiles WHERE id=$2) AS author_initials,
                   (SELECT full_name FROM profiles WHERE id=$2) AS author_name`,
      [req.params.id, author_id, content.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/comentarios/:id', verifyToken, async (req, res) => {
  try { await pool.query('DELETE FROM comments WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* CRONÓMETRO — Cristina Jue 1 may + Eduardo Sáb 3 may */
app.get('/api/tiempos', async (req, res) => {
  const { profile_id, project_id } = req.query;
  try {
    let q = 'SELECT * FROM v_time_summary WHERE 1=1';
    const p = [];
    if (profile_id) { p.push(profile_id); q += ` AND profile_id=$${p.length}`; }
    if (project_id) { p.push(project_id); q += ` AND project_id=$${p.length}`; }
    p.push(100); q += ` ORDER BY started_at DESC LIMIT $${p.length}`;
    const { rows } = await pool.query(q, p);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Persistencia del cronómetro: elapsed_seconds calculado en BD */
app.get('/api/tiempos/activo/:profile_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tl.*, t.title AS task_title, p.name AS project_name,
              EXTRACT(EPOCH FROM (NOW()-tl.started_at))::INTEGER AS elapsed_seconds
       FROM time_logs tl JOIN tasks t ON t.id=tl.task_id JOIN projects p ON p.id=tl.project_id
       WHERE tl.profile_id=$1 AND tl.is_active=true LIMIT 1`,
      [req.params.profile_id]
    );
    res.json(rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tiempos/iniciar', verifyToken, async (req, res) => {
  const { task_id, project_id, profile_id } = req.body;
  if (!task_id || !project_id || !profile_id) return res.status(400).json({ error: 'Faltan campos.' });
  try {
    await pool.query(`UPDATE time_logs SET is_active=false,ended_at=NOW() WHERE profile_id=$1 AND is_active=true`, [profile_id]);
    const { rows } = await pool.query(
      `INSERT INTO time_logs (task_id,project_id,profile_id,started_at,is_active) VALUES ($1,$2,$3,NOW(),true) RETURNING *`,
      [task_id, project_id, profile_id]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/tiempos/detener', verifyToken, async (req, res) => {
  const { profile_id } = req.body;
  if (!profile_id) return res.status(400).json({ error: 'profile_id requerido.' });
  try {
    const { rows } = await pool.query(
      `UPDATE time_logs SET is_active=false,ended_at=NOW() WHERE profile_id=$1 AND is_active=true RETURNING *`,
      [profile_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No hay cronómetro activo.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* NOTIFICACIONES */
app.get('/api/notificaciones/:profile_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.*,p.full_name AS sender_name,p.initials AS sender_initials
       FROM notifications n LEFT JOIN profiles p ON p.id=n.sender_id
       WHERE n.recipient_id=$1 ORDER BY n.created_at DESC LIMIT 20`,
      [req.params.profile_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/notificaciones/:id/leer', verifyToken, async (req, res) => {
  try { await pool.query('UPDATE notifications SET is_read=true WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* DASHBOARD — Eduardo Sáb 3 may: métricas desde API en vez de variables locales + productividad */
app.get('/api/dashboard/:profile_id', async (req, res) => {
  const pid = req.params.profile_id;
  try {
    const [ap, pm_count, pt, hp, tm, rt, todayH, thisWeekH, lastWeekH] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM projects p JOIN project_members pm ON pm.project_id=p.id WHERE pm.profile_id=$1 AND p.status='Activo'`, [pid]),
      pool.query(`SELECT COUNT(*) FROM projects WHERE created_by=$1 AND DATE_TRUNC('month', created_at AT TIME ZONE 'UTC')=DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'UTC')`, [pid]),
      pool.query(`SELECT COUNT(*) FROM tasks WHERE column_status!='done' AND (assigned_to=$1 OR created_by=$1)`, [pid]),
      pool.query(`SELECT COUNT(*) FROM tasks WHERE column_status!='done' AND priority='Alta' AND (assigned_to=$1 OR created_by=$1)`, [pid]),
      pool.query(`SELECT tl.*,t.title AS task_title,p.name AS project_name,EXTRACT(EPOCH FROM (NOW()-tl.started_at))::INTEGER AS elapsed_seconds FROM time_logs tl JOIN tasks t ON t.id=tl.task_id JOIN projects p ON p.id=tl.project_id WHERE tl.profile_id=$1 AND tl.is_active=true LIMIT 1`, [pid]),
      pool.query(`SELECT * FROM v_kanban_tasks WHERE assigned_to=$1 AND column_status!='done' ORDER BY due_date_iso ASC NULLS LAST LIMIT 6`, [pid]),
      pool.query(`SELECT COALESCE(SUM(CASE WHEN is_active THEN EXTRACT(EPOCH FROM (NOW()-started_at)) ELSE EXTRACT(EPOCH FROM (ended_at-started_at)) END),0)::INTEGER AS seconds FROM time_logs WHERE profile_id=$1 AND DATE(started_at AT TIME ZONE 'UTC')=CURRENT_DATE`, [pid]),
      pool.query(`SELECT COALESCE(SUM(CASE WHEN is_active THEN EXTRACT(EPOCH FROM (NOW()-started_at)) ELSE EXTRACT(EPOCH FROM (ended_at-started_at)) END),0)::INTEGER AS seconds FROM time_logs WHERE profile_id=$1 AND DATE_TRUNC('week', started_at AT TIME ZONE 'UTC')=DATE_TRUNC('week', CURRENT_DATE AT TIME ZONE 'UTC')`, [pid]),
      pool.query(`SELECT COALESCE(SUM(CASE WHEN is_active THEN EXTRACT(EPOCH FROM (NOW()-started_at)) ELSE EXTRACT(EPOCH FROM (ended_at-started_at)) END),0)::INTEGER AS seconds FROM time_logs WHERE profile_id=$1 AND DATE_TRUNC('week', started_at AT TIME ZONE 'UTC')=DATE_TRUNC('week', (CURRENT_DATE-INTERVAL '7 days') AT TIME ZONE 'UTC')`, [pid])
    ]);

    const seconds_today = parseInt(todayH.rows[0]?.seconds || 0);
    const seconds_this_week = parseInt(thisWeekH.rows[0]?.seconds || 0);
    const seconds_last_week = parseInt(lastWeekH.rows[0]?.seconds || 0);

    // Calcular % de cambio en productividad
    let productivity_change = 0;
    if (seconds_last_week > 0) {
      productivity_change = Math.round(((seconds_this_week - seconds_last_week) / seconds_last_week) * 100);
    } else if (seconds_this_week > 0) {
      productivity_change = 100; // Nueva actividad esta semana
    }

    res.json({
      active_projects: parseInt(ap.rows[0]?.count || 0),
      projects_new_this_month: parseInt(pm_count.rows[0]?.count || 0),
      pending_tasks: parseInt(pt.rows[0]?.count || 0),
      high_priority_tasks: parseInt(hp.rows[0]?.count || 0),
      active_timer: tm.rows[0] || null,
      recent_tasks: rt.rows || [],
      seconds_today: seconds_today,
      seconds_this_week: seconds_this_week,
      seconds_last_week: seconds_last_week,
      productivity_change: productivity_change
    });
  } catch (e) {
    console.error('[/api/dashboard] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* DASHBOARD - Horas por día de la semana (productividad semanal) */
app.get('/api/weekly-hours/:profile_id', async (req, res) => {
  const pid = req.params.profile_id;
  try {
    const { rows } = await pool.query(`
      SELECT
        TO_CHAR(DATE(started_at AT TIME ZONE 'UTC'), 'Dy') AS day_short,
        EXTRACT(DOW FROM started_at AT TIME ZONE 'UTC')::INTEGER AS day_order,
        COALESCE(SUM(CASE WHEN is_active THEN EXTRACT(EPOCH FROM (NOW()-started_at)) ELSE EXTRACT(EPOCH FROM (ended_at-started_at)) END),0)::INTEGER AS seconds
      FROM time_logs
      WHERE profile_id=$1
        AND DATE_TRUNC('week', started_at AT TIME ZONE 'UTC') = DATE_TRUNC('week', CURRENT_DATE AT TIME ZONE 'UTC')
      GROUP BY DATE(started_at AT TIME ZONE 'UTC'), day_order
      ORDER BY day_order ASC
    `, [pid]);

    // Mapear respuesta con nombres de días en español
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const weekData = [];
    for (let i = 0; i < 7; i++) {
      const dayData = rows.find(r => r.day_order === i);
      const seconds = dayData?.seconds || 0;
      const hours = Math.floor(seconds / 3600);
      weekData.push({
        day: dayNames[i],
        day_order: i,
        hours: hours,
        seconds: seconds
      });
    }

    res.json(weekData);
  } catch (e) {
    console.error('[/api/dashboard/weekly-hours] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* REPORTES */
app.get('/api/reportes/usuarios', async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM v_user_task_summary ORDER BY total_tasks DESC'); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reportes/tiempo', async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM v_time_summary ORDER BY started_at DESC LIMIT 100'); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reportes/proyectos', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id,p.name,p.color,p.status,p.progress,
        COUNT(DISTINCT t.id) AS total_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE t.column_status='done') AS done_tasks,
        COALESCE(SUM(tl.duration_seconds),0) AS total_seconds
      FROM projects p LEFT JOIN tasks t ON t.project_id=p.id LEFT JOIN time_logs tl ON tl.project_id=p.id
      GROUP BY p.id ORDER BY p.created_at DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
