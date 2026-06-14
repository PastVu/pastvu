#!/bin/sh
set -e

mongorestore --drop --gzip --db pastvu --archive=/pastvu.gz
