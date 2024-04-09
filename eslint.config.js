'use strict';

const pluginPrettierRecommended = require('eslint-plugin-prettier/recommended');
const globals = require('globals');
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    ignores: ['.nyc_output/', '.vscode/', 'coverage/', 'node_modules/'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.mocha,
        ...globals.node
      },
      sourceType: 'module'
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },
  pluginPrettierRecommended
];
