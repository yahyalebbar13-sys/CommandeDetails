const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const firebaseConfig = {
  projectId: "studio-9506506653-9b525",
  appId: "1:949158596969:web:76008c3d4edf496806edf8",
  apiKey: "AIzaSyD6IfP8tC8KMsYg70yFFbVqwHrdgDtiqTg",
  authDomain: "studio-9506506653-9b525.firebaseapp.com",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
async function test() {
  await signInWithEmailAndPassword(auth, 'Lr2@GMAIL.COM', 'password123');
  console.log('user.email is:', auth.currentUser.email);
}
test().catch(console.error);
