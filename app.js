
/* GESTION DE STOCK — Frontend sans serveur
   Cloud par défaut : Firestore (FIREBASE_CONFIG requis). Fallback auto -> Local si init Firebase échoue.
   - Auth simple (admin/admin ; demo/demo) stockée dans la base (Firestore ou locale).
   - Agencies & roles
   - Catalogue, seuils (global & par taille), réassort XLSX
   - Mouvements in/out/transfer, purge (admin), exports JSON/XLSX
   - Stats (période, valorisation)
   - Recherche code-barres & scan caméra
*/
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- Storage Providers ----------
const DB_KEYS = {
  users: "users",
  agencies: "agencies",
  products: "products",
  stock: "stock",
  movements: "movements"
};

let Store = null;

function createLocalStore(){
  return {
    async init(){
      localforage.config({ name: "artemis-stock" });
      if (!await localforage.getItem(DB_KEYS.users)){
        await this.seed();
      }
    },
    async seed(){
      await localforage.setItem(DB_KEYS.users, [
        { user:"admin", pass:"admin", role:"admin", agency:"IDF" },
        { user:"demo", pass:"demo", role:"agence", agency:"IDF" },
      ]);
      await localforage.setItem(DB_KEYS.agencies, DEFAULT_AGENCIES);
      await localforage.setItem(DB_KEYS.products, []);
      await localforage.setItem(DB_KEYS.stock, {});
      await localforage.setItem(DB_KEYS.movements, []);
    },
    async get(key){ return await localforage.getItem(key); },
    async set(key,val){ return await localforage.setItem(key,val); },
  };
}

function createFirestoreStore(){
  const app = firebase.initializeApp(FIREBASE_CONFIG);
  const db = firebase.firestore();
  const root = db.collection("artemis-stock").doc("v1"); // single doc container

  return {
    async init(){
      const snap = await root.get();
      if (!snap.exists){
        await this.seed();
      }
    },
    async seed(){
      await root.set({
        [DB_KEYS.users]: [
          { user:"admin", pass:"admin", role:"admin", agency:"IDF" },
          { user:"demo", pass:"demo", role:"agence", agency:"IDF" },
        ],
        [DB_KEYS.agencies]: DEFAULT_AGENCIES,
        [DB_KEYS.products]: [],
        [DB_KEYS.stock]: {},
        [DB_KEYS.movements]: []
      }, { merge:true });
    },
    async get(key){
      const snap = await root.get();
      const data = snap.data() || {};
      return data[key];
    },
    async set(key,val){
      await root.set({ [key]: val }, { merge:true });
      return val;
    },
  };
}

// Try to init the requested provider, fallback to local on error
async function initStore(){
  if (STORAGE_PROVIDER === "firebase"){
    try{
      if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.projectId){
        throw new Error("FIREBASE_CONFIG manquant");
      }
      Store = createFirestoreStore();
      await Store.init();
      console.log("Cloud Firestore actif");
      return;
    }catch(e){
      console.warn("Init Firestore impossible, bascule en local:", e.message);
    }
  }
  // fallback
  Store = createLocalStore();
  await Store.init();
  console.log("Stockage local actif");
}

// ---------- Auth ----------
let session = { user:null, role:null, agency:null };

async function login(user, pass){
  const users = await Store.get(DB_KEYS.users) || [];
  const found = users.find(u => u.user === user && u.pass === pass);
  if (!found) return false;
  session.user = found.user;
  session.role = found.role;
  session.agency = found.agency || DEFAULT_AGENCIES[0];
  return true;
}
function logout(){ session = { user:null, role:null, agency:null }; }

// ---------- Data helpers ----------
async function ensureStockAgency(agency){
  const stock = await Store.get(DB_KEYS.stock) || {};
  if (!stock[agency]) { stock[agency] = {}; await Store.set(DB_KEYS.stock, stock); }
}
async function getProductByRef(ref){
  const products = await Store.get(DB_KEYS.products) || [];
  return products.find(p => p.ref === ref) || null;
}
function computeUnderThresholdForAgency(products, stockAgency){
  let n = 0;
  for (const p of products){
    const st = stockAgency[p.ref] || { total:0, sizes:{} };
    const under = isUnderThreshold(p, st);
    if (under) n++;
  }
  return n;
}
function isUnderThreshold(product, st){
  const minGlobal = Number(product.minGlobal||0);
  if (minGlobal && (st.total||0) < minGlobal) return true;
  if (product.minBySize){
    for (const sz of Object.keys(product.minBySize)){
      const m = Number(product.minBySize[sz]||0);
      if (m>0 && (st.sizes?.[sz]||0) < m) return true;
    }
  }
  return false;
}
function money(n){ return (n||0).toLocaleString('fr-FR', {style:'currency', currency:'EUR'}); }

// ---------- UI Setup ----------
const tabs = [
  { id:"dashboard", label:"Catalogue" },
  { id:"produit", label:"Fiche produit" },
  { id:"mouvements", label:"Mouvements" },
  { id:"stats", label:"Stats" },
  { id:"admin", label:"Admin", admin:true }
];

function renderTabs(){
  const cont = $("#mainTabs");
  cont.innerHTML = "";
  for (const t of tabs){
    if (t.admin && session.role !== "admin") continue;
    const b = document.createElement("button");
    b.textContent = t.label;
    b.dataset.tab = t.id;
    b.className = "ghost";
    b.addEventListener("click", ()=>switchTab(t.id));
    cont.appendChild(b);
  }
}

function switchTab(id){
  $$(".tab").forEach(el=>el.classList.add("hidden"));
  $$(".tabs button").forEach(el=>el.classList.remove("active"));
  $(`#tab-${id}`).classList.remove("hidden");
  const btn = $(`.tabs button[data-tab='${id}']`);
  if (btn) btn.classList.add("active");
  if (id === "dashboard") loadCatalogue();
  if (id === "mouvements") loadMovements();
  if (id === "stats") prepareStats();
  if (id === "admin") loadAdmin();
}

// ---------- Login View ----------
$("#btnLogin").addEventListener("click", async ()=>{
  const u = $("#loginUser").value.trim();
  const p = $("#loginPass").value.trim();
  const ok = await login(u,p);
  if (!ok) { alert("Identifiants invalides."); return; }
  afterLogin();
});
function afterLogin(){
  $("#loginView").classList.add("hidden");
  $("#appHeader").classList.remove("hidden");
  $("#appView").classList.remove("hidden");
  $("#appTitle").textContent = APP_TITLE;
  $("#badgeAgency").textContent = session.agency;
  $("#badgeRole").textContent = session.role;
  $("#btnSwitchAgency").classList.toggle("hidden", session.role !== "admin");
  renderTabs();
  switchTab("dashboard");
}
$("#btnLogout").addEventListener("click", ()=>{ logout(); location.reload(); });
$("#btnSwitchAgency").addEventListener("click", async ()=>{
  if (session.role !== "admin") return;
  const ags = await Store.get(DB_KEYS.agencies) || [];
  const pick = prompt("Basculer vers l'agence :", ags.join(", "));
  if (!pick || !ags.includes(pick)) return;
  session.agency = pick;
  $("#badgeAgency").textContent = pick;
  switchTab("dashboard");
});

// ---------- Catalogue ----------
async function loadCatalogue(){
  await ensureStockAgency(session.agency);
  const products = await Store.get(DB_KEYS.products) || [];
  const stock = await Store.get(DB_KEYS.stock) || {};
  const stA = stock[session.agency] || {};
  // Fill filters
  const catSel = $("#filterCategory"); catSel.innerHTML = "<option value=''>Toutes</option>";
  CATEGORIES.forEach(c=>{ const o=document.createElement("option"); o.value=c; o.textContent=c; catSel.appendChild(o); });
  // Quick counters
  $("#kpiTotalItems").textContent = products.length;
  let valo = 0;
  for (const p of products){ const q = (stA[p.ref]?.total)||0; valo += q * Number(p.price||0); }
  $("#kpiValo").textContent = money(valo);
  const under = computeUnderThresholdForAgency(products, stA);
  $("#kpiUnder").textContent = under;
  $("#badgeLow").textContent = `${under} sous seuil`;
  // Render table
  const q = $("#quickSearch").value.toLowerCase();
  const fcat = catSel.value;
  const reass = $("#filterReassort").value === "1";
  const tbody = $("#tblCatalogue tbody");
  tbody.innerHTML = "";
  for (const p of products){
    if (fcat && p.category !== fcat) continue;
    const st = stA[p.ref] || { total:0, sizes:{} };
    const fields = [p.ref, p.name, p.category, (p.barcode||""), (p.affectation||"")].join(" ").toLowerCase();
    const isUnder = isUnderThreshold(p, st);
    if (reass && !isUnder) continue;
    if (q && !fields.includes(q)) continue;
    const tr = document.createElement("tr");
    if (isUnder) tr.classList.add(st.total>0 ? "qty-warn" : "qty-alert");
    tr.innerHTML = `
      <td>${p.ref}</td>
      <td>${p.name}</td>
      <td>${p.category}</td>
      <td>${money(p.price)}</td>
      <td>${st.total||0}</td>
      <td>${p.minGlobal||""}</td>
      <td>${p.barcode||""}</td>
      <td>${p.affectation||""}</td>
      <td><button class="ghost" data-open="${p.ref}">Ouvrir</button></td>
    `;
    tbody.appendChild(tr);
  }
  $$("button[data-open]").forEach(b=>b.onclick = ()=> openProduct(b.dataset.open));
}
$("#quickSearch").addEventListener("input", loadCatalogue);
$("#filterCategory").addEventListener("change", loadCatalogue);
$("#filterReassort").addEventListener("change", loadCatalogue);

// QR scan
let qrScanner = null;
$("#btnScan").addEventListener("click", ()=>{
  const region = $("#qrRegion"); region.classList.toggle("hidden");
  if (!qrScanner){
    qrScanner = new Html5Qrcode("qrRegion");
    Html5Qrcode.getCameras().then(cams=>{
      const id = cams?.[0]?.id;
      if (!id) return;
      qrScanner.start(
        id,
        { fps: 10, qrbox: 250 },
        (decoded)=>{
          $("#quickSearch").value = decoded;
          loadCatalogue();
          setTimeout(()=>{ qrScanner.stop(); region.classList.add("hidden"); }, 800);
        },
        (err)=>{ /* ignore */ }
      );
    });
  } else {
    qrScanner.stop(); qrScanner = null; region.innerHTML=""; region.classList.add("hidden");
  }
});

// ---------- Fiche produit ----------
function buildSizesInputs(){
  const wrap = $("#sizesWrap"); wrap.innerHTML = "";
  for (const s of SIZES){
    const div = document.createElement("div");
    div.innerHTML = `<label>${s} seuil</label><input type="number" min="0" step="1" data-minsize="${s}" placeholder="0">`;
    wrap.appendChild(div);
  }
}
$("#pSizesToggle").addEventListener("change", ()=>{
  $("#sizesWrap").classList.toggle("hidden", !$("#pSizesToggle").checked);
});
$("#btnNewProduct").addEventListener("click", ()=>{
  openProduct(null);
});
function openProduct(ref){
  $("#formTitle").textContent = ref ? `Article ${ref}` : "Nouvel article";
  const cat = $("#pCategory"); cat.innerHTML = CATEGORIES.map(c=>`<option>${c}</option>`).join("");
  buildSizesInputs();
  $("#btnDeleteProduct").classList.toggle("hidden", !ref);
  if (!ref){
    $("#pRef").value = ""; $("#pName").value=""; $("#pPrice").value=""; $("#pVendor").value="";
    $("#pBarcode").value=""; $("#pAffectation").value=""; $("#pMinGlobal").value="";
    $("#pSizesToggle").checked=false; $("#sizesWrap").classList.add("hidden");
    switchTab("produit"); return;
  }
  (async ()=>{
    const p = await getProductByRef(ref); if (!p) return;
    $("#pRef").value = p.ref; $("#pName").value=p.name; $("#pCategory").value=p.category;
    $("#pPrice").value=p.price||""; $("#pVendor").value=p.vendor||"";
    $("#pBarcode").value=p.barcode||""; $("#pAffectation").value=p.affectation||"";
    $("#pMinGlobal").value=p.minGlobal||"";
    if (p.minBySize){ $("#pSizesToggle").checked=true; $("#sizesWrap").classList.remove("hidden");
      for (const s of Object.keys(p.minBySize)){ const inp = $(`[data-minsize='${s}']`); if (inp) inp.value=p.minBySize[s]; }
    } else { $("#pSizesToggle").checked=false; $("#sizesWrap").classList.add("hidden"); }
    switchTab("produit");
  })();
}
$("#btnSaveProduct").addEventListener("click", async ()=>{
  const ref = $("#pRef").value.trim(); if (!ref) return alert("Référence requise");
  const products = await Store.get(DB_KEYS.products) || [];
  const existing = products.findIndex(x=>x.ref===ref);
  const p = {
    ref,
    name: $("#pName").value.trim(),
    category: $("#pCategory").value,
    price: Number($("#pPrice").value||0),
    vendor: $("#pVendor").value.trim(),
    barcode: $("#pBarcode").value.trim(),
    affectation: $("#pAffectation").value.trim(),
    minGlobal: Number($("#pMinGlobal").value||0),
  };
  if ($("#pSizesToggle").checked){
    p.minBySize = {};
    $$("[data-minsize]").forEach(inp=>{ const n = Number(inp.value||0); if (n>0) p.minBySize[inp.dataset.minsize]=n; });
  } else { delete p.minBySize; }
  if (existing>=0) products[existing] = p; else products.push(p);
  await Store.set(DB_KEYS.products, products);
  alert("Enregistré.");
  switchTab("dashboard");
  loadCatalogue();
});
$("#btnDeleteProduct").addEventListener("click", async ()=>{
  if (!confirm("Supprimer cet article ?")) return;
  const ref = $("#pRef").value.trim(); if (!ref) return;
  const products = await Store.get(DB_KEYS.products) || [];
  await Store.set(DB_KEYS.products, products.filter(x=>x.ref!==ref));
  alert("Supprimé."); switchTab("dashboard"); loadCatalogue();
});

// ---------- Mouvements ----------
function prepareMv(){
  const sel = $("#mvSize"); sel.innerHTML = "<option value=''>—</option>" + SIZES.map(s=>`<option>${s}</option>`).join("");
}
prepareMv();
$("#mvType").addEventListener("change", ()=>{
  $("#mvToAgency").classList.toggle("hidden", $("#mvType").value!=="transfer");
});
async function loadMovements(){
  await ensureStockAgency(session.agency);
  const mv = await Store.get(DB_KEYS.movements) || [];
  const tbody = $("#tblMv tbody"); tbody.innerHTML = "";
  const q = ($("#histSearch").value||"").toLowerCase();
  for (const m of mv.slice().reverse()){
    if (m.agency !== session.agency && session.role!=="admin") continue;
    const line = [m.type, m.agency, m.ref, m.size||"", m.note||"", String(m.qty)].join(" ").toLowerCase();
    if (q && !line.includes(q)) continue;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${m.date}</td><td>${m.type}</td><td>${m.agency}</td><td>${m.ref}</td><td>${m.size||""}</td><td>${m.qty}</td><td>${m.toAgency||""}</td><td>${m.note||""}</td>`;
    tbody.appendChild(tr);
  }
  const agSel = $("#mvToAgency"); agSel.innerHTML = "";
  const ags = await Store.get(DB_KEYS.agencies) || [];
  ags.forEach(a=>{ const o=document.createElement("option"); o.text=a; agSel.add(o); });
  $$(".admin-only").forEach(el=>el.classList.toggle("hidden", session.role!=="admin"));
}
$("#histSearch").addEventListener("input", loadMovements);

$("#btnAddMv").addEventListener("click", async ()=>{
  const type = $("#mvType").value;
  const ref = $("#mvRef").value.trim(); if (!ref) return alert("Référence requise");
  const qty = Number($("#mvQty").value||0); if (qty<=0) return alert("Quantité invalide");
  const size = $("#mvSize").value||null;
  const note = $("#mvNote").value.trim();
  const toAgency = $("#mvToAgency").value;
  const prod = await getProductByRef(ref); if (!prod) return alert("Produit introuvable");
  const stock = await Store.get(DB_KEYS.stock) || {};
  await ensureStockAgency(session.agency);
  const stA = stock[session.agency] || {};
  stA[ref] = stA[ref] || { total:0, sizes:{} };
  function addQty(obj, delta){
    obj.total = (obj.total||0) + delta;
    if (size){ obj.sizes[size] = (obj.sizes[size]||0) + delta; }
  }
  if (type==="in"){
    addQty(stA[ref], qty);
  } else if (type==="out"){
    addQty(stA[ref], -qty);
    if (stA[ref].total<0) stA[ref].total=0;
    if (size && stA[ref].sizes[size]<0) stA[ref].sizes[size]=0;
  } else if (type==="transfer"){
    if (!toAgency) return alert("Choisir l'agence de destination.");
    addQty(stA[ref], -qty);
    stock[toAgency] = stock[toAgency] || {};
    stock[toAgency][ref] = stock[toAgency][ref] || { total:0, sizes:{} };
    function addTo(obj){ obj.total=(obj.total||0)+qty; if (size){ obj.sizes[size]=(obj.sizes[size)||0)+qty; } }
    addTo(stock[toAgency][ref]);
  }
  stock[session.agency] = stA;
  await Store.set(DB_KEYS.stock, stock);
  const movements = await Store.get(DB_KEYS.movements) || [];
  movements.push({
    date: new Date().toISOString().slice(0,19).replace('T',' '),
    type, agency: session.agency, ref, size, qty, toAgency: type==="transfer"?toAgency:"", note
  });
  await Store.set(DB_KEYS.movements, movements);
  $("#mvRef").value=""; $("#mvQty").value=""; $("#mvNote").value="";
  loadMovements(); loadCatalogue();
});

$("#btnPurge").addEventListener("click", async ()=>{
  if (session.role!=="admin") return;
  if (!confirm("Purger l'historique pour l'agence courante ?")) return;
  const mv = await Store.get(DB_KEYS.movements) || [];
  const kept = mv.filter(m => m.agency !== session.agency);
  await Store.set(DB_KEYS.movements, kept);
  loadMovements();
});

// Export XLSX (mouvements)
$("#btnExportMv").addEventListener("click", async ()=>{
  const mv = await Store.get(DB_KEYS.movements) || [];
  const rows = mv.map(m=>({
    date:m.date, type:m.type, agence:m.agency, ref:m.ref, taille:m.size||"", qte:m.qty, vers:m.toAgency||"", note:m.note||""
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mouvements");
  XLSX.writeFile(wb, "mouvements.xlsx");
});

// ---------- Réassort ----------
$("#btnProposeReassort").addEventListener("click", async ()=>{
  await ensureStockAgency(session.agency);
  const products = await Store.get(DB_KEYS.products) || [];
  const stock = await Store.get(DB_KEYS.stock) || {};
  const stA = stock[session.agency] || {};
  const lines = [];
  for (const p of products){
    const st = stA[p.ref] || { total:0, sizes:{} };
    let need = 0;
    if (p.minBySize){
      for (const [sz,min] of Object.entries(p.minBySize)){
        const cur = st.sizes?.[sz]||0;
        if (cur < min){ need += (min-cur); lines.push({ref:p.ref, article:p.name, taille:sz, manquant:min-cur}); }
      }
    } else if (p.minGlobal){
      const cur = st.total||0;
      if (cur < p.minGlobal){ need = (p.minGlobal - cur); lines.push({ref:p.ref, article:p.name, taille:"", manquant:need}); }
    }
  }
  if (!lines.length){ alert("Aucun article sous seuil."); return; }
  const ws = XLSX.utils.json_to_sheet(lines);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reassort");
  XLSX.writeFile(wb, `reassort_${session.agency}.xlsx`);
});

// ---------- Stats ----------
function prepareStats(){
  const today = new Date();
  $("#stTo").valueAsDate = today;
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  $("#stFrom").valueAsDate = from;
  (async ()=>{
    const agSel = $("#stAgency"); agSel.innerHTML="";
    const ags = await Store.get(DB_KEYS.agencies) || [];
    ags.forEach(a=>{ const o=document.createElement("option"); o.text=a; agSel.add(o); });
    agSel.value = session.agency;
  })();
}
$("#btnComputeStats").addEventListener("click", async ()=>{
  const from = new Date($("#stFrom").value);
  const to = new Date($("#stTo").value); to.setHours(23,59,59,999);
  const agency = $("#stAgency").value;
  const products = await Store.get(DB_KEYS.products) || [];
  const stock = await Store.get(DB_KEYS.stock) || {};
  const stA = stock[agency] || {};
  const mv = (await Store.get(DB_KEYS.movements) || []).filter(m=>{
    const d = new Date(m.date.replace(' ','T'));
    return d>=from && d<=to && (m.agency===agency || m.toAgency===agency);
  });
  const tbody = $("#tblStats tbody"); tbody.innerHTML="";
  for (const p of products){
    const st = stA[p.ref] || { total:0 };
    const entries = mv.filter(m=>m.ref===p.ref && (m.type==="in" || (m.type==="transfer"&&m.toAgency===agency))).reduce((a,b)=>a+b.qty,0);
    const outs = mv.filter(m=>m.ref===p.ref && (m.type==="out" || (m.type==="transfer"&&m.agency===agency))).reduce((a,b)=>a+b.qty,0);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.ref}</td><td>${p.name}</td><td>${st.total||0}</td><td>${money((st.total||0)*Number(p.price||0))}</td><td>${entries}</td><td>${outs}</td>`;
    tbody.appendChild(tr);
  }
});

// ---------- Admin ----------
async function loadAdmin(){
  if (session.role!=="admin"){ switchTab("dashboard"); return; }
  const ags = await Store.get(DB_KEYS.agencies) || [];
  const ul = $("#agList"); ul.innerHTML="";
  ags.forEach(a=>{ const li=document.createElement("li"); li.textContent=a; ul.appendChild(li); });
  const uAgency = $("#uAgency"); uAgency.innerHTML=""; ags.forEach(a=>{ const o=document.createElement("option"); o.text=a; uAgency.add(o);} );
  const users = await Store.get(DB_KEYS.users) || [];
  const tbody = $("#tblUsers tbody"); tbody.innerHTML="";
  users.forEach(u=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${u.user}</td><td>${u.role}</td><td>${u.agency||""}</td>`;
    tbody.appendChild(tr);
  });
}
$("#btnAddAgency").addEventListener("click", async ()=>{
  const name = $("#agNew").value.trim(); if (!name) return;
  const ags = await Store.get(DB_KEYS.agencies) || [];
  if (!ags.includes(name)){ ags.push(name); await Store.set(DB_KEYS.agencies, ags); alert("Agence ajoutée."); loadAdmin(); }
});
$("#btnCreateUser").addEventListener("click", async ()=>{
  const user = $("#uUser").value.trim(); const pass=$("#uPass").value.trim();
  const role = $("#uRole").value; const agency=$("#uAgency").value;
  if (!user || !pass) return alert("User/Mot de passe requis.");
  const users = await Store.get(DB_KEYS.users) || [];
  const i = users.findIndex(u=>u.user===user);
  const rec = { user, pass, role, agency: role==="agence"?agency: (agency||DEFAULT_AGENCIES[0]) };
  if (i>=0) users[i]=rec; else users.push(rec);
  await Store.set(DB_KEYS.users, users); alert("OK"); loadAdmin();
});
$("#btnDeleteUser").addEventListener("click", async ()=>{
  const user = $("#uUser").value.trim(); if (!user) return;
  const users = await Store.get(DB_KEYS.users) || [];
  await Store.set(DB_KEYS.users, users.filter(u=>u.user!==user));
  alert("Supprimé"); loadAdmin();
});

// Export JSON
$("#btnExportJSON").addEventListener("click", async ()=>{
  const dump = {};
  for (const k of Object.values(DB_KEYS)) dump[k] = await Store.get(k);
  const blob = new Blob([JSON.stringify(dump,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "export_artemis_stock.json"; a.click();
});

// Import JSON
$("#fileImportJSON").addEventListener("change", async (e)=>{
  const file = e.target.files[0]; if (!file) return;
  const txt = await file.text();
  const data = JSON.parse(txt);
  for (const [k,v] of Object.entries(data)){
    if (Object.values(DB_KEYS).includes(k)) await Store.set(k, v);
  }
  alert("Import terminé."); location.reload();
});

// Export Produits XLSX
$("#btnExportXLSX").addEventListener("click", async ()=>{
  const products = await Store.get(DB_KEYS.products) || [];
  const rows = products.map(p=>({ ref:p.ref, name:p.name, category:p.category, price:p.price, vendor:p.vendor, barcode:p.barcode, affectation:p.affectation, minGlobal:p.minGlobal }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Produits");
  XLSX.writeFile(wb, "produits.xlsx");
});

// Import Produits XLSX (feuille "Produits")
$("#fileImportXLSX").addEventListener("change", async (e)=>{
  const file = e.target.files[0]; if (!file) return;
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, {type:"array"});
  const sheet = wb.Sheets["Produits"];
  if (!sheet) return alert('Feuille "Produits" introuvable');
  const rows = XLSX.utils.sheet_to_json(sheet);
  const products = await Store.get(DB_KEYS.products) || [];
  const idx = new Map(products.map((p,i)=>[p.ref,i]));
  for (const r of rows){
    if (!r.ref) continue;
    const rec = {
      ref: String(r.ref),
      name: r.name||"",
      category: r.category||CATEGORIES[0],
      price: Number(r.price||0),
      vendor: r.vendor||"",
      barcode: r.barcode||"",
      affectation: r.affectation||"",
      minGlobal: Number(r.minGlobal||0)
    };
    if (idx.has(rec.ref)) products[idx.get(rec.ref)] = rec; else products.push(rec);
  }
  await Store.set(DB_KEYS.products, products);
  alert("Produits importés."); loadCatalogue();
});

// ---------- App Init ----------
(async function init(){
  await initStore(); // choose provider
  const catSel = $("#pCategory"); catSel.innerHTML = CATEGORIES.map(c=>`<option>${c}</option>`).join("");
  buildSizesInputs();
})();
