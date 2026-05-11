module.exports = {
  env: { node: true, es2024: true },
  parserOptions: { ecmaVersion: 2024, sourceType: 'module' },
  extends: ['eslint:recommended'],
  rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  overrides: [{ files: ['tests/**/*.js'], env: { node: true } }]
};
