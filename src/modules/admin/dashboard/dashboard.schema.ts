import { z } from 'zod';
import type { DashboardPeriodKey } from './dashboard.types.js';

const PERIOD_VALUES = ['7d', '30d', '90d', '12m'] as const;

export const dashboardQuerySchema = z
  .object({
    period: z
      .enum(PERIOD_VALUES, {
        message: "period doit être l'une de : 7d, 30d, 90d, 12m",
      })
      .default('30d'),
  })
  .strict();

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export type { DashboardPeriodKey };