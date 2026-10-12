-- A user whose password was set by someone else (the default first administrator, or an administrator
-- inviting / resetting a user) must change it at the next sign-in. Existing users are not affected.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
