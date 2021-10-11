#!/bin/sh
ARCHIVE=/pastvu.gz
test -f $ARCHIVE || exit 1
mongorestore --gzip --db pastvu --archive=$ARCHIVE