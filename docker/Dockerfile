ARG NODE_TAG=16.10.0

FROM node:${NODE_TAG}
RUN apt-get update && apt-get install -y \
    graphicsmagick \
    webp \
&& rm -rf /var/lib/apt/lists/*
COPY ./imagick-policy.xml /etc/ImageMagick-6/policy.xml
WORKDIR /code
COPY ./dev-entrypoint.sh /usr/local/bin/
RUN mkdir -p /store && chown -R node:node /store
USER node
ENTRYPOINT ["dev-entrypoint.sh"]
