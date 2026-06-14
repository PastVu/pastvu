#!/bin/sh
set -e

CONFIG=/code/config/local.config.js

if [ -f "$CONFIG" ]; then
    echo "$CONFIG already present, skipping"
else
    echo "creating $CONFIG from docker-example..."
    cp "$CONFIG.docker-example" "$CONFIG"
fi
