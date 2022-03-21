CREATE SCHEMA "Mongo original" AUTHORIZATION enterprisedb;
COMMENT ON SCHEMA "Mongo original" IS 'Schema for original MongoDB''s collectios without data transformations except PostgreSQL''s typisation';

CREATE SCHEMA "PastVu base" AUTHORIZATION enterprisedb;
COMMENT ON SCHEMA "PastVu base" IS 'Schema for normalised and decoded views';

CREATE TABLE "PastVu base".dir (
    dir varchar(4) NOT NULL,
    α float4 NOT NULL,
    CONSTRAINT dir_pk PRIMARY KEY (dir)
);

INSERT INTO "PastVu base".dir (dir,α) VALUES
     ('n',0.0),
     ('ne',45.0),
     ('e',90.0),
     ('se',135.0),
     ('s',180.0),
     ('sw',225.0),
     ('w',270.0),
     ('nw',315.0);

 CREATE FOREIGN TABLE "Mongo original"."photos" (
    _id name,
    type int2,
    user name,
    s int,
    cid int,
    path varchar(128),
    file varchar(128),
    ldate timestamptz,
    sdate timestamptz,
    mime varchar(64),
    size int,
    r2d json,
    title varchar(512),
    frags text,
    watersignText text,
    __v int,
    converted timestamptz,
    format varchar(32),
    h int,
    hs int,
    sign varchar(64),
    signs varchar(64),
    w int,
    waterh int,
    waterhs int,
    watersignTextApplied timestamptz,
    ws int,
    r0 int,
    r1 int,
    r2 int,
    r3 int,
    r4 int,
    r5 int,
    geo json,
    y int,
    year int,
    year2 int,
    cdate timestamptz,
    stdate timestamptz,
    adate timestamptz,
    vcount int,
    vdcount int,
    vwcount int,
    author text,
    "desc" text,
    dir varchar(8),
    "source" text,
    ucdate timestamptz,
    ccount int
    )
SERVER "PastVu MongoDB server"
OPTIONS (database 'pastvu', collection 'photos');

-- "PastVu base".photos source

CREATE OR REPLACE VIEW "PastVu base".photos
AS SELECT p._id,
    p.type,
    p."user",
    p.s,
    p.cid,
    p.path,
    p.file,
    p.ldate,
    p.sdate,
    p.mime,
    p.size,
    p.r2d,
    p.title,
    p.frags,
    p.watersigntext,
    p.__v,
    p.converted,
    p.format,
    p.h,
    p.hs,
    p.sign,
    p.signs,
    p.w,
    p.waterh,
    p.waterhs,
    p.watersigntextapplied,
    p.ws,
    p.r0,
    p.r1,
    p.r2,
    p.r3,
    p.r4,
    p.r5,
    p.geo,
    p.y,
    p.year,
    p.year2,
    p.cdate,
    p.stdate,
    p.adate,
    p.vcount,
    p.vdcount,
    p.vwcount,
    p.author,
    p."desc",
    p.dir,
    d.α,
    p.source,
    p.ucdate,
    p.ccount
   FROM "Mongo original".photos p
   left join "PastVu base".dir d
   on p.dir = d.dir
   ;
 

CREATE FOREIGN TABLE "Mongo original"."regions" (  
    _id name,
    title_local varchar(256),
    title_en varchar(256),
    geo json,
    cid int,
    udate timestamptz,
    cdate timestamptz,
    parents int[],
    __v int,
    pointsnum int,
    bbox double precision[],
    center double precision[],
    centerAuto bool,
    polynum json,
    photostat json,
    paintstat json,
    cstat json,
    cuser name
)
SERVER "PastVu MongoDB server"
OPTIONS (database 'pastvu', collection 'regions');

CREATE FOREIGN TABLE "Mongo original"."reasons" (  
    _id name,
    cid int,
    title varchar(256),
    "desc" json
)
SERVER "PastVu MongoDB server"
OPTIONS (database 'pastvu', collection 'reasons');

CREATE FOREIGN TABLE "Mongo original"."sessions" (  
    _id name,
    "key" varchar(64),
    stamp timestamptz,
    data json,
    created timestamptz,
    "user" name,
    previous varchar(64),
    __v int 
)
SERVER "PastVu MongoDB server"
OPTIONS (database 'pastvu', collection 'sessions');

CREATE OR REPLACE VIEW "PastVu base".sessions
AS SELECT s._id,
    s.key,
    s.stamp,
    s.data->>'lang' "lang",
    s.data->>'ip' "IP addr",
    s.data->'headers' "headers",
    s.data->'agent'->>'n' "n",
    s.data->'agent'->>'v' "v",
    s.data->'agent'->>'os' "os",
    s.data->'agent'->>'d' "d",
    s.created,
    s."user",
    s.previous,
    s.__v
   FROM "Mongo original".sessions s;


CREATE FOREIGN TABLE "Mongo original"."users" (
_id name, 
__v int,
activatedate timestamptz,
active varchar(8),
birthdate timestamptz, 
ccount int,
cid int, 
city text,
country text,
disp text,
email text, 
"firstName" text,
"lastName" text, 
login text,
"loginAttempts" int, 
pass varchar(128),
pcount int,
regdate timestamptz,
role int,
settings json,
sex varchar(8),
work text, 
"regionHome" name, 
pdcount int, 
"watersignCustom" text,
dateFormat varchar(32),
mod_regions int[],
ranks int[],
pfcount int,
regions int[],
bcount int  
)
SERVER "PastVu MongoDB server"
OPTIONS (database 'pastvu', collection 'users');

CREATE OR REPLACE VIEW "PastVu base".users
AS SELECT u._id,
    u.__v,
    u.activatedate,
    u.active,
    u.birthdate,
    u.ccount,
    u.cid,
    u.city,
    u.country,
    u.disp,
    u.email,
    u."firstName",
    u."lastName",
    u.login,
    u."loginAttempts",
    u.pass,
    u.pcount,
    u.regdate,
    u.role,
    u.settings->> 'photo_show_watermark' "photo_show_watermark",
    u.settings->> 'r_as_home' "r_as_home",
    u.settings->> 'r_f_user_gal' "r_f_user_gal",
    u.settings->> 'r_f_photo_user_gal' "r_f_photo_user_gal",
    u.settings->> 'subscr_throttle' "subscr_throttle",
    u.settings->> 'subscr_auto_reply' "subscr_auto_reply",
    u.settings->> 'photo_watermark_add_sign' "photo_watermark_add_sign",
    u.settings->> 'photo_watermark_let_download_pure' "photo_watermark_let_download_pure",
    u.settings->> 'photo_disallow_download_origin' "photo_disallow_download_origin",
    u.settings-> 'photo_filter_type' "photo_filter_type",
    u.settings->> 'comment_show_deleted' "comment_show_deleted",    
    u.sex,
    u.work,
    u."regionHome",
    u.pdcount,
    u."watersignCustom",
    u.dateformat,
    u.mod_regions,
    u.ranks,
    u.pfcount,
    u.regions,
    u.bcount
   FROM "Mongo original".users u;
