import { OrderStatus, type PaymentMethod } from '../../generated/prisma/client.js';
import { OrderRepository } from './order.repository.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../common/errors/AppError.js';
import type { CreateCommandeInput } from './order.schema.js';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  COMMANDE: ['PREPARATION'],
  PREPARATION: ['EXPEDIEE'],
  EXPEDIEE: ['LIVREE'],
  LIVREE: ['CLOTUREE'],
  CLOTUREE: [],
  ANNULEE: [],
  REMBOURSEE: [],
};

const ANNULEE_ORIGINES: OrderStatus[] = [
  'COMMANDE',
  'PREPARATION',
  'EXPEDIEE',
];

export class OrderService {
  constructor(private readonly repository: OrderRepository) {}

  async createCommande(userId: string, input: CreateCommandeInput) {
    const buyerProfile = await this.repository.findBuyerProfileByUserId(userId);
    if (!buyerProfile) {
      throw new ForbiddenError('Profil acheteur introuvable. Impossible de passer commande.');
    }

    const lignes: Array<{
      oeuvreId: string;
      artisanId: string;
      prixUnitaire: number;
      quantite: number;
    }> = [];

    let sousTotal = 0;
    let commission = 0;

    for (const article of input.articles) {
      const oeuvre = await this.repository.findOeuvreById(article.oeuvreId);
      if (!oeuvre) {
        throw new NotFoundError('Œuvre introuvable');
      }
      if (oeuvre.statut !== 'PUBLIEE') {
        throw new ConflictError(`L'œuvre « ${oeuvre.titre} » n'est pas disponible à la commande`);
      }

      const prixUnitaire = Number(oeuvre.prixXOF);
      const ligneTotal = prixUnitaire * article.quantite;
      const tauxCommission = Number(oeuvre.artisan.commission ?? 0);

      sousTotal += ligneTotal;
      commission += Math.round((ligneTotal * tauxCommission) / 100);

      lignes.push({
        oeuvreId: oeuvre.id,
        artisanId: oeuvre.artisanId,
        prixUnitaire,
        quantite: article.quantite,
      });
    }

    const montantTotal = sousTotal + input.fraisLivraison;

    const commande = await this.repository.createCommande({
      acheteurId: buyerProfile.id,
      lignes,
      sousTotal,
      fraisLivraison: input.fraisLivraison,
      montantTotal,
      commission,
      methodePaiement: input.methodePaiement as PaymentMethod,
      adresseDest: input.adresseLivraison,
      transporteur: input.transporteur,
    });

    const detail = await this.repository.findByIdMine(commande.id, buyerProfile.id);

    return {
      commande: detail,
      recapitulatif: {
        sousTotal,
        fraisLivraison: input.fraisLivraison,
        total: montantTotal,
        commission,
      },
    };
  }

  async getMyCommandes(userId: string, page: number, limit: number) {
    const buyerProfile = await this.repository.findBuyerProfileByUserId(userId);
    if (!buyerProfile) {
      throw new ForbiddenError('Profil acheteur introuvable');
    }
    const { commandes, total } = await this.repository.findForAcheteur(
      buyerProfile.id,
      page,
      limit
    );
    return { commandes, total, page, limit };
  }

  async getMyCommande(userId: string, commandeId: string) {
    const buyerProfile = await this.repository.findBuyerProfileByUserId(userId);
    if (!buyerProfile) {
      throw new ForbiddenError('Profil acheteur introuvable');
    }
    const commande = await this.repository.findByIdMine(commandeId, buyerProfile.id);
    if (!commande) {
      throw new NotFoundError('Commande introuvable');
    }
    return commande;
  }

  async getAllAdmin(page: number, limit: number, filters: { statut?: OrderStatus; q?: string }) {
    const { commandes, total } = await this.repository.findForAdmin(page, limit, filters);
    return { commandes, total, page, limit };
  }

  async getCommandeAdmin(commandeId: string) {
    const commande = await this.repository.findByIdDetailed(commandeId);
    if (!commande) {
      throw new NotFoundError('Commande introuvable');
    }
    return commande;
  }

  async updateStatut(commandeId: string, target: OrderStatus) {
    const commande = await this.repository.findByIdSummary(commandeId);
    if (!commande) {
      throw new NotFoundError('Commande introuvable');
    }

    const allowed = ALLOWED_TRANSITIONS[commande.statut];
    if (!allowed.includes(target)) {
      throw new ConflictError(
        `Transition de statut invalide : ${commande.statut} → ${target}`
      );
    }

    return this.repository.updateStatut(commandeId, target);
  }

  async annuler(commandeId: string) {
    const commande = await this.repository.findByIdSummary(commandeId);
    if (!commande) {
      throw new NotFoundError('Commande introuvable');
    }

    if (commande.statut === 'ANNULEE' || commande.statut === 'REMBOURSEE') {
      throw new ConflictError('Cette commande est déjà annulée');
    }

    if (!ANNULEE_ORIGINES.includes(commande.statut)) {
      throw new ConflictError(
        `Une commande au statut ${commande.statut} ne peut pas être annulée`
      );
    }

    return this.repository.updateStatut(commandeId, 'ANNULEE');
  }

  async exportCsv(filters: { statut?: OrderStatus; q?: string }) {
    const { commandes } = await this.repository.findForAdmin(1, 5000, filters);

    const header = [
      'numero',
      'date',
      'statut',
      'client',
      'telephone',
      'artisan',
      'montant',
      'paiement',
      'livraison',
    ];

    const rows = commandes.map((c) => {
      const artisans = new Set<string>();
      for (const ligne of c.lignesCommande) {
        artisans.add(ligne.artisan?.nomAtelier ?? ligne.artisan?.user?.nom ?? '');
      }
      const client = c.acheteur?.user?.nom ?? '';
      return [
        c.id,
        new Date(c.dateCreation).toISOString(),
        c.statut,
        client,
        c.acheteur?.user?.telephone ?? '',
        Array.from(artisans).join(' | '),
        c.montantTotal,
        c.paiement?.statut ?? '',
        c.livraison?.statut ?? '',
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  }
}
