import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { UnauthorizedError } from '../../src/common/errors/AppError.js';

const mockSubmit = vi.fn();
const mockGetMyKyc = vi.fn();
const mockGetById = vi.fn();
const mockUploadDocument = vi.fn();
const mockGetDocuments = vi.fn();
const mockDeleteDocument = vi.fn();

vi.mock('../../src/modules/kyc/kyc.service.js', () => ({
  KycService: class {
    submit = mockSubmit;
    getMyKyc = mockGetMyKyc;
    getById = mockGetById;
    uploadDocument = mockUploadDocument;
    getDocuments = mockGetDocuments;
    deleteDocument = mockDeleteDocument;
  },
}));

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing or invalid bearer token'));
      return;
    }

    req.user = {
      id: req.headers['x-test-user-id'] ?? 'user-1',
      role: req.headers['x-test-role'] ?? 'ACHETEUR',
      telephone: '+22890123456',
      statut: 'ACTIF',
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

const app = (await import('../../src/app.js')).default;

describe('KYC routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmit.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
    mockGetMyKyc.mockResolvedValue({ id: 'kyc-1', userId: 'user-1', status: 'SOUMIS' });
    mockGetById.mockResolvedValue({ id: 'kyc-1', userId: 'user-1', status: 'SOUMIS' });
    mockUploadDocument.mockResolvedValue({
      id: 'doc-1',
      kycId: '11111111-1111-4111-8111-111111111111',
      documentType: 'CNI_RECTO',
      resourceType: 'raw',
      format: 'pdf',
      bytes: 1024,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockGetDocuments.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        kycId: '11111111-1111-4111-8111-111111111111',
        documentType: 'CNI_RECTO',
        downloadUrl: 'https://res.cloudinary.com/signed-url',
      },
    ]);
    mockDeleteDocument.mockResolvedValue({ success: true, message: 'KYC document deleted successfully' });
  });

  it('returns 401 for unauthenticated submission', async () => {
    const response = await request(app).post('/api/v1/kyc/submit').send({});

    expect(response.status).toBe(401);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('submits a valid KYC', async () => {
    const response = await request(app)
      .post('/api/v1/kyc/submit')
      .set('Authorization', 'Bearer test-token')
      .send({
        identityData: { firstName: 'Awa' },
        addressData: { city: 'Lome' },
        identityDocument: { type: 'CNI' },
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ success: true, kyc: { id: 'kyc-1', status: 'SOUMIS' } });
    expect(mockSubmit).toHaveBeenCalledWith('user-1', {
      identityData: { firstName: 'Awa' },
      addressData: { city: 'Lome' },
      identityDocument: { type: 'CNI' },
    });
  });

  it('returns 400 for invalid or unknown submission fields', async () => {
    const response = await request(app)
      .post('/api/v1/kyc/submit')
      .set('Authorization', 'Bearer test-token')
      .send({ identityData: {}, addressData: {}, identityDocument: {}, userId: 'user-2' });

    expect(response.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('gets the current user KYC', async () => {
    const response = await request(app)
      .get('/api/v1/kyc/me')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(mockGetMyKyc).toHaveBeenCalledWith('user-1');
  });

  it('passes the authenticated actor to KYC detail lookup', async () => {
    const response = await request(app)
      .get('/api/v1/kyc/11111111-1111-4111-8111-111111111111')
      .set('Authorization', 'Bearer test-token')
      .set('x-test-user-id', 'user-2')
      .set('x-test-role', 'ADMIN');

    expect(response.status).toBe(200);
    expect(mockGetById).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', {
      id: 'user-2',
      role: 'ADMIN',
    });
  });

  it('returns 401 for unauthenticated document upload', async () => {
    const response = await request(app)
      .post('/api/v1/kyc/11111111-1111-4111-8111-111111111111/documents')
      .field('documentType', 'CNI_RECTO')
      .attach('file', Buffer.from('%PDF-1.5 fake'), 'cni.pdf');

    expect(response.status).toBe(401);
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  it('returns 400 for missing documentType during document upload', async () => {
    const response = await request(app)
      .post('/api/v1/kyc/11111111-1111-4111-8111-111111111111/documents')
      .set('Authorization', 'Bearer test-token')
      .attach('file', Buffer.from('%PDF-1.5 fake'), 'cni.pdf');

    expect(response.status).toBe(400);
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  it('uploads a KYC document successfully via multipart/form-data', async () => {
    const response = await request(app)
      .post('/api/v1/kyc/11111111-1111-4111-8111-111111111111/documents')
      .set('Authorization', 'Bearer test-token')
      .field('documentType', 'CNI_RECTO')
      .attach('file', Buffer.from('%PDF-1.5 fake'), 'cni.pdf');

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('document');
    expect(mockUploadDocument).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'user-1',
      'CNI_RECTO',
      expect.objectContaining({
        originalname: 'cni.pdf',
      })
    );
  });

  it('gets all documents for a KYC record with signed URLs', async () => {
    const response = await request(app)
      .get('/api/v1/kyc/11111111-1111-4111-8111-111111111111/documents')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.documents).toHaveLength(1);
    expect(mockGetDocuments).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', {
      id: 'user-1',
      role: 'ACHETEUR',
    });
  });

  it('deletes a document for a KYC record', async () => {
    const response = await request(app)
      .delete('/api/v1/kyc/11111111-1111-4111-8111-111111111111/documents/22222222-2222-4222-8222-222222222222')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'KYC document deleted successfully' });
    expect(mockDeleteDocument).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      { id: 'user-1', role: 'ACHETEUR' }
    );
  });
});


