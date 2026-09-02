-- Migration: OrderStatus workflow (COMMANDE -> PREPARATION -> EXPEDIEE -> LIVREE -> CLOTUREE)
-- Exceptional states kept: ANNULEE, REMBOURSEE
--
-- Additive and non-destructive migration:
--   - old states (EN_ATTENTE, CONFIRMEE, EN_PREPARATION, EXPEDIEE, LIVREE) are
--     mapped to the new ones through the CASE order;
--   - ANNULEE / REMBOURSEE orders keep their respective state;
--   - no data is deleted, no reset.

-- 0. Idempotence guard: remove a stranded type left by an interrupted run (no
--    column references it before this migration is complete).
BEGIN;

DROP TYPE IF EXISTS "OrderStatus_new";

-- 1. Create a new enum type in the desired business order.
CREATE TYPE "OrderStatus_new" AS ENUM (
  'COMMANDE',
  'PREPARATION',
  'EXPEDIEE',
  'LIVREE',
  'CLOTUREE',
  'ANNULEE',
  'REMBOURSEE'
);

-- 2. Drop the provisional default value (it references an old enum member).
ALTER TABLE "commandes" ALTER COLUMN "statut" DROP DEFAULT;

-- 3. Map existing data (non-destructive).
--    EN_ATTENTE     -> COMMANDE
--    CONFIRMEE      -> COMMANDE
--    EN_PREPARATION -> PREPARATION
--    EXPEDIEE       -> EXPEDIEE
--    LIVREE         -> LIVREE
--    ANNULEE        -> ANNULEE (unchanged)
--    REMBOURSEE     -> REMBOURSEE (unchanged)
ALTER TABLE "commandes"
  ALTER COLUMN "statut" TYPE "OrderStatus_new"
  USING CASE "statut"
    WHEN 'EN_ATTENTE' THEN 'COMMANDE'::"OrderStatus_new"
    WHEN 'CONFIRMEE' THEN 'COMMANDE'::"OrderStatus_new"
    WHEN 'EN_PREPARATION' THEN 'PREPARATION'::"OrderStatus_new"
    WHEN 'EXPEDIEE' THEN 'EXPEDIEE'::"OrderStatus_new"
    WHEN 'LIVREE' THEN 'LIVREE'::"OrderStatus_new"
    WHEN 'ANNULEE' THEN 'ANNULEE'::"OrderStatus_new"
    WHEN 'REMBOURSEE' THEN 'REMBOURSEE'::"OrderStatus_new"
    ELSE 'COMMANDE'::"OrderStatus_new"
  END;

-- 4. Apply the new default value of the normal flow.
ALTER TABLE "commandes" ALTER COLUMN "statut" SET DEFAULT 'COMMANDE';

-- 5. Recover the original type name, keeping the mapped data.
DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";

COMMIT;
