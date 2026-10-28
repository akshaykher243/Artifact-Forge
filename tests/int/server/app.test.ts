import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, callOp, TEST_HOST, TEST_TOKEN } from '../../fixtures/test-app.ts';

describe('local service request guard (local-service-security)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers a valid ping with the success envelope', async () => {
    const response = await callOp(app, 'ping');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: { pong: true } });
  });

  it('refuses a request without the session token', async () => {
    const response = await callOp(app, 'ping', { headers: { 'x-af-token': undefined } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'forbidden', message: 'Forbidden' },
    });
  });

  it('refuses a request with a wrong token', async () => {
    const response = await callOp(app, 'ping', { headers: { 'x-af-token': 'wrong' } });

    expect(response.statusCode).toBe(403);
  });

  it('Other site calls the service: refuses a foreign Origin even with the token', async () => {
    const response = await callOp(app, 'ping', { headers: { origin: 'https://evil.example' } });

    expect(response.statusCode).toBe(403);
  });

  it('DNS rebinding: refuses a Host other than the loopback name and port', async () => {
    const response = await callOp(app, 'ping', { headers: { host: 'evil.example:4399' } });

    expect(response.statusCode).toBe(403);
  });

  it('refuses the right host name on the wrong port', async () => {
    const response = await callOp(app, 'ping', { headers: { host: '127.0.0.1:80' } });

    expect(response.statusCode).toBe(403);
  });

  it('Unknown operation: refuses a name outside the list', async () => {
    const response = await callOp(app, 'runShell');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ success: false, error: { code: 'not_found' } });
  });

  it('does not treat prototype keys as operations', async () => {
    const response = await callOp(app, 'constructor');

    expect(response.statusCode).toBe(404);
  });

  it('refuses a form-encoded body (CSRF-style request)', async () => {
    const response = await callOp(app, 'ping', {
      payload: 'a=1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ error: { code: 'unsupported_media_type' } });
  });

  it('refuses input that does not match the operation schema', async () => {
    const response = await callOp(app, 'ping', { payload: { extra: true } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'invalid_input' } });
  });

  it('refuses GET on an operation', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/op/ping',
      headers: { host: TEST_HOST, 'x-af-token': TEST_TOKEN },
    });

    expect(response.statusCode).toBe(404);
  });

  it('sends the security headers on every response', async () => {
    const response = await callOp(app, 'ping');

    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
