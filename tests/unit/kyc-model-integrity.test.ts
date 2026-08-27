import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../prisma/schema.prisma'
);
const schema = readFileSync(schemaPath, 'utf8');

function modelBody(modelName: string): string {
  const modelPattern = new RegExp(`model ${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const modelMatch = schema.match(modelPattern);
  expect(modelMatch, `model ${modelName} should exist`).toBeTruthy();
  return modelMatch![1];
}

function relationOnDelete(modelName: string, fieldName: string): string {
  const body = modelBody(modelName);
  const relationPattern = new RegExp(
    `${fieldName}\\s+\\S+(?:\\s+@relation\\([^)]*\\))?`,
    'm'
  );
  const relationMatch = body.match(relationPattern);
  expect(relationMatch, `${modelName}.${fieldName} relation should exist`).toBeTruthy();
  return relationMatch![0];
}

describe('KYC model integrity (schema)', () => {
  it('defines retention and lifecycle fields on Kyc', () => {
    const body = modelBody('Kyc');
    expect(body).toContain('retentionUntil DateTime?');
    expect(body).toContain('anonymizedAt   DateTime?');
    expect(body).toContain('deletedAt      DateTime?');
    expect(body).toContain('legalHold      Boolean   @default(false)');
  });

  it('defines retention and lifecycle fields on KycDocument', () => {
    const body = modelBody('KycDocument');
    expect(body).toContain('retentionUntil DateTime?');
    expect(body).toContain('anonymizedAt   DateTime?');
    expect(body).toContain('deletedAt      DateTime?');
  });

  it('defines user anonymization preparation fields', () => {
    const body = modelBody('User');
    expect(body).toContain('anonymizedAt                DateTime?');
    expect(body).toContain('deletedAt                   DateTime?');
  });

  it('stores immutable admin snapshots on KycReviewHistory', () => {
    const body = modelBody('KycReviewHistory');
    expect(body).toContain('adminProfileIdSnapshot   String?           @db.Uuid');
    expect(body).toContain('adminDepartementSnapshot String?');
    expect(body).toContain('adminNiveauAccesSnapshot AdminAccessLevel?');
    expect(body).toContain('adminId   String?         @db.Uuid');
  });

  it('prevents destructive cascade from User to Kyc', () => {
    const relation = relationOnDelete('Kyc', 'user');
    expect(relation).toContain('onDelete: Restrict');
    expect(relation).not.toContain('onDelete: Cascade');
  });

  it('prevents destructive cascade from Kyc to KycReviewHistory', () => {
    const relation = relationOnDelete('KycReviewHistory', 'kyc');
    expect(relation).toContain('onDelete: Restrict');
    expect(relation).not.toContain('onDelete: Cascade');
  });

  it('preserves review history when AdminProfile is removed', () => {
    const relation = relationOnDelete('KycReviewHistory', 'admin');
    expect(relation).toContain('onDelete: SetNull');
    expect(relation).not.toContain('onDelete: Cascade');
  });

  it('prevents destructive cascade from Kyc to KycDocument', () => {
    const relation = relationOnDelete('KycDocument', 'kyc');
    expect(relation).toContain('onDelete: Restrict');
    expect(relation).not.toContain('onDelete: Cascade');
  });

  it('keeps resubmission chain with SetNull on previous submission delete', () => {
    const relation = relationOnDelete('Kyc', 'previousSubmission');
    expect(relation).toContain('onDelete: SetNull');
  });

  it('indexes retention and lifecycle fields for future purge jobs', () => {
    expect(modelBody('Kyc')).toContain('@@index([retentionUntil])');
    expect(modelBody('Kyc')).toContain('@@index([deletedAt])');
    expect(modelBody('Kyc')).toContain('@@index([legalHold])');
    expect(modelBody('KycReviewHistory')).toContain('@@index([adminProfileIdSnapshot])');
  });
});

describe('KYC retention migration', () => {
  const migrationPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../prisma/migrations/20260826120000_kyc_retention_immutability/migration.sql'
  );
  const migration = readFileSync(migrationPath, 'utf8');

  it('exists and switches foreign keys to non-destructive policies', () => {
    expect(migration).toContain('ON DELETE RESTRICT');
    expect(migration).toContain('ON DELETE SET NULL');
    expect(migration).not.toContain('ON DELETE CASCADE');
  });

  it('backfills admin snapshots without row-deletion statements', () => {
    expect(migration).toContain('UPDATE "kyc_review_history"');
    expect(migration).toContain('"adminProfileIdSnapshot"');
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM/mi);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/mi);
  });
});
