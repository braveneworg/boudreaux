import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';
import unusedImports from 'eslint-plugin-unused-imports';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
      '**/build/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/.vitest/**',
      'next-env.d.ts',
      'tsconfig.json',
      'tsconfig.*.json',
      'eslint.config.mjs',
      'vite.config.ts',
      'jest.config.ts',
      'postcss.config.mjs',
      '**/*.css',
      '**/*.md',
      '**/*.json',
      '*.pem',
      '*.crt',
      '*.key',
    ],
  },
  // Extend Next.js configurations - this includes the Next.js ESLint plugin
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // Prettier integration and custom rules
  {
    files: ['**/*.{js,jsx,ts,tsx,json,css,md}'],
    plugins: {
      '@typescript-eslint': typescript,
      '@next/next': nextPlugin,
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
      prettier: prettierPlugin,
      'unused-imports': unusedImports,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        React: 'readonly',
      },
    },
    settings: {
      react: {
        version: '19',
      },
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    rules: {
      'react/jsx-boolean-value': ['error', 'never'],
      'no-unused-vars': 'off', // Disable the core ESLint rule
      'unused-imports/no-unused-imports': 'error', // Report unused imports
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': 'error',
      // Add any custom rules here
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/no-empty-interface': 'warn',
      '@typescript-eslint/no-inferrable-types': 'warn',

      // React rules
      'react/react-in-jsx-scope': 'off', // Not needed in React 17+
      'react/prop-types': 'off', // Using TypeScript
      'react/jsx-uses-react': 'off',
      'react/jsx-uses-vars': 'error',
      'react/self-closing-comp': 'error',
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      'react/jsx-boolean-value': ['error', 'never'],
      'react/jsx-no-target-blank': 'error',
      'react/no-array-index-key': 'warn',
      'react/no-unstable-nested-components': 'error',

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      //  Disable the refs rule - false positive with react-hook-form's handleSubmit pattern
      // when callbacks are properly memoized with useCallback
      'react-hooks/refs': 'off',

      // Accessibility rules
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': [
        'error',
        {
          components: ['Link'],
          specialLink: ['hrefLeft', 'hrefRight'],
          aspects: ['invalidHref', 'preferButton'],
        },
      ],
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',

      // Import rules and sorting
      'import/order': [
        'error',
        {
          groups: [
            'builtin', // Node.js built-in modules
            'external', // npm packages
            'internal', // Internal modules
            ['parent', 'sibling'], // Parent and sibling imports
            'index', // Index imports
            'object',
            'type', // Type imports
          ],
          pathGroups: [
            {
              pattern: 'react',
              group: 'external',
              position: 'before',
            },
            {
              pattern: 'next/**',
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@/**',
              group: 'internal',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: ['react', 'next'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off', // TypeScript handles this
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-anonymous-default-export': 'warn',

      // General best practices
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-unneeded-ternary': 'error',
      ...prettierConfig.rules,
    },
  },
];

export default eslintConfig;
