import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Swagger / OpenAPI', () => {
  it('GET /openapi.json returns a valid OpenAPI document', async () => {
    const response = await request(app).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toHaveProperty('openapi');
    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body).toHaveProperty('info');
    expect(response.body.info.title).toBe('GAMALONE API');
  });

  it('GET /docs serves Swagger UI', async () => {
    const response = await request(app).get('/docs');

    expect(response.status).toBe(301);
    expect(response.headers.location).toBe('/docs/');

    const htmlResponse = await request(app).get('/docs/');
    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers['content-type']).toContain('text/html');
    expect(htmlResponse.text).toContain('GAMALONE API Docs');
    expect(htmlResponse.text).toContain('swagger-ui');
  });

  it('GET /api/v1/health still returns the expected health response', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'GAMALONE API is running',
    });
  });
});
