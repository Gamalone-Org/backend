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
  { name: 'Media', description: 'Media upload and retrieval' },
  { name: 'Certificates', description: 'Certificates and validation assets' },
  { name: 'KYC', description: 'Identity validation flows' },
  { name: 'Admin', description: 'Administrative actions' },
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
        description: 'Validates the phone, applies OTP cooldown and rate limits, and sends a single-use secure code without returning the code in the response body.',
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
        description: 'Validates the phone, checks resend cooldown and OTP rate limits, invalidates the previous active code, and sends a fresh single-use code without returning the code in the response body.',
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
          '502': { description: 'SMS provider rejected the request or sender configuration is invalid' },
          '503': { description: 'SMS provider unavailable or transient service issue' },
          '504': { description: 'SMS provider timeout' },
        },
      },
    },
    '/api/v1/auth/otp/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP and issue JWT',
        description: 'Checks the one-time code, invalidates it once used, and returns a JWT only when the phone verification succeeds.',
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
        description: 'Resubmit a new version of KYC data after a CORRECTION_REQUISE status while preserving submission history.',
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
          '403': { description: 'Phone verification is required or resubmission not allowed for current KYC status' },
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
        description: 'Get a KYC record owned by the authenticated user or accessed by an administrator.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
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
        description: 'Lists all documents for a KYC record with temporary signed URLs for consultation.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
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
        description: 'Uploads a KYC document to secure Cloudinary storage and persists metadata in PostgreSQL.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
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
        description: 'Deletes a KYC document from Cloudinary storage first, then removes its record from PostgreSQL.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'documentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
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
        description: 'Lists all KYC records requiring administrative review (defaults to SOUMIS and EN_ATTENTE).',
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
              enum: ['SOUMIS', 'EN_ATTENTE', 'VALIDE', 'REJETE', 'CORRECTION_REQUISE', 'BROUILLON', 'EXPIRE'],
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
        description: 'Retrieves complete KYC details for administrative review with secure temporary signed document URLs.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
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
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
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
        description: 'Approves a submitted KYC record, transitions status to VALIDE, logs review history, and certifies artisan profile if applicable.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
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
        description: 'Rejects a submitted KYC record with a required justification reason and logs review history.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
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
        description: 'Requests corrections for a submitted KYC record with instructions for the user to resubmit.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
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
          '403': { description: 'Forbidden: admin access required' },
          '404': { description: 'KYC record not found' },
          '409': { description: 'KYC already reviewed or concurrent conflict' },
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
          statut: { type: 'string', enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'] },
          telephoneVerificationStatus: {
            type: 'string',
            enum: ['NON_VERIFIE', 'EN_ATTENTE_VERIFICATION', 'VERIFIE', 'BLOQUE'],
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'telephone', 'role', 'statut', 'createdAt', 'updatedAt'],
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
      AuthUserPublic: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          telephone: { type: 'string', example: '+22890123456' },
          role: { type: 'string', enum: ['ACHETEUR', 'ARTISAN', 'ADMIN'] },
          statut: { type: 'string', enum: ['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION'] },
          telephoneVerificationStatus: {
            type: 'string',
            enum: ['NON_VERIFIE', 'EN_ATTENTE_VERIFICATION', 'VERIFIE', 'BLOQUE'],
          },
        },
        required: ['id', 'telephone', 'role', 'statut', 'telephoneVerificationStatus'],
      },
      Kyc: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          status: {
            type: 'string',
            enum: ['BROUILLON', 'SOUMIS', 'EN_ATTENTE', 'VALIDE', 'REJETE', 'CORRECTION_REQUISE', 'EXPIRE'],
          },
          submittedAt: { type: 'string', format: 'date-time', nullable: true },
          reviewedAt: { type: 'string', format: 'date-time', nullable: true },
          rejectionReason: { type: 'string', nullable: true },
          resubmissionOfId: { type: 'string', format: 'uuid', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'userId', 'status', 'createdAt', 'updatedAt'],
      },
      AdminKycReviewReasonRequest: {
        type: 'object',
        properties: {
          reason: { type: 'string', example: 'Document quality is insufficient, please provide a clear copy.' },
        },
        required: ['reason'],
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
    },
  },
};
