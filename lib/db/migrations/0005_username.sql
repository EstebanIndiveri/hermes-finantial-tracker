ALTER TABLE users ADD COLUMN username TEXT;
UPDATE users SET username = lower(name);
CREATE UNIQUE INDEX users_username_idx ON users(username);
