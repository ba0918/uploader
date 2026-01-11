#!/bin/bash
set -e

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== アップロード結果検証スクリプト ===${NC}\n"

# 引数チェック
if [ "$#" -ne 2 ]; then
    echo -e "${RED}使用法: $0 <local_dir> <remote_base_dir>${NC}"
    echo "例: $0 ./tests/integration/fixtures/testdata/local/example example"
    exit 1
fi

LOCAL_DIR="$1"
REMOTE_BASE="$2"
SSH_KEY="./tests/integration/fixtures/ssh-keys/test_key"
SSH_PORT="2222"
SSH_USER="testuser"
SSH_HOST="localhost"

# 一時ディレクトリ作成
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo -e "${YELLOW}[1/3] リモートファイルをダウンロード中...${NC}"

# リモートからファイルをダウンロード
rsync -avz --delete \
    --exclude='.*' --exclude='.ignore_dir' --exclude='.ignore_dir2' \
    -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -p ${SSH_PORT} -i ${SSH_KEY}" \
    "${SSH_USER}@${SSH_HOST}:/upload/${REMOTE_BASE}/" \
    "${TEMP_DIR}/" 2>&1 | grep -v "^receiving\|^sent\|^total"

echo -e "${GREEN}✓ ダウンロード完了${NC}\n"

echo -e "${YELLOW}[2/3] ファイル内容を比較中...${NC}"

# リモートの空ディレクトリを見つけて除外リストを作成
EMPTY_DIRS=$(find "${TEMP_DIR}" -type d -empty -printf '%P\n')

# diffで比較（-rは再帰、-qは差分があるファイルのみ表示）
# ignoreパターンに一致するファイルと空ディレクトリを除外
DIFF_OUTPUT=$(diff -rq "${LOCAL_DIR}" "${TEMP_DIR}" 2>&1 || true)

# ignoreパターンに一致するファイルを除外
DIFF_OUTPUT=$(echo "$DIFF_OUTPUT" | grep -v "Only in.*: \\.gitignore" || true)
DIFF_OUTPUT=$(echo "$DIFF_OUTPUT" | grep -v "Only in.*: \\.ignore_dir" || true)
DIFF_OUTPUT=$(echo "$DIFF_OUTPUT" | grep -v "Only in.*: \\.ignore_dir2" || true)

# 空ディレクトリを除外
if [ -n "$EMPTY_DIRS" ]; then
    while IFS= read -r empty_dir; do
        if [ -n "$empty_dir" ]; then
            DIFF_OUTPUT=$(echo "$DIFF_OUTPUT" | grep -v "Only in.*: $(basename "$empty_dir")\$" || true)
        fi
    done <<< "$EMPTY_DIRS"
fi

if [ -z "$DIFF_OUTPUT" ]; then
    echo -e "${GREEN}✓ すべてのファイルが一致しています！${NC}\n"
else
    echo -e "${RED}✗ 差分が見つかりました：${NC}"
    echo "$DIFF_OUTPUT"
    echo ""
    exit 1
fi

echo -e "${YELLOW}[3/3] ファイル数とサイズを確認中...${NC}"

# ファイル数とサイズを比較（ignoreパターンを除外）
LOCAL_COUNT=$(find "${LOCAL_DIR}" -type f \
    ! -name ".*" \
    ! -path "*/.ignore_dir/*" \
    ! -path "*/.ignore_dir2/*" \
    | wc -l)
REMOTE_COUNT=$(find "${TEMP_DIR}" -type f | wc -l)

LOCAL_SIZE=$(find "${LOCAL_DIR}" -type f \
    ! -name ".*" \
    ! -path "*/.ignore_dir/*" \
    ! -path "*/.ignore_dir2/*" \
    -exec stat -c%s {} + | awk '{s+=$1} END {print s}')
REMOTE_SIZE=$(du -sb "${TEMP_DIR}" | cut -f1)

echo "  ローカル: ${LOCAL_COUNT}ファイル, ${LOCAL_SIZE}バイト"
echo "  リモート: ${REMOTE_COUNT}ファイル, ${REMOTE_SIZE}バイト"

if [ "$LOCAL_COUNT" -eq "$REMOTE_COUNT" ] && [ "$LOCAL_SIZE" -eq "$REMOTE_SIZE" ]; then
    echo -e "${GREEN}✓ ファイル数とサイズが一致しています！${NC}\n"
else
    echo -e "${RED}✗ ファイル数またはサイズが一致しません${NC}\n"
    exit 1
fi

echo -e "${GREEN}=== 検証成功：アップロードは正しく完了しています ===${NC}"
