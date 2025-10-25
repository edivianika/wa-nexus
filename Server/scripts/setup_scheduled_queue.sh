#!/bin/bash

# Script to set up the Bull MQ scheduled message system
# This script will run the migration and start the worker

# Change to the server directory
cd "$(dirname "$0")/.."

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "Setting up Bull MQ scheduled message system..."

# Run the migration
echo "Running migration to add in_queue status..."
./scripts/run_in_queue_migration.sh

# Wait for migration to complete
sleep 2

# Start the worker
echo "Starting the Bull MQ scheduled message worker..."
./scripts/run_scheduled_queue_worker.sh

echo "Setup completed. The Bull MQ scheduled message system is now running."
echo "Check the logs in logs/scheduled-queue-worker.log for details." 