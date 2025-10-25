#!/bin/bash

# Script to run the in_queue status migration

# Change to the server directory
cd "$(dirname "$0")/.."

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "Running in_queue status migration..."
node src/migrations/add_in_queue_status.js

echo "Migration completed." 