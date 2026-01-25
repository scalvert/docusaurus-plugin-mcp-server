import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Global ignores
  {
    ignores: ['dist/', 'node_modules/', '**/*.d.ts', 'examples/'],
  },

  // Main source and test files
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
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

      // General
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'prefer-const': 'error',
      'no-unused-expressions': 'error',
    },
  },

  // Test files - relaxed rules
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*-test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Config files
  {
    files: ['*.cjs', '*.mjs', '*.js', 'scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
