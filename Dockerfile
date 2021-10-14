ARG NODE_TAG=16.10.0
FROM node:$NODE_TAG
RUN apt-get update && apt-get install -y \
    graphicsmagick \
    webp \
    wait-for-it \
&& rm -rf /var/lib/apt/lists/*
COPY ./docker/imagick-policy.xml /etc/ImageMagick-6/policy.xml
WORKDIR /code

COPY ./docker/dev-entrypoint.sh /usr/local/bin/
ENTRYPOINT ["dev-entrypoint.sh"]