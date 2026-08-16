import reactConfig from '@leads/eslint-config/react';

export default [
  ...reactConfig,
  {
    ignores: ['dist/', 'coverage/', 'node_modules/'],
  },
];
