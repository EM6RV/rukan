import { AwsClient } from "aws4fetch";
import { getEnv } from "@/lib/env";
import type { StorageAdapter } from "./types";

function client() {
  const env = getEnv();
  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`;
  return { aws, base };
}

// Cloudflare R2 عبر واجهة S3 (SigV4). المفتاح: media/<id>.webp
export const r2Storage: StorageAdapter = {
  driver: "r2",
  async put({ id, buffer, mime }) {
    const { aws, base } = client();
    const objectKey = `media/${id}.webp`;
    const res = await aws.fetch(`${base}/${objectKey}`, {
      method: "PUT",
      body: new Uint8Array(buffer),
      headers: { "content-type": mime, "cache-control": "public, max-age=31536000, immutable" },
    });
    if (!res.ok) throw new Error(`فشل رفع الصورة لـ R2 (${res.status})`);
    return { data: null, objectKey };
  },
  async get(row) {
    if (!row.objectKey) return null;
    const { aws, base } = client();
    const res = await aws.fetch(`${base}/${row.objectKey}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  },
  async delete(row) {
    if (!row.objectKey) return;
    const { aws, base } = client();
    await aws.fetch(`${base}/${row.objectKey}`, { method: "DELETE" });
  },
};
