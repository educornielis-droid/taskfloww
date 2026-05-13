const { Pool } = require('pg');
require('dotenv').config(); // <--- ESTO DEBE IR ARRIBA

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false // <--- OBLIGATORIO PARA SUPABASE
  },
  // ⭐ OPTIMIZACIÓN PARA SUPABASE (pool_size limitado a 15)
  max: 5,                    // Max conexiones simultáneas
  idleTimeoutMillis: 10000,  // Cerrar idle connections después de 10s
  connectionTimeoutMillis: 5000, // Timeout de conexión
  statement_timeout: 30000   // Timeout de queries
});

// ⭐ MANEJO DE ERRORES DEL POOL
pool.on('error', (err) => {
  console.error('❌ Error del pool de conexión:', err.message);
});

pool.on('connect', () => {
  console.log('✅ Nueva conexión al pool establecida');
});

// ⭐ GRACEFUL SHUTDOWN
process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando pool de conexiones...');
  await pool.end();
  console.log('✅ Pool cerrado');
  process.exit(0);
});

module.exports = pool;