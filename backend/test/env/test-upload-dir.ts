import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { isAbsolute, join, relative, resolve } from 'path';

export function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(resolve(parent), resolve(child));
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

export function resolveTestUploadDir(
  configuredUploadDir: string | undefined,
  developmentUploadDir: string,
): string {
  const resolvedDevelopmentUploadDir = resolve(developmentUploadDir);

  if (configuredUploadDir) {
    const resolvedConfiguredUploadDir = resolve(configuredUploadDir);
    if (!isPathInside(resolvedDevelopmentUploadDir, resolvedConfiguredUploadDir)) {
      return resolvedConfiguredUploadDir;
    }
  }

  return mkdtempSync(join(tmpdir(), 'talentai-e2e-uploads-'));
}
