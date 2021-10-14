#!/bin/sh
curl -s -o /tmp/pastvu.gz https://varlamov.me/pastvu/github/pastvu.gz
mongorestore --gzip --db pastvu --archive=/tmp/pastvu.gz
rm /tmp/pastvu.gz