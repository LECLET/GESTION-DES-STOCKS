
// ==== CONFIG FIREBASE (par défaut cloud) ====
const FIREBASE_CONFIG={apiKey:"AIzaSyAH29rfTBpssIurraLagSnE-a1nHRpfVOw",authDomain:"gestion-des-stocks-8e1b9.firebaseapp.com",projectId:"gestion-des-stocks-8e1b9"};

// ==== Abstraction de stockage (Firestore -> fallback local) ====
let Store=null;
function LocalStore(){return{async init(){localforage.config({name:"artemis-stock"});if(!await localforage.getItem("users"))await seed();},
get:k=>localforage.getItem(k),set:(k,v)=>localforage.setItem(k,v)}}
async function seed(){await localforage.setItem("users",[
  {user:"ARTEMIS",pass:"Simetra",role:"admin",agencies:["HAUT DE FRANCE","IDF","GRAND EST","RHONE ALPES","PACA","OCCITANIE","NOUVELLE AQUITAINE","AUTRE","DEPOT"]},
  {user:"admin",pass:"admin",role:"admin",agencies:["HAUT DE FRANCE","IDF","GRAND EST","RHONE ALPES","PACA","OCCITANIE","NOUVELLE AQUITAINE","AUTRE","DEPOT"]},
  {user:"demo",pass:"demo",role:"agence",agencies:["IDF","DEPOT"]}
]);await localforage.setItem("agencies",["HAUT DE FRANCE","IDF","GRAND EST","RHONE ALPES","PACA","OCCITANIE","NOUVELLE AQUITAINE","AUTRE","DEPOT"])}
function FireStore(){const app=firebase.initializeApp(FIREBASE_CONFIG);const db=firebase.firestore();const doc=db.collection("artemis-stock").doc("v1");
return{init:async()=>{const s=await doc.get();if(!s.exists)await doc.set({hello:"world"},{merge:true});},
get:async k=>{const d=(await doc.get()).data()||{};return d[k]},set:(k,v)=>doc.set({[k]:v},{merge:true}).then(()=>v)}}
async function initStore(){try{Store=FireStore();await Store.init();}catch(e){Store=LocalStore();await Store.init();}}

// ==== Session / Auth ====
let session={user:null,role:null,agencies:[],agency:null};
async function login(u,p){const users=await Store.get("users")||[];const f=users.find(x=>x.user===u&&x.pass===p);if(!f)return false;session.user=f.user;session.role=f.role;session.agencies=f.agencies||[];session.agency=session.agencies[0]||"IDF";return true}
function logout(){session={user:null,role:null,agencies:[],agency:null}}

// ==== UI ====
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
function renderTabs(){const c=$("#tabs");c.innerHTML="";[
  ["home","Accueil"],["catalogue","Catalogue"],["mv","Mouvements"],["stats","Statistiques"],["admin","Admin"]
].forEach(([id,label])=>{const b=document.createElement("button");b.textContent=label;b.className="ghost";b.dataset.tab=id;b.onclick=()=>switchTab(id);c.appendChild(b)})}
function switchTab(id){["home","catalogue","mv","stats","admin"].forEach(t=>$("#tab-"+t)?.classList.add("hidden"));$$("#tabs button").forEach(b=>b.classList.remove("active"));
$("#tab-"+id).classList.remove("hidden");document.querySelector(`#tabs button[data-tab="${id}"]`)?.classList.add("active")}

async function fillAgencySwitch(){const sw=$("#agencySwitch");const all=await (Store.get("agencies")||[]);const allowed=(session.role==="admin")?await Store.get("agencies"):session.agencies;
sw.innerHTML="";(allowed||[]).forEach(a=>{const o=document.createElement("option");o.value=a;o.text=a;sw.add(o)});session.agency=sw.options[0]?.value||"IDF";sw.value=session.agency;sw.classList.toggle("hidden",(allowed||[]).length<=1&&session.role!=="admin");
sw.onchange=()=>{session.agency=sw.value;$("#bAgency").textContent=session.agency}}

// ==== Events ====
$("#btnLogin").onclick=async()=>{
  if(!await login($("#lUser").value.trim(),$("#lPass").value.trim()))return alert("Identifiants invalides.");
  $("#login").classList.add("hidden");$("#hdr").classList.remove("hidden");$("#app").classList.remove("hidden");
  $("#bAgency").textContent=session.agency;$("#bRole").textContent=session.role;renderTabs();fillAgencySwitch();switchTab("home");
};
$("#btnLogout").onclick=()=>{logout();location.reload()};

// ==== Init ====
(async function(){await initStore()})();
