#!/bin/bash
# cleanup-sftp.sh
# SFTPコンテナのアップロードディレクトリを掃除するスクリプト
#
# 使用方法:
#   ./tests/integration/scripts/cleanup-sftp.sh
#
# 対象ディレクトリ:
#   /upload, /upload2, /upload3, /upload4

set -e

CONTAINER_NAME="inv-sftp-1"
UPLOAD_DIRS=("/upload" "/upload2" "/upload3" "/upload4")

# カラー出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== SFTP Container Cleanup ==="

# コンテナが起動しているか確認
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}Error: Container '${CONTAINER_NAME}' is not running.${NC}"
    echo "Start the container with: docker compose -f docker-compose.test.yml up -d"
    exit 1
fi

echo -e "${GREEN}Container '${CONTAINER_NAME}' is running.${NC}"

# 各ディレクトリをクリーンアップ
for dir in "${UPLOAD_DIRS[@]}"; do
    echo -n "Cleaning ${dir}... "

    # ディレクトリが存在するか確認
    if docker exec "${CONTAINER_NAME}" test -d "${dir}" 2>/dev/null; then
        # ディレクトリ内のファイル/フォルダを削除（ディレクトリ自体は残す）
        # .gitkeep などの隠しファイルも含めて削除
        docker exec "${CONTAINER_NAME}" sh -c "rm -rf ${dir}/* ${dir}/.[!.]* ${dir}/..?* 2>/dev/null || true"
        echo -e "${GREEN}done${NC}"
    else
        echo -e "${YELLOW}skipped (not exists)${NC}"
    fi
done

echo ""
echo -e "${GREEN}=== Cleanup completed ===${NC}"

# 確認用: 各ディレクトリの状態を表示
echo ""
echo "Current state:"
for dir in "${UPLOAD_DIRS[@]}"; do
    if docker exec "${CONTAINER_NAME}" test -d "${dir}" 2>/dev/null; then
        count=$(docker exec "${CONTAINER_NAME}" sh -c "ls -A ${dir} 2>/dev/null | wc -l")
        echo "  ${dir}: ${count} items"
    else
        echo "  ${dir}: (not exists)"
    fi
done
