require('tsconfig-paths').register({
  baseUrl: './dist',
  paths: {
    '@common/*': ['src/common/*'],
    '@config/*': ['src/config/*'],
    '@database/*': ['src/database/*'],
    '@modules/*': ['src/modules/*'],
    '@shared/*': ['src/shared/*'],
  },
});
require('./dist/src/main.js');