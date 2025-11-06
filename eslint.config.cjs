/**
 * ESLint v9 配置（扁平化）：Vue 3 + TypeScript
 */
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const vuePlugin = require('eslint-plugin-vue');

module.exports = [
  {
    ignores: ['dist', 'coverage', 'node_modules', '**/*.log'],
  },
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: {
      parser: require('vue-eslint-parser'),
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: {
        chrome: 'readonly',
      },
    },
    plugins: {
      vue: vuePlugin,
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Vue 规则
      'vue/multi-word-component-names': 'off',
      'vue/no-mutating-props': 'error',
      'vue/attributes-order': 'warn',
      // TS 规则
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
];