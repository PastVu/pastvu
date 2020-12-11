ARG TAG=latest
FROM pastvu/pastvu:${TAG} AS app

FROM nginx
COPY --from=app /code/public /usr/share/nginx/html
