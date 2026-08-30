import { SetMetadata } from '@nestjs/common';
import { StreamKeyScope } from '@dialectiva/db';

export const STREAM_KEY_SCOPES_KEY = 'streamKeyScopes';
export const RequireScopes = (...scopes: StreamKeyScope[]) =>
  SetMetadata(STREAM_KEY_SCOPES_KEY, scopes);
