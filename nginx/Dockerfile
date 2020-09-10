FROM pastvu/pastvu AS ru
FROM pastvu/pastvu:en AS en

FROM nginx
RUN rm -r /etc/nginx
COPY --from=ru /code/public /public/ru
COPY --from=en /code/public /public/en
COPY . /etc/nginx
