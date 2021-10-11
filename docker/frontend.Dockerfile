ARG IMAGE=pastvu/pastvu:latest
FROM nginx:1.21.3
COPY --from=${IMAGE} /code/public /usr/share/nginx/html