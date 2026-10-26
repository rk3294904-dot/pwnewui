import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAA6Zm6_9iPp2QxwnQ8v9fKi8GGlhUv-dA",
  authDomain: "quanticalearning.firebaseapp.com",
  projectId: "quanticalearning",
  storageBucket: "quanticalearning.firebasestorage.app",
  messagingSenderId: "585277606664",
  appId: "1:585277606664:web:a651c6249390c68d553abd",
  measurementId: "G-SK7V5YMHPD",
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
export const firebaseDb = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle() {
  try {
    await signInWithPopup(firebaseAuth, googleProvider);
  } catch (reason: unknown) {
    const code = (reason as { code?: string }).code;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(firebaseAuth, googleProvider);
      return;
    }
    throw reason;
  }
}

export function finishGoogleRedirect() {
  return getRedirectResult(firebaseAuth);
}

export function signOutUser() {
  return signOut(firebaseAuth);
}

export async function enrollInBatch({
  userId,
  batch,
}: {
  userId: string;
  batch: { id: string; name: string; image?: string; byName?: string };
}) {
  await setDoc(
    doc(firebaseDb, "users", userId, "enrollments", batch.id),
    {
      batchId: batch.id,
      batchName: batch.name,
      batchImage: batch.image ?? "",
      byName: batch.byName ?? "",
      enrolledAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getEnrolledBatchIds(userId: string): Promise<string[]> {
  await firebaseAuth.authStateReady();
  const snapshot = await getDocs(collection(firebaseDb, "users", userId, "enrollments"));
  return snapshot.docs.map((item) => item.id);
}

export async function recordLectureProgress({
  userId,
  userName,
  photoURL,
  batchId,
  contentId,
  seconds,
}: {
  userId: string;
  userName: string;
  photoURL?: string | null;
  batchId: string;
  contentId: string;
  seconds: number;
}) {
  await setDoc(
    doc(firebaseDb, "leaderboard", userId),
    {
      userId,
      displayName: userName || "Learner",
      photoURL: photoURL ?? "",
      points: increment(1),
      lastBatchId: batchId,
      lastContentId: contentId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// Public leaderboard profile only: never store email addresses or tokens.
export async function registerLeaderboardUser(user = firebaseAuth.currentUser) {
  if (!user) return;
  await setDoc(doc(firebaseDb, "leaderboardUsers", user.uid), {
    displayName: (user.displayName || "Learner").slice(0, 200),
    photoURL: user.photoURL?.startsWith("https://") ? user.photoURL.slice(0, 2048) : "",
    updatedAt: serverTimestamp(),
  });
}

type LeaderboardDoc = { id: string; data: Record<string, unknown> };

// Converts Firestore REST typed values ({ stringValue }, { integerValue }, ...) to plain values.
function fromRestValue(value: Record<string, unknown>): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    const values = (value.arrayValue as { values?: Record<string, unknown>[] }).values ?? [];
    return values.map(fromRestValue);
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timed out")), ms)),
  ]);
}

async function readPublicDocsFromSdk(name: string): Promise<LeaderboardDoc[]> {
  const snapshot = await withTimeout(getDocs(collection(firebaseDb, name)), 10000);
  return snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
}

// The leaderboard collections are publicly readable, so the REST API is a reliable
// fallback when the SDK's realtime channel is blocked by the network or an extension.
async function readPublicDocsFromRest(name: string): Promise<LeaderboardDoc[]> {
  const docs: LeaderboardDoc[] = [];
  let pageToken = "";
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${name}`);
    url.searchParams.set("pageSize", "300");
    url.searchParams.set("key", firebaseConfig.apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load Firestore ${name}`);
    const page = await response.json() as {
      documents?: { name: string; fields?: Record<string, Record<string, unknown>> }[];
      nextPageToken?: string;
    };
    for (const item of page.documents ?? []) {
      const data = Object.fromEntries(Object.entries(item.fields ?? {}).map(([key, value]) => [key, fromRestValue(value)]));
      docs.push({ id: item.name.split("/").pop()!, data });
    }
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return docs;
}

async function readPublicDocs(name: string) {
  try {
    return await readPublicDocsFromSdk(name);
  } catch {
    return readPublicDocsFromRest(name);
  }
}

async function readRegisteredUsers() {
  const docs = await readPublicDocs("leaderboardUsers");
  return docs.map(({ id, data }) => ({
    id,
    displayName: typeof data.displayName === "string" ? data.displayName : "Learner",
    photoURL: typeof data.photoURL === "string" ? data.photoURL : "",
  }));
}

export async function getLeaderboard() {
  await firebaseAuth.authStateReady();
  // Ensure the current learner is visible even on their very first visit, but
  // never let a registration failure hide the rest of the leaderboard.
  await registerLeaderboardUser().catch(() => {});
  const [docsResult, usersResult] = await Promise.allSettled([readPublicDocs("leaderboard"), readRegisteredUsers()]);
  // Each source is optional; only fail when neither could be loaded.
  if (docsResult.status === "rejected" && usersResult.status === "rejected") {
    throw new Error("Unable to load leaderboard");
  }
  const docs = docsResult.status === "fulfilled" ? docsResult.value : [];
  const users = usersResult.status === "fulfilled" ? usersResult.value : [];
  const entries = new Map(users.map((user) => [user.id, {
    ...user,
    points: 0,
    legacy: true,
    lectureMinutesWatched: 0,
    pdfsOpened: 0,
    hasMinutes: false,
    hasPdfs: false,
  }]));
  for (const { id, data } of docs) {
    const profile = entries.get(id);
    entries.set(id, {
      id,
      points: typeof data.points === "number" && Number.isFinite(data.points) ? Math.max(0, data.points) : 0,
      displayName: profile?.displayName || (typeof data.displayName === "string" && data.displayName ? data.displayName : "Learner"),
      photoURL: profile?.photoURL || (typeof data.photoURL === "string" ? data.photoURL : ""),
      legacy: true,
      lectureMinutesWatched: 0,
      pdfsOpened: 0,
      hasMinutes: false,
      hasPdfs: false,
    });
  }
  return [...entries.values()]
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
