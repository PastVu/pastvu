FROM node AS builder
WORKDIR code
COPY . .
RUN npm install
RUN npm install -g grunt
RUN grunt

FROM node
ENV LANG en
ENV NODE_ENV production
RUN apt-get update && apt-get -y install graphicsmagick webp
COPY ./imagick/policy.xml /etc/ImageMagick-6/policy.xml
WORKDIR /code
COPY --from=builder /appBuild/ .
RUN npm install --production
CMD node --max-old-space-size=4096 /code/bin/run.js --script /code/${MODULE}.js --config /config/pastvu.config.js
