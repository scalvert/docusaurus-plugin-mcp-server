/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
      node: true,
    },
  },
  rules: {
    // TypeScript specific
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],

    // Import rules - disabled for simpler setup
    'import/order': 'off',
    'import/no-unresolved': 'off', // TypeScript handles this
    'import/no-named-as-default-member': 'off', // fs-extra usage pattern

    // General
    'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
    'prefer-const': 'error',
    'no-unused-expressions': 'error',
  },
  overrides: [
    {
      // Test files
      files: ['tests/**/*.ts', '**/*.test.ts', '**/*-test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
      },
    },
    {
      // Config files
      files: ['*.cjs', '*.mjs', '*.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.d.ts'],
};
