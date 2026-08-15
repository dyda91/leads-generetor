const base = require('./base.js');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

const reactRules = react.configs.flat.recommended?.rules ?? {};
const hooksConfig = reactHooks.configs.recommended ?? {};
const hooksRules = Array.isArray(hooksConfig)
  ? hooksConfig
      .flatMap((entry) => entry.rules ?? {})
      .reduce((acc, rules) => ({ ...acc, ...rules }), {})
  : (hooksConfig.rules ?? {});

module.exports = [
  ...base,
  {
    files: ['**/*.{ts,tsx,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...reactRules,
      ...hooksRules,
      'react/react-in-jsx-scope': 'off',
    },
  },
];
