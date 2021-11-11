ARG NODE_TAG=16.10.0

FROM node:${NODE_TAG} AS base
RUN apt-get update && apt-get install -y \
    graphicsmagick \
    webp \
&& rm -rf /var/lib/apt/lists/*
COPY ./docker/imagick-policy.xml /etc/ImageMagick-6/policy.xml

FROM node:${NODE_TAG} AS builder
WORKDIR /build
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM base
WORKDIR /code
ENV NODE_ENV production
COPY --from=builder /appBuild/ .
RUN npm install --production
RUN mkdir /store && chown node:node /store
USER node
CMD ["bin/run"]