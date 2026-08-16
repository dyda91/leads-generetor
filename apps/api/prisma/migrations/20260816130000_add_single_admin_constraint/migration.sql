-- Custom: at most one ADMIN user, enforced by the database (including under
-- concurrency). Prisma Schema cannot express partial/expression unique indexes,
-- so this rule lives only in this migration's custom SQL. Constraint names are
-- never exposed to API responses.
CREATE UNIQUE INDEX "users_single_admin_idx" ON "users" ((true)) WHERE "role" = 'ADMIN';
