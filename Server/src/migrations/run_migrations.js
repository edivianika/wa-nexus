/**
 * Run database migrations
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigrations() {
  console.log('Starting database migrations...');
  
  try {
    // Create exec_sql function if it doesn't exist
    await createExecSqlFunction();
    
    // Apply SQL functions
    await applySqlFunctions();
    
    // Create asset tables
    await createAssetTables();
    
    // Add assetId column to scheduled_messages table
    await addAssetIdToScheduledMessages();
    
    // Add assetId column to drip_messages table
    await addAssetIdToDripMessages();
    
    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Error applying migrations:', error);
    process.exit(1);
  }
}

async function createExecSqlFunction() {
  try {
    console.log('Creating exec_sql function...');
    
    // Create the exec_sql function directly
    const { error } = await supabase.rpc('create_tables', {
      sql: `
        -- Function to execute arbitrary SQL (for migrations)
        CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
        RETURNS void AS $$
        BEGIN
          EXECUTE sql_query;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        
        -- Grant execute permission to authenticated users
        GRANT EXECUTE ON FUNCTION exec_sql TO authenticated;
      `
    });
    
    if (error) {
      // If create_tables function doesn't exist yet, create it first
      if (error.code === 'PGRST202') {
        console.log('Creating create_tables function...');
        
        // Create the create_tables function directly using raw SQL
        const { error: rawError } = await supabase.from('_exec_sql').insert({
          query: `
            -- Function to execute arbitrary SQL for creating tables
            CREATE OR REPLACE FUNCTION create_tables(sql text)
            RETURNS void AS $$
            BEGIN
              EXECUTE sql;
            END;
            $$ LANGUAGE plpgsql SECURITY DEFINER;
            
            -- Grant execute permission to authenticated users
            GRANT EXECUTE ON FUNCTION create_tables TO authenticated;
          `
        });
        
        if (rawError) {
          console.error('Error creating create_tables function:', rawError);
        } else {
          // Try creating exec_sql function again
          await createExecSqlFunction();
        }
      } else {
        console.error('Error creating exec_sql function:', error);
      }
    } else {
      console.log('exec_sql function created successfully');
    }
  } catch (error) {
    console.error('Error creating exec_sql function:', error);
  }
}

async function applySqlFunctions() {
  console.log('Applying SQL functions...');
  
  const sqlDir = path.join(__dirname, 'sql');
  const sqlFiles = fs.readdirSync(sqlDir).filter(file => file.endsWith('.sql'));
  
  for (const file of sqlFiles) {
    try {
      console.log(`Applying SQL function from ${file}...`);
      const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
      
      // Use create_tables function instead of exec_sql
      const { error } = await supabase.rpc('create_tables', { sql });
      
      if (error) {
        console.error(`Error applying SQL function from ${file}:`, error);
      } else {
        console.log(`Successfully applied SQL function from ${file}`);
      }
    } catch (error) {
      console.error(`Error processing SQL file ${file}:`, error);
    }
  }
}

async function createAssetTables() {
  console.log('Creating asset tables if they do not exist...');
  
  try {
    // Check if asset_library table exists
    const { error: libraryCheckError } = await supabase
      .from('asset_library')
      .select('count')
      .limit(1)
      .single();
    
    // If error, table might not exist
    if (libraryCheckError && libraryCheckError.code === 'PGRST116') {
      console.log('Creating asset_library table...');
      
      // Create asset_library table using SQL query
      const { error: createLibraryError } = await supabase.rpc('create_tables', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.asset_library (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL,
            filename TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            asset_type TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            width INTEGER,
            height INTEGER,
            duration INTEGER,
            thumbnail_path TEXT,
            tags TEXT[] DEFAULT '{}',
            metadata JSONB DEFAULT '{}'::jsonb,
            usage_count INTEGER DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            last_used_at TIMESTAMP WITH TIME ZONE DEFAULT now()
          );
          
          CREATE INDEX IF NOT EXISTS idx_asset_library_user_id ON public.asset_library(user_id);
          CREATE INDEX IF NOT EXISTS idx_asset_library_content_hash ON public.asset_library(content_hash);
          CREATE INDEX IF NOT EXISTS idx_asset_library_asset_type ON public.asset_library(asset_type);
          
          -- Enable RLS
          ALTER TABLE public.asset_library ENABLE ROW LEVEL SECURITY;
          
          -- Create policies
          CREATE POLICY asset_library_select_policy ON public.asset_library
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());
            
          CREATE POLICY asset_library_insert_policy ON public.asset_library
            FOR INSERT TO authenticated
            WITH CHECK (user_id = auth.uid());
            
          CREATE POLICY asset_library_update_policy ON public.asset_library
            FOR UPDATE TO authenticated
            USING (user_id = auth.uid());
            
          CREATE POLICY asset_library_delete_policy ON public.asset_library
            FOR DELETE TO authenticated
            USING (user_id = auth.uid());
        `
      });
      
      if (createLibraryError) {
        console.error('Error creating asset_library table:', createLibraryError);
      } else {
        console.log('asset_library table created successfully');
      }
    }
    
    // Check if asset_usage table exists
    const { error: usageCheckError } = await supabase
      .from('asset_usage')
      .select('count')
      .limit(1)
      .single();
    
    // If error, table might not exist
    if (usageCheckError && usageCheckError.code === 'PGRST116') {
      console.log('Creating asset_usage table...');
      
      // Create asset_usage table using SQL query
      const { error: createUsageError } = await supabase.rpc('create_tables', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.asset_usage (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            asset_id UUID NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
          );
          
          CREATE INDEX IF NOT EXISTS idx_asset_usage_asset_id ON public.asset_usage(asset_id);
          CREATE INDEX IF NOT EXISTS idx_asset_usage_entity ON public.asset_usage(entity_type, entity_id);
          
          -- Add foreign key if asset_library table exists
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'asset_library') THEN
              ALTER TABLE public.asset_usage 
              ADD CONSTRAINT fk_asset_usage_asset_id 
              FOREIGN KEY (asset_id) 
              REFERENCES public.asset_library(id) 
              ON DELETE CASCADE;
            END IF;
          END
          $$;
          
          -- Enable RLS
          ALTER TABLE public.asset_usage ENABLE ROW LEVEL SECURITY;
          
          -- Create policies
          CREATE POLICY asset_usage_select_policy ON public.asset_usage
            FOR SELECT TO authenticated
            USING (asset_id IN (SELECT id FROM asset_library WHERE user_id = auth.uid()));
            
          CREATE POLICY asset_usage_insert_policy ON public.asset_usage
            FOR INSERT TO authenticated
            WITH CHECK (asset_id IN (SELECT id FROM asset_library WHERE user_id = auth.uid()));
            
          CREATE POLICY asset_usage_delete_policy ON public.asset_usage
            FOR DELETE TO authenticated
            USING (asset_id IN (SELECT id FROM asset_library WHERE user_id = auth.uid()));
        `
      });
      
      if (createUsageError) {
        console.error('Error creating asset_usage table:', createUsageError);
      } else {
        console.log('asset_usage table created successfully');
      }
    }
    
    // Create increment_asset_usage function
    const { error: funcError } = await supabase.rpc('create_tables', {
      sql: `
        CREATE OR REPLACE FUNCTION increment_asset_usage(asset_id UUID)
        RETURNS void AS $$
        BEGIN
          UPDATE public.asset_library
          SET 
            usage_count = usage_count + 1,
            last_used_at = now()
          WHERE id = asset_id;
        END;
        $$ LANGUAGE plpgsql;
      `
    });
    
    if (funcError) {
      console.error('Error creating increment_asset_usage function:', funcError);
    } else {
      console.log('increment_asset_usage function created successfully');
    }
    
  } catch (error) {
    console.error('Error creating asset tables:', error);
  }
}

async function addAssetIdToScheduledMessages() {
  console.log('Adding asset_id column to scheduled_messages table if it does not exist...');
  
  try {
    // Run the add_asset_id_to_scheduled_messages function
    const { error } = await supabase.rpc('add_asset_id_to_scheduled_messages');
    
    if (error) {
      // If the function doesn't exist, create it first
      if (error.code === 'PGRST202') {
        console.log('Creating add_asset_id_to_scheduled_messages function...');
        
        // Read the SQL file
        const sql = fs.readFileSync(path.join(__dirname, 'sql', 'add_asset_id_to_scheduled_messages.sql'), 'utf8');
        
        // Create the function
        const { error: createFuncError } = await supabase.rpc('create_tables', { sql });
        
        if (createFuncError) {
          console.error('Error creating add_asset_id_to_scheduled_messages function:', createFuncError);
        } else {
          console.log('add_asset_id_to_scheduled_messages function created successfully');
          
          // Try running the function again
          const { error: runFuncError } = await supabase.rpc('add_asset_id_to_scheduled_messages');
          
          if (runFuncError) {
            console.error('Error adding asset_id column to scheduled_messages table:', runFuncError);
          } else {
            console.log('asset_id column added to scheduled_messages table successfully');
          }
        }
      } else {
        console.error('Error adding asset_id column to scheduled_messages table:', error);
      }
    } else {
      console.log('asset_id column added to scheduled_messages table successfully');
    }
  } catch (error) {
    console.error('Error adding asset_id column to scheduled_messages table:', error);
  }
}

async function addAssetIdToDripMessages() {
  console.log('Adding asset_id column to drip_messages table if it does not exist...');
  
  try {
    // Run the add_asset_id_to_drip_messages function
    const { error } = await supabase.rpc('add_asset_id_to_drip_messages');
    
    if (error) {
      // If the function doesn't exist, create it first
      if (error.code === 'PGRST202') {
        console.log('Creating add_asset_id_to_drip_messages function...');
        
        // Read the SQL file
        const sql = fs.readFileSync(path.join(__dirname, 'sql', 'add_asset_id_to_drip_messages.sql'), 'utf8');
        
        // Create the function
        const { error: createFuncError } = await supabase.rpc('create_tables', { sql });
        
        if (createFuncError) {
          console.error('Error creating add_asset_id_to_drip_messages function:', createFuncError);
        } else {
          console.log('add_asset_id_to_drip_messages function created successfully');
          
          // Try running the function again
          const { error: runFuncError } = await supabase.rpc('add_asset_id_to_drip_messages');
          
          if (runFuncError) {
            console.error('Error adding asset_id column to drip_messages table:', runFuncError);
          } else {
            console.log('asset_id column added to drip_messages table successfully');
          }
        }
      } else {
        console.error('Error adding asset_id column to drip_messages table:', error);
      }
    } else {
      console.log('asset_id column added to drip_messages table successfully');
    }
  } catch (error) {
    console.error('Error adding asset_id column to drip_messages table:', error);
  }
}

// Run migrations if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  applyMigrations();
}

export {
  applyMigrations
}; 