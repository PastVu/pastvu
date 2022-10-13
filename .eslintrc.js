module.exports = {
    'root': true,
    'parser': '@babel/eslint-parser',

    'env': {
        'amd': true,
        'es6': true,
        'node': true,
        'browser': true,
        'serviceworker': true,
        'jest/globals': true,
    },

    'parserOptions': {
        'ecmaVersion': 2020,
        'sourceType': 'module',
        'ecmaFeatures': {
            'objectLiteralDuplicateProperties': false,
        },
        'codeFrame': true, // Show the code frame in the reporter
        'babelOptions': {
            'configFile': './babel/server.config.js',
        },
    },

    'globals': {
        '__DEV__': 'readonly',
        'ga': 'readonly',
    },

    'plugins': [
        '@babel',
    ],

    'extends': [
        'plugin:jsdoc/recommended',
    ],

    // Warn about unused eslint-disable and eslint-disable-line comments
    'reportUnusedDisableDirectives': true,

    'settings': {
    },

    'rules': {
        // jsdoc is not compulsory.
        'jsdoc/require-jsdoc': 0,
        'jsdoc/require-param': 0,
        'jsdoc/require-param-description': 0,
        'jsdoc/require-returns': 0,
        'jsdoc/require-returns-description': 0,
        'jsdoc/no-undefined-types': [1, {
            // Ideally this should be defined using typedef and refer to
            // mongoose.Types.ObjectId.
            'definedTypes': ['ObjectId'],
        }],

        // babel inserts `'use strict';` for us
        'strict': [0, 'never'],

        /** ES6 section http://eslint.org/docs/rules/#ecmascript-6 */
        // enforces no braces where they can be omitted
        'arrow-body-style': [2, 'as-needed', { 'requireReturnForObjectLiteral': false }],
        // require parens in arrow function arguments
        'arrow-parens': [2, 'as-needed'],
        // require space before/after arrow function's arrow
        'arrow-spacing': [2, { 'before': true, 'after': true }],
        // require trailing commas in multiline object literals
        'comma-dangle': [2, {
            'arrays': 'always-multiline',
            'objects': 'always-multiline',
            'imports': 'always-multiline',
            'exports': 'always-multiline',
            'functions': 'ignore',
        }],
        // verify super() callings in constructors
        'constructor-super': 0,
        // enforce the spacing around the * in generator functions
        'generator-star-spacing': [2, {
            'before': false,
            'after': true,
            'method': { 'before': true, 'after': true },
        }],
        // disallow modifying variables of class declarations
        'no-class-assign': 2,
        // disallow arrow functions where they could be confused with comparisons
        'no-confusing-arrow': 0,
        // disallow modifying variables that are declared using const
        'no-const-assign': 2,
        // disallow duplicate class members
        'no-dupe-class-members': 2,
        // disallow importing from the same path more than once. Use 'import/no-duplicates' instead of this
        'no-duplicate-imports': 0,
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
        'no-useless-computed-key': [2, { enforceForClassMembers: true }],
        // disallow unnecessary constructor
        'no-useless-constructor': 2,
        // disallow renaming import, export, and destructured assignments to the same name
        'no-useless-rename': 2,
        // require method and property shorthand syntax for object literals
        'object-shorthand': [2, 'always', { 'avoidQuotes': true }],
        // suggest using arrow functions as callbacks
        'prefer-arrow-callback': [2, { 'allowNamedFunctions': true }],
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
        'curly': [2, 'all'],
        // require default case in switch statements
        'default-case': 0,
        // enforce default parameters to be last
        'default-param-last': 0,
        // encourages use of dot notation whenever possible
        'dot-notation': 2,
        // enforces consistent newlines before or after dots
        'dot-location': [2, 'property'],
        // require the use of === and !==
        'eqeqeq': 2,
        // require grouped accessor pairs in object literals and classes
        'grouped-accessor-pairs': [2, 'setBeforeGet'],
        // make sure for-in loops have an if statement
        'guard-for-in': 2,
        // enforce a maximum number of classes per file
        'max-classes-per-file': 0,
        // Blacklist certain identifiers to prevent them being used
        'id-blacklist': 0,
        // disallow the use of alert, confirm, and prompt
        'no-alert': 2,
        // disallow use of arguments.caller or arguments.callee
        'no-caller': 2,
        // disallow lexical declarations in case/default clauses
        'no-case-declarations': 0,
        // disallow returning value from constructor
        'no-constructor-return': 2,
        // disallow division operators explicitly at beginning of regular expression
        'no-div-regex': 2,
        // disallow else after a return in an if
        'no-else-return': [2, { 'allowElseIf': false }],
        // disallow empty functions
        'no-empty-function': [2, { allow: ['arrowFunctions'] }],
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
        // disallow magic numbers
        'no-magic-numbers': 0,
        // disallow use of multiple spaces
        'no-multi-spaces': [2, { 'ignoreEOLComments': true }],
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
        // disallow certain properties on certain objects
        'no-restricted-properties': [0, [
            { 'object': '_', 'property': 'chain' },
        ]],
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
        // restrict what can be thrown as an exception
        'no-throw-literal': 2,
        // disallow unmodified conditions of loops
        // http://eslint.org/docs/rules/no-unmodified-loop-condition
        'no-unmodified-loop-condition': 2,
        // disallow usage of expressions in statement position
        'no-unused-expressions': 0,
        // disallow unused labels
        'no-unused-labels': 2,
        // disallow unnecessary .call() and .apply()
        'no-useless-call': 0,
        // disallow unnecessary catch clauses
        'no-useless-catch': 2,
        // Disallow unnecessary escape usage
        'no-useless-escape': 2,
        // Disallow redundant return statements
        'no-useless-return': 0,
        // disallow use of void operator
        'no-void': 2,
        // disallow usage of configurable warning terms in comments: e.g.
        'no-warning-comments': [0, { 'terms': ['todo', 'fixme', 'xxx'], 'location': 'start' }],
        // disallow use of the with statement
        'no-with': 2,
        // enforce using named capture group in regular expression
        'prefer-named-capture-group': 0,
        // require using Error objects as Promise rejection reasons
        'prefer-promise-reject-errors': 2,
        // disallow use of the RegExp constructor in favor of regular expression literals
        'prefer-regex-literals': 2,
        // require use of the second argument for parseInt()
        'radix': 2,
        // disallow async functions which have no await expression
        'require-await': 0,
        // enforce the use of u flag on RegExp
        'require-unicode-regexp': 0,
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
        // disallow deletion of variables
        'no-delete-var': 2,
        // disallow var and named functions in global scope
        'no-implicit-globals': 2,
        // disallow labels that share a name with a variable
        'no-label-var': 2,
        // disallow self assignment
        'no-self-assign': [2, { 'props': true }],
        // disallow shadowing of names such as arguments
        'no-shadow-restricted-names': 2,
        // disallow declaration of variables already declared in the outer scope
        'no-shadow': [0, { 'builtinGlobals': true, 'hoist': 'functions', 'allow': [] }],
        // disallow use of undefined when initializing variables
        'no-undef-init': 0,
        // disallow use of undeclared variables unless mentioned in a /*global */ block
        'no-undef': 2,
        // disallow use of undefined variable
        'no-undefined': 0,
        // disallow declaration of variables that are not used in the code
        'no-unused-vars': [2, { 'vars': 'all', 'args': 'after-used', 'ignoreRestSiblings': true }],
        // disallow use of variables before they are defined
        'no-use-before-define': [2, { 'functions': false, 'classes': true }],


        /** Possible Errors section http://eslint.org/docs/rules/#possible-errors **/
        // enforce “for” loop update clause moving the counter in the right direction.
        'for-direction': 2,
        // enforce return statements in getters
        'getter-return': 2,
        // disallow using an async function as a Promise executor
        'no-async-promise-executor': 2,
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
        // disallow duplicate conditions in if-else-if chains
        'no-dupe-else-if': 2,
        // Creating objects with duplicate keys in objects can cause unexpected behavior in your application
        'no-dupe-keys': 2,
        // disallow a duplicate case label.
        'no-duplicate-case': 2,
        // disallow the use of empty character classes in regular expressions
        'no-empty-character-class': 2,
        // disallow empty statements
        'no-empty': [2, { allowEmptyCatch: true }],
        // disallow assigning to the exception in a catch block
        'no-ex-assign': 2,
        // disallow double-negation boolean casts in a boolean context
        'no-extra-boolean-cast': 2,
        // disallow unnecessary parentheses.
        // if you are not sure about operator precedence, visit that page
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence#Table
        'no-extra-parens': [2, 'all', {
            'conditionalAssign': false,
            'returnAssign': false,
            'nestedBinaryExpressions': true, // No parens around (a && b)
            'enforceForArrowConditionals': true, // No parens around arrow return expression a => (a ? b : c)
            'enforceForNewInMemberExpressions': true, // No parens around 'new' expressions in member expressions
        }],
        // disallow unnecessary semicolons
        'no-extra-semi': 2,
        // disallow overwriting functions written as function declarations
        'no-func-assign': 2,
        // disallow assigning to imported bindings
        'no-import-assign': 2,
        // disallow function or variable declarations in nested blocks
        'no-inner-declarations': 2,
        // disallow invalid regular expression strings in the RegExp constructor
        'no-invalid-regexp': 2,
        // disallow irregular whitespace outside of strings and comments
        'no-irregular-whitespace': 2,
        // disallow characters which are made with multiple code points in character class syntax
        'no-misleading-character-class': 0,
        // disallow the use of object properties of the global object (Math and JSON) as functions
        'no-obj-calls': 2,
        // disallow use of Object.prototypes builtins directly
        'no-prototype-builtins': 0,
        // disallow multiple spaces in a regular expression literal
        'no-regex-spaces': 2,
        // disallow returning values from setters
        'no-setter-return': 2,
        // disallow sparse arrays
        'no-sparse-arrays': 2,
        // Disallow template literal placeholder syntax in regular strings
        'no-template-curly-in-string': 0,
        // disallow unreachable statements after a return, throw, continue, or break statement
        'no-unreachable': 2,
        // disallow control flow statements in finally blocks
        'no-unsafe-finally': 2,
        // disallow negating the left operand of relational operators
        'no-unsafe-negation': [2, { enforceForOrderingRelations: true }],
        // disallow assignments that can lead to race conditions due to usage of await or yield.
        'require-atomic-updates': 0,
        // disallow comparisons with the value NaN
        'use-isnan': [2, { enforceForSwitchCase: true, enforceForIndexOf: true }],
        // ensure JSDoc comments are valid
        'valid-jsdoc': 0,
        // ensure that the results of typeof are compared against a valid string
        'valid-typeof': 2,
        // Avoid code that looks like two expressions but is actually one
        'no-unexpected-multiline': 2,

        /** Stylistic Issues section http://eslint.org/docs/rules/#stylistic-issues **/
        // enforce linebreaks after opening and before closing array brackets
        'array-bracket-newline': [2, 'consistent'],
        // enforce spacing inside array brackets
        'array-bracket-spacing': [2, 'never'],
        // enforce line breaks after each array element
        'array-element-newline': 0,
        // enforce consistent spacing inside single-line blocks
        'block-spacing': [2, 'never'],
        // enforce one true brace style
        'brace-style': [2, '1tbs', { 'allowSingleLine': false }],
        // require camel case names
        'camelcase': [0, { 'properties': 'never', 'ignoreDestructuring': true, allow: [] }],
        // enforce or disallow capitalization of the first letter of a comment
        'capitalized-comments': [0, 'always', { 'ignoreInlineComments': true, 'ignoreConsecutiveComments': true }],
        // enforce spacing before and after comma
        'comma-spacing': [2, { 'before': false, 'after': true }],
        // enforce one true comma style
        'comma-style': [2, 'last'],
        // disallow padding inside computed properties
        'computed-property-spacing': [2, 'never', { 'enforceForClassMembers': true }],
        // enforces consistent naming when capturing the current execution context
        'consistent-this': 0,
        // enforce newline at the end of file, with no multiple empty lines
        'eol-last': 2,
        // require or disallow spacing between function identifiers and their invocations
        'func-call-spacing': 2,
        // require function names to match the name of the variable or property to which they are assigned
        'func-name-matching': [2, 'always', { 'considerPropertyDescriptor': true, 'includeCommonJSModuleExports': false }],
        // require function expressions to have a name
        'func-names': 0,
        // enforces use of function declarations or expressions
        'func-style': 0,
        // enforce line breaks between arguments of a function call
        'function-call-argument-newline': [0, 'consistent'],
        // enforce consistent line breaks inside function parentheses.
        // currently conflicts with max-len and if argument is a function with argument on first line
        'function-paren-newline': [0, 'multiline'],
        // enforces minimum and maximum identifier lengths (variable names, property names etc.)
        'id-length': 0,
        // enforce consistent indentation
        'indent': [2, 4, {
            // Folowing numbers are multiplier of origin indent level (2 spaces in our case)
            'SwitchCase': 1, // Enforces indentation level for case clauses in switch statements
            'VariableDeclarator': 'first', // Enforces indentation level for variable declarators
            'outerIIFEBody': 1, // Enforces indentation level for file-level IIFEs
            'MemberExpression': 1, // Enforces indentation level for multi-line property chains
            'FunctionDeclaration': {
                'parameters': 'first', // Enforces indentation level for parameters in a function declaration
                'body': 1, // Enforces indentation level for the body of a function declaration
            },
            'FunctionExpression': {
                'parameters': 'first', // Enforces indentation level for parameters in a function expression
                'body': 1, // Enforces indentation level for the body of a function expression
            },
            'CallExpression': {
                'arguments': 1, // Enforces indentation level for arguments in a call expression
            },
            'ArrayExpression': 1, // Enforces indentation level for elements in arrays
            'ObjectExpression': 1, // Enforces indentation level for elements in objects
            'ImportDeclaration': 1, // Enforces indentation level for import statements
            'flatTernaryExpressions': true, // Equires no indentation for ternary expressions which are nested in other ternary
            'ignoreComments': false,
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
            },
        }],
        // enforce position of line comments
        'line-comment-position': 0,
        // disallow mixed 'LF' and 'CRLF' as linebreaks
        'linebreak-style': 0,
        // enforces empty lines around comments
        'lines-around-comment': [2, {
            'beforeBlockComment': true,
            'afterBlockComment': false,
            'beforeLineComment': false,
            'afterLineComment': false,
            'allowBlockStart': true,
            'allowBlockEnd': true,
            'allowClassStart': true,
            'allowClassEnd': true,
            'allowObjectStart': true,
            'allowObjectEnd': true,
            'allowArrayEnd': true,
            'applyDefaultIgnorePatterns': true,
        }],
        // require or disallow an empty line between class members
        'lines-between-class-members': [2, 'always', { 'exceptAfterSingleLine': true }],
        // specify the maximum depth that blocks can be nested
        'max-depth': [0, 4],
        // maximum length of a line in your program
        'max-len': [2, {
            'code': 140, // The character count to use whenever a tab character is encountered
            'comments': 140, // Maximum line length for comments; defaults to value of code
            'tabWidth': 2, // The character count to use whenever a tab character is encountered
            'ignoreUrls': true, // Ignores lines that contain a URL
            'ignoreStrings': true, // Ignores lines that contain a double-quoted or single-quoted string
            'ignoreComments': false, // Ignores all trailing comments and comments on their own line
            'ignoreTrailingComments': true, // Ignores only trailing comments
            'ignoreTemplateLiterals': true, // Ignores lines that contain a template literal
            'ignoreRegExpLiterals': true, // Ignores lines that contain a RegExp literal
        }],
        // enforce a maximum file length
        'max-lines': [0, { 'max': 300, 'skipBlankLines': true, 'skipComments': true }],
        // enforce a maximum number of line of code in a function
        'max-lines-per-function': [0, { 'max': 50, 'skipBlankLines': true, 'skipComments': true }],
        // specify the maximum depth callbacks can be nested
        'max-nested-callbacks': 0,
        // limits the number of parameters that can be used in the function declaration.
        'max-params': [0, 3],
        // specify the maximum number of statement allowed in a function
        'max-statements': [0, 10],
        // enforce a maximum number of statements allowed per line
        'max-statements-per-lines': 0,
        // enforce a particular style for multiline comments
        'multiline-comment-style': 0,
        // enforce newlines between operands of ternary expressions
        'multiline-ternary': [0, 'always-multiline'],
        // require a capital letter for constructors
        'new-cap': [2, { 'newIsCap': true, 'capIsNew': false, 'newIsCapExceptions': ['diff_match_patch'] }],
        // disallow the omission of parentheses when invoking a constructor with no arguments
        'new-parens': 2,
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
        'no-underscore-dangle': [2, { 'enforceInMethodNames': false, 'allow': [
            '__DEV__',
            '_bsontype',
            '_parsedUrl',
            '_nojs',
            '_id',
            '__v',
            '_s',
        ] }],
        // disallow the use of Boolean literals in conditional expressions
        // also, prefer `a || b` over `a ? a : b`
        'no-unneeded-ternary': [2, { 'defaultAssignment': false }],
        // disallow whitespace before properties
        'no-whitespace-before-property': 2,
        // enforce the location of single-line statements
        'nonblock-statement-body-position': [2, 'beside'],
        // enforce consistent line breaks inside braces
        'object-curly-newline': [2, { 'consistent': true }],
        // Enforce using the eslint-plugin-babel
        // 'object-curly-spacing': [0, 'never'],
        // enforce placing object properties on separate lines
        'object-property-newline': 0,
        // allow just one var statement per function
        'one-var': [2, 'never'],
        // require a newline around variable declaration
        'one-var-declaration-per-line': [2, 'always'],
        // require assignment operator shorthand where possible or prohibit it entirely
        'operator-assignment': 0,
        // enforce operators to be placed before or after line breaks
        'operator-linebreak': [2, 'after', { overrides: { '|>': 'before' } }],
        // enforce padding within blocks
        'padded-blocks': [2, { 'blocks': 'never', 'classes': 'never', 'switches': 'never' }, { allowSingleLineBlocks: false }],
        // require or disallow padding lines between statements
        'padding-line-between-statements': [2,
            // Always require blank lines after directive (like 'use-strict'), except between directives
            { blankLine: 'always', prev: 'directive', next: '*' },
            { blankLine: 'any', prev: 'directive', next: 'directive' },
            // Always require blank lines after import, except between imports
            { blankLine: 'always', prev: 'import', next: '*' },
            { blankLine: 'any', prev: 'import', next: 'import' },
            // Always require blank lines before and after every sequence of variable declarations and export
            { blankLine: 'always', prev: '*', next: ['const', 'let', 'var', 'export'] },
            { blankLine: 'always', prev: ['const', 'let', 'var', 'export'], next: '*' },
            { blankLine: 'any', prev: ['const', 'let', 'var', 'export'], next: ['const', 'let', 'var', 'export'] },
            // Always require blank lines before and after class declaration, if, do/while, switch, try, iife
            { blankLine: 'always', prev: '*', next: ['if', 'class', 'for', 'do', 'while', 'switch', 'try', 'iife'] },
            { blankLine: 'always', prev: ['if', 'class', 'for', 'do', 'while', 'switch', 'try', 'iife'], next: '*' },
            // Always require blank lines before return statements
            { blankLine: 'always', prev: '*', next: 'return' }],
        // disallow the use of Math.pow in favor of the ** operator
        'prefer-exponentiation-operator': 0,
        // disallow using Object.assign with an object literal as the first argument and prefer the use of object spread instead
        'prefer-object-spread': 2,
        // require quotes around object literal property names
        'quote-props': [2, 'as-needed', { 'keywords': false, 'unnecessary': false, 'numbers': false }],
        // specify whether double or single quotes should be used
        'quotes': [2, 'single', 'avoid-escape'],
        // require identifiers to match the provided regular expression
        'id-match': 0,
        // enforce the location of arrow function bodies
        'implicit-arrow-linebreak': 0,
        // enforce spacing before and after semicolons
        'semi-spacing': [2, { 'before': false, 'after': true }],
        // enforce location of semicolons
        'semi-style': [2, 'last'],
        // require use of semicolons where they are valid instead of ASI
        'semi': [2, 'always', { 'omitLastInOneLineBlock': false }],
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
        // enforce spacing around colons of switch statements
        'switch-colon-spacing': [2, { 'after': true, 'before': false }],
        // require or disallow spacing between template tags and their literals
        'template-tag-spacing': [2, 'never'],
        // files must not begin with the Unicode Byte Order Mark (BOM)
        'unicode-bom': [2, 'never'],
        // require regex literals to be wrapped in parentheses
        'wrap-regex': 0,

        /* https://github.com/babel/babel/tree/main/eslint/babel-eslint-plugin */
        // Turn them on as they're needed
        '@babel/new-cap': 0,
        '@babel/object-curly-spacing': [2, 'always'],
        '@babel/no-invalid-this': 0,
        '@babel/semi': 2,
        '@babel/no-unused-expressions': 2, // Stop complaining about optional chaining
    },
    'overrides': [
        {
            // Old-school rules for ES5 public code.
            'files': ['public/js/**/*.js'],
            'rules': {
                // no complains about using function for callback.
                'prefer-arrow-callback': 0,
                // arrow functions are OK, but don't mix them with ES5 syntax in the same file.
                'object-shorthand': [2, 'consistent'],
                // don't complain about private members of object
                'no-underscore-dangle': 0,
                // No rest or spread
                'prefer-spread': 0,
                'prefer-rest-params': 0,
            },
        },
        {
            // eslint-plugin-jest rules are defined via overrides to apply
            // them to test files only.
            'files': ['**/__tests__/*.js'],
            'plugins': ['jest'],
            'extends': [
                'plugin:jest/all',
                'plugin:jest-formatting/strict',
            ],
            'rules': {
                // Ensure async test has expect.assertions
                'jest/prefer-expect-assertions': [1, { 'onlyFunctionsWithAsyncKeyword': true }],
                // We need hooks.
                'jest/no-hooks': 0,
                // Permit dangling underscores in rewire methods and others.
                'no-underscore-dangle': [2, { 'allow': [
                    '_id', '__get__', '__set__', '__RewireAPI__', '__Rewire__', '__ResetDependency__', '__GetDependency__',
                ] }],
            },
        },
    ],
};
