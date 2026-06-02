ALTER TABLE users ADD COLUMN username TEXT;
UPDATE users SET username = replace(lower(name), ' ', '_');
CREATE UNIQUE INDEX users_username_idx ON users(username);
