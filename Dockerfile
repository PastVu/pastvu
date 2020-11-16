ARG NODE_TAG=15
FROM pastvu/node:$NODE_TAG AS builder
WORKDIR /code
COPY . .
RUN npm install
RUN npm run build

FROM pastvu/node:$NODE_TAG
WORKDIR /code
ENV LANG ru
ENV MODULE app
ENV NODE_ENV production
ENV CONFIG /config.js
COPY --from=builder /appBuild/ .
RUN npm install --production
CMD node --max-old-space-size=4096 /code/bin/run.js --script /code/${MODULE}.js --config ${CONFIG}
