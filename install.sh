#!/bin/sh
set -e

REPO="ba0918/uploader"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="uploader"

# OS/Arch detection
detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="macos" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    *) echo "Unsupported OS: $OS"; exit 1 ;;
  esac

  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
  esac

  if [ "$PLATFORM" = "windows" ]; then
    ASSET_NAME="uploader-${PLATFORM}-${ARCH}.exe"
  else
    ASSET_NAME="uploader-${PLATFORM}-${ARCH}"
  fi
}

# Download and install
install() {
  detect_platform

  echo "Detected platform: ${PLATFORM}-${ARCH}"
  echo "Downloading ${ASSET_NAME}..."

  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"
  TMP_FILE="$(mktemp)"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$DOWNLOAD_URL" -o "$TMP_FILE"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$DOWNLOAD_URL" -O "$TMP_FILE"
  else
    echo "Error: curl or wget is required"
    exit 1
  fi

  chmod +x "$TMP_FILE"

  # Install to INSTALL_DIR
  if [ -w "$INSTALL_DIR" ]; then
    mv "$TMP_FILE" "${INSTALL_DIR}/${BINARY_NAME}"
  else
    echo "Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo mv "$TMP_FILE" "${INSTALL_DIR}/${BINARY_NAME}"
  fi

  echo ""
  echo "Successfully installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"
  echo "Run 'uploader --help' to get started"
}

install
