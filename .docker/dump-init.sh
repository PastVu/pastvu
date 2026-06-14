#!/bin/sh
set -e

if [ -f /dump/pastvu.gz ]; then
    echo "dump already present, skipping download"
else
    echo "downloading pastvu.gz..."
    curl -fL --progress-bar -o /dump/pastvu.gz https://archive.varlamov.me/pastvu/github/pastvu.gz
fi
