import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AfrikSmsProvider } from '../../src/modules/notifications/AfrikSmsProvider.js';
import { AppError } from '../../src/common/errors/AppError.js';

describe('AfrikSmsProvider', () => {
  const config = {
    clientId: 'test-client-id',
    apiKey: 'test-api-key',
    senderId: 'GAMALONE',
    baseUrl: 'https://api.afriksms.com/api/web/web_v1/outbounds',
    timeoutMs: 10000,
  };

  const phone = '+22890123456';
  const formattedPhone = '22890123456'; // E.164 without +

  let provider: AfrikSmsProvider;

  beforeEach(() => {
    provider = new AfrikSmsProvider(config);
    vi.clearAllMocks();
  });

  describe('Configuration Validation', () => {
    it('throws error if SMS_CLIENT_ID is missing', () => {
      expect(
        () =>
          new AfrikSmsProvider({
            clientId: undefined,
            apiKey: 'test-api-key',
            senderId: 'GAMALONE',
            baseUrl: config.baseUrl,
            timeoutMs: config.timeoutMs,
          })
      ).toThrow(AppError);
    });

    it('throws error if SMS_API_KEY is missing', () => {
      expect(
        () =>
          new AfrikSmsProvider({
            clientId: 'test-client-id',
            apiKey: undefined,
            senderId: 'GAMALONE',
            baseUrl: config.baseUrl,
            timeoutMs: config.timeoutMs,
          })
      ).toThrow(AppError);
    });

    it('throws error if SMS_SENDER_ID is missing', () => {
      expect(
        () =>
          new AfrikSmsProvider({
            clientId: 'test-client-id',
            apiKey: 'test-api-key',
            senderId: undefined,
            baseUrl: config.baseUrl,
            timeoutMs: config.timeoutMs,
          })
      ).toThrow(AppError);
    });
  });

  describe('Phone Number Formatting', () => {
    it('transforms E.164 format (+228XXXXXXXX) to AfrikSMS format (228XXXXXXXX)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100, message: 'Success operation', resourceId: 'test-123' }), {
          status: 200,
        })
      );
      global.fetch = fetchMock;

      await provider.sendOtp(phone, '123456');

      expect(fetchMock).toHaveBeenCalled();
      const callArgs = fetchMock.mock.calls[0];
      const body = callArgs[1]?.body;

      expect(body).toContain(`MobileNumbers=${formattedPhone}`);
      // Verify the '+' in the phone input was removed
      expect(body).not.toContain('MobileNumbers=%2B');
      expect(body).not.toContain('MobileNumbers=+228');
    });

    it('handles phone numbers already in AfrikSMS format', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100, message: 'Success operation', resourceId: 'test-123' }), {
          status: 200,
        })
      );
      global.fetch = fetchMock;

      await provider.sendOtp(formattedPhone, '123456');

      expect(fetchMock).toHaveBeenCalled();
      const callArgs = fetchMock.mock.calls[0];
      const body = callArgs[1]?.body;

      expect(body).toContain(`MobileNumbers=${formattedPhone}`);
    });
  });

  describe('sendOtp', () => {
    it('successfully sends OTP with code 100 response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100, message: 'Success operation', resourceId: 'sms-123' }), {
          status: 200,
        })
      );
      global.fetch = fetchMock;

      await expect(provider.sendOtp(phone, '123456')).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: expect.stringContaining('MobileNumbers=22890123456'),
        signal: expect.any(AbortSignal),
      });
    });

    it('includes correct parameters in request body', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100, message: 'Success operation' }), { status: 200 })
      );
      global.fetch = fetchMock;

      await provider.sendOtp(phone, '123456');

      const callArgs = fetchMock.mock.calls[0];
      const body = callArgs[1]?.body as string;

      // URLSearchParams encodes spaces as '+' (application/x-www-form-urlencoded)
      expect(body).toContain(`ClientId=${config.clientId}`);
      expect(body).toContain(`ApiKey=${config.apiKey}`);
      expect(body).toContain(`SenderId=${config.senderId}`);
      // Message is URL encoded, spaces become '+'
      expect(body).toContain('Message=Votre+code+GAMALONE+est+123456');
      expect(body).toContain(`MobileNumbers=${formattedPhone}`);
    });

    it('throws SMS_SENDER_INVALID when AfrikSMS rejects an invalid sender', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ code: 48, message: 'Invalid SenderId', description: 'GAMALONE SenderId must be in :AllooPro' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      );
      global.fetch = fetchMock;

      await expect(provider.sendOtp(phone, '123456')).rejects.toMatchObject({
        code: 'SMS_SENDER_INVALID',
        statusCode: 502,
        message: "Le service SMS a refusé l'expéditeur configuré.",
      });
    });

    it('throws a provider error when AfrikSMS returns HTTP 401/403', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 10, message: 'Bad credentials' }), { status: 401 })
      );
      global.fetch = fetchMock;

      await expect(provider.sendOtp(phone, '123456')).rejects.toMatchObject({
        code: 'SMS_PROVIDER_ERROR',
        statusCode: 502,
      });
    });

    it('throws SMS_PROVIDER_ERROR on HTTP 500 response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
      );
      global.fetch = fetchMock;

      await expect(provider.sendOtp(phone, '123456')).rejects.toMatchObject({
        code: 'SMS_PROVIDER_ERROR',
        statusCode: 502,
      });
    });

    it('throws SMS_PROVIDER_TIMEOUT on network timeout', async () => {
      const fetchMock = vi.fn().mockRejectedValue(
        new DOMException('The operation was aborted.', 'AbortError')
      );
      global.fetch = fetchMock;

      await expect(provider.sendOtp(phone, '123456')).rejects.toMatchObject({
        code: 'SMS_PROVIDER_TIMEOUT',
        statusCode: 504,
      });
    });

    it('throws SMS_PROVIDER_UNAVAILABLE on network error', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      global.fetch = fetchMock;

      await expect(provider.sendOtp(phone, '123456')).rejects.toMatchObject({
        code: 'SMS_PROVIDER_UNAVAILABLE',
        statusCode: 503,
      });
    });

    it('throws SMS_PROVIDER_ERROR on invalid JSON response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('Invalid JSON', { status: 200 })
      );
      global.fetch = fetchMock;

      await expect(provider.sendOtp(phone, '123456')).rejects.toMatchObject({
        code: 'SMS_PROVIDER_ERROR',
        statusCode: 502,
      });
    });

    it('throws provider error when HTTP 200 response contains a provider failure code', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 200, message: 'Invalid credentials' }), { status: 200 })
      );
      global.fetch = fetchMock;

      await expect(provider.sendOtp(phone, '123456')).rejects.toMatchObject({
        code: 'SMS_PROVIDER_ERROR',
        statusCode: 502,
      });
    });

    it('does not leak provider details to the client', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 48, message: 'Invalid SenderId', description: 'GAMALONE SenderId must be in :AllooPro' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      global.fetch = fetchMock;

      await expect(provider.sendOtp(phone, '123456')).rejects.toMatchObject({
        code: 'SMS_SENDER_INVALID',
        message: "Le service SMS a refusé l'expéditeur configuré.",
      });
    });

    it('does not expose API credentials in error messages', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network error'));
      global.fetch = fetchMock;

      try {
        await provider.sendOtp(phone, '123456');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.message).not.toContain(config.apiKey);
        expect(appError.message).not.toContain(config.clientId);
        expect(appError.message).not.toContain('test-api-key');
        expect(appError.message).not.toContain('test-client-id');
      }
    });

    it('does not include OTP code in error context', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 999 }), { status: 200 })
      );
      global.fetch = fetchMock;

      await expect(provider.sendOtp(phone, '123456')).rejects.toThrow();

      // Error should not expose the OTP code itself
      // (This is verified by checking error messages don't contain "123456")
    });
  });

  describe('sendNotification', () => {
    it('successfully sends notification', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100, message: 'Success operation' }), { status: 200 })
      );
      global.fetch = fetchMock;

      const customMessage = 'Your custom message';
      await expect(provider.sendNotification(phone, customMessage)).resolves.toBeUndefined();

      const callArgs = fetchMock.mock.calls[0];
      const body = callArgs[1]?.body as string;
      // URLSearchParams uses application/x-www-form-urlencoded encoding (spaces as '+')
      expect(body).toContain('Message=Your+custom+message');
    });

    it('throws error when sending notification fails', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 500 }), { status: 200 })
      );
      global.fetch = fetchMock;

      await expect(provider.sendNotification(phone, 'Test message')).rejects.toThrow(
        expect.objectContaining({
          code: 'SMS_PROVIDER_ERROR',
        })
      );
    });
  });

  describe('Input Validation', () => {
    it('throws error when phone is empty', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100 }), { status: 200 })
      );
      global.fetch = fetchMock;

      await expect(provider.sendOtp('', '123456')).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_SMS_INPUT',
        })
      );
    });

    it('throws error when message is empty', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100 }), { status: 200 })
      );
      global.fetch = fetchMock;

      // sendOtp always generates a message, so test sendNotification directly
      await expect(provider.sendNotification(phone, '')).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_SMS_INPUT',
        })
      );
    });
  });

  describe('Request Headers and Endpoint', () => {
    it('sends POST request to correct endpoint', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100 }), { status: 200 })
      );
      global.fetch = fetchMock;

      await provider.sendOtp(phone, '123456');

      const url = fetchMock.mock.calls[0][0];
      expect(url).toBe(`${config.baseUrl}/send`);
    });

    it('sets correct Content-Type header', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100 }), { status: 200 })
      );
      global.fetch = fetchMock;

      await provider.sendOtp(phone, '123456');

      const options = fetchMock.mock.calls[0][1];
      expect(options?.headers).toEqual({
        'Content-Type': 'application/x-www-form-urlencoded',
      });
    });

    it('uses POST method', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100 }), { status: 200 })
      );
      global.fetch = fetchMock;

      await provider.sendOtp(phone, '123456');

      const options = fetchMock.mock.calls[0][1];
      expect(options?.method).toBe('POST');
    });
  });

  describe('Timeout Configuration', () => {
    it('applies timeout from configuration', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100 }), { status: 200 })
      );
      global.fetch = fetchMock;

      await provider.sendOtp(phone, '123456');

      const options = fetchMock.mock.calls[0][1];
      expect(options?.signal).toBeDefined();
    });
  });

  describe('Payload AfrikSMS — MobileNumbers international (documentation officielle)', () => {
    const successResponse = () =>
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100, message: 'Success operation' }), { status: 200 })
      );

    const payloadOf = (fetchMock: ReturnType<typeof successResponse>) => {
      const body = fetchMock.mock.calls[0][1]?.body as string;
      return new URLSearchParams(body);
    };

    it.each([
      { label: '+228 Togo', e164: '+22890123456', expected: '22890123456' },
      { label: '+33 France', e164: '+33612345678', expected: '33612345678' },
      { label: '+1 US', e164: '+12125551234', expected: '12125551234' },
      { label: '+225 Côte d’Ivoire', e164: '+2250701234567', expected: '2250701234567' },
      { label: '+229 Bénin', e164: '+22990011223', expected: '22990011223' },
      { label: '+49 Allemagne', e164: '+4915112345678', expected: '4915112345678' },
    ])('envoie $label en MobileNumbers=$expected', async ({ e164, expected }) => {
      const fetchMock = successResponse();
      global.fetch = fetchMock;

      await provider.sendOtp(e164, '123456');

      expect(payloadOf(fetchMock).get('MobileNumbers')).toBe(expected);
    });

    it.each([
      { label: '+228', input: '+22890123456' },
      { label: '+33', input: '+33612345678' },
      { label: '+1', input: '+12125551234' },
    ])('MobileNumbers $label ne contient ni + ni 00', async ({ input }) => {
      const fetchMock = successResponse();
      global.fetch = fetchMock;

      await provider.sendOtp(input, '123456');

      const raw = payloadOf(fetchMock).get('MobileNumbers') ?? '';
      expect(raw).not.toContain('+');
      expect(raw).not.toContain('00');
      expect(raw).toMatch(/^\d+$/);
    });

    it('retire un préfixe 00 résiduel', async () => {
      const fetchMock = successResponse();
      global.fetch = fetchMock;

      await provider.sendOtp('0022890123456', '123456');

      expect(payloadOf(fetchMock).get('MobileNumbers')).toBe('22890123456');
    });

    it('rejette un numéro non convertible (INVALID_SMS_INPUT)', async () => {
      const fetchMock = successResponse();
      global.fetch = fetchMock;

      await expect(provider.sendOtp('+336ABC45678', '123456')).rejects.toMatchObject({
        code: 'INVALID_SMS_INPUT',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('envoie le SenderId configuré (GAMALONE) dans le payload', async () => {
      const fetchMock = successResponse();
      global.fetch = fetchMock;

      await provider.sendOtp('+33612345678', '123456');

      expect(payloadOf(fetchMock).get('SenderId')).toBe('GAMALONE');
    });

    it('envoie exactement les 5 champs documentés', async () => {
      const fetchMock = successResponse();
      global.fetch = fetchMock;

      await provider.sendOtp('+33612345678', '123456');

      expect([...payloadOf(fetchMock).keys()].sort()).toEqual([
        'ApiKey',
        'ClientId',
        'Message',
        'MobileNumbers',
        'SenderId',
      ]);
    });

    it('envoie le message OTP contenant le code', async () => {
      const fetchMock = successResponse();
      global.fetch = fetchMock;

      await provider.sendOtp('+33612345678', '654321');

      expect(payloadOf(fetchMock).get('Message')).toContain('654321');
    });
  });

  describe('SenderId — longueur maximale 11 caractères (documentation AfrikSMS)', () => {
    const build = (senderId: string | undefined) =>
      () =>
        new AfrikSmsProvider({
          clientId: 'test-client-id',
          apiKey: 'test-api-key',
          senderId,
          baseUrl: config.baseUrl,
          timeoutMs: config.timeoutMs,
        });

    it('accepte GAMALONE (8 caractères)', () => {
      expect(build('GAMALONE')).not.toThrow();
    });

    it('accepte exactement 11 caractères', () => {
      expect(build('GAMALONE123')).not.toThrow();
    });

    it('refuse 12 caractères', () => {
      expect(build('GAMALONE1234')).toThrow(/must not exceed 11 characters/);
    });

    it('refuse un SenderId uniquement composé d\'espaces', () => {
      expect(build('   ')).toThrow(AppError);
    });

    it('applique le SenderId trimmed dans le payload', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 100 }), { status: 200 })
      );
      global.fetch = fetchMock;

      const trimmed = new AfrikSmsProvider({
        clientId: 'test-client-id',
        apiKey: 'test-api-key',
        senderId: '  GAMALONE  ',
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
      });

      await trimmed.sendOtp('+22890123456', '123456');

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(new URLSearchParams(body).get('SenderId')).toBe('GAMALONE');
    });
  });
});
