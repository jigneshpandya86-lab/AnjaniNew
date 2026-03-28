import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

window.testFirebase = async function() {
  try {
    document.getElementById("status").innerText = "Connecting...";
    
    // Try writing a test document
    await addDoc(collection(db, "test"), {
      message: "Firebase connected!",
      time: new Date().toISOString()
    });

    document.getElementById("status").innerText = "✅ Firebase Connected!";
  } catch (error) {
    document.getElementById("status").innerText = "❌ Error: " + error.message;
  }
}
