import { logKycError, logKycInfo, logKycWarn } from './kyc-logger.js';
import { KycPrivacyRepository } from './kyc-privacy.repository.js';
import { KycPrivacyService } from './kyc-privacy.service.js';

export type KycPurgeResult = {
  scanned: number;
  anonymized: number;
  skipped: number;
  failed: number;
};

export class KycPurgeService {
  constructor(
    private readonly privacyRepository: KycPrivacyRepository,
    private readonly privacyService: KycPrivacyService,
    private readonly batchSize: number = 50
  ) {}

  async runPurge(now: Date = new Date()): Promise<KycPurgeResult> {
    const eligible = await this.privacyRepository.findEligibleForPurge(now, this.batchSize);
    const result: KycPurgeResult = {
      scanned: eligible.length,
      anonymized: 0,
      skipped: 0,
      failed: 0,
    };

    for (const kyc of eligible) {
      if (kyc.legalHold) {
        result.skipped += 1;
        continue;
      }

      try {
        const anonymizeResult = await this.privacyService.anonymizeKyc(kyc.id);
        if (anonymizeResult.alreadyAnonymized) {
          result.skipped += 1;
        } else {
          result.anonymized += 1;
        }
      } catch (error) {
        result.failed += 1;
        logKycWarn('kyc_purge_item_failed', {
          kycId: kyc.id,
          errorCode: error instanceof Error ? error.name : 'UNKNOWN',
        });
      }
    }

    logKycInfo('kyc_purge_completed', {
      scanned: result.scanned,
      anonymized: result.anonymized,
      skipped: result.skipped,
      failed: result.failed,
    });

    return result;
  }
}

export async function runKycPurgeJob(): Promise<KycPurgeResult> {
  const { prisma } = await import('../../config/database.js');
  const privacyRepository = new KycPrivacyRepository(prisma);
  const privacyService = new KycPrivacyService(privacyRepository);
  const purgeService = new KycPurgeService(privacyRepository, privacyService);
  return purgeService.runPurge();
}

export type PurgeSchedulerStop = () => void;

export interface PurgeScheduler {
  start(intervalMs: number): PurgeSchedulerStop;
  runOnce(): Promise<KycPurgeResult>;
}

export function createPurgeScheduler(purgeService: KycPurgeService): PurgeScheduler {
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    start(intervalMs: number): PurgeSchedulerStop {
      if (timer !== null) {
        throw new Error('Purge scheduler is already running');
      }
      if (!Number.isInteger(intervalMs) || intervalMs < 60_000) {
        throw new Error('Purge interval must be at least 60000ms (1 minute)');
      }

      timer = setInterval(() => {
        purgeService.runPurge().catch((error) => {
          logKycError('kyc_purge_scheduled_run_failed', {
            errorCode: error instanceof Error ? error.name : 'UNKNOWN',
          });
        });
      }, intervalMs);

      return () => {
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },

    async runOnce(): Promise<KycPurgeResult> {
      return purgeService.runPurge();
    },
  };
}
