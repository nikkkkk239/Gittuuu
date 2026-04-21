import { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export interface StoredDeployment {
  projectId: string;
  projectType: string;
  packageManager: string;
  status: "running" | "failed" | "stopped" | "building";
  url?: string;
  logsUrl?: string;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

function safeIsoString(value: unknown): string {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return new Date().toISOString();
}

export async function upsertUserProfile(user: User): Promise<void> {
  const userRef = doc(db, "users", user.uid);

  await setDoc(
    userRef,
    {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      providerId: user.providerData?.[0]?.providerId || "github.com",
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveUserDeployment(uid: string, deployment: StoredDeployment): Promise<void> {
  const deploymentRef = doc(db, "users", uid, "deployments", deployment.projectId);
  const nowIso = new Date().toISOString();

  await setDoc(
    deploymentRef,
    {
      ...deployment,
      createdAt: deployment.createdAt || nowIso,
      updatedAt: deployment.updatedAt || nowIso,
      createdAtServer: serverTimestamp(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getRecentUserDeployments(uid: string, maxEntries = 12): Promise<StoredDeployment[]> {
  const deploymentsRef = collection(db, "users", uid, "deployments");
  const q = query(deploymentsRef, orderBy("updatedAtServer", "desc"), limit(maxEntries));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((entry) => {
    const data = entry.data() as StoredDeployment & {
      createdAtServer?: unknown;
      updatedAtServer?: unknown;
    };

    return {
      projectId: data.projectId || entry.id,
      projectType: data.projectType || "unknown",
      packageManager: data.packageManager || "npm",
      status: data.status || "building",
      url: data.url,
      logsUrl: data.logsUrl,
      error: data.error,
      createdAt: safeIsoString(data.createdAtServer || data.createdAt),
      updatedAt: safeIsoString(data.updatedAtServer || data.updatedAt),
    };
  });
}

export async function deleteUserDeployment(uid: string, projectId: string): Promise<void> {
  const deploymentRef = doc(db, "users", uid, "deployments", projectId);
  await deleteDoc(deploymentRef);
}
