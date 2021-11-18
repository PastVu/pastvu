module.exports = {
    'extends': 'stylelint-config-standard',
    'ignoreFiles': ['**/*.{eot,ttf,woff}'],
    'customSyntax': 'postcss-less',
    'rules': {
        'indentation': 4,
        // If we have Autoprefixer one day, remove *-no-vendor-prefix rules
        // and run stylelint with --fix param to strip prefixes.
        'property-no-vendor-prefix': null,
        'value-no-vendor-prefix': null,
        'at-rule-no-vendor-prefix': null,
        'color-function-notation': 'legacy',
        'string-quotes': 'single',
        'font-family-no-missing-generic-family-keyword': [true, { ignoreFontFamilies: ['Glyphicons Halflings', 'UCondensed'] }],
        'selector-class-pattern': '^([a-z]+).*$', // We have a mix of snake_case, lowerCamelCase and kebab-case
        'selector-id-pattern': '^[a-z][a-zA-Z0-9]+$', // lowerCamelCase
        'keyframes-name-pattern': '^[a-z][a-zA-Z0-9]+$', // lowerCamelCase
        'no-descending-specificity': null,
        'function-url-quotes': 'never',
        'max-line-length': null,
        'block-no-empty': null,
    },
};
