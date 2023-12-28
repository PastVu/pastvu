ARG NODE_TAG=20.10.0

FROM node:${NODE_TAG} AS base
RUN apt-get update && apt-get install -y \
    graphicsmagick \
    webp \
&& rm -rf /var/lib/apt/lists/*
COPY ./.docker/imagick-policy.xml /etc/ImageMagick-6/policy.xml

FROM base
WORKDIR /code
ENV NODE_ENV production
COPY ./appBuild/ .
RUN npm install --production
RUN mkdir /store && chown node:node /store
RUN mkdir /sitemap && chown node:node /sitemap
USER node
CMD ["bin/run"]
