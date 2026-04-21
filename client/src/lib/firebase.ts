
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GithubAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAnpGEt8zs38CR9mPpbh_R1Q469MlGoAS4",
  authDomain: "gittu-3be00.firebaseapp.com",
  projectId: "gittu-3be00",
  appId: "1:209228957593:web:7e4d7b57a3418b2d8e7508",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GithubAuthProvider();
provider.addScope("repo");

export { auth, db, provider, signInWithPopup, onAuthStateChanged, signOut ,getAuth};
