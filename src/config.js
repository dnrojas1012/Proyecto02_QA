require('dotenv').config({ quiet: true });

const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  dbSsl: process.env.DB_SSL === 'true',
  sessionSecret: process.env.SESSION_SECRET,
  sessionTimeoutMs: (Number(process.env.SESSION_TIMEOUT_SECONDS) || 60) * 1000,
  produccion: process.env.NODE_ENV === 'production',
};

if (!config.databaseUrl) throw new Error('Falta DATABASE_URL en el archivo .env');
if (!config.sessionSecret || config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET debe existir en .env y tener al menos 32 caracteres');
}

module.exports = config;
