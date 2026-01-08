#!/bin/bash
# SSH鍵のセットアップスクリプト
# SCP結合テスト用のSSH鍵を生成する

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_DIR="$SCRIPT_DIR/../fixtures/ssh-keys"

# ディレクトリ作成
mkdir -p "$KEYS_DIR"

KEY_FILE="$KEYS_DIR/test_key"
AUTHORIZED_KEYS="$KEYS_DIR/authorized_keys"

# 既に鍵が存在する場合は確認
if [ -f "$KEY_FILE" ]; then
  echo "SSH key already exists: $KEY_FILE"
  echo "Do you want to regenerate? (y/N)"
  read -r answer
  if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
    echo "Keeping existing keys."
    exit 0
  fi
  rm -f "$KEY_FILE" "$KEY_FILE.pub" "$AUTHORIZED_KEYS"
fi

# SSH鍵を生成
echo "Generating SSH key pair..."
ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -C "uploader-test-key"

# authorized_keysを作成
cp "$KEY_FILE.pub" "$AUTHORIZED_KEYS"

echo ""
echo "SSH keys generated successfully!"
echo "  Private key: $KEY_FILE"
echo "  Public key:  $KEY_FILE.pub"
echo "  Authorized:  $AUTHORIZED_KEYS"
echo ""
echo "Now start the Docker container:"
echo "  docker compose -f docker-compose.test.yml up -d"
