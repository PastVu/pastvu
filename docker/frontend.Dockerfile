ARG IMAGE=pastvu/pastvu:latest
FROM ${IMAGE} AS app

FROM nginx:1.21.3
COPY --from=app /code/public /usr/share/nginx/html