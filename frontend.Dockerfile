ARG IMAGE=pastvu/pastvu:latest
FROM ${IMAGE} AS app

FROM nginx
COPY --from=app /code/public /usr/share/nginx/html
