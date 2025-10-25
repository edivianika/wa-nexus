# Database Migrations

This directory contains database migrations for the WhatsApp App.

## Migration System

The migration system uses Supabase's SQL execution capabilities to create and manage database tables and functions. 

### How it works

1. The `run_migrations.js` file is the entry point for running migrations.
2. It first creates a `create_tables` function in Supabase if it doesn't exist.
3. It then applies SQL functions from the `sql` directory.
4. Finally, it creates asset tables if they don't exist.

### Adding new migrations

To add a new migration:

1. Create a new SQL file in the `sql` directory.
2. The SQL file should contain the necessary SQL statements to create or modify the database.
3. The migration will be applied when the server starts.

### Running migrations manually

You can run migrations manually by running:

```bash
node src/migrations/run_migrations.js
```

## Asset Tables

The asset tables are used to store metadata for uploaded media assets. The following tables are created:

- `asset_library`: Stores metadata for uploaded media assets
- `asset_usage`: Tracks usage of assets in different entities

## Row-Level Security

Row-level security (RLS) policies are applied to the asset tables to ensure that users can only access their own assets. The following policies are created:

- `asset_library_select_policy`: Users can only select their own assets
- `asset_library_insert_policy`: Users can only insert their own assets
- `asset_library_update_policy`: Users can only update their own assets
- `asset_library_delete_policy`: Users can only delete their own assets

Similar policies are created for the `asset_usage` table.

## SQL Functions

The following SQL functions are created:

- `create_tables`: Executes arbitrary SQL for creating tables
- `increment_asset_usage`: Increments the usage count for an asset