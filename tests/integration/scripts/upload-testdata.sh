#!/bin/bash
#
# テストデータをsftpコンテナにアップロードするスクリプト
#

set -e

# カラー出力
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 設定
SFTP_HOST="localhost"
SFTP_PORT="2222"
SFTP_USER="testuser"
REMOTE_DIR="/upload"
SSH_KEY="tests/integration/fixtures/ssh-keys/test_key"
SOURCE_DIR="tests/integration/fixtures/testdata/remote"

echo -e "${GREEN}=== テストデータアップロードスクリプト ===${NC}"
echo ""

# Dockerコンテナが起動しているか確認
echo -e "${YELLOW}[1/4] Dockerコンテナの状態を確認中...${NC}"
if ! docker compose -f docker-compose.test.yml ps | grep -q "sftp.*Up"; then
    echo -e "${RED}エラー: sftpコンテナが起動していません${NC}"
    echo "以下のコマンドでコンテナを起動してください:"
    echo "  docker compose -f docker-compose.test.yml up -d"
    exit 1
fi
echo -e "${GREEN}✓ sftpコンテナは起動しています${NC}"
echo ""

# SSH鍵の存在確認
echo -e "${YELLOW}[2/4] SSH鍵の確認中...${NC}"
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}エラー: SSH鍵が見つかりません: $SSH_KEY${NC}"
    echo "以下のコマンドでSSH鍵を生成してください:"
    echo "  ./tests/integration/scripts/setup-ssh-keys.sh"
    exit 1
fi
echo -e "${GREEN}✓ SSH鍵が見つかりました${NC}"
echo ""

# リモートディレクトリのクリーンアップ（オプション）
echo -e "${YELLOW}[3/4] リモートディレクトリのクリーンアップ中...${NC}"
ssh -i "$SSH_KEY" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -p "$SFTP_PORT" \
    "${SFTP_USER}@${SFTP_HOST}" \
    "rm -rf ${REMOTE_DIR}/* 2>/dev/null || true" 2>/dev/null || true
echo -e "${GREEN}✓ クリーンアップ完了${NC}"
echo ""

# ファイルのアップロード
echo -e "${YELLOW}[4/4] ファイルをアップロード中...${NC}"
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}エラー: ソースディレクトリが見つかりません: $SOURCE_DIR${NC}"
    exit 1
fi

# rsyncを使ってアップロード（再帰的、パーミッション保持）
rsync -avz \
    -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p $SFTP_PORT" \
    "$SOURCE_DIR/" \
    "${SFTP_USER}@${SFTP_HOST}:${REMOTE_DIR}/" \
    2>&1 | grep -v "Warning: Permanently added"

echo ""
echo -e "${GREEN}✓ アップロード完了！${NC}"
echo ""

# アップロード結果の確認
echo -e "${YELLOW}アップロードされたファイル一覧:${NC}"
ssh -i "$SSH_KEY" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -p "$SFTP_PORT" \
    "${SFTP_USER}@${SFTP_HOST}" \
    "find ${REMOTE_DIR} -type f | sort" 2>/dev/null | sed 's/^/  /'

echo ""
echo -e "${GREEN}=== 完了 ===${NC}"
