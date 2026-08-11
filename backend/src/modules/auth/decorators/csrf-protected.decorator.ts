import { SetMetadata } from '@nestjs/common';
import { CSRF_PROTECTED_KEY } from '../guards/csrf.guard';

export const CsrfProtected = () => SetMetadata(CSRF_PROTECTED_KEY, true);
