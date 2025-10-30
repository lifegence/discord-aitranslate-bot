#!/bin/bash

# Discord AITranslate Bot 停止スクリプト

# PIDファイルが存在するかチェック
if [ ! -f .bot.pid ]; then
    echo "ボットは起動していません (.bot.pid が見つかりません)"
    exit 1
fi

# PIDを読み取る
PID=$(cat .bot.pid)

# プロセスが実行中かチェック
if ! ps -p $PID > /dev/null 2>&1; then
    echo "PID $PID のプロセスが見つかりません"
    echo ".bot.pid ファイルを削除します"
    rm .bot.pid
    exit 1
fi

# ボットを停止
echo "ボットを停止しています (PID: $PID)..."
kill $PID

# プロセスが終了するまで待機
WAIT_COUNT=0
while ps -p $PID > /dev/null 2>&1 && [ $WAIT_COUNT -lt 10 ]; do
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

# まだ実行中の場合は強制終了
if ps -p $PID > /dev/null 2>&1; then
    echo "通常終了に失敗しました。強制終了します..."
    kill -9 $PID
    sleep 1
fi

# PIDファイルを削除
rm .bot.pid

echo "ボットを停止しました"
