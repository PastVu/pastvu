#!/bin/bash
# This file is used in Dockerfile to healthcheck application

# Checking app module
if test "$MODULE" = "app"
then
curl --fail http://localhost:3000 || exit 1
fi