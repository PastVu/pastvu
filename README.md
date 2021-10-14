# PastVu
![GitHub package.json version](https://img.shields.io/github/package-json/v/pastvu/pastvu)
![Node.js CI](https://github.com/PastVu/pastvu/workflows/Node.js%20CI/badge.svg)
![Docker Image CI](https://github.com/PastVu/pastvu/workflows/Docker%20Image%20CI/badge.svg)

Let's recall the whole world!

## Contributing

We welcome any keen developer in helping us build the better PastVu. You can install local version of the project using the following instructions.

## Create development environment
 * [Docker](#run-with-docker) (preferred option)
 * [Traditional way](#traditional-way)

## Run with Docker

You need to have [docker](https://docs.docker.com/engine/install/) and [docker-compose](https://docs.docker.com/compose/install/) installed.

```bash
# Install node modules
docker-compose run app npm install
# Start the application
docker-compose up
```

Navigate to http://localhost:3000 and login with the default user `admin`/`admin`.

Mailcatcher web interface is listening on http://localhost:1080 to view emails which app has sent out.

Data store and Mongo database are using persistent storage (located on volumes), so you can re-create containers without losing the data. If you change code related to server side operation, you will need to restart containers after change to take effect.

### Debugging

The `DEBUG` environment variable is used to enable debug output and filter it.
If you are using docker, you can add it to default extension fields in compose
file. For example, to enable debug output in all running node instances and
output all debug information excluding noisy babel and log4js namespaces,
specify:

```yaml
x-defaults: &app-image
    image: pastvu/node:15.3.0
    environment:
      - NODE_ENV=development
      - DEBUG=*,-babel*,-log4js*
```

For more information on syntax refer to `debug` package
[docs](https://www.npmjs.com/package/debug#wildcards).

#### Using inpector client

It is possible to debug application using Node.js inspector client when
required. There are several [clients
available](https://nodejs.org/en/docs/guides/debugging-getting-started/#inspector-clients),
although most strightforward option is using Chrome DevTools. Open
`chrome://inspect` in Chromium based browser and make sure you have
`localhost:9229` configured at "Discover network taget". Now you need to start
application with inspector agent enabled:
```
docker-compose run -p 9229:9229 -p 3000:3000 app npm run inspect
```

Under "Remote target" section in inspector tab you will see a new running instance that you can use for debugging.

In the case when appication can't be started at all, you can use inspector with an
option to break before user code starts:
```
docker-compose run -p 9229:9229 -p 3000:3000 app npm run inspect-brk
```

In this case execution will stop at the first line of code, allowing you to
run inspector client and control execution flow.

### Database migrations

We are using [`migrate-mongo`](https://github.com/seppevs/migrate-mongo) database migration tool. Its CLI commands have npm script alises for convenience of running in docker environment:

* `migrate:create` - alias for `migrate-mongo create`
* `migrate:status` - alias for `migrate-mongo status`
* `migrate:up` - alias for `migrate-mongo up`
* `migrate:down` - alias for `migrate-mongo down`
* `migrate` - alias for `migrate:up` script

When running in docker-compose environment use:

```
docker-compose run app npm run migrate:status
```
This will bring up all app dependencies (mongoDb container) and execute
required command.

In order to create new migration, run `migrate-mongo create
<name_of_migration>`, this will create a file in `./migrations` directory
which needs to be amended according to requirements. For examples please refer
to existing migrations or `migrate-mongo` documentation.

### Troubleshooting

If you are using docker inside VM and accessing app from host OS (or any other scenario where web client host may differ from the host where you run docker), make sure that `client.hostname` in your `config/local.config.js` is matching domain name that client uses to access the app. This setting is used for cookies domain, so having it wrong will result in session being cleared on page refresh.

When you upgrade continers to newer image, you may experience an issue when any CSS requests in the app result in 500 error and layout is severley broken. This happens when container is not able to overwrite CSS files (they are generated alongside `.less` files at `public/style/` directory). To fix the issue run `npx grunt clean:publicCss` from project directory and then start application.

## Traditional way

### Dependencies

0. It's recommended to create a folder where you'll be storing all the pastvu related data and code. For the sake of this readme we can call it pastvu_dev, so do `mkdir pastvu_dev`. But, of course, you can structure it however you like.

1. Install [MongoDB 4.4 Community Edition](https://docs.mongodb.com/manual/administration/install-community). The easiest way to do it in development is by using a tarball, for instance for macos:
https://docs.mongodb.com/manual/tutorial/install-mongodb-on-os-x-tarball. In that case you can extract tarball into our pastvu_dev folder, and rename the result folder into `mongodb-4.4`. Having version as a postfix will come in handy when you or somebody else will be updating MongoDB version.

2. Install [Redis 5.0.7](https://redis.io/topics/quickstart) (or above). It's also easier to build it from a tarball which you can extract into our pastvu_dev folder as well, and rename it to `redis-5.0.7`.

3. Install [NodeJS](https://nodejs.org/en/download). You can do it globally by installing a package from download page or package managers like homebrew. However the exact version is defined in [`.node-version`](/.node-version)  and [`.nvmrc`](/.nvmrc) files, so locally it is better to use tools like [nvs](https://github.com/jasongin/nvs) or [nvm](https://github.com/nvm-sh/nvm), which will download and switch to the right version automatically based on those files. If you prefer using `nvm`, you can install/switch to required version by running `nvm install && nvm use` from project directory.

4. Create folders for the data, database and logs: `mkdir db data logs`.

5. Clone the project (being inside the `pastvu_dev` folder if you like):

    * Directly from this repository if you want to just try this project out without having a plan to commit any code or you want to commit and you are a maintainer with the admin permissions (you are probably not), do `git clone https://github.com/pastvu/pastvu.git`.

    * Otherwise, if you are not an admin and you *do* plan to contribute by committing a code, then fork the repository first (standard github flow) and then clone it from you repository name, like `git clone https://github.com/<yourname>/pastvu.git`.

    It will create `pastvu` project folder inside your `pastvu_dev` folder.

6. Move to `pastvu` folder and install npm dependencies by doing `npm i`.

By the end this section you should have `pastvu_dev` folder with these folders inside: `data`, `db`, `logs`, `mongodb-4.4`, `pastvu`, `redis-5.0.7`.

### Configuring

You can now open the project folder (`pastvu`) in your favorite IDE.

1. Copy `config/local.config.js.example` into `config/local.config.js`. Default configuration is located in `default.config.js` file, it's just a JavaScript file, and its object is passed to the local.config.js as an argument. You can modify any of the props and return the final version of the config. Remember, don't change `default.config.js` unless you are altering the default project configuration for a purpose. `config/local.config.js.` is in .gitignore and you can change it locally as much as you want without affecting others.

2. Depending on the `client.hostname` prop in your local.config.js, you should modify your hosts file to associate that domain with your localhost. There are different ways to modify hosts file on different OS that you can google, for example, on macos you do `sudo nano /etc/hosts`. And assuming you have the default setting `pastvu.local`, you need to update hosts file with

    `127.0.0.1       localhost pastvu.local`

It is important that `client.hostname` is matching hostname of machine where you run browser, as it is used as cookie domain internally. Having it wrong will result in logout on page refresh and other authentication related issues.

3. Go to [ethereal.email](https://ethereal.email) and press `Create Ehereal Account` button. Now copy the result parameters to the `mail` section of your local config file, like this:
    ```javascript
    mail: {
        type: 'SMTP',
        secure: false,
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
            user: 'hello.world@ethereal.email',
            pass: 'ABCdsSDFs23edf',
        },
    },
    ```
    That will allow your local server to send emails that will never reach a target, giving you the ability to see such messages on the [messages](https://ethereal.email/messages) page. But be aware that accounts on ethereal.email are temporary and after a while, if you want to see sent messages, you'll need to create a new account again.

4. Download [db sample](https://varlamov.me/pastvu/github/pastvu.gz) into your `pastvu_dev` folder and import it to your MongoDB
    ```bash
   # Start MongoDB server:
   ./mongodb-4.4/bin/mongod --dbpath ./db --storageEngine wiredTiger
   # Import pastvu db
   ./mongodb-4.4/bin/mongorestore --gzip --db pastvu --archive="pastvu.gz"
    ```
   Now you have one default user `admin` with password `admin` and 6.5K regions in you database

### Starting

There are two databases, `MongoDB` and `Redis`, and four services to start: `app` (main application), `uploader` (responsible for uploading images), `downloader` (responsible for downloading images) and `sitemap` (responsible for generating sitemap). It's not necessary to start all of them locally, only `app` is required, but if you want to work with images make sure to start corresponding services as well.

1. Start MongoDB server `./mongodb-4.4/bin/mongod --dbpath ./db --storageEngine wiredTiger`. You can inspect it using the default terminal client `./mongodb-4.4/bin/mongo` or any other third-party client with gui.

2. Start Redis server `redis-server`. You can inspect it using the default terminal client `redis-cli`.

3. Being inside the project folder (`pastvu`), you can manually start any service directly with `node`, and any parameter, like `node --max-old-space-size=4096 bin/run.js --script ./<servicename>.js`. Or you can use shorthand scripts from package.json and start the services in the following way:
    * `npm run app`
    * `npm run uploader`
    * `npm run downloader`
    * `npm run sitemap`

Now, depending on the `client.hostname` prop in your local.config.js you should be able to access your local copy of PastVu in your browser! 🎉

In case of the default hostname and port, just open this url: http://pastvu.local:3000 and login with the default user `admin`/`admin`!


### How to release

See `npm version --help`. Don't forget to manually tag the `en` branch.
