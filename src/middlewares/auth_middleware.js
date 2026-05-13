'use strict';
/**
 * middlewares/auth.js
 * Responsable: Cristina / Valeria
 * Mié 30 abr: verifyToken
 * Jue 1 may:  authorize(roles)
 * Mar 6 may:  proteger endpoints por rol
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET  || 'taskflow_secret_dev_2026';
const JWT_REFRESH = process.env.JWT_REFRESH || 'taskflow_refresh_dev_2026';

/**
 * verifyToken — extrae y valida el JWT del header Authorization
 * Agrega req.user = { id, email, role } para los siguientes middlewares.
 */
function verifyToken(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token requerido. Inicia sesión.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;   // { id, email, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Renueva la sesión.', expired: true });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

/**
 * authorize(roles) — verifica que el rol del usuario esté en la lista permitida.
 * Uso: router.delete('/proyectos/:id', verifyToken, authorize(['Admin']), handler)
 *
 * Jerarquía: Admin > Gerente > Empleado
 *   - Admin    : acceso total
 *   - Gerente  : puede crear/editar proyectos, asignar tareas
 *   - Empleado : solo lectura de lo propio + crear tareas propias
 */
function authorize(roles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}.`
      });
    }
    next();
  };
}

/**
 * generateTokens — crea access token (15 min) y refresh token (7 días)
 */
function generateTokens(payload) {
  const access  = jwt.sign(payload, JWT_SECRET,  { expiresIn: '15m' });
  const refresh = jwt.sign(payload, JWT_REFRESH, { expiresIn: '7d'  });
  return { access, refresh };
}

/**
 * verifyRefresh — valida un refresh token
 */
function verifyRefresh(token) {
  return jwt.verify(token, JWT_REFRESH);
}

module.exports = { verifyToken, authorize, generateTokens, verifyRefresh };
