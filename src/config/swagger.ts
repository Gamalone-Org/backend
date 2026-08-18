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
    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a user',
        description: 'Future authentication endpoint planned for account creation.',
        responses: {
          '200': { description: 'Not implemented yet' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        description: 'Future authentication endpoint planned for login.',
        responses: {
          '200': { description: 'Not implemented yet' },
        },
      },
    },
    '/api/v1/auth/otp/send': {
      post: {
        tags: ['Auth'],
        summary: 'Send OTP',
        description: 'Future endpoint for sending an OTP to a phone number.',
        responses: {
          '200': { description: 'Not implemented yet' },
        },
      },
    },
    '/api/v1/auth/otp/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP',
        description: 'Future endpoint for OTP verification.',
        responses: {
          '200': { description: 'Not implemented yet' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        description: 'Future logout endpoint.',
        responses: {
          '200': { description: 'Not implemented yet' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user',
        description: 'Future authenticated profile endpoint.',
        responses: {
          '200': { description: 'Not implemented yet' },
        },
      },
    },
    '/api/v1/kyc/submit': {
      post: {
        tags: ['KYC'],
        summary: 'Submit KYC',
        description: 'Future KYC submission endpoint.',
        responses: {
          '200': { description: 'Not implemented yet' },
        },
      },
    },
    '/api/v1/kyc/me': {
      get: {
        tags: ['KYC'],
        summary: 'Get my KYC',
        description: 'Future user KYC retrieval endpoint.',
        responses: {
          '200': { description: 'Not implemented yet' },
        },
      },
    },
    '/api/v1/kyc/{id}': {
      get: {
        tags: ['KYC'],
        summary: 'Get KYC by id',
        description: 'Future KYC detail endpoint.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Not implemented yet' },
        },
      },
    },
    '/api/v1/kyc/{id}/resubmit': {
      post: {
        tags: ['KYC'],
        summary: 'Resubmit KYC',
        description: 'Future KYC resubmission endpoint.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Not implemented yet' },
        },
      },
    },
    '/api/v1/admin/kyc/pending': {
      get: {
        tags: ['Admin'],
        summary: 'List pending KYC',
        description: 'Future admin KYC review queue.',
        responses: {
          '200': { description: 'Not implemented yet' },
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
      OtpRequest: {
        type: 'object',
        properties: {
          phone: { type: 'string', example: '+22890123456' },
          purpose: { type: 'string', enum: ['SIGNUP', 'LOGIN', 'PHONE_VERIFICATION'] },
        },
        required: ['phone', 'purpose'],
      },
      OtpVerifyRequest: {
        type: 'object',
        properties: {
          phone: { type: 'string', example: '+22890123456' },
          code: { type: 'string', example: '123456' },
          purpose: { type: 'string', enum: ['SIGNUP', 'LOGIN', 'PHONE_VERIFICATION'] },
        },
        required: ['phone', 'code', 'purpose'],
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
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'userId', 'status', 'createdAt', 'updatedAt'],
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
