/**
 * Config for all supported browsers
 */
module.exports = {
    optional: [
        'asyncToGenerator', // Use babel helper asyncToGenerator because we have not bluebird on client
        // 'bluebirdCoroutines', // Use it for async/await on server-side instead of babel helper asyncToGenerator
        'es6.spec.modules',
        'es7.asyncFunctions',
        'es7.classProperties',
        'es7.comprehensions',
        'es7.decorators',
        'es7.doExpressions',
        'es7.exponentiationOperator',
        'es7.exportExtensions',
        'es7.functionBind',
        'es7.objectRestSpread',
        'es7.trailingFunctionCommas',
        'optimisation.modules.system'
        // 'runtime',
    ],
    blacklist: [
        'es3.memberExpressionLiterals', // For very old browsers
        'es3.propertyLiterals'  // For very old browsers
        // 'es5.properties.mutators', // Enabled in V8 4.2 (Node 4)
        // 'es6.arrowFunctions', // Enabled in V8 4.5 (Node 4)
        // 'es6.blockScoping', // Enabled in V8 4.1 (Node 4)
        // 'es6.classes', // Enabled in V8 4.2 (Node 4)
        // 'es6.constants', // Enabled in V8 4.1 (Node 4)
        // 'es6.destructuring', // Still developing
        // 'es6.forOf', //  Enabled in V8 3.28 (Node 0.12)
        // 'es6.literals', // Numeric literals enabled in V8 4.1 (Node 4)
        // 'es6.modules', // Proposed
        // 'es6.objectSuper', // Enabled with classes in V8 4.2 (Node 4)
        // 'es6.parameters', // Rest in V8 4.7, Spread in V8 4.6, Default is still in development
        // 'es6.properties.computed', // Enabled in V8 4.4 (Node 4)
        // 'es6.properties.shorthand', // Enabled in V8 4.2 (Node 4)
        // 'es6.regex.sticky', // Proposed
        // 'es6.regex.unicode', // Proposed
        // 'es6.spec.templateLiterals' // Enabled in V8 4.1 (Node 4)
        // 'es6.spread', // Will be enabled in V8 4.6 (Node 5)
        // 'es6.tailCall', // In development

        // 'flow',
        // 'react',
        // 'react.displayName',
        // 'regenerator',
        // 'spec.blockScopedFunctions',
        // 'spec.functionName',
        // 'strict',
        // 'validation.react'
    ]
};