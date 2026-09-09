-- Migration: Add EN_PANIER status to ArtworkStatus enum
--
-- Adds a new intermediate status between PUBLIEE and VENDUE.
-- EN_PANIER means the artwork is reserved during order creation
-- but payment has not yet been confirmed.
--
-- Additive and non-destructive:
--   - New enum value added after PUBLIEE
--   - No existing data modified
--   - No columns altered
--   - Compatible with existing PUBLIEE / VENDUE / RETIREE data

BEGIN;

ALTER TYPE "ArtworkStatus" ADD VALUE 'EN_PANIER' AFTER 'PUBLIEE';

COMMIT;
