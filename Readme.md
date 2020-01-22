Let's recall the whole world!

## Getting Started

From project folder in terminal run:

```bash
npm install
npm start
```

This will get the issue:

```
[TRACE] app - /pastvu/controllers/connection.js:1
import ms from 'ms';
^^^^^^

SyntaxError: Cannot use import statement outside a module
    at wrapSafe (internal/modules/cjs/loader.js:1043:16)
    at Module._compile (internal/modules/cjs/loader.js:1091:27)
    at Module._compile (/pastvu/node_modules/pirates/lib/index.js:99:24)
    at Module._extensions..js (internal/modules/cjs/loader.js:1160:10)
    at Object.newLoader [as .js] (/pastvu/node_modules/pirates/lib/index.js:104:7)
    at Module.load (internal/modules/cjs/loader.js:976:32)
    at Function.Module._load (internal/modules/cjs/loader.js:884:14)
    at Module.require (internal/modules/cjs/loader.js:1016:19)
    at require (internal/modules/cjs/helpers.js:69:18)
    at Object.<anonymous> (/pastvu/app.js:28:43)
^C
```

TODO: fix this and update Readme.md
