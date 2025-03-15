#!/bin/sh

mongorestore --drop --gzip --db pastvu --archive=/dump/pastvu.gz
