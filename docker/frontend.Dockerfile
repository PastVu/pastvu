ARG NODE_TAG=16.10.0

FROM node:${NODE_TAG} AS builder
WORKDIR /build
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.21.3
COPY --from=builder /appBuild/public/ /usr/share/nginx/html/