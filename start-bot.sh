#!/bin/bash

# Discord AITranslate Bot 起動スクリプト

# 既に起動中かチェック
if [ -f .bot.pid ]; then
    PID=$(cat .bot.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "ボットは既に起動しています (PID: $PID)"
        exit 1
    else
        echo "古いPIDファイルを削除します"
        rm .bot.pid
    fi
fi

# ビルドされているか確認
if [ ! -d "dist" ]; then
    echo "ビルドされていません。npm run build を実行します..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "ビルドに失敗しました"
        exit 1
    fi
fi

# ボットをバックグラウンドで起動
echo "ボットを起動しています..."
nohup npm run start > bot.log 2>&1 &
BOT_PID=$!

# PIDを保存
echo $BOT_PID > .bot.pid

echo "ボットが起動しました (PID: $BOT_PID)"
echo "ログは bot.log で確認できます"
echo "停止する場合は ./stop-bot.sh を実行してください"
