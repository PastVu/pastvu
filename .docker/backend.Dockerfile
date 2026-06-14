ARG NODE_TAG=26.3.0

FROM node:${NODE_TAG} AS base
RUN apt-get update && apt-get install -y \
    graphicsmagick \
    webp \
 && rm -rf /var/lib/apt/lists/*
COPY ./.docker/imagick-policy.xml /etc/ImageMagick-6/policy.xml
WORKDIR /code

FROM base AS dev
COPY ./.docker/dev-entrypoint.sh /usr/local/bin/
RUN mkdir -p /store && chown -R node:node /store
USER node
ENTRYPOINT ["dev-entrypoint.sh"]

# Prod stays last so CI's build-push-action (no --target) resolves here.
FROM base AS prod
ENV NODE_ENV=production
COPY ./appBuild/ .
RUN npm pkg delete scripts.prepare && npm install --production
RUN mkdir /store && chown node:node /store
RUN mkdir /sitemap && chown node:node /sitemap
USER node
CMD ["bin/run"]
