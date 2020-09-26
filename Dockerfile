FROM node AS builder
WORKDIR code
COPY . .
RUN npm install
RUN npm run build

FROM pastvu/node
ENV LANG ru
ENV MODULE app
ENV NODE_ENV production
WORKDIR /code
COPY --from=builder /appBuild/ .
RUN npm install --production
CMD node --max-old-space-size=4096 /code/bin/run.js --script /code/${MODULE}.js --config /config/pastvu.config.js
