import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import multer from 'multer';
import {
  requireAuth,
  requireRole,
  requireAdminLevel,
} from '../auth/middleware/auth.middleware.js';
import { ArticleController } from './article.controller.js';
import { ArticleService } from './article.service.js';
import { ArticleRepository } from './article.repository.js';
import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import { ValidationError } from '../../common/errors/AppError.js';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const articleCoverUpload = (req: Request, res: Response, next: NextFunction): void => {
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

const repository = new ArticleRepository(prisma, () => new CloudinaryService());
const service = new ArticleService(repository);
const controller = new ArticleController(service);

export const adminArticleRouter = Router();

adminArticleRouter.use(requireAuth, requireRole('ADMIN'));

// SUPPORT : lecture seule
adminArticleRouter.get('/', requireAdminLevel('SUPPORT'), controller.list);
adminArticleRouter.get('/:id', requireAdminLevel('SUPPORT'), controller.getOne);

// MODERATEUR : écriture + workflow + médias
adminArticleRouter.post('/', requireAdminLevel('MODERATEUR'), controller.create);
adminArticleRouter.patch('/:id', requireAdminLevel('MODERATEUR'), controller.update);
adminArticleRouter.delete('/:id', requireAdminLevel('MODERATEUR'), controller.remove);
adminArticleRouter.post('/:id/publish', requireAdminLevel('MODERATEUR'), controller.publish);
adminArticleRouter.post('/:id/schedule', requireAdminLevel('MODERATEUR'), controller.schedule);
adminArticleRouter.post('/:id/unpublish', requireAdminLevel('MODERATEUR'), controller.unpublish);
adminArticleRouter.post(
  '/:id/cover',
  requireAdminLevel('MODERATEUR'),
  articleCoverUpload,
  controller.uploadCover
);
adminArticleRouter.delete('/:id/cover', requireAdminLevel('MODERATEUR'), controller.deleteCover);

export default adminArticleRouter;
