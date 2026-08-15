const nodeConfig = require('@leads/eslint-config/node');

module.exports = [
  ...nodeConfig,
  {
    files: ['*.js', '*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
