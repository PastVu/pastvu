#!/bin/sh
set -e

[ ! -f ./config/local.config.js ] && cp ./config/local.config.js.docker-example ./config/local.config.js

# 'run MODULE [options]' special command to run script directly with node, so that system signals are relayed to the process.
if [ "$1" = 'run' -a -f "./${2}.js" ]; then
  MODULE=$2
  wait-for-it -t 0 mongo:27017
  shift 2
  exec node ./bin/run.js --script "./${MODULE}.js" "$@"
fi

# Fallback to node image entrypoint.
exec docker-entrypoint.sh "$@"