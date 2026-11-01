/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Subject ≤ 50 chars (industry convention; keeps `git log --oneline` readable)
    'header-max-length': [2, 'always', 50],
    // Body lines wrapped at 72 chars (renders cleanly in 80-col terminals)
    'body-max-line-length': [2, 'always', 72],
    'footer-max-line-length': [2, 'always', 72],
  },
};

export default config;
