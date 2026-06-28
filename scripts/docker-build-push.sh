#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

IMAGE="${IMAGE:-phamtanminhtien/9router}"
TAG="${TAG:-latest}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH="${PUSH:-1}"

usage() {
  cat <<EOF
Build and optionally push the 9router Docker image.

Usage: $(basename "$0") [options]

Options:
  -i, --image NAME    Image repository (default: phamtanminhtien/9router)
  -t, --tag TAG       Image tag (default: latest)
  -p, --platforms P   Build platforms (default: linux/amd64,linux/arm64)
      --local         Build for current platform only (no buildx, no push)
      --no-push       Build only, skip push
  -h, --help          Show this help

Environment:
  IMAGE, TAG, PLATFORMS, PUSH

Examples:
  $(basename "$0")
  $(basename "$0") --tag v0.5.12
  $(basename "$0") --local
  IMAGE=phamtanminhtien/9router TAG=dev $(basename "$0") --no-push
EOF
}

LOCAL_BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--image)
      IMAGE="$2"
      shift 2
      ;;
    -t|--tag)
      TAG="$2"
      shift 2
      ;;
    -p|--platforms)
      PLATFORMS="$2"
      shift 2
      ;;
    --local)
      LOCAL_BUILD=1
      PUSH=0
      shift
      ;;
    --no-push)
      PUSH=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

FULL_IMAGE="${IMAGE}:${TAG}"

echo "==> Building ${FULL_IMAGE}"

if [[ "$LOCAL_BUILD" -eq 1 ]]; then
  docker build -t "$FULL_IMAGE" -f Dockerfile .
  echo "==> Built ${FULL_IMAGE} (local)"
  exit 0
fi

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required for multi-platform builds. Use --local for single-platform." >&2
  exit 1
fi

BUILDER_NAME="9router-builder"
if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  docker buildx create --name "$BUILDER_NAME" --use
else
  docker buildx use "$BUILDER_NAME"
fi

BUILD_ARGS=(
  --platform "$PLATFORMS"
  -t "$FULL_IMAGE"
  -f Dockerfile
  .
)

if [[ "$PUSH" -eq 1 ]]; then
  echo "==> Pushing ${FULL_IMAGE} to registry"
  BUILD_ARGS+=(--push)
else
  BUILD_ARGS+=(--load)
fi

docker buildx build "${BUILD_ARGS[@]}"

if [[ "$PUSH" -eq 1 ]]; then
  echo "==> Done: ${FULL_IMAGE} pushed"
else
  echo "==> Done: ${FULL_IMAGE} built"
fi