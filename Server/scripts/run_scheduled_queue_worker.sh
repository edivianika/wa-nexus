#!/bin/bash

# Script to run the Bull MQ scheduled message worker
# This script will run the worker in the background and save logs to a file

# Change to the server directory
cd "$(dirname "$0")/.."

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Kill any existing scheduled message worker processes
pkill -f "node.*src/jobs/scheduledMessageQueueWorker.js" || true

# Run the worker in the background
echo "Starting Bull MQ Scheduled Message Worker..."
nohup node src/jobs/scheduledMessageQueueWorker.js > logs/scheduled-queue-worker.log 2>&1 &

# Get the process ID
PID=$!
echo "Worker started with PID: $PID"
echo "Logs are being written to logs/scheduled-queue-worker.log"

# Create a PID file
echo $PID > .scheduled-queue-worker.pid

echo "To stop the worker, run: kill $(cat .scheduled-queue-worker.pid)"
echo "Or run: pkill -f \"node.*src/jobs/scheduledMessageQueueWorker.js\"" 