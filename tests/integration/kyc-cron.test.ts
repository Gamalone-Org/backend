import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

const mockRunPurge = vi.fn(async () => ({
  batches: 2,
  totals: { scanned: 2, anonymized: 2, skipped: 0, failed: 0 },
}));

vi.mock('../../src/modules/kyc/kyc.factory.js', () => ({
  createKycModule: () => ({
    controller: {
      submit: vi.fn(),
      resubmit: vi.fn(),
      getMine: vi.fn(),
      getById: vi.fn(),
      uploadDocument: vi.fn(),
      getDocuments: vi.fn(),
      deleteDocument: vi.fn(),
      listPendingReviews: vi.fn(),
      runPurge: vi.fn(),
      getReviewHistory: vi.fn(),
      getAdminDetailsById: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      requestCorrection: vi.fn(),
      setLegalHold: vi.fn(),
      anonymize: vi.fn(),
    },
  }),
}));

vi.mock('../../src/modules/kyc/kyc-purge.service.js', () => ({
  runKycPurgeBounded: mockRunPurge,
}));

async function loadApp(secret?: string): Promise<Express> {
  if (secret === undefined) {
    delete process.env['CRON_SECRET'];
    delete process.env['PURGE_CRON_SECRET'];
  } else {
    process.env['CRON_SECRET'] = secret;
  }
  vi.resetModules();
  const mod = (await import('../../src/app.js')) as { default: Express };
  return mod.default;
}

const URL = '/api/v1/internal/kyc/purge/cron';

afterEach(() => {
  delete process.env['CRON_SECRET'];
  delete process.env['PURGE_CRON_SECRET'];
  mockRunPurge.mockClear();
});

describe('Vercel cron purge entrypoint', () => {
  // Le module app.js est ré-importé à froid à l'intérieur de chaque test via
  // vi.resetModules() (contrairement aux autres tests qui l'importent au
  // niveau racine hors budget de test) : un timeout supérieur au défaut
  // (5000 ms) évite les faux positifs de démarrage à froid.
  const BOOT_TIMEOUT = 15000;

  it('is disabled (404) when no CRON_SECRET is configured', async () => {
    const app = await loadApp();
    const response = await request(app).get(URL);
    expect(response.status).toBe(404);
    expect(mockRunPurge).not.toHaveBeenCalled();
  }, BOOT_TIMEOUT);

  it('rejects a wrong Authorization bearer secret (401)', async () => {
    const app = await loadApp('top-secret-cron-key');
    const response = await request(app).get(URL).set('Authorization', 'Bearer wrong-key');
    expect(response.status).toBe(401);
    expect(mockRunPurge).not.toHaveBeenCalled();
  }, BOOT_TIMEOUT);

  it('runs the purge with a valid Authorization bearer secret', async () => {
    const app = await loadApp('top-secret-cron-key');
    const response = await request(app).get(URL).set('Authorization', 'Bearer top-secret-cron-key');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true });
    expect(response.body.result.batches).toBe(2);
    expect(mockRunPurge).toHaveBeenCalledTimes(1);
  }, BOOT_TIMEOUT);

  it('accepts the x-cron-secret header as an alternative', async () => {
    const app = await loadApp('top-secret-cron-key');
    const response = await request(app).get(URL).set('x-cron-secret', 'top-secret-cron-key');
    expect(response.status).toBe(200);
    expect(mockRunPurge).toHaveBeenCalledTimes(1);
  }, BOOT_TIMEOUT);

  it('rejects a missing secret header (401)', async () => {
    const app = await loadApp('top-secret-cron-key');
    const response = await request(app).get(URL);
    expect(response.status).toBe(401);
    expect(mockRunPurge).not.toHaveBeenCalled();
  }, BOOT_TIMEOUT);
});
