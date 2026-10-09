import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import multer from 'multer';
import {
  requireAuth,
  requireRole,
  requireAdminLevel,
} from '../auth/middleware/auth.middleware.js';
import { CategorieArticleController } from './categorie-article.controller.js';
import { CategorieArticleService } from './categorie-article.service.js';
import { CategorieArticleRepository } from './categorie-article.repository.js';
import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import { ValidationError } from '../../common/errors/AppError.js';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const categorieArticleImageUpload = (req: Request, res: Response, next: NextFunction): void => {
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

const repository = new CategorieArticleRepository(prisma, () => new CloudinaryService());
const service = new CategorieArticleService(repository);
const controller = new CategorieArticleController(service);

/**
 * Catégories d'articles : back-office Admin uniquement.
 *
 * Aucun routeur public et aucune sous-catégorie d'article à ce stade.
 * Les niveaux d'accès sont alignés sur le module catégories d'œuvres :
 * SUPPORT en lecture, MODERATEUR (et SUPER_ADMIN) en écriture.
 */
export const adminArticleCategorieRouter = Router();

adminArticleCategorieRouter.use(requireAuth, requireRole('ADMIN'));

adminArticleCategorieRouter.get('/', requireAdminLevel('SUPPORT'), controller.list);
adminArticleCategorieRouter.get('/:id', requireAdminLevel('SUPPORT'), controller.getOne);
adminArticleCategorieRouter.post('/', requireAdminLevel('MODERATEUR'), controller.create);
adminArticleCategorieRouter.patch('/:id', requireAdminLevel('MODERATEUR'), controller.update);
adminArticleCategorieRouter.delete('/:id', requireAdminLevel('MODERATEUR'), controller.remove);
adminArticleCategorieRouter.post(
  '/:id/image',
  requireAdminLevel('MODERATEUR'),
  categorieArticleImageUpload,
  controller.uploadImage
);
adminArticleCategorieRouter.delete(
  '/:id/image',
  requireAdminLevel('MODERATEUR'),
  controller.deleteImage
);

/**
 * Consultation publique des catégories d'articles : aucune authentification.
 * Seules les catégories ACTIVE sont exposées.
 */
export const publicArticleCategorieRouter = Router();

publicArticleCategorieRouter.get('/', controller.listPublic);

export default adminArticleCategorieRouter;
