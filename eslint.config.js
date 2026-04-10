import { defineConfig, globalIgnores } from 'eslint/config';

import globals from 'globals';

import js from '@eslint/js';
import ts from 'typescript-eslint';

import prettier from 'eslint-plugin-prettier';

export default defineConfig([
  globalIgnores([
    '.nyc_output/',
    '.vscode/',
    'coverage/',
    'dist/',
    'node_modules/'
  ]),
  js.configs.recommended,
  ts.configs.recommended,
  {
    plugins: {
      prettier
    },
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
      ...prettier.configs.recommended.rules,
      'no-console': 'off',
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error'
    }
  }
]);

/* 'use strict';

const pluginPrettierRecommended = require('eslint-plugin-prettier/recommended');
const globals = require('globals');
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    ignores: [
      '.nyc_output/',
      '.vscode/',
      'coverage/',
      'dist/',
      'node_modules/'
    ],
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
 */
