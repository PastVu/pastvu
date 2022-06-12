# Contributing to PastVu

We welcome any keen developer in helping us building the better PastVu! Any
contributions are welcome, no matter how big or small.

Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

## Where to start

The good starting point is a list of [good first
issues](https://github.com/PastVu/pastvu/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22),
each of them is relatively simple and will help you to familiarise with a
code. If you have questions, you may ask them in the issue comments, or in
[discussion board](https://github.com/PastVu/pastvu/discussions).

If you are new to contributing to open source project, you may find [this
guide](https://docs.github.com/en/get-started/quickstart/contributing-to-projects)
useful.

Follow setup instructions below to deploy local copy of the project. This will
allow you to start with development.

## Setup

### Create development environment

You need to have [docker](https://docs.docker.com/engine/install/) and [compose](https://docs.docker.com/compose/cli-command/) installed first.

```bash
# Start Mongo container in background
docker compose up -d mongo
# Import Pastvu database
docker compose exec mongo initdb
# Create config file
cp ./config/local.config.js.docker-example ./config/local.config.js
# Install node modules
docker compose run --rm app npm install
# Start the application
docker compose up
```

Navigate to http://localhost:3000 and login with the default user `admin`/`admin`.

Mailcatcher web interface is listening on http://localhost:1080 to view emails which app has sent out.

Data store and Mongo database are using persistent storage (located on volumes), so you can re-create containers without losing the data. If you change code related to server side operation, you will need to restart containers after change to take effect. If you need to delete volumes, execute `docker compose down -v`.

#### Service instances

Running `docker compose up` starts all service instances according to
`docker-compose.yml` configuration:

* MongoDB - database (required)
* Redis - data store (required)
* app - main application (required)
* worker - task runner
* notifier - service that sends out notifications (emails)
* uploader - service responsible for uploading images
* downloader - service responsible for downloading image
* sitemap - sitemap generator

It's not strictly necessary to start all of them locally, only `app` is
required, which can be started with databases using `docker compose up app`,
but if you want to work with images make sure to start corresponding services
as well.

### Configuring

On a very first run Docker entrypoint script copies `config/local.config.js.docker-example` into `config/local.config.js`. Default configuration is located in `default.config.js` file, it's just a JavaScript file, and its object is passed to the `local.config.js` as an argument. You can modify any of the props and return the final version of the config. Remember, don't change `default.config.js` unless you are altering the default project configuration for a purpose. `config/local.config.js.` is in `.gitignore` and you can change it locally as much as you want without affecting others.

Depending on the `client.hostname` prop in your `local.config.js`, you may modify your hosts file to associate that domain with your localhost. There are different ways to modify hosts file on different OS that you can google, for example, on macos you do `sudo nano /etc/hosts`. And assuming you have the default setting `pastvu.local`, you need to update hosts file with
```
127.0.0.1       localhost pastvu.local
```
It is important that `client.hostname` is matching hostname of machine where you run browser, as it is used as cookie domain internally. Having it wrong will result in logout on page refresh and other authentication related issues.

### Logs

As we run node in docker enivronment, each service container has own logs that
can be accessed using `docker logs <container name>` command. Aggregated logs
output is also shown in terminal where `docker compose up` is executed.

Internally, each node instance outputs logs to `STDOUT`. Log level is set to `ALL` when run in development environment.

Defining `config.logPath` in config file enables file logging into specified path (make sure it is writable) according
to the logic:
- Write all logs output to `all.log` (excluding express logs)
- Write logs of level `ERROR` and above to `errors.log`
- Write Express logs of level `ERROR` and above to `http-errors.log`

## Coding style

Coding style is verified by eslint and stylelint. You can trigger checks as
grunt tasks `npx grunt eslint` and `npx grunt stylelint` respectively. Some of
style issues can be fixed by adding `--fix` param to above commands.

## Tests

We are using [Jest](https://jestjs.io/) testing framework. Although, we are in
early stages of adding tests for existing code. It is generally a good idea to
supply your contribution along with tests where posible. To run tests locally,
execute `npm run jest`. If you need to supply any [CLI
options](https://jestjs.io/docs/cli), call it as `npm run jest -- --verbose=true`.

In order to run test with a name that matches the regex, use `-t` (alias of
`--testNamePattern=<regex>`) param. For example, to run tests containing 'auth' in the name execute:

```
npm run jest -- --verbose=true -t auth
```

You can also run entire test suite by executing `npm test`. This will include
linters run to verify coding style.

## Debugging

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

### Using inspector client

It is possible to debug application using Node.js inspector client when
required. There are several [clients
available](https://nodejs.org/en/docs/guides/debugging-getting-started/#inspector-clients),
although most strightforward option is using Chrome DevTools. Open
`chrome://inspect` in Chromium based browser and make sure you have
`localhost:9229` configured at "Discover network taget". Now you need to start
application with inspector agent enabled:
```
docker compose run --rm -p 9229:9229 -p 3000:3000 app npm run inspect
```

Under "Remote target" section in inspector tab you will see a new running instance that you can use for debugging.

In the case when appication can't be started at all, you can use inspector with an
option to break before user code starts:
```
docker compose run --rm -p 9229:9229 -p 3000:3000 app npm run inspect-brk
```

In this case execution will stop at the first line of code, allowing you to
run inspector client and control execution flow.

## Database migrations

We are using [`migrate-mongo`](https://github.com/seppevs/migrate-mongo) database migration tool. Its CLI commands have npm script alises for convenience of running in docker environment:

* `migrate:create` - alias for `migrate-mongo create`
* `migrate:status` - alias for `migrate-mongo status`
* `migrate:up` - alias for `migrate-mongo up`
* `migrate:down` - alias for `migrate-mongo down`
* `migrate` - alias for `migrate:up` script

When upgrading manually in compose environment use:

```
docker compose run --rm app npm run migrate:status
```
This will bring up all app dependencies (mongoDb container) and execute
required command.

Worker instance applies all pending upgrades automatically when
starting.

In order to create new migration, run `migrate-mongo create
<name_of_migration>`, this will create a file in `./migrations` directory
which needs to be amended according to requirements. For examples please refer
to existing migrations or `migrate-mongo` documentation.

## Troubleshooting

* If you are using docker inside VM and accessing app from host OS (or any other scenario where web client host may differ from the host where you run docker), make sure that `client.hostname` in your `config/local.config.js` is matching domain name that client uses to access the app. This setting is used for cookies domain, so having it wrong will result in session being cleared on page refresh.

* When you upgrade continers to newer image, you may experience an issue when any CSS requests in the app result in 500 error and layout is severley broken. This happens when container is not able to overwrite CSS files (they are generated alongside `.less` files at `public/style/` directory). To fix the issue run `npx grunt clean:publicCss` from project directory and then start application.

## Maintenance

### How to release

Running `npm version v2.0.1` will produce a release commit and tag it as `v2.0.1`, following this step, you need to push branch HEAD and tag directly to `master` (not using PR). Don't forget to manually tag the `en` branch after master has been automerged to it, pull its latest state and tag `git tag v2.0.1-en`, then push tag upstream as well. Pushing tags should automatically build docker image for each tag and publish them in registry.
