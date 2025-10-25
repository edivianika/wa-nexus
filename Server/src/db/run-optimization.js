#!/usr/bin/env node

/**
 * Database optimization script
 * Runs the optimization migration to improve database performance
 */

import 'dotenv/config';
import { runMigration } from './migrations/optimize_indexes.js';

console.log('Starting database optimization...');

runMigration()
  .then(() => {
    console.log('Database optimization completed successfully.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Database optimization failed:', error);
    process.exit(1);
  }); 