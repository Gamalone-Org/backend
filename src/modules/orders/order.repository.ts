import type { Prisma, PrismaClient, PaymentMethod, OrderStatus } from '../../generated/prisma/client.js';
import type { CommandeDetailedResult } from './order.types.js';

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
   * Libère les œuvres réservées (EN_PANIER) lorsqu'une commande est annulée
   * ou qu'un paiement échoue.
   *
   * Remet les œuvres EN_PANIER en PUBLIEE pour les rendre à nouveau disponibles.
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
        statut: 'EN_PANIER',
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
      where.OR = [
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

  async findForAcheteur(acheteurId: string, page: number, limit: number) {
    const where: Prisma.CommandeWhereInput = { acheteurId };
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
          lignesCommande: {
            select: {
              id: true,
              quantite: true,
              commandeArtisanId: true,
              oeuvre: { select: { id: true, titre: true } },
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

  async updateStatut(id: string, statut: OrderStatus) {
    return this.prisma.commande.update({
      where: { id },
      data: { statut },
      select: { id: true, statut: true, updatedAt: true },
    });
  }
}
