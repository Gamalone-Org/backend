import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { adminSelect, publicSelect } from '../../src/modules/marketplace/oeuvre.controller.js';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/gamalone_backend';

describe('OeuvreController select integrity', () => {
  it('adminSelect keeps artisan.user nested INSIDE artisan.select (no top-level user key)', () => {
    const artisanArgs = adminSelect.artisan as Record<string, unknown>;

    expect(Object.keys(artisanArgs)).toEqual(['select']);
    expect((artisanArgs.select as Record<string, unknown>).user).toBeDefined();
    expect((artisanArgs.select as Record<string, unknown>).user).not.toEqual(
      undefined
    );
  });

  it('adminSelect references only fields that exist on the Oeuvre model', () => {
    expect(adminSelect.rejectionReason).toBe(true);
    expect(adminSelect.publishedByAdminId).toBe(true);
    expect(Object.keys(adminSelect.artisan.select).sort()).toEqual(
      Object.keys(publicSelect.artisan.select).sort()
    );
  });

  it('publicSelect is left untouched (artisan.select.user without telephone)', () => {
    const userSelect = (
      publicSelect.artisan.select.user as { select: Record<string, unknown> }
    ).select;
    expect(Object.keys(userSelect).sort()).toEqual(['id', 'nom']);
  });

  it('adminSelect passes real Prisma client-side validation (no PrismaClientValidationError)', async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
      }),
    });

    try {
      await prisma.oeuvre.findMany({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        select: adminSelect as never,
      });
    } catch (error) {
      expect((error as Error).name).not.toBe('PrismaClientValidationError');
    } finally {
      await prisma.$disconnect();
    }
  });
});