import appConfig from './loaders/app.config';
import databaseConfig from './loaders/database.config';
import redisConfig from './loaders/redis.config';
import jwtConfig from './loaders/jwt.config';
import securityConfig from './loaders/security.config';
import swaggerConfig from './loaders/swagger.config';
import authConfig from './loaders/auth.config';

export default [
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  securityConfig,
  swaggerConfig,
  authConfig,
];

export {
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  securityConfig,
  swaggerConfig,
  authConfig,
};
