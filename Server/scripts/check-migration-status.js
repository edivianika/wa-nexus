/**
 * Script untuk memeriksa status migrasi database tanpa menjalankan migrasi
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMigrationStatus() {
  console.log('Memeriksa status migrasi database...');
  
  try {
    // Periksa tabel-tabel utama
    await checkTable('asset_library', 'Tabel aset');
    await checkTable('asset_usage', 'Tabel penggunaan aset');
    await checkTable('scheduled_messages', 'Tabel pesan terjadwal');
    await checkTable('drip_messages', 'Tabel pesan drip');
    
    // Periksa column asset_id
    await checkColumn('scheduled_messages', 'asset_id', 'Kolom asset_id di scheduled_messages');
    await checkColumn('drip_messages', 'asset_id', 'Kolom asset_id di drip_messages');
    
    // Periksa fungsi SQL
    await checkFunction('exec_sql', 'Fungsi exec_sql');
    await checkFunction('create_tables', 'Fungsi create_tables');
    await checkFunction('increment_asset_usage', 'Fungsi increment_asset_usage');
    
    console.log('\n✅ Pemeriksaan migrasi selesai.');
    console.log('\nUntuk menjalankan migrasi, gunakan perintah:');
    console.log('  npm run migrate:run');
    
  } catch (error) {
    console.error('Error saat memeriksa status migrasi:', error);
    process.exit(1);
  }
}

async function checkTable(tableName, description) {
  console.log(`\nMemeriksa ${description}...`);
  
  // Periksa apakah tabel ada
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName)
    .single();
  
  if (error || !data) {
    console.log(`❌ ${description} belum dibuat.`);
    return false;
  } else {
    console.log(`✅ ${description} sudah ada.`);
    return true;
  }
}

async function checkColumn(tableName, columnName, description) {
  console.log(`\nMemeriksa ${description}...`);
  
  // Periksa apakah kolom ada
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName)
    .eq('column_name', columnName)
    .single();
  
  if (error || !data) {
    console.log(`❌ ${description} belum ditambahkan.`);
    return false;
  } else {
    console.log(`✅ ${description} sudah ada.`);
    return true;
  }
}

async function checkFunction(functionName, description) {
  console.log(`\nMemeriksa ${description}...`);
  
  // Periksa apakah fungsi ada
  const { data, error } = await supabase
    .from('information_schema.routines')
    .select('routine_name')
    .eq('routine_schema', 'public')
    .eq('routine_name', functionName)
    .single();
  
  if (error || !data) {
    console.log(`❌ ${description} belum dibuat.`);
    return false;
  } else {
    console.log(`✅ ${description} sudah ada.`);
    return true;
  }
}

checkMigrationStatus(); 