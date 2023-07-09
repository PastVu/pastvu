/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

module.exports = {
    'extends': 'stylelint-config-standard',
    'ignoreFiles': ['**/*.{eot,ttf,woff}'],
    'customSyntax': 'postcss-less',
    'rules': {
        'import-notation': 'string',
        'media-feature-range-notation': 'prefix',
        'indentation': 4,
        // If we have Autoprefixer one day, remove *-no-vendor-prefix rules
        // and run stylelint with --fix param to strip prefixes.
        'property-no-vendor-prefix': null,
        'value-no-vendor-prefix': null,
        'at-rule-no-vendor-prefix': null,
        'color-function-notation': 'legacy',
        'string-quotes': 'single',
        'font-family-no-missing-generic-family-keyword': [true, {
            ignoreFontFamilies: ['Glyphicons Halflings', 'UCondensed', '/^Material Icons/'],
        }],
        'selector-class-pattern': '^([a-z]+).*$', // We have a mix of snake_case, lowerCamelCase and kebab-case
        'selector-id-pattern': '^[a-z][a-zA-Z0-9]+$', // lowerCamelCase
        'keyframes-name-pattern': '^[a-z][a-zA-Z0-9]+$', // lowerCamelCase
        'no-descending-specificity': null,
        'function-url-quotes': 'never',
        'max-line-length': null,
        'block-no-empty': null,
        'declaration-block-no-redundant-longhand-properties': null,
        'function-no-unknown': null,
        'media-query-no-invalid': null,
        'keyframe-block-no-duplicate-selectors': null,
        'value-keyword-case': ['lower', { 'camelCaseSvgKeywords': true }],
    },
};
