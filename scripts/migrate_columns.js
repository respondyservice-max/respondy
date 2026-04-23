const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Conectado a la base de datos.');

    const query = `
      ALTER TABLE businesses 
      ADD COLUMN IF NOT EXISTS appointment_duration integer DEFAULT 45,
      ADD COLUMN IF NOT EXISTS min_lead_time_hours integer DEFAULT 2,
      ADD COLUMN IF NOT EXISTS service_name text DEFAULT 'Consulta',
      ADD COLUMN IF NOT EXISTS service_description text;
    `;

    await client.query(query);
    console.log('Columnas creadas exitosamente.');
  } catch (err) {
    console.error('Error en la migración:', err);
  } finally {
    await client.end();
  }
}

migrate();
