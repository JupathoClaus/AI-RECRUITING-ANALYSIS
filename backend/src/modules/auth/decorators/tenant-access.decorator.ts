import { SetMetadata } from '@nestjs/common';
import { TENANT_ACCESS_KEY } from '../guards/tenant-membership.guard';

export const RequireTenantAccess = () => SetMetadata(TENANT_ACCESS_KEY, true);
