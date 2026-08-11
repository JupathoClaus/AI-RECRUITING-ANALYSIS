/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const { join } = require('path');
require('dotenv').config({
  path: join(__dirname, 'test.env'),
  override: true,
});
