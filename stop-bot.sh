#!/bin/bash

# Discord AITranslate Bot shutdown script

echo "Stopping all bot processes..."

# Stop all bot processes (not just the one in PID file)
EXISTING_PIDS=$(pgrep -f "node.*dist/index.js" || true)
if [ ! -z "$EXISTING_PIDS" ]; then
    echo "Found bot processes: $EXISTING_PIDS"

    # Try graceful shutdown first
    pkill -TERM -f "node.*dist/index.js" || true
    sleep 2

    # Force kill any remaining processes
    REMAINING=$(pgrep -f "node.*dist/index.js" || true)
    if [ ! -z "$REMAINING" ]; then
        echo "Force killing remaining processes..."
        pkill -9 -f "node.*dist/index.js" || true
        pkill -9 -f "sh -c node.*dist/index.js" || true
        sleep 1
    fi

    echo "All bot processes stopped"
else
    echo "No bot processes found"
fi

# Clean up PID file
if [ -f .bot.pid ]; then
    rm .bot.pid
fi

echo "Bot stopped successfully"
