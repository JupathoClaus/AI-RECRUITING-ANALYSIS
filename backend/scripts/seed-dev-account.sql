-- Update the development account password hash and verify email
-- bcrypt hash for 'admin123' (cost 10)
UPDATE users SET password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', email_verified_at = NOW() WHERE email = 'sarah@airecruiter.com';
