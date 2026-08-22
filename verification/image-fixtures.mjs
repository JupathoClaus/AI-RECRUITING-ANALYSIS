import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./fixtures', import.meta.url));
mkdirSync(DIR, { recursive: true });

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPG_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

writeFileSync(join(DIR, 'avatar-a.png'), Buffer.from(PNG_B64, 'base64'));
writeFileSync(join(DIR, 'avatar-b.jpg'), Buffer.from(JPG_B64, 'base64'));
writeFileSync(join(DIR, 'logo.png'), Buffer.from(PNG_B64, 'base64'));
writeFileSync(join(DIR, 'oversized.png'), Buffer.alloc(2 * 1024 * 1024 + 10, 0x89));
writeFileSync(join(DIR, 'spoof.png'), Buffer.from('this is definitely not a png file, just plain text content', 'utf8'));
console.log('wrote avatar-a.png, avatar-b.jpg, logo.png, oversized.png, spoof.png');