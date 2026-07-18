import Redis from 'ioredis';

export async function flushTestRedis(client: Redis): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('flushTestRedis can only be called when NODE_ENV=test');
  }
  await client.flushall();
}
