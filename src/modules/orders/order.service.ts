import { OrderStatus, type PaymentMethod } from '../../generated/prisma/client.js';
import { OrderRepository, type CommandeArtisanData } from './order.repository.js';
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

    // --- Étape 1 : Valider chaque œuvre et collecter les données par artisan ---
    // Les prix et commissions sont toujours récupérés côté serveur.
    // Le statut PUBLIEE est vérifié ici ET dans la transaction (double sécurité).
    // La vérification atomique dans la transaction protège contre la concurrence.

    type LigneData = {
      oeuvreId: string;
      artisanId: string;
      prixUnitaire: number;
      quantite: number;
      tauxCommission: number;
    };

    const lignesDetails: LigneData[] = [];
    const artisteMap = new Map<string, LigneData[]>();

    for (const article of input.articles) {
      const oeuvre = await this.repository.findOeuvreById(article.oeuvreId);
      if (!oeuvre) {
        throw new NotFoundError('Œuvre introuvable');
      }
      if (oeuvre.statut !== 'PUBLIEE') {
        throw new ConflictError(`L'œuvre « ${oeuvre.titre} » n'est pas disponible à la commande`);
      }

      const prixUnitaire = Number(oeuvre.prixXOF);
      const tauxCommission = Number(oeuvre.artisan.commission ?? 0);

      const ligneDetail: LigneData = {
        oeuvreId: oeuvre.id,
        artisanId: oeuvre.artisanId,
        prixUnitaire,
        quantite: article.quantite,
        tauxCommission,
      };

      lignesDetails.push(ligneDetail);

      const existing = artisteMap.get(oeuvre.artisanId);
      if (existing) {
        existing.push(ligneDetail);
      } else {
        artisteMap.set(oeuvre.artisanId, [ligneDetail]);
      }
    }

    // --- Étape 2 : Calculer les totaux globaux et par artisan ---
    let sousTotalGlobal = 0;
    let commissionGlobale = 0;

    const commandesArtisans: CommandeArtisanData[] = [];
    const artisanSousTotals = new Map<string, number>();

    for (const [artisanId, lignesArtisan] of artisteMap) {
      let sousTotalArtisan = 0;
      let commissionArtisan = 0;

      for (const ligne of lignesArtisan) {
        const ligneTotal = ligne.prixUnitaire * ligne.quantite;
        sousTotalArtisan += ligneTotal;
        commissionArtisan += Math.round((ligneTotal * ligne.tauxCommission) / 100);
      }

      // --- Calcul frais de livraison par artisan ---
      // Stratégie : répartition proportionnelle au sous-total de chaque artisan.
      // Si le sous-total global est 0, les frais sont 0 pour chaque artisan.
      // Ceci est compatible avec le comportement actuel (frais globaux uniques).
      // TODO: implémenter un calcul de livraison par artisan lorsque la logique
      // de livraison avancée sera définie.
      const fraisLivraisonArtisan =
        sousTotalGlobal + sousTotalArtisan > 0
          ? Math.round((input.fraisLivraison * sousTotalArtisan) / (sousTotalGlobal + sousTotalArtisan))
          : 0;

      const montantTotalArtisan = sousTotalArtisan + fraisLivraisonArtisan;

      artisanSousTotals.set(artisanId, sousTotalArtisan);
      sousTotalGlobal += sousTotalArtisan;
      commissionGlobale += commissionArtisan;

      commandesArtisans.push({
        artisanId,
        statut: 'COMMANDE' as OrderStatus,
        sousTotal: sousTotalArtisan,
        commission: commissionArtisan,
        fraisLivraison: fraisLivraisonArtisan,
        montantTotal: montantTotalArtisan,
        lignes: lignesArtisan.map((l) => ({
          oeuvreId: l.oeuvreId,
          artisanId: l.artisanId,
          prixUnitaire: l.prixUnitaire,
          quantite: l.quantite,
        })),
      });
    }

    // Ajuster les frais de livraison pour couvrir l'arrondi
    const fraisArtisansTotal = commandesArtisans.reduce(
      (sum, ca) => sum + ca.fraisLivraison,
      0
    );
    const ecartFrais = input.fraisLivraison - fraisArtisansTotal;
    if (ecartFrais !== 0 && commandesArtisans.length > 0) {
      // Ajouter l'écart au premier artisan
      const premier = commandesArtisans[0];
      if (premier) {
        premier.fraisLivraison += ecartFrais;
        premier.montantTotal += ecartFrais;
      }
    }

    const montantTotal = sousTotalGlobal + input.fraisLivraison;

    // --- Étape 3 : Créer la commande dans une transaction atomique ---
    let commande;
    try {
      commande = await this.repository.createCommande({
        acheteurId: buyerProfile.id,
        lignes: lignesDetails.map((l) => ({
          oeuvreId: l.oeuvreId,
          artisanId: l.artisanId,
          prixUnitaire: l.prixUnitaire,
          quantite: l.quantite,
        })),
        commandesArtisans,
        sousTotal: sousTotalGlobal,
        fraisLivraison: input.fraisLivraison,
        montantTotal,
        commission: commissionGlobale,
        methodePaiement: input.methodePaiement as PaymentMethod,
        adresseDest: input.adresseLivraison,
        transporteur: input.transporteur,
      });
    } catch (error) {
      // Si la transaction échoue à cause d'une vérification de statut concurrente
      if (error instanceof Error && error.message.startsWith('CONCURRENT_PURCHASE:')) {
        const ids = error.message.replace('CONCURRENT_PURCHASE:', '').trim();
        throw new ConflictError(
          `Une ou plusieurs œuvres ne sont plus disponibles. IDs: ${ids}`
        );
      }
      throw error;
    }

    const detail = await this.repository.findByIdMine(commande.id, buyerProfile.id);

    return {
      commande: detail,
      recapitulatif: {
        sousTotal: sousTotalGlobal,
        fraisLivraison: input.fraisLivraison,
        total: montantTotal,
        commission: commissionGlobale,
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

      // Collecter les artisans depuis les commandesArtisans (prioritaire)
      if (c.commandesArtisans && c.commandesArtisans.length > 0) {
        for (const ca of c.commandesArtisans) {
          artisans.add(ca.artisan?.nomAtelier ?? ca.artisan?.user?.nom ?? '');
        }
      } else {
        // Fallback pour les anciennes commandes sans CommandeArtisan
        for (const ligne of c.lignesCommande) {
          artisans.add(ligne.artisan?.nomAtelier ?? ligne.artisan?.user?.nom ?? '');
        }
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
