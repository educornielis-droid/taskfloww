'use strict';
/**
 * routes/preferencias.js
 * Responsable: Eduardo
 * Jue 1 may: GET/PUT /api/preferencias/:usuarioId
 * Lun 5 may: persistencia de alto_contraste, fuente_dyslexic, modo_enfoque
 */
const router = require('express').Router();
const pool   = require('../db');
const { verifyToken } = require('../middlewares/auth');

const DEFAULTS = {
  modo_tema:          'claro',  // 'claro', 'sistema', 'oscuro'
  alto_contraste:     false,
  fuente_dyslexic:    false,
  modo_enfoque:       false,
  tamano_fuente:      'normal',
  espaciado_letras:   'normal',
  indicadores_foco:   true
};

/* GET /api/preferencias/:usuarioId */
router.get('/:usuarioId', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM user_preferences WHERE profile_id=$1',
      [req.params.usuarioId]
    );
    // Devolver defaults si aún no existen
    res.json(rows[0] || { profile_id: req.params.usuarioId, ...DEFAULTS });
  } catch (e) {
    console.error('[preferencias GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* PUT /api/preferencias/:usuarioId */
// Body: { modo_tema?, alto_contraste?, fuente_dyslexic?, modo_enfoque?, tamano_fuente?, espaciado_letras?, indicadores_foco? }
router.put('/:usuarioId', verifyToken, async (req, res) => {
  const { modo_tema, alto_contraste, fuente_dyslexic, modo_enfoque, tamano_fuente, espaciado_letras, indicadores_foco } = req.body;

  // Validar modo_tema
  const validTemas = ['claro', 'sistema', 'oscuro'];
  if (modo_tema && !validTemas.includes(modo_tema)) {
    return res.status(400).json({ error: `modo_tema debe ser: ${validTemas.join(', ')}` });
  }

  // Validar tamano_fuente
  const validTamanos = ['pequeno', 'normal', 'grande', 'xl'];
  if (tamano_fuente && !validTamanos.includes(tamano_fuente)) {
    return res.status(400).json({ error: `tamano_fuente debe ser: ${validTamanos.join(', ')}` });
  }

  // Validar espaciado_letras
  const validEspaciado = ['normal', 'ampliado'];
  if (espaciado_letras && !validEspaciado.includes(espaciado_letras)) {
    return res.status(400).json({ error: `espaciado_letras debe ser: ${validEspaciado.join(', ')}` });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO user_preferences
         (profile_id, modo_tema, alto_contraste, fuente_dyslexic, modo_enfoque, tamano_fuente, espaciado_letras)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (profile_id) DO UPDATE SET
         modo_tema       = COALESCE($2, user_preferences.modo_tema),
         alto_contraste  = COALESCE($3, user_preferences.alto_contraste),
         fuente_dyslexic = COALESCE($4, user_preferences.fuente_dyslexic),
         modo_enfoque    = COALESCE($5, user_preferences.modo_enfoque),
         tamano_fuente   = COALESCE($6, user_preferences.tamano_fuente),
         espaciado_letras = COALESCE($7, user_preferences.espaciado_letras),
         updated_at      = NOW()
       RETURNING *`,
      [req.params.usuarioId, modo_tema, alto_contraste, fuente_dyslexic, modo_enfoque, tamano_fuente, espaciado_letras]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('[preferencias PUT]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
