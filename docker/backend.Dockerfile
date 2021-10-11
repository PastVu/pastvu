ARG NODE_TAG=16.10.0

FROM node:$NODE_TAG as base
WORKDIR /code
RUN apt-get update && apt-get install -y \
    graphicsmagick \
    webp \
&& rm -rf /var/lib/apt/lists/*
COPY ./docker/imagick-policy.xml /etc/ImageMagick-6/policy.xml

FROM base AS builder
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM base
ENV LANG ru
ENV MODULE app
ENV NODE_ENV production
ENV CONFIG /config.js
COPY --from=builder /appBuild/ .
COPY ./docker/docker-healthcheck.sh .
RUN npm install --production
CMD ["bin/run"]