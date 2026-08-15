const nodeConfig = require('./node.js');

module.exports = [
  ...nodeConfig,
  {
    files: ['*.js', '*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
