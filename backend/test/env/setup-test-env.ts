/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const { join, resolve } = require('path');
const { isPathInside, resolveTestUploadDir } = require('./test-upload-dir');
require('dotenv').config({
  path: join(__dirname, 'test.env'),
  override: true,
});

const developmentUploadDir = resolve(__dirname, '../../uploads');
const uploadDir = resolveTestUploadDir(process.env.UPLOAD_DIR, developmentUploadDir);

if (isPathInside(developmentUploadDir, uploadDir)) {
  throw new Error('E2E UPLOAD_DIR must not resolve inside backend/uploads');
}

process.env.UPLOAD_DIR = uploadDir;
