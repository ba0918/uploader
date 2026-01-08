#!/bin/bash
# アップロードディレクトリをtestuser所有で作成

echo "Creating upload directories..."

# testuser が存在するまで待つ
for i in {1..10}; do
    if id testuser &>/dev/null; then
        break
    fi
    sleep 1
done

# アップロードディレクトリを作成
mkdir -p /upload /upload2 /upload3

# testuser 所有に変更
chown -R testuser:users /upload /upload2 /upload3
chmod 755 /upload /upload2 /upload3

echo "Upload directories created and owned by testuser"
ls -la / | grep upload
