#!/bin/sh
set -e

mongorestore --drop --gzip --db pastvu --archive=/pastvu.gz
mongo pastvu --eval "db.init_complete.insertOne({status: 'done', timestamp: new Date()})"
