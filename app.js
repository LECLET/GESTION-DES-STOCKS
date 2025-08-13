// External dependencies (CDN loaded in index.html): localforage, xlsx, firebase app+firestore compat

const FIREBASE_CONFIG={apiKey:"AIzaSyAH29rfTBpssIurraLagSnE-a1nHRpfVOw",authDomain:"gestion-des-stocks-8e1b9.firebaseapp.com",projectId:"gestion-des-stocks-8e1b9"};
const DEFAULT_AGENCIES=["HAUT DE FRANCE","IDF","GRAND EST","RHONE ALPES","PACA","OCCITANIE","NOUVELLE AQUITAINE","AUTRE","DEPOT"];
const FAMILIES=["Uniformes","EPI","Communication","Roulant","Informatique","Licences","Divers"];
const CATEGORIES=["Uniformes (haut)","Uniformes (bas)","Chaussures","Accessoires","Tenues EPI","Gants","Casques","Talkies","Oreillettes","Véhicules","Pièces détachées","PC","Tablettes","Téléphones","Logiciels","Licences informatiques","Divers"];
const SIZES=["XS","S","M","L","XL","2XL","3XL","4XL"];
const DB={users:"users",agencies:"agencies",products:"products",stock:"stock",moves:"movements",dict:"dict"};

const $=s=>document.querySelector(s); const $$=s=>Array.from(document.querySelectorAll(s));
const money=n=>(n||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const readAsDataURL=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)});

let Store=null;
function LocalStore(){return{async init(){localforage.config({name:"artemis-stock"});if(!await localforage.getItem(DB.users))await this.seed();},
async seed(){await localforage.setItem(DB.users,[{user:"ARTEMIS",pass:"Simetra",role:"admin",agencies:DEFAULT_AGENCIES},{user:"admin",pass:"admin",role:"admin",agencies:DEFAULT_AGENCIES},{user:"demo",pass:"demo",role:"agence",agencies:["IDF","DEPOT"]}]);
await localforage.setItem(DB.agencies,DEFAULT_AGENCIES);await localforage.setItem(DB.products,[]);await localforage.setItem(DB.stock,{});await localforage.setItem(DB.moves,[]);
await localforage.setItem(DB.dict,{destinataires:["Client","Agence","Formation"],motifs:["Habillage","Remplacement","Casse"]});},
get:k=>localforage.getItem(k),set:(k,v)=>localforage.setItem(k,v)}}
function FireStore(){const app=firebase.initializeApp(FIREBASE_CONFIG);const db=firebase.firestore();const doc=db.collection("artemis-stock").doc("v1");
return{init:async()=>{const s=await doc.get();if(!s.exists)await doc.set({[DB.users]:[{user:"ARTEMIS",pass:"Simetra",role:"admin",agencies:DEFAULT_AGENCIES},{user:"admin",pass:"admin",role:"admin",agencies:DEFAULT_AGENCIES},{user:"demo",pass:"demo",role:"agence",agencies:["IDF","DEPOT"]}],[DB.agencies]:DEFAULT_AGENCIES,[DB.products]:[],[DB.stock]:{},[DB.moves]:[],[DB.dict]:{destinataires:["Client","Agence","Formation"],motifs:["Habillage","Remplacement","Casse"]}},{merge:true});},
get:async k=>{const d=(await doc.get()).data()||{};return d[k]},set:(k,v)=>doc.set({[k]:v},{merge:true}).then(()=>v)}}
async function initStore(){try{Store=FireStore();await Store.init();}catch(e){Store=LocalStore();await Store.init();}}

let session={user:null,role:null,agencies:[],agency:null};
async function login(u,p){const users=await Store.get(DB.users)||[];const f=users.find(x=>x.user===u&&x.pass===p);if(!f)return false;session.user=f.user;session.role=f.role;session.agencies=Array.isArray(f.agencies)?f.agencies:[f.agency||DEFAULT_AGENCIES[0]];session.agency=session.agencies[0]||DEFAULT_AGENCIES[0];return true}
function logout(){session={user:null,role:null,agencies:[],agency:null}}

function getMinGlobal(p,agency){const base=Number(p.minGlobal||0);const ag=p.perAgencyMin&&p.perAgencyMin[agency];return ag&&typeof ag.min==='number'?Number(ag.min):base}
function getMinSize(p,agency,size){const ag=p.perAgencyMin&&p.perAgencyMin[agency];if(ag&&ag.minBySize&&ag.minBySize[size]!=null)return Number(ag.minBySize[size]||0);if(p.minBySize&&p.minBySize[size]!=null)return Number(p.minBySize[size]||0);return 0}
function underThreshold(p,st,agency){const sizes=new Set([...(p.minBySize?Object.keys(p.minBySize):[]),...(p.perAgencyMin?.[agency]?.minBySize?Object.keys(p.perAgencyMin[agency].minBySize):[])]);
for(const s of sizes){const min=getMinSize(p,agency,s);if(min>0&&((st.sizes?.[s]||0)<min))return true}const mg=getMinGlobal(p,agency);if(mg>0&&((st.total||0)<mg))return true;return false}

function renderTabs(){const c=$("#tabs");c.innerHTML="";[["catalogue","Catalogue"],["produit","Fiche produit"],["mv","Mouvements"],["stats","Stats"]].forEach(([id,label])=>{const b=document.createElement("button");b.textContent=label;b.className="ghost";b.dataset.tab=id;b.onclick=()=>switchTab(id);c.appendChild(b)});
const bA=document.createElement("button");bA.textContent="Admin";bA.className="ghost admin-only";bA.dataset.tab="admin";bA.onclick=()=>switchTab("admin");c.appendChild(bA)}
function switchTab(id){["catalogue","produit","mv","stats","admin"].forEach(x=>$("#tab-"+x)?.classList.add("hidden"));$$("#tabs button").forEach(b=>b.classList.remove("active"));$("#tab-"+id).classList.remove("hidden");
document.querySelector(`#tabs button[data-tab="${id}"]`)?.classList.add("active");if(id==="catalogue")loadCatalogue();if(id==="mv")loadMoves();if(id==="stats")prepStats();if(id==="admin")loadAdmin()}

async function fillAgencySwitch(){const sw=$("#agencySwitch");const all=await Store.get(DB.agencies)||[];const allowed=(session.role==="admin")?all:(session.agencies||[]).filter(a=>all.includes(a));
sw.innerHTML="";allowed.forEach(a=>{const o=document.createElement("option");o.value=a;o.text=a;sw.add(o)});session.agency=allowed.includes(session.agency)?session.agency:(allowed[0]||all[0]);sw.value=session.agency;
sw.classList.toggle("hidden",allowed.length<=1&&session.role!=="admin");sw.onchange=()=>{session.agency=sw.value;$("#bAgency").textContent=session.agency;loadCatalogue();loadMoves()}}

$("#btnLogin").onclick=async()=>{if(!await login($("#lUser").value.trim(),$("#lPass").value.trim()))return alert("Identifiants invalides.");$("#login").classList.add("hidden");$("#hdr").classList.remove("hidden");$("#app").classList.remove("hidden");
$("#bAgency").textContent=session.agency;$("#bRole").textContent=session.role;document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",session.role!=="admin"));renderTabs();fillAgencySwitch();switchTab("catalogue")};
$("#btnLogout").onclick=()=>{logout();location.reload()};

let catPage=1,catPageSize=20,catRows=[];
const inline=(val,ref,field)=>`<span class="cell" data-ref="${ref}" data-field="${field}" contenteditable="true">${val??""}</span>`;
const uniq=arr=>Array.from(new Set(arr.filter(Boolean)));

// === REASSORT ===
let REASSORT_DRAFT=[];
function computeReassort(products, stock, agency){
  const draft=[];
  for(const p of products){
    const st=(stock[agency]?.[p.ref])||{total:0,sizes:{}};
    // per size first
    const sizes = new Set([...(p.minBySize?Object.keys(p.minBySize):[]),...(p.perAgencyMin?.[agency]?.minBySize?Object.keys(p.perAgencyMin[agency].minBySize):[])]);
    for(const s of sizes){
      const min = getMinSize(p, agency, s);
      const cur = st.sizes?.[s]||0;
      if(min>0 && cur<min) draft.push({ref:p.ref,name:p.name||"",size:s,qty:(min-cur)});
    }
    // then global if still under
    const mg=getMinGlobal(p, agency);
    if(mg>0 && (st.total||0)<mg){
      const needed = mg-(st.total||0);
      draft.push({ref:p.ref,name:p.name||"",size:null,qty:needed});
    }
  }
  return draft;
}
async function bindReassortButtons(){
  document.getElementById("btnReassort").onclick = async ()=>{
    const products=await Store.get(DB.products)||[]; const stock=await Store.get(DB.stock)||{};
    REASSORT_DRAFT = computeReassort(products, stock, session.agency);
    if(!REASSORT_DRAFT.length){ alert("Aucun article sous seuil pour l'agence "+session.agency); return; }
    const byRef = REASSORT_DRAFT.reduce((a,l)=>{const k=l.ref+"|"+(l.size||"-");a[k]=(a[k]||0)+l.qty;return a;},{});
    const lines = Object.entries(byRef).map(([k,q])=>{const [r,s]=k.split("|");return r+" "+(s!=="-"?("("+s+") "):"")+"→ +"+q}).slice(0,30).join("\n");
    alert("Brouillon réassort créé ("+REASSORT_DRAFT.length+" lignes).\n\nPrévisualisation:\n"+lines+(REASSORT_DRAFT.length>30?"\n...":""));
  };
  document.getElementById("btnReassortGen").onclick = async ()=>{
    if(!REASSORT_DRAFT.length){ alert("Aucun brouillon en mémoire. Cliquez d'abord sur 'Proposer un réassort'."); return; }
    const stock=await Store.get(DB.stock)||{}; stock[session.agency]=stock[session.agency]||{};
    const mv=await Store.get(DB.moves)||[];
    for(const ln of REASSORT_DRAFT){
      stock[session.agency][ln.ref]=stock[session.agency][ln.ref]||{total:0,sizes:{}};
      stock[session.agency][ln.ref].total += ln.qty;
      if(ln.size){ stock[session.agency][ln.ref].sizes[ln.size]=(stock[session.agency][ln.ref].sizes[ln.size]||0)+ln.qty; }
      mv.push({date:new Date().toISOString().slice(0,19).replace('T',' '), type:"in", agency:session.agency, ref:ln.ref, size:ln.size, qty:ln.qty, toAgency:"", dest:"Réassort", motif:"Réassort auto", note:""});
    }
    await Store.set(DB.stock, stock); await Store.set(DB.moves, mv);
    REASSORT_DRAFT=[]; alert("Entrées générées pour le réassort de "+session.agency); loadCatalogue(); loadMoves();
  };
}

async function loadCatalogue(){const products=await Store.get(DB.products)||[];const stock=await Store.get(DB.stock)||{};
$("#fFamily").innerHTML="<option value=''>Toutes familles</option>"+uniq(products.map(p=>p.family)).map(v=>`<option>${v}</option>`).join("");
$("#fCategory").innerHTML="<option value=''>Toutes catégories</option>"+CATEGORIES.map(v=>`<option>${v}</option>`).join("");
const agSel=$("#fAgencies");agSel.innerHTML="";const all=await Store.get(DB.agencies)||[];const allowed=(session.role==="admin")?all:(session.agencies||[]).filter(a=>all.includes(a));
allowed.forEach(a=>{const o=document.createElement("option");o.text=a;o.value=a;agSel.add(o)});$("#fAll").onclick=()=>{Array.from(agSel.options).forEach(o=>o.selected=true);render()};
$("#fPageSize").onchange=()=>{catPageSize=Number($("#fPageSize").value||20);catPage=1;render()};$("#fSearch").oninput=render;$("#fFamily").onchange=render;$("#fCategory").onchange=render;$("#fAgencies").onchange=render;$("#fReassort").onchange=render;
$("#pPrev").onclick=()=>{if(catPage>1){catPage--;render()}};$("#pNext").onclick=()=>{const pages=Math.max(1,Math.ceil(catRows.length/catPageSize));if(catPage<pages){catPage++;render()}};$("#btnNewFromCat").onclick=()=>openProduct(null);
function selAg(){const s=Array.from(agSel.selectedOptions).map(o=>o.value);return s.length?s:[session.agency]}function stockSel(ref,ags){let t=0;ags.forEach(a=>t+=(stock[a]?.[ref]?.total)||0);return t}
function stockAll(ref){let t=0;Object.keys(stock).forEach(a=>t+=(stock[a]?.[ref]?.total)||0);return t}
function kpis(rows){$("#kTotal").textContent=products.length;let valoSel=0,valoAll=0,under=0;for(const r of rows){valoSel+=r.stSel*Number(r.p.price||0);valoAll+=r.stAll*Number(r.p.price||0);const cur=(stock[session.agency]||{})[r.p.ref]||{total:0,sizes:{}};if(underThreshold(r.p,cur,session.agency))under++}
$("#kValo").textContent=money(valoSel);$("#kValoAll").textContent=money(valoAll);$("#kLow").textContent=under}
async function saveInline(ref,field,value){const list=await Store.get(DB.products)||[];const i=list.findIndex(x=>x.ref===ref);if(i<0)return;if(field==="price")list[i].price=Number(value||0);if(field==="affectation")list[i].affectation=String(value||"").trim();await Store.set(DB.products,list)}
function bindInline(){$$("#catTbl [data-ref][data-field]").forEach(el=>{el.addEventListener("keydown",ev=>{if(ev.key==="Enter"){ev.preventDefault();ev.target.blur()}});el.addEventListener("blur",async ev=>{await saveInline(ev.target.dataset.ref,ev.target.dataset.field,ev.target.innerText);kpis(catRows)})})}
function render(){const fam=$("#fFamily").value,cat=$("#fCategory").value,q=($("#fSearch").value||"").toLowerCase(),needR=$("#fReassort").value==="1";const ags=selAg();const body=$("#catTbl tbody");body.innerHTML="";catRows=[];
for(const p of products){if(fam&&p.family!==fam)continue;if(cat&&p.category!==cat)continue;const fields=[p.ref,p.name,p.family,p.category,(p.barcode||""),(p.affectation||"")].join(" ").toLowerCase();if(q&&!fields.includes(q))continue;
const stSel=stockSel(p.ref,ags),stAll=stockAll(p.ref);const stCur=(stock[session.agency]||{})[p.ref]||{total:0,sizes:{}};const isU=underThreshold(p,stCur,session.agency);if(needR&&!isU)continue;catRows.push({p,stSel,stAll,isU})}
const pages=Math.max(1,Math.ceil(catRows.length/catPageSize));if(catPage>pages)catPage=pages;$("#pInfo").textContent=catPage+"/"+pages;const start=(catPage-1)*catPageSize,end=start+catPageSize;const slice=catRows.slice(start,end);
slice.forEach(({p,stSel,stAll,isU})=>{const tr=document.createElement("tr");if(isU)tr.className=stSel>0?"warn":"alert";tr.innerHTML=`<td>${p.ref}</td><td>${p.name||""}</td><td>${p.family||""}</td><td>${p.category||""}</td>
<td><span class="cell" data-ref="${p.ref}" data-field="price" contenteditable="true">${p.price??""}</span></td>
<td>${stSel||0}</td><td class="admin-only">${stAll||0}</td><td>G:${getMinGlobal(p,session.agency)||0}</td><td>${p.barcode||""}</td>
<td><span class="cell" data-ref="${p.ref}" data-field="affectation" contenteditable="true">${p.affectation||""}</span></td><td><button class="ghost" data-open="${p.ref}">Ouvrir</button></td>`;body.appendChild(tr)});
$$("button[data-open]").forEach(b=>b.onclick=()=>openProduct(b.dataset.open));document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",session.role!=="admin"));kpis(slice.length?slice:catRows);bindInline()}
render();
$("#expX").onclick=async()=>{const list=await Store.get(DB.products)||[];const rows=list.map(p=>({ref:p.ref,name:p.name,family:p.family||"",category:p.category||"",price:p.price||0,vendor:p.vendor||"",barcode:p.barcode||"",affectation:p.affectation||"",minGlobal:p.minGlobal||0,
XS:p.minBySize?.XS||"",S:p.minBySize?.S||"",M:p.minBySize?.M||"",L:p.minBySize?.L||"",XL:p.minBySize?.XL||"",_2XL:p.minBySize?.["2XL"]||"",_3XL:p.minBySize?.["3XL"]||"",_4XL:p.minBySize?.["4XL"]||"",notes:p.notes||""}));
const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Produits");const agRows=[];list.forEach(p=>{if(p.perAgencyMin){for(const[ag,obj]of Object.entries(p.perAgencyMin)){agRows.push({ref:p.ref,agency:ag,min:obj.min||0,XS:obj.minBySize?.XS||"",S:obj.minBySize?.S||"",M:obj.minBySize?.M||"",L:obj.minBySize?.L||"",XL:obj.minBySize?.XL||"",_2XL:obj.minBySize?.["2XL"]||"",_3XL:obj.minBySize?.["3XL"]||"",_4XL:obj.minBySize?.["4XL"]||""})}}});
if(agRows.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(agRows),"SeuilsAgences");const dict=await Store.get(DB.dict)||{destinataires:[],motifs:[]};const drows=[];(dict.destinataires||[]).forEach(v=>drows.push({type:"destinataire",value:v}));(dict.motifs||[]).forEach(v=>drows.push({type:"motif",value:v}));
if(drows.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(drows),"DestinatairesMotifs");XLSX.writeFile(wb,"produits_full.xlsx")};
$("#impX").onchange=async e=>{const f=e.target.files[0];if(!f)return;const data=await f.arrayBuffer();const wb=XLSX.read(data,{type:"array"});
const list=await Store.get(DB.products)||[];const idx=new Map(list.map((p,i)=>[p.ref,i]));const sh=wb.Sheets["Produits"];if(!sh)return alert('Feuille "Produits" introuvable');const rows=XLSX.utils.sheet_to_json(sh);
rows.forEach(r=>{if(!r.ref)return;const rec={ref:String(r.ref),name:r.name||"",family:r.family||"",category:r.category||"",price:Number(r.price||0),vendor:r.vendor||"",barcode:r.barcode||"",affectation:r.affectation||"",minGlobal:Number(r.minGlobal||0),notes:r.notes||""};
const minBySize={};if(r.XS)minBySize.XS=Number(r.XS);if(r.S)minBySize.S=Number(r.S);if(r.M)minBySize.M=Number(r.M);if(r.L)minBySize.L=Number(r.L);if(r.XL)minBySize.XL=Number(r.XL);if(r._2XL)minBySize["2XL"]=Number(r._2XL);if(r._3XL)minBySize["3XL"]=Number(r._3XL);if(r._4XL)minBySize["4XL"]=Number(r._4XL);
if(Object.keys(minBySize).length)rec.minBySize=minBySize;if(idx.has(rec.ref))list[idx.get(rec.ref)]=Object.assign(list[idx.get(rec.ref)],rec);else list.push(rec)});
const sag=wb.Sheets["SeuilsAgences"];if(sag){const ar=XLSX.utils.sheet_to_json(sag);ar.forEach(r=>{if(!r.ref||!r.agency)return;const i=list.findIndex(p=>p.ref==String(r.ref));if(i<0)return;list[i].perAgencyMin=list[i].perAgencyMin||{};const obj=list[i].perAgencyMin[r.agency]=list[i].perAgencyMin[r.agency]||{};
obj.min=Number(r.min||0);const sz={};if(r.XS)sz.XS=Number(r.XS);if(r.S)sz.S=Number(r.S);if(r.M)sz.M=Number(r.M);if(r.L)sz.L=Number(r.L);if(r.XL)sz.XL=Number(r.XL);if(r._2XL)sz["2XL"]=Number(r._2XL);if(r._3XL)sz["3XL"]=Number(r._3XL);if(r._4XL)sz["4XL"]=Number(r._4XL);if(Object.keys(sz).length)obj.minBySize=sz})}
const dsh=wb.Sheets["DestinatairesMotifs"];if(dsh){const dr=XLSX.utils.sheet_to_json(dsh);const dict=await Store.get(DB.dict)||{destinataires:[],motifs:[]};dict.destinataires=dr.filter(x=>String(x.type).toLowerCase()=="destinataire").map(x=>x.value).filter(Boolean);
dict.motifs=dr.filter(x=>String(x.type).toLowerCase()=="motif").map(x=>x.value).filter(Boolean);await Store.set(DB.dict,dict)}await Store.set(DB.products,list);alert("Import terminé");loadCatalogue();refreshMvRefs();refreshDicts()}};

function buildSizeInputs(rootSel){const w=$(rootSel);w.innerHTML="";SIZES.forEach(s=>{const d=document.createElement("div");d.innerHTML=`<label>${s}</label><input type="number" min="0" step="1" data-minsize="${s}" placeholder="0">`;w.appendChild(d)})}
$("#pSizesToggle").onchange=()=>$("#pSizesWrap").classList.toggle("hidden",!$("#pSizesToggle").checked);
async function openProduct(ref){const list=await Store.get(DB.products)||[];const p=list.find(x=>x.ref===ref)||null;$("#pTitle").textContent=ref?"Fiche produit — "+ref:"Nouveau produit";
$("#pFamily").innerHTML=FAMILIES.map(v=>`<option>${v}</option>`).join("");$("#pCategory").innerHTML=CATEGORIES.map(v=>`<option>${v}</option>`).join("");buildSizeInputs("#pSizesWrap");
if(!p){["#pRef","#pName","#pPrice","#pVendor","#pBarcode","#pAffectation","#pMinGlobal","#pNotes"].forEach(s=>$(s).value="");$("#pPhotoPrev").classList.add("hidden");$("#pTechLink").classList.add("hidden");$("#btnDelP").classList.add("hidden");$("#pSizesToggle").checked=false;$("#pSizesWrap").classList.add("hidden")}
else{$("#pRef").value=p.ref;$("#pName").value=p.name||"";$("#pFamily").value=p.family||FAMILIES[0];$("#pCategory").value=p.category||CATEGORIES[0];$("#pPrice").value=p.price||"";$("#pVendor").value=p.vendor||"";$("#pBarcode").value=p.barcode||"";$("#pAffectation").value=p.affectation||"";$("#pMinGlobal").value=p.minGlobal||"";$("#pNotes").value=p.notes||"";
if(p.minBySize){$("#pSizesToggle").checked=true;$("#pSizesWrap").classList.remove("hidden");Object.entries(p.minBySize).forEach(([k,v])=>{const i=document.querySelector(`#pSizesWrap [data-minsize='${k}']`);if(i)i.value=v})}if(p.photo){$("#pPhotoPrev").src=p.photo;$("#pPhotoPrev").classList.remove("hidden")}if(p.tech){$("#pTechLink").href=p.tech.url;$("#pTechLink").textContent=p.tech.name||"Fiche technique";$("#pTechLink").classList.remove("hidden")}$("#btnDelP").classList.remove("hidden")}
switchTab("produit")}
$("#btnNewP").onclick=()=>openProduct(null);
document.getElementById("pPhoto").onchange=async e=>{const f=e.target.files[0];if(!f)return;const url=await readAsDataURL(f);$("#pPhotoPrev").src=url;$("#pPhotoPrev").classList.remove("hidden")};
document.getElementById("pTech").onchange=async e=>{const f=e.target.files[0];if(!f)return;const url=await readAsDataURL(f);$("#pTechLink").href=url;$("#pTechLink").textContent=f.name;$("#pTechLink").classList.remove("hidden")};
$("#btnSaveP").onclick=async()=>{const ref=$("#pRef").value.trim();if(!ref)return alert("Référence requise");const list=await Store.get(DB.products)||[];const i=list.findIndex(x=>x.ref===ref);
const rec={ref,name:$("#pName").value.trim(),family:$("#pFamily").value,category:$("#pCategory").value,price:Number($("#pPrice").value||0),vendor:$("#pVendor").value.trim(),barcode:$("#pBarcode").value.trim(),affectation:$("#pAffectation").value.trim(),minGlobal:Number($("#pMinGlobal").value||0),notes:$("#pNotes").value.trim()};
if($("#pSizesToggle").checked){rec.minBySize={};$$("#pSizesWrap [data-minsize]").forEach(i=>{const n=Number(i.value||0);if(n>0)rec.minBySize[i.dataset.minsize]=n})}
const img=$("#pPhotoPrev");if(img&&!img.classList.contains("hidden"))rec.photo=img.src;const a=$("#pTechLink");if(a&&!a.classList.contains("hidden"))rec.tech={url:a.href,name:a.textContent};
if(i>=0)list[i]=Object.assign(list[i],rec);else list.push(rec);await Store.set(DB.products,list);alert("Enregistré");switchTab("catalogue");loadCatalogue();refreshMvRefs()};
$("#btnDelP").onclick=async()=>{if(!confirm("Supprimer ce produit ?"))return;const ref=$("#pRef").value.trim();const list=await Store.get(DB.products)||[];await Store.set(DB.products,list.filter(x=>x.ref!==ref));alert("Supprimé");switchTab("catalogue");loadCatalogue();refreshMvRefs()};

function buildMvSizes(){$("#mSize").innerHTML="<option value=''>—</option>"+SIZES.map(s=>`<option>${s}</option>`).join("");const w=$("#mMultiWrap");w.innerHTML="";SIZES.forEach(s=>{const d=document.createElement("div");d.innerHTML=`<label>${s}</label><input type="number" min="0" step="1" data-mvsize="${s}" placeholder="0">`;w.appendChild(d)})}
buildMvSizes();
async function refreshMvRefs(){const products=await Store.get(DB.products)||[];const dl=$("#mRefList");dl.innerHTML="";const sel=$("#mRef");sel.innerHTML="";products.forEach(p=>{const o=document.createElement("option");o.value=p.ref;o.label=p.ref+" — "+p.name;dl.appendChild(o);const s=document.createElement("option");s.value=p.ref;s.text=p.ref+" — "+p.name;sel.add(s)});
const ags=await Store.get(DB.agencies)||[];const to=$("#mTo");to.innerHTML="";ags.forEach(a=>{const o=document.createElement("option");o.text=a;to.add(o)})}
refreshMvRefs();
async function refreshDicts(){const dict=await Store.get(DB.dict)||{destinataires:[],motifs:[]};const d=$("#mDest"),m=$("#mMotif");d.innerHTML="";m.innerHTML="";(dict.destinataires||[]).forEach(v=>{const o=document.createElement("option");o.text=v;d.add(o)});(dict.motifs||[]).forEach(v=>{const o=document.createElement("option");o.text=v;m.add(o)})}
refreshDicts();
$("#mType").onchange=()=>$("#mTo").classList.toggle("hidden",$("#mType").value!=="transfer");
$("#mRefSearch").oninput=e=>{const val=e.target.value;const ref=(/^[^—]+/.test(val))?val.split("—")[0].trim():val.trim();const opt=Array.from($("#mRef").options).find(o=>o.value===ref);if(opt)$("#mRef").value=opt.value};
$("#mMulti").onchange=()=>{const on=$("#mMulti").checked;$("#mMultiWrap").classList.toggle("hidden",!on);$("#mQty").disabled=on;$("#mSize").disabled=on};
$("#mDestBtn").onclick=async()=>{const v=$("#mDestAdd").value.trim();if(!v)return;const dict=await Store.get(DB.dict)||{destinataires:[],motifs:[]};if(!dict.destinataires.includes(v))dict.destinataires.push(v);await Store.set(DB.dict,dict);$("#mDestAdd").value="";refreshDicts()};
$("#mMotifBtn").onclick=async()=>{const v=$("#mMotifAdd").value.trim();if(!v)return;const dict=await Store.get(DB.dict)||{destinataires:[],motifs:[]};if(!dict.motifs.includes(v))dict.motifs.push(v);await Store.set(DB.dict,dict);$("#mMotifAdd").value="";refreshDicts()};

$("#mAdd").onclick=async()=>{const type=$("#mType").value;const ref=$("#mRef").value;if(!ref)return alert("Référence requise (catalogue).");const prod=(await Store.get(DB.products)||[]).find(p=>p.ref===ref);if(!prod)return alert("Produit introuvable (créez-le d'abord).");
const stock=await Store.get(DB.stock)||{};stock[session.agency]=stock[session.agency]||{};stock[session.agency][ref]=stock[session.agency][ref]||{total:0,sizes:{}};const mv=await Store.get(DB.moves)||[];
const dest=$("#mDest").value||"",motif=$("#mMotif").value||"",note=$("#mNote").value||"";const lines=[];
if($("#mMulti").checked){$$("#mMultiWrap [data-mvsize]").forEach(i=>{const q=Number(i.value||0);if(q>0)lines.push({size:i.dataset.mvsize,qty:q})});if(!lines.length)return alert("Renseignez au moins une quantité par taille.")}
else{const q=Number($("#mQty").value||0);if(q<=0)return alert("Quantité invalide");lines.push({size:($("#mSize").value||null),qty:q})}
function addQty(obj,delta,sz){obj.total=(obj.total||0)+delta;if(sz)obj.sizes[sz]=(obj.sizes[sz]||0)+delta}
for(const ln of lines){if(type==="in")addQty(stock[session.agency][ref],ln.qty,ln.size);else if(type==="out"){addQty(stock[session.agency][ref],-ln.qty,ln.size);if(stock[session.agency][ref].total<0)stock[session.agency][ref].total=0;if(ln.size&&stock[session.agency][ref].sizes[ln.size]<0)stock[session.agency][ref].sizes[ln.size]=0}
else if(type==="transfer"){const to=$("#mTo").value;if(!to)return alert("Choisir l'agence de destination");addQty(stock[session.agency][ref],-ln.qty,ln.size);stock[to]=stock[to]||{};stock[to][ref]=stock[to][ref]||{total:0,sizes:{}};addQty(stock[to][ref],ln.qty,ln.size)}
mv.push({date:new Date().toISOString().slice(0,19).replace('T',' '),type,agency:session.agency,ref,size:ln.size,qty:ln.qty,toAgency:(type==="transfer"?$("#mTo").value:""),dest,motif,note})}
await Store.set(DB.stock,stock);await Store.set(DB.moves,mv);["#mRef","#mRefSearch","#mQty","#mNote"].forEach(s=>$(s).value="");$$("#mMultiWrap [data-mvsize]").forEach(i=>i.value="");loadMoves();loadCatalogue()};
$("#mFilter").oninput=loadMoves;
document.getElementById("mPurge").onclick=async()=>{if(session.role!=="admin")return alert("Réservé à l'admin");if(!confirm("Purger l'historique pour l'agence courante ?"))return;
const mv=await Store.get(DB.moves)||[];const filtered=mv.filter(m=>m.agency!==session.agency&&m.toAgency!==session.agency);await Store.set(DB.moves,filtered);alert("Historique purgé pour "+session.agency);loadMoves()};
document.getElementById("mExp").onclick=async()=>{if(session.role!=="admin")return alert("Réservé à l'admin");const mv=await Store.get(DB.moves)||[];const rows=mv.filter(m=>m.agency===session.agency||m.toAgency===session.agency);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Mouvements_"+session.agency);XLSX.writeFile(wb,"mouvements_"+session.agency+".xlsx")};
async function loadMoves(){const mv=await Store.get(DB.moves)||[];const tbody=$("#mTbl tbody");tbody.innerHTML="";const q=($("#mFilter").value||"").toLowerCase();
for(const m of mv.slice().reverse()){if(m.agency!==session.agency&&session.role!=="admin"&&m.toAgency!==session.agency)continue;const hay=[m.type,m.agency,m.ref,m.size||"",m.dest||"",m.motif||"",m.note||"",String(m.qty)].join(" ").toLowerCase();if(q&&!hay.includes(q))continue;
const tr=document.createElement("tr");tr.innerHTML=`<td>${m.date}</td><td>${m.type}</td><td>${m.agency}</td><td>${m.ref}</td><td>${m.size||""}</td><td>${m.qty}</td><td>${m.toAgency||""}</td><td>${m.dest||""}</td><td>${m.motif||""}</td><td>${m.note||""}</td>`;tbody.appendChild(tr)}
document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",session.role!=="admin"))}

function prepStats(){const today=new Date();$("#sTo").valueAsDate=today;const from=new Date(today.getFullYear(),today.getMonth(),1);$("#sFrom").valueAsDate=from;(async()=>{const sel=$("#sAgencies");sel.innerHTML="";const all=await Store.get(DB.agencies)||[];const allowed=(session.role==="admin")?all:session.agencies;allowed.forEach(a=>{const o=document.createElement("option");o.text=a;sel.add(o)});$("#sAll").onclick=()=>{Array.from(sel.options).forEach(o=>o.selected=true)}})()}
$("#sRun").onclick=async()=>{const from=new Date($("#sFrom").value);const to=new Date($("#sTo").value);to.setHours(23,59,59,999);const agsSel=Array.from($("#sAgencies").selectedOptions).map(o=>o.value);const ags=agsSel.length?agsSel:[session.agency];
const products=await Store.get(DB.products)||[];const stock=await Store.get(DB.stock)||{};const mv=await Store.get(DB.moves)||[];const tbody=$("#sTbl tbody");tbody.innerHTML="";
function stockSel(ref){let t=0;ags.forEach(a=>t+=(stock[a]?.[ref]?.total)||0);return t}function inRange(m){const d=new Date(m.date.replace(' ','T'));return d>=from&&d<=to}
for(const p of products){const st=stockSel(p.ref);const entries=mv.filter(m=>m.ref===p.ref&&inRange(m)&&(m.type==="in"||(m.type==="transfer"&&ags.includes(m.toAgency)))).reduce((a,b)=>a+b.qty,0);
const outs=mv.filter(m=>m.ref===p.ref&&inRange(m)&&(m.type==="out"||(m.type==="transfer"&&ags.includes(m.agency)))).reduce((a,b)=>a+b.qty,0);
const tr=document.createElement("tr");tr.innerHTML=`<td>${p.ref}</td><td>${p.name||""}</td><td>${p.family||""}</td><td>${p.category||""}</td><td>${st}</td><td>${money(st*Number(p.price||0))}</td><td>${entries}</td><td>${outs}</td>`;tbody.appendChild(tr)}}

async function loadAdmin(){if(session.role!=="admin")return switchTab("catalogue");const ags=await Store.get(DB.agencies)||[];const ul=$("#aList");ul.innerHTML="";
ags.forEach(a=>{const li=document.createElement("li");li.textContent=a+" ";const del=document.createElement("button");del.textContent="Supprimer";del.className="danger";del.onclick=async()=>{if(!confirm("Supprimer l'agence "+a+" ?"))return;const nag=ags.filter(x=>x!==a);await Store.set(DB.agencies,nag);const stock=await Store.get(DB.stock)||{};delete stock[a];await Store.set(DB.stock,stock);
const users=await Store.get(DB.users)||[];users.forEach(u=>{if(Array.isArray(u.agencies))u.agencies=u.agencies.filter(x=>x!==a);else if(u.agency===a)u.agency=nag[0]||""});await Store.set(DB.users,users);alert("Agence supprimée");fillAgencySwitch();loadAdmin();loadCatalogue()};li.appendChild(del);ul.appendChild(li)});
const uTbl=$("#uTbl tbody");uTbl.innerHTML="";const users=await Store.get(DB.users)||[];users.forEach(u=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${u.user}</td><td>${u.role}</td><td>${Array.isArray(u.agencies)?u.agencies.join(", "):(u.agency||"")}</td>`;uTbl.appendChild(tr)});
const ms=$("#uAgs");ms.innerHTML="";ags.forEach(a=>{const o=document.createElement("option");o.text=a;ms.add(o)});
$("#uSave").onclick=async()=>{const user=$("#uUser").value.trim(),pass=$("#uPass").value.trim(),role=$("#uRole").value;if(!user||!pass)return alert("User/Mot de passe requis");const list=await Store.get(DB.users)||[];const i=list.findIndex(x=>x.user===user);
const allowed=Array.from(ms.selectedOptions).map(o=>o.value);const rec={user,pass,role,agencies:(role==="admin"?DEFAULT_AGENCIES:(allowed.length?allowed:DEFAULT_AGENCIES.slice(0,1)))};if(i>=0)list[i]=Object.assign(list[i],rec);else list.push(rec);await Store.set(DB.users,list);alert("Utilisateur enregistré");loadAdmin()};
$("#uDel").onclick=async()=>{const user=$("#uUser").value.trim();if(!user)return;const list=await Store.get(DB.users)||[];await Store.set(DB.users,list.filter(x=>x.user!==user));alert("Supprimé");loadAdmin()};
$("#eXLSX").onclick=()=>$("#expX").click();$("#iXLSX").onchange=e=>$("#impX").onchange(e);$("#eJSON").onclick=async()=>{const data={};for(const k of Object.values(DB))data[k]=await Store.get(k);const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="export_full.json";a.click()};
$("#iJSON").onchange=async e=>{const f=e.target.files[0];if(!f)return;const txt=await f.text();const data=JSON.parse(txt);for(const [k,v]of Object.entries(data))if(Object.values(DB).includes(k))await Store.set(k,v);alert("Import JSON terminé");location.reload()}};

(async function(){try{const app=firebase.initializeApp(FIREBASE_CONFIG);await firebase.firestore().collection("t").limit(1).get()}catch(e){}await initStore()})();