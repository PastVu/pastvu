#!/bin/sh
set -e

mongorestore --drop --gzip --db pastvu --archive=/dump/pastvu.gz
