FROM nginx:1.21.3
COPY --from=pastvu/pastvu:latest /code/public /usr/share/nginx/html