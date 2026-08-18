import { describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import vercelHandler from '../../src/vercel.js';

describe('Vercel serverless bootstrap', () => {
  it('exports the Express app without starting a TCP listener', () => {
    expect(app).toBeDefined();
    expect(vercelHandler).toBe(app);
  });
});
