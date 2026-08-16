import nodeConfig from '@leads/eslint-config/node';

export default [
  ...nodeConfig,
  {
    ignores: ['src/generated/**'],
  },
];
