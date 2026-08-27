import { describe, expect, it } from 'vitest';
import { PasswordService } from '../../src/modules/auth/services/PasswordService';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces a hash in the expected format and round-trips', async () => {
    const hash = await service.hash('S3cretPassword!');

    const parts = hash.split('$');
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toBe('16384');
    expect(parts[2]).toBe('8');
    expect(parts[3]).toBe('1');
    expect(parts[4]).not.toBe('');
    expect(parts[5]).not.toBe('');

    await expect(service.compare('S3cretPassword!', hash)).resolves.toBe(true);
  });

  it('returns false for the wrong password', async () => {
    const hash = await service.hash('S3cretPassword!');
    await expect(service.compare('wrong-password', hash)).resolves.toBe(false);
  });

  it('uses a random salt so identical passwords hash differently', async () => {
    const first = await service.hash('S3cretPassword!');
    const second = await service.hash('S3cretPassword!');
    expect(first).not.toBe(second);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await expect(service.hash('short')).rejects.toThrow('at least 8');
  });

  it('rejects empty passwords', async () => {
    await expect(service.hash('')).rejects.toThrow('Password cannot be empty');
    await expect(service.compare('', 'scrypt$16384$8$1$c2FsdA==$aGFzaA==')).rejects.toThrow(
      'Password cannot be empty'
    );
  });

  it('rejects passwords longer than 128 characters', async () => {
    const tooLong = 'a'.repeat(129);
    await expect(service.hash(tooLong)).rejects.toThrow('at most 128');
  });

  it('throws on malformed hashes', async () => {
    await expect(service.compare('S3cretPassword!', 'not-a-valid-hash')).rejects.toThrow(
      'Invalid password hash'
    );
    await expect(
      service.compare('S3cretPassword!', 'scrypt$0$8$1$c2FsdA==$aGFzaA==')
    ).rejects.toThrow('Invalid password hash');
    await expect(service.compare('S3cretPassword!', 'scrypt$16384$8$1$$')).rejects.toThrow(
      'Invalid password hash'
    );
  });

  it('honours custom scrypt options', async () => {
    const custom = new PasswordService({
      cost: 32768,
      blockSize: 16,
      saltBytes: 32,
      keyLength: 64,
    });
    const hash = await custom.hash('S3cretPassword!');
    const parts = hash.split('$');
    expect(parts[1]).toBe('32768');
    expect(parts[2]).toBe('16');

    await expect(custom.compare('S3cretPassword!', hash)).resolves.toBe(true);
  });
});
