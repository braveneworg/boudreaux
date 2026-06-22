import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import nextPlugin from '@next/eslint-plugin-next';
import security from 'eslint-plugin-security';
import globals from 'globals';
import unusedImports from 'eslint-plugin-unused-imports';
import preferArrowFunctions from 'eslint-plugin-prefer-arrow-functions';
import vitest from '@vitest/eslint-plugin';
import pluginQuery from '@tanstack/eslint-plugin-query';

// typescript-eslint's recommended preset ships as an array of flat-config objects:
// [0] base (registers parser/plugin), [1] eslint-recommended (disables core rules TS
// already covers), [2] the recommended rule set. We apply [1] + [2]'s rules in a
// TS-scoped block below; the plugin itself is registered in the main config block.
const tsEslintRecommendedRules = Object.assign(
  {},
  ...typescript.configs['flat/recommended']
    .filter((config) => config.rules)
    .map((config) => config.rules)
);

const eslintConfig = [
  ...pluginQuery.configs['flat/recommended'],
  {
    files: ['./src/app/**/*.{js,jsx,cjs,mjs,ts,tsx}'],
    settings: {
      'better-tailwindcss': {
        cwd: './src/app',
      },
    },
  },
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
      '**/backups/**',
      'next-env.d.ts',
      'tsconfig.json',
      'tsconfig.*.json',
      'eslint.config.mjs',
      'vite.config.ts',
      'vitest.config.ts',
      'jest.config.ts',
      'postcss.config.mjs',
      '**/*.css',
      '**/*.md',
      '**/*.json',
      '**/*.d.ts',
      'scripts/**/*.js',
      // Auto-generated docs build scripts mix Node and browser (page.evaluate) globals.
      'docs/**/*.mjs',
      '*.pem',
      '*.crt',
      '*.key',
      '**/.claude/**',
      // Static assets served as-is, including the hand-written service worker
      // which relies on ServiceWorkerGlobalScope globals that ESLint can't see.
      'public/**',
    ],
  },
  // Base JavaScript rules
  js.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  // Prettier integration and custom rules
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@typescript-eslint': typescript,
      '@next/next': nextPlugin,
      react,
      'react-hooks': reactHooks,
      import: importPlugin,
      'unused-imports': unusedImports,
      'prefer-arrow-functions': preferArrowFunctions,
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
        NodeJS: 'readonly',
        JSX: 'readonly',
        FormDataEntryValue: 'readonly',
        CanvasTextAlign: 'readonly',
        CanvasTextBaseline: 'readonly',
        FileSystemEntry: 'readonly',
        FileSystemFileEntry: 'readonly',
        FileSystemDirectoryEntry: 'readonly',
        FileSystemDirectoryReader: 'readonly',
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
      // typescript-eslint recommended preset; project-specific overrides below win.
      ...tsEslintRecommendedRules,

      // Next.js rules (previously from next/core-web-vitals)
      '@next/next/no-html-link-for-pages': 'error',
      '@next/next/no-img-element': 'warn',
      '@next/next/no-head-import-in-document': 'error',
      '@next/next/no-sync-scripts': 'error',
      '@next/next/no-script-component-in-head': 'error',

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
      // Enforce CLAUDE.md conventions: no non-null assertions, no unexplained ts-comments.
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true, 'ts-nocheck': true },
      ],
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
      'jsx-a11y/heading-has-content': ['error', { components: ['Heading'] }],

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

      // Project convention: prefer arrow functions over `function` declarations and
      // named function expressions. The plugin only reports/auto-fixes cases where the
      // conversion preserves behaviour — it skips generators, functions that use `this`,
      // `arguments`, or `new.target`, and `export default function` declarations.
      // `returnStyle: 'unchanged'` keeps the rule scoped to function-vs-arrow only; it
      // does not police the return-body style of existing arrow functions.
      // Object methods stay as shorthand (`allowObjectProperties`) to avoid `this` churn.
      'prefer-arrow-functions/prefer-arrow-functions': [
        'error',
        {
          allowNamedFunctions: false,
          allowObjectProperties: true,
          classPropertiesAllowed: false,
          returnStyle: 'unchanged',
        },
      ],
    },
  },
  // Next.js App Router special files conventionally use named (often default-exported)
  // function declarations — keep them as-is and exempt them from the arrow-function rule.
  {
    files: [
      '**/page.tsx',
      '**/layout.tsx',
      '**/loading.tsx',
      '**/error.tsx',
      '**/global-error.tsx',
      '**/not-found.tsx',
      '**/template.tsx',
      '**/default.tsx',
      '**/route.ts',
      '**/middleware.ts',
      '**/instrumentation.ts',
      '**/manifest.ts',
      '**/sitemap.ts',
      '**/robots.ts',
      '**/opengraph-image.tsx',
      '**/icon.tsx',
      '**/apple-icon.tsx',
    ],
    rules: {
      'prefer-arrow-functions/prefer-arrow-functions': 'off',
    },
  },
  // Vitest testing configuration
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', 'tests/**', '**/test-utils/**'],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/max-nested-describe': ['error', { max: 5 }],
      // Disable rules that require typed linting
      'vitest/valid-title': 'off',
      // Relax strict rules that flag legitimate test patterns
      'vitest/no-conditional-expect': 'warn',
      'vitest/expect-expect': 'warn',
    },
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
  },
  // Security linting (full recommended rule set, applied everywhere).
  security.configs.recommended,
  // ── Sole scoped rule exception ───────────────────────────────────────────────
  // The project forbids inline eslint-disable comments. `detect-non-literal-fs-filename`
  // is purely syntactic (it flags any non-literal path argument with no "validated/safe"
  // escape), so code doing real file I/O on runtime-computed paths cannot satisfy it:
  // CLI/build scripts, the os-tmpdir upload temp file, and the ffmpeg sibling temp file.
  // These paths are all server-generated, never user input. Every other rule is satisfied
  // in code repo-wide.
  {
    files: [
      'scripts/**/*.{ts,tsx}',
      'docs/**/*.{js,mjs}',
      // `*` (not the literal `[id]`/`[formatType]`) — minimatch reads `[...]` as a char class.
      'src/app/api/releases/*/upload/*/route.ts',
      'src/lib/audio-metadata/ffmpeg.ts',
    ],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  // Server-only modules must log through the project logger (`@/lib/utils/logger`),
  // never `console.*`. The logger is `server-only`, so enforcement is scoped to
  // directories that never reach the client bundle; client components and shared
  // client-safe utils keep the lenient global rule. Specs are excluded — they
  // legitimately spy on or silence `console`.
  {
    files: [
      'src/lib/actions/**/*.{ts,tsx}',
      'src/lib/services/**/*.{ts,tsx}',
      'src/lib/email/**/*.{ts,tsx}',
      'src/lib/repositories/**/*.{ts,tsx}',
      'src/app/api/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.spec.{ts,tsx}'],
    rules: {
      // Forbid every `console.*` call here (the global `no-console` allows
      // warn/error/info, and its `allow` list can't be emptied — the schema
      // requires ≥1 entry — so `no-restricted-syntax` enforces the stricter rule).
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='console']",
          message:
            'Use the project logger (`loggers` from @/lib/utils/logger), not console, in server-only modules.',
        },
      ],
    },
  },
  eslintPluginPrettierRecommended,
  // Confine Prisma to the data-access layer of the app source. Only files under
  // `src/lib/repositories/**` (and the DB-client infra files, allowlisted in the
  // override block below) may import `@prisma/client`. Every other layer depends
  // on the hand-written, Prisma-free domain types in `@/lib/types/domain` and
  // catches `DataError` (`@/lib/types/domain/errors`) instead of Prisma error
  // classes. Scoped to `src/**` so e2e tests, seed/maintenance scripts, and the
  // standalone `stripe-webhook` project keep their direct Prisma access.
  // `allowTypeImports` is left at its default (false) so even `import type` is blocked.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'Prisma may only be imported in src/lib/repositories/**. Use hand-written domain types from @/lib/types/domain instead.',
            },
            {
              name: '@prisma/client/runtime/library',
              message:
                'Prisma may only be imported in src/lib/repositories/**. Catch DataError from @/lib/types/domain/errors instead.',
            },
          ],
        },
      ],
    },
  },
  // Allowlist: the data-access layer and the DB-client infra files (the only
  // places Prisma is permitted) are exempt from the no-prisma-import ban above.
  {
    files: [
      'src/lib/repositories/**',
      'src/lib/prisma.ts',
      'src/lib/prisma.spec.ts',
      'src/lib/prisma-adapter.ts',
      'src/lib/prisma-adapter.spec.ts',
      'src/lib/utils/slow-query-extension.ts',
      'src/lib/utils/slow-query-extension.spec.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },
];

export default eslintConfig;
