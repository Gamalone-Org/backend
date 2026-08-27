import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import { KycController } from './kyc.controller.js';
import { KycPrivacyRepository } from './kyc-privacy.repository.js';
import { KycPrivacyService } from './kyc-privacy.service.js';
import { createPurgeScheduler, KycPurgeService } from './kyc-purge.service.js';
import { KycRepository } from './kyc.repository.js';
import { KycService } from './kyc.service.js';

export function createKycModule() {
  const repository = new KycRepository(prisma);
  const privacyRepository = new KycPrivacyRepository(prisma);
  const cloudinaryService = new CloudinaryService();
  const privacyService = new KycPrivacyService(privacyRepository, cloudinaryService);
  const purgeService = new KycPurgeService(privacyRepository, privacyService);
  const purgeScheduler = createPurgeScheduler(purgeService);
  const service = new KycService(repository, cloudinaryService, privacyService, purgeService);
  const controller = new KycController(service);

  return {
    repository,
    privacyRepository,
    cloudinaryService,
    privacyService,
    purgeService,
    purgeScheduler,
    service,
    controller,
  };
}
