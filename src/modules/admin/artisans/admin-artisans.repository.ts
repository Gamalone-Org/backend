import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type { ArtworkStatus, KycStatus, OrderStatus, UserStatus } from '../../../generated/prisma/client.js';

export type ListArtisansOptions = {
  page: number;
  limit: number;
  q?: string;
  kycStatus?: KycStatus;
  kycPending?: boolean;
  accountStatus?: UserStatus;
};

export type LatestKycRow = {
  userId: string;
  kycId: string;
  status: KycStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
};

export type ArtisanPageUser = {
  id: string;
  nom: string | null;
  email: string | null;
  telephone: string;
  statut: UserStatus;
  createdAt: Date;
  artisanProfile: {
    id: string;
    nomAtelier: string;
    specialite: string;
    localisation: string;
    photoAtelierUrl: string | null;
  } | null;
};

export type ArtisanDetailRow = {
  id: string;
  type: 'ARTISAN' | 'ARTISTE';
  nomAtelier: string;
  specialite: string;
  biographie: string;
  localisation: string;
  anneesExperience: number;
  estCertifie: boolean;
  scoreFiabilite: Prisma.Decimal | null;
  photoAtelierUrl: string | null;
  validatedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    nom: string | null;
    email: string | null;
    telephone: string;
    statut: UserStatus;
    role: string;
    deletedAt: Date | null;
    createdAt: Date;
  } | null;
};

export type ArtisanArtworkRow = {
  id: string;
  titre: string;
  statut: ArtworkStatus;
  prixXOF: number;
  createdAt: Date;
  medias: Array<{ id: string; url: string; ordre: number }>;
};

export type ArtisanOrderRow = {
  id: string;
  statut: OrderStatus;
  sousTotal: number;
  commission: number;
  fraisLivraison: number;
  montantTotal: number;
  createdAt: Date;
  commande: {
    id: string;
    statut: OrderStatus;
    dateCreation: Date;
    createdAt: Date;
    acheteur: {
      id: string;
      typeClient: string;
      user: { id: string; nom: string | null };
    };
  } | null;
};

const UUID_ARTISAN_IDS = `SELECT u."id" FROM "users" u WHERE u."role" = 'ARTISAN' AND u."deletedAt" IS NULL`;

export class AdminArtisansRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async latestKycByUserIds(userIds: string[]): Promise<LatestKycRow[]> {
    if (userIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.$queryRaw<Array<Omit<LatestKycRow, 'status'> & { status: string }>>`
      SELECT k."userId"::text AS "userId",
             k."id"::text AS "kycId",
             k."status"::text AS "status",
             k."submittedAt" AS "submittedAt",
             k."reviewedAt" AS "reviewedAt"
      FROM "kyc_records" k
      WHERE k."deletedAt" IS NULL
        AND k."id" IN (
          SELECT DISTINCT ON (k4."userId") k4."id"
          FROM "kyc_records" k4
          WHERE k4."deletedAt" IS NULL
            AND k4."userId" IN (${Prisma.join(userIds.map((id) => Prisma.sql`${id}::uuid`))})
          ORDER BY k4."userId", k4."createdAt" DESC, k4."id" DESC
        )
    `;

    return rows.map((row) => ({ ...row, status: row.status as KycStatus }));
  }

  private async resolveArtisanUserIdsByStatut(
    statuses: readonly KycStatus[]
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ userId: string }>>`
      SELECT k."userId"::text AS "userId"
      FROM "kyc_records" k
      WHERE k."deletedAt" IS NULL
        AND k."status"::text IN (${Prisma.join(statuses)})
        AND k."id" IN (
          SELECT DISTINCT ON (k4."userId") k4."id"
          FROM "kyc_records" k4
          WHERE k4."deletedAt" IS NULL
            AND k4."userId" IN (${Prisma.raw(UUID_ARTISAN_IDS)})
          ORDER BY k4."userId", k4."createdAt" DESC, k4."id" DESC
        )
    `;

    return rows.map((row) => row.userId);
  }

  async listArtisans(options: ListArtisansOptions) {
    const { page, limit } = options;

    const where: Prisma.UserWhereInput = {
      role: 'ARTISAN',
      deletedAt: null,
      ...(options.accountStatus ? { statut: options.accountStatus } : {}),
    };

    if (options.q) {
      where.OR = [
        { nom: { contains: options.q, mode: 'insensitive' } },
        { email: { contains: options.q, mode: 'insensitive' } },
        { telephone: { contains: options.q } },
        { artisanProfile: { nomAtelier: { contains: options.q, mode: 'insensitive' } } },
        { artisanProfile: { specialite: { contains: options.q, mode: 'insensitive' } } },
        { artisanProfile: { localisation: { contains: options.q, mode: 'insensitive' } } },
      ];
    }

    if (options.kycStatus) {
      where.id = { in: await this.resolveArtisanUserIdsByStatut([options.kycStatus]) };
    } else if (options.kycPending) {
      where.id = { in: await this.resolveArtisanUserIdsByStatut(['SOUMIS', 'EN_ATTENTE']) };
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          nom: true,
          email: true,
          telephone: true,
          statut: true,
          createdAt: true,
          deletedAt: true,
          artisanProfile: {
            select: {
              id: true,
              nomAtelier: true,
              specialite: true,
              localisation: true,
              photoAtelierUrl: true,
            },
          },
        },
      }),
    ]);

    type UserRow = ArtisanPageUser & { deletedAt: Date | null };
    const artisans = users.filter(
      (user: UserRow) => user.artisanProfile !== null && user.deletedAt === null
    ) as Array<UserRow & { artisanProfile: NonNullable<UserRow['artisanProfile']> }>;

    const profileIds = artisans.map((user) => user.artisanProfile.id);
    const userIds = artisans.map((user) => user.id);

    const [latestKyc, artworksByArtisan, volumesByArtisan] = await Promise.all([
      this.latestKycByUserIds(userIds),
      this.prisma.oeuvre.groupBy({
        by: ['artisanId'],
        where: { artisanId: { in: profileIds } },
        _count: { _all: true },
      }),
      this.prisma.commandeArtisan.groupBy({
        by: ['artisanId'],
        where: {
          artisanId: { in: profileIds },
          statut: { notIn: ['ANNULEE', 'REMBOURSEE'] as OrderStatus[] },
        },
        _sum: { montantTotal: true },
      }),
    ]);

    const kycByUser = new Map(latestKyc.map((kyc) => [kyc.userId, kyc]));
    const artworksCountByArtisan = new Map(
      artworksByArtisan.map((row) => [row.artisanId, row._count._all])
    );
    const volumeByArtisan = new Map(
      volumesByArtisan.map((row) => [row.artisanId, Number(row._sum.montantTotal ?? 0)])
    );

    const items = artisans.map((user) => {
      const profile = user.artisanProfile;
      const kyc = kycByUser.get(user.id) ?? null;
      return {
        id: profile.id,
        userId: user.id,
        nom: user.nom,
        nomAtelier: profile.nomAtelier,
        avatar: profile.photoAtelierUrl,
        specialty: profile.specialite,
        location: profile.localisation,
        inscription: user.createdAt.toISOString(),
        accountStatus: user.statut,
        kycStatus: kyc?.status ?? null,
        kycId: kyc?.kycId ?? null,
        artworksCount: artworksCountByArtisan.get(profile.id) ?? 0,
        grossOrderVolume: volumeByArtisan.get(profile.id) ?? 0,
      };
    });

    return { items, total, page, limit };
  }

  async findArtisanDetail(id: string): Promise<ArtisanDetailRow | null> {
    return this.prisma.artisanProfile.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        nomAtelier: true,
        specialite: true,
        biographie: true,
        localisation: true,
        anneesExperience: true,
        estCertifie: true,
        scoreFiabilite: true,
        photoAtelierUrl: true,
        validatedAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            nom: true,
            email: true,
            telephone: true,
            statut: true,
            role: true,
            deletedAt: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async countArtworksByArtisan(artisanId: string): Promise<number> {
    return this.prisma.oeuvre.count({ where: { artisanId } });
  }

  async getArtisanStats(artisanId: string) {
    const [artworksByStatus, orderAggregate] = await Promise.all([
      this.prisma.oeuvre.groupBy({
        by: ['statut'],
        where: { artisanId },
        _count: { _all: true },
      }),
      this.prisma.commandeArtisan.aggregate({
        where: {
          artisanId,
          statut: { notIn: ['ANNULEE', 'REMBOURSEE'] as OrderStatus[] },
        },
        _count: { _all: true },
        _sum: { montantTotal: true },
      }),
    ]);

    const statusCounts = new Map<ArtworkStatus, number>();
    let totalOeuvres = 0;
    for (const row of artworksByStatus) {
      statusCounts.set(row.statut, row._count._all);
      totalOeuvres += row._count._all;
    }

    return {
      totalOeuvres,
      publiees: statusCounts.get('PUBLIEE') ?? 0,
      enPanier: statusCounts.get('EN_PANIER') ?? 0,
      vendues: statusCounts.get('VENDUE') ?? 0,
      nbCommandesArtisan: orderAggregate._count._all,
      grossOrderVolume: Number(orderAggregate._sum.montantTotal ?? 0),
    };
  }

  async listArtworks(
    artisanId: string,
    options: { page: number; limit: number; statut?: ArtworkStatus }
  ) {
    const { page, limit } = options;
    const where: Prisma.OeuvreWhereInput = {
      artisanId,
      ...(options.statut ? { statut: options.statut } : {}),
    };

    const [oeuvres, total] = await Promise.all([
      this.prisma.oeuvre.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          titre: true,
          statut: true,
          prixXOF: true,
          createdAt: true,
          medias: {
            where: { type: 'OEUVRE' },
            orderBy: { ordre: 'asc' },
            take: 1,
            select: { id: true, url: true, ordre: true },
          },
        },
      }),
      this.prisma.oeuvre.count({ where }),
    ]);

    const items = oeuvres.map((oeuvre) => ({
      id: oeuvre.id,
      titre: oeuvre.titre,
      statut: oeuvre.statut,
      prixXOF: Number(oeuvre.prixXOF),
      createdAt: oeuvre.createdAt,
      coverUrl: oeuvre.medias[0]?.url ?? null,
    }));

    return { items, total, page, limit };
  }

  async listOrders(
    artisanId: string,
    options: { page: number; limit: number; statut?: OrderStatus }
  ) {
    const { page, limit } = options;
    const where: Prisma.CommandeArtisanWhereInput = {
      artisanId,
      ...(options.statut ? { statut: options.statut } : {}),
    };

    const [orders, total] = await Promise.all([
      this.prisma.commandeArtisan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          statut: true,
          sousTotal: true,
          commission: true,
          fraisLivraison: true,
          montantTotal: true,
          createdAt: true,
          commande: {
            select: {
              id: true,
              statut: true,
              dateCreation: true,
              createdAt: true,
              acheteur: {
                select: {
                  id: true,
                  typeClient: true,
                  user: { select: { id: true, nom: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.commandeArtisan.count({ where }),
    ]);

    const items = orders.map((order) => ({
      id: order.id,
      statut: order.statut,
      sousTotal: Number(order.sousTotal),
      commission: Number(order.commission),
      fraisLivraison: Number(order.fraisLivraison),
      montantTotal: Number(order.montantTotal),
      createdAt: order.createdAt,
      commande: order.commande
        ? {
            id: order.commande.id,
            statut: order.commande.statut,
            dateCreation: order.commande.dateCreation,
            createdAt: order.commande.createdAt,
            acheteur: {
              id: order.commande.acheteur.id,
              typeClient: order.commande.acheteur.typeClient,
              nom: order.commande.acheteur.user.nom,
            },
          }
        : null,
    }));

    return { items, total, page, limit };
  }
}