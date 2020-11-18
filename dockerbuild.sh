#!/bin/bash
set -ex

# BUILD DOCKER IMAGES FOR PRODUCTION USE

# FIRST, DETERMINE PACKAGE VERSION

TAG=v$(npx -c 'echo "$npm_package_version"')
TAG_EN=$TAG-en

git fetch --all --tags

# CHECK IF ALL NEEDED TAGS EXIST
git checkout $TAG_EN
git checkout $TAG

# BUILD RUSSIAN VERSION
docker build -t pastvu/pastvu:$TAG .
docker push pastvu/pastvu:$TAG

# BUILD ENGLISH VERSION 
git checkout $TAG_EN
docker build -t pastvu/pastvu:$TAG_EN .
docker push pastvu/pastvu:$TAG_EN

git checkout master

# BUILD FRONTEND
cd /tmp
rm -rf nginx
git clone https://github.com/pastvu/nginx
cd nginx

docker build \
	--build-arg TAG=$TAG \
	--build-arg TAG_EN=$TAG \
	-t pastvu/nginx:$TAG \
	.
docker push pastvu/nginx:$TAG
