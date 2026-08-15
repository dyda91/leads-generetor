const globals = require('globals');
const base = require('./base.js');

module.exports = [
  ...base,
  {
    files: ['**/*.{js,cjs,mjs,ts,cts,mts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
