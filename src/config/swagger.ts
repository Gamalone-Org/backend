import { env } from './env.js';

const apiVersion = '1.0.0';

const tags = [
  { name: 'Auth', description: 'Authentication and OTP flows' },
  { name: 'Users', description: 'User management' },
  { name: 'Artisans', description: 'Artisan profiles and artisan features' },
  { name: 'Artworks', description: 'Artworks operations' },
  { name: 'Categories', description: 'Product categories management' },
  { name: 'Orders', description: 'Order lifecycle' },
  { name: 'Payments', description: 'Payments and transactions' },
  { name: 'Deliveries', description: 'Delivery management' },
  { name: 'Reviews', description: 'Reviews and ratings' },
  { name: 'Disputes', description: 'Litiges clients-artisans (back-office Admin)' },
  { name: 'Media', description: 'Media upload and retrieval' },
  { name: 'Certificates', description: 'Certificates and validation assets' },
  { name: 'KYC', description: 'Identity validation flows' },
  { name: 'Admin', description: 'Administrative actions' },
  { name: 'Articles', description: 'Articles éditoriaux (back-office Admin)' },
  { name: 'Notifications', description: 'Notifications and messaging' },
  { name: 'Support', description: 'Support and aid flows' },
  { name: 'Health', description: 'System health endpoints' },
];

export const swaggerOptions = {
  customSiteTitle: 'GAMALONE API Docs',
  customfavIcon: '',
  explorer: false,
  customCss: `
    body { background: #0f172a; color: #e2e8f0; }
    .swagger-ui .topbar { background: #111827; }
    .swagger-ui .info .title { color: #f8fafc; }
    .swagger-ui .scheme-container { background: #111827; }
  `,
};

const serverUrls = [
  { url: `http://localhost:${env.PORT}`, description: 'Local development server' },
];

if (env.API_PUBLIC_URL && env.API_PUBLIC_URL !== `http://localhost:${env.PORT}`) {
  serverUrls.push({
    url: env.API_PUBLIC_URL,
    description: 'Production or staging server',
  });
}

export const swaggerDocument = {
  openapi: '3.1.0',
  info: {
    title: 'GAMALONE API',
    description: 'API backend de la plateforme GAMALONE',
    version: apiVersion,
  },
  servers: serverUrls,
  tags,
  paths: {
    '/api/v1/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns the current backend health status.',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'API healthy and reachable',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'GAMALONE API is running' },
                  },
                  required: ['success', 'message'],
                },
                examples: {
                  success: {
                    summary: 'Healthy response',
                    value: {
                      success: true,
                      message: 'GAMALONE API is running',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/otp/send': {
      post: {
        tags: ['Auth'],
        summary: 'Send OTP to a phone number',
        description:
          'Validates the phone, applies OTP cooldown and rate limits, and sends a single-use secure code without returning the code in the response body.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthOtpSendRequest' },
              examples: {
                main: {
                  value: { phone: '+22890123456' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OTP request accepted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'OTP sent successfully' },
                    expiresAt: { type: 'string', format: 'date-time' },
                  },
                  required: ['success', 'message', 'expiresAt'],
                },
              },
            },
          },
          '400': { description: 'Invalid phone number or malformed request body' },
          '429': { description: 'OTP cooldown or rate-limit triggered' },
          '500': { description: 'Unexpected server error' },
        },
      },
    },
    '/api/v1/auth/otp/resend': {
      post: {
        tags: ['Auth'],
        summary: 'Resend OTP to a phone number',
        description:
          'Validates the phone, checks resend cooldown and OTP rate limits, invalidates the previous active code, and sends a fresh single-use code without returning the code in the response body.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthOtpSendRequest' },
              examples: {
                main: {
                  value: { phone: '+22890123456' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Fresh OTP generated and sent',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'OTP resent' },
                    expiresAt: { type: 'string', format: 'date-time' },
                  },
                  required: ['success', 'message', 'expiresAt'],
                },
              },
            },
          },
          '400': { description: 'Invalid phone number or malformed request body' },
          '429': { description: 'Resend cooldown or OTP rate limit triggered' },
          '502': {
            description: 'SMS provider rejected the request or sender configuration is invalid',
          },
          '503': { description: 'SMS provider unavailable or transient service issue' },
          '504': { description: 'SMS provider timeout' },
        },
      },
    },
    '/api/v1/auth/otp/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP and issue JWT',
        description:
          'Checks the one-time code, invalidates it once used, and returns a JWT only when the phone verification succeeds.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthOtpVerifyRequest' },
              examples: {
                main: {
                  value: { phone: '+22890123456', code: '123456' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OTP verified successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    accessToken: { type: 'string' },
                    tokenType: { type: 'string', example: 'Bearer' },
                    user: { $ref: '#/components/schemas/AuthUserPublic' },
                  },
                  required: ['success', 'accessToken', 'tokenType', 'user'],
                },
              },
            },
          },
          '400': { description: 'Invalid phone, malformed code, or invalid OTP format' },
          '401': { description: 'OTP expired, invalid or mismatched for this phone' },
          '429': { description: 'Too many verification attempts or rate-limited requests' },
          '500': { description: 'Unexpected server error' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get authenticated user',
        description: 'Returns the currently authenticated user profile from a valid JWT.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Authenticated user details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    user: { $ref: '#/components/schemas/AuthUserPublic' },
                  },
                },
              },
            },
          },
          '401': { description: 'Missing, malformed, expired, or invalid bearer token' },
          '403': { description: 'User is suspended or not active' },
          '404': { description: 'Authenticated user no longer exists' },
          '500': { description: 'Unexpected server error' },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account',
        description:
          'Creates an ACHETEUR or ARTISAN account (statut EN_ATTENTE_VALIDATION, phone NOT verified), hashes the password with scrypt, creates the matching ArtisanProfile when applicable, and sends a phone OTP. Role is restricted to ACHETEUR | ARTISAN: ADMIN can never be requested here. Never returns a JWT or the password.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthRegisterRequest' },
              examples: {
                acheteur: {
                  summary: 'Acheteur registration',
                  value: {
                    role: 'ACHETEUR',
                    nom: 'Awa Mensah',
                    telephone: '+22890123456',
                    email: 'user@example.com',
                    motDePasse: 'S3cretPassword!',
                  },
                },
                artisan: {
                  summary: 'Artisan registration',
                  value: {
                    role: 'ARTISAN',
                    nom: 'Atelier Kokou',
                    telephone: '+22890123456',
                    email: 'user@example.com',
                    specialite: 'Sculpture',
                    localisation: 'Lomé, Togo',
                    motDePasse: 'S3cretPassword!',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Account created and OTP sent',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    expiresAt: { type: 'string', format: 'date-time' },
                  },
                  required: ['success', 'message', 'expiresAt'],
                },
              },
            },
          },
          '400': {
            description:
              'Invalid payload: unknown role, missing nom/specialite/localisation, invalid phone/email/password',
          },
          '409': { description: 'An account with this phone number or email already exists' },
          '429': { description: 'OTP cooldown or rate-limit triggered' },
          '500': { description: 'Unexpected server error' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with phone and password',
        description:
          'Authenticates a user with phone + password and returns a Bearer JWT. The optional role field only checks frontend space coherence (Acheteur/Artisan); privileges always come from User.role in the database. Does not reveal whether a phone number exists.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthLoginRequest' },
              examples: {
                main: {
                  value: {
                    telephone: '+22890123456',
                    motDePasse: 'S3cretPassword!',
                    role: 'ACHETEUR',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    accessToken: { type: 'string' },
                    tokenType: { type: 'string', example: 'Bearer' },
                    user: { $ref: '#/components/schemas/AuthUserPublic' },
                  },
                  required: ['success', 'accessToken', 'tokenType', 'user'],
                },
              },
            },
          },
          '400': { description: 'Invalid phone or malformed request body' },
          '401': { description: 'Invalid credentials or password auth not enabled (use OTP)' },
          '403': {
            description:
              'Account is suspended/inactive, the requested space does not match the account role, or the phone is not verified (PHONE_NOT_VERIFIED)',
          },
          '429': { description: 'Too many failed login attempts' },
          '500': { description: 'Unexpected server error' },
        },
      },
    },
    '/api/v1/auth/verify-phone': {
      post: {
        tags: ['Auth'],
        summary: 'Verify phone via OTP',
        description:
          'Verifies the phone OTP for an existing account, marks the phone as VERIFIE (required by KYC), and returns a Bearer JWT. Does not create a new account.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthOtpVerifyRequest' },
              examples: {
                main: {
                  value: { phone: '+22890123456', code: '123456' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Phone verified successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    accessToken: { type: 'string' },
                    tokenType: { type: 'string', example: 'Bearer' },
                    user: { $ref: '#/components/schemas/AuthUserPublic' },
                  },
                  required: ['success', 'accessToken', 'tokenType', 'user'],
                },
              },
            },
          },
          '400': { description: 'Invalid phone, malformed code, or invalid OTP format' },
          '401': { description: 'OTP expired, invalid, or no account found for this phone' },
          '409': { description: 'OTP already used' },
          '423': { description: 'OTP blocked after too many attempts' },
          '429': { description: 'Too many verification attempts or rate-limited requests' },
          '500': { description: 'Unexpected server error' },
        },
      },
    },
    '/api/v1/kyc/submit': {
      post: {
        tags: ['KYC'],
        summary: 'Submit KYC',
        description: 'Submit the authenticated user KYC data after phone verification.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/KycSubmissionRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'KYC submitted successfully' },
          '400': { description: 'Invalid request body' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Phone verification is required' },
          '409': { description: 'An active KYC already exists' },
        },
      },
    },
    '/api/v1/kyc/resubmit': {
      post: {
        tags: ['KYC'],
        summary: 'Resubmit KYC',
        description:
          'Resubmit a new version of KYC data after a CORRECTION_REQUISE status while preserving submission history.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/KycSubmissionRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'KYC resubmitted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    kyc: { $ref: '#/components/schemas/Kyc' },
                  },
                  required: ['success', 'kyc'],
                },
              },
            },
          },
          '400': { description: 'Invalid request body or status transition' },
          '401': { description: 'Authentication required' },
          '403': {
            description:
              'Phone verification is required or resubmission not allowed for current KYC status',
          },
          '404': { description: 'User or previous KYC record not found' },
        },
      },
    },
    '/api/v1/kyc/me': {
      get: {
        tags: ['KYC'],
        summary: 'Get my KYC',
        description: 'Get the latest KYC record for the authenticated user.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'KYC record returned' },
          '401': { description: 'Authentication required' },
          '404': { description: 'KYC record not found' },
        },
      },
    },
    '/api/v1/kyc/{id}': {
      get: {
        tags: ['KYC'],
        summary: 'Get KYC by id',
        description:
          'Get a KYC record owned by the authenticated user or accessed by an administrator.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'KYC record returned' },
          '400': { description: 'Invalid KYC id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Access to this KYC is forbidden' },
          '404': { description: 'KYC record not found' },
        },
      },
    },
    '/api/v1/kyc/{id}/documents': {
      get: {
        tags: ['KYC'],
        summary: 'Get KYC documents',
        description:
          'Lists all documents for a KYC record with temporary signed URLs for consultation.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'KYC documents retrieved successfully' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: not owner or admin' },
          '404': { description: 'KYC record not found' },
        },
      },
      post: {
        tags: ['KYC'],
        summary: 'Upload KYC document',
        description:
          'Uploads a KYC document to secure Cloudinary storage and persists metadata in PostgreSQL.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  documentType: {
                    type: 'string',
                    enum: [
                      'CNI_RECTO',
                      'CNI_VERSO',
                      'PASSEPORT',
                      'TITRE_SEJOUR',
                      'JUSTIFICATIF_DOMICILE',
                      'PHOTO_SELFIE',
                      'EXTRAIT_KBIS',
                      'DOCUMENT_COMPLEMENTAIRE',
                    ],
                  },
                },
                required: ['file', 'documentType'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'KYC document uploaded successfully' },
          '400': { description: 'Invalid input, missing file, or unsupported format' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: not owner or phone unverified' },
          '404': { description: 'KYC record not found' },
          '502': { description: 'Cloudinary upload failure' },
        },
      },
    },
    '/api/v1/kyc/{id}/documents/{documentId}': {
      delete: {
        tags: ['KYC'],
        summary: 'Delete KYC document',
        description:
          'Deletes a KYC document from Cloudinary storage first, then removes its record from PostgreSQL.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          {
            name: 'documentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'KYC document deleted successfully' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: not owner or admin' },
          '404': { description: 'KYC record or document not found' },
          '502': { description: 'Cloudinary deletion failure' },
        },
      },
    },
    '/api/v1/admin/kyc': {
      get: {
        tags: ['Admin KYC'],
        summary: 'List KYC records for review',
        description:
          'Lists all KYC records requiring administrative review (defaults to SOUMIS and EN_ATTENTE).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 10 } },
          {
            name: 'status',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: [
                'SOUMIS',
                'EN_ATTENTE',
                'VALIDE',
                'REJETE',
                'CORRECTION_REQUISE',
                'BROUILLON',
                'EXPIRE',
              ],
            },
          },
        ],
        responses: {
          '200': { description: 'KYC review queue retrieved successfully' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/kyc/{id}': {
      get: {
        tags: ['Admin KYC'],
        summary: 'Get KYC review details',
        description:
          'Retrieves complete KYC details for administrative review with secure temporary signed document URLs.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'KYC details returned for review' },
          '400': { description: 'Invalid KYC id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'KYC record not found' },
        },
      },
    },
    '/api/v1/admin/kyc/{id}/history': {
      get: {
        tags: ['Admin KYC'],
        summary: 'Get KYC decision history',
        description: 'Retrieves full chronological decision history for a KYC submission.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'KYC review history returned successfully' },
          '400': { description: 'Invalid KYC id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'KYC record not found' },
        },
      },
    },
    '/api/v1/admin/kyc/{id}/approve': {
      post: {
        tags: ['Admin KYC'],
        summary: 'Approve KYC submission',
        description:
          'Approves a submitted KYC record, transitions status to VALIDE, logs review history, and certifies artisan profile if applicable.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'KYC approved successfully' },
          '400': { description: 'Invalid KYC id or invalid status transition' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'KYC record not found' },
          '409': { description: 'KYC already reviewed or concurrent conflict' },
        },
      },
    },
    '/api/v1/admin/kyc/{id}/reject': {
      post: {
        tags: ['Admin KYC'],
        summary: 'Reject KYC submission',
        description:
          'Rejects a submitted KYC record with a required justification reason and logs review history.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/AdminKycReviewReasonRequest',
              },
            },
          },
        },
        responses: {
          '200': { description: 'KYC rejected successfully' },
          '400': { description: 'Missing reason or invalid status transition' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'KYC record not found' },
          '409': { description: 'KYC already reviewed or concurrent conflict' },
        },
      },
    },
    '/api/v1/admin/kyc/{id}/request-correction': {
      post: {
        tags: ['Admin KYC'],
        summary: 'Request correction for KYC submission',
        description:
          'Requests corrections for a submitted KYC record with instructions for the user to resubmit.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/AdminKycReviewReasonRequest',
              },
            },
          },
        },
        responses: {
          '200': { description: 'Correction requested successfully' },
          '400': { description: 'Missing reason or invalid status transition' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required (MODERATEUR minimum)' },
          '404': { description: 'KYC record not found' },
          '409': { description: 'KYC already reviewed or concurrent conflict' },
        },
      },
    },
    '/api/v1/admin/kyc/{id}/legal-hold': {
      post: {
        tags: ['Admin KYC'],
        summary: 'Set or remove legal hold on KYC',
        description:
          'Sets or removes a legal hold on a KYC record. When legal hold is active, the record cannot be anonymized or purged. Requires SUPER_ADMIN access.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/KycLegalHoldRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Legal hold updated successfully' },
          '400': { description: 'Invalid request body' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: SUPER_ADMIN access required' },
          '404': { description: 'KYC record not found' },
        },
      },
    },
    '/api/v1/admin/kyc/{id}/anonymize': {
      post: {
        tags: ['Admin KYC'],
        summary: 'Anonymize KYC record',
        description:
          'Anonymizes all personal data in a KYC record and deletes associated Cloudinary documents. Cannot be performed on records under legal hold. Requires SUPER_ADMIN access.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/KycAnonymizeRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'KYC anonymization processed' },
          '400': { description: 'Retention period has not expired yet (unless force=true)' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: SUPER_ADMIN access required or KYC under legal hold' },
          '404': { description: 'KYC record not found' },
          '409': { description: 'Cloudinary deletion failed, anonymization aborted' },
        },
      },
    },
    '/api/v1/admin/kyc/purge/run': {
      post: {
        tags: ['Admin KYC'],
        summary: 'Run KYC purge job',
        description:
          'Triggers an immediate purge of all KYC records whose retention period has expired and are not under legal hold. Requires SUPER_ADMIN access.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Purge completed' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: SUPER_ADMIN access required' },
        },
      },
    },
    '/api/v1/oeuvres': {
      get: {
        tags: ['Artworks'],
        summary: 'List published artworks (public)',
        description:
          'Public consultation of published artworks with pagination, filters (categorieId, prixMin/prixMax, artisanType, localisation, q, disponibilite), and sorting. Only PUBLIEES artworks are exposed.',
        security: [],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, maximum: 50 },
          },
          {
            name: 'categorieId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'disponibilite',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['DISPONIBLE', 'SUR_COMMANDE', 'EN_EXPOSITION'],
            },
          },
          {
            name: 'prixMin',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0 },
          },
          {
            name: 'prixMax',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0 },
          },
          {
            name: 'artisanType',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['ARTISAN', 'ARTISTE'] },
          },
          { name: 'localisation', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
          {
            name: 'tri',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['pertinence', 'prix_asc', 'prix_desc', 'recent'] },
          },
        ],
        responses: {
          '200': { description: 'List of published artworks' },
          '400': { description: 'Invalid query parameters' },
        },
      },
    },
    '/api/v1/oeuvres/featured': {
      get: {
        tags: ['Artworks'],
        summary: 'List featured published artworks (public)',
        description:
          'Returns artworks that are both PUBLIEES and flagged as featured (estMiseEnAvant).',
        security: [],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 12, maximum: 50 },
          },
        ],
        responses: {
          '200': { description: 'List of featured published artworks' },
          '400': { description: 'Invalid query parameters' },
        },
      },
    },
    '/api/v1/oeuvres/{id}': {
      get: {
        tags: ['Artworks'],
        summary: 'Get a single published artwork (public)',
        description:
          'Public detail of a PUBLIEE artwork including artisan, categorie, medias and certificat.',
        security: [],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Published artwork details' },
          '400': { description: 'Invalid artwork id' },
          '404': { description: 'Artwork not found or not published' },
        },
      },
    },
    '/api/v1/artisans/{artisanId}/oeuvres': {
      get: {
        tags: ['Artworks'],
        summary: 'List published artworks of an artisan (public)',
        description: 'Public paginated list of an artisan PUBLIEES artworks.',
        security: [],
        parameters: [
          {
            name: 'artisanId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, maximum: 50 },
          },
        ],
        responses: {
          '200': { description: 'List of the artisan published artworks' },
          '400': { description: 'Invalid parameters' },
          '404': { description: 'Artisan not found' },
        },
      },
    },
    '/api/v1/artisan/oeuvres': {
      get: {
        tags: ['Artworks'],
        summary: 'List my artworks (artisan)',
        description:
          'Consultation only: paginated list of the authenticated artisan own artworks (the artisan never creates or modifies artworks; the admin owns artwork CRUD).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, maximum: 50 },
          },
          {
            name: 'statut',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['BROUILLON', 'EN_ATTENTE_VALIDATION', 'PUBLIEE', 'RETIREE'],
            },
          },
        ],
        responses: {
          '200': { description: 'List of my artworks' },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/api/v1/artisan/oeuvres/{id}': {
      get: {
        tags: ['Artworks'],
        summary: 'Get my artwork (artisan)',
        description: 'Consultation only: returns a single artwork owned by the authenticated artisan.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Artwork details' },
          '403': { description: 'Forbidden: artwork belongs to another artisan' },
          '404': { description: 'Artwork not found' },
        },
      },
    },
    '/api/v1/admin/oeuvres': {
      post: {
        tags: ['Artworks'],
        summary: 'Create an artwork (admin)',
        description:
          'Creates a BROUILLON artwork on behalf of an artisan. artisanId (ArtisanProfile id) is required and validated server-side (profile exists, role ARTISAN, account ACTIF). Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OeuvreCreateRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Artwork created' },
          '400': { description: 'Invalid payload or missing/invalid artisanId' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required or artisan not active' },
          '404': { description: 'Artisan profile or category not found' },
        },
      },
      get: {
        tags: ['Artworks'],
        summary: 'List all artworks (admin)',
        description:
          'Admin listing of artworks with optional filters (statut, artisanId, categorieId, disponibilite, q). Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, maximum: 50 },
          },
          {
            name: 'statut',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['BROUILLON', 'EN_ATTENTE_VALIDATION', 'PUBLIEE', 'VENDUE', 'RETIREE'],
            },
          },
          {
            name: 'artisanId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'categorieId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'disponibilite',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['DISPONIBLE', 'SUR_COMMANDE', 'EN_EXPOSITION'],
            },
          },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'List of all artworks' },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/oeuvres/export': {
      get: {
        tags: ['Artworks'],
        summary: 'Export artworks to CSV (admin)',
        description:
          'Exports artworks as a CSV file respecting the same filters as the list endpoint (statut, artisanId, categorieId, disponibilite, q). Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'statut',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['BROUILLON', 'EN_ATTENTE_VALIDATION', 'PUBLIEE', 'VENDUE', 'RETIREE'],
            },
          },
          {
            name: 'artisanId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'categorieId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'disponibilite',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['DISPONIBLE', 'SUR_COMMANDE', 'EN_EXPOSITION'],
            },
          },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'CSV file exported',
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/oeuvres/{id}': {
      get: {
        tags: ['Artworks'],
        summary: 'Get artwork details (admin)',
        description:
          'Returns full artwork details for admin review. Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Artwork details' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Artwork not found' },
        },
      },
      patch: {
        tags: ['Artworks'],
        summary: 'Update an artwork (admin)',
        description:
          'Updates an artwork content. Only non-published artworks may be edited. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OeuvreUpdateRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Artwork updated' },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Artwork not found' },
          '409': { description: 'Artwork is published and cannot be modified' },
        },
      },
      delete: {
        tags: ['Artworks'],
        summary: 'Delete an artwork (admin)',
        description:
          'Deletes a BROUILLON artwork without linked order lines. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '204': { description: 'Artwork deleted' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Artwork not found' },
          '409': { description: 'Artwork cannot be deleted (not brouillon or has order lines)' },
        },
      },
    },
    '/api/v1/admin/oeuvres/{id}/publish': {
      post: {
        tags: ['Artworks'],
        summary: 'Publish an artwork (admin)',
        description:
          'Publishes a BROUILLON artwork (statut PUBLIEE), records the publishing admin (publishedByAdminId) and transactionally creates its SHA-256 certificate. At least one OEUVRE media is required. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Artwork published and certificate created' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Artwork not found' },
          '409': { description: 'Artwork is not publishable or has no OEUVRE media' },
        },
      },
    },
    '/api/v1/admin/oeuvres/{id}/withdraw': {
      post: {
        tags: ['Artworks'],
        summary: 'Withdraw an artwork (admin)',
        description:
          'Withdraws a PUBLIEE artwork (RETIREE) and invalidates its certificate. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Artwork withdrawn' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Artwork not found' },
          '409': { description: 'Artwork is not published' },
        },
      },
    },
    '/api/v1/admin/oeuvres/{id}/medias': {
      post: {
        tags: ['Artworks'],
        summary: 'Upload an artwork media (admin)',
        description:
          'Uploads an image (JPEG/PNG/WEBP, max 10MB) for an artwork. Pass type=OEUVRE (max 7) or type=PREPARATION (max 3). Limits are enforced server-side. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          {
            name: 'type',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['OEUVRE', 'PREPARATION'], default: 'OEUVRE' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string', format: 'binary' } },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Media uploaded' },
          '400': { description: 'Invalid or unsupported file, no file provided' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Artwork not found' },
          '409': { description: 'Media limit reached for this type (7 OEUVRE / 3 PREPARATION)' },
          '502': { description: 'Cloudinary upload failure' },
        },
      },
    },
    '/api/v1/admin/oeuvres/{id}/medias/{mediaId}': {
      delete: {
        tags: ['Artworks'],
        summary: 'Delete an artwork media (admin)',
        description: 'Deletes a media from an artwork, removing it from Cloudinary.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          {
            name: 'mediaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '204': { description: 'Media deleted' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Artwork or media not found' },
        },
      },
    },
    '/api/v1/admin/oeuvres/{id}/medias/reorder': {
      patch: {
        tags: ['Artworks'],
        summary: 'Reorder artwork medias (admin)',
        description:
          'Reorders the media list of an artwork by providing the full ordered media ids.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OeuvreReorderMediasRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Medias reordered' },
          '400': { description: 'Invalid or incomplete media list, duplicates detected' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Artwork not found' },
        },
      },
    },
    '/api/v1/admin/oeuvres/artisans/{artisanId}/photo-atelier': {
      post: {
        tags: ['Artworks'],
        summary: 'Set the atelier photo of an artisan (admin)',
        description:
          'Uploads the single atelier photo (max 1) for an artisan profile. Replaces any existing photo. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'artisanId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { file: { type: 'string', format: 'binary' } },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Atelier photo stored' },
          '400': { description: 'Invalid or unsupported file' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Artisan profile not found' },
        },
      },
      delete: {
        tags: ['Artworks'],
        summary: 'Remove the atelier photo of an artisan (admin)',
        description: 'Removes the single atelier photo of an artisan profile.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'artisanId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '204': { description: 'Atelier photo removed' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Artisan profile or photo not found' },
        },
      },
    },
    '/api/v1/commandes': {
      post: {
        tags: ['Orders'],
        summary: 'Create a command (acheteur)',
        description:
          'Creates an order for the authenticated ACHETEUR. Prices, sub-total, commission, fees and total are always recomputed server-side from the published artworks (never trusted from the client). Also creates the linked payment (EN_ATTENTE) and delivery (EN_ATTENTE), and marks the artworks as VENDUES in a single transaction.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateCommandeRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Order created' },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: Acheteur profile not found' },
          '404': { description: 'Artwork not found' },
          '409': { description: 'Artwork not available for order' },
        },
      },
      get: {
        tags: ['Orders'],
        summary: 'List my commands (acheteur)',
        description: 'Paginated list of the authenticated ACHETEUR own orders.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, maximum: 50 },
          },
        ],
        responses: {
          '200': { description: 'List of my orders' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: Acheteur profile not found' },
        },
      },
    },
    '/api/v1/commandes/{id}': {
      get: {
        tags: ['Orders'],
        summary: 'Get one of my commands (acheteur)',
        description: 'Returns a single order owned by the authenticated ACHETEUR.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Order details' },
          '400': { description: 'Invalid order id' },
          '401': { description: 'Authentication required' },
          '404': { description: 'Order not found or belongs to another user' },
        },
      },
    },
    '/api/v1/admin/commandes': {
      get: {
        tags: ['Orders'],
        summary: 'List all commands (admin)',
        description:
          'Admin listing of all orders with optional filters (statut, q search on client, artisan or artwork) and pagination. Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, maximum: 50 },
          },
          {
            name: 'statut',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: [
                'COMMANDE',
                'PREPARATION',
                'EXPEDIEE',
                'LIVREE',
                'CLOTUREE',
                'ANNULEE',
                'REMBOURSEE',
              ],
            },
          },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'List of all orders' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/commandes/export': {
      get: {
        tags: ['Orders'],
        summary: 'Export commands to CSV (admin)',
        description:
          'Exports orders as a CSV file respecting the same filters as the list endpoint. Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'statut',
            in: 'query',
            required: false,
            schema: { type: 'string' },
          },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'CSV file exported' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/commandes/{id}': {
      get: {
        tags: ['Orders'],
        summary: 'Get command details (admin)',
        description:
          'Returns full order details (acheteur, lignes, paiement, livraison) for admin review. Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Order details' },
          '400': { description: 'Invalid order id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Order not found' },
        },
      },
    },
    '/api/v1/admin/commandes/{id}/statut': {
      post: {
        tags: ['Orders'],
        summary: 'Advance order status (admin)',
        description:
          'Applies a controlled status transition. Only the direct next step of the normal workflow is accepted: COMMANDE → PREPARATION → EXPEDIEE → LIVREE → CLOTUREE. CLOTUREE, ANNULEE and REMBOURSEE are terminal. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StatutCommandeRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Status updated' },
          '400': { description: 'Invalid payload or order id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Order not found' },
          '409': { description: 'Invalid status transition' },
        },
      },
    },
    '/api/v1/admin/commandes/{id}/annuler': {
      post: {
        tags: ['Orders'],
        summary: 'Cancel a command (admin)',
        description:
          'Cancels an order (statut ANNULEE, terminal). Allowed from COMMANDE, PREPARATION or EXPEDIEE. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Order cancelled' },
          '400': { description: 'Invalid order id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Order not found' },
          '409': { description: 'Order cannot be cancelled at its current status' },
        },
      },
    },
    '/api/v1/admin/livraisons': {
      get: {
        tags: ['Deliveries'],
        summary: 'List deliveries (admin)',
        description:
          'Paginated admin listing of all deliveries (expéditions) with optional filters (q search on commande id, numeroSuivi, transporteur or adresseDest; statut filter) and pagination. Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, maximum: 50 },
          },
          {
            name: 'statut',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: [
                'EN_ATTENTE',
                'PREPAREE',
                'EXPEDIEE',
                'EN_TRANSIT',
                'LIVREE',
                'ECHEC',
              ],
            },
          },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description:
              'Paginated list of deliveries: { success, items, total, page, limit, totalPages }',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeliveryListResponse' },
              },
            },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/livraisons/export': {
      get: {
        tags: ['Deliveries'],
        summary: 'Export deliveries to CSV (admin)',
        description:
          'Exports all filtered deliveries as a CSV file (up to 5000 rows), respecting the same filters as the list endpoint (q, statut). Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'statut',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: [
                'EN_ATTENTE',
                'PREPAREE',
                'EXPEDIEE',
                'EN_TRANSIT',
                'LIVREE',
                'ECHEC',
              ],
            },
          },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'CSV file exported (text/csv)',
            content: {
              'text/csv; charset=utf-8': {
                schema: { type: 'string' },
              },
            },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/livraisons/{id}': {
      get: {
        tags: ['Deliveries'],
        summary: 'Get delivery details (admin)',
        description:
          'Returns delivery details (transporteur, numeroSuivi, statut, adresseDest, frais) and the associated order (commande, acheteur). Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Delivery details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeliveryDetail' },
              },
            },
          },
          '400': { description: 'Invalid delivery id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Delivery not found' },
        },
      },
      patch: {
        tags: ['Deliveries'],
        summary: 'Update logistics information (admin)',
        description:
          'Updates the existing delivery fields transporteur and/or numeroSuivi. At least one field is required. The update is applied directly on the Livraison record: the order, its payment and its artworks are never modified. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateDeliveryRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Delivery updated' },
          '400': { description: 'Invalid payload or delivery id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Delivery not found' },
        },
      },
    },
    '/api/v1/admin/livraisons/{id}/statut': {
      patch: {
        tags: ['Deliveries'],
        summary: 'Update delivery status (admin)',
        description:
          'Updates the delivery status manually using the existing DeliveryStatus enum (EN_ATTENTE, PREPAREE, EXPEDIEE, EN_TRANSIT, LIVREE, ECHEC). The status update is independent of the order status: Commande.statut is never modified. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateDeliveryStatutRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Status updated' },
          '400': { description: 'Invalid payload or delivery id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Delivery not found' },
        },
      },
    },
    '/api/v1/admin/avis': {
      get: {
        tags: ['Reviews'],
        summary: 'List reviews (admin)',
        description:
          'Paginated admin list of reviews with database-side search and filters. Search q matches the comment, buyer name and artwork title. Filters only use real fields: note (1-5), estVerifie, dateDebut/dateFin (dateAvis), commandeId, auteurId (buyer userId), oeuvreId, artisanId. Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
          { name: 'q', in: 'query', required: false, schema: { type: 'string', maxLength: 255 } },
          { name: 'note', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 5 } },
          { name: 'estVerifie', in: 'query', required: false, schema: { type: 'boolean' } },
          { name: 'dateDebut', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
          { name: 'dateFin', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
          { name: 'commandeId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'auteurId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'oeuvreId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'artisanId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Paginated review list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReviewListResponse' },
              },
            },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/avis/export': {
      get: {
        tags: ['Reviews'],
        summary: 'Export reviews as CSV (admin)',
        description:
          'Exports filtered reviews as CSV using the same filters as the list endpoint, capped at 5000 rows and without user pagination.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', required: false, schema: { type: 'string', maxLength: 255 } },
          { name: 'note', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 5 } },
          { name: 'estVerifie', in: 'query', required: false, schema: { type: 'boolean' } },
          { name: 'dateDebut', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
          { name: 'dateFin', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
          { name: 'commandeId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'auteurId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'oeuvreId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'artisanId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'CSV export',
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/avis/{id}': {
      get: {
        tags: ['Reviews'],
        summary: 'Get review detail (admin)',
        description:
          'Returns the full review detail with the attached order, buyer, and order lines (artwork title and artisan studio) using only the real relations available on the Avis model.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Review detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReviewDetail' },
              },
            },
          },
          '400': { description: 'Invalid review id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Review not found' },
        },
      },
    },
    '/api/v1/admin/litiges': {
      get: {
        tags: ['Disputes'],
        summary: 'List disputes (admin)',
        description:
          'Paginated admin list of disputes with database-side search and filters. Search q matches the dispute id, order id, motif, artisan (studio name or person name), buyer name and artwork title. Filters only use real fields: statut (OUVERT, EN_COURS, RESOLU), commandeId, clientId (buyer userId), artisanId, dateDebut/dateFin (createdAt). Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
          { name: 'q', in: 'query', required: false, schema: { type: 'string', maxLength: 255 } },
          { name: 'statut', in: 'query', required: false, schema: { type: 'string', enum: ['OUVERT', 'EN_COURS', 'RESOLU'] } },
          { name: 'commandeId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'clientId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'artisanId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'dateDebut', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
          { name: 'dateFin', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          '200': {
            description: 'Paginated dispute list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DisputeListResponse' },
              },
            },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/litiges/export': {
      get: {
        tags: ['Disputes'],
        summary: 'Export disputes as CSV (admin)',
        description:
          'Exports filtered disputes as CSV using the same filters as the list endpoint, capped at 5000 rows and without user pagination.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', required: false, schema: { type: 'string', maxLength: 255 } },
          { name: 'statut', in: 'query', required: false, schema: { type: 'string', enum: ['OUVERT', 'EN_COURS', 'RESOLU'] } },
          { name: 'commandeId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'clientId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'artisanId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'dateDebut', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
          { name: 'dateFin', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          '200': {
            description: 'CSV export',
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/litiges/{id}': {
      get: {
        tags: ['Disputes'],
        summary: 'Get dispute detail (admin)',
        description:
          'Returns the full dispute detail: dispute fields (motif, statut, dates), the artisan concerned and the attached order with buyer, payment, delivery, order lines and artisan slices, using only the real relations available on the Litige model.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Dispute detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DisputeDetail' },
              },
            },
          },
          '400': { description: 'Invalid dispute id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Dispute not found' },
        },
      },
    },
    '/api/v1/categories': {
      get: {
        tags: ['Categories'],
        summary: 'List categories (public)',
        description:
          'Paginated public list of ACTIVE categories with their sous-categories. Filters: page, limit, statut, q.',
        security: [],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, maximum: 100 },
          },
          {
            name: 'statut',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
          },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Paginated list of categories' },
          '400': { description: 'Invalid query parameters' },
        },
      },
      post: {
        tags: ['Categories'],
        summary: 'Create a category (admin)',
        description:
          'Creates a category. The slug is auto-generated from the name (unique). statut and position are optional. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nom: { type: 'string', maxLength: 255 },
                  description: { type: 'string', default: '' },
                  statut: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
                  position: { type: 'integer', minimum: 0 },
                },
                required: ['nom'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '201': { description: 'Category created' },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '409': { description: 'A category with this name already exists' },
        },
      },
    },
    '/api/v1/categories/{id}': {
      get: {
        tags: ['Categories'],
        summary: 'Get a category (public)',
        security: [],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Category details' },
          '400': { description: 'Invalid category id' },
          '404': { description: 'Category not found' },
        },
      },
      patch: {
        tags: ['Categories'],
        summary: 'Update a category (admin)',
        description: 'Updates nom, description, statut or position. The slug is regenerated when the name changes. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nom: { type: 'string', maxLength: 255 },
                  description: { type: 'string' },
                  statut: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
                  position: { type: 'integer', minimum: 0 },
                },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '200': { description: 'Category updated' },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Category not found' },
          '409': { description: 'A category with this name already exists' },
        },
      },
      delete: {
        tags: ['Categories'],
        summary: 'Delete a category (admin)',
        description:
          'Deletes a category only if it has no attached sous-categories or oeuvres; otherwise a business conflict is returned. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '204': { description: 'Category deleted' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Category not found' },
          '409': { description: 'Category still referenced by oeuvres or sous-categories' },
        },
      },
    },
    '/api/v1/categories/{id}/image': {
      post: {
        tags: ['Categories'],
        summary: 'Upload category cover image (admin)',
        description:
          'Uploads a cover image (multipart, field "file") for the category via Cloudinary. Replaces and deletes any previous image. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Cover image uploaded' },
          '400': { description: 'Invalid image or format not allowed' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Category not found' },
        },
      },
      delete: {
        tags: ['Categories'],
        summary: 'Delete category cover image (admin)',
        description: 'Removes the cover image from Cloudinary and clears the fields. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Cover image removed' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Category or image not found' },
        },
      },
    },
    '/api/v1/categories/{categorieId}/sous-categories': {
      get: {
        tags: ['Categories'],
        summary: 'List sous-categories of a category (public)',
        security: [],
        parameters: [
          {
            name: 'categorieId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'List of sous-categories' },
          '400': { description: 'Invalid category id' },
          '404': { description: 'Category not found' },
        },
      },
      post: {
        tags: ['Categories'],
        summary: 'Create a sous-category (admin)',
        description:
          'Creates a sous-category under an existing category. The slug is auto-generated. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'categorieId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nom: { type: 'string', maxLength: 255 },
                  description: { type: 'string', default: '' },
                  statut: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
                  position: { type: 'integer', minimum: 0 },
                },
                required: ['nom'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '201': { description: 'Sous-category created' },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Parent category not found' },
          '409': { description: 'Duplicate name within the category' },
        },
      },
    },
    '/api/v1/categories/{categorieId}/sous-categories/{sousCategorieId}': {
      patch: {
        tags: ['Categories'],
        summary: 'Update a sous-category (admin)',
        description: 'Updates nom, description, statut or position of a sous-category. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'categorieId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'sousCategorieId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nom: { type: 'string', maxLength: 255 },
                  description: { type: 'string' },
                  statut: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
                  position: { type: 'integer', minimum: 0 },
                },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '200': { description: 'Sous-category updated' },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Sous-category not found' },
          '409': { description: 'Duplicate name within the category' },
        },
      },
      delete: {
        tags: ['Categories'],
        summary: 'Delete a sous-category (admin)',
        description: 'Deletes a sous-category. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'categorieId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'sousCategorieId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '204': { description: 'Sous-category deleted' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Sous-category not found' },
          '409': { description: 'Sous-category still referenced' },
        },
      },
    },
    '/api/v1/categories/{categorieId}/sous-categories/{sousCategorieId}/image': {
      post: {
        tags: ['Categories'],
        summary: 'Upload sous-category cover image (admin)',
        description:
          'Uploads a cover image (multipart, field "file") for the sous-category via Cloudinary. Replaces and deletes any previous image. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'categorieId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'sousCategorieId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Cover image uploaded' },
          '400': { description: 'Invalid image or format not allowed' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Sous-category not found' },
        },
      },
      delete: {
        tags: ['Categories'],
        summary: 'Delete sous-category cover image (admin)',
        description: 'Removes the cover image from Cloudinary and clears the fields. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'categorieId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'sousCategorieId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Cover image removed' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Sous-category or image not found' },
        },
      },
    },
    '/api/v1/admin/articles': {
      post: {
        tags: ['Articles'],
        summary: 'Create an article (admin)',
        description:
          'Creates an article in status BROUILLON. The slug is auto-generated from the title (unique, collision handled). The authenticated admin is recorded as author. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ArticleCreateRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Article created' },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Article category not found' },
          '409': { description: 'Admin profile not found' },
        },
      },
      get: {
        tags: ['Articles'],
        summary: 'List articles (admin)',
        description:
          'Paginated list of non-deleted articles with filters (statut, categorieId, auteurId, dateDebut, dateFin, q) and sorting (tri). q searches the title, content, slug, category name and author name (case-insensitive). Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, maximum: 100 },
          },
          {
            name: 'statut',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['BROUILLON', 'PLANIFIE', 'PUBLIE'] },
          },
          {
            name: 'categorieId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'auteurId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'dateDebut',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'dateFin',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'date-time' },
          },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
          {
            name: 'tri',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['recent', 'plus_ancien', 'titre'] },
          },
        ],
        responses: {
          '200': { description: 'Paginated list of articles' },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/articles/export': {
      get: {
        tags: ['Articles'],
        summary: 'Export articles to CSV (admin)',
        description:
          'Exports filtered articles as a CSV file (up to 5000 rows), applying the same filters as the list endpoint (statut, categorieId, auteurId, dateDebut, dateFin, q) without user pagination. Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'statut',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['BROUILLON', 'PLANIFIE', 'PUBLIE'] },
          },
          {
            name: 'categorieId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'auteurId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'dateDebut',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'dateFin',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'date-time' },
          },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'CSV file exported (text/csv)',
            content: {
              'text/csv; charset=utf-8': {
                schema: { type: 'string' },
              },
            },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
        },
      },
    },
    '/api/v1/admin/articles/{id}': {
      get: {
        tags: ['Articles'],
        summary: 'Get an article (admin)',
        description:
          'Returns full article details including category and author. Requires SUPPORT admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Article details' },
          '400': { description: 'Invalid article id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'Article not found' },
        },
      },
      patch: {
        tags: ['Articles'],
        summary: 'Update an article (admin)',
        description:
          'Updates titre, contenu, metaDescription or categorieId. The slug is regenerated when the title changes. Only BROUILLON or PLANIFIE articles may be edited. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ArticleUpdateRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Article updated' },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Article or category not found' },
          '409': { description: 'Article is published and cannot be modified' },
        },
      },
      delete: {
        tags: ['Articles'],
        summary: 'Delete an article (admin)',
        description:
          'Soft-deletes an article (deletedAt set) and removes its cover image from Cloudinary. Historical references are preserved. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '204': { description: 'Article soft-deleted' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Article not found' },
        },
      },
    },
    '/api/v1/admin/articles/{id}/publish': {
      post: {
        tags: ['Articles'],
        summary: 'Publish an article (admin)',
        description:
          'Transitions a BROUILLON or PLANIFIE article to PUBLIE, sets datePublication and records the publishing admin. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Article published' },
          '400': { description: 'Invalid article id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Article not found' },
          '409': { description: 'Already published or invalid transition' },
        },
      },
    },
    '/api/v1/admin/articles/{id}/schedule': {
      post: {
        tags: ['Articles'],
        summary: 'Schedule an article (admin)',
        description:
          'Transitions a BROUILLON article to PLANIFIE with a datePlanification. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ArticleScheduleRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Article scheduled' },
          '400': { description: 'Invalid payload or article id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Article not found' },
          '409': { description: 'Article is not a brouillon' },
        },
      },
    },
    '/api/v1/admin/articles/{id}/unpublish': {
      post: {
        tags: ['Articles'],
        summary: 'Unpublish an article (admin)',
        description:
          'Transitions a PLANIFIE or PUBLIE article back to BROUILLON, clearing publication dates. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Article returned to draft' },
          '400': { description: 'Invalid article id' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Article not found' },
          '409': { description: 'Article is already a brouillon' },
        },
      },
    },
    '/api/v1/admin/articles/{id}/cover': {
      post: {
        tags: ['Articles'],
        summary: 'Upload article cover image (admin)',
        description:
          'Uploads a cover image (multipart, field "file", JPEG/PNG/WEBP max 10MB) via Cloudinary. Replaces and deletes any previous image. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Cover image uploaded' },
          '400': { description: 'Invalid image, no file, or format not allowed' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Article not found' },
          '502': { description: 'Cloudinary upload failure' },
        },
      },
      delete: {
        tags: ['Articles'],
        summary: 'Delete article cover image (admin)',
        description:
          'Removes the cover image from Cloudinary and clears the fields. Requires MODERATEUR admin level minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Cover image removed' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: insufficient admin level' },
          '404': { description: 'Article or image not found' },
        },
      },
    },
    '/api/v1/admin/users': {
      get: {
        tags: ['Users'],
        summary: 'List users (admin)',
        description:
          'Paginé, recherche par q (nom/e-mail/téléphone), filtres role, statut et bloques (SUSPENDU). Lecture seule : SUPPORT minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'role', in: 'query', required: false, schema: { type: 'string', enum: ['ACHETEUR', 'ARTISAN', 'ADMIN'] } },
          { name: 'statut', in: 'query', required: false, schema: { type: 'string', enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'] } },
          { name: 'bloques', in: 'query', required: false, schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': {
            description: 'Liste des utilisateurs',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminUserListResponse' },
              },
            },
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: non-admin or insufficient level' },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create user (admin)',
        description:
          'Créé un ACHETEUR/ARTISAN (MODERATEUR minimum) ou un ADMIN (SUPER_ADMIN uniquement). Le mot de passe est haché ; email et téléphone doivent être uniques.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminUserCreateRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Utilisateur créé',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminUserDetailResponse' },
              },
            },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: niveau insuffisant' },
          '409': { description: 'Conflit email/téléphone' },
        },
      },
    },
    '/api/v1/admin/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Get user detail (admin)',
        description:
          'Retourne l’utilisateur avec son profil associé (BuyerProfile, ArtisanProfile ou AdminProfile). SUPPORT minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Détail utilisateur',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminUserDetailResponse' },
              },
            },
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: non-admin' },
          '404': { description: 'Utilisateur non trouvé' },
        },
      },
    },
    '/api/v1/admin/users/{id}/statut': {
      patch: {
        tags: ['Users'],
        summary: 'Change user status (admin)',
        description:
          'Change le statut d’un utilisateur (parmi UserStatus). MODERATEUR minimum. Un administrateur ne peut pas modifier son propre statut.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminUserStatusRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Statut mis à jour',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminUserDetailResponse' },
              },
            },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: niveau insuffisant ou auto-modification' },
          '404': { description: 'Utilisateur non trouvé' },
        },
      },
    },
    '/api/v1/admin/users/{id}/role': {
      patch: {
        tags: ['Users'],
        summary: 'Change user role (admin)',
        description:
          'Change le rôle d’un utilisateur. SUPER_ADMIN uniquement. Impossible de modifier son propre rôle. Gère la création/suppression de l’AdminProfile en transaction.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminUserRoleRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Rôle mis à jour',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminUserDetailResponse' },
              },
            },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: SUPER_ADMIN requis ou auto-modification' },
          '404': { description: 'Utilisateur non trouvé' },
        },
      },
    },
    '/api/v1/admin/users/export': {
      get: {
        tags: ['Users'],
        summary: 'Export users CSV (admin)',
        description:
          'Exporte en CSV les utilisateurs selon les mêmes filtres que la liste (q, role, statut, bloques). Limite 5000 lignes, sans pagination. SUPPORT minimum.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'role', in: 'query', required: false, schema: { type: 'string', enum: ['ACHETEUR', 'ARTISAN', 'ADMIN'] } },
          { name: 'statut', in: 'query', required: false, schema: { type: 'string', enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'] } },
          { name: 'bloques', in: 'query', required: false, schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': { description: 'Fichier CSV', content: { 'text/csv': { schema: { type: 'string' } } } },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: non-admin' },
        },
      },
    },
  '/api/v1/admin/dashboard': {
      get: {
        tags: ['Admin Dashboard'],
        summary: 'Dashboard admin (SUPER_ADMIN)',
        description:
          "Vue d'ensemble des indicateurs de la plateforme : utilisateurs, KYC, œuvres, commandes, volume brut des commandes et évolution temporelle. Réservé au SUPER_ADMIN : le endpoint expose des données financières, SUPPORT et MODERATEUR n'y ont pas accès.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'period',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['7d', '30d', '90d', '12m'], default: '30d' },
            description: "Période d'analyse : 7d, 30d, 90d (journalier) ou 12m (mensuel).",
          },
        ],
        responses: {
          '200': {
            description: 'Indicateurs du dashboard',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminDashboardResponse' },
              },
            },
          },
          '400': { description: 'Période invalide (doit être 7d, 30d, 90d ou 12m)' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: SUPER_ADMIN requis' },
        },
      },
    },
  '/api/v1/admin/artisans': {
      get: {
        tags: ['Admin Artisans'],
        summary: 'Liste des artisans (SUPPORT+)',
        description:
          "Liste paginée des artisans (rôle ARTISAN, non supprimés). Chaque ligne expose le nom, l'atelier, l'avatar, la spécialité, la localisation, la date d'inscription, le statut du compte, le statut du dernier dossier KYC (sans documents), le nombre d'œuvres et le volume brut des commandes. Réservé aux administrateurs (SUPPORT minimum).",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'q', in: 'query', required: false, schema: { type: 'string' }, description: 'Recherche sur nom, e-mail, téléphone, atelier, spécialité ou localisation.' },
          { name: 'kycStatus', in: 'query', required: false, schema: { type: 'string', enum: ['BROUILLON', 'SOUMIS', 'EN_ATTENTE', 'VALIDE', 'REJETE', 'CORRECTION_REQUISE', 'EXPIRE'] }, description: 'Statut du dernier dossier KYC. Exclut kycPending.' },
          { name: 'kycPending', in: 'query', required: false, schema: { type: 'string', enum: ['true', 'false'] }, description: 'true = dernier KYC en attente (SOUMIS ou EN_ATTENTE). Exclut kycStatus.' },
          { name: 'accountStatus', in: 'query', required: false, schema: { type: 'string', enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'] }, description: 'Statut du compte utilisateur (ex. SUSPENDU pour la maquette « Suspendus »).' },
        ],
        responses: {
          '200': {
            description: 'Liste paginée des artisans',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminArtisanListResponse' },
              },
            },
          },
          '400': { description: 'Paramètre invalide (kycStatus + kycPending exclusifs, limit > 100…)' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: SUPPORT minimum requis' },
        },
      },
    },
  '/api/v1/admin/artisans/{id}': {
      get: {
        tags: ['Admin Artisans'],
        summary: "Détail administratif d'un artisan (SUPPORT+)",
        description:
          "Profil utilisateur, données de l'atelier, synthèse du dernier dossier KYC (statut et dates, sans pièces jointes — à consulter via l'API KYC dédiée) et statistiques (œuvres par statut, commandes, volume brut). id = identifiant du profil artisan (ArtisanProfile.id).",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': {
            description: "Détail administratif de l'artisan",
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminArtisanDetailResponse' },
              },
            },
          },
          '400': { description: "Identifiant d'artisan invalide (UUID requis)" },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: SUPPORT minimum requis' },
          '404': { description: 'Artisan non trouvé' },
        },
      },
    },
  '/api/v1/admin/artisans/{id}/artworks': {
      get: {
        tags: ['Admin Artisans'],
        summary: "Œuvres d'un artisan (SUPPORT+)",
        description:
          'Liste paginée des œuvres de l\'artisan, filtrable par statut. Données minimales : titre, statut, prix, date de création et image de couverture.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'statut', in: 'query', required: false, schema: { type: 'string', enum: ['BROUILLON', 'EN_ATTENTE_VALIDATION', 'PUBLIEE', 'EN_PANIER', 'VENDUE', 'RETIREE'] } },
        ],
        responses: {
          '200': {
            description: 'Œuvres de l\'artisan',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminArtisanArtworksResponse' },
              },
            },
          },
          '400': { description: 'Paramètre invalide (id UUID, statut œuvre valide, limit ≤ 100)' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: SUPPORT minimum requis' },
          '404': { description: 'Artisan non trouvé' },
        },
      },
    },
  '/api/v1/admin/artisans/{id}/orders': {
      get: {
        tags: ['Admin Artisans'],
        summary: "Commandes d'un artisan (SUPPORT+)",
        description:
          'Liste paginée des commandes de l\'artisan issues de CommandeArtisan, filtrable par statut : sous-total, commission, frais de livraison, montant total, et données minimales de la commande globale et de l\'acheteur (sans numéro de téléphone).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          { name: 'statut', in: 'query', required: false, schema: { type: 'string', enum: ['COMMANDE', 'PREPARATION', 'EXPEDIEE', 'LIVREE', 'CLOTUREE', 'ANNULEE', 'REMBOURSEE'] } },
        ],
        responses: {
          '200': {
            description: 'Commandes de l\'artisan',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminArtisanOrdersResponse' },
              },
            },
          },
          '400': { description: 'Paramètre invalide (id UUID, statut commande valide, limit ≤ 100)' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Forbidden: SUPPORT minimum requis' },
          '404': { description: 'Artisan non trouvé' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      KycSubmissionRequest: {
        type: 'object',
        properties: {
          identityData: { type: 'object', additionalProperties: true },
          professionData: { type: 'object', additionalProperties: true },
          additionalInfo: { type: 'object', additionalProperties: true },
          addressData: { type: 'object', additionalProperties: true },
          identityDocument: { type: 'object', additionalProperties: true },
          supportingDocs: { type: 'object', additionalProperties: true },
        },
        required: ['identityData', 'addressData', 'identityDocument'],
        additionalProperties: false,
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', nullable: true, example: 'user@example.com' },
          telephone: { type: 'string', example: '+22890123456' },
          role: { type: 'string', enum: ['ACHETEUR', 'ARTISAN', 'ADMIN'] },
          statut: {
            type: 'string',
            enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'],
          },
          telephoneVerificationStatus: {
            type: 'string',
            enum: ['NON_VERIFIE', 'EN_ATTENTE_VERIFICATION', 'VERIFIE', 'BLOQUE'],
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'telephone', 'role', 'statut', 'createdAt', 'updatedAt'],
      },
      AdminUserItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          nom: { type: 'string', nullable: true, example: 'Awa Mensah' },
          email: { type: 'string', nullable: true, example: 'awa@example.com' },
          telephone: { type: 'string', example: '+22890123456' },
          role: { type: 'string', enum: ['ACHETEUR', 'ARTISAN', 'ADMIN'] },
          statut: {
            type: 'string',
            enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'],
          },
          telephoneVerificationStatus: {
            type: 'string',
            enum: ['NON_VERIFIE', 'EN_ATTENTE_VERIFICATION', 'VERIFIE', 'BLOQUE'],
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          artisanProfile: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              nomAtelier: { type: 'string' },
              specialite: { type: 'string' },
              estCertifie: { type: 'boolean' },
            },
          },
          buyerProfile: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              typeClient: { type: 'string', enum: ['PARTICULIER', 'PROFESSIONNEL', 'COLLECTIONNEUR'] },
              adresseLivraison: { type: 'string' },
            },
          },
          adminProfile: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              niveauAcces: { type: 'string', enum: ['SUPPORT', 'MODERATEUR', 'SUPER_ADMIN'] },
            },
          },
        },
        required: ['id', 'telephone', 'role', 'statut', 'createdAt', 'updatedAt'],
      },
      AdminUserListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          items: { type: 'array', items: { $ref: '#/components/schemas/AdminUserItem' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
        required: ['success', 'items', 'total', 'page', 'limit', 'totalPages'],
      },
      AdminUserDetailResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          user: { $ref: '#/components/schemas/AdminUserItem' },
        },
        required: ['success', 'user'],
      },
      AdminUserCreateRequest: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['ACHETEUR', 'ARTISAN', 'ADMIN'] },
          nom: { type: 'string', example: 'Awa Mensah' },
          email: { type: 'string', format: 'email', example: 'awa@example.com' },
          telephone: { type: 'string', example: '+22890123456' },
          motDePasse: { type: 'string', format: 'password', minLength: 8, maxLength: 128 },
          statut: {
            type: 'string',
            enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'],
          },
          niveauAcces: { type: 'string', enum: ['SUPPORT', 'MODERATEUR', 'SUPER_ADMIN'] },
          artisanProfile: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['ARTISAN', 'ARTISTE'] },
              nomAtelier: { type: 'string' },
              specialite: { type: 'string' },
              localisation: { type: 'string' },
              biographie: { type: 'string' },
              anneesExperience: { type: 'integer' },
            },
          },
          buyerProfile: {
            type: 'object',
            properties: {
              adresseLivraison: { type: 'string' },
              typeClient: { type: 'string', enum: ['PARTICULIER', 'PROFESSIONNEL', 'COLLECTIONNEUR'] },
              devise: { type: 'string' },
              langue: { type: 'string' },
            },
          },
        },
        required: ['role', 'telephone', 'motDePasse'],
      },
      AdminUserStatusRequest: {
        type: 'object',
        properties: {
          statut: {
            type: 'string',
            enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'],
          },
        },
        required: ['statut'],
      },
      AdminUserRoleRequest: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['ACHETEUR', 'ARTISAN', 'ADMIN'] },
          niveauAcces: { type: 'string', enum: ['SUPPORT', 'MODERATEUR', 'SUPER_ADMIN'] },
        },
        required: ['role'],
      },
      AuthOtpSendRequest: {
        type: 'object',
        properties: {
          phone: { type: 'string', example: '+22890123456' },
        },
        required: ['phone'],
      },
      AuthOtpVerifyRequest: {
        type: 'object',
        properties: {
          phone: { type: 'string', example: '+22890123456' },
          code: { type: 'string', example: '123456' },
        },
        required: ['phone', 'code'],
      },
      AuthRegisterRequest: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['ACHETEUR', 'ARTISAN'], example: 'ACHETEUR' },
          nom: {
            type: 'string',
            description: 'Buyer name or artisan atelier name',
            example: 'Awa Mensah',
          },
          telephone: { type: 'string', example: '+22890123456' },
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          specialite: {
            type: 'string',
            description: 'Required when role = ARTISAN',
            example: 'Sculpture',
          },
          localisation: {
            type: 'string',
            description: 'Required when role = ARTISAN',
            example: 'Lomé, Togo',
          },
          motDePasse: {
            type: 'string',
            format: 'password',
            minLength: 8,
            maxLength: 128,
            example: 'S3cretPassword!',
          },
        },
        required: ['role', 'nom', 'telephone', 'motDePasse'],
      },
      AuthLoginRequest: {
        type: 'object',
        properties: {
          telephone: { type: 'string', example: '+22890123456' },
          motDePasse: { type: 'string', format: 'password', example: 'S3cretPassword!' },
          role: {
            type: 'string',
            enum: ['ACHETEUR', 'ARTISAN'],
            description: 'Optional frontend space selection, only used to check UX coherence',
          },
        },
        required: ['telephone', 'motDePasse'],
      },
      AuthUserPublic: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          telephone: { type: 'string', example: '+22890123456' },
          nom: { type: 'string', nullable: true, example: 'Awa Mensah' },
          role: { type: 'string', enum: ['ACHETEUR', 'ARTISAN', 'ADMIN'] },
          statut: {
            type: 'string',
            enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'],
          },
          telephoneVerificationStatus: {
            type: 'string',
            enum: ['NON_VERIFIE', 'EN_ATTENTE_VERIFICATION', 'VERIFIE', 'BLOQUE'],
          },
        },
        required: ['id', 'telephone', 'role', 'statut', 'telephoneVerificationStatus'],
      },
      CreateCommandeRequest: {
        type: 'object',
        properties: {
          articles: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                oeuvreId: { type: 'string', format: 'uuid' },
                quantite: { type: 'integer', minimum: 1, maximum: 100 },
              },
              required: ['oeuvreId', 'quantite'],
            },
          },
          adresseLivraison: { type: 'string', example: 'Lomé, Tokoin, Rue 12' },
          transporteur: { type: 'string', example: 'DHL Express' },
          fraisLivraison: { type: 'number', minimum: 0, default: 0 },
          methodePaiement: {
            type: 'string',
            enum: ['CARTE_BANCAIRE', 'MOBILE_MONEY', 'VIREMENT', 'ESPECES'],
          },
        },
        required: ['articles', 'adresseLivraison', 'transporteur', 'methodePaiement'],
        additionalProperties: false,
      },
      StatutCommandeRequest: {
        type: 'object',
        properties: {
          statut: {
            type: 'string',
            enum: [
              'COMMANDE',
              'PREPARATION',
              'EXPEDIEE',
              'LIVREE',
              'CLOTUREE',
              'ANNULEE',
              'REMBOURSEE',
            ],
          },
        },
        required: ['statut'],
        additionalProperties: false,
      },
      DeliveryListItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          transporteur: { type: 'string', example: 'DHL Express' },
          numeroSuivi: { type: 'string', nullable: true, example: 'TG48-851-PORT' },
          statut: {
            type: 'string',
            enum: ['EN_ATTENTE', 'PREPAREE', 'EXPEDIEE', 'EN_TRANSIT', 'LIVREE', 'ECHEC'],
          },
          adresseDest: { type: 'string', example: 'Lomé, Tokoin, Rue 12' },
          frais: { type: 'number', example: 1000 },
          commande: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              dateCreation: { type: 'string', format: 'date-time' },
              statut: { type: 'string', example: 'COMMANDE' },
            },
          },
        },
        required: ['id', 'transporteur', 'statut', 'adresseDest', 'frais', 'commande'],
      },
      DeliveryListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/DeliveryListItem' },
          },
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          totalPages: { type: 'integer', example: 3 },
        },
        required: ['success', 'items', 'total', 'page', 'limit', 'totalPages'],
      },
      DeliveryDetail: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          livraison: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              transporteur: { type: 'string' },
              numeroSuivi: { type: 'string', nullable: true },
              statut: {
                type: 'string',
                enum: ['EN_ATTENTE', 'PREPAREE', 'EXPEDIEE', 'EN_TRANSIT', 'LIVREE', 'ECHEC'],
              },
              adresseDest: { type: 'string' },
              frais: { type: 'number' },
              commande: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  dateCreation: { type: 'string', format: 'date-time' },
                  statut: { type: 'string', example: 'COMMANDE' },
                  typeCommande: { type: 'string', example: 'STANDARD' },
                  montantTotal: { type: 'number' },
                  fraisLivraison: { type: 'number' },
                  acheteur: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      adresseLivraison: { type: 'string', nullable: true },
                      user: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          nom: { type: 'string', nullable: true },
                          telephone: { type: 'string' },
                          email: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            required: ['id', 'transporteur', 'statut', 'adresseDest', 'frais'],
          },
        },
        required: ['success', 'livraison'],
      },
      UpdateDeliveryRequest: {
        type: 'object',
        properties: {
          transporteur: { type: 'string', maxLength: 255 },
          numeroSuivi: { type: 'string', maxLength: 255 },
        },
        description: 'At least one of transporteur or numeroSuivi must be provided.',
        additionalProperties: false,
      },
      UpdateDeliveryStatutRequest: {
        type: 'object',
        properties: {
          statut: {
            type: 'string',
            enum: ['EN_ATTENTE', 'PREPAREE', 'EXPEDIEE', 'EN_TRANSIT', 'LIVREE', 'ECHEC'],
          },
        },
        required: ['statut'],
        additionalProperties: false,
      },
      AvisQueryParams: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          q: { type: 'string', maxLength: 255 },
          note: { type: 'integer', minimum: 1, maximum: 5 },
          estVerifie: { type: 'boolean' },
          dateDebut: { type: 'string', format: 'date-time' },
          dateFin: { type: 'string', format: 'date-time' },
          commandeId: { type: 'string', format: 'uuid' },
          auteurId: { type: 'string', format: 'uuid' },
          oeuvreId: { type: 'string', format: 'uuid' },
          artisanId: { type: 'string', format: 'uuid' },
        },
      },
      ReviewListItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          note: { type: 'integer', minimum: 1, maximum: 5 },
          commentaire: { type: 'string' },
          dateAvis: { type: 'string', format: 'date-time' },
          estVerifie: { type: 'boolean' },
          commande: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              dateCreation: { type: 'string', format: 'date-time' },
              typeCommande: { type: 'string' },
              acheteur: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      nom: { type: 'string', nullable: true },
                      telephone: { type: 'string' },
                      email: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      ReviewListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          items: { type: 'array', items: { $ref: '#/components/schemas/ReviewListItem' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
        required: ['success', 'items', 'total', 'page', 'limit', 'totalPages'],
      },
      ReviewDetail: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          note: { type: 'integer', minimum: 1, maximum: 5 },
          commentaire: { type: 'string' },
          dateAvis: { type: 'string', format: 'date-time' },
          estVerifie: { type: 'boolean' },
          commande: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              dateCreation: { type: 'string', format: 'date-time' },
              statut: { type: 'string' },
              typeCommande: { type: 'string' },
              montantTotal: { type: 'number' },
              fraisLivraison: { type: 'number' },
              acheteur: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      nom: { type: 'string', nullable: true },
                      telephone: { type: 'string' },
                      email: { type: 'string', nullable: true },
                    },
                  },
                },
              },
              lignesCommande: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    quantite: { type: 'integer' },
                    prixUnitaire: { type: 'number' },
                    oeuvre: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        titre: { type: 'string' },
                      },
                    },
                    artisan: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        nomAtelier: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      DisputeQueryParams: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          q: { type: 'string', maxLength: 255 },
          statut: { type: 'string', enum: ['OUVERT', 'EN_COURS', 'RESOLU'] },
          commandeId: { type: 'string', format: 'uuid' },
          clientId: { type: 'string', format: 'uuid' },
          artisanId: { type: 'string', format: 'uuid' },
          dateDebut: { type: 'string', format: 'date-time' },
          dateFin: { type: 'string', format: 'date-time' },
        },
      },
      DisputeListItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          motif: { type: 'string' },
          statut: { type: 'string', enum: ['OUVERT', 'EN_COURS', 'RESOLU'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          commande: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              dateCreation: { type: 'string', format: 'date-time' },
              statut: { type: 'string' },
              typeCommande: { type: 'string' },
              montantTotal: { type: 'number' },
              acheteur: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      nom: { type: 'string', nullable: true },
                      telephone: { type: 'string' },
                      email: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
          artisan: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              nomAtelier: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  nom: { type: 'string', nullable: true },
                  telephone: { type: 'string' },
                  email: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
      DisputeListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          items: { type: 'array', items: { $ref: '#/components/schemas/DisputeListItem' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
        required: ['success', 'items', 'total', 'page', 'limit', 'totalPages'],
      },
      DisputeDetail: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          motif: { type: 'string' },
          statut: { type: 'string', enum: ['OUVERT', 'EN_COURS', 'RESOLU'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          commande: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              dateCreation: { type: 'string', format: 'date-time' },
              statut: { type: 'string' },
              typeCommande: { type: 'string' },
              montantTotal: { type: 'number' },
              commission: { type: 'number' },
              fraisLivraison: { type: 'number' },
              acheteur: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  adresseLivraison: { type: 'string' },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      nom: { type: 'string', nullable: true },
                      telephone: { type: 'string' },
                      email: { type: 'string', nullable: true },
                    },
                  },
                },
              },
              paiement: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  montant: { type: 'number' },
                  methode: { type: 'string' },
                  statut: { type: 'string' },
                  date: { type: 'string', format: 'date-time' },
                  estEnsequestre: { type: 'boolean' },
                },
              },
              livraison: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  transporteur: { type: 'string' },
                  numeroSuivi: { type: 'string', nullable: true },
                  statut: { type: 'string' },
                  adresseDest: { type: 'string' },
                  frais: { type: 'number' },
                },
              },
              lignesCommande: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    quantite: { type: 'integer' },
                    prixUnitaire: { type: 'number' },
                    artisanId: { type: 'string', format: 'uuid' },
                    oeuvre: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        titre: { type: 'string' },
                      },
                    },
                  },
                },
              },
              commandesArtisans: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    artisanId: { type: 'string', format: 'uuid' },
                    statut: { type: 'string' },
                    montantTotal: { type: 'number' },
                  },
                },
              },
            },
          },
          artisan: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              nomAtelier: { type: 'string' },
              localisation: { type: 'string' },
              estCertifie: { type: 'boolean' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  nom: { type: 'string', nullable: true },
                  telephone: { type: 'string' },
                  email: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
      Kyc: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          status: {
            type: 'string',
            enum: [
              'BROUILLON',
              'SOUMIS',
              'EN_ATTENTE',
              'VALIDE',
              'REJETE',
              'CORRECTION_REQUISE',
              'EXPIRE',
            ],
          },
          submittedAt: { type: 'string', format: 'date-time', nullable: true },
          reviewedAt: { type: 'string', format: 'date-time', nullable: true },
          rejectionReason: { type: 'string', nullable: true },
          resubmissionOfId: { type: 'string', format: 'uuid', nullable: true },
          retentionUntil: { type: 'string', format: 'date-time', nullable: true },
          legalHold: { type: 'boolean', example: false },
          anonymizedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'userId', 'status', 'legalHold', 'createdAt', 'updatedAt'],
      },
      AdminKycReviewReasonRequest: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            example: 'Document quality is insufficient, please provide a clear copy.',
          },
        },
        required: ['reason'],
      },
      KycLegalHoldRequest: {
        type: 'object',
        properties: {
          legalHold: { type: 'boolean', example: true },
        },
        required: ['legalHold'],
        additionalProperties: false,
      },
      KycAnonymizeRequest: {
        type: 'object',
        properties: {
          force: {
            type: 'boolean',
            example: false,
            description: 'Force anonymization even if retention period has not expired',
          },
        },
        additionalProperties: false,
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Invalid input provided' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['success', 'error'],
      },
      OeuvreCreateRequest: {
        type: 'object',
        properties: {
          artisanId: { type: 'string', format: 'uuid', example: 'artisan-profile-uuid' },
          titre: { type: 'string', maxLength: 200, example: 'Sculpture sur bois' },
          description: { type: 'string', example: 'Une sculpture réalisée à la main' },
          technique: { type: 'string', example: 'Main' },
          materiaux: { type: 'string', example: 'Bois, peinture' },
          dimensions: { type: 'string', example: '30x40x10 cm' },
          poids: { type: 'number', example: 2.5 },
          anneeCreation: { type: 'integer', example: 2023 },
          prixXOF: { type: 'integer', minimum: 0, example: 50000 },
          categorieId: { type: 'string', format: 'uuid' },
          disponibilite: {
            type: 'string',
            enum: ['DISPONIBLE', 'SUR_COMMANDE', 'EN_EXPOSITION'],
            default: 'DISPONIBLE',
          },
        },
        required: [
          'artisanId',
          'titre',
          'description',
          'technique',
          'materiaux',
          'dimensions',
          'anneeCreation',
          'prixXOF',
          'categorieId',
        ],
        additionalProperties: false,
      },
      OeuvreUpdateRequest: {
        type: 'object',
        properties: {
          titre: { type: 'string', maxLength: 200 },
          description: { type: 'string' },
          technique: { type: 'string' },
          materiaux: { type: 'string' },
          dimensions: { type: 'string' },
          poids: { type: 'number' },
          anneeCreation: { type: 'integer' },
          prixXOF: { type: 'integer', minimum: 0 },
          categorieId: { type: 'string', format: 'uuid' },
          estMiseEnAvant: { type: 'boolean' },
          disponibilite: {
            type: 'string',
            enum: ['DISPONIBLE', 'SUR_COMMANDE', 'EN_EXPOSITION'],
          },
        },
        additionalProperties: false,
      },
      OeuvreReorderMediasRequest: {
        type: 'object',
        properties: {
          mediaIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            minItems: 1,
            maxItems: 10,
          },
        },
        required: ['mediaIds'],
        additionalProperties: false,
      },
      ArticleCreateRequest: {
        type: 'object',
        properties: {
          titre: { type: 'string', maxLength: 255 },
          contenu: { type: 'string' },
          metaDescription: { type: 'string', maxLength: 500 },
          categorieId: { type: 'string', format: 'uuid' },
        },
        required: ['titre', 'contenu', 'categorieId'],
        additionalProperties: false,
      },
      ArticleUpdateRequest: {
        type: 'object',
        properties: {
          titre: { type: 'string', maxLength: 255 },
          contenu: { type: 'string' },
          metaDescription: { type: 'string', maxLength: 500 },
          categorieId: { type: 'string', format: 'uuid' },
        },
        additionalProperties: false,
      },
      ArticleScheduleRequest: {
        type: 'object',
        properties: {
          datePlanification: { type: 'string', format: 'date-time' },
        },
        required: ['datePlanification'],
        additionalProperties: false,
      },
      Article: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          titre: { type: 'string' },
          contenu: { type: 'string' },
          slug: { type: 'string' },
          metaDescription: { type: 'string', nullable: true },
          statut: { type: 'string', enum: ['BROUILLON', 'PLANIFIE', 'PUBLIE'] },
          datePublication: { type: 'string', format: 'date-time', nullable: true },
          datePlanification: { type: 'string', format: 'date-time', nullable: true },
          categorieId: { type: 'string', format: 'uuid' },
          imageCouvertureUrl: { type: 'string', nullable: true },
          imageCouverturePublicId: { type: 'string', nullable: true },
          auteurId: { type: 'string', format: 'uuid' },
          publishedByAdminId: { type: 'string', format: 'uuid', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'titre', 'contenu', 'slug', 'statut', 'categorieId', 'auteurId', 'createdAt', 'updatedAt'],
      },
      AdminDashboardResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          period: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: ['7d', '30d', '90d', '12m'] },
              from: { type: 'string', format: 'date-time' },
              to: { type: 'string', format: 'date-time' },
            },
          },
          users: {
            type: 'object',
            properties: {
              total: { type: 'integer' },
              buyers: { type: 'integer' },
              artisans: { type: 'integer' },
              newUsers: { type: 'integer' },
              newBuyers: { type: 'integer' },
              newArtisans: { type: 'integer' },
            },
          },
          kyc: {
            type: 'object',
            properties: {
              pending: { type: 'integer' },
              approved: { type: 'integer' },
              rejected: { type: 'integer' },
            },
          },
          artworks: {
            type: 'object',
            properties: {
              total: { type: 'integer' },
              published: { type: 'integer' },
              pending: { type: 'integer' },
              reserved: { type: 'integer' },
              withdrawn: { type: 'integer' },
              sold: { type: 'integer' },
              newArtworks: { type: 'integer' },
            },
          },
          orders: {
            type: 'object',
            properties: {
              total: { type: 'integer' },
              inPeriod: { type: 'integer' },
              byStatus: {
                type: 'object',
                properties: {
                  COMMANDE: { type: 'integer' },
                  PREPARATION: { type: 'integer' },
                  EXPEDIEE: { type: 'integer' },
                  LIVREE: { type: 'integer' },
                  CLOTUREE: { type: 'integer' },
                  ANNULEE: { type: 'integer' },
                  REMBOURSEE: { type: 'integer' },
                },
              },
            },
          },
          revenue: {
            type: 'object',
            properties: {
              grossOrderVolume: { type: 'number' },
            },
            description:
              "Volume brut des commandes de la période, à ne pas confondre avec un chiffre d'affaires confirmé (paiement réel non implémenté).",
          },
          evolution: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', format: 'date' },
                orders: { type: 'integer' },
                volume: { type: 'number' },
              },
            },
            description: 'Série temporelle zéro-remplie : quotidienne pour 7d/30d/90d, mensuelle pour 12m.',
          },
          recentOrders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                dateCreation: { type: 'string', format: 'date-time' },
                statut: { type: 'string', enum: ['COMMANDE', 'PREPARATION', 'EXPEDIEE', 'LIVREE', 'CLOTUREE', 'ANNULEE', 'REMBOURSEE'] },
                montantTotal: { type: 'number' },
                createdAt: { type: 'string', format: 'date-time' },
                acheteur: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    typeClient: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        nom: { type: 'string', nullable: true },
                        telephone: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            description: '10 dernières commandes, createdAt DESC, données minimales.',
          },
        },
        required: [
          'success',
          'period',
          'users',
          'kyc',
          'artworks',
          'orders',
          'revenue',
          'evolution',
          'recentOrders',
        ],
      },
      AdminArtisanListItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'ArtisanProfile.id' },
          userId: { type: 'string', format: 'uuid' },
          nom: { type: 'string', nullable: true },
          nomAtelier: { type: 'string' },
          avatar: { type: 'string', nullable: true },
          specialty: { type: 'string' },
          location: { type: 'string' },
          inscription: { type: 'string', format: 'date-time' },
          accountStatus: { type: 'string', enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'] },
          kycStatus: { type: 'string', enum: ['BROUILLON', 'SOUMIS', 'EN_ATTENTE', 'VALIDE', 'REJETE', 'CORRECTION_REQUISE', 'EXPIRE'], nullable: true },
          kycId: { type: 'string', format: 'uuid', nullable: true },
          artworksCount: { type: 'integer' },
          grossOrderVolume: { type: 'number', description: "Volume brut des commandes (tous statuts) : n'est pas un chiffre d'affaires encaissé." },
        },
      },
      AdminArtisanListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          items: { type: 'array', items: { $ref: '#/components/schemas/AdminArtisanListItem' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
        },
      },
      AdminArtisanDetailResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          artisan: {
            type: 'object',
            properties: {
              profil: {
                type: 'object',
                properties: {
                  userId: { type: 'string', format: 'uuid' },
                  nom: { type: 'string', nullable: true },
                  email: { type: 'string', nullable: true },
                  telephone: { type: 'string' },
                  accountStatus: { type: 'string', enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'] },
                  inscription: { type: 'string', format: 'date-time' },
                },
              },
              artisan: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  type: { type: 'string', enum: ['ARTISAN', 'ARTISTE'] },
                  nomAtelier: { type: 'string' },
                  specialite: { type: 'string' },
                  biographie: { type: 'string' },
                  localisation: { type: 'string' },
                  anneesExperience: { type: 'integer' },
                  estCertifie: { type: 'boolean' },
                  scoreFiabilite: { type: 'number', nullable: true },
                  photoAtelierUrl: { type: 'string', nullable: true },
                  validatedAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
              kyc: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  status: { type: 'string', enum: ['BROUILLON', 'SOUMIS', 'EN_ATTENTE', 'VALIDE', 'REJETE', 'CORRECTION_REQUISE', 'EXPIRE'] },
                  submittedAt: { type: 'string', format: 'date-time', nullable: true },
                  reviewedAt: { type: 'string', format: 'date-time', nullable: true },
                },
                description: "Synthèse du dernier dossier KYC, sans pièces jointes (documents accessibles uniquement via l'API KYC dédiée).",
              },
              statistiques: {
                type: 'object',
                properties: {
                  totalOeuvres: { type: 'integer' },
                  publiees: { type: 'integer' },
                  enPanier: { type: 'integer' },
                  vendues: { type: 'integer' },
                  nbCommandesArtisan: { type: 'integer' },
                  grossOrderVolume: { type: 'number', description: "Volume brut des commandes (tous statuts) : n'est pas un chiffre d'affaires encaissé." },
                },
              },
            },
          },
        },
      },
      AdminArtisanArtwork: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          titre: { type: 'string' },
          statut: { type: 'string', enum: ['BROUILLON', 'EN_ATTENTE_VALIDATION', 'PUBLIEE', 'EN_PANIER', 'VENDUE', 'RETIREE'] },
          prixXOF: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
          coverUrl: { type: 'string', nullable: true },
        },
      },
      AdminArtisanArtworksResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          items: { type: 'array', items: { $ref: '#/components/schemas/AdminArtisanArtwork' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
        },
      },
      AdminArtisanOrder: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          statut: { type: 'string', enum: ['COMMANDE', 'PREPARATION', 'EXPEDIEE', 'LIVREE', 'CLOTUREE', 'ANNULEE', 'REMBOURSEE'] },
          sousTotal: { type: 'number' },
          commission: { type: 'number' },
          fraisLivraison: { type: 'number' },
          montantTotal: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
          commande: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              statut: { type: 'string', enum: ['COMMANDE', 'PREPARATION', 'EXPEDIEE', 'LIVREE', 'CLOTUREE', 'ANNULEE', 'REMBOURSEE'] },
              dateCreation: { type: 'string', format: 'date-time' },
              createdAt: { type: 'string', format: 'date-time' },
              acheteur: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  typeClient: { type: 'string' },
                  nom: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
      AdminArtisanOrdersResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          items: { type: 'array', items: { $ref: '#/components/schemas/AdminArtisanOrder' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
        },
      },
    },
  },
};
