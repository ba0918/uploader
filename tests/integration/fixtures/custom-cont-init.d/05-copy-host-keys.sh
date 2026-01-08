#!/bin/bash
# Copy persistent SSH host keys to /etc/ssh/
# This ensures the SSH host keys remain consistent across container rebuilds,
# preventing known_hosts conflicts.

HOST_KEYS_DIR="/config/ssh_host_keys"
TARGET_DIR="/etc/ssh"

if [ -d "$HOST_KEYS_DIR" ]; then
    for key_file in "$HOST_KEYS_DIR"/ssh_host_*; do
        if [ -f "$key_file" ]; then
            key_name=$(basename "$key_file")
            cp "$key_file" "$TARGET_DIR/$key_name"
            # Set proper permissions
            if [[ "$key_name" == *.pub ]]; then
                chmod 644 "$TARGET_DIR/$key_name"
            else
                chmod 600 "$TARGET_DIR/$key_name"
            fi
            echo "Copied $key_name to $TARGET_DIR"
        fi
    done
    echo "SSH host keys copied successfully"
else
    echo "Warning: $HOST_KEYS_DIR not found, using default host keys"
fi
