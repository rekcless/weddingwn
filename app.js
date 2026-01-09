// ================= FIREBASE IMPORT =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  getFirestore, collection, addDoc,
  onSnapshot, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ================= CONFIG =================
const firebaseConfig = {
  apiKey: "AIzaSyA1hFfXW4Equz-kGkFJ4pM1joyy7DYPet0",
  authDomain: "mywapblog-7de53.firebaseapp.com",
  projectId: "mywapblog-7de53",
  storageBucket: "mywapblog-7de53.appspot.com",
  messagingSenderId: "1795132528",
  appId: "1:1795132528:web:920742ad86518d3ff438b5"
};

// ================= INIT =================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ================= DOM =================
const authPage = document.getElementById("authPage");
const dashboard = document.getElementById("dashboard");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const logoutBtn = document.getElementById("logoutBtn");

const addForm = document.getElementById("addForm");
const tableBody = document.getElementById("tableBody");

const totalHarianEl = document.getElementById("totalHarian");
const totalBulananEl = document.getElementById("totalBulanan");
const saldoTotalEl = document.getElementById("saldoTotal");

const rekapMasukEl = document.getElementById("rekapMasuk");
const rekapKeluarEl = document.getElementById("rekapKeluar");

const monthFilter = document.getElementById("monthFilter");
const judulRiwayat = document.getElementById("judulRiwayat");

const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const cancelEdit = document.getElementById("cancelEdit");

// ================= STATE =================
let unsubscribe = null;
let localData = [];
let selectedMonthKey = "all";
let editingId = null;
let chart = null;

// ================= HELPERS =================
function formatRp(num){
  return "Rp " + (Number(num) || 0).toLocaleString("id-ID");
}

function parseDate(ts){
  if (!ts) return new Date();
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

// ================= AUTH =================
loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  await signInWithEmailAndPassword(
    auth,
    loginForm.email.value,
    loginForm.password.value
  ).catch(err => alert(err.message));
});

registerForm.addEventListener("submit", async e => {
  e.preventDefault();
  await createUserWithEmailAndPassword(
    auth,
    registerForm.email.value,
    registerForm.password.value
  )
    .then(() => alert("Akun berhasil dibuat"))
    .catch(err => alert(err.message));
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  if (user) {
    authPage.classList.add("hidden");
    dashboard.classList.remove("hidden");
    startRealtime(user.uid);
  } else {
    dashboard.classList.add("hidden");
    authPage.classList.remove("hidden");
    if (unsubscribe) unsubscribe();
  }
});

// ================= REALTIME DATA =================
function startRealtime(uid){
  const q = query(
    collection(db, "users", uid, "records"),
    orderBy("tanggalUpload", "desc")
  );

  unsubscribe = onSnapshot(q, snap => {
    localData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateMonthFilter(localData);
    applyFilterAndRender();
  });
}

// ================= ADD =================
addForm.addEventListener("submit", async e => {
  e.preventDefault();
  const user = auth.currentUser;
  const kategori = addForm.kategori.value.trim();
  const jumlah = Number(addForm.jumlah.value);
  const tipe = addForm.tipe.value;

  if (!kategori || isNaN(jumlah)) return alert("Isi data dengan benar");

  await addDoc(collection(db, "users", user.uid, "records"), {
    kategori,
    jumlah,
    tipe,
    tanggalUpload: serverTimestamp()
  });

  addForm.reset();
});

// ================= FILTER =================
function populateMonthFilter(data){
  const set = new Set();
  data.forEach(d => {
    const dt = parseDate(d.tanggalUpload);
    set.add(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`);
  });

  monthFilter.innerHTML = `<option value="all">Semua Bulan</option>`;
  [...set].sort().reverse().forEach(k => {
    const [y,m] = k.split("-");
    const label = new Date(y, m-1).toLocaleString("id-ID",{month:"long",year:"numeric"});
    monthFilter.innerHTML += `<option value="${k}">${label}</option>`;
  });

  monthFilter.value = selectedMonthKey;
}

monthFilter.addEventListener("change", e => {
  selectedMonthKey = e.target.value;
  applyFilterAndRender();
});

// ================= APPLY FILTER =================
function applyFilterAndRender(){
  let filtered = localData.slice();

  if (selectedMonthKey !== "all") {
    filtered = filtered.filter(d => {
      const dt = parseDate(d.tanggalUpload);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
      return key === selectedMonthKey;
    });
  }

  renderTable(filtered);
  renderTotals(filtered);
  updateChart(filtered);
  updateJudul();
}

// ================= TABLE =================
function renderTable(data){
  tableBody.innerHTML = "";
  if (!data.length) {
    tableBody.innerHTML =
      `<tr><td colspan="4" style="text-align:center;color:#777">Tidak ada data</td></tr>`;
    return;
  }

  data.forEach(d => {
    tableBody.innerHTML += `
      <tr>
        <td>${d.kategori}</td>
        <td>${d.tipe === "masuk" ? "+" : "-"} ${formatRp(d.jumlah)}</td>
        <td>${parseDate(d.tanggalUpload).toLocaleString("id-ID")}</td>
        <td>
          <button class="btn outline" onclick="openEdit('${d.id}')">Edit</button>
          <button class="btn danger" onclick="hapus('${d.id}')">Hapus</button>
        </td>
      </tr>
    `;
  });
}

// ================= TOTALS & REKAP =================
function renderTotals(data){
  let saldo = 0, masuk = 0, keluar = 0;

  data.forEach(d => {
    if (d.tipe === "masuk") {
      saldo += d.jumlah;
      masuk += d.jumlah;
    } else {
      saldo -= d.jumlah;
      keluar += d.jumlah;
    }
  });

  saldoTotalEl.textContent = formatRp(saldo);
  totalBulananEl.textContent = formatRp(saldo);
  rekapMasukEl.textContent = formatRp(masuk);
  rekapKeluarEl.textContent = formatRp(keluar);

  saldoTotalEl.classList.toggle("saldo-minus", saldo < 0);
}

// ================= EDIT & DELETE =================
window.openEdit = id => {
  const d = localData.find(x => x.id === id);
  editingId = id;
  editForm.kategori.value = d.kategori;
  editForm.jumlah.value = d.jumlah;
  editForm.tipe.value = d.tipe;
  editModal.classList.remove("hidden");
};

cancelEdit.addEventListener("click", () => {
  editingId = null;
  editModal.classList.add("hidden");
});

editForm.addEventListener("submit", async e => {
  e.preventDefault();
  const user = auth.currentUser;
  await updateDoc(
    doc(db, "users", user.uid, "records", editingId),
    {
      kategori: editForm.kategori.value,
      jumlah: Number(editForm.jumlah.value),
      tipe: editForm.tipe.value
    }
  );
  editModal.classList.add("hidden");
});

window.hapus = async id => {
  if (!confirm("Hapus transaksi?")) return;
  const user = auth.currentUser;
  await deleteDoc(doc(db, "users", user.uid, "records", id));
};

// ================= JUDUL =================
function updateJudul(){
  judulRiwayat.textContent =
    selectedMonthKey === "all"
      ? "Riwayat Transaksi (Semua Bulan)"
      : `Riwayat Transaksi - ${monthFilter.options[monthFilter.selectedIndex].text}`;
}

// ================= CHART =================
function updateChart(data){
  if (!data.length) {
    if (chart) chart.destroy();
    return;
  }

  const map = {};
  data.reverse().forEach(d => {
    const key = parseDate(d.tanggalUpload).toLocaleDateString("id-ID");
    map[key] = (map[key] || 0) + (d.tipe === "masuk" ? d.jumlah : -d.jumlah);
  });

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("myChart"), {
    type: "bar",
    data: {
      labels: Object.keys(map),
      datasets: [{ data: Object.values(map), backgroundColor:"#4B8DE0" }]
    },
    options: { plugins:{legend:{display:false}} }
  });
}