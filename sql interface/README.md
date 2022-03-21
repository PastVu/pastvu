# PostgreSQL semirelational inteface to PastVu's Mongo database

This interface need [PostgreSQL](https://www.postgresql.org) compatible with [mongo_fdw](https://github.com/EnterpriseDB/mongo_fdw) (PostgreSQL's foregin data wraper for MongoDB's collections).

## Environment setup
1. Install PostgreSQL 

[PostGIS](https://postgis.net) isn't needed, but can be useful later

2. Install/compile [mongo_fdw](https://github.com/EnterpriseDB/mongo_fdw) extension

Usually You also need to compile [mongo-c-driver](https://github.com/mongodb/mongo-c-driver) developed in tandem with mongo_fdw.

3. Execute admin.sql

4. Execute data.sql

## Status of the SQL interface
*This interface isn't obligatory for PastVu debugging or contributing*

 The interface is experimental for admin's views, data analysis and API's experiments.
