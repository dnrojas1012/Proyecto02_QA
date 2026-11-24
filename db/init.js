// Crea las tablas y carga los datos de ejemplo en la base indicada en .env
// Uso: npm run db:init            (borra y vuelve a crear todo)
//      node db/init.js --si-vacia  (solo si la base está vacía; lo usa Render al arrancar)
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  try {
    await client.connect();
    if (process.argv.includes('--si-vacia')) {
      const { rows } = await client.query("SELECT to_regclass('public.usuarios') AS t");
      if (rows[0].t) {
        console.log('La base ya tiene tablas: no se reinicia.');
        return;
      }
    }
    for (const archivo of ['01_schema.sql', '02_seed.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, archivo), 'utf8');
      await client.query(sql);
      console.log(`OK  ${archivo}`);
    }
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM usuarios');
    console.log(`Listo: ${rows[0].n} usuarios de prueba cargados.`);
  } catch (err) {
    console.error('ERROR al inicializar la base:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
