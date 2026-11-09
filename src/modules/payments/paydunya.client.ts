import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/AppError.js';

type PayDunyaCustomer = {
  name?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  phone_number?: string;
};

type PayDunyaInvoiceRequest = {
  invoice: {
    items: Array<{
      name: string;
      quantity: number;
      unit_price: number;
      total_price: number;
      description?: string;
    }>;
    total_amount: number;
    description: string;
    custom_data?: string | Record<string, unknown>;
    customer?: PayDunyaCustomer;
    return_url?: string;
    cancel_url?: string;
    callback_url?: string;
  };
  store?: {
    name?: string;
    tagline?: string;
    postal_address?: string;
    phone?: string;
    website_url?: string;
    logo_url?: string;
  };
  actions?: {
    cancel_url?: string;
    return_url?: string;
    callback_url?: string;
  };
  custom_data?: string | Record<string, unknown>;
};

type PayDunyaInvoiceCreateResponse = {
  response_code?: string;
  response_text?: string;
  token?: string;
  invoice_token?: string;
  url?: string;
  payment_url?: string;
  hash?: string;
  invoice?: Record<string, unknown>;
  [key: string]: unknown;
};

export type PayDunyaInvoiceConfirm = {
  response_code?: string;
  response_text?: string;
  invoice_token?: string;
  token?: string;
  status?: string;
  hash?: string;
  invoice?: {
    token?: string;
    status?: string;
    total_amount?: number;
    currency?: string;
    custom_data?: unknown;
    [key: string]: unknown;
  } & Record<string, unknown>;
  [key: string]: unknown;
};

type HttpResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

function getBaseUrl(): string {
  return env.PAYDUNYA_MODE === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1';
}

function isPlaceholderUrl(url: string | undefined): boolean {
  if (!url) return true;
  const placeholders = [
    'example.invalid',
    'URL_RETOUR_REELLE',
    'URL_ANNULATION_REELLE',
  ];
  return placeholders.some(p => url.includes(p));
}

function ensureKeys(): { master: string; private: string; token: string } {
  const master = env.PAYDUNYA_MASTER_KEY;
  const priv = env.PAYDUNYA_PRIVATE_KEY;
  const token = env.PAYDUNYA_TOKEN;
  if (!master || !priv || !token) {
    throw new AppError(
      500,
      "PayDunya n'est pas configuré (clés manquantes).",
      'PAYDUNYA_NOT_CONFIGURED'
    );
  }
  return { master, private: priv, token };
}

export function computePayDunyaIpnHash(masterKey: string): string {
  return createHash('sha512').update(masterKey).digest('hex');
}

export class PayDunyaClient {
  private readonly baseUrl = getBaseUrl();

  async createInvoice(input: PayDunyaInvoiceRequest): Promise<PayDunyaInvoiceCreateResponse> {
    const keys = ensureKeys();

    const returnUrl = input.invoice.return_url ?? env.PAYDUNYA_RETURN_URL;
    const cancelUrl = input.invoice.cancel_url ?? env.PAYDUNYA_CANCEL_URL;

    const invoiceBody: PayDunyaInvoiceRequest['invoice'] = {
      ...input.invoice,
    };
    if (!isPlaceholderUrl(returnUrl)) {
      invoiceBody.return_url = returnUrl;
    }
    if (!isPlaceholderUrl(cancelUrl)) {
      invoiceBody.cancel_url = cancelUrl;
    }

    const body: PayDunyaInvoiceRequest = {
      invoice: invoiceBody,
      actions: {
        // Callback IPN imposé par le backend — aucune surcharge externe possible
        callback_url: env.PAYDUNYA_IPN_URL,
      },
      custom_data: input.custom_data ?? input.invoice.custom_data,
      store: input.store,
    };

    let response: HttpResponse;
    try {
      response = await fetch(`${this.baseUrl}/checkout-invoice/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYDUNYA-MASTER-KEY': keys.master,
          'PAYDUNYA-PRIVATE-KEY': keys.private,
          'PAYDUNYA-TOKEN': keys.token,
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new AppError(
        502,
        'Impossible de contacter PayDunya pour créer la facture.',
        'PAYDUNYA_NETWORK_ERROR',
        { cause: error instanceof Error ? error.message : String(error) }
      );
    }

    const text = await response.text();
    let parsed: PayDunyaInvoiceCreateResponse;
    try {
      parsed = JSON.parse(text) as PayDunyaInvoiceCreateResponse;
    } catch {
      throw new AppError(
        502,
        'Réponse PayDunya invalide lors de la création de facture.',
        'PAYDUNYA_INVALID_RESPONSE'
      );
    }

    if (!response.ok) {
      throw new AppError(
        502,
        parsed.response_text || 'Erreur PayDunya lors de la création de facture.',
        'PAYDUNYA_CREATE_FAILED'
      );
    }

    return parsed;
  }

  async confirmInvoice(invoiceToken: string): Promise<PayDunyaInvoiceConfirm> {
    const keys = ensureKeys();
    if (!invoiceToken || invoiceToken.trim().length === 0) {
      throw new AppError(400, 'Token de facture PayDunya manquant.', 'PAYDUNYA_MISSING_TOKEN');
    }

    let response: HttpResponse;
    try {
      response = await fetch(
        `${this.baseUrl}/checkout-invoice/confirm/${encodeURIComponent(invoiceToken)}`,
        {
          method: 'GET',
          headers: {
            'PAYDUNYA-MASTER-KEY': keys.master,
            'PAYDUNYA-PRIVATE-KEY': keys.private,
            'PAYDUNYA-TOKEN': keys.token,
            Accept: 'application/json',
          },
        }
      );
    } catch (error) {
      throw new AppError(
        502,
        'Impossible de contacter PayDunya pour confirmer la facture.',
        'PAYDUNYA_NETWORK_ERROR',
        { cause: error instanceof Error ? error.message : String(error) }
      );
    }

    const text = await response.text();
    let parsed: PayDunyaInvoiceConfirm;
    try {
      parsed = JSON.parse(text) as PayDunyaInvoiceConfirm;
    } catch {
      throw new AppError(
        502,
        'Réponse PayDunya invalide lors de la confirmation de facture.',
        'PAYDUNYA_INVALID_RESPONSE'
      );
    }

    if (!response.ok) {
      throw new AppError(
        502,
        parsed.response_text || 'Erreur PayDunya lors de la confirmation de facture.',
        'PAYDUNYA_CONFIRM_FAILED'
      );
    }

    return parsed;
  }
}
