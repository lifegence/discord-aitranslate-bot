#!/bin/bash

# Discord AITranslate Bot startup script

# Check if already running
if [ -f .bot.pid ]; then
    PID=$(cat .bot.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "Bot is already running (PID: $PID)"
        exit 1
    else
        echo "Removing old PID file"
        rm .bot.pid
    fi
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
