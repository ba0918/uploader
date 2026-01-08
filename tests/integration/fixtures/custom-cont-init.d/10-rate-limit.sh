#!/bin/bash
# テスト用: SSH rate limitを緩和する設定を適用
# linuxserver/openssh-server の custom-cont-init.d スクリプト

SSHD_CONFIG="/config/sshd/sshd_config"

# 設定ファイルが存在するまで待機
for i in {1..30}; do
    if [ -f "$SSHD_CONFIG" ]; then
        break
    fi
    sleep 1
done

if [ ! -f "$SSHD_CONFIG" ]; then
    echo "Warning: sshd_config not found, skipping rate limit configuration"
    exit 0
fi

# MaxStartups を更新（コメントアウトされた行も含む）
if ! grep -q "^MaxStartups 1000" "$SSHD_CONFIG"; then
    # まずコメントアウトされた行を置換、なければ追加
    if grep -q "^#MaxStartups" "$SSHD_CONFIG"; then
        sed -i 's/^#MaxStartups.*/MaxStartups 1000:30:2000/' "$SSHD_CONFIG"
    elif ! grep -q "^MaxStartups" "$SSHD_CONFIG"; then
        echo "MaxStartups 1000:30:2000" >> "$SSHD_CONFIG"
    fi
fi

# MaxAuthTries を更新
if ! grep -q "^MaxAuthTries 100" "$SSHD_CONFIG"; then
    if grep -q "^#MaxAuthTries" "$SSHD_CONFIG"; then
        sed -i 's/^#MaxAuthTries.*/MaxAuthTries 100/' "$SSHD_CONFIG"
    elif ! grep -q "^MaxAuthTries" "$SSHD_CONFIG"; then
        echo "MaxAuthTries 100" >> "$SSHD_CONFIG"
    fi
fi

# PerSourcePenalties を追加（OpenSSH 9.7+）
if ! grep -q "^PerSourcePenalties" "$SSHD_CONFIG"; then
    echo "PerSourcePenalties no" >> "$SSHD_CONFIG"
fi

echo "SSH rate limit configuration applied"
