import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const cost = 16_384;
const blockSize = 8;
const parallelization = 1;

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: cost, r: blockSize, p: parallelization }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt:${cost}:${blockSize}:${parallelization}:${salt.toString('base64url')}:${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, storedCost, storedBlockSize, storedParallelization, salt, encodedKey] = storedHash.split(':');
  if (algorithm !== 'scrypt' || Number(storedCost) !== cost || Number(storedBlockSize) !== blockSize || Number(storedParallelization) !== parallelization || !salt || !encodedKey) {
    return false;
  }

  const expected = Buffer.from(encodedKey, 'base64url');
  if (expected.length !== keyLength) return false;

  const actual = await deriveKey(password, Buffer.from(salt, 'base64url'));
  return timingSafeEqual(actual, expected);
}
