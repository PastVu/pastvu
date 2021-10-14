FROM pastvu/mongo:3.2.22
RUN apt-get update && apt-get install -y curl
COPY ./dev-initdb.sh /docker-entrypoint-initdb.d/initdb.sh