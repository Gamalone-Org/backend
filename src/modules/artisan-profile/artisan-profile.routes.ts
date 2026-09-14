import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware/auth.middleware.js';
import { ArtisanProfileController } from './artisan-profile.controller.js';
import { ArtisanProfileService } from './artisan-profile.service.js';
import { ArtisanProfileRepository } from './artisan-profile.repository.js';
import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import { ValidationError } from '../../common/errors/AppError.js';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const artisanMediaUpload = (req: Request, res: Response, next: NextFunction): void => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(new ValidationError('File exceeds the maximum allowed size of 10MB'));
          return;
        }
        next(new ValidationError(`File upload error: ${err.message}`));
        return;
      }
      next(err);
      return;
    }
    next();
  });
};

const repository = new ArtisanProfileRepository(prisma, () => new CloudinaryService());
const service = new ArtisanProfileService(repository);
const controller = new ArtisanProfileController(service);

export const artisanProfilRouter = Router();

artisanProfilRouter.use(requireAuth, requireRole('ARTISAN'));

// Profil principal
artisanProfilRouter.get('/', controller.getMyProfile);
artisanProfilRouter.patch('/', controller.updateMyProfile);

// Photo profil
artisanProfilRouter.post('/photo', artisanMediaUpload, controller.uploadPhotoProfil);
artisanProfilRouter.delete('/photo', controller.deletePhotoProfil);

// Bannière
artisanProfilRouter.post('/banniere', artisanMediaUpload, controller.uploadBanniere);
artisanProfilRouter.delete('/banniere', controller.deleteBanniere);

// Photos atelier
artisanProfilRouter.get('/atelier/photos', controller.getAtelierPhotos);
artisanProfilRouter.post('/atelier/photos', artisanMediaUpload, controller.uploadAtelierPhoto);
artisanProfilRouter.delete('/atelier/photos/:photoId', controller.deleteAtelierPhoto);
artisanProfilRouter.patch('/atelier/photos/reorder', controller.reorderAtelierPhotos);

// Processus de création
artisanProfilRouter.get('/processus', controller.getProcessus);
artisanProfilRouter.post('/processus', controller.createProcessusEtape);
artisanProfilRouter.patch('/processus/reorder', controller.reorderProcessus);
artisanProfilRouter.post('/processus/:etapeId/photo', artisanMediaUpload, controller.uploadProcessusPhoto);
artisanProfilRouter.patch('/processus/:etapeId', controller.updateProcessusEtape);
artisanProfilRouter.delete('/processus/:etapeId', controller.deleteProcessusEtape);

// Expositions
artisanProfilRouter.get('/expositions', controller.getExpositions);
artisanProfilRouter.post('/expositions', controller.createExposition);
artisanProfilRouter.patch('/expositions/:expositionId', controller.updateExposition);
artisanProfilRouter.delete('/expositions/:expositionId', controller.deleteExposition);

// Versements (privé)
artisanProfilRouter.patch('/versement', controller.updateVersement);

export default artisanProfilRouter;
