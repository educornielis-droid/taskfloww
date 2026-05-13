'use strict';
const app = require('./src/app');
const pool = require('./src/db');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error conexión BD:', err.message);
  } else {
    console.log('✅ Supabase conectado:', res.rows[0].now);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 TaskFlow corriendo en http://localhost:${PORT}`);
});
