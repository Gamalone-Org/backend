import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const DEFAULT_KEY_LENGTH = 32;
const DEFAULT_SALT_BYTES = 16;
const DEFAULT_COST = 16384; // 2^14
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_PARALLELIZATION = 1;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const HASH_MARKER = 'scrypt';
const FORMAT_PARTS_LENGTH = 6;

export interface PasswordServiceOptions {
  keyLength?: number;
  saltBytes?: number;
  cost?: number;
  blockSize?: number;
  parallelization?: number;
}

type ScryptParams = {
  N: number;
  r: number;
  p: number;
  maxmem: number;
};

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  params: ScryptParams
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, params, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export class PasswordService {
  private readonly keyLength: number;
  private readonly saltBytes: number;
  private readonly cost: number;
  private readonly blockSize: number;
  private readonly parallelization: number;

  constructor(options: PasswordServiceOptions = {}) {
    this.keyLength = options.keyLength ?? DEFAULT_KEY_LENGTH;
    this.saltBytes = options.saltBytes ?? DEFAULT_SALT_BYTES;
    this.cost = options.cost ?? DEFAULT_COST;
    this.blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
    this.parallelization = options.parallelization ?? DEFAULT_PARALLELIZATION;
  }

  async hash(password: string): Promise<string> {
    const validated = this.validateForHash(password);
    const salt = randomBytes(this.saltBytes);
    const derived = await deriveKey(validated, salt, this.keyLength, {
      N: this.cost,
      r: this.blockSize,
      p: this.parallelization,
      maxmem: 128 * this.cost * this.blockSize * 2,
    });

    return [
      HASH_MARKER,
      this.cost,
      this.blockSize,
      this.parallelization,
      salt.toString('base64'),
      derived.toString('base64'),
    ].join('$');
  }

  async compare(password: string, encodedHash: string): Promise<boolean> {
    if (typeof password !== 'string' || password.length === 0) {
      throw new Error('Password cannot be empty');
    }

    const { cost, blockSize, parallelization, salt, derived } = this.decode(encodedHash);

    const candidate = await deriveKey(password, salt, this.keyLength, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 128 * cost * blockSize * 2,
    });

    if (candidate.length !== derived.length) {
      return false;
    }

    return timingSafeEqual(candidate, derived);
  }

  private validateForHash(password: string): string {
    if (typeof password !== 'string' || password.length === 0) {
      throw new Error('Password cannot be empty');
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
    }

    return password;
  }

  private decode(encodedHash: string): {
    cost: number;
    blockSize: number;
    parallelization: number;
    salt: Buffer;
    derived: Buffer;
  } {
    const parts = encodedHash.split('$');

    if (parts.length !== FORMAT_PARTS_LENGTH || parts[0] !== HASH_MARKER) {
      throw new Error('Invalid password hash');
    }

    const cost = Number(parts[1]);
    const blockSize = Number(parts[2]);
    const parallelization = Number(parts[3]);

    if (
      !Number.isInteger(cost) ||
      !Number.isInteger(blockSize) ||
      !Number.isInteger(parallelization) ||
      cost <= 0 ||
      blockSize <= 0 ||
      parallelization <= 0
    ) {
      throw new Error('Invalid password hash');
    }

    let salt: Buffer;
    let derived: Buffer;

    try {
      salt = Buffer.from(parts[4] ?? '', 'base64');
      derived = Buffer.from(parts[5] ?? '', 'base64');
    } catch {
      throw new Error('Invalid password hash');
    }

    if (salt.length === 0 || derived.length === 0) {
      throw new Error('Invalid password hash');
    }

    return { cost, blockSize, parallelization, salt, derived };
  }
}
