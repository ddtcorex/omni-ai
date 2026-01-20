#!/bin/bash
set -e

# Change directory to the project root (one level up from scripts/)
cd "$(dirname "$0")/.."

# Check requirements
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required."
    exit 1
fi

if ! command -v zip &> /dev/null; then
    echo "Error: zip is required."
    exit 1
fi

# Extract version from manifest.json using Python for reliability
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
# Ensure dist directory exists
mkdir -p dist
ZIP_NAME="dist/omni-ai-v${VERSION}.zip"

echo "🚀 Preparing to package Omni AI v${VERSION}..."

# Create a backup of the development manifest (which contains the key)
echo "   Backing up manifest.json..."
cp manifest.json manifest.json.bak

# Remove the 'key' field using Python
echo "   Removing 'key' field for production build..."
python3 -c "
import json
with open('manifest.json', 'r') as f:
    data = json.load(f)
if 'key' in data:
    del data['key']
with open('manifest.json', 'w') as f:
    json.dump(data, f, indent=2)
"

# Create the zip file
echo "   📦 Creating archive: $ZIP_NAME"
# Note: Excluding git/idea/vscode related files, though explicit list is safer
zip -r "$ZIP_NAME" \
    manifest.json \
    background/ \
    content/ \
    lib/ \
    assets/ \
    popup/ \
    _locales/ \
    settings.html \
    settings.js \
    settings.css

# Restore the original manifest (with key)
echo "   Restoring development manifest.json..."
mv manifest.json.bak manifest.json

echo "✅ build success: $ZIP_NAME"
