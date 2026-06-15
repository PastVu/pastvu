#!/bin/sh
set -e

if [ -f /dump/pastvu.gz ]; then
    echo "dump already present, skipping download"
else
    echo "downloading pastvu.gz..."
    # Download to a temp path so a failed transfer doesn't masquerade as a complete dump on the next run.
    curl -fL --progress-bar -o /dump/pastvu.gz.tmp https://github.com/PastVu/dump/raw/refs/heads/main/pastvu.gz
    mv /dump/pastvu.gz.tmp /dump/pastvu.gz
fi