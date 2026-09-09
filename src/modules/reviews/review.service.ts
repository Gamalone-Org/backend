import { NotFoundError } from '../../common/errors/AppError.js';
import { ReviewRepository, type ReviewFilters } from './review.repository.js';

export const CSV_EXPORT_LIMIT = 5000;

/**
 * Orchestration de l'administration des avis (Phase 1 : lecture seule).
 *
 * Le modèle Avis ne contient aucun mécanisme de modération (pas de statut,
 * de publication/masquage ou de suppression) et aucune règle de bascule
 * d'`estVerifie` n'est documentée dans le projet : cette phase offre donc
 * uniquement la consultation (liste, recherche, filtres, détail, export).
 */
export class ReviewService {
  constructor(private readonly repository: ReviewRepository) {}

  async listAllAdmin(page: number, limit: number, filters: ReviewFilters) {
    const { reviews, total } = await this.repository.findAllForAdmin(page, limit, filters);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return { items: reviews, total, page, limit, totalPages };
  }

  async getReviewAdmin(id: string) {
    const avis = await this.repository.findByIdForAdmin(id);
    if (!avis) {
      throw new NotFoundError('Avis introuvable');
    }
    return avis;
  }

  async exportCsv(filters: ReviewFilters) {
    const reviews = await this.repository.findForExport(filters, CSV_EXPORT_LIMIT);

    const header = [
      'id',
      'note',
      'commentaire',
      'estVerifie',
      'dateAvis',
      'idCommande',
      'dateCommande',
      'auteurNom',
      'auteurTelephone',
      'statutCommande',
    ];

    const rows = reviews.map((r) => [
      r.id,
      r.note,
      r.commentaire,
      r.estVerifie,
      new Date(r.dateAvis).toISOString(),
      r.commande?.id ?? '',
      r.commande ? new Date(r.commande.dateCreation).toISOString() : '',
      r.commande?.acheteur?.user?.nom ?? '',
      r.commande?.acheteur?.user?.telephone ?? '',
      r.commande?.statut ?? '',
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  }
}