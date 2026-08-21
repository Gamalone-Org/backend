import type { SmsService } from '../auth/interfaces/SmsService.js';
import { AppError, SmsProviderError, SmsSenderInvalidError } from '../../common/errors/AppError.js';
import type { Logger } from 'pino';
import { pino } from 'pino';
import { randomUUID } from 'node:crypto';

export interface AfrikSmsConfig {
  clientId: string | undefined;
  apiKey: string | undefined;
  senderId: string | undefined;
  baseUrl: string;
  timeoutMs: number;
}

/**
 * AfrikSmsProvider implementation of SmsService
 * Integrates with the real AfrikSMS API: https://afriksms.com/docapi
 */
export class AfrikSmsProvider implements SmsService {
  private readonly logger: Logger;
  private readonly clientId: string;
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: AfrikSmsConfig) {
    this.logger = pino();
    
    // Validate that required configuration is present
    if (!config.clientId) {
      throw new AppError(500, 'SMS_CLIENT_ID is not configured', 'SMS_CONFIG_ERROR');
    }
    if (!config.apiKey) {
      throw new AppError(500, 'SMS_API_KEY is not configured', 'SMS_CONFIG_ERROR');
    }
    if (!config.senderId) {
      throw new AppError(500, 'SMS_SENDER_ID is not configured', 'SMS_CONFIG_ERROR');
    }
    
    // After validation, assign to private fields
    this.clientId = config.clientId;
    this.apiKey = config.apiKey;
    this.senderId = config.senderId;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;
  }

  /**
   * Transform phone number from E.164 format to AfrikSMS format
   * E.164: +228XXXXXXXX → AfrikSMS: 228XXXXXXXX
   */
  private formatPhoneForAfrikSms(phone: string): string {
    // Remove leading '+' if present
    if (phone.startsWith('+')) {
      return phone.slice(1);
    }
    return phone;
  }

  private maskPhone(phone: string): string {
    if (!phone) {
      return 'unknown';
    }

    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) {
      return `${'*'.repeat(Math.max(digits.length, 1))}`;
    }

    return `${digits.slice(0, 3)}******${digits.slice(-2)}`;
  }

  private createProviderError(responseStatus: number, responseBody: string, providerCode?: number, providerMessage?: string, providerDescription?: string): AppError {
    const safeCode = providerCode ?? responseStatus;
    const normalizedMessage = providerMessage ?? 'SMS provider error';
    const normalizedDescription = providerDescription ?? '';

    const details = {
      provider: 'afriksms',
      providerStatus: responseStatus,
      providerCode: safeCode,
      providerMessage: normalizedMessage,
      providerDescription: normalizedDescription,
    };

    if (providerCode === 48 || /invalid senderid/i.test(normalizedMessage) || /senderid/i.test(normalizedDescription)) {
      return new SmsSenderInvalidError(details);
    }

    if (responseStatus === 401 || responseStatus === 403) {
      return new SmsProviderError('Le service SMS a refusé les identifiants configurés.', 'SMS_PROVIDER_ERROR', 502, details);
    }

    if (responseStatus === 429) {
      return new SmsProviderError('Le service SMS est temporairement saturé.', 'SMS_PROVIDER_ERROR', 502, details);
    }

    if (responseStatus === 500 || responseStatus === 502 || responseStatus === 503 || responseStatus === 504) {
      return new SmsProviderError('Le service SMS est actuellement indisponible.', 'SMS_PROVIDER_ERROR', 502, details);
    }

    if (responseStatus >= 400) {
      return new SmsProviderError('Le service SMS a rejeté la demande.', 'SMS_PROVIDER_ERROR', 502, details);
    }

    if (responseBody) {
      return new SmsProviderError('Le service SMS a répondu avec une erreur non reconnue.', 'SMS_PROVIDER_ERROR', 502, details);
    }

    return new SmsProviderError('Impossible d\'envoyer le SMS.', 'SMS_PROVIDER_ERROR', 502, details);
  }

  /**
   * Send OTP code via SMS
   */
  async sendOtp(phone: string, code: string): Promise<void> {
    const message = `Votre code GAMALONE est ${code}. Il expire dans 5 minutes.`;
    await this.sendSms(phone, message);
  }

  /**
   * Send notification SMS
   */
  async sendNotification(phone: string, message: string): Promise<void> {
    await this.sendSms(phone, message);
  }

  /**
   * Send SMS to a phone number via AfrikSMS API
   * Endpoint: POST https://api.afriksms.com/api/web/web_v1/outbounds/send
   */
  private async sendSms(phone: string, message: string): Promise<void> {
    const requestId = randomUUID();
    const maskedPhone = this.maskPhone(phone);

    try {
      // Validate inputs
      if (!phone || !message) {
        throw new AppError(400, 'Phone and message are required', 'INVALID_SMS_INPUT');
      }

      // Format phone number for AfrikSMS
      const formattedPhone = this.formatPhoneForAfrikSms(phone);

      // Prepare request body
      const body = new URLSearchParams({
        ClientId: this.clientId,
        ApiKey: this.apiKey,
        SenderId: this.senderId,
        Message: message,
        MobileNumbers: formattedPhone,
      });

      // Make HTTP request to AfrikSMS API
      const response = await fetch(`${this.baseUrl}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const responseBodyText = await response.clone().text();
      const responseContentType = response.headers.get('content-type') ?? 'unknown';

      let parsedBody: Record<string, unknown> | null = null;
      try {
        parsedBody = responseBodyText ? (JSON.parse(responseBodyText) as Record<string, unknown>) : null;
      } catch {
        parsedBody = null;
      }

      const providerCode = typeof parsedBody?.code === 'number' ? parsedBody.code : undefined;
      const providerMessage = typeof parsedBody?.message === 'string' ? parsedBody.message : undefined;
      const providerDescription = typeof parsedBody?.description === 'string' ? parsedBody.description : undefined;

      const logPayload = {
        context: 'AfrikSmsProvider.sendSms',
        requestId,
        provider: 'afriksms',
        httpMethod: 'POST',
        endpoint: '/api/web/web_v1/outbounds/send',
        providerStatus: response.status,
        contentType: responseContentType,
        providerCode,
        providerMessage,
        providerDescription,
        maskedPhone,
        senderId: this.senderId,
      };

      this.logger.warn(logPayload);

      if (!response.ok) {
        const error = this.createProviderError(response.status, responseBodyText, providerCode, providerMessage, providerDescription);
        this.logger.error({
          ...logPayload,
          message: 'AfrikSMS HTTP error',
          errorCode: error.code,
        });
        throw error;
      }

      if (typeof parsedBody !== 'object' || parsedBody === null) {
        const error = new SmsProviderError('Réponse invalide du fournisseur SMS.', 'SMS_PROVIDER_ERROR', 502, { ...logPayload, providerResponse: responseBodyText });
        this.logger.error({
          ...logPayload,
          message: 'Invalid JSON response from AfrikSMS API',
          providerResponse: responseBodyText,
        });
        throw error;
      }

      const responseData = parsedBody as Record<string, unknown>;
      const responseCode = responseData.code;

      if (responseCode !== 100) {
        const error = this.createProviderError(response.status, responseBodyText, Number(responseCode), String(responseData.message ?? 'SMS provider rejected request'), String(responseData.description ?? ''));
        this.logger.error({
          ...logPayload,
          message: 'SMS sending failed',
          providerCode: responseCode,
          providerMessage: responseData.message,
        });
        throw error;
      }

      const resourceId = responseData.resourceId;
      this.logger.info({
        context: 'AfrikSmsProvider.sendSms',
        requestId,
        provider: 'afriksms',
        message: 'SMS sent successfully',
        resourceId,
        maskedPhone,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof TypeError) {
        const networkError = new SmsProviderError('Le service SMS est momentanément indisponible.', 'SMS_PROVIDER_UNAVAILABLE', 503, {
          provider: 'afriksms',
          requestId,
          maskedPhone,
        });
        this.logger.error({
          context: 'AfrikSmsProvider.sendSms',
          requestId,
          provider: 'afriksms',
          message: 'Network error while sending SMS',
          maskedPhone,
          error: error.message,
        });
        throw networkError;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        const timeoutError = new SmsProviderError('Le service SMS a dépassé le délai d\'attente.', 'SMS_PROVIDER_TIMEOUT', 504, {
          provider: 'afriksms',
          requestId,
          maskedPhone,
        });
        this.logger.error({
          context: 'AfrikSmsProvider.sendSms',
          requestId,
          provider: 'afriksms',
          message: 'SMS request timeout',
          maskedPhone,
        });
        throw timeoutError;
      }

      const unexpectedError = new SmsProviderError('Impossible d\'envoyer le SMS.', 'SMS_PROVIDER_ERROR', 502, {
        provider: 'afriksms',
        requestId,
        maskedPhone,
        rawError: error instanceof Error ? error.message : String(error),
      });
      this.logger.error({
        context: 'AfrikSmsProvider.sendSms',
        requestId,
        provider: 'afriksms',
        message: 'Unexpected error while sending SMS',
        maskedPhone,
        error: error instanceof Error ? error.message : String(error),
      });
      throw unexpectedError;
    }
  }
}
