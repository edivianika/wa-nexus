/**
 * Script untuk menjalankan migrasi SQL menggunakan pg client
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function runMigration(sqlFile) {
  // Baca koneksi dari environment variables
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  // Buat koneksi ke database
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // Baca file SQL
    const sqlPath = path.resolve(__dirname, sqlFile);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log(`Running migration from file: ${sqlFile}`);
    console.log('SQL to execute:');
    console.log(sql);
    
    // Jalankan SQL
    const result = await pool.query(sql);
    console.log('Migration executed successfully');
    console.log('Result:', result);
    
    return true;
  } catch (error) {
    console.error('Error executing migration:', error);
    return false;
  } finally {
    // Tutup koneksi
    await pool.end();
  }
}

// Jalankan migrasi jika dieksekusi langsung
if (require.main === module) {
  const sqlFile = process.argv[2];
  
  if (!sqlFile) {
    console.error('Please provide SQL file name as argument');
    console.error('Example: node run_migration.js add_scheduled_in_queue.sql');
    process.exit(1);
  }
  
  runMigration(sqlFile)
    .then(success => {
      if (success) {
        console.log('Migration completed successfully');
        process.exit(0);
      } else {
        console.error('Migration failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

export { runMigration }; 