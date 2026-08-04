#!/usr/bin/env bash
# 对比本地 package.json 版本与 npm registry 已发布版本，发布「有更新」的包。
# main push 与 tag push 均适用：已发布的版本自动跳过，避免重复发布失败。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

packages=(pi-status pi-web pi-notify-termux)
published_any=false

for pkg in "${packages[@]}"; do
  pkg_json="packages/$pkg/package.json"
  name="$(node -p "require('./$pkg_json').name")"
  version="$(node -p "require('./$pkg_json').version")"

  published="$(npm view "$name" version 2>/dev/null || echo none)"
  if [[ "$published" == "$version" ]]; then
    echo "skip: $name@$version (already published)"
    continue
  fi

  echo "publish: $name@$version (registry has: $published)"
  npm publish -w "$name" --access public
  published_any=true
done

if [[ "$published_any" == false ]]; then
  echo "nothing to publish"
fi
