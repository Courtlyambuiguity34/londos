#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
MODE=${1:-local}

docker_ready() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

wait_for_docker() {
  attempts=0
  while [ "$attempts" -lt 90 ]; do
    if docker_ready; then return 0; fi
    attempts=$((attempts + 1))
    sleep 2
  done
  return 1
}

install_docker_linux() {
  if ! command -v sudo >/dev/null 2>&1; then
    echo "Automatic Docker installation needs sudo. Install Docker Engine, then rerun this shortcut." >&2
    exit 1
  fi
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y docker.io
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y docker
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y docker
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --needed --noconfirm docker
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper --non-interactive install docker
  else
    echo "No supported system package manager was found. Install Docker Engine, then rerun this shortcut." >&2
    exit 1
  fi
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$(id -un)"
}

ensure_docker() {
  if docker_ready; then return 0; fi
  platform=$(uname -s)
  case "$platform" in
    Darwin)
      if ! command -v docker >/dev/null 2>&1; then
        if ! command -v brew >/dev/null 2>&1; then
          echo "Automatic verified Docker Desktop installation on macOS needs Homebrew (https://brew.sh)." >&2
          exit 1
        fi
        brew install --cask docker
      fi
      open -a Docker
      ;;
    Linux)
      if ! command -v docker >/dev/null 2>&1; then install_docker_linux; fi
      if command -v systemctl >/dev/null 2>&1; then sudo systemctl start docker || true; fi
      ;;
    *)
      echo "Unsupported platform: $platform." >&2
      exit 1
      ;;
  esac
  if ! wait_for_docker; then
    echo "Docker was installed or found, but this account cannot reach its daemon." >&2
    echo "Start Docker Desktop, or sign out and back in after Docker group membership was added, then rerun." >&2
    exit 1
  fi
}

if [ "$MODE" = "local" ] || [ "$MODE" = "full" ]; then ensure_docker; fi
exec "$ROOT/scripts/local/run-with-node.sh" --bootstrap install "$MODE"
