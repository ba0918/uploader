#!/bin/bash
# テスト用: testuserにsudo権限を付与

# sudoパッケージをインストール
if ! command -v sudo &> /dev/null; then
    apk add --no-cache sudo
fi

# linuxserver/openssh-serverが追加するパスワード必要なルールを削除
# (@includedirの後に追加されるため、NOPASSWDを上書きしてしまう)
sed -i '/^testuser ALL=(ALL) ALL$/d' /etc/sudoers

# testuserにパスワードなしsudo権限を付与（TTY不要）
cat > /etc/sudoers.d/testuser << 'EOF'
Defaults:testuser !requiretty
testuser ALL=(ALL) NOPASSWD: ALL
EOF
chmod 440 /etc/sudoers.d/testuser

echo "Sudo access enabled for testuser"
