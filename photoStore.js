// photoStore.js
// Private Cloudflare R2 bucket. The app never hands out a public file address;
// callers pass an object name they already checked against the signed-in user.
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export function photosConfigured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

let client;

function r2() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return client;
}

function bucket() {
  return process.env.R2_BUCKET;
}

export async function putPhotoObject(key, body) {
  await r2().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: 'image/jpeg',
  }));
}

export async function readPhotoObject(key) {
  const result = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function deletePhotoObject(key) {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
