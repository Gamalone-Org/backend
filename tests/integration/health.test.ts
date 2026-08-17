import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Health Check', () => {
  it('GET /api/v1/health should return 200 with success true', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'GAMALONE API is running',
    });
  });

  it('should have correct content type', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.type).toBe('application/json');
  });
});
