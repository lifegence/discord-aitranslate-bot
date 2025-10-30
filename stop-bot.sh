#!/bin/bash

# Discord AITranslate Bot shutdown script

# Check if PID file exists
if [ ! -f .bot.pid ]; then
    echo "Bot is not running (.bot.pid not found)"
    exit 1
fi

# Read PID
PID=$(cat .bot.pid)

# Check if process is running
if ! ps -p $PID > /dev/null 2>&1; then
    echo "Process with PID $PID not found"
    echo "Removing .bot.pid file"
    rm .bot.pid
    exit 1
fi

# Stop bot
echo "Stopping bot (PID: $PID)..."
kill $PID

# Wait for process to terminate
WAIT_COUNT=0
while ps -p $PID > /dev/null 2>&1 && [ $WAIT_COUNT -lt 10 ]; do
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

# Force kill if still running
if ps -p $PID > /dev/null 2>&1; then
    echo "Graceful shutdown failed. Force killing..."
    kill -9 $PID
    sleep 1
fi

# Remove PID file
rm .bot.pid

echo "Bot stopped successfully"
