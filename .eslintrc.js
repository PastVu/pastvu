module.exports = {
    'root': true,
    'parser': 'babel-eslint',

    'env': {
        'es6': true,
        'amd': true,
        'jest': true,
        'node': true,
        'jquery': true,
        'browser': true,
        'serviceworker': true,
    },

    'parserOptions': {
        'ecmaVersion': 7,
        'sourceType': 'module',
        'ecmaFeatures': {
            'objectLiteralDuplicateProperties': false
        }
    },

    'globals': {
        'analytics': true,
        'init': true,
        'ga': true
    },

    'rules': {
        // enforce or disallow variable initializations at definition
        'init-declarations': 0,
        // disallow the catch clause parameter name being the same as a variable in the outer scope
        'no-catch-shadow': 2,
        // disallow deletion of variables
        'no-delete-var': 2,
        // disallow var and named functions in global scope
        'no-implicit-globals': 2,
        // disallow labels that share a name with a variable
        'no-label-var': 2,
        // disallow self assignment
        // http://eslint.org/docs/rules/no-self-assign
        'no-self-assign': 2,
        // disallow shadowing of names such as arguments
        'no-shadow-restricted-names': 2,
        // disallow declaration of variables already declared in the outer scope
        'no-shadow': [0, {'builtinGlobals': false, 'hoist': 'functions', 'allow': []}],
        // disallow use of undefined when initializing variables
        'no-undef-init': 0,
        // disallow use of undeclared variables unless mentioned in a /*global */ block
        'no-undef': 2,
        // disallow use of undefined variable
        'no-undefined': 0,
        // disallow declaration of variables that are not used in the code
        'no-unused-vars': [2, {'vars': 'all', 'args': 'after-used'}],
        // disallow use of variables before they are defined
        'no-use-before-define': [2, {'functions': false, 'classes': true}],
        // require spaces around operators
        'space-infix-ops': 2,
        // require use of semicolons where they are valid instead of ASI
        'semi': [2, 'always'],
        // Disallow duplicate imports
        'no-duplicate-imports': 2,
        // Disallow unnecessary escape usage
        'no-useless-escape': 2,
        // Creating objects with duplicate keys in objects can cause unexpected behavior in your application
        'no-dupe-keys': 2,

        'arrow-body-style': [2, 'as-needed'],
        // require parens in arrow function arguments
        'arrow-parens': 0,
        // require space before/after arrow function's arrow
        'arrow-spacing': [2, {'before': true, 'after': true}],
        // require trailing commas in multiline object literals
        'comma-dangle': [2, 'never'],
        // verify super() callings in constructors
        'constructor-super': 0,
        // enforce the spacing around the * in generator functions
        'generator-star-spacing': 0,
        // disallow modifying variables of class declarations
        'no-class-assign': 0,
        // disallow arrow functions where they could be confused with comparisons
        'no-confusing-arrow': 0,
        // disallow modifying variables that are declared using const
        'no-const-assign': 2,
        // disallow symbol constructor
        'no-new-symbol': 2,
        // disallow specific globals
        'no-restricted-globals': 0,
        // disallow specific imports
        'no-restricted-imports': 0,
        // disallow to use this/super before super() calling in constructors.
        'no-this-before-super': 0,
        'no-var': 2,
        // disallow unnecessary constructor
        'no-useless-constructor': 2,
        'object-shorthand': [2, 'always'],
        // suggest using arrow functions as callbacks
        'prefer-arrow-callback': 0,
        // suggest using of const declaration for variables that are never modified after declared
        // destructuring:all means if some variable within destructuring is modified later(let), even if others never(const), whole destructuring can be defined as let
        'prefer-const': [2, {'destructuring': 'all'}],
        // suggest using the spread operator instead of .apply()
        'prefer-spread': 2,
        // suggest using Reflect methods where applicable
        'prefer-reflect': 0,
        // use rest parameters instead of arguments
        'prefer-rest-params': 2,
        // suggest using template literals instead of string concatenation
        'prefer-template': 0,
        // disallow generator functions that do not have yield
        'require-yield': 0,
        // import sorting
        'sort-imports': 0,
        // enforce usage of spacing in template strings
        'template-curly-spacing': 2,
        // enforce spacing around the * in yield* expressions
        'yield-star-spacing': [2, 'after'],

        // babel inserts `'use strict';` for us
        'strict': [2, 'never'],

        // specify the maximum depth that blocks can be nested
        'max-depth': [0, 4],
        // limits the number of parameters that can be used in the function declaration.
        'max-params': [0, 3],
        // specify the maximum number of statement allowed in a function
        'max-statements': [0, 10],
        // disallow use of bitwise operators
        'no-bitwise': 0,
        // disallow use of unary operators, ++ and --
        'no-plusplus': 0,
    }
};