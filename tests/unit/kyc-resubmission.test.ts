import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/common/errors/AppError.js';
import { KycService } from '../../src/modules/kyc/kyc.service.js';

const input = {
  identityData: { firstName: 'Awa' },
  addressData: { city: 'Lome' },
  identityDocument: { type: 'CNI', reference: 'doc-1' },
};

function createRepository() {
  return {
    findUserPhoneVerification: vi.fn(),
    findActiveByUserId: vi.fn(),
    findLatestByUserId: vi.fn(),
    findById: vi.fn(),
    createSubmission: vi.fn(),
    createResubmission: vi.fn(),
    createDocument: vi.fn(),
    findDocumentsByKycId: vi.fn(),
    findDocumentById: vi.fn(),
    deleteDocument: vi.fn(),
  };
}

describe('KycService.resubmit()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Utilisateur non authentifié
  it('1. rejects when userId is empty', async () => {
    const repository = createRepository();
    const service = new KycService(repository as any);

    await expect(service.resubmit('', input)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });

  // 2. Utilisateur inexistant
  it('2. rejects when user is not found in database', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue(null);
    const service = new KycService(repository as any);

    await expect(service.resubmit('user-1', input)).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });

  // 3. Téléphone non vérifié
  it('3. rejects when phone is not verified', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'NON_VERIFIE',
    });
    const service = new KycService(repository as any);

    await expect(service.resubmit('user-1', input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });

  // 4. Aucun KYC existant
  it('4. rejects when no KYC record exists for user', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue(null);
    const service = new KycService(repository as any);

    await expect(service.resubmit('user-1', input)).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });

  // 5a. KYC CORRECTION_REQUISE — chemin nominal
  it('5a. creates a resubmission when KYC status is CORRECTION_REQUISE', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue({
      id: 'kyc-old',
      userId: 'user-1',
      status: 'CORRECTION_REQUISE',
    });
    const newKyc = { id: 'kyc-new', userId: 'user-1', status: 'SOUMIS', resubmissionOfId: 'kyc-old' };
    repository.createResubmission.mockResolvedValue(newKyc);

    const service = new KycService(repository as any);
    const result = await service.resubmit('user-1', input);

    expect(result).toEqual(newKyc);
    expect(repository.createResubmission).toHaveBeenCalledOnce();
    expect(repository.createResubmission).toHaveBeenCalledWith('user-1', 'kyc-old', input);
  });

  // 5b. validateStatusTransition appelé avec CORRECTION_REQUISE -> SOUMIS
  it('5b. validateStatusTransition is called with CORRECTION_REQUISE -> SOUMIS', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue({
      id: 'kyc-old',
      userId: 'user-1',
      status: 'CORRECTION_REQUISE',
    });
    repository.createResubmission.mockResolvedValue({ id: 'kyc-new', status: 'SOUMIS' });

    const service = new KycService(repository as any);
    const spy = vi.spyOn(service, 'validateStatusTransition');

    await service.resubmit('user-1', input);

    expect(spy).toHaveBeenCalledWith('CORRECTION_REQUISE', 'SOUMIS');
  });

  // 6. KYC BROUILLON
  // BROUILLON -> SOUMIS est dans allowedTransitions donc validateStatusTransition ne leve pas d erreur
  // C est le ForbiddenError du guard status !== 'CORRECTION_REQUISE' qui est leve
  it('6. rejects with ForbiddenError when KYC status is BROUILLON', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'BROUILLON',
    });
    const service = new KycService(repository as any);

    await expect(service.resubmit('user-1', input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });

  // 7. KYC SOUMIS — SOUMIS -> SOUMIS invalide => ValidationError
  it('7. rejects when KYC status is SOUMIS and does not create a resubmission', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'SOUMIS',
    });
    const service = new KycService(repository as any);

    await expect(service.resubmit('user-1', input)).rejects.toBeInstanceOf(ValidationError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });

  // 8. KYC EN_ATTENTE — EN_ATTENTE -> SOUMIS invalide => ValidationError
  it('8. rejects when KYC status is EN_ATTENTE and does not create a resubmission', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'EN_ATTENTE',
    });
    const service = new KycService(repository as any);

    await expect(service.resubmit('user-1', input)).rejects.toBeInstanceOf(ValidationError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });

  // 9. KYC VALIDE — etat terminal => ValidationError
  it('9. rejects when KYC status is VALIDE and does not create a resubmission', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'VALIDE',
    });
    const service = new KycService(repository as any);

    await expect(service.resubmit('user-1', input)).rejects.toBeInstanceOf(ValidationError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });

  // 10. KYC REJETE — etat terminal => ValidationError
  it('10. rejects when KYC status is REJETE and does not create a resubmission', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'REJETE',
    });
    const service = new KycService(repository as any);

    await expect(service.resubmit('user-1', input)).rejects.toBeInstanceOf(ValidationError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });

  // 11. KYC EXPIRE — etat terminal => ValidationError
  it('11. rejects when KYC status is EXPIRE and does not create a resubmission', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'EXPIRE',
    });
    const service = new KycService(repository as any);

    await expect(service.resubmit('user-1', input)).rejects.toBeInstanceOf(ValidationError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });

  // 12. Arguments exacts de createResubmission
  it('12. passes exact userId, previousKycId, and input to createResubmission', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue({
      id: 'kyc-previous-123',
      userId: 'user-abc',
      status: 'CORRECTION_REQUISE',
    });
    repository.createResubmission.mockResolvedValue({ id: 'kyc-new', status: 'SOUMIS' });

    const specificInput = {
      identityData: { firstName: 'Koffi', lastName: 'Mensah' },
      addressData: { city: 'Accra', country: 'GH' },
      identityDocument: { type: 'PASSEPORT', reference: 'GH-9999' },
      professionData: { profession: 'Artisan' },
    };

    const service = new KycService(repository as any);
    await service.resubmit('user-abc', specificInput);

    expect(repository.createResubmission).toHaveBeenCalledWith(
      'user-abc',
      'kyc-previous-123',
      specificInput,
    );
  });

  // 13. Absence d effets secondaires pour tous les statuts interdits
  it.each([
    ['BROUILLON'],
    ['SOUMIS'],
    ['EN_ATTENTE'],
    ['VALIDE'],
    ['REJETE'],
    ['EXPIRE'],
  ])('13. createResubmission is never called when KYC status is %s', async (status) => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({
      telephoneVerificationStatus: 'VERIFIE',
    });
    repository.findLatestByUserId.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status,
    });
    const service = new KycService(repository as any);

    await expect(service.resubmit('user-1', input)).rejects.toBeInstanceOf(AppError);
    expect(repository.createResubmission).not.toHaveBeenCalled();
  });
});
