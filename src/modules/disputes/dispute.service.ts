import { NotFoundError } from '../../common/errors/AppError.js';
import { DisputeRepository, type DisputeFilters } from './dispute.repository.js';

export const CSV_EXPORT_LIMIT = 5000;

/**
 * Orchestration de l'administration des litiges (Phase 1 : lecture seule).
 *
 * Le modèle Litige ne possède aucun mécanisme de résolution (pas de
 * transition de workflow, de messagerie, d'historique, de pièces jointes ou
 * de remboursement — aucune règle métier de ce type n'est documentée dans le
 * projet) : cette phase offre donc uniquement la consultation (liste,
 * recherche, filtres, détail, export).
 */
export class DisputeService {
  constructor(private readonly repository: DisputeRepository) {}

  async listAllAdmin(page: number, limit: number, filters: DisputeFilters) {
    const { disputes, total } = await this.repository.findAllForAdmin(page, limit, filters);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return { items: disputes, total, page, limit, totalPages };
  }

  async getDisputeAdmin(id: string) {
    const litige = await this.repository.findByIdForAdmin(id);
    if (!litige) {
      throw new NotFoundError('Litige introuvable');
    }
    return litige;
  }

  async exportCsv(filters: DisputeFilters) {
    const disputes = await this.repository.findForExport(filters, CSV_EXPORT_LIMIT);

    const header = [
      'id',
      'motif',
      'statut',
      'createdAt',
      'updatedAt',
      'idCommande',
      'dateCommande',
      'statutCommande',
      'montantCommande',
      'clientNom',
      'clientTelephone',
      'artisanNomAtelier',
      'artisanNom',
      'artisanTelephone',
    ];

    const rows = disputes.map((d) => [
      d.id,
      d.motif,
      d.statut,
      new Date(d.createdAt).toISOString(),
      new Date(d.updatedAt).toISOString(),
      d.commande?.id ?? '',
      d.commande ? new Date(d.commande.dateCreation).toISOString() : '',
      d.commande?.statut ?? '',
      d.commande?.montantTotal ?? '',
      d.commande?.acheteur?.user?.nom ?? '',
      d.commande?.acheteur?.user?.telephone ?? '',
      d.artisan?.nomAtelier ?? '',
      d.artisan?.user?.nom ?? '',
      d.artisan?.user?.telephone ?? '',
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  }
}