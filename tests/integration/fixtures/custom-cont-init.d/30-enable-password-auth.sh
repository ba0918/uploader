#!/bin/bash
# テスト用: パスワード認証を有効化

SSHD_CONFIG="/etc/ssh/sshd_config"

# sshd_configでPasswordAuthenticationをyesに変更
if grep -q "^PasswordAuthentication no" "$SSHD_CONFIG"; then
    sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' "$SSHD_CONFIG"
    echo "Password authentication enabled in $SSHD_CONFIG"
fi

# sshdを再起動するためのフラグファイル作成（コンテナのentrypointで処理される）
echo "Password authentication configuration applied"
