#!/bin/sh

# This test database restore script is designed to be bind mounted inside mongo
# container at /usr/local/bin/initdb location, then called on started container as
# 'docker-compose exec mongo initdb'.
if ! command -v curl; then
    echo "Installing curl"
    apt update -qq  && apt-get install -yqq curl
fi
echo "Downloading db dump..."
curl --progress-bar -o /tmp/pastvu.gz https://archive.varlamov.me/pastvu/github/pastvu.gz
mongorestore --drop --gzip --db pastvu --archive=/tmp/pastvu.gz
rm /tmp/pastvu.gz
