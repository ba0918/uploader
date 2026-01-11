#!/bin/bash
#
# ローカルとリモートの差分を表示するスクリプト
#

set -e

# カラー出力
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 設定
SFTP_HOST="localhost"
SFTP_PORT="2222"
SFTP_USER="testuser"
REMOTE_DIR="/upload"
SSH_KEY="$(pwd)/tests/integration/fixtures/ssh-keys/test_key"
LOCAL_DIR="tests/integration/fixtures/testdata/local"
REMOTE_TESTDATA="tests/integration/fixtures/testdata/remote"

echo -e "${GREEN}=== 差分確認スクリプト ===${NC}"
echo ""

# ========================================
# 1. ローカル同士の差分（local vs remote）
# ========================================
echo -e "${BLUE}[1/2] ローカル同士の差分: ${NC}"
echo -e "${YELLOW}  local/  vs  remote/${NC}"
echo ""

if [ -d "$LOCAL_DIR" ] && [ -d "$REMOTE_TESTDATA" ]; then
    echo -e "${YELLOW}追加・変更されるファイル (local → remote):${NC}"
    rsync -avzn --delete "$LOCAL_DIR/example/" "$REMOTE_TESTDATA/example/" 2>&1 | \
        grep -E "^(sending|deleting|\.\/|[^/]+\/$|[^/]+$)" | \
        grep -v "^sending" | \
        sed 's/^/  /'

    echo ""
    echo -e "${YELLOW}詳細な差分:${NC}"
    diff -r "$LOCAL_DIR" "$REMOTE_TESTDATA" 2>&1 | head -30 | sed 's/^/  /'
else
    echo -e "${RED}エラー: ローカルディレクトリが見つかりません${NC}"
fi

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ========================================
# 2. sftpコンテナとの差分（local/example vs /upload/）
# ========================================
echo -e "${BLUE}[2/2] sftpコンテナとの差分: ${NC}"
echo -e "${YELLOW}  local/example/  vs  sftp:/upload/${NC}"
echo ""

# Dockerコンテナの確認
if ! docker compose -f docker-compose.test.yml ps 2>&1 | grep -q "sftp.*Up"; then
    echo -e "${RED}エラー: sftpコンテナが起動していません${NC}"
    echo "以下のコマンドでコンテナを起動してください:"
    echo "  docker compose -f docker-compose.test.yml up -d"
    exit 1
fi

# SSH鍵の確認
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}エラー: SSH鍵が見つかりません${NC}"
    exit 1
fi

# リモートのファイル一覧を取得
echo -e "${YELLOW}リモートのファイル:${NC}"
REMOTE_FILES=$(ssh -i "$SSH_KEY" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -p "$SFTP_PORT" \
    "${SFTP_USER}@${SFTP_HOST}" \
    "find ${REMOTE_DIR} -type f 2>/dev/null | sort" 2>&1 | grep -v "Warning: Permanently added" || echo "")

if [ -z "$REMOTE_FILES" ]; then
    echo -e "  ${RED}(空 - ファイルがありません)${NC}"
    echo ""
    echo -e "${YELLOW}ヒント:${NC} 以下のコマンドでテストデータをアップロードしてください:"
    echo "  ./tests/integration/scripts/upload-testdata.sh"
else
    echo "$REMOTE_FILES" | sed 's/^/  /'
fi

echo ""

# ローカルのファイル一覧
echo -e "${YELLOW}ローカルのファイル (local/example/):${NC}"
if [ -d "$LOCAL_DIR/example" ]; then
    find "$LOCAL_DIR/example" -type f | sort | sed "s|^$LOCAL_DIR/example/|  |"
else
    echo -e "  ${RED}(ディレクトリが見つかりません)${NC}"
fi

echo ""

# rsyncで差分を表示
if [ -n "$REMOTE_FILES" ]; then
    echo -e "${YELLOW}rsync dry-run (local/example/ → sftp:/upload/):${NC}"
    rsync -avzn --delete \
        -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p $SFTP_PORT" \
        "$LOCAL_DIR/example/" \
        "${SFTP_USER}@${SFTP_HOST}:${REMOTE_DIR}/" 2>&1 | \
        grep -v "Warning: Permanently added" | \
        grep -E "^(sending|deleting|\.\/|[^/]+\/$|[^/]+$)" | \
        grep -v "^sending" | \
        sed 's/^/  /'
fi

echo ""
echo -e "${GREEN}=== 完了 ===${NC}"
