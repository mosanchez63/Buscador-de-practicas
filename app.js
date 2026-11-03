(function(){
"use strict";
var STOP = {de:1,del:1,la:1,el:1,los:1,las:1,y:1,o:1,e:1,con:1,sin:1,por:1,para:1,a:1,en:1,un:1,una:1,al:1};
var PAGE = 150;
var DB = {rows:[], vigencia:"", hist:[]};
var S = {rows:[], vigencia:"", hist:[], loadedSha:null, admin:false, shown:PAGE, lastKey:"", dirty:0, changed:{}};
var $ = function(id){return document.getElementById(id)};
var fmt = new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0});
var ss = {get:function(k){try{return JSON.parse(sessionStorage.getItem(k))}catch(_){return null}},
          set:function(k,v){try{sessionStorage.setItem(k,JSON.stringify(v))}catch(_){}},
          del:function(k){try{sessionStorage.removeItem(k)}catch(_){}}};

/* ---------- normalización ---------- */
function norm(s){ return String(s==null?"":s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\./g,""); }
function toks(s){ return norm(s).split(/[^a-z0-9]+/).filter(Boolean); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]}); }
function prep(r){
  r.codigo = r.codigo==null ? "" : String(r.codigo);
  r.valor = (r.valor===""||r.valor==null||isNaN(Number(r.valor))) ? null : Number(r.valor);
  r.nota = r.nota || "";
  r._t = toks(r.practica+" "+r.codigo);
  r._pm = toks(r.practica).filter(function(w){return !STOP[w] && !/^\d+$/.test(w)});
  r._np = norm(r.practica);
  r._c = norm(r.codigo).replace(/[^a-z0-9]/g,"");
  return r;
}
function clean(r){ return {id:r.id, centro:r.centro, codigo:r.codigo, practica:r.practica, valor:r.valor>0?r.valor:"", nota:r.nota}; }

/* ---------- búsqueda (misma lógica que el Excel) ---------- */
function search(q, centro){
  var base = centro ? S.rows.filter(function(r){return r.centro===centro}) : S.rows;
  var nq = norm(q).trim();
  if(!nq) return {mode:"none", base:base};
  if(/^\d+$/.test(nq)){
    var byCode = base.filter(function(r){return r._c.indexOf(nq)===0});
    if(byCode.length){ byCode.sort(cmpVal); return {mode:"code", words:[nq], full:byCode, main:byCode, other:[], partial:[]}; }
  }
  var words = toks(nq).filter(function(w){return !STOP[w]});
  if(!words.length) words = toks(nq);
  var full=[], partial=[];
  for(var i=0;i<base.length;i++){
    var r=base[i], hit=0;
    for(var j=0;j<words.length;j++){
      var w=words[j], t=r._t;
      for(var k=0;k<t.length;k++){ if(t[k].indexOf(w)===0){hit++;break;} }
    }
    if(hit===words.length) full.push(r);
    else if(hit>0){ r._h=hit; partial.push(r); }
  }
  full.sort(cmpVal);
  partial.sort(function(a,b){return (b._h-a._h)||cmpVal(a,b)});
  // principales: la práctica EMPIEZA con la primera palabra buscada (ej. «Consulta médica»);
  // otras: la palabra aparece dentro de otra práctica (ej. «Electro y consulta», «Prueba de lazo - valor 1 consulta»)
  var main=[], other=[];
  var w0=words[0];
  full.forEach(function(r){
    var idx=-1; for(var k=0;k<r._pm.length&&k<2;k++){ if(r._pm[k].indexOf(w0)===0){ idx=k; break; } }
    var ok=idx===0;
    if(idx===1){ // segunda palabra: vale si no viene unida a otra práctica («electro y consulta», «x + consulta»)
      var pos=r._np.search(new RegExp("(^|[^a-z0-9])"+w0)); var pre=pos>0?r._np.slice(0,pos+1):"";
      ok=!/(^|[^a-z0-9])(y|con|mas)[^a-z0-9]|\+/.test(pre);
    }
    (ok ? main : other).push(r);
  });
  if(!main.length || !other.length){ main=full; other=[]; }
  return {mode:"text", words:words, full:full, main:main, other:other, partial:partial};
}
function cmpOrden(){
  var o=$("orden").value;
  if(o==="desc") return function(a,b){ var av=a.valor>0?a.valor:-1, bv=b.valor>0?b.valor:-1; return bv-av || a.centro.localeCompare(b.centro); };
  if(o==="centro") return function(a,b){ return a.centro.localeCompare(b.centro) || cmpVal(a,b); };
  if(o==="practica") return function(a,b){ return a.practica.localeCompare(b.practica) || cmpVal(a,b); };
  return cmpVal;
}
function cmpVal(a,b){
  var av=a.valor>0?a.valor:Infinity, bv=b.valor>0?b.valor:Infinity;
  return av-bv || a.centro.localeCompare(b.centro) || a.practica.localeCompare(b.practica);
}
function hl(text, words){
  if(!words || !words.length) return esc(text);
  return String(text).split(/([^\s/(),;:-]+)/).map(function(part){
    if(!part) return "";
    var n = norm(part).replace(/[^a-z0-9]/g,"");
    for(var i=0;i<words.length;i++){ if(n && n.indexOf(words[i])===0) return "<mark>"+esc(part)+"</mark>"; }
    return esc(part);
  }).join("");
}

/* ---------- render ---------- */
var ICON_EDIT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m14 6 4 4"/></svg>';
var ICON_DEL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
function rowHtml(r, words, cls){
  var val = r.valor>0 ? '<div class="c-val">'+fmt.format(r.valor)+'</div>' : '<div class="c-val note">'+esc(r.nota||"Sin valor")+'</div>';
  if(S.changed[r.id]) cls=(cls||"")+" chg";
  return '<div class="row '+(cls||"")+'" data-id="'+esc(r.id)+'">'+
    '<div class="c-centro">'+esc(r.centro)+'</div>'+
    '<div class="c-cod">'+hl(r.codigo, words)+'</div>'+
    '<div class="c-pr">'+hl(r.practica, words)+(r.valor>0 && r.nota ? ' <small style="color:var(--muted)">· '+esc(r.nota)+'</small>' : '')+'</div>'+
    val+
    '<div class="c-act"><button class="ico" type="button" data-act="edit" aria-label="Editar">'+ICON_EDIT+'</button><button class="ico del" type="button" data-act="del" aria-label="Eliminar">'+ICON_DEL+'</button></div>'+
  '</div>';
}
var HEAD='<div class="row head"><div>Centro</div><div>Código</div><div>Práctica</div><div style="text-align:right">Valor</div><div class="c-act"></div></div>';
function render(){
  var q=$("q").value, centro=$("centro").value;
  $("clear").hidden=!q;
  var key=q+"|"+centro;
  if(key!==S.lastKey){ S.shown=PAGE; S.lastKey=key; }
  var res=search(q,centro), h="";
  if(res.mode==="none"){
    if(centro){
      var list=res.base.slice().sort($("orden").value==="practica"?function(a,b){return a.practica.localeCompare(b.practica)}:cmpOrden());
      h+=statusHtml(list.length.toLocaleString("es-AR")+' prácticas');
      S.lastList={q:"",centro:centro,items:list,total:list.length,best:null}; updPrintBtn();
      h+=sec("Todas las prácticas de "+esc(centro),"", list.slice(0,S.shown), null, "");
      if(list.length>S.shown) h+=moreBtn(list.length-S.shown);
    } else { S.lastList=null; updPrintBtn(); h+=welcome(); }
    $("out").innerHTML=h; return;
  }
  var total=res.full.length+res.partial.length, best=null;
  for(var i=0;i<res.main.length;i++){ if(res.main[i].valor>0){best=res.main[i];break;} }
  var co=cmpOrden();
  if(co!==cmpVal){ res.main=res.main.slice().sort(co); res.other=res.other.slice().sort(co); res.partial=res.partial.slice().sort(function(a,b){return (b._h-a._h)||co(a,b)}); }
  h+=statusHtml(total
    ? (function(n){return n.toLocaleString("es-AR")+(n===1?' coincidencia':' coincidencias')})(res.full.length||res.partial.length)
    : 'Sin coincidencias');
  if(best){
    var withVal=res.main.filter(function(r){return r.valor>0}).sort(cmpVal), cmp="";
    if(withVal.length>1){ var mx=withVal[withVal.length-1]; cmp='<div class="cmp">'+withVal.length+' opciones con valor · la más cara: '+fmt.format(mx.valor)+' ('+esc(mx.centro)+')</div>'; }
    h+='<section class="best" aria-label="Opción más económica"><div class="lbl">Opción más económica</div>'+
       '<div class="pr">'+hl(best.practica,res.words)+'</div><div class="val">'+fmt.format(best.valor)+'</div>'+
       '<div class="meta"><strong>'+esc(best.centro)+'</strong>'+(best.codigo?'<span>Código '+esc(best.codigo)+'</span>':'')+'</div>'+cmp+'</section>';
  } else if(total){
    h+='<div class="warn">No hay coincidencias completas con valor numérico. Revisá la lista de abajo.</div>';
  }
  if(!total) h+='<div class="empty"><h3>No encontramos «'+esc(q)+'»</h3>Probá con menos palabras, el comienzo de la palabra (ej. «eco», «reso») o el código.'+(centro?'<br><br><button class="btn" type="button" data-allc="1">Buscar en todos los centros</button>':'')+'</div>';
  res.other.forEach(function(r){r._sec=1}); res.main.forEach(function(r){r._sec=0}); res.partial.forEach(function(r){r._sec=1});
  S.lastList={q:q.trim(),centro:centro,items:res.main.concat(res.other,res.partial),total:total,full:res.full.length,best:best}; updPrintBtn();
  var budget=S.shown;
  var ordTxt={asc:"de menor a mayor valor",desc:"de mayor a menor valor",centro:"por centro",practica:"por práctica"}[$("orden").value];
  var w0=esc(res.words[0]||"");
  if(res.main.length){ h+=sec(res.mode==="code"?"Coincidencias por código":(res.other.length?"Coincidencias principales":"Coincidencias completas"), res.main.length+" · "+ordTxt, res.main.slice(0,budget), res.words, "", best); budget-=res.main.length; }
  if(res.other.length && budget>0){ h+=sec("También mencionan «"+w0+"»", res.other.length+" · la palabra aparece dentro de otra práctica", res.other.slice(0,budget), res.words, "partial"); budget-=res.other.length; }
  if(res.partial.length && budget>0) h+=sec("Coincidencias parciales", res.partial.length+" · contienen algunas de las palabras", res.partial.slice(0,budget), res.words, "partial");
  if(total>S.shown) h+=moreBtn(total-S.shown);
  $("out").innerHTML=h;
}
function moreBtn(n){ return '<div class="more"><button class="btn" type="button" id="bMore">Mostrar más ('+n.toLocaleString("es-AR")+' restantes)</button></div>'; }
function statusHtml(t){ $("count").innerHTML=t; return ""; }
function sec(title, sub, rows, words, cls, best){
  if(!rows.length) return "";
  var h='<section class="sec"><h2>'+title+(sub?' <span>'+sub+'</span>':'')+'</h2><div class="tbl">'+HEAD;
  for(var i=0;i<rows.length;i++) h+=rowHtml(rows[i],words,cls+(best&&rows[i]===best?" cheap":""));
  return h+'</div></section>';
}
function counts(){ var c={}; S.rows.forEach(function(r){c[r.centro]=(c[r.centro]||0)+1}); return c; }
function welcome(){
  var c=counts(), names=Object.keys(c).sort(function(a,b){return a.localeCompare(b)});
  return statusHtml(S.rows.length.toLocaleString("es-AR")+' prácticas · '+names.length+' centros')+
    '<div class="status"><div class="tips">Probá: '+
    ["ecografía abdomen","resonancia rodilla","holter","180112","tomografía tórax"].map(function(s){return '<button class="chip" type="button" data-q="'+esc(s)+'">'+esc(s)+'</button>'}).join("")+
    '</div></div><section class="sec"><h2>Centros cargados <span>· tocá uno para ver todas sus prácticas</span></h2><div class="centros">'+
    names.map(function(n){ var la=lastAum(n); return '<button type="button" data-c="'+esc(n)+'"><span class="cn"><b>'+esc(n)+'</b>'+(la?'<small>Últ. aumento '+String(la.pct).replace(".",",")+'% · '+fechaCorta(la.fecha)+'</small>':'')+'</span><span>'+c[n]+'</span></button>'}).join("")+'</div></section>';
}
function fillCentros(){
  var sel=$("centro"), cur=sel.value, names=Object.keys(counts()).sort(function(a,b){return a.localeCompare(b)});
  sel.innerHTML='<option value="">Todos los centros</option>'+names.map(function(n){return '<option>'+esc(n)+'</option>'}).join("");
  if(names.indexOf(cur)>=0) sel.value=cur;
  var dl=$("dlCentros"); if(dl) dl.innerHTML=names.map(function(n){return '<option value="'+esc(n)+'">'}).join("");
}
var MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function setVig(v){
  S.vigencia=v||""; var t="—"; if(v){ var p=v.split("-"); t=Number(p[2])+" de "+MESES[Number(p[1])-1]+" de "+p[0]; }
  $("vig").innerHTML='Valores vigentes al <b>'+t+'</b>';
}

/* ---------- eventos ---------- */
var tmr=null;
$("q").addEventListener("input",function(){ clearTimeout(tmr); tmr=setTimeout(render,60); });
$("q").addEventListener("keydown",function(e){ if(e.key==="Escape"){ this.value=""; render(); }});
$("clear").addEventListener("click",function(){ $("q").value=""; render(); $("q").focus(); });
$("centro").addEventListener("change",render);
$("orden").addEventListener("change",render);
$("out").addEventListener("click",function(e){
  var b=e.target.closest("button"); if(!b) return;
  if(b.id==="bMore"){ S.shown+=PAGE*2; render(); return; }
  if(b.dataset.q){ $("q").value=b.dataset.q; render(); $("q").focus(); return; }
  if(b.dataset.c){ $("centro").value=b.dataset.c; render(); return; }
  if(b.dataset.allc){ $("centro").value=""; render(); return; }
  if(b.dataset.act){
    var id=b.closest(".row").dataset.id, r=S.rows.find(function(x){return String(x.id)===id});
    if(r){ if(b.dataset.act==="edit") openEdit(r); else openDel(r); }
  }
});
var sb=$("sb");


/* ---------- modales ---------- */
function modal(html){
  $("modal").innerHTML='<div class="ov" id="ov"><div class="dlg" role="dialog" aria-modal="true">'+html+'</div></div>';
  var ov=$("ov");
  ov.addEventListener("click",function(e){ if(e.target===ov || e.target.closest(".x,[data-close]")) closeModal(); });
  var f=ov.querySelector("input,textarea,button.btn"); if(f) setTimeout(function(){ if(!ov.contains(document.activeElement)) f.focus(); },30);
}
function closeModal(){ $("modal").innerHTML=""; }
document.addEventListener("keydown",function(e){ if(e.key==="Escape" && $("ov")) closeModal(); });
function hdr(t){ return '<header><h3>'+t+'</h3><button class="x" type="button" aria-label="Cerrar">×</button></header>'; }
function toast(t){ $("toastBox").innerHTML=""; var el=document.createElement("div"); el.className="toast"; el.textContent=t; $("toastBox").appendChild(el); setTimeout(function(){el.remove()},2800); }

/* ---------- administrador ---------- */
var CFG = window.BUSCADOR_CONFIG || {};
var GH = {owner:"", repo:"", branch:"main", path:"datos.json", token:null, user:""};
(function(){
  var h=location.hostname, seg=location.pathname.split("/").filter(Boolean);
  if(/\.github\.io$/i.test(h)){ GH.owner=h.split(".")[0]; GH.repo=(seg.length && !/\.html?$/i.test(seg[0])) ? seg[0] : h; }
  ["owner","repo","branch","path"].forEach(function(k){ if(CFG[k]) GH[k]=CFG[k]; });
})();
var LS={get:function(k){try{return localStorage.getItem(k)}catch(_){return null}}, set:function(k,v){try{localStorage.setItem(k,v)}catch(_){}}, del:function(k){try{localStorage.removeItem(k)}catch(_){}}};
function storedToken(){ var t=null; try{ t=sessionStorage.getItem("samiTok"); }catch(_){} return t || LS.get("samiTok"); }
function ghApi(method,url,body){
  return fetch("https://api.github.com/repos/"+GH.owner+"/"+GH.repo+url,{method:method,cache:"no-store",
    headers:{"Authorization":"Bearer "+GH.token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},
    body:body?JSON.stringify(body):undefined
  }).then(function(r){
    if(!r.ok) return r.json().catch(function(){return {};}).then(function(j){ var e=new Error(j.message||("Error "+r.status)); e.status=r.status; throw e; });
    return r.status===204?null:r.json();
  });
}
function headInfo(){
  var info={};
  return ghApi("GET","/git/ref/heads/"+encodeURIComponent(GH.branch)).then(function(ref){
    info.commit=ref.object.sha; return ghApi("GET","/git/commits/"+info.commit);
  }).then(function(c){
    info.tree=c.tree.sha; return ghApi("GET","/git/trees/"+info.tree+"?recursive=1");
  }).then(function(t){
    var f=(t.tree||[]).filter(function(x){return x.path===GH.path})[0]; info.blob=f?f.sha:null; return info;
  });
}
function ghMsg(e){
  if(!e) return "Error desconocido.";
  if(e.status===401) return "La clave no es válida o venció. Generá una nueva en GitHub.";
  if(e.status===403) return "La clave no tiene permiso para escribir en el repositorio (Contents: Read and write).";
  if(e.status===404) return "No se encontró el repositorio «"+GH.owner+"/"+GH.repo+"» o la clave no tiene acceso a él.";
  if(e.status===409||e.status===422) return "El repositorio cambió mientras publicabas. Recargá la página y volvé a intentar.";
  if(e instanceof TypeError) return "No hay conexión con GitHub. Revisá internet y probá de nuevo.";
  return e.message||String(e);
}
function login(tok,remember){
  GH.token=tok;
  return ghApi("GET","").then(function(repo){
    if(!repo.permissions || !repo.permissions.push){ var e=new Error(""); e.status=403; throw e; }
    try{ sessionStorage.setItem("samiTok",tok); }catch(_){}
    if(remember) LS.set("samiTok",tok); else LS.del("samiTok");
    return true;
  }).catch(function(e){ GH.token=null; throw e; });
}
function setAdmin(on){
  S.admin=on;
  document.body.classList.toggle("admin-on",on);
  $("adminbar").hidden=!on;
  $("admTabTxt").textContent=on?"Salir de admin":"Administrador";
  updPend(); render();
}
function openLogin(err){
  var needRepo=!GH.owner||!GH.repo;
  modal(hdr("Acceso administrador")+
    '<form id="fLogin">'+
    (needRepo?'<div class="two"><div class="fld"><label for="lOwner">Usuario u organización de GitHub</label><input id="lOwner" required value="'+esc(GH.owner)+'"></div><div class="fld"><label for="lRepo">Repositorio</label><input id="lRepo" required value="'+esc(GH.repo)+'"></div></div>':'')+
    '<div class="fld"><label for="lTok">Clave de GitHub (token)</label><input id="lTok" type="password" autocomplete="off" required placeholder="github_pat_…"><small>Es el token con permiso de escritura sobre el repositorio <b>'+esc(GH.owner&&GH.repo?GH.owner+"/"+GH.repo:"del buscador")+'</b>. Está explicado en el README.</small></div>'+
    '<label class="chk"><input type="checkbox" id="lRem"><span>Recordar en este equipo (no lo marques en computadoras compartidas)</span></label>'+
    '<div class="err" id="err">'+(err?esc(err):"")+'</div><div class="acts"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="submit">Ingresar</button></div></form>');
  $("fLogin").addEventListener("submit",function(e){
    e.preventDefault(); var f=this; f.querySelectorAll("button").forEach(function(b){b.disabled=true});
    if(needRepo){ GH.owner=$("lOwner").value.trim(); GH.repo=$("lRepo").value.trim(); }
    login($("lTok").value.trim(), $("lRem").checked).then(function(){
      closeModal(); setAdmin(true); toast("Modo administrador activado");
    }).catch(function(er){ f.querySelectorAll("button").forEach(function(b){b.disabled=false}); $("err").textContent=ghMsg(er); });
  });
}
function tryAuto(){
  var t=storedToken(); if(!t) return Promise.resolve(false);
  return login(t, !!LS.get("samiTok")).then(function(){ setAdmin(true); return true; }).catch(function(){ try{sessionStorage.removeItem("samiTok")}catch(_){} return false; });
}
$("admTab").addEventListener("click",function(){
  if(S.admin){ exitAdmin(); return; }
  tryAuto().then(function(ok){ if(ok) toast("Modo administrador activado"); else openLogin(); });
});
$("bOut").addEventListener("click",exitAdmin);
function exitAdmin(){
  if(S.dirty){
    modal(hdr("Tenés cambios sin publicar")+'<form><p style="margin:0">Hay '+S.dirty+' cambio(s) que todavía no se publicaron. Si salís ahora se pierden.</p><div class="acts"><button class="btn" type="button" id="xDisc">Salir sin publicar</button><button class="btn pri" type="button" id="xPub">Publicar y salir</button></div></form>');
    $("xDisc").onclick=function(){ discard(); closeModal(); setAdmin(false); };
    $("xPub").onclick=function(){ closeModal(); publish(); };
    return;
  }
  setAdmin(false); toast("Saliste del modo administrador");
}
function markDirty(id){
  S.dirty++; if(id!=null) S.changed[id]=1;
  ss.set("samiDraft",{rows:S.rows.map(clean), vigencia:S.vigencia, hist:S.hist, dirty:S.dirty, changed:S.changed});
  updPend();
}
function updPend(){
  $("pend").classList.toggle("on", S.admin && S.dirty>0);
  $("pendTxt").textContent=S.dirty+(S.dirty===1?" cambio sin publicar":" cambios sin publicar");
}
function discard(){
  S.rows=DB.rows.map(function(r){return prep(Object.assign({},r))}); setVig(DB.vigencia); S.hist=(DB.hist||[]).slice();
  S.dirty=0; S.changed={}; ss.del("samiDraft"); fillCentros(); updPend(); render();
}
$("bDiscard").addEventListener("click",function(){
  modal(hdr("Descartar cambios")+'<form><p style="margin:0">Se deshacen los '+S.dirty+' cambio(s) sin publicar y la base vuelve a como estaba.</p><div class="acts"><button class="btn" type="button" data-close>Cancelar</button><button class="btn dng" type="button" id="dOk">Descartar</button></div></form>');
  $("dOk").onclick=function(){ discard(); closeModal(); toast("Cambios descartados"); };
});

/* publicar: guarda datos.json en el repositorio de GitHub (un commit) */
function dataText(){
  var rows=S.rows.map(clean);
  return '{"vigencia":'+JSON.stringify(S.vigencia)+',"hist":'+JSON.stringify(S.hist)+',"rows":[\n'+rows.map(function(r){return JSON.stringify(r)}).join(",\n")+'\n]}\n';
}
function b64utf8(str){ var by=new TextEncoder().encode(str), bin="", CH=0x8000; for(var i=0;i<by.length;i+=CH) bin+=String.fromCharCode.apply(null,by.subarray(i,i+CH)); return btoa(bin); }
$("bPub").addEventListener("click",function(){ publish(false); });
function publish(force){
  if(!GH.token){ openLogin(); return; }
  var b=$("bPub"); b.disabled=true; b.textContent="Publicando…";
  var txt=dataText(), info;
  headInfo().then(function(i){
    info=i;
    if(!force && S.loadedSha && info.blob && info.blob!==S.loadedSha){ var e=new Error("conflict"); e.conflict=true; throw e; }
    return ghApi("POST","/git/blobs",{content:b64utf8(txt),encoding:"base64"});
  }).then(function(blob){
    info.newBlob=blob.sha;
    return ghApi("POST","/git/trees",{base_tree:info.tree,tree:[{path:GH.path,mode:"100644",type:"blob",sha:blob.sha}]});
  }).then(function(tree){
    var msg="Actualiza base: "+S.dirty+(S.dirty===1?" cambio":" cambios")+" ("+hoyISO()+")";
    return ghApi("POST","/git/commits",{message:msg,tree:tree.sha,parents:[info.commit]});
  }).then(function(c){
    return ghApi("PATCH","/git/refs/heads/"+encodeURIComponent(GH.branch),{sha:c.sha,force:false});
  }).then(function(){
    S.loadedSha=info.newBlob; DB=JSON.parse(txt);
    ss.del("samiDraft"); S.dirty=0; S.changed={}; updPend(); render();
    b.disabled=false; b.textContent="Publicar cambios";
    toast("Publicado. El sitio se actualiza para todos en 1 o 2 minutos.");
  }).catch(function(e){
    b.disabled=false; b.textContent="Publicar cambios";
    if(e && e.conflict){
      modal(hdr("Alguien publicó antes que vos")+'<form><p style="margin:0">La base en GitHub cambió desde que abriste la página. Si publicás igual, <b>se pisan esos cambios</b> con los tuyos.</p><p style="margin:0">Lo más seguro: tocá «Descargar base» para guardar tus cambios, recargá la página y volvé a hacerlos.</p><div class="acts"><button class="btn" type="button" data-close>Cancelar</button><button class="btn dng" type="button" id="fPubF">Publicar igual</button></div></form>');
      $("fPubF").onclick=function(){ closeModal(); publish(true); };
      return;
    }
    if(e && e.status===401){ GH.token=null; LS.del("samiTok"); try{sessionStorage.removeItem("samiTok")}catch(_){} openLogin(ghMsg(e)); return; }
    modal(hdr("No se pudo publicar")+'<form><div class="note-ro">'+esc(ghMsg(e))+'</div><p style="margin:0">Tus cambios siguen guardados en esta pestaña.</p><div class="acts"><button class="btn pri" type="button" data-close>Entendido</button></div></form>');
  });
}
function saveFile(name,blob){ var u=URL.createObjectURL(blob), a=document.createElement("a"); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(u)},5000); }

/* alta / edición */
function nextId(){ var m=0; S.rows.forEach(function(r){ if(Number(r.id)>m) m=Number(r.id); }); return m+1; }
function openEdit(r){
  var nuevo=!r; r=r||{centro:$("centro").value||"",codigo:"",practica:$("q").value.toUpperCase(),valor:null,nota:""};
  modal(hdr(nuevo?"Agregar práctica":"Editar práctica")+
    '<form id="fEd">'+
    '<div class="fld"><label for="eCentro">Centro</label><input id="eCentro" list="dlCentros" required value="'+esc(r.centro)+'"><datalist id="dlCentros"></datalist><small>Elegí uno existente o escribí uno nuevo.</small></div>'+
    '<div class="fld"><label for="ePr">Práctica</label><textarea id="ePr" rows="2" required>'+esc(r.practica)+'</textarea></div>'+
    '<div class="two"><div class="fld"><label for="eCod">Código</label><input id="eCod" value="'+esc(r.codigo)+'" placeholder="Opcional"></div>'+
    '<div class="fld"><label for="eVal">Valor ($)</label><input id="eVal" inputmode="decimal" value="'+(r.valor>0?r.valor:"")+'" placeholder="Ej.: 45230"></div></div>'+
    '<div class="fld"><label for="eNota">Nota</label><input id="eNota" value="'+esc(r.nota||"")+'" placeholder="Ej.: presupuesto, kairos, no incluye IVA"><small>Si no hay valor, este texto se muestra en lugar del precio.</small></div>'+
    '<div class="err" id="err"></div><div class="acts"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="submit">'+(nuevo?"Agregar":"Guardar")+'</button></div></form>');
  fillCentros();
  $("fEd").addEventListener("submit",function(e){
    e.preventDefault();
    var v=$("eVal").value.trim().replace(/\$/g,"").replace(/\s/g,"");
    if(/,/.test(v)) v=v.replace(/\./g,"").replace(",","."); else if(/^\d{1,3}(\.\d{3})+$/.test(v)) v=v.replace(/\./g,"");
    if(v && isNaN(Number(v))){ $("err").textContent="El valor tiene que ser un número (ej.: 45230). Si es un texto como «presupuesto», ponelo en Nota."; return; }
    var o={centro:$("eCentro").value.trim().replace(/\s+/g," "), codigo:$("eCod").value.trim(), practica:$("ePr").value.trim().replace(/\s+/g," "), valor:v?Math.round(Number(v)):"", nota:$("eNota").value.trim()};
    if(!o.centro||!o.practica){ $("err").textContent="Completá centro y práctica."; return; }
    if(nuevo){ o.id=nextId(); S.rows.push(prep(o)); }
    else { Object.assign(r,o); prep(r); }
    markDirty(nuevo?o.id:r.id); fillCentros(); closeModal(); render();
    toast(nuevo?"Práctica agregada · falta publicar":"Cambio guardado · falta publicar");
  });
}
$("bAdd").addEventListener("click",function(){ openEdit(null); });
function openDel(r){
  modal(hdr("Eliminar práctica")+
    '<form id="fDel"><div class="confirm"><b>'+esc(r.practica)+'</b>'+esc(r.centro)+(r.codigo?' · Código '+esc(r.codigo):'')+(r.valor>0?' · '+fmt.format(r.valor):'')+'</div>'+
    '<p style="margin:0">Se quita de la base. Se hace efectivo para todos cuando publiques los cambios.</p>'+
    '<div class="acts"><button class="btn" type="button" data-close>Cancelar</button><button class="btn dng" type="submit">Eliminar</button></div></form>');
  $("fDel").addEventListener("submit",function(e){
    e.preventDefault();
    S.rows=S.rows.filter(function(x){return x!==r});
    markDirty(null); fillCentros(); closeModal(); render(); toast("Práctica eliminada · falta publicar");
  });
}
$("bVig").addEventListener("click",function(){
  modal(hdr("Fecha de vigencia")+
    '<form id="fVig"><div class="fld"><label for="vDate">Última actualización de la base</label><input id="vDate" type="date" required value="'+esc(S.vigencia)+'"><small>Se muestra arriba a la derecha para todos.</small></div>'+
    '<div class="acts"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="submit">Guardar</button></div></form>');
  $("fVig").addEventListener("submit",function(e){ e.preventDefault(); setVig($("vDate").value); markDirty(null); closeModal(); toast("Vigencia cambiada · falta publicar"); });
});


/* aumentar valores de un centro por porcentaje */
function pctNum(t){ t=String(t||"").replace("%","").replace(/\s/g,"").replace(",","."); var n=Number(t); return isFinite(n)?n:NaN; }
function hoyISO(){ var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function lastAum(c){ for(var i=S.hist.length-1;i>=0;i--) if(S.hist[i].centro===c) return S.hist[i]; return null; }
function fechaCorta(iso){ var p=iso.split("-"); return Number(p[2])+" "+MESES[Number(p[1])-1].slice(0,3)+" "+p[0]; }
$("bAum").addEventListener("click",function(){ openAum({centro:$("centro").value||"", pct:"", solo:"", excl:"", red:"1", vig:true}); });
function openAum(st){
  var names=Object.keys(counts()).sort(function(a,b){return a.localeCompare(b)});
  var la=st.centro?lastAum(st.centro):null;
  function sel(){
    var p=pctNum(st.pct), solo=toks(st.solo).filter(function(w){return !STOP[w]}), ex=toks(st.excl).filter(function(w){return !STOP[w]});
    var has=function(r,ws){ return ws.some(function(w){ return r._t.some(function(t){return t.indexOf(w)===0}); }); };
    var all=function(r,ws){ return ws.every(function(w){ return r._t.some(function(t){return t.indexOf(w)===0}); }); };
    var base=S.rows.filter(function(r){ return r.centro===st.centro && r.valor>0; });
    var inc=base.filter(function(r){ return (!solo.length||all(r,solo)) && !(ex.length&&has(r,ex)); });
    var exc=base.filter(function(r){ return inc.indexOf(r)<0 && (!solo.length||all(r,solo)); });
    return {p:p, inc:inc, exc:exc};
  }
  function nuevo(v,p){ var red=Number(st.red)||1; return Math.round(v*(1+p/100)/red)*red; }
  function draw(){
    var s=sel(), ok=st.centro && isFinite(s.p) && s.p!==0 && s.inc.length;
    var prev=s.inc.slice().sort(function(a,b){return a.practica.localeCompare(b.practica)}).slice(0,6).map(function(r){
      return '<tr><td>'+esc(r.practica)+'</td><td class="n">'+fmt.format(r.valor)+'</td><td class="n"><b>'+(isFinite(s.p)?fmt.format(nuevo(r.valor,s.p)):"—")+'</b></td></tr>'; }).join("");
    var exTxt=s.exc.length?'<p class="isum" style="font-size:14px;color:var(--muted)">Quedan sin cambio: '+s.exc.slice(0,4).map(function(r){return esc(r.practica)+' ('+fmt.format(r.valor)+')'}).join(", ")+(s.exc.length>4?' y '+(s.exc.length-4)+' más':'')+'. Para ponerles un valor fijo, buscalas y usá el lápiz.</p>':'';
    modal(hdr("Aumentar valores")+
      '<form id="fAum">'+
      '<div class="two"><div class="fld"><label for="aCen">Centro</label><select id="aCen" class="isel"><option value="">Elegí un centro</option>'+names.map(function(n){return '<option'+(n===st.centro?' selected':'')+'>'+esc(n)+'</option>'}).join("")+'</select>'+(la?'<small>Último aumento: '+String(la.pct).replace(".",",")+'% el '+fechaCorta(la.fecha)+'</small>':'')+'</div>'+
      '<div class="fld"><label for="aPct">Aumento (%)</label><input id="aPct" inputmode="decimal" placeholder="Ej.: 1,9" value="'+esc(st.pct)+'"><small>Para una baja, poné un número negativo.</small></div></div>'+
      '<div class="two"><div class="fld"><label for="aSolo">Solo prácticas que contengan</label><input id="aSolo" placeholder="Vacío = todas las del centro" value="'+esc(st.solo)+'"></div>'+
      '<div class="fld"><label for="aExc">Dejar afuera las que contengan</label><input id="aExc" value="'+esc(st.excl)+'"><small>Separá varias palabras con espacio.</small></div></div>'+
      '<div class="two"><div class="fld"><label for="aRed">Redondeo</label><select id="aRed" class="isel"><option value="1"'+(st.red==="1"?" selected":"")+'>Al peso</option><option value="10"'+(st.red==="10"?" selected":"")+'>A $10</option><option value="100"'+(st.red==="100"?" selected":"")+'>A $100</option></select></div>'+
      '<label class="chk" style="align-self:end"><input type="checkbox" id="aVig"'+(st.vig?" checked":"")+'><span>Cambiar la fecha de vigencia a hoy</span></label></div>'+
      (st.centro?'<div class="ipv"><table><thead><tr><th>Práctica</th><th class="n">Ahora</th><th class="n">Queda</th></tr></thead><tbody>'+(prev||'<tr><td colspan="3">Ninguna práctica con valor coincide.</td></tr>')+'</tbody></table></div>'+
        '<p class="isum"><b>'+s.inc.length+'</b> prácticas de '+esc(st.centro)+' van a cambiar'+(isFinite(s.p)&&s.p?' un '+String(s.p).replace(".",",")+'%':'')+'.</p>'+exTxt:'')+
      '<div class="err" id="err"></div><div class="acts"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="submit"'+(ok?'':' disabled')+'>Aplicar aumento</button></div></form>');
    $("ov").querySelector(".dlg").classList.add("wide");
    var bind=function(id,key,ev){ $(id).addEventListener(ev||"input",function(){ var pos=this.selectionStart; st[key]=this.type==="checkbox"?this.checked:this.value; draw(); var el=$(id); if(el){ el.focus(); try{ if(pos!=null) el.setSelectionRange(pos,pos); }catch(_){} } }); };
    bind("aCen","centro","change"); bind("aPct","pct"); bind("aSolo","solo"); bind("aExc","excl"); bind("aRed","red","change");
    $("aVig").addEventListener("change",function(){ st.vig=this.checked; });
    $("fAum").addEventListener("submit",function(e){
      e.preventDefault(); var s=sel(); if(!(st.centro && isFinite(s.p) && s.p && s.inc.length)) return;
      s.inc.forEach(function(r){ r.valor=nuevo(r.valor,s.p); S.changed[r.id]=1; });
      var f=hoyISO(); S.hist.push({centro:st.centro, pct:s.p, fecha:f, n:s.inc.length});
      if(st.vig) setVig(f);
      markDirty(null); closeModal(); $("centro").value=st.centro; render();
      toast(s.inc.length+" prácticas de "+st.centro+" aumentadas "+String(s.p).replace(".",",")+"% · falta publicar");
    });
  }
  draw();
}

/* importar Excel: detecta columnas, muestra vista previa y suma las prácticas */
var XLSX_URL="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
function loadXlsx(){
  if(window.XLSX) return Promise.resolve();
  return new Promise(function(res,rej){ var sc=document.createElement("script"); sc.src=XLSX_URL; sc.onload=res; sc.onerror=function(){rej()}; document.head.appendChild(sc); });
}
var fileIn=document.createElement("input"); fileIn.type="file"; fileIn.accept=".xlsx,.xls,.xlsm,.csv"; fileIn.multiple=true; fileIn.hidden=true; document.body.appendChild(fileIn);
$("bImp").addEventListener("click",function(){ fileIn.value=""; fileIn.click(); });
fileIn.addEventListener("change",function(){
  var files=Array.prototype.slice.call(fileIn.files); if(!files.length) return;
  toast("Leyendo archivo…");
  loadXlsx().then(function(){ nextFile(files,0); }).catch(function(){ toast("No se pudo cargar el lector de Excel. Revisá la conexión y probá de nuevo."); });
});
function nextFile(files,i){
  if(i>=files.length) return;
  var f=files[i], rd=new FileReader();
  rd.onload=function(){
    try{ var wb=XLSX.read(rd.result,{type:"array"}); openImport(f.name,wb,function(){ nextFile(files,i+1); }); }
    catch(e){ toast("No se pudo leer «"+f.name+"»."); nextFile(files,i+1); }
  };
  rd.readAsArrayBuffer(f);
}
function cleanName(n){ return n.replace(/\.[^.]+$/,"").replace(/\(\d+\)/g,"").replace(/[_\-]+/g," ").replace(/\bcopia( de)?\b/gi,"").replace(/\b(19|20)\d{2}\b/g,"").replace(/\b(valores|aranceles|precios|convenio|tarifas?)\b/gi,"").replace(/\s+/g," ").trim(); }
function colName(i){ var s=""; i++; while(i>0){ var m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }
function cellStr(v){ return v==null?"":String(v).trim(); }
function parseMoney(v){
  if(typeof v==="number") return isFinite(v)?v:null;
  var s=cellStr(v); if(!s || /%/.test(s)) return null;
  s=s.replace(/\$|ars|\s/gi,"");
  if(!/^-?[\d.,]+$/.test(s)) return null;
  if(/,\d{1,2}$/.test(s)) s=s.replace(/\./g,"").replace(",","."); else if(/\.\d{3}(\.|$)/.test(s) || /,\d{3}(,|$)/.test(s)) s=s.replace(/[.,](?=\d{3}(\D|$))/g,"");
  var n=Number(s.replace(",",".")); return isFinite(n)?n:null;
}
var RX={cod:/^(c[oó]d|nomenc|n[º°o]\.?\s*pr)/i, pr:/(pr[aá]ctica|prestaci|descrip|detalle|estudio|nombre|concepto)/i, val:/(valor|precio|importe|monto|total|arancel|honorario|\$)/i};
function detect(rows){
  var hdr=-1, map={cod:-1,pr:-1,val:-1};
  for(var r=0;r<Math.min(rows.length,20);r++){
    var m={cod:-1,pr:-1,val:-1}, hits=0;
    rows[r].forEach(function(c,ci){ var t=cellStr(c); if(!t||t.length>40) return;
      if(m.cod<0&&RX.cod.test(t)){m.cod=ci;hits++;} else if(m.pr<0&&RX.pr.test(t)){m.pr=ci;hits++;} else if(RX.val.test(t)){ if(m.val<0)hits++; m.val=ci; } });
    if(hits>=2 && m.pr>=0){ hdr=r; map=m; break; }
  }
  var body=rows.slice(hdr+1), ncol=0; body.forEach(function(r){ if(r.length>ncol) ncol=r.length; });
  if(hdr<0){
    var st=[]; for(var c=0;c<ncol;c++) st.push({code:0,txt:0,len:0,num:0,n:0});
    body.slice(0,400).forEach(function(r){ for(var c=0;c<ncol;c++){ var v=r[c], s=cellStr(v); if(!s) continue; var o=st[c]; o.n++;
      if(/^\d{3,7}([\/\-]\d+)?[a-z]{0,2}$/i.test(s) && !(typeof v==="number" && v%1!==0)) o.code++;
      var pm=parseMoney(v); if(pm!=null && pm>50) o.num++;
      if(/[a-záéíóúñ]{3}/i.test(s)){ o.txt++; o.len+=s.length; } } });
    var best=function(score,excl){ var bi=-1,bs=0; st.forEach(function(o,c){ if(excl.indexOf(c)>=0) return; var s=score(o); if(s>bs){bs=s;bi=c;} }); return bi; };
    map.pr=best(function(o){return o.txt*(o.len/Math.max(o.txt,1))},[]);
    map.cod=best(function(o){return o.code>o.n*.5?o.code:0},[map.pr]); if(map.cod>map.pr) map.cod=-1;
    var ex=[map.pr,map.cod]; for(var c=0;c<=map.pr;c++) ex.push(c); map.val=best(function(o){return o.num>o.n*.3?o.num:0},ex); if(map.val<0) map.val=best(function(o){return o.num>o.n*.3?o.num:0},[map.pr,map.cod]);
  }
  return {hdr:hdr, map:map, ncol:Math.max(ncol,1)};
}
function buildRows(rows,d,map){
  var out=[], seen={}, sinVal=0;
  rows.slice(d.hdr+1).forEach(function(r){
    var pr=map.pr>=0?cellStr(r[map.pr]).replace(/\s+/g," "):""; if(pr.length<2) return;
    var codRaw=map.cod>=0?r[map.cod]:"", cod=typeof codRaw==="number"?String(Math.round(codRaw)):cellStr(codRaw);
    var vr=map.val>=0?r[map.val]:"", v=parseMoney(vr), nota="";
    if(v==null||v<=0){ v=null; nota=cellStr(vr); }
    if(v==null && !nota && !cod) return;          // títulos de sección
    if(RX.pr.test(pr) && RX.val.test(cellStr(vr))) return; // encabezado repetido
    if(v==null) sinVal++;
    var k=norm(cod+"|"+pr);
    if(seen[k]){ if(v!=null && (seen[k].valor==null || v<seen[k].valor)){ seen[k].valor=Math.round(v); seen[k].nota=""; } return; }
    var o={codigo:cod, practica:pr, valor:v==null?"":Math.round(v), nota:nota}; seen[k]=o; out.push(o);
  });
  return {rows:out, sinVal:sinVal};
}
function openImport(fname,wb,done){
  var sheets=wb.SheetNames.filter(function(n){ var ws=wb.Sheets[n]; return ws && ws["!ref"]; });
  var st={sheet:sheets[0]}, rows, d, map;
  function load(){ rows=XLSX.utils.sheet_to_json(wb.Sheets[st.sheet],{header:1,raw:true,defval:""}); d=detect(rows); map={cod:d.map.cod,pr:d.map.pr,val:d.map.val}; }
  load();
  var names=Object.keys(counts());
  function colOpts(sel){ var h='<option value="-1">— ninguna —</option>'; for(var c=0;c<d.ncol;c++){ var lab=d.hdr>=0?cellStr(rows[d.hdr][c]):""; if(!lab){ for(var r=d.hdr+1;r<Math.min(rows.length,d.hdr+15);r++){ if(cellStr(rows[r][c])){ lab=cellStr(rows[r][c]); break; } } } h+='<option value="'+c+'"'+(c===sel?' selected':'')+'>Col. '+colName(c)+(lab?' · '+esc(lab.slice(0,28)):'')+'</option>'; } return h; }
  function draw(){
    var res=buildRows(rows,d,map), cen=($("iCen")&&$("iCen").value)||cleanName(fname), exists=names.indexOf(cen)>=0;
    var prev=res.rows.slice(0,6).map(function(o){ return '<tr><td>'+esc(o.codigo)+'</td><td>'+esc(o.practica)+'</td><td class="n">'+(o.valor!==""?fmt.format(o.valor):'<i>'+esc(o.nota)+'</i>')+'</td></tr>'; }).join("");
    modal(hdr("Importar «"+esc(fname)+"»")+
      '<form id="fImp">'+
      (sheets.length>1?'<div class="fld"><label for="iSheet">Hoja del archivo</label><select id="iSheet" class="isel">'+sheets.map(function(n){return '<option'+(n===st.sheet?' selected':'')+'>'+esc(n)+'</option>'}).join("")+'</select></div>':'')+
      '<div class="fld"><label for="iCen">Centro</label><input id="iCen" list="dlCentros" required value="'+esc(cen)+'"><datalist id="dlCentros"></datalist><small>Sale del nombre del archivo. Corregilo si hace falta.</small></div>'+
      '<div class="three"><div class="fld"><label for="iCod">Columna código</label><select id="iCod" class="isel">'+colOpts(map.cod)+'</select></div>'+
      '<div class="fld"><label for="iPr">Columna práctica</label><select id="iPr" class="isel">'+colOpts(map.pr)+'</select></div>'+
      '<div class="fld"><label for="iVal">Columna valor</label><select id="iVal" class="isel">'+colOpts(map.val)+'</select></div></div>'+
      '<div class="ipv"><table><thead><tr><th>Código</th><th>Práctica</th><th class="n">Valor</th></tr></thead><tbody>'+(prev||'<tr><td colspan="3">No se encontraron prácticas con estas columnas.</td></tr>')+'</tbody></table></div>'+
      '<p class="isum"><b>'+res.rows.length.toLocaleString("es-AR")+'</b> prácticas para cargar'+(res.sinVal?' · '+res.sinVal+' sin valor numérico (el texto queda como nota)':'')+'</p>'+
      '<label class="chk" id="iRepW"'+(exists?'':' hidden')+'><input type="checkbox" id="iRep" checked><span>Reemplazar las prácticas que ya tiene <b id="iRepN">'+esc(cen)+'</b>. Si no lo marcás, se suman a las existentes.</span></label>'+
      '<div class="acts"><button class="btn" type="button" data-close>'+'Omitir este archivo</button><button class="btn pri" type="submit"'+(res.rows.length?'':' disabled')+'>Cargar prácticas</button></div></form>');
    $("dlCentros").innerHTML=names.map(function(n){return '<option value="'+esc(n)+'">'}).join("");
    var ov=$("ov"); ov.querySelector(".dlg").classList.add("wide");
    ov.addEventListener("click",function(e){ if(e.target===ov||e.target.closest(".x,[data-close]")) setTimeout(done,0); });
    if($("iSheet")) $("iSheet").onchange=function(){ st.sheet=this.value; load(); draw(); };
    ["iCod","iPr","iVal"].forEach(function(id,k){ $(id).onchange=function(){ map[["cod","pr","val"][k]]=Number(this.value); draw(); }; });
    $("iCen").oninput=function(){ var ex=names.indexOf(this.value.trim())>=0; $("iRepW").hidden=!ex; $("iRepN").textContent=this.value.trim(); };
    $("fImp").addEventListener("submit",function(e){
      e.preventDefault();
      var centro=$("iCen").value.trim().replace(/\s+/g," "); if(!centro){ $("iCen").focus(); return; }
      var rep=names.indexOf(centro)>=0 && $("iRep").checked, quitadas=0;
      if(rep){ var before=S.rows.length; S.rows=S.rows.filter(function(r){return r.centro!==centro}); quitadas=before-S.rows.length; }
      var id=nextId();
      res.rows.forEach(function(o){ o.id=id++; o.centro=centro; S.rows.push(prep(o)); S.changed[o.id]=1; });
      markDirty(null); fillCentros(); closeModal(); $("centro").value=centro; render();
      toast(res.rows.length+" prácticas de "+centro+(rep?" (reemplazan "+quitadas+")":"")+" · falta publicar");
      setTimeout(done,300);
    });
  }
  draw();
}

/* imprimir: genera un PDF con hasta 20 ítems de la búsqueda actual */
var PDFLIB_URL="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
var LOGO_COLOR="logo.png";
function loadPdfLib(){
  if(window.PDFLib) return Promise.resolve();
  return new Promise(function(res,rej){ var sc=document.createElement("script"); sc.src=PDFLIB_URL; sc.onload=res; sc.onerror=function(){rej()}; document.head.appendChild(sc); });
}
function winAnsi(s){
  return String(s==null?"":s).replace(/[–—]/g,"-").replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/•/g,"-").replace(/[  ]/g," ").replace(/[^\x20-\x7e¡-ÿ]/g,"");
}
function wrap(text,font,size,maxW){
  var words=winAnsi(text).split(/\s+/), lines=[], cur="";
  words.forEach(function(w){
    var t=cur?cur+" "+w:w;
    if(font.widthOfTextAtSize(t,size)<=maxW){ cur=t; return; }
    if(cur) lines.push(cur);
    while(font.widthOfTextAtSize(w,size)>maxW && w.length>1){ var k=w.length; while(k>1 && font.widthOfTextAtSize(w.slice(0,k),size)>maxW) k--; lines.push(w.slice(0,k)); w=w.slice(k); }
    cur=w;
  });
  if(cur) lines.push(cur);
  return lines.length?lines:[""];
}
function money(v){ return winAnsi(fmt.format(v)); }
function updPrintBtn(){ var L=S.lastList; $("bPrint").hidden=!(L && L.items.length); }
$("bPrint").addEventListener("click",function(){
  var L=S.lastList; if(!L || !L.items.length) return;
  var b=this; b.disabled=true;
  loadPdfLib().then(function(){ return buildPdf(L); }).then(function(bytes){
    var name="Busqueda_"+(winAnsi(L.q||L.centro||"practicas").replace(/[^a-z0-9]+/gi,"_").replace(/^_|_$/g,"").slice(0,40)||"practicas")+"_"+hoyISO()+".pdf";
    var blob=new Blob([bytes],{type:"application/pdf"});
    var u=URL.createObjectURL(blob), w=null;
    try{ w=window.open(u,"_blank"); }catch(_){}
    if(!w){ saveFile(name,blob); toast("PDF descargado. Abrilo para imprimir."); }
    else toast("PDF abierto en otra pestaña: imprimilo desde ahí.");
  }).catch(function(){ toast("No se pudo generar el PDF. Revisá la conexión y probá de nuevo."); })
  .then(function(){ b.disabled=false; });
});
function buildPdf(L){
  var P=PDFLib, rgb=P.rgb;
  var NAVY=rgb(11/255,30/255,60/255), BLUE=rgb(15/255,68/255,144/255), GREEN=rgb(47/255,122/255,69/255), GREENBG=rgb(234/255,245/255,237/255), MUT=rgb(91/255,107/255,130/255), LINE=rgb(219/255,226/255,236/255), INK=rgb(22/255,35/255,58/255), ZEBRA=rgb(247/255,249/255,252/255);
  return P.PDFDocument.create().then(function(doc){
    return Promise.all([doc.embedFont(P.StandardFonts.Helvetica), doc.embedFont(P.StandardFonts.HelveticaBold), fetch(LOGO_COLOR).then(function(r){return r.arrayBuffer()}).then(function(b){return doc.embedPng(b)})]).then(function(a){
      var F=a[0], FB=a[1], logo=a[2];
      var W=595.28, H=841.89, M=36, page=doc.addPage([W,H]), y=H-M;
      var items=L.items.slice(0,20);
      function txt(p,t,x,yy,o){ o=o||{}; var f=o.bold?FB:F, s=o.size||9, tt=winAnsi(t); if(o.right) x=x-f.widthOfTextAtSize(tt,s); p.drawText(tt,{x:x,y:yy,size:s,font:f,color:o.color||INK}); }
      // encabezado
      var lh=40, lw=lh*logo.width/logo.height;
      page.drawImage(logo,{x:M,y:y-lh,width:lw,height:lh});
      page.drawLine({start:{x:M+lw+12,y:y-2},end:{x:M+lw+12,y:y-lh+2},thickness:.8,color:LINE});
      txt(page,"Buscador de prácticas",M+lw+24,y-16,{size:15,color:NAVY});
      txt(page,"Valores vigentes al "+$("vig").querySelector("b").textContent,M+lw+24,y-31,{size:9,color:MUT});
      var d=new Date(), hoy=d.getDate()+"/"+(d.getMonth()+1)+"/"+d.getFullYear()+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
      txt(page,"Impreso: "+hoy,W-M,y-16,{size:8.5,color:MUT,right:true});
      y-=lh+14;
      page.drawRectangle({x:M,y:y-2,width:W-2*M,height:1.2,color:rgb(91/255,165/255,107/255)});
      y-=18;
      // criterios
      var crit=[["Búsqueda",L.q?"«"+L.q+"»":"(sin texto)"],["Centro",L.centro||"Todos los centros"],["Orden",$("orden").selectedOptions[0].textContent]];
      var cx=M; crit.forEach(function(c){ txt(page,c[0].toUpperCase(),cx,y,{size:7,bold:true,color:MUT}); txt(page,c[1],cx,y-12,{size:10,bold:true}); cx+=Math.max(150,FB.widthOfTextAtSize(winAnsi(c[1]),10)+24); });
      y-=30;
      // opción más económica
      if(L.best){
        var bl=wrap(L.best.practica,FB,10.5,W-2*M-150), bh=42+bl.length*13;
        page.drawRectangle({x:M,y:y-bh,width:W-2*M,height:bh,color:GREENBG,borderColor:rgb(150/255,200/255,165/255),borderWidth:.8});
        txt(page,"OPCIÓN MÁS ECONÓMICA",M+12,y-14,{size:7.5,bold:true,color:GREEN});
        bl.forEach(function(l,i){ txt(page,l,M+12,y-28-i*13,{size:10.5,bold:true}); });
        txt(page,L.best.centro+(L.best.codigo?"  ·  Código "+L.best.codigo:""),M+12,y-bh+10,{size:8.5,color:MUT});
        txt(page,money(L.best.valor),W-M-12,y-bh/2-6,{size:17,bold:true,color:GREEN,right:true});
        y-=bh+16;
      }
      // tabla
      var cols=[{t:"#",w:20},{t:"CENTRO",w:110},{t:"CÓDIGO",w:62},{t:"PRÁCTICA",w:W-2*M-20-110-62-80},{t:"VALOR",w:80,right:true}];
      function head(p,yy){ p.drawRectangle({x:M,y:yy-16,width:W-2*M,height:18,color:NAVY}); var x=M; cols.forEach(function(c){ txt(p,c.t,c.right?x+c.w-6:x+6,yy-10.5,{size:7.5,bold:true,color:rgb(1,1,1),right:c.right}); x+=c.w; }); return yy-18; }
      y=head(page,y);
      items.forEach(function(r,i){
        var cl=wrap(r.centro,FB,8.5,cols[1].w-10), pl=wrap(r.practica,F,8.5,cols[3].w-10), vl=r.valor>0?[money(r.valor)]:wrap(r.nota||"Sin valor",F,8,cols[4].w-10);
        var n=Math.max(cl.length,pl.length,vl.length), rh=8+n*11;
        if(y-rh<M+30){ page=doc.addPage([W,H]); y=head(page,H-M); }
        if(i%2) page.drawRectangle({x:M,y:y-rh,width:W-2*M,height:rh,color:ZEBRA});
        var cheap=L.best && r===L.best, x=M, ty=y-11;
        txt(page,String(i+1),x+6,ty,{size:8.5,color:MUT}); x+=cols[0].w;
        cl.forEach(function(l,k){ txt(page,l,x+6,ty-k*11,{size:8.5,bold:true}); }); x+=cols[1].w;
        txt(page,r.codigo||"",x+6,ty,{size:8.5,color:MUT}); x+=cols[2].w;
        pl.forEach(function(l,k){ txt(page,l,x+6,ty-k*11,{size:8.5,color:r._sec?MUT:INK}); }); x+=cols[3].w;
        vl.forEach(function(l,k){ txt(page,l,x+cols[4].w-6,ty-k*11,{size:r.valor>0?9:8,bold:r.valor>0,color:cheap?GREEN:(r.valor>0?INK:MUT),right:true}); });
        y-=rh; page.drawLine({start:{x:M,y:y},end:{x:W-M,y:y},thickness:.5,color:LINE});
      });
      y-=14;
      var tot=L.total, pie="Se muestran "+items.length+" de "+tot.toLocaleString("es-AR")+(tot===1?" resultado":" resultados")+(L.full&&L.full<tot?" ("+L.full.toLocaleString("es-AR")+" con todas las palabras y "+(tot-L.full).toLocaleString("es-AR")+" parciales)":"")+". Orden: "+$("orden").selectedOptions[0].textContent.toLowerCase()+".";
      if(y<M+20){ page=doc.addPage([W,H]); y=H-M; }
      txt(page,pie,M,y,{size:8.5,color:MUT});
      txt(page,"Valores informados por cada centro. SAMI Osmecon La Matanza.",M,y-12,{size:7.5,color:MUT});
      return doc.save();
    });
  });
}

/* descargar la base como CSV (se abre con Excel) */
$("bCsv").addEventListener("click",function(){
  var q=function(s){ s=String(s==null?"":s); return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  var lines=["Centro;Código;Práctica;Valor;Nota"].concat(S.rows.slice().sort(function(a,b){return a.centro.localeCompare(b.centro)||a.practica.localeCompare(b.practica)}).map(function(r){ return [r.centro,r.codigo,r.practica,r.valor>0?r.valor:"",r.nota].map(q).join(";"); }));
  var csv="﻿"+lines.join("\r\n");
  var name="Base_practicas_"+(S.vigencia||"sin_fecha")+".csv";
  saveFile(name,new Blob([csv],{type:"text/csv;charset=utf-8"})); toast("Base descargada");
});

/* ---------- inicio ---------- */
function gitBlobSha(bytes){
  if(!(window.crypto && crypto.subtle)) return Promise.resolve(null);
  var head=new TextEncoder().encode("blob "+bytes.length+"\0"), all=new Uint8Array(head.length+bytes.length);
  all.set(head,0); all.set(bytes,head.length);
  return crypto.subtle.digest("SHA-1",all).then(function(h){ return Array.prototype.map.call(new Uint8Array(h),function(x){return ("0"+x.toString(16)).slice(-2)}).join(""); }).catch(function(){return null});
}
$("out").innerHTML='<div class="loading"><div class="spin"></div>Cargando prácticas…</div>';
fetch("datos.json?v="+Date.now(),{cache:"no-store"}).then(function(r){
  if(!r.ok) throw new Error("HTTP "+r.status); return r.arrayBuffer();
}).then(function(buf){
  var bytes=new Uint8Array(buf);
  return gitBlobSha(bytes).then(function(sha){ S.loadedSha=sha; DB=JSON.parse(new TextDecoder().decode(bytes)); });
}).then(function(){
  var draft=ss.get("samiDraft");
  if(draft && draft.rows){ S.rows=draft.rows.map(prep); setVig(draft.vigencia); S.hist=draft.hist||(DB.hist||[]).slice(); S.dirty=draft.dirty||1; S.changed=draft.changed||{}; }
  else { S.rows=DB.rows.map(function(r){return prep(Object.assign({},r))}); setVig(DB.vigencia); S.hist=(DB.hist||[]).slice(); }
  fillCentros();
  render();
  if(S.dirty) tryAuto();
}).catch(function(){
  $("out").innerHTML='<div class="empty"><h3>No se pudo cargar la base de prácticas</h3>Revisá la conexión y recargá la página. Si abriste el archivo directo desde la computadora, usá el link del sitio (ver README).</div>';
});
})();
