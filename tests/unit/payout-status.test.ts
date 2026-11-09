import { describe, expect, it } from 'vitest';
import {
  mapRemotePayoutStatus,
  RETRYABLE_PAYOUT_STATUSES,
  TERMINAL_PAYOUT_STATUSES,
} from '../../src/modules/payouts/payout.status.js';

describe('mapRemotePayoutStatus', () => {
  it.each([
    ['sent', 'VERSE'],
    ['successful', 'VERSE'],
    ['succeeded', 'VERSE'],
    ['approved', 'VERSE'],
    ['SENT', 'VERSE'],
  ])('maps %s to VERSE', (input, expected) => {
    expect(mapRemotePayoutStatus(input)).toBe(expected);
  });

  it.each(['failed', 'declined', 'canceled', 'cancelled', 'rejected'])(
    'maps %s to ECHOUE',
    (status) => {
      expect(mapRemotePayoutStatus(status)).toBe('ECHOUE');
    }
  );

  it.each(['pending', 'started', 'processing', 'scheduled'])('maps %s to EN_TRAITEMENT', (status) => {
    expect(mapRemotePayoutStatus(status)).toBe('EN_TRAITEMENT');
  });

  it('never treats an unknown, empty or missing status as a success', () => {
    expect(mapRemotePayoutStatus('weird')).toBe('RECONCILIATION_REQUISE');
    expect(mapRemotePayoutStatus('')).toBe('RECONCILIATION_REQUISE');
    expect(mapRemotePayoutStatus(null)).toBe('RECONCILIATION_REQUISE');
    expect(mapRemotePayoutStatus(undefined)).toBe('RECONCILIATION_REQUISE');
  });

  it('exposes only ECHOUE as retryable and VERSE as terminal', () => {
    expect(RETRYABLE_PAYOUT_STATUSES).toEqual(['ECHOUE']);
    expect(TERMINAL_PAYOUT_STATUSES).toEqual(['VERSE']);
  });
});
