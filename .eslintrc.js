module.exports = {
    'root': true,
    'parser': 'babel-eslint',

    'env': {
        'amd': true,
        'es6': true,
        'jest': true,
        'node': true,
        'jquery': true,
        'browser': true,
        'serviceworker': true,
    },

    'parserOptions': {
        'ecmaVersion': 2017,
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

    'plugins': [
        'babel',
    ],

    'rules': {
        // babel inserts `'use strict';` for us
        'strict': [2, 'never'],

        /** ES6 section http://eslint.org/docs/rules/#ecmascript-6 */
        // enforces no braces where they can be omitted
        'arrow-body-style': [2, 'as-needed', { 'requireReturnForObjectLiteral': false }],
        // require parens in arrow function arguments
        'arrow-parens': [2, 'as-needed'],
        // require space before/after arrow function's arrow
        'arrow-spacing': [2, { 'before': true, 'after': true }],
        // require trailing commas in multiline object literals
        'comma-dangle': [0, {
            'arrays': 'always-multiline',
            'objects': 'always-multiline',
            'imports': 'always-multiline',
            'exports': 'always-multiline',
            'functions': 'ignore',
        }],
        // verify super() callings in constructors
        'constructor-super': 0,
        // enforce the spacing around the * in generator functions
        'generator-star-spacing': [2, {'before': false, 'after': true}],
        // disallow modifying variables of class declarations
        'no-class-assign': 0,
        // disallow arrow functions where they could be confused with comparisons
        'no-confusing-arrow': 0,
        // disallow modifying variables that are declared using const
        'no-const-assign': 2,
        // disallow duplicate class members
        'no-dupe-class-members': 2,
        // disallow importing from the same path more than once
        'no-duplicate-imports': 2,
        // disallow symbol constructor
        'no-new-symbol': 2,
        // disallow specific globals
        'no-restricted-globals': 0,
        // disallow specific imports
        'no-restricted-imports': 0,
        // disallow to use this/super before super() calling in constructors.
        'no-this-before-super': 0,
        // Require let or const instead of var
        'no-var': 2,
        // disallow unnecessary computed property keys in object literals
        'no-useless-computed-key': 2,
        // disallow unnecessary constructor
        'no-useless-constructor': 2,
        // disallow renaming import, export, and destructured assignments to the same name
        'no-useless-rename': 2,
        // require method and property shorthand syntax for object literals
        'object-shorthand': [2, 'always', { 'avoidQuotes': true }],
        // suggest using arrow functions as callbacks
        'prefer-arrow-callback': [0, { 'allowNamedFunctions': true }],
        // suggest using of const declaration for variables that are never modified after declared
        // destructuring:all means if some variable within destructuring is modified later(let),
        // even if others never(const), whole destructuring can be defined as let
        'prefer-const': [2, { 'destructuring': 'all', 'ignoreReadBeforeAssign': true }],
        // require destructuring from arrays and/or objects
        'prefer-destructuring': 0,
        // disallow parseInt() in favor of binary, octal, and hexadecimal literals
        'prefer-numeric-literals': 2,
        // Suggest using the spread operator instead of .apply()
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
        // require symbol descriptions
        'symbol-description': 2,
        // enforce usage of spacing in template strings
        'template-curly-spacing': 2,
        // enforce spacing around the * in yield* expressions
        'yield-star-spacing': [2, 'after'],


        /** Best Practices section http://eslint.org/docs/rules/#best-practices **/
        // enforces getter/setter pairs in objects
        'accessor-pairs': 0,
        // enforces return statements in callbacks of array's methods
        'array-callback-return': 0,
        // treat var statements as if they were block scoped
        'block-scoped-var': 0,
        // enforce that class methods utilize this
        'class-methods-use-this': 0,
        // specify the maximum cyclomatic complexity allowed in a program
        'complexity': [0, 11],
        // require return statements to either always or never specify values
        'consistent-return': 0,
        // specify curly brace conventions for all control statements
        'curly': [2, 'multi-line'],
        // require default case in switch statements
        'default-case': 2,
        // encourages use of dot notation whenever possible
        'dot-notation': 2,
        // enforces consistent newlines before or after dots
        'dot-location': [2, 'property'],
        // require the use of === and !==
        'eqeqeq': 2,
        // make sure for-in loops have an if statement
        'guard-for-in': 0,
        // Blacklist certain identifiers to prevent them being used
        'id-blacklist': 0,
        // disallow the use of alert, confirm, and prompt
        'no-alert': 2,
        // disallow use of arguments.caller or arguments.callee
        'no-caller': 2,
        // disallow lexical declarations in case/default clauses
        'no-case-declarations': 0,
        // disallow division operators explicitly at beginning of regular expression
        'no-div-regex': 2,
        // disallow else after a return in an if
        'no-else-return': 2,
        // disallow Unnecessary Labels
        'no-extra-label': 2,
        // disallow comparisons to null without a type-checking operator
        'no-eq-null': 2,
        // disallow use of eval()
        'no-eval': 2,
        // disallow adding to native types
        'no-extend-native': 2,
        // disallow unnecessary function binding
        'no-extra-bind': 2,
        // disallow fallthrough of case statements
        'no-fallthrough': 0,
        // disallow the use of leading or trailing decimal points in numeric literals
        'no-floating-decimal': 2,
        // disallow assignments to native objects or read-only global variables
        'no-global-assign': 2,
        // disallow the type conversions with shorter notations
        'no-implicit-coercion': 0,
        // disallow use of eval()-like methods
        'no-implied-eval': 2,
        // disallow this keywords outside of classes or class-like objects
        'no-invalid-this': 0,
        // disallow usage of __iterator__ property
        'no-iterator': 2,
        // disallow use of labels for anything other then loops and switches
        'no-labels': [2, { 'allowLoop': true, 'allowSwitch': false }],
        // disallow unnecessary nested blocks
        'no-lone-blocks': 2,
        // disallow creation of functions within loops
        'no-loop-func': 0,
        // disallow use of multiple spaces
        'no-multi-spaces': 2,
        // disallow use of multiline strings
        'no-multi-str': 2,
        // disallow use of new operator when not part of the assignment or comparison
        'no-new': 2,
        // disallow use of new operator for Function object
        'no-new-func': 2,
        // disallows creating new instances of String, Number, and Boolean
        'no-new-wrappers': 2,
        // disallow use of (old style) octal literals
        'no-octal': 2,
        // disallow use of octal escape sequences in string literals, such as
        // var foo = 'Copyright \251';
        'no-octal-escape': 2,
        // disallow reassignment of function parameters
        // disallow parameter object manipulation
        'no-param-reassign': 0,
        // disallow use of process.env
        'no-process-env': 0,
        // disallow usage of __proto__ property
        'no-proto': 2,
        // disallow declaring the same variable more then once
        'no-redeclare': [2, { 'builtinGlobals': true }],
        // disallow use of assignment in return statement
        'no-return-assign': 0,
        // disallow unnecessary return await
        'no-return-await': 2,
        // disallow use of `javascript:` urls.
        'no-script-url': 2,
        // disallow comparisons where both sides are exactly the same
        'no-self-compare': 2,
        // disallow use of comma operator
        'no-sequences': 2,
        // TODO: restrict what can be thrown as an exception
        'no-throw-literal': 0,
        // disallow unmodified conditions of loops
        // http://eslint.org/docs/rules/no-unmodified-loop-condition
        'no-unmodified-loop-condition': 2,
        // disallow usage of expressions in statement position
        'no-unused-expressions': 2,
        // disallow unused labels
        'no-unused-labels': 2,
        // disallow unnecessary .call() and .apply()
        'no-useless-call': 0,
        // Disallow unnecessary escape usage
        'no-useless-escape': 2,
        // Disallow redundant return statements
        'no-useless-return': 0,
        // disallow use of void operator
        'no-void': 2,
        // disallow usage of configurable warning terms in comments: e.g. 'todo'
        'no-warning-comments': [0, { 'terms': ['todo', 'fixme', 'xxx'], 'location': 'start' }],
        // disallow use of the with statement
        'no-with': 2,
        // require using Error objects as Promise rejection reasons
        'prefer-promise-reject-errors': 2,
        // require use of the second argument for parseInt()
        'radix': 2,
        // disallow async functions which have no await expression
        'require-await': 0,
        // requires to declare all vars on top of their containing scope
        'vars-on-top': 0,
        // require immediate function invocation to be wrapped in parentheses
        // http://eslint.org/docs/rules/wrap-iife.html
        'wrap-iife': [2, 'outside', { 'functionPrototypeMethods': true }],
        // require or disallow Yoda conditions
        'yoda': 2,


        /** Variables section http://eslint.org/docs/rules/#variables **/
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
        'no-self-assign': 2,
        // disallow shadowing of names such as arguments
        'no-shadow-restricted-names': 2,
        // disallow declaration of variables already declared in the outer scope
        'no-shadow': [0, { 'builtinGlobals': false, 'hoist': 'functions', 'allow': [] }],
        // disallow use of undefined when initializing variables
        'no-undef-init': 0,
        // disallow use of undeclared variables unless mentioned in a /*global */ block
        'no-undef': 2,
        // disallow use of undefined variable
        'no-undefined': 0,
        // disallow declaration of variables that are not used in the code
        'no-unused-vars': [2, { 'vars': 'all', 'args': 'after-used' }],
        // disallow use of variables before they are defined
        'no-use-before-define': [2, { 'functions': false, 'classes': true }],


        /** Possible Errors section http://eslint.org/docs/rules/#possible-errors **/
        // disallow await inside of loops
        'no-await-in-loop': 0,
        // disallow comparing against -0. Use Object.is(x, -0)
        'no-compare-neg-zero': 2,
        // disallow assignment in conditional expressions
        'no-cond-assign': [2, 'always'],
        // disallow use of console
        'no-console': 0,
        // disallow use of constant expressions in conditions
        'no-constant-condition': [2, { 'checkLoops': false }],
        // disallow control characters in regular expressions
        'no-control-regex': 2,
        // disallow use of debugger
        'no-debugger': 0,
        // disallow duplicate arguments in functions
        'no-dupe-args': 2,
        // Creating objects with duplicate keys in objects can cause unexpected behavior in your application
        'no-dupe-keys': 2,
        // disallow a duplicate case label.
        'no-duplicate-case': 2,
        // disallow the use of empty character classes in regular expressions
        'no-empty-character-class': 2,
        // disallow empty statements
        'no-empty': 2,
        // disallow assigning to the exception in a catch block
        'no-ex-assign': 2,
        // disallow double-negation boolean casts in a boolean context
        'no-extra-boolean-cast': 2,
        // disallow unnecessary parentheses. TODO: make 'all'
        'no-extra-parens': [2, 'functions'],
        // disallow unnecessary semicolons
        'no-extra-semi': 2,
        // disallow overwriting functions written as function declarations
        'no-func-assign': 2,
        // disallow function or variable declarations in nested blocks
        'no-inner-declarations': 2,
        // disallow invalid regular expression strings in the RegExp constructor
        'no-invalid-regexp': 2,
        // disallow irregular whitespace outside of strings and comments
        'no-irregular-whitespace': 2,
        // disallow the use of object properties of the global object (Math and JSON) as functions
        'no-obj-calls': 2,
        // disallow use of Object.prototypes builtins directly
        'no-prototype-builtins': 0,
        // disallow multiple spaces in a regular expression literal
        'no-regex-spaces': 2,
        // disallow sparse arrays
        'no-sparse-arrays': 2,
        // Disallow template literal placeholder syntax in regular strings
        'no-template-curly-in-string': 0,
        // disallow unreachable statements after a return, throw, continue, or break statement
        'no-unreachable': 2,
        // disallow control flow statements in finally blocks
        'no-unsafe-finally': 2,
        // disallow negating the left operand of relational operators
        'no-unsafe-negation': 2,
        // disallow comparisons with the value NaN
        'use-isnan': 2,
        // ensure JSDoc comments are valid
        'valid-jsdoc': 0,
        // ensure that the results of typeof are compared against a valid string
        'valid-typeof': 2,
        // Avoid code that looks like two expressions but is actually one
        'no-unexpected-multiline': 2,

        // disallow certain properties on certain objects
        // 'no-restricted-properties': [2, [
        //   { 'object': '_', 'property': 'chain' },
        // ]],


        /** Stylistic Issues section http://eslint.org/docs/rules/#stylistic-issues **/
        // enforce spacing inside array brackets
        'array-bracket-spacing': [2, 'never'],
        // enforce consistent spacing inside single-line blocks
        'block-spacing': [2, 'never'],
        // enforce one true brace style
        'brace-style': [2, '1tbs', { 'allowSingleLine': true }],
        // require camel case names
        'camelcase': [2, { 'properties': 'never' }],
        // enforce or disallow capitalization of the first letter of a comment
        'capitalized-comments': [0, 'always', {'ignoreInlineComments': true, 'ignoreConsecutiveComments': true}],
        // enforce spacing before and after comma
        'comma-spacing': [2, { 'before': false, 'after': true }],
        // enforce one true comma style
        'comma-style': [2, 'last'],
        // disallow padding inside computed properties
        'computed-property-spacing': [2, 'never'],
        // enforces consistent naming when capturing the current execution context
        'consistent-this': 0,
        // enforce newline at the end of file, with no multiple empty lines
        'eol-last': 0,
        // require or disallow spacing between function identifiers and their invocations
        'func-call-spacing': 2,
        // require function names to match the name of the variable or property to which they are assigned
        'func-name-matching': 0,
        // require function expressions to have a name
        'func-names': 0,
        // enforces use of function declarations or expressions
        'func-style': 0,
        // this option enforces minimum and maximum identifier lengths
        // (variable names, property names etc.)
        'id-length': 0,
        // this option sets a specific tab width for your code
        'indent': [2, 4, {
            'SwitchCase': 1,
            'VariableDeclarator': {'var': 2, 'let': 2, 'const': 3},
            'outerIIFEBody': 1,
            'MemberExpression': 1,
            'FunctionDeclaration': {'parameters': 'first', 'body': 1},
            'FunctionExpression': {'parameters': 'first', 'body': 1},
            'CallExpression': {'arguments': 1},
            'ArrayExpression': 1,
            'ObjectExpression': 1,
        }],
        // enforces spacing between keys and values in object literal properties
        'key-spacing': [2, { 'beforeColon': false, 'afterColon': true }],
        // require a space before & after certain keywords
        'keyword-spacing': [2, {
            'before': true,
            'after': true,
            'overrides': {
                'return': { 'after': true },
                'throw': { 'after': true },
                'case': { 'after': true },
            }
        }],
        // enforce position of line comments
        'line-comment-position': 0,
        // enforces empty lines around comments
        'lines-around-comment': 0,
        // require or disallow newlines around directives
        'lines-around-directive': [0, 'always'],
        // disallow mixed 'LF' and 'CRLF' as linebreaks
        'linebreak-style': 0,
        // specify the maximum depth that blocks can be nested
        'max-depth': [0, 4],
        // TODO: specify the maximum length of a line in your program
        'max-len': [0, {
            'code': 140, // The character count to use whenever a tab character is encountered
            'tabWidth': 4, // The character count to use whenever a tab character is encountered
            'ignoreUrls': true, // Ignores lines that contain a URL
            'ignoreTrailingComments': true, // Ignores comments that are trailing source
            'ignoreTemplateLiterals': true, // Ignores lines that contain a template literal
            'ignoreRegExpLiterals': true, // Ignores lines that contain a RegExp literal
        }],
        // TODO: enforce a maximum file length
        'max-lines': [0, { 'max': 300, 'skipBlankLines': true, 'skipComments': true }],
        // specify the maximum depth callbacks can be nested
        'max-nested-callbacks': 0,
        // limits the number of parameters that can be used in the function declaration.
        'max-params': [0, 3],
        // specify the maximum number of statement allowed in a function
        'max-statements': [0, 10],
        // require a capital letter for constructors
        'new-cap': [2, { 'newIsCap': true, 'capIsNew': false }],
        // disallow the omission of parentheses when invoking a constructor with no arguments
        'new-parens': 2,
        // allow/disallow an empty newline after var statement
        'newline-after-var': 0,
        // require newline before return statement
        'newline-before-return': 0,
        // enforces new line after each method call in the chain to make it more readable and easy to maintain
        'newline-per-chained-call': [0, { 'ignoreChainWithDepth': 3 }],
        // disallow use of the Array constructor
        'no-array-constructor': 2,
        // disallow use of bitwise operators
        'no-bitwise': 0,
        // disallow use of the continue statement
        'no-continue': 0,
        // disallow comments inline after code
        'no-inline-comments': 0,
        // disallow if as the only statement in an else block
        'no-lonely-if': 2,
        // disallow mixed spaces and tabs for indentation
        'no-mixed-spaces-and-tabs': 2,
        // disallow use of chained assignment expressions
        'no-multi-assign': 0,
        // disallow multiple empty lines and only one newline at the end
        'no-multiple-empty-lines': [2, { 'max': 2, 'maxEOF': 1, 'maxBOF': 1 }],
        // disallow nested ternary expressions
        'no-nested-ternary': 0,
        // disallow use of the Object constructor
        'no-new-object': 2,
        // disallow use of unary operators, ++ and --
        'no-plusplus': 0,
        // disallow specified syntax
        'no-restricted-syntax': 0,
        // disallow tabs in file
        'no-tabs': 2,
        // disallow the use of ternary operators
        'no-ternary': 0,
        // disallow trailing whitespace at the end of lines
        'no-trailing-spaces': 2,
        // disallow dangling underscores in identifiers
        'no-underscore-dangle': [0, { 'allow': ['__REACT_PERF__'] }],
        // disallow the use of Boolean literals in conditional expressions
        // also, prefer `a || b` over `a ? a : b`
        'no-unneeded-ternary': [2, { 'defaultAssignment': false }],
        // disallow whitespace before properties
        'no-whitespace-before-property': 2,
        // enforce the location of single-line statements
        'nonblock-statement-body-position': [2, 'beside'],
        // enforce consistent line breaks inside braces
        'object-curly-newline': [0, { 'multiline': true }],
        // TODO: require padding inside curly braces
        // Enforce using the eslint-plugin-babel
        'object-curly-spacing': [2, 'always'],
        // enforce placing object properties on separate lines
        'object-property-newline': 0,
        // allow just one var statement per function
        'one-var': [2, 'never'],
        // require a newline around variable declaration
        'one-var-declaration-per-line': [2, 'always'],
        // require assignment operator shorthand where possible or prohibit it entirely
        'operator-assignment': 0,
        // enforce operators to be placed before or after line breaks
        'operator-linebreak': 0,
        // enforce padding within blocks
        'padded-blocks': [0, 'never'],
        // require quotes around object literal property names
        'quote-props': [2, 'as-needed', { 'keywords': false, 'unnecessary': false, 'numbers': false }],
        // specify whether double or single quotes should be used
        'quotes': [2, 'single', { 'avoidEscape': true, 'allowTemplateLiterals': true }],
        // require identifiers to match the provided regular expression
        'id-match': 0,
        // enforce spacing before and after semicolons
        'semi-spacing': [2, { 'before': false, 'after': true }],
        // require use of semicolons where they are valid instead of ASI
        'semi': [2, "always"],
        // requires object keys to be sorted
        'sort-keys': 0,
        // sort variables within the same declaration block
        'sort-vars': 0,
        // require or disallow space before blocks
        'space-before-blocks': 2,
        // require or disallow space before function opening parenthesis
        'space-before-function-paren': [2, { 'anonymous': 'always', 'named': 'never', 'asyncArrow': 'always' }],
        // require or disallow spaces inside parentheses
        'space-in-parens': [2, 'never'],
        // require spaces around operators
        'space-infix-ops': 2,
        // Require or disallow spaces before/after unary operators
        'space-unary-ops': 0,
        // require or disallow a space immediately following the // or /* in a comment
        'spaced-comment': [0, 'always', {
            'exceptions': ['-', '+'],
            'markers': ['=', '!'],           // space here to support sprockets directives
        }],
        // require or disallow spacing between template tags and their literals
        'template-tag-spacing': [2, 'never'],
        // files must not begin with the Unicode Byte Order Mark (BOM)
        'unicode-bom': [2, 'never'],
        // require regex literals to be wrapped in parentheses
        'wrap-regex': 0,

        /* https://github.com/babel/eslint-plugin-babel */
        // Turn them on as they're needed
        'babel/new-cap': 0,
        'babel/object-curly-spacing': 0,
        'babel/no-invalid-this': 0,
    }
};
