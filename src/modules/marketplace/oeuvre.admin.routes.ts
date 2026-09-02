import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { requireAuth, requireRole, requireAdminLevel } from '../auth/middleware/auth.middleware.js';
import { OeuvreController } from './oeuvre.controller.js';
import { OeuvreService } from './oeuvre.service.js';
import { MediaService } from './media.service.js';
import { OeuvreRepository } from './oeuvre.repository.js';
import { MediaRepository } from './media.repository.js';
import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import { ValidationError } from '../../common/errors/AppError.js';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const adminMediaUpload = (req: Request, res: Response, next: NextFunction): void => {
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

const oeuvreRepository = new OeuvreRepository(prisma);
const mediaRepository = new MediaRepository(prisma, () => new CloudinaryService());
const oeuvreService = new OeuvreService(oeuvreRepository);
const mediaService = new MediaService(mediaRepository, oeuvreRepository);
const controller = new OeuvreController(oeuvreService, mediaService);

export const adminOeuvreRouter = Router();

adminOeuvreRouter.use(requireAuth, requireRole('ADMIN'));

adminOeuvreRouter.get('/', requireAdminLevel('SUPPORT'), controller.listAllAdmin);
adminOeuvreRouter.get('/:id', requireAdminLevel('SUPPORT'), controller.getOeuvreAdmin);
adminOeuvreRouter.post('/', requireAdminLevel('MODERATEUR'), controller.create);
adminOeuvreRouter.patch('/:id', requireAdminLevel('MODERATEUR'), controller.update);
adminOeuvreRouter.delete('/:id', requireAdminLevel('MODERATEUR'), controller.remove);
adminOeuvreRouter.post('/:id/publish', requireAdminLevel('MODERATEUR'), controller.publish);
adminOeuvreRouter.post('/:id/withdraw', requireAdminLevel('MODERATEUR'), controller.withdrawAdmin);
adminOeuvreRouter.post('/:id/medias', requireAdminLevel('MODERATEUR'), adminMediaUpload, controller.uploadMedia);
adminOeuvreRouter.delete('/:id/medias/:mediaId', requireAdminLevel('MODERATEUR'), controller.deleteMedia);
adminOeuvreRouter.patch('/:id/medias/reorder', requireAdminLevel('MODERATEUR'), controller.reorderMedias);
adminOeuvreRouter.post(
  '/artisans/:artisanId/photo-atelier',
  requireAdminLevel('MODERATEUR'),
  adminMediaUpload,
  controller.uploadPhotoAtelier
);
adminOeuvreRouter.delete(
  '/artisans/:artisanId/photo-atelier',
  requireAdminLevel('MODERATEUR'),
  controller.deletePhotoAtelier
);

export default adminOeuvreRouter;
