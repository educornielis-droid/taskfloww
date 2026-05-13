'use strict';
/**
 * routes/auth.js
 * Responsable: Cristina / Valeria
 * Mar 29 abr : POST /api/register, POST /api/login
 * Mié 30 abr : refresh tokens, middleware JWT
 * Sáb  3 may : recuperar contraseña, cambiar contraseña, campos extra registro
 */
const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const pool    = require('../db');
const { generateTokens, verifyRefresh } = require('../middlewares/auth');

const SALT_ROUNDS = 10;

/* ─── VALIDACIÓN DE CONTRASEÑA ──────────────────────────────────────── */
const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8) {
    errors.push('Mínimo 8 caracteres');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Al menos una mayúscula (A-Z)');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Al menos una minúscula (a-z)');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Al menos un número (0-9)');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Al menos un carácter especial (!@#$%^&* etc)');
  }
  return errors;
};

/* ─── VALIDACIÓN DE CÉDULA ──────────────────────────────────────────── */
const validateCedula = (cedula) => {
  if (!cedula) return null; // Opcional
  const cedulaClean = cedula.toString().replace(/\D/g, '');
  if (cedulaClean.length < 6 || cedulaClean.length > 10) {
    return 'La cédula debe tener entre 6 y 10 dígitos';
  }
  if (!/^\d{6,10}$/.test(cedulaClean)) {
    return 'La cédula solo debe contener números';
  }
  return null;
};

/* ─── REGISTRO ──────────────────────────────────────────────────────── */
// POST /api/register
// Body: { full_name, email, password, cedula?, role?, organization?, phone?, empresa? }
router.post('/register', async (req, res) => {
  const { full_name, email, password, cedula, role, organization, phone, empresa } = req.body;

  // ⭐ VALIDACIONES REQUERIDAS
  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos.' });
  }

  // ⭐ VALIDACIÓN DE CONTRASEÑA (mejorada)
  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    return res.status(400).json({
      error: 'La contraseña debe cumplir con:',
      requirements: passwordErrors
    });
  }

  // ⭐ VALIDACIÓN DE EMAIL
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: 'Formato de email inválido.' });
  }

  // ⭐ VALIDACIÓN DE CÉDULA
  if (cedula) {
    const cedulaError = validateCedula(cedula);
    if (cedulaError) {
      return res.status(400).json({ error: cedulaError });
    }
  }

  try {
    // Verificar email único
    const existing = await pool.query('SELECT id FROM profiles WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
    }

    // Verificar cédula única (si se proporciona)
    if (cedula) {
      const cedulaExists = await pool.query(
        'SELECT id FROM profiles WHERE cedula = $1',
        [cedula.toString().replace(/\D/g, '')]
      );
      if (cedulaExists.rows.length) {
        return res.status(409).json({ error: 'Ya existe una cuenta con esa cédula.' });
      }
    }

    // Hash de la contraseña
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Generar iniciales automáticamente
    const initials = full_name
      .split(' ')
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const validRoles = ['Admin', 'Gerente', 'Empleado'];
    const safeRole   = validRoles.includes(role) ? role : 'Empleado';

    const { rows } = await pool.query(
      `INSERT INTO profiles
         (email, password_hash, full_name, initials, role, organization, phone, empresa, cedula)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, email, full_name, initials, role, organization, phone, empresa, cedula, created_at`,
      [
        email.toLowerCase().trim(),
        password_hash,
        full_name.trim(),
        initials,
        safeRole,
        organization || 'CreativeHub',
        phone || null,
        empresa || null,
        cedula ? cedula.toString().replace(/\D/g, '') : null
      ]
    );

    const user = rows[0];

    // Crear preferencias por defecto
    await pool.query(
      'INSERT INTO user_preferences (profile_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [user.id]
    );

    // Generar tokens
    const { access, refresh } = generateTokens({
      id: user.id, email: user.email, role: user.role
    });

    // Guardar refresh token en BD
    await pool.query(
      'UPDATE profiles SET refresh_token=$1 WHERE id=$2',
      [refresh, user.id]
    );

    res.status(201).json({
      message: `¡Bienvenido/a ${user.full_name}! Cuenta creada correctamente.`,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        initials: user.initials,
        role: user.role,
        organization: user.organization,
        cedula: user.cedula
      },
      access_token:  access,
      refresh_token: refresh
    });

  } catch (e) {
    console.error('[/register]', e.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/* ─── LOGIN ─────────────────────────────────────────────────────────── */
// POST /api/login
// Body: { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, email, password_hash, full_name, initials, role, organization, phone, empresa, cedula, is_active
       FROM profiles WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });
    }

    // Verificar contraseña — si no tiene hash (perfiles seed sin password) se permite en modo demo
    if (user.password_hash) {
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Credenciales incorrectas.' });
      }
    }

    const payload = { id: user.id, email: user.email, role: user.role };
    const { access, refresh } = generateTokens(payload);

    // Guardar refresh token en BD
    await pool.query(
      'UPDATE profiles SET refresh_token=$1 WHERE id=$2',
      [refresh, user.id]
    );

    res.json({
      message: `Sesión iniciada. ¡Bienvenido/a ${user.full_name}!`,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        initials: user.initials,
        role: user.role,
        organization: user.organization,
        phone: user.phone,
        empresa: user.empresa,
        cedula: user.cedula
      },
      access_token:  access,
      refresh_token: refresh
    });

  } catch (e) {
    console.error('[/login]', e.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/* ─── REFRESH TOKEN ──────────────────────────────────────────────────── */
// POST /api/refresh
// Body: { refresh_token }
// Mié 30 abr: access token (15 min) + refresh (7 días)
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token requerido.' });

  try {
    const payload = verifyRefresh(refresh_token);

    // Verificar que el token coincida con el guardado en BD
    const { rows } = await pool.query(
      'SELECT id, email, role, refresh_token FROM profiles WHERE id=$1',
      [payload.id]
    );
    if (!rows.length || rows[0].refresh_token !== refresh_token) {
      return res.status(401).json({ error: 'Refresh token inválido o revocado.' });
    }

    const user = rows[0];
    const newPayload = { id: user.id, email: user.email, role: user.role };
    const { access, refresh: newRefresh } = generateTokens(newPayload);

    await pool.query(
      'UPDATE profiles SET refresh_token=$1 WHERE id=$2',
      [newRefresh, user.id]
    );

    res.json({ access_token: access, refresh_token: newRefresh });

  } catch (e) {
    res.status(401).json({ error: 'Refresh token expirado o inválido.' });
  }
});

/* ─── LOGOUT ─────────────────────────────────────────────────────────── */
// POST /api/logout
// Body: { user_id }
router.post('/logout', async (req, res) => {
  const { user_id } = req.body;
  if (user_id) {
    await pool.query('UPDATE profiles SET refresh_token=NULL WHERE id=$1', [user_id])
      .catch(() => {});
  }
  res.json({ ok: true, message: 'Sesión cerrada correctamente.' });
});

/* ─── RECUPERAR CONTRASEÑA ───────────────────────────────────────────── */
// POST /api/recover
// Body: { email }
// Sáb 3 may: genera token único, lo guarda en BD con expiración de 1 hora
router.post('/recover', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido.' });

  try {
    const { rows } = await pool.query(
      'SELECT id, full_name FROM profiles WHERE email=$1 AND is_active=true',
      [email.toLowerCase().trim()]
    );

    // Responder siempre OK para no revelar si el email existe (seguridad)
    if (!rows.length) {
      return res.json({ ok: true, message: 'Si el email existe, recibirás el enlace en breve.' });
    }

    const user = rows[0];

    // Invalidar tokens anteriores del mismo usuario
    await pool.query(
      'UPDATE password_reset_tokens SET used=true WHERE profile_id=$1 AND used=false',
      [user.id]
    );

    // Generar token seguro
    const token     = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await pool.query(
      `INSERT INTO password_reset_tokens (profile_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt]
    );

    // En producción: enviar email con nodemailer o Resend
    // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    // await sendResetEmail(user.email, user.full_name, resetLink);

    console.log(`[RECOVER] Token para ${user.full_name}: ${token}`);
    // Se devuelve el token en modo demo (en producción NO)
    res.json({
      ok: true,
      message: 'Enlace de recuperación generado.',
      token_demo: token,   // ← quitar en producción
      expires_at: expiresAt
    });

  } catch (e) {
    console.error('[/recover]', e.message);
    res.status(500).json({ error: 'Error interno.' });
  }
});

/* ─── RESETEAR CONTRASEÑA (desde enlace) ────────────────────────────── */
// POST /api/reset-password
// Body: { token, new_password }
// Sáb 3 may: valida token, actualiza contraseña en BD
router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) {
    return res.status(400).json({ error: 'Token y nueva contraseña requeridos.' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token=$1 AND used=false AND expires_at > NOW()`,
      [token]
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Token inválido o expirado.' });
    }

    const resetRecord = rows[0];
    const hash = await bcrypt.hash(new_password, SALT_ROUNDS);

    await pool.query('UPDATE profiles SET password_hash=$1, updated_at=NOW() WHERE id=$2',
      [hash, resetRecord.profile_id]);
    await pool.query('UPDATE password_reset_tokens SET used=true WHERE id=$1',
      [resetRecord.id]);

    res.json({ ok: true, message: 'Contraseña actualizada correctamente.' });

  } catch (e) {
    console.error('[/reset-password]', e.message);
    res.status(500).json({ error: 'Error interno.' });
  }
});

/* ─── CAMBIAR CONTRASEÑA (desde perfil autenticado) ─────────────────── */
// PUT /api/change-password
// Body: { user_id, current_password, new_password }
// Sáb 3 may: validar contraseña actual, hashear nueva, actualizar BD
router.put('/change-password', async (req, res) => {
  const { user_id, current_password, new_password } = req.body;
  if (!user_id || !current_password || !new_password) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT password_hash FROM profiles WHERE id=$1 AND is_active=true', [user_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const user = rows[0];
    if (user.password_hash) {
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta.' });
    }

    const hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await pool.query(
      'UPDATE profiles SET password_hash=$1, updated_at=NOW() WHERE id=$2',
      [hash, user_id]
    );

    res.json({ ok: true, message: 'Contraseña actualizada correctamente.' });

  } catch (e) {
    console.error('[/change-password]', e.message);
    res.status(500).json({ error: 'Error interno.' });
  }
});

module.exports = router;
