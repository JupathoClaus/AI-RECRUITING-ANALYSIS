import { applyDecorators, Version } from '@nestjs/common';

export function ApiVersion(version: string) {
  return applyDecorators(Version(version));
}
