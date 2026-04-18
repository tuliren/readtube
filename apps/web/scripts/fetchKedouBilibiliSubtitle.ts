import { program } from 'commander';
import crypto from 'crypto';

if (process.env.SCRIPT_ENV !== 'development') {
  console.error('This script can only be run in development environment.');
  process.exit(1);
}

const KEDOU_BASE_URL = 'https://www.kedou.life/api';
const KEDOU_AES_IV_BASE64 = 'a2Vkb3VAODk4OSE2MzIzMw==';
const KEDOU_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Content-Type': 'application/json',
  KdSystem: 'Kedou',
  Origin: 'https://www.kedou.life',
  Referer: 'https://www.kedou.life/caption/subtitle/bilibili',
};

interface AuthKeysResponse {
  code: number;
  message: string;
  data: { k1: string; k2: string };
}

interface SubtitleItem {
  lang: string;
  langDesc: string;
  content: string;
}

interface SubtitleExtractResponse {
  code: number;
  message: string;
  data?: {
    vid: string;
    host: string;
    hostAlias: string;
    title: string;
    status: string;
    subtitleItemVoList?: SubtitleItem[];
  };
}

function publicKeyPemFromBase64Der(base64Der: string): string {
  const lines = base64Der.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`;
}

// Raw RSA public operation (m = c^e mod n), returns zero-padded n-byte Buffer.
function rsaPublicOp(ciphertext: Buffer, publicKeyPem: string): Buffer {
  const keyObject = crypto.createPublicKey(publicKeyPem);
  const jwk = keyObject.export({ format: 'jwk' }) as { n: string; e: string };
  const n = BigInt('0x' + Buffer.from(jwk.n, 'base64url').toString('hex'));
  const e = BigInt('0x' + Buffer.from(jwk.e, 'base64url').toString('hex'));
  const c = BigInt('0x' + ciphertext.toString('hex'));
  const m = modPow(c, e, n);

  const modulusBytes = Buffer.from(jwk.n, 'base64url').length;
  let hex = m.toString(16);
  if (hex.length % 2 === 1) {
    hex = '0' + hex;
  }
  const out = Buffer.from(hex, 'hex');
  if (out.length >= modulusBytes) {
    return out;
  }
  return Buffer.concat([
    new Uint8Array(Buffer.alloc(modulusBytes - out.length, 0)),
    new Uint8Array(out),
  ]);
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  const zero = BigInt(0);
  const one = BigInt(1);
  let result = one;
  let b = base % mod;
  let e = exp;
  while (e > zero) {
    if ((e & one) === one) {
      result = (result * b) % mod;
    }
    e >>= one;
    b = (b * b) % mod;
  }
  return result;
}

// Strip PKCS#1 v1.5 padding (type 1 or type 2) and return the message as UTF-8.
function stripPkcs1Padding(paddedBuffer: Buffer): string {
  let i = 0;
  // Skip leading zero(s).
  while (i < paddedBuffer.length && paddedBuffer[i] === 0) {
    i++;
  }
  // Skip block type byte.
  i++;
  // Skip padding until the 0x00 separator.
  while (i < paddedBuffer.length && paddedBuffer[i] !== 0) {
    i++;
  }
  if (i >= paddedBuffer.length) {
    throw new Error('Invalid PKCS#1 padding: no separator found.');
  }
  // Skip the separator byte itself.
  i++;
  return paddedBuffer.subarray(i).toString('utf-8');
}

async function fetchAuthKeys(): Promise<{ publicKeyPem: string; aesKey: string }> {
  const res = await fetch(`${KEDOU_BASE_URL}/auth/keys`, {
    method: 'GET',
    headers: KEDOU_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch auth keys: HTTP ${res.status}`);
  }
  const json = (await res.json()) as AuthKeysResponse;
  if (json.code !== 200) {
    throw new Error(`Auth keys error: ${json.message}`);
  }
  const publicKeyPem = publicKeyPemFromBase64Der(json.data.k1);
  const k2Ciphertext = Buffer.from(json.data.k2, 'base64');
  const k2Padded = rsaPublicOp(k2Ciphertext, publicKeyPem);
  const aesKey = stripPkcs1Padding(k2Padded);
  return { publicKeyPem, aesKey };
}

function aesEncryptJson(payload: unknown, aesKeyUtf8: string): string {
  const keyBytes = Buffer.from(aesKeyUtf8, 'utf-8');
  const iv = Buffer.from(KEDOU_AES_IV_BASE64, 'base64');

  let algorithm: string;
  if (keyBytes.length === 16) {
    algorithm = 'aes-128-cbc';
  } else if (keyBytes.length === 24) {
    algorithm = 'aes-192-cbc';
  } else if (keyBytes.length === 32) {
    algorithm = 'aes-256-cbc';
  } else {
    throw new Error(`Unexpected AES key length: ${keyBytes.length} bytes.`);
  }

  const cipher = crypto.createCipheriv(algorithm, new Uint8Array(keyBytes), new Uint8Array(iv));
  const plaintext = new Uint8Array(Buffer.from(JSON.stringify(payload), 'utf-8'));
  const encrypted = Buffer.concat([
    new Uint8Array(cipher.update(plaintext)),
    new Uint8Array(cipher.final()),
  ]);
  return encrypted.toString('base64');
}

// Mirror jsencrypt's encryptLong: split into 117-byte chunks, PKCS#1 v1.5 encrypt each,
// concatenate the hex outputs, then return the final result as base64.
function rsaEncryptLong(message: string, publicKeyPem: string): string {
  const keyObject = crypto.createPublicKey(publicKeyPem);
  const jwk = keyObject.export({ format: 'jwk' }) as { n: string };
  const modulusBytes = Buffer.from(jwk.n, 'base64url').length;
  const chunkBytes = modulusBytes - 11;

  const messageBytes = Buffer.from(message, 'utf-8');
  const hexParts: string[] = [];
  for (let offset = 0; offset < messageBytes.length; offset += chunkBytes) {
    const chunk = new Uint8Array(messageBytes.subarray(offset, offset + chunkBytes));
    const encrypted = crypto.publicEncrypt(
      { key: keyObject, padding: crypto.constants.RSA_PKCS1_PADDING },
      chunk
    );
    hexParts.push(encrypted.toString('hex'));
  }
  return Buffer.from(hexParts.join(''), 'hex').toString('base64');
}

async function subtitleExtract(
  videoUrl: string,
  publicKeyPem: string,
  aesKey: string
): Promise<SubtitleExtractResponse> {
  const aesCiphertextBase64 = aesEncryptJson({ url: videoUrl }, aesKey);
  const encryptedBody = rsaEncryptLong(aesCiphertextBase64, publicKeyPem);

  const res = await fetch(`${KEDOU_BASE_URL}/video/subtitleExtract`, {
    method: 'POST',
    headers: KEDOU_HEADERS,
    body: encryptedBody,
  });
  if (!res.ok) {
    throw new Error(`Subtitle extract failed: HTTP ${res.status}`);
  }
  return (await res.json()) as SubtitleExtractResponse;
}

export async function fetchKedouBilibiliSubtitle(
  videoUrl: string
): Promise<SubtitleExtractResponse> {
  const { publicKeyPem, aesKey } = await fetchAuthKeys();
  return subtitleExtract(videoUrl, publicKeyPem, aesKey);
}

if (require.main === module) {
  (async () => {
    program.requiredOption('--url <value>', 'Bilibili video URL').parse(process.argv);
    const { url } = program.opts<{ url: string }>();

    const result = await fetchKedouBilibiliSubtitle(url);
    console.info(JSON.stringify(result, null, 2));
  })().catch((err) => {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  });
}
