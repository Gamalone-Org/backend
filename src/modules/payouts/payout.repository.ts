import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient, PayoutStatus } from '../../generated/prisma/client.js';
import {
  commandeArtisanPayoutSelect,
  payoutAdminDetailSelect,
  payoutAdminListSelect,
} from './payout.types.js';
import type { CommandeArtisanPayoutRow, PayoutAdminListItem } from './payout.types.js';

export type PayoutDiagnostic = Record<string, unknown>;

export class PayoutRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findCommandeArtisanForPayout(
    commandeArtisanId: string
  ): Promise<CommandeArtisanPayoutRow | null> {
    return this.prisma.commandeArtisan.findUnique({
      where: { id: commandeArtisanId },
      select: commandeArtisanPayoutSelect,
    });
  }

  findPayoutByCommandeArtisanId(commandeArtisanId: string) {
    return this.prisma.payout.findUnique({
      where: { commandeArtisanId },
      select: {
        id: true,
        statut: true,
        referenceExterne: true,
        montantNet: true,
        devise: true,
        methode: true,
      },
    });
  }

  findPayoutById(id: string) {
    return this.prisma.payout.findUnique({
      where: { id },
      select: {
        id: true,
        statut: true,
        prestataire: true,
        referenceExterne: true,
        commandeArtisanId: true,
        montantNet: true,
        devise: true,
        methode: true,
      },
    });
  }

  countTentatives(payoutId: string): Promise<number> {
    return this.prisma.payoutTentative.count({ where: { payoutId } });
  }

  /**
   * Crée la ligne de reversement. L'unicité sur `commandeArtisanId` garantit
   * qu'un même reversement ne peut pas être initié deux fois : une violation
   * remonte un code `P2002` que le service traduit en conflit.
   */
  async createPayout(data: {
    commandeArtisanId: string;
    artisanId: string;
    commandeId: string;
    montantBrut: number;
    commission: number;
    montantNet: number;
    devise: string;
    methode: 'MOBILE_MONEY' | 'VIREMENT_BANCAIRE';
  }): Promise<{ id: string }> {
    return this.prisma.payout.create({
      data: {
        commandeArtisanId: data.commandeArtisanId,
        artisanId: data.artisanId,
        commandeId: data.commandeId,
        montantBrut: data.montantBrut,
        commission: data.commission,
        montantNet: data.montantNet,
        devise: data.devise,
        methode: data.methode,
        statut: 'EN_ATTENTE',
      },
      select: { id: true },
    });
  }

  /** Marque un échec sans transaction distante : reversement rejouable. */
  async markPayoutEchoue(
    payoutId: string,
    erreur: Record<string, unknown>,
    montant: number,
    devise: string
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: payoutId },
        data: { statut: 'ECHOUE', erreur: erreur as Prisma.InputJsonValue },
      });
      await tx.payoutTentative.create({
        data: {
          payoutId,
          prestataire: 'FEDAPAY',
          statut: 'ECHOUE',
          montant,
          devise,
          erreur: erreur as Prisma.InputJsonValue,
        },
      });
    });
  }

  /** Reversement créé et démarré en local : en attente de résultat définitif. */
  async markPayoutEnTraitement(data: {
    payoutId: string;
    referenceExterne: string;
    statutExterne: string | null;
    modeExterne: string | null;
    montant: number;
    devise: string;
    now: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: data.payoutId },
        data: {
          statut: 'EN_TRAITEMENT',
          referenceExterne: data.referenceExterne,
          statutExterne: data.statutExterne,
          modeExterne: data.modeExterne,
          dateDeclenchement: data.now,
          erreur: Prisma.JsonNull,
        },
      });
      await tx.payoutTentative.create({
        data: {
          payoutId: data.payoutId,
          prestataire: 'FEDAPAY',
          referenceExterne: data.referenceExterne,
          statut: 'EN_TRAITEMENT',
          statutExterne: data.statutExterne,
          montant: data.montant,
          devise: data.devise,
          modeExterne: data.modeExterne,
          dateEnvoi: data.now,
        },
      });
    });
  }

  /**
   * État distant ambigu après création (démarrage FedaPay incertain). La
   * référence est conservée : aucun second reversement ne doit être créé.
   */
  async markPayoutReconciliation(data: {
    payoutId: string;
    referenceExterne: string;
    statutExterne: string | null;
    modeExterne: string | null;
    montant: number;
    devise: string;
    erreur: Record<string, unknown>;
    now: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: data.payoutId },
        data: {
          prestataire: 'FEDAPAY',
          statut: 'RECONCILIATION_REQUISE',
          referenceExterne: data.referenceExterne,
          statutExterne: data.statutExterne,
          modeExterne: data.modeExterne,
          dateDeclenchement: data.now,
          erreur: data.erreur as Prisma.InputJsonValue,
        },
      });
      await tx.payoutTentative.create({
        data: {
          payoutId: data.payoutId,
          prestataire: 'FEDAPAY',
          referenceExterne: data.referenceExterne,
          statut: 'RECONCILIATION_REQUISE',
          statutExterne: data.statutExterne,
          montant: data.montant,
          devise: data.devise,
          modeExterne: data.modeExterne,
          dateEnvoi: data.now,
          erreur: data.erreur as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * Applique un statut prestataire observé (synchronisation manuelle). Aucune
   * nouvelle transaction n'est jamais créée ici.
   */
  async applyRemoteStatus(data: {
    payoutId: string;
    statut: PayoutStatus;
    statutExterne: string | null;
    erreur?: Record<string, unknown> | null;
    now: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: data.payoutId },
        data: {
          statut: data.statut,
          statutExterne: data.statutExterne,
          ...(data.statut === 'VERSE' ? { dateConfirmation: data.now } : {}),
          erreur:
            data.erreur === undefined
              ? undefined
              : data.erreur === null
                ? Prisma.JsonNull
                : (data.erreur as Prisma.InputJsonValue),
        },
      });
      if (data.statut === 'VERSE') {
        await tx.payoutTentative.updateMany({
          where: {
            payoutId: data.payoutId,
            statut: { in: ['EN_ATTENTE', 'EN_TRAITEMENT', 'RECONCILIATION_REQUISE'] },
          },
          data: { statut: 'VERSE', statutExterne: data.statutExterne, dateReussite: data.now },
        });
      } else if (data.statut === 'ECHOUE') {
        await tx.payoutTentative.updateMany({
          where: { payoutId: data.payoutId, statut: { in: ['EN_ATTENTE', 'EN_TRAITEMENT'] } },
          data: { statut: 'ECHOUE', statutExterne: data.statutExterne },
        });
      }
    });
  }

  async markPayoutVerseLocal(payoutId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: payoutId },
        data: {
          statut: 'VERSE',
          dateConfirmation: now,
        },
      });
      await tx.payoutTentative.updateMany({
        where: {
          payoutId: payoutId,
          statut: { in: ['EN_ATTENTE', 'EN_TRAITEMENT', 'RECONCILIATION_REQUISE'] },
        },
        data: { statut: 'VERSE', statutExterne: null, dateReussite: now },
      });
    });
  }

  async markPayoutEchoueLocal(payoutId: string, _motif: string, _now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: payoutId },
        data: {
          statut: 'ECHOUE',
        },
      });
      await tx.payoutTentative.create({
        data: {
          payoutId,
          prestataire: 'FEDAPAY', // Placeholder for failed local payout
          statut: 'ECHOUE',
          montant: 0,
          devise: 'XOF',
        },
      });
    });
  }

  async findManyForAdmin(
    where: Prisma.PayoutWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: PayoutAdminListItem[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payout.findMany({
        where,
        select: payoutAdminListSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.payout.count({ where }),
    ]);
    return { items, total };
  }

  findByIdForAdmin(id: string) {
    return this.prisma.payout.findUnique({
      where: { id },
      select: payoutAdminDetailSelect,
    });
  }

  async findEligibleCommandeArtisans(
    where: Prisma.CommandeArtisanWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: CommandeArtisanPayoutRow[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.commandeArtisan.findMany({
        where,
        select: commandeArtisanPayoutSelect,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.commandeArtisan.count({ where }),
    ]);
    return { items, total };
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
