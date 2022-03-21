-- SQL script for PosgtreSQL's admin user "postgres"
-- You must connect to a database will used for PastVu's MongoDB data mapping
-- You must to create a user will used for reading from PastVu's MongoDB and, maybe, writing to PastVu's MongoDB depends on permisions

CREATE EXTENSION mongo_fdw;

-- DROP SERVER "PastVu MongoDB server" cascade;
-- FDW server, ONLY NETWORK CREDITAILS to access MongoDB from PostgreSQL
CREATE SERVER "PastVu MongoDB server"
    FOREIGN DATA WRAPPER mongo_fdw
    OPTIONS (address '127.0.0.1', port '27017');

-- FDW server, ONLY ACCESS CREDITAILS
CREATE USER MAPPING FOR postgres -- replace postgres to YOUR user if other user will be used. postgres isn't recommended 
    SERVER "PastVu MongoDB server"; -- NO ACCESS OPTIONS USERNAME OR PASSWORD for development environment
