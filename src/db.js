// Pool de conexiones a PostgreSQL.
// REGLA DE ORO (UTN-07a): toda consulta usa parámetros $1, $2...
// Nunca se concatena texto que viene del usuario dentro del SQL.
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
  // Las fechas (CURRENT_DATE) se calculan en hora de Costa Rica
  options: '-c timezone=America/Costa_Rica',
});

module.exports = {
  pool,
  query: (texto, parametros) => pool.query(texto, parametros),
};
