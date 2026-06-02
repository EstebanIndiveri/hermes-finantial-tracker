-- Agregar campo onboarding_completed_at a users
ALTER TABLE users ADD COLUMN onboarding_completed_at INTEGER;

-- Marcar a todos los usuarios existentes como que ya completaron el onboarding
-- (el owner original no debe ver el wizard)
UPDATE users SET onboarding_completed_at = (unixepoch() * 1000);
