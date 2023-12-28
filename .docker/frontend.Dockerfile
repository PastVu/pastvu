FROM nginx:1.21.3
COPY ./appBuild/public/ /usr/share/nginx/html/
