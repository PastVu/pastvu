FROM nginx:1.21.3
COPY ./.docker/frontend.nginx.conf /etc/nginx/conf.d/default.conf
COPY ./appBuild/public/ /usr/share/nginx/html/
