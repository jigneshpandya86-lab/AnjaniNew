// Use npm package imports (bundled by Vite) instead of CDN URLs
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyANmqfdu8rccsTrfTF_-m4D2aeRHRNaqsU",
  authDomain: "anjaniappnew.firebaseapp.com",
  projectId: "anjaniappnew",
  storageBucket: "anjaniappnew.firebasestorage.app",
  messagingSenderId: "892497799371",
  appId: "1:892497799371:web:5671e248e6c8f05d16934e"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
