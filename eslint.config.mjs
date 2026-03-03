import security from 'eslint-plugin-security';

export default [
  {
    ignores: ['node_modules/', 'coverage/', 'output/'],
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    plugins: { security },
    rules: {
      // eslint-plugin-security rules
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-object-injection': 'off', // Too noisy for bracket access
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'warn',
      'security/detect-unsafe-regex': 'error',
    },
  },
];
