#!/bin/sh
mongorestore --drop --gzip --nsInclude="pastvu.*" --archive < /pastvu.gz
mongo pastvu --eval "db.init_complete.insertOne({status: 'done', timestamp: new Date()})"
