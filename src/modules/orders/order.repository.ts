import type { Prisma, PrismaClient, PaymentMethod, OrderStatus } from '../../generated/prisma/client.js';
import type { CommandeDetailedResult } from './order.types.js';

export type LigneToCreate = {
  oeuvreId: string;
  artisanId: string;
  prixUnitaire: number;
  quantite: number;
};

export type CreateCommandeData = {
  acheteurId: string;
  lignes: LigneToCreate[];
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

  async createCommande(data: CreateCommandeData) {
    return this.prisma.$transaction(async (tx) => {
      const commande = await tx.commande.create({
        data: {
          acheteurId: data.acheteurId,
          montantTotal: data.montantTotal,
          commission: data.commission,
          fraisLivraison: data.fraisLivraison,
          lignesCommande: {
            create: data.lignes.map((ligne) => ({
              oeuvreId: ligne.oeuvreId,
              artisanId: ligne.artisanId,
              prixUnitaire: ligne.prixUnitaire,
              quantite: ligne.quantite,
            })),
          },
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

      await tx.oeuvre.updateMany({
        where: { id: { in: data.lignes.map((ligne) => ligne.oeuvreId) } },
        data: { statut: 'VENDUE' },
      });

      return commande;
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
