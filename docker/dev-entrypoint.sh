#!/bin/sh
set -e

CONFIG="./config/local.config.js"

if [ ! -f "${CONFIG}" ]; then
  echo "${CONFIG} is missing. Create one by running 'cp ${CONFIG}.docker-example ${CONFIG} "
  exit 1;
fi

# 'run MODULE [options]' special command to run script directly with node, so that system signals are relayed to the process.
if [ "$1" = 'run' -a -f "./${2}.js" ]; then
  MODULE=$2
  shift 2
  exec node ./bin/run.js --script "./${MODULE}.js" "$@"
fi

# Fallback to node image entrypoint.
exec docker-entrypoint.sh "$@"
