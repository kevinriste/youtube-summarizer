#!/bin/bash
set -euo pipefail

REPO_URL="https://github.com/danielxceron/youtube-transcript.git"
BRANCH="fix/captions-parsing-fallback-issue-45"
PACKAGE_NAME="youtube-transcript"
WORKDIR=".vendor_temp"

echo "==> Cloning $REPO_URL (branch: $BRANCH)..."
rm -rf "$WORKDIR"
git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$WORKDIR"

echo "==> Building package..."
pushd "$WORKDIR" >/dev/null
npm install
npm run build
PKG_VERSION=$(node -p "require('./package.json').version")
VENDOR_TGZ="${PACKAGE_NAME}-${PKG_VERSION}.tgz"
npm pack --pack-destination ../
popd >/dev/null

echo "==> Cleaning up temp directory..."
rm -rf "$WORKDIR"

echo "==> Removing old tarballs and lockfile..."
rm -f "${PACKAGE_NAME}-"*.tgz
rm -f package-lock.json

echo "==> Using new tarball: $VENDOR_TGZ"
# At this point, the new tarball is already created by npm pack in the working dir

echo "==> Updating package.json to use local tarball..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies['$PACKAGE_NAME'] = 'file:./$VENDOR_TGZ';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "==> Reinstalling with updated package.json..."
npm install

echo "==> Done. Vendored $PACKAGE_NAME@$PKG_VERSION as $VENDOR_TGZ"
