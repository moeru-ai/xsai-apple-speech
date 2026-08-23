#!/bin/sh
set -eu

package_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
architecture=${TARGET_ARCH:-$(uname -m)}
case "$architecture" in
  arm64) node_arch=arm64 ;;
  x86_64) node_arch=x64 ;;
  *) echo "Unsupported macOS architecture: $architecture" >&2; exit 1 ;;
esac

xcode_version=$(xcodebuild -version | sed -n '1s/^Xcode //p')
sdk_version=$(xcrun --sdk macosx --show-sdk-version)
case "$xcode_version" in
  2[6-9].*|[3-9][0-9].*) ;;
  *) echo "Xcode 26 or later is required. Found: $xcode_version" >&2; exit 1 ;;
esac
case "$sdk_version" in
  2[6-9].*|[3-9][0-9].*) ;;
  *) echo "A macOS 26 SDK or later is required. Found: $sdk_version" >&2; exit 1 ;;
esac

node_executable=$(node -p 'process.execPath')
node_prefix=$(dirname -- "$(dirname -- "$node_executable")")
node_include_dir=${NODE_INCLUDE_DIR:-"$node_prefix/include/node"}
if [ ! -f "$node_include_dir/node_api.h" ]; then
  echo "node_api.h was not found under $node_include_dir. Set NODE_INCLUDE_DIR." >&2
  exit 1
fi

build_dir=$(mktemp -d "${TMPDIR:-/tmp}/xsai-apple-speech.XXXXXX")
output_dir="$package_dir/npm/darwin-$node_arch"
trap 'rm -rf -- "$build_dir"' EXIT HUP INT TERM
mkdir -p "$output_dir"

target="$architecture-apple-macosx26.0"
swift_header="$build_dir/AppleSpeechBridge-Swift.h"
swift_library="$build_dir/libAppleSpeechBridge.a"

swiftc \
  -parse-as-library \
  -target "$target" \
  -module-name AppleSpeechBridge \
  -emit-module \
  -emit-objc-header \
  -emit-objc-header-path "$swift_header" \
  -emit-library \
  -static \
  "$package_dir/Sources/AppleSpeechBridge.swift" \
  -o "$swift_library"

clang++ \
  -std=c++17 \
  -fobjc-arc \
  -mmacosx-version-min=26.0 \
  -target "$target" \
  -I"$node_include_dir" \
  -I"$build_dir" \
  -c "$package_dir/native/addon.mm" \
  -o "$build_dir/addon.o"

swiftc \
  -target "$target" \
  -emit-library \
  "$build_dir/addon.o" \
  "$swift_library" \
  -framework AVFAudio \
  -framework CoreMedia \
  -framework Foundation \
  -framework Speech \
  -Xlinker -lc++ \
  -Xlinker -undefined \
  -Xlinker dynamic_lookup \
  -o "$output_dir/apple-speech-transcription.node"

echo "Built $output_dir/apple-speech-transcription.node"
