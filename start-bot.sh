#!/bin/bash

# Discord AITranslate Bot startup script

# Force stop all existing bot processes to prevent duplicates
echo "Checking for existing bot processes..."
EXISTING_PIDS=$(pgrep -f "node.*dist/index.js" || true)
if [ ! -z "$EXISTING_PIDS" ]; then
    echo "Found existing bot processes, stopping them..."
    pkill -9 -f "node.*dist/index.js" || true
    pkill -9 -f "sh -c node.*dist/index.js" || true
    sleep 1
    echo "All existing processes stopped"
fi

# Clean up old PID file
if [ -f .bot.pid ]; then
    echo "Removing old PID file"
    rm .bot.pid
fi

# Check if built
if [ ! -d "dist" ]; then
    echo "Not built yet. Running npm run build..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "Build failed"
        exit 1
    fi
fi

# Start bot in background
echo "Starting bot..."
nohup npm run start > bot.log 2>&1 &
BOT_PID=$!

# Save PID
echo $BOT_PID > .bot.pid

echo "Bot started successfully (PID: $BOT_PID)"
echo "Check logs at bot.log"
echo "To stop, run ./stop-bot.sh"
