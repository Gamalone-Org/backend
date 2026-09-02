import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import multer from 'multer';
import {
  requireAuth,
  requireRole,
  requireAdminLevel,
} from '../auth/middleware/auth.middleware.js';
import { CategorieController } from './categorie.controller.js';
import { CategorieService } from './categorie.service.js';
import { CategorieRepository } from './categorie.repository.js';
import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import { ValidationError } from '../../common/errors/AppError.js';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const categorieImageUpload = (req: Request, res: Response, next: NextFunction): void => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(new ValidationError('Le fichier dépasse la taille maximale autorisée de 10MB'));
          return;
        }
        next(new ValidationError(`Erreur d\u2019upload : ${err.message}`));
        return;
      }
      next(err);
      return;
    }
    next();
  });
};

const repository = new CategorieRepository(prisma, () => new CloudinaryService());
const service = new CategorieService(repository);
const controller = new CategorieController(service);

export const publicCategorieRouter = Router();

publicCategorieRouter.get('/', controller.list);
publicCategorieRouter.get('/:id', controller.getOne);
publicCategorieRouter.get('/:categorieId/sous-categories', controller.listSousCategories);

export const adminCategorieRouter = Router();

adminCategorieRouter.use(requireAuth, requireRole('ADMIN'));

adminCategorieRouter.get('/', requireAdminLevel('SUPPORT'), controller.list);
adminCategorieRouter.get('/:id', requireAdminLevel('SUPPORT'), controller.getOne);
adminCategorieRouter.post('/', requireAdminLevel('MODERATEUR'), controller.create);
adminCategorieRouter.patch('/:id', requireAdminLevel('MODERATEUR'), controller.update);
adminCategorieRouter.delete('/:id', requireAdminLevel('MODERATEUR'), controller.remove);
adminCategorieRouter.post(
  '/:id/image',
  requireAdminLevel('MODERATEUR'),
  categorieImageUpload,
  controller.uploadImage
);
adminCategorieRouter.delete('/:id/image', requireAdminLevel('MODERATEUR'), controller.deleteImage);
adminCategorieRouter.post(
  '/:categorieId/sous-categories',
  requireAdminLevel('MODERATEUR'),
  controller.createSousCategorie
);
adminCategorieRouter.patch(
  '/:categorieId/sous-categories/:sousCategorieId',
  requireAdminLevel('MODERATEUR'),
  controller.updateSousCategorie
);
adminCategorieRouter.delete(
  '/:categorieId/sous-categories/:sousCategorieId',
  requireAdminLevel('MODERATEUR'),
  controller.removeSousCategorie
);
adminCategorieRouter.post(
  '/:categorieId/sous-categories/:sousCategorieId/image',
  requireAdminLevel('MODERATEUR'),
  categorieImageUpload,
  controller.uploadSousCategorieImage
);
adminCategorieRouter.delete(
  '/:categorieId/sous-categories/:sousCategorieId/image',
  requireAdminLevel('MODERATEUR'),
  controller.deleteSousCategorieImage
);

export default publicCategorieRouter;
