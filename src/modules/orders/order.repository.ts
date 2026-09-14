import {
  DeliveryStatus,
  OrderStatus,
  type Prisma,
  type PrismaClient,
  type PaymentMethod,
} from '../../generated/prisma/client.js';
import {
  artisanCommandeDetailSelect,
  artisanCommandeListSelect,
  acheteurCommandeListSelect,
} from './order.types.js';
import type {
  AcheteurCommandeFilters,
  AcheteurCommandeListResult,
  ArtisanCommandeDetailResult,
  ArtisanCommandeListResult,
  CommandeDetailedResult,
} from './order.types.js';

// Recherche par numéro de commande : les colonnes sont des UUID, seules des
// égalités strictes sont possibles avec Prisma (pas de contains sur UuidFilter).
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Rang de chaque statut pour le calcul du statut global d'une commande :
// le statut global est le statut minimum parmi les CommandeArtisan actives.
export const COMMANDE_STATUS_RANK: Record<OrderStatus, number> = {
  COMMANDE: 0,
  PREPARATION: 1,
  EXPEDIEE: 2,
  LIVREE: 3,
  CLOTUREE: 4,
  ANNULEE: 99,
  REMBOURSEE: 99,
};

// Projection Commande → Livraison pour la synchronisation de progression (R2).
// Les statuts de clôture administrative ANNULEE / REMBOURSEE n'y figurent pas :
// ils ne modifient pas l'expédition physique (décision métier P18 à trancher).
const ORDER_TO_LIVRAISON: Partial<Record<OrderStatus, DeliveryStatus>> = {
  COMMANDE: 'EN_ATTENTE',
  PREPARATION: 'PREPAREE',
  EXPEDIEE: 'EXPEDIEE',
  LIVREE: 'LIVREE',
  CLOTUREE: 'LIVREE',
};

// Rang de progression de la livraison pour la synchronisation monotone.
// ECHEC est une branche d'échec gérée par l'admin : elle n'est jamais écrasée
// par la synchronisation (seule la relance ECHEC → EN_TRANSIT la fait évoluer).
const LIVRAISON_STATUS_RANK: Record<DeliveryStatus, number> = {
  EN_ATTENTE: 0,
  PREPAREE: 1,
  EXPEDIEE: 2,
  EN_TRANSIT: 3,
  LIVREE: 4,
  ECHEC: -1,
};

/**
 * Statuts de CommandeArtisan qui ne doivent PAS être écrasés lors d'une
 * propagation du statut global (fix P1) :
 *   - les statuts terminaux (ANNULEE / REMBOURSEE) ne changent plus ;
 *   - tout statut déjà au moins aussi avancé que la cible n'est pas régressé.
 * Chaque artisan pilote sa CommandeArtisan indépendamment (via son espace) :
 * une avancée globale ne doit jamais faire reculer une partie déjà avancée.
 */
export function statutsNonRegressablesCible(cible: OrderStatus): OrderStatus[] {
  const rangCible = COMMANDE_STATUS_RANK[cible];
  return Object.values(OrderStatus).filter(
    (s) =>
      s === 'ANNULEE' ||
      s === 'REMBOURSEE' ||
      COMMANDE_STATUS_RANK[s] >= rangCible
  );
}

export function computeGlobalCommandStatus(statuses: OrderStatus[]): OrderStatus | null {
  const actives = statuses.filter((s) => s !== 'ANNULEE' && s !== 'REMBOURSEE');
  if (actives.length === 0) {
    return null;
  }
  return actives.reduce((min, s) =>
    COMMANDE_STATUS_RANK[s] < COMMANDE_STATUS_RANK[min] ? s : min
  );
}

export type LigneToCreate = {
  oeuvreId: string;
  artisanId: string;
  prixUnitaire: number;
  quantite: number;
};

export type CommandeArtisanData = {
  artisanId: string;
  statut: OrderStatus;
  sousTotal: number;
  commission: number;
  fraisLivraison: number;
  montantTotal: number;
  lignes: LigneToCreate[];
};

export type CreateCommandeData = {
  acheteurId: string;
  lignes: LigneToCreate[];
  commandesArtisans: CommandeArtisanData[];
  sousTotal: number;
  fraisLivraison: number;
  montantTotal: number;
  commission: number;
  methodePaiement: PaymentMethod;
  adresseDest: string;
  transporteur: string;
};

export class OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBuyerProfileByUserId(userId: string) {
    return this.prisma.buyerProfile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, nom: true, role: true } } },
    });
  }

  async findOeuvreById(id: string) {
    return this.prisma.oeuvre.findUnique({
      where: { id },
      include: {
        artisan: { select: { id: true, commission: true } },
      },
    });
  }

  /**
   * Crée une commande globale avec ses CommandeArtisan et lignes.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * PROTECTION CONTRE LA RACE CONDITION (double vente)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Stratégie : UPDATE atomique avec condition sur le statut.
   *
   * Au lieu de:
   *   1. SELECT (findMany) → vérifier PUBLIEE → créer commande → UPDATE VENDUE
   *   (deux transactions peuvent lire PUBLIEE simultanément)
   *
   * On fait:
   *   1. UPDATE oeuvres SET statut = 'EN_PANIER' WHERE id IN (...) AND statut = 'PUBLIEE'
   *   2. Vérifier le nombre de lignes modifiées = nombre d'œuvres demandées
   *   3. Si ce n'est pas le cas → rollback immédiat (aucune commande créée)
   *
   * Pourquoi c'est atomique:
   *   - PostgreSQL applique un verrou EXCLUSIVE sur les lignes MATCHÉES pendant l'UPDATE
   *   - Deux transactions concurrentes sur la même œuvre : la première obtient le verrou
   *     et passe le statut à EN_PANIER. La seconde voit le verrou, attend, puis
   *     constate que statut n'est plus PUBLIEE → 0 lignes modifiées → rollback.
   *   - Aucun SELECT intermédiaire qui pourrait lire un état stale.
   *   - Pas besoin de SELECT FOR UPDATE (qui nécessiterait raw SQL avec Prisma).
   *
   * NOTE : le statut intermédiaire EN_PANIER est appliqué ici pour la protection
   * concurrence. Lorsque le vrai paiement sera implémenté, EN_PANIER → VENDUE
   * ne se fera qu'après confirmation du paiement (Webhook/CinetPay callback).
   * Si le paiement échoue, EN_PANIER → PUBLIEE (annulation/libération).
   */
  async createCommande(data: CreateCommandeData) {
    return this.prisma.$transaction(async (tx) => {
      // --- ÉTAPE 1 : Verrou atomique des œuvres ---
      // UPDATE avec condition WHERE statut = 'PUBLIEE' garantit qu'aucune
      // transaction concurrente ne peut réserver la même œuvre.
      // Si une œuvre est déjà EN_PANIER ou VENDUE, le WHERE ne matche pas,
      // 0 ligne est modifiée, et on rollback immédiatement.
      const oeuvreIds = data.lignes.map((l) => l.oeuvreId);

      const updateResult = await tx.$executeRaw`
        UPDATE "oeuvres"
        SET "statut" = 'EN_PANIER'::"ArtworkStatus",
            "updatedAt" = NOW()
        WHERE "id" = ANY(${oeuvreIds}::uuid[])
          AND "statut" = 'PUBLIEE'::"ArtworkStatus"
      `;

      if (Number(updateResult) !== oeuvreIds.length) {
        const reservedIds = oeuvreIds.slice(0, Number(updateResult));
        const failedIds = oeuvreIds.slice(Number(updateResult));

        // Rollback partiel : remettre les œuvres qui avaient été réservées
        // dans cette transaction en PUBLIEE (annulation de la réservation).
        if (reservedIds.length > 0) {
          await tx.$executeRaw`
            UPDATE "oeuvres"
            SET "statut" = 'PUBLIEE'::"ArtworkStatus",
                "updatedAt" = NOW()
            WHERE "id" = ANY(${reservedIds}::uuid[])
              AND "statut" = 'EN_PANIER'::"ArtworkStatus"
          `;
        }

        throw new Error(`CONCURRENT_PURCHASE:${failedIds.join(',')}`);
      }

      // --- ÉTAPE 2 : Création de la commande globale ---
      const commande = await tx.commande.create({
        data: {
          acheteurId: data.acheteurId,
          montantTotal: data.montantTotal,
          commission: data.commission,
          fraisLivraison: data.fraisLivraison,
          paiement: {
            create: {
              montant: data.montantTotal,
              methode: data.methodePaiement,
              statut: 'EN_ATTENTE',
              estEnsequestre: false,
            },
          },
          livraison: {
            create: {
              transporteur: data.transporteur,
              adresseDest: data.adresseDest,
              frais: data.fraisLivraison,
              statut: 'EN_ATTENTE',
            },
          },
        },
      });

      // --- ÉTAPE 3 : Création des CommandeArtisan et de leurs lignes ---
      for (const ca of data.commandesArtisans) {
        const commandeArtisan = await tx.commandeArtisan.create({
          data: {
            commandeId: commande.id,
            artisanId: ca.artisanId,
            statut: ca.statut,
            sousTotal: ca.sousTotal,
            commission: ca.commission,
            fraisLivraison: ca.fraisLivraison,
            montantTotal: ca.montantTotal,
          },
        });

        for (const ligne of ca.lignes) {
          await tx.ligneCommande.create({
            data: {
              commandeId: commande.id,
              commandeArtisanId: commandeArtisan.id,
              oeuvreId: ligne.oeuvreId,
              artisanId: ligne.artisanId,
              prixUnitaire: ligne.prixUnitaire,
              quantite: ligne.quantite,
            },
          });
        }
      }

      // --- ÉTAPE 4 : Marquer les œuvres comme VENDUES ---
      // Transition finale : EN_PANIER → VENDUE.
      // NOTE : lorsque le paiement réel sera implémenté, cette transition
      // ne se fera qu'après confirmation du webhook de paiement.
      // Si le paiement échoue, la logique d'annulation fera EN_PANIER → PUBLIEE.
      await tx.oeuvre.updateMany({
        where: { id: { in: oeuvreIds } },
        data: { statut: 'VENDUE' },
      });

      return commande;
    });
  }

  /**
   * Libère les œuvres d'une commande annulée ou d'un paiement échoué.
   *
   * Remet les œuvres EN_PANIER ou VENDUE en PUBLIEE pour les rendre à
   * nouveau disponibles. Le statut VENDUE est traité car dans le cycle
   * actuel (sans paiement réel), les œuvres sont déjà marquées VENDUES
   * au moment de l'annulation.
   */
  async releaseOeuvres(commandeId: string) {
    const lignes = await this.prisma.ligneCommande.findMany({
      where: { commandeId },
      select: { oeuvreId: true },
    });

    const oeuvreIds = lignes.map((l) => l.oeuvreId);
    if (oeuvreIds.length === 0) return;

    await this.prisma.oeuvre.updateMany({
      where: {
        id: { in: oeuvreIds },
        statut: { in: ['EN_PANIER', 'VENDUE'] },
      },
      data: { statut: 'PUBLIEE' },
    });
  }

  async findByIdDetailed(id: string): Promise<CommandeDetailedResult | null> {
    return this.prisma.commande.findUnique({
      where: { id },
      select: {
        id: true,
        dateCreation: true,
        statut: true,
        typeCommande: true,
        montantTotal: true,
        commission: true,
        fraisLivraison: true,
        createdAt: true,
        updatedAt: true,
        acheteur: {
          select: {
            id: true,
            adresseLivraison: true,
            devise: true,
            langue: true,
            typeClient: true,
            user: {
              select: { id: true, nom: true, telephone: true, email: true },
            },
          },
        },
        lignesCommande: {
          select: {
            id: true,
            prixUnitaire: true,
            quantite: true,
            commandeArtisanId: true,
            oeuvre: {
              select: {
                id: true,
                titre: true,
                categorie: { select: { id: true, nom: true } },
                medias: {
                  where: { type: 'OEUVRE' },
                  orderBy: { ordre: 'asc' },
                  take: 1,
                  select: { id: true, url: true },
                },
              },
            },
            artisan: {
              select: {
                id: true,
                nomAtelier: true,
                user: { select: { id: true, nom: true } },
              },
            },
          },
        },
        commandesArtisans: {
          select: {
            id: true,
            statut: true,
            sousTotal: true,
            commission: true,
            fraisLivraison: true,
            montantTotal: true,
            createdAt: true,
            updatedAt: true,
            artisan: {
              select: {
                id: true,
                nomAtelier: true,
                user: { select: { id: true, nom: true } },
              },
            },
            lignesCommande: {
              select: {
                id: true,
                prixUnitaire: true,
                quantite: true,
                oeuvre: {
                  select: {
                    id: true,
                    titre: true,
                    categorie: { select: { id: true, nom: true } },
                    medias: {
                      where: { type: 'OEUVRE' },
                      orderBy: { ordre: 'asc' },
                      take: 1,
                      select: { id: true, url: true },
                    },
                  },
                },
              },
            },
          },
        },
        paiement: {
          select: {
            id: true,
            montant: true,
            methode: true,
            statut: true,
            date: true,
            estEnsequestre: true,
          },
        },
        livraison: {
          select: {
            id: true,
            transporteur: true,
            numeroSuivi: true,
            statut: true,
            adresseDest: true,
            frais: true,
          },
        },
      },
    });
  }

  async findByIdMine(id: string, acheteurId: string): Promise<CommandeDetailedResult | null> {
    return this.prisma.commande.findFirst({
      where: { id, acheteurId },
      select: {
        id: true,
        dateCreation: true,
        statut: true,
        typeCommande: true,
        montantTotal: true,
        commission: true,
        fraisLivraison: true,
        createdAt: true,
        updatedAt: true,
        acheteur: {
          select: {
            id: true,
            adresseLivraison: true,
            devise: true,
            langue: true,
            typeClient: true,
            user: {
              select: { id: true, nom: true, telephone: true, email: true },
            },
          },
        },
        lignesCommande: {
          select: {
            id: true,
            prixUnitaire: true,
            quantite: true,
            commandeArtisanId: true,
            oeuvre: {
              select: {
                id: true,
                titre: true,
                categorie: { select: { id: true, nom: true } },
                medias: {
                  where: { type: 'OEUVRE' },
                  orderBy: { ordre: 'asc' },
                  take: 1,
                  select: { id: true, url: true },
                },
              },
            },
            artisan: {
              select: {
                id: true,
                nomAtelier: true,
                user: { select: { id: true, nom: true } },
              },
            },
          },
        },
        commandesArtisans: {
          select: {
            id: true,
            statut: true,
            sousTotal: true,
            commission: true,
            fraisLivraison: true,
            montantTotal: true,
            createdAt: true,
            updatedAt: true,
            artisan: {
              select: {
                id: true,
                nomAtelier: true,
                user: { select: { id: true, nom: true } },
              },
            },
            lignesCommande: {
              select: {
                id: true,
                prixUnitaire: true,
                quantite: true,
                oeuvre: {
                  select: {
                    id: true,
                    titre: true,
                    categorie: { select: { id: true, nom: true } },
                    medias: {
                      where: { type: 'OEUVRE' },
                      orderBy: { ordre: 'asc' },
                      take: 1,
                      select: { id: true, url: true },
                    },
                  },
                },
              },
            },
          },
        },
        paiement: {
          select: {
            id: true,
            montant: true,
            methode: true,
            statut: true,
            date: true,
            estEnsequestre: true,
          },
        },
        livraison: {
          select: {
            id: true,
            transporteur: true,
            numeroSuivi: true,
            statut: true,
            adresseDest: true,
            frais: true,
          },
        },
      },
    });
  }

  async findByIdSummary(id: string) {
    return this.prisma.commande.findUnique({
      where: { id },
      select: { id: true, statut: true, acheteurId: true },
    });
  }

  async findForAdmin(
    page: number,
    limit: number,
    filters: { statut?: OrderStatus; q?: string }
  ) {
    const where: Prisma.CommandeWhereInput = {};

    if (filters.statut) {
      where.statut = filters.statut;
    }

    if (filters.q) {
      const or: Prisma.CommandeWhereInput[] = [
        {
          acheteur: {
            user: { nom: { contains: filters.q, mode: 'insensitive' } },
          },
        },
        {
          acheteur: {
            user: { telephone: { contains: filters.q, mode: 'insensitive' } },
          },
        },
        {
          lignesCommande: {
            some: { artisan: { user: { nom: { contains: filters.q, mode: 'insensitive' } } } },
          },
        },
        {
          lignesCommande: {
            some: { oeuvre: { titre: { contains: filters.q, mode: 'insensitive' } } },
          },
        },
        {
          commandesArtisans: {
            some: { artisan: { user: { nom: { contains: filters.q, mode: 'insensitive' } } } },
          },
        },
      ];

      // Recherche par numéro de commande : égalité stricte (colonne UUID).
      if (UUID_PATTERN.test(filters.q)) {
        or.push({ id: { equals: filters.q } });
      }

      where.OR = or;
    }

    const [commandes, total] = await Promise.all([
      this.prisma.commande.findMany({
        where,
        orderBy: { dateCreation: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          dateCreation: true,
          statut: true,
          typeCommande: true,
          montantTotal: true,
          fraisLivraison: true,
          commission: true,
          acheteur: {
            select: {
              id: true,
              user: { select: { nom: true, telephone: true } },
            },
          },
          lignesCommande: {
            select: {
              id: true,
              commandeArtisanId: true,
              artisan: {
                select: {
                  id: true,
                  nomAtelier: true,
                  user: { select: { nom: true } },
                },
              },
            },
          },
          commandesArtisans: {
            select: {
              id: true,
              statut: true,
              sousTotal: true,
              montantTotal: true,
              artisan: {
                select: {
                  id: true,
                  nomAtelier: true,
                  user: { select: { nom: true } },
                },
              },
            },
          },
          paiement: {
            select: { id: true, statut: true, methode: true, montant: true },
          },
          livraison: {
            select: { id: true, statut: true, transporteur: true },
          },
        },
      }),
      this.prisma.commande.count({ where }),
    ]);

    return { commandes, total };
  }

  /**
   * Liste paginée « Mes commandes » de l'acheteur.
   *
   * Sécurité : `acheteurId` reste toujours présent en tête du where (combinaison
   * AND implicite). La recherche textuelle est placée sous `AND` (jamais en OR
   * à la racine) pour qu'aucun filtre ne puisse contourner l'isolation acheteur.
   */
  async findForAcheteur(
    acheteurId: string,
    page: number,
    limit: number,
    filters: AcheteurCommandeFilters = {}
  ): Promise<{ commandes: AcheteurCommandeListResult[]; total: number }> {
    const where: Prisma.CommandeWhereInput = { acheteurId };

    if (filters.statuts && filters.statuts.length > 0) {
      where.statut = { in: filters.statuts };
    }

    if (filters.q) {
      const or: Prisma.CommandeWhereInput[] = [
        {
          lignesCommande: {
            some: { oeuvre: { titre: { contains: filters.q, mode: 'insensitive' } } },
          },
        },
        {
          lignesCommande: {
            some: { artisan: { user: { nom: { contains: filters.q, mode: 'insensitive' } } } },
          },
        },
        {
          commandesArtisans: {
            some: { artisan: { nomAtelier: { contains: filters.q, mode: 'insensitive' } } },
          },
        },
        {
          commandesArtisans: {
            some: { artisan: { user: { nom: { contains: filters.q, mode: 'insensitive' } } } },
          },
        },
      ];

      // Recherche par numéro de commande : égalité stricte (colonne UUID).
      if (UUID_PATTERN.test(filters.q)) {
        or.push({ id: { equals: filters.q } });
      }

      where.AND = or;
    }

    const orderBy: Prisma.CommandeOrderByWithRelationInput =
      filters.tri === 'dateCreation_asc'
        ? { dateCreation: 'asc' }
        : { dateCreation: 'desc' };

    const [commandes, total] = await Promise.all([
      this.prisma.commande.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: { ...acheteurCommandeListSelect },
      }),
      this.prisma.commande.count({ where }),
    ]);

    return { commandes, total };
  }

  async updateStatut(id: string, statut: OrderStatus) {
    return this.prisma.$transaction(async (tx) => {
      const commande = await tx.commande.update({
        where: { id },
        data: { statut },
        select: { id: true, statut: true, updatedAt: true },
      });

      // Propagation aux CommandeArtisan : le statut global est la vérité
      // partagée, mais une CommandeArtisan déjà au moins aussi avancée que la
      // cible (ou terminale) n'est PAS régressée — fix P1 : l'admin ne doit
      // pas écraser la progression faite par un artisan sur sa propre partie.
      await tx.commandeArtisan.updateMany({
        where: {
          commandeId: id,
          statut: { notIn: statutsNonRegressablesCible(statut) },
        },
        data: { statut },
      });

      // Synchronisation Commande → Livraison (R2) : l'avancement de la
      // commande fait avancer la livraison de façon monotone (jamais de
      // régression, les états ECHEC et LIVREE ne sont jamais écrasés).
      await this.syncLivraisonFromOrder(tx, id, statut);

      return commande;
    });
  }

  /**
   * Synchronise la livraison d'une commande à partir du statut global de la
   * commande (R2). Progression monotone uniquement : la livraison ne recule
   * jamais (ex. une livraison déjà EN_TRANSIT reste EN_TRANSIT quand l'ordre
   * passe à EXPEDIEE), et une livraison en ECHEC est laissée à la gestion de
   * l'admin (relance ECHEC → EN_TRANSIT).
   */
  private async syncLivraisonFromOrder(
    tx: Prisma.TransactionClient,
    commandeId: string,
    statut: OrderStatus
  ) {
    const desired = ORDER_TO_LIVRAISON[statut];
    if (!desired) return;

    const sources = Object.values(DeliveryStatus).filter(
      (s) =>
        s !== 'ECHEC' && LIVRAISON_STATUS_RANK[s] < LIVRAISON_STATUS_RANK[desired]
    );
    if (sources.length === 0) return;

    await tx.livraison.updateMany({
      where: { commandeId, statut: { in: sources } },
      data: { statut: desired },
    });
  }

  // ---------------------------------------------------------------------------
  // Espace Artisan
  // ---------------------------------------------------------------------------

  async findArtisanProfileByUserId(userId: string) {
    return this.prisma.artisanProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  async findArtisanEligibility(userId: string) {
    return this.prisma.artisanProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        user: { select: { statut: true } },
      },
    });
  }

  async findKycValidForUser(userId: string) {
    const current = await this.prisma.kyc.findFirst({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return current && current.status === 'VALIDE' ? current : null;
  }

  async findAllForArtisan(
    artisanId: string,
    page: number,
    limit: number,
    filters: { statut?: OrderStatus; q?: string }
  ): Promise<{ commandes: ArtisanCommandeListResult[]; total: number }> {
    const where: Prisma.CommandeArtisanWhereInput = {
      artisanId,
      ...(filters.statut ? { statut: filters.statut } : {}),
    };

    if (filters.q) {
      const or: Prisma.CommandeArtisanWhereInput[] = [
        {
          commande: {
            acheteur: { user: { nom: { contains: filters.q, mode: 'insensitive' } } },
          },
        },
        {
          lignesCommande: {
            some: { oeuvre: { titre: { contains: filters.q, mode: 'insensitive' } } },
          },
        },
      ];

      // Recherche par numéro de commande : égalité stricte sur la
      // CommandeArtisan ou la Commande parent (UUID uniquement).
      if (UUID_PATTERN.test(filters.q)) {
        or.push({ id: { equals: filters.q } });
        or.push({ commande: { id: { equals: filters.q } } });
      }

      where.OR = or;
    }

    const [commandes, total] = await Promise.all([
      this.prisma.commandeArtisan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { ...artisanCommandeListSelect },
      }),
      this.prisma.commandeArtisan.count({ where }),
    ]);

    return { commandes, total };
  }

  async getArtisanOrderCounts(artisanId: string): Promise<Record<OrderStatus, number>> {
    const groups = await this.prisma.commandeArtisan.groupBy({
      by: ['statut'],
      where: { artisanId },
      _count: { _all: true },
    });

    const counts = Object.fromEntries(
      Object.values(OrderStatus).map((s) => [s, 0])
    ) as Record<OrderStatus, number>;

    for (const group of groups) {
      counts[group.statut] = group._count._all;
    }

    return counts;
  }

  async findOneForArtisan(
    id: string,
    artisanId: string
  ): Promise<ArtisanCommandeDetailResult | null> {
    return this.prisma.commandeArtisan.findFirst({
      where: { id, artisanId },
      select: { ...artisanCommandeDetailSelect },
    });
  }

  async findArtisanCommandSummary(id: string, artisanId: string) {
    return this.prisma.commandeArtisan.findFirst({
      where: { id, artisanId },
      select: { id: true, commandeId: true, statut: true },
    });
  }

  /**
   * Fait progresser une CommandeArtisan de façon atomique et resynchronise
   * le statut global de la Commande (minimum des statuts des CommandeArtisan
   * actives).
   *
   * L'UPDATE conditionnel `where: { id, artisanId, statut: expected }`
   * protège contre deux transitions concurrentes sur la même ligne :
   * la seconde ne matche plus aucune ligne et la transaction ne modifie rien.
   */
  async advanceArtisanCommand(
    id: string,
    artisanId: string,
    expected: OrderStatus,
    target: OrderStatus
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.commandeArtisan.updateMany({
        where: { id, artisanId, statut: expected },
        data: { statut: target },
      });

      if (updated.count === 0) {
        return null;
      }

      const commandeArtisan = await tx.commandeArtisan.findFirstOrThrow({
        where: { id },
        select: { commandeId: true },
      });

      const commande = await tx.commande.findUniqueOrThrow({
        where: { id: commandeArtisan.commandeId },
        select: { statut: true },
      });

      const actives = await tx.commandeArtisan.findMany({
        where: {
          commandeId: commandeArtisan.commandeId,
          statut: { notIn: ['ANNULEE', 'REMBOURSEE'] },
        },
        select: { statut: true },
      });

      const next = computeGlobalCommandStatus(actives.map((a) => a.statut));
      let statutGlobal = commande.statut;

      if (next && next !== statutGlobal) {
        await tx.commande.update({
          where: { id: commandeArtisan.commandeId },
          data: { statut: next },
        });
        statutGlobal = next;

        // Synchronisation Commande → Livraison (R2) : le statut global ayant
        // avancé (ex. EXPEDIEE quand tous les artisans ont expédié), la
        // livraison suit de façon monotone.
        await this.syncLivraisonFromOrder(tx, commandeArtisan.commandeId, next);
      }

      return { commandeArtisanId: id, statutGlobal };
    });
  }
}
