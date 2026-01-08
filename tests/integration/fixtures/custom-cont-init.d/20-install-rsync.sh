#!/bin/bash
# テスト用: rsyncをインストール
# linuxserver/openssh-server の custom-cont-init.d スクリプト

echo "Installing rsync..."

# Alpine Linuxの場合（linuxserver/openssh-serverはAlpineベース）
if command -v apk &> /dev/null; then
    apk add --no-cache rsync
    echo "rsync installed via apk"
# Debianベースの場合
elif command -v apt-get &> /dev/null; then
    apt-get update && apt-get install -y rsync
    echo "rsync installed via apt-get"
else
    echo "Warning: Unable to install rsync - unsupported package manager"
fi
