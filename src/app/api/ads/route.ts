import { getStore } from "@netlify/blobs";
import { isAdmin, verifyFirebaseRequest } from "@/lib/server/firebase-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const imageStore = () => getStore({ name: "ad-images", consistency: "strong" });
const adStore = () => getStore({ name: "ads", consistency: "strong" });

// Ads and their images live in Netlify Blobs. Only the server writes them,
// after verifying the admin's Firebase sign-in, so no Firestore rules apply.
type AdDoc = { id: string; data: Record<string, unknown> };

async function listAds(): Promise<AdDoc[]> {
  const store = adStore();
  const { blobs } = await store.list();
  const ads = await Promise.all(blobs.map(async ({ key }) => {
    const data = await store.get(key, { type: "json" }) as Record<string, unknown> | null;
    return data ? { id: key, data } : null;
  }));
  return ads.filter((ad): ad is AdDoc => ad !== null);
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

function toPublicAd({ id, data }: AdDoc) {
  const imageKey = text(data.imageKey);
  return {
    id,
    title: text(data.title),
    description: text(data.description),
    linkUrl: text(data.linkUrl),
    imageUrl: imageKey ? `/api/ads/image/${encodeURIComponent(imageKey)}` : "",
  };
}

function safeLink(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const admin = isAdmin(await verifyFirebaseRequest(request));
  try {
    const rows = (await listAds())
      .filter((ad) => ad.data.active === true)
      .sort((a, b) => text(b.data.createdAt).localeCompare(text(a.data.createdAt)));
    return Response.json({ ads: rows.map(toPublicAd), admin }, { headers });
  } catch {
    return Response.json({ error: "Unable to load ads.", admin }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  if (!isAdmin(await verifyFirebaseRequest(request))) {
    return Response.json({ error: "Only the admin can add ads." }, { status: 403, headers });
  }
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid form data." }, { status: 400, headers });

  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  const description = String(form.get("description") ?? "").trim().slice(0, 300);
  const linkUrl = safeLink(String(form.get("linkUrl") ?? "").trim());
  const image = form.get("image");
  if (!title) return Response.json({ error: "Add a title for the ad." }, { status: 400, headers });
  if (linkUrl === null) return Response.json({ error: "The link must start with http:// or https://." }, { status: 400, headers });

  const hasImage = image instanceof File && image.size > 0;
  if (hasImage) {
    if (!IMAGE_TYPES.includes(image.type)) return Response.json({ error: "Use a PNG, JPG, WEBP or GIF image." }, { status: 400, headers });
    if (image.size > MAX_IMAGE_BYTES) return Response.json({ error: "Images must be 4 MB or smaller." }, { status: 400, headers });
  }

  const imageKey = hasImage ? crypto.randomUUID() : "";
  try {
    if (hasImage) await imageStore().set(imageKey, await image.arrayBuffer(), { metadata: { contentType: image.type } });
    const ad: AdDoc = {
      id: crypto.randomUUID(),
      data: { title, description, linkUrl, imageKey, active: true, createdAt: new Date().toISOString() },
    };
    await adStore().setJSON(ad.id, ad.data);
    return Response.json({ ad: toPublicAd(ad) }, { status: 201, headers });
  } catch (error) {
    console.error("Unable to save ad", error);
    if (imageKey) await imageStore().delete(imageKey).catch(() => {});
    return Response.json({ error: "Unable to save the ad." }, { status: 503, headers });
  }
}

export async function DELETE(request: Request) {
  if (!isAdmin(await verifyFirebaseRequest(request))) {
    return Response.json({ error: "Only the admin can remove ads." }, { status: 403, headers });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[\w-]{1,128}$/.test(id)) return Response.json({ error: "Invalid ad." }, { status: 400, headers });
  try {
    const data = await adStore().get(id, { type: "json" }) as Record<string, unknown> | null;
    if (data) await adStore().delete(id);
    const imageKey = text(data?.imageKey);
    if (imageKey) await imageStore().delete(imageKey).catch(() => {});
    return Response.json({ success: true }, { headers });
  } catch {
    return Response.json({ error: "Unable to remove the ad." }, { status: 503, headers });
  }
}
