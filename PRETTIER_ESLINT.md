# Prettier + ESLint Integration

This project uses Prettier and ESLint together to ensure consistent code formatting and quality.

## Configuration Files

- **`.prettierrc`** - Prettier configuration with semi-colons enabled
- **`.prettierignore`** - Files and directories excluded from formatting
- **`eslint.config.mjs`** - ESLint configuration with Prettier integration
- **`.editorconfig`** - Editor settings for consistent style across IDEs
- **`.vscode/settings.json`** - VS Code specific settings for auto-formatting
- **`.vscode/extensions.json`** - Recommended VS Code extensions

## npm Scripts

```bash
# Lint code with ESLint
npm run lint

# Lint and auto-fix issues
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting without changing files
npm run format:check

# Lint and format in one command
npm run lint:format
```

## How It Works

1. **ESLint** checks for code quality issues and best practices
2. **Prettier** handles code formatting (indentation, quotes, semi-colons, etc.)
3. **eslint-plugin-prettier** runs Prettier as an ESLint rule
4. **eslint-config-prettier** disables ESLint formatting rules that conflict with Prettier

## VS Code Integration

Install the recommended extensions:

- **Prettier - Code formatter** (`esbenp.prettier-vscode`)
- **ESLint** (`dbaeumer.vscode-eslint`)

The workspace is configured to:

- ✅ Format on save
- ✅ Auto-fix ESLint issues on save
- ✅ Use Prettier as the default formatter for TS/TSX/JS/JSX/JSON files

## Prettier Rules

Key formatting rules in `.prettierrc`:

- **Semi-colons**: ✅ Required
- **Single quotes**: ✅ Enabled
- **Trailing commas**: ES5 compatible
- **Print width**: 100 characters
- **Tab width**: 2 spaces
- **Arrow parens**: Always

## CI/CD Integration

You can add these to your CI pipeline:

```yaml
# Check formatting
- npm run format:check

# Check linting
- npm run lint

# Or combine both
- npm run lint:format
```

## Pre-commit Hooks (Optional)

To automatically format and lint before committing, you can install husky and lint-staged:

```bash
npm install --save-dev husky lint-staged
npx husky init
```

Add to `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,css,md}": ["prettier --write"]
  }
}
```

## Troubleshooting

### Conflicting rules between ESLint and Prettier

If you see conflicts, ensure `eslint-config-prettier` is loaded last in your ESLint config to disable conflicting rules.

### Format on save not working

1. Check that Prettier extension is installed
2. Verify `.prettierrc` file exists
3. Check VS Code settings for `editor.formatOnSave`
4. Ensure no other formatter is set as default

### ESLint errors after formatting

Run `npm run lint:fix` to auto-fix most issues, then manually fix any remaining problems.
