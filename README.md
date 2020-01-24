Let's recall the whole world!

## Contributing

We welcome any keen developer in helping us building the better PastVu. You can install local version of the project using the following instuction.

### Dependencies

0. It's recommended to create a folder where you'll be storing all the pastvu related data and code. For the sake of this readme we can call it pastvu_dev, so do `mkdir pastvu_dev`. But, of course, you can structure it however you like.

1. Install [MongoDB 3.2.22 Community Edition](https://docs.mongodb.com/manual/administration/install-community). The easiest way to do it in development is by using a tarball, for instance for macos:
https://docs.mongodb.com/manual/tutorial/install-mongodb-on-os-x-tarball. In that case you can extract tarball into our pastvu_dev folder, and rename the result folder into `mongodb-3.2.22`, it will come in handy when you or somebody else will be updating MongoDB version.

2. Install [Redis 5.0.7](https://redis.io/topics/quickstart). It's also easier to build it from a tarball which you can extract into our pastvu_dev folder as well, and rename it to `redis-5.0.7`.

3. Install [NodeJS 12.14.0](https://nodejs.org/en/download). You can do it globally by installing a package from download page or package managers like homebrew. However the exact version is defined in `.node-version` file, so locally it is better to use tools like [nvs](https://github.com/jasongin/nvs), which will download and switch to the right version automatically based on that file.

4. Create folders for the data, database and logs: `mkdir db data logs`.

5. Clone the project from this repository (being inside the pastvu_dev if you like), `git clone https://github.com/klimashkin/pastvu.git`. It will create `pastvu` folder.

6. Move to `pastvu` folder and install npm dependencies by doing `npm i`.

By the end this section you should have `pastvu_dev` folder with these folders inside: `data`, `db`, `logs`, `mongodb-3.2.22`, `pastvu`, `redis-5.0.7`.

### Configuring

You can now open project folder (`pastvu`) in your favorite IDE.

1. Copy `config/local.config.js.example` into `config/local.config.js`. Default configuration is located in `default.config.js` file, it's just a JavaScript file, and its object is passed to the local.config.js as an argument. You can modify any of the props and return the final version of the config. Remember, don't change `default.config.js` unless you are altering the default project configuration for a purpose. `config/local.config.js.` is in .gitignore and you can change it locally as much as you want without affecting others.

2. Go to [ethereal.email](https://ethereal.email) and press `Create Ehereal Account` button. Now copy the result parameters to the `mail` section of your local config file, like this:
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

### Starting