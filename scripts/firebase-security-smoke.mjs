import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, deleteDoc, terminate } from "firebase/firestore";

const projectId = "demo-bbcafe-security";
// Refuse non-loopback hosts before initializing any SDK; never fall back to production.
function emulator(name) {
  const value = process.env[name];
  assert.match(value ?? "", /^(127\.0\.0\.1|localhost):[0-9]+$/, `${name} must be a loopback emulator`);
  const [host, port] = value.split(":");
  assert.ok(Number(port) > 0 && Number(port) <= 65535);
  return { host, port: Number(port) };
}
const authAddress = emulator("FIREBASE_AUTH_EMULATOR_HOST");
const firestoreAddress = emulator("FIRESTORE_EMULATOR_HOST");
const watchdog = setTimeout(() => { console.error("Firebase smoke timed out"); process.exit(1); }, 90000);
const id = randomUUID();
const admin = initializeAdmin({ projectId }, `ci-admin-${id}`);
const app = initializeApp({ projectId, apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com` }, `ci-web-${id}`);
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${authAddress.host}:${authAddress.port}`, { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, firestoreAddress.host, firestoreAddress.port);
const adminDb = getAdminFirestore(admin);
const adminRef = adminDb.doc(`ciSmoke/admin-${id}`);
const webRef = doc(db, "ciSmoke", `web-${id}`);
const email = `ci-${id}@example.invalid`, password = `CI-${randomUUID()}!`;
try {
  await createUserWithEmailAndPassword(auth, email, password);
  await signOut(auth);
  const login = await signInWithEmailAndPassword(auth, email, password);
  const token = await login.user.getIdToken();
  const verified = await getAdminAuth(admin).verifyIdToken(token);
  assert.equal(verified.uid, login.user.uid);
  await adminRef.set({ source: "admin", id });
  assert.equal((await adminRef.get()).data().id, id);
  // In Node, Web Firestore's gRPC transport exercises the overridden dependency.
  await setDoc(webRef, { source: "web", id });
  assert.equal((await getDoc(webRef)).data().id, id);
  assert.equal((await adminDb.doc(webRef.path).get()).data().source, "web");
  await deleteDoc(webRef);
  assert.equal((await getDoc(webRef)).exists(), false);
  await adminRef.delete();
  assert.equal((await adminRef.get()).exists, false);
  await deleteUser(login.user);
  console.log("PASS: Auth create/sign-in/token verification; Admin and Web Firestore write/read/delete");
} finally {
  await Promise.allSettled([adminRef.delete(), deleteDoc(webRef)]);
  if (auth.currentUser) await deleteUser(auth.currentUser);
  await terminate(db);
  await adminDb.terminate();
  await deleteApp(app);
  await deleteAdmin(admin);
  clearTimeout(watchdog);
}
