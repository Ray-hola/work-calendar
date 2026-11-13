const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const UI={view:'calendar',member:'all',filter:'all',selectedWeek:0,detailDate:null,timelineScroll:null,dayOffset:0};
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* Interface language: 简体中文 (the source text) or English. It is a per-user
   preference saved on the account (users.lang) and mirrored in localStorage
   under LANG_KEY, so the page knows it before /api/state answers and works
   from file:// too; ?lang=en|zh shows one page in that language without
   saving anything. Strings stay in Chinese in this file: tr() looks the
   English up in i18n.js (HOLA_I18N_EN), where an entry may be a function for
   word order or month names. Changing language reloads the page, because
   many labels are built once into module-level tables. User data (task,
   project and people names) never goes through tr(); what the interface
   fills in for a person (默认总结、递延原因、工作感受) is stored in Chinese
   and looked up when shown. */
const LANG_KEY='hola-lang', LANGS={zh:'简体中文',en:'English'};
function urlLang(){try{const q=new URLSearchParams(location.search).get('lang');return LANGS[q]?q:null}catch(_){return null}}
function readLang(){
  const q=urlLang();if(q)return q;
  try{const v=localStorage.getItem(LANG_KEY);if(LANGS[v])return v}catch(_){}
  return 'zh';
}
/* global HOLA_I18N_EN, HOLA_I18N_EN_PATTERNS */
const LANG=readLang();
const I18N_EN=(typeof HOLA_I18N_EN==='object'&&HOLA_I18N_EN)||{};
const I18N_SINGULAR=/\b1 (task|day|week|project|period|member|file|meeting|account|item|message|request|card|notification|entry|time|step|source|model|deletion|minute|hour|collaborator|attachment|schedule|record)s\b/g;
function tr(text,...args){
  const hit=LANG==='en'&&Object.prototype.hasOwnProperty.call(I18N_EN,text)?I18N_EN[text]:text;
  if(typeof hit==='function')return hit(...args);
  if(!args.length)return hit;
  if(LANG!=='en')return hit.replace(/\{(\d+)\}/g,(m,i)=>i<args.length?String(args[i]):m);
  // “1 tasks” is fixed where the 1 is a count filled in here, never inside a name that was filled in.
  const SLOT='\u0000';
  const slot=(m,i)=>i>=args.length?m:typeof args[i]==='number'?String(args[i]):`${SLOT}${i}${SLOT}`;
  const counted=hit.replace(/\{(\d+)\}/g,slot)
    .replace(I18N_SINGULAR,'1 $1').replace(/\b1 people\b/g,'1 person');
  return counted.replace(/\u0000(\d+)\u0000/g,(_,i)=>String(args[i]));
}
/* Text the server wrote (errors, notices, system messages) arrives in
   Chinese; whole sentences are looked up as-is, templated ones through the
   patterns in i18n.js, which keep the names they capture untouched. */
const I18N_EN_PATTERNS=(typeof HOLA_I18N_EN_PATTERNS==='object'&&HOLA_I18N_EN_PATTERNS)||[];
function trServer(text){
  if(LANG!=='en'||typeof text!=='string'||!/[一-鿿]/.test(text))return text;
  if(Object.prototype.hasOwnProperty.call(I18N_EN,text))return tr(text);
  for(const [re,to] of I18N_EN_PATTERNS){const m=text.match(re);if(m)return typeof to==='function'?to(...m.slice(1)):to.replace(/\$(\d)/g,(_,i)=>m[i]??'')}
  return text;
}
/* index.html is written in Chinese; before anything renders, its fixed text
   and labels are swapped once for the chosen language. */
const I18N_ATTRS=['title','aria-label','placeholder','data-keywords','data-nav'];
function translateStatic(root){
  if(LANG==='zh'||!root)return;
  const doc=root.ownerDocument||root,walker=doc.createTreeWalker(root,4);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    const raw=node.nodeValue,text=raw.trim();
    if(text&&/[一-鿿]/.test(text)){const next=tr(text);if(next!==text)node.nodeValue=raw.replace(text,next)}
  }
  root.querySelectorAll?.('*').forEach(el=>I18N_ATTRS.forEach(a=>{const v=el.getAttribute(a);if(v&&/[一-鿿]/.test(v))el.setAttribute(a,tr(v.trim()))}));
  if(doc.documentElement){doc.documentElement.lang=LANG==='en'?'en':'zh-CN';doc.title=tr(doc.title)}
}
/* Saves the choice on the account (when signed in) and in this browser, then
   reloads so every table and label is rebuilt in the new language. */
async function setLanguage(lang){
  if(!LANGS[lang])return;
  if(S.user){try{await api('/api/action',{action:'profile.language',data:{lang}})}catch(e){toast(e.message);return}}
  try{localStorage.setItem(LANG_KEY,lang)}catch(_){}
  if(lang!==LANG){
    const url=new URL(location.href);url.searchParams.delete('lang');url.searchParams.delete('langAuto');
    if(url.href!==location.href)location.replace(url.href);else location.reload();
  }
}
/* The account's saved language wins over this browser's, except while ?lang= is in the address. */
function autoLang(){try{return new URLSearchParams(location.search).has('langAuto')}catch(_){return false}}
function syncAccountLanguage(user){
  const lang=user?.lang,auto=autoLang();
  if(!LANGS[lang]||urlLang()&&!auto)return false;
  let stored=null;
  try{localStorage.setItem(LANG_KEY,lang);stored=localStorage.getItem(LANG_KEY)}catch(_){}
  if(lang===LANG)return false;
  UI.reloading=true;
  if(stored===lang&&!auto){location.reload();return true}
  /* Storage that does not keep the choice would bring the old language back on
     every reload, so the address carries it, marked langAuto so the next
     account's choice still applies; once storage keeps it the mark goes. */
  const url=new URL(location.href);
  if(stored===lang){url.searchParams.delete('lang');url.searchParams.delete('langAuto')}
  else{url.searchParams.set('lang',lang);url.searchParams.set('langAuto','1')}
  location.replace(url.href);return true;
}
/* One stroked 24px icon set. Everything the UI used to draw with text glyphs
   (◷ ▦ ✦ ◇ ＋ › ↻ ▶ …) now comes from here, so stroke weight, optical size and
   alignment stay consistent and nothing depends on the system symbol font. */
const ICON_PATHS={
  'maximize-2':'<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>',
  'minimize-2':'<path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/>',
  'file-pen':'<path d="M12.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v9.5"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>'
    +'<path d="M13.4 12.6a2 2 0 1 1 2.9 2.9L10.9 21H7v-3.8Z"/>',
  'calendar-check':'<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="m9 15.4 2 2 4-4"/>',
  'calendar-days':'<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>',
  'layout-grid':'<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
  'book-open':'<path d="M12 7.5v13"/><path d="M3.5 18.5a1.5 1.5 0 0 1-1.5-1.5V4.5A1.5 1.5 0 0 1 3.5 3H8a4 4 0 0 1 4 4 4 4 0 0 1 4-4h4.5A1.5 1.5 0 0 1 22 4.5v12.5a1.5 1.5 0 0 1-1.5 1.5H15a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z"/>',
  'folder':'<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.6a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  'gantt':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7.5h8"/><path d="M6 12h5"/><path d="M10 16.5h6"/>',
  'award':'<circle cx="12" cy="8.5" r="5.5"/><path d="m8.9 13-1.2 7.8 4.3-2.4 4.3 2.4L15.1 13"/>',
  'inbox':'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1Z"/>',
  'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  'search':'<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4-4"/>',
  'bell':'<path d="M6.5 8.5a5.5 5.5 0 0 1 11 0c0 6 2.5 8 2.5 8H4s2.5-2 2.5-8"/><path d="M10.3 20.5a2 2 0 0 0 3.4 0"/>',
  'sparkles':'<path d="M12 3.5 13.6 8.4 18.5 10 13.6 11.6 12 16.5 10.4 11.6 5.5 10 10.4 8.4Z"/><path d="m18.5 15.5.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z"/>',
  'plus':'<path d="M12 5v14"/><path d="M5 12h14"/>',
  'x':'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'chevron-down':'<path d="m6 9.5 6 6 6-6"/>',
  'chevron-left':'<path d="m14.5 18-6-6 6-6"/>',
  'chevron-right':'<path d="m9.5 18 6-6-6-6"/>',
  'arrow-right':'<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  'arrow-up-right':'<path d="M7 17 17 7"/><path d="M9.5 7H17v7.5"/>',
  'clock':'<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.2 1.9"/>',
  'repeat':'<path d="m17 2.5 3.5 3.5L17 9.5"/><path d="M3.5 11.5v-1a4 4 0 0 1 4-4h13"/><path d="m7 21.5-3.5-3.5L7 14.5"/><path d="M20.5 12.5v1a4 4 0 0 1-4 4h-13"/>',
  'check':'<path d="M20 6.5 9.5 17 4 11.5"/>',
  'archive':'<rect x="2.5" y="3.5" width="19" height="5" rx="1"/><path d="M4.5 8.5v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-10"/><path d="M10 12.5h4"/>',
  'settings':'<path d="M4 6.5h9"/><path d="M17 6.5h3"/><path d="M4 12h5"/><path d="M13 12h7"/><path d="M4 17.5h9"/><path d="M17 17.5h3"/><circle cx="15" cy="6.5" r="2"/><circle cx="11" cy="12" r="2"/><circle cx="15" cy="17.5" r="2"/>',
  'edit':'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3.5 19.5l1-4Z"/>',
  'mail':'<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 7.5 9 5.5 9-5.5"/>',
  'diamond':'<path d="M12 3.2 20.8 12 12 20.8 3.2 12Z"/>',
  'trend':'<path d="M3 17.5 9.5 11l4 4L21 7.5"/><path d="M21 12.5v-5h-5"/>',
  'play':'<path d="m7.5 4.8 11.5 7.2-11.5 7.2Z"/>',
  'square':'<rect x="6" y="6" width="12" height="12" rx="2"/>',
  'dot':'<circle cx="12" cy="12" r="3"/>',
  'chat':'<path d="M20 13.5a2 2 0 0 1-2 2H8.5L4 19V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/>',
  'mic':'<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>',
  'grip':'<path d="M9 6h.01"/><path d="M15 6h.01"/><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M9 18h.01"/><path d="M15 18h.01"/>',
  'pip':'<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
  'folder-open':'<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  'file':'<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><path d="M14 2v6h6"/>',
  'copy':'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  'undo':'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  'upload':'<path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>'
};
function icon(name,extra=''){
  const body=ICON_PATHS[name]||ICON_PATHS['diamond'];
  return `<svg class="icon${extra?' '+extra:''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}
/* Static markup carries data-icon="…"; this fills those slots once on boot. */
function hydrateIcons(root=document){
  root.querySelectorAll('[data-icon]').forEach(el=>{
    if(el.dataset.iconReady)return;
    el.innerHTML=icon(el.dataset.icon);
    el.dataset.iconReady='1';
  });
}
/* Navigation sizes are a local display preference. Desired widths survive
   temporary viewport clamps; only an explicit drag/key/toggle saves a change. */
const NAVIGATION_KEY='wc-navigation-layout-v1';
const NAVIGATION={main:{min:72,max:360,width:248,label:tr('主导航'),selector:'.sidebar'},
  project:{min:56,max:340,width:220,label:tr('项目目录'),selector:'#projectNav'},
  chat:{min:64,max:320,width:208,label:tr('频道导航'),selector:'.chat-side'}};
function readNavigationLayout(){
  let saved={};try{saved=JSON.parse(localStorage.getItem(NAVIGATION_KEY)||'{}')||{}}catch(_){}
  return Object.fromEntries(Object.entries(NAVIGATION).map(([key,c])=>{
    const record=saved[key]||{},valid=v=>typeof v==='number'&&Number.isFinite(v)?Math.round(Math.max(c.min,Math.min(c.max,v))):null;
    return [key,{width:valid(record.width),expanded:valid(record.expanded)}];
  }));
}
const navigationLayout=readNavigationLayout();
let navigationDrag=null,navigationFrame=0,navigationFadeFrame=0;
function navigationBounds(kind,viewport,available){
  const c=NAVIGATION[kind];
  const stacked=viewport<=760;
  const room=kind==='main'?viewport-490:!stacked&&Number.isFinite(available)?available-340:c.max;
  const initial=viewport<=1180?{main:216,chat:184}[kind]:undefined;
  return {min:c.min,max:Math.max(c.min,Math.min(c.max,room)),default:initial??c.width};
}
function navigationWidth(kind,viewport,available){
  const b=navigationBounds(kind,viewport,available),value=navigationLayout[kind].width??b.default;
  return Math.round(Math.max(b.min,Math.min(b.max,value)));
}
function navigationAvailable(kind){
  const value=kind==='project'?$('#projectsView')?.clientWidth:kind==='chat'?$('.chat-room')?.clientWidth:undefined;
  return value>0?value:undefined;
}
function saveNavigationLayout(){try{localStorage.setItem(NAVIGATION_KEY,JSON.stringify(navigationLayout))}catch(_){}
}
function setNavigationWidth(kind,value,persist=true){
  const b=navigationBounds(kind,window.innerWidth,navigationAvailable(kind));
  const width=Math.round(Math.max(b.min,Math.min(b.max,value)));
  navigationLayout[kind].width=width;
  if(width>=160)navigationLayout[kind].expanded=width;
  applyNavigationLayout();if(persist)saveNavigationLayout();
}
function toggleNavigation(kind){
  const c=NAVIGATION[kind],current=navigationWidth(kind,window.innerWidth,navigationAvailable(kind));
  const restore=navigationLayout[kind].expanded;
  if(current>c.min+8&&current>=160&&restore===null)navigationLayout[kind].expanded=current;
  const initial=navigationBounds(kind,window.innerWidth,navigationAvailable(kind)).default;
  setNavigationWidth(kind,current<=c.min+8?(restore>=160?restore:initial):c.min);
}
function navigationControls(kind){
  const c=NAVIGATION[kind],id={main:'mainNavigation',project:'projectNav',chat:'chatNavigation'}[kind];
  return `<button type="button" class="nav-collapse-toggle" data-nav-toggle="${kind}" aria-controls="${id}" `
    +`${tr('aria-label="收起{0}" title="收起{1}">{2}',c.label,c.label,icon('chevron-right'))}</button>`;
}
function navigationHandle(kind){
  const c=NAVIGATION[kind],id={main:'mainNavigation',project:'projectNav',chat:'chatNavigation'}[kind];
  return `<div class="nav-resize-handle" data-nav-resize="${kind}" role="separator" tabindex="0" `
    +`${tr('aria-orientation="vertical" aria-controls="{0}" aria-label="调整{1}宽度"',id,c.label)} `
    +`${tr('title="拖动调整{0}宽度；方向键微调，Home / End 到上下限，Enter 收起或展开，双击恢复默认">',c.label)}</div>`;
}
function applyNavigationLayout(){
  if(typeof window==='undefined'||!document.documentElement)return;
  for(const [kind,c] of Object.entries(NAVIGATION)){
    const host=$(c.selector);if(!host)continue;
    const available=navigationAvailable(kind),bounds=navigationBounds(kind,window.innerWidth,available);
    const width=navigationWidth(kind,window.innerWidth,available),collapsed=width<=c.min+8;
    document.documentElement.style.setProperty(`--${kind}-navigation-width`,width+'px');
    host.classList.toggle('is-nav-collapsed',collapsed);
    host.classList.toggle('is-nav-narrow',width<168);
    $$(`[data-nav-toggle="${kind}"]`).forEach(button=>{
      const label=collapsed?tr('展开{0}',c.label):tr('收起{0}',c.label);
      button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',label);button.title=label;
    });
    $$(`[data-nav-resize="${kind}"]`).forEach(handle=>{
      handle.setAttribute('aria-valuemin',bounds.min);handle.setAttribute('aria-valuemax',bounds.max);
      handle.setAttribute('aria-valuenow',width);handle.setAttribute('aria-valuetext',collapsed?tr('仅图标'):tr('{0} 像素',width));
    });
  }
  positionAccountMenu();
  scheduleNavigationFade();
  placeNavIndicator();
}
function scheduleNavigationFade(){
  if(navigationFadeFrame)return;
  navigationFadeFrame=requestAnimationFrame(()=>{
    navigationFadeFrame=0;
    $$('.nav-text,.nav-brand-name,.chat-channel-name,.chat-channel-preview,.workspace-name strong,.workspace-name small').forEach(label=>{
      label.classList.toggle('has-nav-overflow',label.clientWidth>0&&label.scrollWidth>label.clientWidth+1);
    });
  });
}
function finishNavigationDrag(cancelled=false){
  const drag=navigationDrag;if(!drag)return;
  if(navigationFrame){cancelAnimationFrame(navigationFrame);navigationFrame=0}
  if(cancelled)navigationLayout[drag.kind]={...drag.original};
  else setNavigationWidth(drag.kind,drag.startWidth+drag.lastX-drag.startX,false);
  navigationDrag=null;document.body.classList.remove('is-resizing-navigation');
  try{drag.handle.releasePointerCapture(drag.pointerId)}catch(_){}
  applyNavigationLayout();if(!cancelled)saveNavigationLayout();
}
function navigationResizeEnabled(kind){return window.innerWidth>760}
function initNavigationLayout(){
  const main=$('.sidebar'),chat=$('.chat-side');
  if(main){
    $('#mainNavToggle').innerHTML=navigationControls('main');main.insertAdjacentHTML('beforeend',navigationHandle('main'));
    $$('.nav-item,.filter-link').forEach(button=>{
      const label=button.querySelector('.nav-text');if(label){button.title=label.textContent.trim();button.setAttribute('aria-label',button.title)}
    });
  }
  if(chat){
    $('.chat-side-head').insertAdjacentHTML('beforeend',navigationControls('chat'));
    chat.insertAdjacentHTML('beforeend',navigationHandle('chat'));
  }
  document.addEventListener('click',e=>{const button=e.target.closest('[data-nav-toggle]');if(button)toggleNavigation(button.dataset.navToggle)});
  document.addEventListener('dblclick',e=>{
    const handle=e.target.closest('[data-nav-resize]');if(!handle)return;
    setNavigationWidth(handle.dataset.navResize,NAVIGATION[handle.dataset.navResize].width);
  });
  document.addEventListener('pointerdown',e=>{
    const handle=e.target.closest('[data-nav-resize]');if(!handle||e.button!==0||!navigationResizeEnabled(handle.dataset.navResize))return;
    const kind=handle.dataset.navResize;e.preventDefault();handle.focus();
    navigationDrag={kind,handle,pointerId:e.pointerId,startX:e.clientX,lastX:e.clientX,
      startWidth:navigationWidth(kind,window.innerWidth,navigationAvailable(kind)),original:{...navigationLayout[kind]}};
    document.body.classList.add('is-resizing-navigation');
    try{handle.setPointerCapture(e.pointerId)}catch(_){}
  });
  document.addEventListener('pointermove',e=>{
    const drag=navigationDrag;if(!drag||drag.pointerId!==e.pointerId)return;drag.lastX=e.clientX;
    if(!navigationFrame)navigationFrame=requestAnimationFrame(()=>{
      navigationFrame=0;if(navigationDrag)setNavigationWidth(drag.kind,drag.startWidth+drag.lastX-drag.startX,false);
    });
  });
  document.addEventListener('pointerup',e=>{if(navigationDrag?.pointerId===e.pointerId)finishNavigationDrag()});
  document.addEventListener('pointercancel',e=>{if(navigationDrag?.pointerId===e.pointerId)finishNavigationDrag(true)});
  document.addEventListener('lostpointercapture',e=>{if(navigationDrag?.pointerId===e.pointerId)finishNavigationDrag(true)});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&navigationDrag){e.preventDefault();e.stopPropagation();finishNavigationDrag(true);return}
    const handle=e.target.closest('[data-nav-resize]');if(!handle)return;
    const kind=handle.dataset.navResize;if(!navigationResizeEnabled(kind))return;
    const b=navigationBounds(kind,window.innerWidth,navigationAvailable(kind)),width=navigationWidth(kind,window.innerWidth,navigationAvailable(kind));
    const next={ArrowLeft:width-(e.shiftKey?30:10),ArrowRight:width+(e.shiftKey?30:10),Home:b.min,End:b.max}[e.key];
    if(next!==undefined){e.preventDefault();e.stopPropagation();setNavigationWidth(kind,next)}
    if(e.key==='Enter'){e.preventDefault();toggleNavigation(kind)}
  },true);
  window.addEventListener('blur',()=>finishNavigationDrag(true));
  window.addEventListener('scroll',()=>positionAccountMenu(),true);
  window.addEventListener('resize',()=>{finishNavigationDrag(true);applyNavigationLayout()});
  window.addEventListener('storage',e=>{if(e.key===NAVIGATION_KEY){Object.assign(navigationLayout,readNavigationLayout());applyNavigationLayout()}});
  const observer=new ResizeObserver(()=>{applyNavigationLayout()});
  for(const selector of ['.sidebar','#projectsView','.chat-room']){const element=$(selector);if(element)observer.observe(element)}
  applyNavigationLayout();
}
/* Panel dimensions are browser display preferences per layout, so opening a
   draft does not squeeze three panes into the width of a plain conversation. */
const AGENT_SIZE_KEY='wc-agent-size-v1';
const AGENT_PANEL_SIZES={chat:{width:390,height:590,minWidth:360,minHeight:360},
  history:{width:700,height:650,minWidth:560,minHeight:420},
  plan:{width:1080,height:800,minWidth:760,minHeight:500},
  'history-plan':{width:1240,height:800,minWidth:980,minHeight:600}};
function readAgentPanelSizes(){
  let saved={};try{saved=JSON.parse(localStorage.getItem(AGENT_SIZE_KEY)||'{}')||{}}catch(_){}
  return Object.fromEntries(Object.keys(AGENT_PANEL_SIZES).flatMap(mode=>{
    const s=saved[mode];return s&&['width','height'].every(k=>typeof s[k]==='number'&&Number.isFinite(s[k])&&s[k]>0)
      ?[[mode,{width:Math.min(8192,Math.round(s.width)),height:Math.min(8192,Math.round(s.height))}]]:[];
  }));
}
const agentPanelSizes=readAgentPanelSizes();
let agentPanelDrag=null,agentPanelFrame=0;
function agentPanelBounds(mode,viewportWidth,viewportHeight){
  const c=AGENT_PANEL_SIZES[mode],gap=viewportWidth<=760?12:24;
  const maxWidth=Math.max(1,viewportWidth-gap*2),maxHeight=Math.max(1,viewportHeight-gap*2);
  return {gap,maxWidth,maxHeight,minWidth:Math.min(c.minWidth,maxWidth),minHeight:Math.min(c.minHeight,maxHeight)};
}
function agentPanelDimensions(mode,viewportWidth,viewportHeight){
  const b=agentPanelBounds(mode,viewportWidth,viewportHeight),s=agentPanelSizes[mode]||AGENT_PANEL_SIZES[mode];
  return {width:Math.round(Math.max(b.minWidth,Math.min(b.maxWidth,s.width))),
    height:Math.round(Math.max(b.minHeight,Math.min(b.maxHeight,s.height)))};
}
function agentPanelMode(){
  const planning=Boolean(agentState.planBoard&&!agentState.planBoard.closed&&!agentState.viewing);
  return agentState.sessionsOpen?(planning?'history-plan':'history'):(planning?'plan':'chat');
}
function saveAgentPanelSizes(){try{localStorage.setItem(AGENT_SIZE_KEY,JSON.stringify(agentPanelSizes))}catch(_){} }
function applyAgentPanelSize(){
  if(typeof window==='undefined'||!document.documentElement)return;
  const panel=$('#agentPanel');if(!panel)return;
  const mode=agentPanelMode();
  if(agentPanelDrag&&agentPanelDrag.mode!==mode){finishAgentPanelResize(true);return}
  const b=agentPanelBounds(mode,window.innerWidth,window.innerHeight),size=agentPanelDimensions(mode,window.innerWidth,window.innerHeight);
  Object.assign(panel.style,{width:size.width+'px',height:size.height+'px',right:b.gap+'px',bottom:b.gap+'px'});
  panel.querySelectorAll('[data-agent-resize]').forEach(h=>{
    const width=h.dataset.agentResize==='w',both=h.dataset.agentResize==='nw';
    h.setAttribute('aria-label',both?tr('调整助手宽高，当前 {0} × {1} 像素',size.width,size.height):width?tr('调整助手宽度'):tr('调整助手高度'));
    if(!both){h.setAttribute('aria-valuemin',width?b.minWidth:b.minHeight);h.setAttribute('aria-valuemax',width?b.maxWidth:b.maxHeight);h.setAttribute('aria-valuenow',width?size.width:size.height)}
  });
}
function setAgentPanelSize(mode,width,height,persist=true,axes='nw'){
  const b=agentPanelBounds(mode,window.innerWidth,window.innerHeight);
  const previous=agentPanelSizes[mode]||AGENT_PANEL_SIZES[mode];
  agentPanelSizes[mode]={width:axes.includes('w')?Math.round(Math.max(b.minWidth,Math.min(b.maxWidth,width))):previous.width,
    height:axes.includes('n')?Math.round(Math.max(b.minHeight,Math.min(b.maxHeight,height))):previous.height};
  applyAgentPanelSize();if(persist)saveAgentPanelSizes();
}
function finishAgentPanelResize(cancelled=false){
  const d=agentPanelDrag;if(!d)return;
  if(agentPanelFrame){cancelAnimationFrame(agentPanelFrame);agentPanelFrame=0}
  agentPanelDrag=null;
  if(cancelled){if(d.original)agentPanelSizes[d.mode]=d.original;else delete agentPanelSizes[d.mode]}
  else setAgentPanelSize(d.mode,d.width+(d.edge.includes('w')?d.x-d.lastX:0),d.height+(d.edge.includes('n')?d.y-d.lastY:0),false,d.edge);
  document.body.classList.remove('is-resizing-agent');
  try{d.handle.releasePointerCapture(d.pointerId)}catch(_){}
  applyAgentPanelSize();if(!cancelled)saveAgentPanelSizes();
}
function initAgentPanelResize(){
  const panel=$('#agentPanel');if(!panel)return;
  for(const [edge,label] of [['w',tr('宽度')],['n',tr('高度')],['nw',tr('宽高')]]){
    panel.insertAdjacentHTML('beforeend',`<div class="agent-resize-edge edge-${edge}" data-agent-resize="${edge}" tabindex="0" `
      +`role="${edge==='nw'?'button':'separator'}"${edge==='nw'?'':` aria-orientation="${edge==='w'?'vertical':'horizontal'}"`} `
      +`${tr('aria-controls="agentPanel" aria-label="调整助手{0}" title="拖动调整助手{1}，方向键微调，Shift 加速，Home 恢复默认，End 到上限，双击恢复默认尺寸">',label,label)}</div>`);
  }
  panel.addEventListener('pointerdown',e=>{
    const handle=e.target.closest('[data-agent-resize]');if(!handle||e.button!==0||agentPanelDrag)return;
    e.preventDefault();handle.focus();const mode=agentPanelMode(),size=agentPanelDimensions(mode,window.innerWidth,window.innerHeight);
    agentPanelDrag={mode,handle,edge:handle.dataset.agentResize,pointerId:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,
      ...size,original:agentPanelSizes[mode]?{...agentPanelSizes[mode]}:null};
    document.body.classList.add('is-resizing-agent');try{handle.setPointerCapture(e.pointerId)}catch(_){}
  });
  window.addEventListener('pointermove',e=>{
    const d=agentPanelDrag;if(!d||d.pointerId!==e.pointerId)return;d.lastX=e.clientX;d.lastY=e.clientY;
    if(!agentPanelFrame)agentPanelFrame=requestAnimationFrame(()=>{
      agentPanelFrame=0;if(agentPanelDrag===d)setAgentPanelSize(d.mode,d.width+(d.edge.includes('w')?d.x-d.lastX:0),d.height+(d.edge.includes('n')?d.y-d.lastY:0),false,d.edge);
    });
  });
  window.addEventListener('pointerup',e=>{if(agentPanelDrag?.pointerId===e.pointerId){agentPanelDrag.lastX=e.clientX;agentPanelDrag.lastY=e.clientY;finishAgentPanelResize()}});
  for(const event of ['pointercancel','lostpointercapture'])window.addEventListener(event,e=>{if(agentPanelDrag?.pointerId===e.pointerId)finishAgentPanelResize(true)});
  window.addEventListener('blur',()=>finishAgentPanelResize(true));
  window.addEventListener('resize',()=>{finishAgentPanelResize(true);applyAgentPanelSize()});
  window.addEventListener('storage',e=>{if(e.key===AGENT_SIZE_KEY){for(const key of Object.keys(agentPanelSizes))delete agentPanelSizes[key];Object.assign(agentPanelSizes,readAgentPanelSizes());applyAgentPanelSize()}});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&agentPanelDrag){e.preventDefault();e.stopPropagation();finishAgentPanelResize(true)}},true);
  panel.addEventListener('dblclick',e=>{if(e.target.closest('[data-agent-resize]')){delete agentPanelSizes[agentPanelMode()];applyAgentPanelSize();saveAgentPanelSizes()}});
  panel.addEventListener('keydown',e=>{
    const handle=e.target.closest('[data-agent-resize]');if(!handle)return;
    const edge=handle.dataset.agentResize,mode=agentPanelMode(),size=agentPanelDimensions(mode,window.innerWidth,window.innerHeight),b=agentPanelBounds(mode,window.innerWidth,window.innerHeight),c=AGENT_PANEL_SIZES[mode],step=e.shiftKey?30:10;
    let {width,height}=size,used=true;
    if(edge.includes('w')&&e.key==='ArrowLeft')width+=step;
    else if(edge.includes('w')&&e.key==='ArrowRight')width-=step;
    else if(edge.includes('n')&&e.key==='ArrowUp')height+=step;
    else if(edge.includes('n')&&e.key==='ArrowDown')height-=step;
    else if(e.key==='Home'){if(edge.includes('w'))width=c.width;if(edge.includes('n'))height=c.height}
    else if(e.key==='End'){if(edge.includes('w'))width=b.maxWidth;if(edge.includes('n'))height=b.maxHeight}
    else if(e.key==='Enter'){width=c.width;height=c.height}
    else used=false;
    if(used){e.preventDefault();e.stopPropagation();setAgentPanelSize(mode,width,height,true,e.key==='Enter'?'nw':edge)}
  });
  applyAgentPanelSize();
}
let S={user:null,users:[],tasks:[],projects:[],folders:[],files:[],fileArchives:[],achievements:[],logs:[],reports:[],diaries:[],diaryStats:[],notifications:[],requests:[],editRequests:[],suggestions:[],profiles:[],today:''};
/* The server always answers in JSON, but the tunnel in front of it does not:
   a request that runs past its time limit comes back as an HTML error page.
   Safari reports parsing that as "The string did not match the expected
   pattern", so anything that is not JSON becomes a readable message here. */
const readJSON=async r=>{const text=await r.text();try{return text?JSON.parse(text):{}}catch(_){throw new Error([504,524].includes(r.status)?tr('服务响应超时，请稍后再试；给 AI 助手的需求可以拆短一点'):tr('服务暂时不可用（HTTP {0}），请稍后再试',r.status))}};
function api(path, body, options = {}) {
  // The form open when a request leaves; its draft is settled once the request lands.
  const draft = UI.formDraft;
  const submitting = Boolean(draft && path === '/api/action' && draft.submit?.includes(body?.action));
  if (submitting) {
    draft.submitting = true;
  }
  return fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Work-Calendar': '1'},
    credentials: 'same-origin', body: JSON.stringify(body), ...options})
    .then(async r => {
      const x = await readJSON(r);
      if (!r.ok) {
        // The message reads in the viewer's language; checks use the status and the server's own words.
        const e = new Error(trServer(x.error) || tr('操作未完成'));
        e.status = r.status;
        e.raw = x.error ?? '';
        throw e;
      }
      await draftSubmitted(path, body, draft);
      return x;
    })
    .finally(() => {
      if (submitting) {
        draft.submitting = false;
      }
    });
}
/* Raw-body sibling of api() for uploads: audio is sent as-is, not as JSON. */
const apiBlob=(path,blob,options={})=>fetch(path,{...options,method:'POST',headers:{'Content-Type':blob.type||'application/octet-stream','X-Work-Calendar':'1'},credentials:'same-origin',body:blob}).then(async r=>{const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(trServer(x.error)||tr('请求未完成'));return x});
const getState=()=>fetch('/api/state',{credentials:'same-origin'}).then(async r=>{const x=await readJSON(r);if(!r.ok){const e=new Error(trServer(x.error)||tr('读取工作台失败'));e.status=r.status;throw e}return x});
const fmt=iso=>{const d=new Date(`${iso}T12:00:00`);return tr('{0}月{1}日',d.getMonth()+1,d.getDate())};
const monthLabel=ym=>{const [y,m]=ym.split('-').map(Number);return tr('{0} 年 {1} 月',y,m)};
const wd=iso=>[tr('周日'),tr('周一'),tr('周二'),tr('周三'),tr('周四'),tr('周五'),tr('周六')][new Date(`${iso}T12:00:00`).getDay()];
const add=(iso,n)=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
/* The team's first day of the week (0 = 周日 … 6 = 周六), set in 系统设置;
   Saturday until an admin picks another. */
const weekStartDay=()=>Number.isInteger(S.weekStart)&&S.weekStart>=0&&S.weekStart<=6?S.weekStart:6;
const weekStart=iso=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()-(d.getDay()-weekStartDay()+7)%7);return d.toISOString().slice(0,10)};
/* The last schedulable day rolls with today; the server sends it with every state. */
let DATE_HORIZON='2027-04-30';
const displayDay=()=>{const day=add(S.today,UI.dayOffset||0);return day>DATE_HORIZON?DATE_HORIZON:day};
const week=off=>{const start=add(weekStart(S.today),off*7);return Array.from({length:7},(_,i)=>add(start,i))};
const weekOffsetFor=iso=>Math.round((new Date(`${weekStart(iso)}T12:00:00`)-new Date(`${weekStart(S.today)}T12:00:00`))/604800000);
const sortTasks=a=>a.slice().sort((x,y)=>({P0:0,P1:1,P2:2}[x.priority]-({P0:0,P1:1,P2:2}[y.priority])||x.name.localeCompare(y.name,'zh')));
const status=t=>{
  if(t.status==='done')return ['done',tr('已完成')];
  if(['pending_approval','awaiting_approval','submitted'].includes(t.status))return ['pending-approval',tr('待审批')];
  if(['rejected','returned'].includes(t.status))return ['rejected',tr('已驳回')];
  if(t.status==='deferred')return ['defer',tr('已递延')];
  if(t.status==='doing')return ['doing',tr('进行中')];
  if(t.status==='skipped')return ['defer',tr('已跳过')];
  return ['',tr('待开始')];
};
const projectName=t=>(S.projects.find(p=>p.id===t.projectId)||{}).name||tr('个人');
function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}
function showAuth(){resetFormDraft();cancelTourOffer();endTour(false);meetingCancelCapture();
  meetingStopLive().catch(()=>{});if(typeof agentCancelVoice==='function')agentCancelVoice();
  document.body.classList.add('auth-locked');
  let e=$('#authScreen');
  if(!e){e=document.createElement('section');e.id='authScreen';document.body.prepend(e)}
  const local=location.protocol==='file:';
  e.innerHTML=[
    `<div class="auth-card"><div class="brand"><span class="brand-mark">${tr('哗')}</span><span>${tr('哗啦！')}<br>`,
    `<strong>${tr('哗啦待办')}</strong></span></div><h1>${tr('登录工作台')}</h1><form id="loginForm">`,
    `<label>${tr('账户')}<input id="loginUser" autocomplete="username" value="superadmin" required></label>`,
    `<label>${tr('密码')}<input id="loginPass" type="password" autocomplete="current-password" required></label>`,
    `<button class="primary-btn" type="submit" ${local?'disabled':''}>`,
    `${local?tr('请先启动本地服务'):tr('进入工作台')}</button><div id="loginError" class="login-error">`,
    local?tr('请在工作区运行 ./run.sh，然后访问 http://127.0.0.1:4173/'):'',
    `</div></form>${languageChooserHTML('auth-language')}</div>`,
  ].join('');
  bindLanguageChooser(e);
  $('#loginForm').onsubmit=async e=>{e.preventDefault();
    try{await api('/api/login',{username:$('#loginUser').value,password:$('#loginPass').value});
      document.body.classList.remove('auth-locked');e.target.closest('#authScreen').remove();await refresh();
      // The account's language may be reloading the page; the old one has no workspace to show.
      if(!UI.reloading)switchView('calendar')}catch(err){const box=$('#loginError');if(box)box.textContent=err.message}}}
/* Accounts that have signed in on this browser, newest first. The switcher
   offers only these, so it never lists the whole team to everyone. */
const KNOWN_ACCOUNTS_KEY='wc-accounts';
function knownAccounts(){try{const v=JSON.parse(localStorage.getItem(KNOWN_ACCOUNTS_KEY)||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[]}catch(_){return []}}
function rememberAccount(id){if(!id)return;try{localStorage.setItem(KNOWN_ACCOUNTS_KEY,JSON.stringify([id,...knownAccounts().filter(x=>x!==id)].slice(0,8)))}catch(_){}}
async function refresh(){
  let next;
  try{next=await getState()}catch(e){if(e.status===401){showAuth();return}throw e}
  if(S.user?.id!==next.user.id){
    if(S.user)resetFormDraft();
    cancelTourOffer();endTour(false);meetingCancelCapture();
    if(S.user&&typeof agentResetUser==='function')agentResetUser();
    Object.assign(UI,{space:'',folder:'',view:'calendar',member:'all',filter:'all',selectedWeek:0,detailDate:null,timelineScroll:null,dayOffset:0});
  }
  /* updateChatDot is defined further down the file than the unit-test sandbox
     loads, so guard the call rather than assume it is in scope. */
  if(syncAccountLanguage(next.user))return;
  S=next;restorePendingFormDrafts();if(S.dateHorizon)DATE_HORIZON=S.dateHorizon;rememberAccount(S.user.id);renderAll();
  if(typeof offerTour==='function')offerTour();renderPip();if(typeof loadSpeechStatus==='function')loadSpeechStatus();
  if(typeof updateChatDot==='function')updateChatDot();
}
let inboxRefreshPromise=null;
async function refreshInboxState(){
  if(!S.user||document.body.classList.contains('auth-locked'))return;
  if(inboxRefreshPromise)return inboxRefreshPromise;
  inboxRefreshPromise=(async()=>{
    try{
      const next=await getState();
      if(next.dateHorizon)DATE_HORIZON=next.dateHorizon;
      if(next.user?.id!==S.user?.id){S=next;renderAll();return}
      S=next;
      if(UI.view==='inbox')renderInbox();
    }catch(e){}
    finally{inboxRefreshPromise=null}
  })();
  return inboxRefreshPromise;
}
function switchView(view){
  if(UI.view==='projects'&&view!=='projects'&&(meetingLive.session||meetingLive.active))return meetingStopLive().then(()=>switchView(view)).catch(e=>toast(e.message));
  if(UI.view==='projects'&&view!=='projects'&&$('#meetingEditor')?.dataset?.dirty==='true'&&!confirm(tr('会议修改尚未保存，确定离开？')))return;
  if(view==='summary')view='archive';
  /* 成果库 lives in the project space now; an old link lands on its shelf. */
  if(view==='achievements'){view='projects';UI.shelf='achievements';UI.space='';UI.folder=''}
  if((view==='accounts'||view==='settings')&&!S.user?.admin){view='calendar'}
  const changed=UI.view!==view;
  if(changed)cancelMeetingOpen();
  UI.view=view;
  /* Returning to the week rail should show the current week, not whichever
     panel the rail happened to be parked on last. */
  if(view==='calendar'&&changed)UI.selectedWeek=0;
  $$('.view').forEach(v=>v.classList.toggle('active-view',v.id===`${view}View`));
  /* The page rises in once per visit to the app; coming back to a view only
     fades it in, so moving between familiar pages does not drag. */
  const shown=$(`#${view}View`),seen=UI.seenViews||(UI.seenViews=new Set());
  shown?.classList?.toggle('is-revisit',seen.has(view));seen.add(view);
  $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
  if(view!=='today'&&typeof syncFilterLinks==='function')syncFilterLinks();
  const labels={today:tr('今日任务'),calendar:tr('周视图'),projects:tr('项目空间'),timeline:tr('项目时间轴'),
    achievements:tr('成果库'),archive:tr('档案室'),drafts:tr('草稿箱'),inbox:tr('收件箱'),accounts:tr('账户管理'),
    settings:tr('系统设置'),dayDetail:tr('日期详情'),chat:tr('沟通区'),guide:tr('使用教程')};
  $('#crumbCurrent').textContent=`/ ${labels[view]||view}`;
  renderScheduleScope();
  if(view==='calendar')renderCalendar();
  if(view==='today')renderToday();
  if(view==='dayDetail')renderDayContent();
  if(view!=='projects')UI.navMark=null;
  if(view==='projects')renderProjects();
  if(view==='timeline')renderTimeline();
  if(view==='archive')renderArchive();
  if(view==='drafts')renderDrafts();
  if(view==='inbox'){renderInbox();refreshInboxState();}
  if(view==='accounts')renderAccounts();
  if(view==='guide')renderGuide();
  if(view==='settings'){if(changed){UI.settingsPage=UI.settingsPageNext||'';UI.settingsPageNext=''}renderSettings()}
  if(view==='chat'){renderChatChannels();loadChat(true);refreshChatPresence();startChatPolling()}else{stopChatPolling()}
  /* The badge hides while you are in the room; leaving it should reveal what is
     still unread there, without waiting for the next poll. updateChatDot is
     defined past the unit-test cut-off, hence the guard. */
  if(typeof updateChatDot==='function')updateChatDot();
  if(changed)window.scrollTo({top:0,left:0,behavior:'instant'});
}
const isArchivedTask=t=>['deferred','skipped','rejected'].includes(t.status);
/* A deferred task is replaced by its successor: the earlier occurrence is
   history and must stay out of the active board while its logs remain reachable. */
const isSuperseded=t=>Boolean(t&&t.superseded);
/* 已递延 lists only unfinished work, once per current occurrence. Completing
   it keeps originId for history, but removes it from this list and its count. */
const isDeferredTask=t=>!isSuperseded(t)&&Boolean(t.originId||t.stackCount>1)&&['todo','doing'].includes(t.status);
const deferHops=t=>taskLineageIds(t,false).size-1;
/* Merged periods read as "N 期", a count of periods rather than a multiplier
   of work. A group keeps its key (its oldest period) as it grows, so the badge
   can give a small bump when another period joins since the last render. */
const stackKey=t=>(t.stackPeriods||[])[0]||t.originId||t.reworkOf||t.id;
const stackBadge=t=>{const n=Number(t.stackCount);if(!(n>1))return '';const before=UI.stackSeen?.get(stackKey(t));
  return `<span class="stack-badge${before&&n>before?' is-bumped':''}" aria-label="${tr('合并 {0} 期',n)}">${tr('{0} 期',n)}</span>`};
function rememberStackSizes(){
  UI.stackSeen=new Map((S.tasks||[]).filter(t=>!isSuperseded(t)).map(t=>[stackKey(t),Number(t.stackCount)||1]));
}
const stackPeriodDates=t=>t.stackDates||(t.stackPeriods||[]).map(id=>S.tasks.find(x=>x.id===id)?.date).filter(Boolean).sort();
/* Every occurrence of one task shares originId/reworkOf links. Walking them
   lets the drawer show a single history for a task that was deferred or redone. */
/* One id → task index per state, rebuilt when the task list is replaced or grows. */
function taskIndex(){
  const tasks=S.tasks||[],memo=taskIndex.memo;
  if(memo&&memo.tasks===tasks&&memo.size===tasks.length)return memo.map;
  taskIndex.memo={tasks,size:tasks.length,map:new Map(tasks.map(x=>[x.id,x]))};return taskIndex.memo.map;
}
function taskLineageIds(task,includeStack=true){
  const byId=taskIndex(),ids=new Set([task.id]);
  let parent=task.originId||task.reworkOf,root=task.id;const seen=new Set();
  while(parent&&byId.has(parent)&&!seen.has(parent)){seen.add(parent);ids.add(parent);root=parent;
    const node=byId.get(parent);parent=node.originId||node.reworkOf}
  /* Every hop of a deferral points at the first record, so the ones in
     between are found from there. */
  (S.tasks||[]).forEach(x=>{if(x.originId===root)ids.add(x.id)});
  if(includeStack)for(const id of [...(task.stackTaskIds||[]),...(task.stackPeriods||[])]){const other=byId.get(id);if(other&&other.id!==task.id)taskLineageIds(other,false).forEach(x=>ids.add(x))}
  return ids;
}
/* A task can span several days: it stays on the board from `date` through
   `deadline`, and the DDL badge counts down against the real today. */
const daysCount=(a,b)=>Math.round((new Date(`${b}T12:00:00`)-new Date(`${a}T12:00:00`))/86400000);
const taskEnd=t=>(t.deadline&&t.deadline>t.date)?t.deadline:t.date;
const isMultiDay=t=>taskEnd(t)>t.date;
const spanDays=t=>daysCount(t.date,taskEnd(t))+1;
const taskActiveOn=(t,day)=>t.date<=day&&day<=taskEnd(t);
function ddlBadge(t){
  const end=taskEnd(t);
  if(!isMultiDay(t))return `<span class="task-ddl plain">${escapeHTML(fmt(end))}</span>`;
  const left=daysCount(S.today,end);
  const settled=t.status==='done';
  const state=settled?'settled':left<0?'overdue':left===0?'due':'left';
  const label=settled?tr('已完成'):left<0?tr('已逾期 {0} 天',-left):left===0?tr('今天到期'):tr('还剩 {0} 天',left);
  return `<span class="task-ddl ${state}"><em>DDL</em> ${escapeHTML(fmt(end))}<b>${label}</b></span>`;
}
function ddlText(t){
  const end=taskEnd(t);
  if(!isMultiDay(t))return fmt(end);
  const left=daysCount(S.today,end);
  if(t.status==='done')return tr('{0} · 已完成',fmt(end));
  if(left<0)return tr('{0} · 已逾期 {1} 天',fmt(end),-left);
  if(left===0)return tr('{0} · 今天到期',fmt(end));
  return tr('{0} · 还剩 {1} 天',fmt(end),left);
}
function renderStats(day=displayDay()){renderFreshDot();const d=scheduleTasks().filter(t=>taskActiveOn(t,day)),
  current=d.filter(t=>!isArchivedTask(t)),done=current.filter(t=>t.status==='done').length;
  $('#todayCount').textContent=current.filter(t=>t.status!=='done').length;
  $('#p0Count').textContent=current.filter(t=>t.priority==='P0'&&t.status!=='done').length;
  $('#doingCount').textContent=scheduleTasks().filter(t=>t.status==='doing').length;
  $('#deferredCount').textContent=scheduleTasks().filter(isDeferredTask).length;$('#allTabCount').textContent=d.length;
  $('#openTabCount').textContent=current.length-done;$('#doneTabCount').textContent=done;
  $('#progressText').textContent=tr('{0} / {1} 已完成',done,current.length);const pct=current.length?done/current.length*100:0;
  $('#dayProgress').style.width=`${pct}%`;$('#progressPercent').textContent=`${Math.round(pct)}%`;
  $('#focusTime').textContent=`${String(Math.floor(current.reduce((n,t)=>n+t.duration,0)/60)).padStart(2,'0')}:`
  +`${String(current.reduce((n,t)=>n+t.duration,0)%60).padStart(2,'0')}`;$('#focusProgress').style.width=`${pct}%`}
function taskCard(t){
  const [c,l]=status(t),deferLog=t.status==='deferred'?S.logs.find(x=>x.taskId===t.id&&x.kind==='defer'):null,carriedFrom=!isSuperseded(t)&&t.originId?S.logs.find(x=>x.nextTaskId===t.id&&x.kind==='defer'):null;
  /* The log is dated when the carry ran, which for the overnight rollover is
     already the new day; the badge names the day the work came from. */
  const carriedDay=carriedFrom&&(S.tasks.find(x=>x.id===carriedFrom.taskId)?.date||carriedFrom.date);
  /* One dense row per task: priority, name and badges, then fixed columns for
     owner, time, DDL and status. The description lives in the drawer. */
  return `<article class="task-card" data-id="${escapeHTML(t.id)}" tabindex="0"${t.desc?` title="`
    +`${escapeHTML(t.desc)}"`:''}><span class="priority ${escapeHTML(t.priority)}">${escapeHTML(t.priority)}</span>`
    +`<div class="task-main"><span class="task-name" title="${escapeHTML(t.name)}">${escapeHTML(t.name)}</span>${stackBadge(t)}${t.fixed?`<span class="fixed-badge"${LANG==='en'?` title="${tr('固定')}"`:''}>`
    +`${icon('repeat')}<span class="badge-label"> ${tr('固定')}</span></span>`:''}${isMultiDay(t)?`<span class="span-badge">${tr('{0} 天',spanDays(t))}</span>`:''}`
    +`${isSuperseded(t)?`<span class="superseded-badge">${tr('已被后续任务接替')}</span>`:''}${carriedFrom?`<span class="carried-badge">`
    +tr('{0} 由 {1} 递延{2}',icon('arrow-right'),escapeHTML(carriedDay||tr('前一日')),deferHops(t)>1?` ${tr('· 第 {0} 次',deferHops(t))}`:'')
    +`</span>`:''}${deferLog?.target?`<span class="defer-target">${icon('arrow-right')} ${escapeHTML(deferLog.target)}`
    +`</span>`:''}<span class="project-tag">${escapeHTML(projectName(t))}</span></div>`
    +`<span class="assignee-tag" title="${escapeHTML(t.assignee)}">${escapeHTML(nameOf(t.assignee))}</span>`
    +`<span class="task-time">${tr('{0} {1} · {2} 分钟',icon('clock'),escapeHTML(t.time||'09:00'),t.duration)}</span>`
    +`<span class="task-when">${ddlBadge(t)}</span><span class="task-status"><i class="status-dot ${c}"></i>${l}</span>`
    +`<span class="task-arrow">${icon('chevron-right')}</span></article>`;
}
function dailyTaskGroups(tasks){
  const groups=new Map();
  for(const task of sortTasks(tasks)){
    const project=S.projects.find(p=>p.id===task.projectId),key=project?.id||'__unattached__';
    if(!groups.has(key))groups.set(key,{project,tasks:[]});
    groups.get(key).tasks.push(task);
  }
  return [...groups.values()].map(({project,tasks})=>{
    const unattached=!project, title=project?.name||(tasks.every(t=>t.fixed)?tr('固定安排'):tasks.every(t=>t.type==='临时')?tr('临时任务'):tr('其他安排')), sub=project?`Owner · ${nameOf(project.owner)} · ${projectStatus(project)}`:tasks.every(t=>t.fixed)?tr('按周期自动生成'):tasks.every(t=>t.type==='临时')?tr('不属于任何项目'):tr('历史记录'), done=tasks.filter(t=>t.status==='done').length;
    return `<section class="daily-project-card ${unattached?'unattached-project':''}" data-project="${escapeHTML(project?.id||'')}"><div class="daily-project-heading"><div><span class="daily-project-kicker">${unattached?tr('安排'):tr('项目')}</span><h3>${escapeHTML(title)}</h3></div><span class="daily-project-meta">${tr('{0} · {1}/{2} 已完成',escapeHTML(sub),done,tasks.length)}</span></div><div class="daily-project-tasks">${tasks.map(taskCard).join('')}</div></section>`;
  }).join('');
}
function bindTaskCards(root){$$(root+' .task-card').forEach(e=>{e.onclick=()=>openDrawer(e.dataset.id);e.onkeydown=x=>{if(x.key==='Enter')openDrawer(e.dataset.id)}})}
function renderDayTab(day){const tab=$('#dayTab');if(!tab)return;const d=new Date(`${day}T12:00:00`),n=String(d.getDate());if($('#dayTabDay').textContent!==n){tab.classList.remove('turn');void tab.offsetWidth;tab.classList.add('turn')}$('#dayTabMonth').textContent=tr('{0}月',d.getMonth()+1);$('#dayTabDay').textContent=n;$('#dayTabWeek').textContent=wd(day);tab.classList.toggle('is-today',day===S.today);const h=$('#todayView h1');if(h)h.textContent=day===S.today?tr('今天做什么？'):day===add(S.today,1)?tr('明天做什么？'):day===add(S.today,-1)?tr('昨天做了什么？'):tr('这一天的安排')}
function renderToday(){if(typeof syncFilterLinks==='function')syncFilterLinks();const day=displayDay(),deferredView=UI.filter==='deferred';renderStats(day);renderDayTab(day);
  $('#todayLabel').textContent=deferredView?tr('递延任务'):`${wd(day)} · `
  +`${fmt(day)}`;$('#dateChip').textContent=deferredView?tr('全部日期'):fmt(day);
  $$('.quick-tab').forEach(b=>b.classList.toggle('active',b.dataset.filter===UI.filter));
  let ts=(deferredView?scheduleTasks():scheduleTasks().filter(t=>taskActiveOn(t,day)));
  if(UI.filter==='open')ts=ts.filter(t=>!isArchivedTask(t)&&t.status!=='done');
  if(UI.filter==='done')ts=ts.filter(t=>t.status==='done');if(UI.filter==='P0')ts=ts.filter(t=>t.priority==='P0');
  if(UI.filter==='inprogress')ts=ts.filter(t=>t.status==='doing');if(deferredView)ts=ts.filter(isDeferredTask);
  const emptyCopy=UI.filter==='inprogress'?[tr('暂无进行中的任务'),'']:deferredView?[tr('暂无未完成的递延任务'),'']:[tr('今天没有待处理任务'),''];
  $('#todayEmptyTitle').textContent=emptyCopy[0];$('#todayEmptyHint').textContent=emptyCopy[1];
  $('#todayTaskList').innerHTML=dailyTaskGroups(ts);$('#todayEmpty').classList.toggle('hidden',ts.length>0);
  bindTaskCards('#todayTaskList')}
/* ---------------------------------------------------------------------------
   周视图 · one week at a time. Seven ruled columns list each day's tasks
   outright; the arrows (or ← →) turn the page. Nothing hides behind a hover.
   ------------------------------------------------------------------------- */
const WEEK_DAY_LIMIT=6;
function weekLabel(off){
  if(off===0)return tr('本周');if(off===-1)return tr('上周');if(off===1)return tr('下周');
  return off>0?tr('{0} 周后',off):tr('{0} 周前',-off);
}
function weekTaskChip(t,iso){
  const cont=iso>t.date,[c,l]=status(t);
  const meta=cont?tr('续 · {0}',nameOf(t.assignee)):`${escapeHTML(t.time||'09:00')} · ${nameOf(t.assignee)}`;
  return `<button class="week-task ${escapeHTML(t.priority)} ${c}${cont?' cont':''}${t.stackCount>1?' is-stacked':''}" type="button" data-id="${escapeHTML(t.id)}" title="${escapeHTML(`${t.name} · ${nameOf(t.assignee)} · ${l}`)}">`
    +`${t.stackCount>1?`<span class="week-task-title"><span class="week-task-name">${escapeHTML(t.name)}</span>${stackBadge(t)}</span>`
    :`<span class="week-task-name">${escapeHTML(t.name)}</span>`}`

    +`<span class="week-task-meta">${escapeHTML(meta)}${!cont&&isMultiDay(t)?` ${tr('· {0} 天',spanDays(t))}`:''}</span></button>`;
}
/* A past day keeps a trace of what moved on: its unfinished occurrences were
   carried forward and leave the board, which used to make the day look empty.
   Nothing is added to a day that is over, and an empty one stays small. */
function weekDayColumn(iso,tasks,canAdd,carried=0){
  const today=iso===S.today,past=iso<S.today,out=iso>DATE_HORIZON,day=sortTasks(tasks.filter(t=>taskActiveOn(t,iso)));
  const shown=day.slice(0,WEEK_DAY_LIMIT),more=day.length-shown.length,done=day.filter(t=>t.status==='done').length;
  const quiet=past&&!day.length&&!carried;
  return `<section class="week-day${today?' today':''}${past?' past':''}${out?' out':''}${quiet?' is-quiet':''}" data-date="${iso}">`
    +`<header class="week-day-head"><button class="week-day-open" type="button" data-date="${iso}" aria-label="${escapeHTML(tr('{0} {1}，{2} 项任务',wd(iso),fmt(iso),day.length))}"><span>${wd(iso)}</span><strong>${new Date(`${iso}T12:00:00`).getDate()}</strong>${today?tr('<em>今天</em>'):''}</button>`
    +`${day.length?`<small>${done}/${day.length}</small>`:''}</header>`
    +`<div class="week-day-tasks">${shown.map(t=>weekTaskChip(t,iso)).join('')}`
    +`${more>0?`<button class="week-day-more" type="button" data-date="${iso}">${tr('还有 {0} 项',more)}</button>`:''}`
    +`${past&&carried?`<p class="week-day-carried">${tr('{0}{1} 项未完成，已递延',icon('arrow-right'),carried)}</p>`:''}</div>`
    +`${canAdd&&!out&&!past?`<button class="week-day-add" type="button" data-date="${iso}" aria-label="${tr('在 {0} 新增任务',escapeHTML(fmt(iso)))}">${icon('plus')}</button>`:''}</section>`;
}
function weekDeferralCounts(){
  // A deferral is a historical event, even when its successor is now done.
  // Superseded alone also includes merged periods and reopened work.
  const deferred=new Set((S.logs||[]).filter(l=>l.kind==='defer').map(l=>l.taskId)),counts=new Map();
  scheduleTasks(true).filter(t=>deferred.has(t.id)).forEach(t=>counts.set(t.date,(counts.get(t.date)||0)+1));
  return counts;
}
function renderCalendar(){
  const horizon=weekOffsetFor(DATE_HORIZON);
  UI.selectedWeek=Math.min(UI.selectedWeek||0,horizon);
  const days=week(UI.selectedWeek),tasks=scheduleTasks(),canAdd=taskEntryMode()!=='none';
  const inWeek=tasks.filter(t=>days.some(d=>taskActiveOn(t,d))),done=inWeek.filter(t=>t.status==='done').length;
  $('#weekRangeLabel').textContent=tr('{0} · {1} — {2} · {3} 项任务{4}',weekLabel(UI.selectedWeek),fmt(days[0]),fmt(days[6]),inWeek.length,inWeek.length?` ${tr('· 完成 {0}',done)}`:'');
  $('#backTodayBtn').classList.toggle('is-current',UI.selectedWeek===0);
  $('#nextWeekBtn').disabled=UI.selectedWeek>=horizon;
  const board=$('#weekCarousel');
  board.dataset.turn=UI.weekDir||'';UI.weekDir='';
  const carried=weekDeferralCounts();
  board.innerHTML=`<div class="week-grid">${days.map(iso=>weekDayColumn(iso,tasks,canAdd,carried.get(iso)||0)).join('')}</div>`;

  $$('#weekCarousel .week-task').forEach(b=>b.onclick=()=>openDrawer(b.dataset.id));
  $$('#weekCarousel .week-day-open, #weekCarousel .week-day-more').forEach(b=>b.onclick=()=>renderDayDetail(b.dataset.date));
  $$('#weekCarousel .week-day-add').forEach(b=>b.onclick=()=>newTask(null,b.dataset.date));
  /* On a tablet the board scrolls sideways; open it with today in the middle. */
  const today=board.querySelector('.week-day.today');
  if(board.scrollWidth>board.clientWidth)board.scrollLeft=today?today.getBoundingClientRect().left-board.getBoundingClientRect().left+board.scrollLeft-(board.clientWidth-today.offsetWidth)/2:0;
}
function turnWeek(step){
  if(step>0&&UI.selectedWeek>=weekOffsetFor(DATE_HORIZON)){toast(tr('日期范围目前只支持到 {0}',DATE_HORIZON));return}
  UI.weekDir=step>0?'next':'prev';UI.selectedWeek=(UI.selectedWeek||0)+step;
  renderScheduleScope();renderCalendar();
}
function renderDayDetail(iso){UI.detailDate=iso;switchView('dayDetail')}
function renderDayContent(){
  const iso=UI.detailDate||displayDay();
  $('#dayDetailKicker').textContent=`${wd(iso)} · ${fmt(iso)}`;
  const tasks=scheduleTasks().filter(t=>taskActiveOn(t,iso));
  const mode=taskEntryMode(),add=mode!=='none'?`<button class="secondary-btn calendar-add-task" data-date="${iso}">${icon(mode==='approval'?'arrow-up-right':'plus')}${mode==='approval'?tr('在此日期申请任务'):tr('在此日期新增任务')}</button>`:'';
  $('#dayDetailContent').innerHTML=add+(dailyTaskGroups(tasks)||tr('<div class="empty-state"><div class="empty-icon">—</div><h3>这一天还没有安排</h3></div>'));
  bindTaskCards('#dayDetailContent');
  $('#dayDetailContent .calendar-add-task')?.addEventListener('click',()=>newTask(null,iso));
}
/* Log kinds are storage keys; the drawer reads them back in people's words. */
const LOG_LABELS={start:tr('开始任务'),auto_start:tr('到点自动开始'),complete:tr('完成任务'),complete_pending:tr('提交完成审批'),defer:tr('未完成，递延'),skip:tr('跳过本次'),edit_request:tr('申请修改任务'),task_approval_superseded:tr('审批由后续任务接续'),complete_edit:tr('修改完成记录'),reopen:tr('被打回')};
function logLine(x){
  const note=v=>v?` · ${tr(v)}`:'',actual=x.actual?tr(' · 实际 {0} 分钟',x.actual):'';
  if(x.stackCount>1&&x.kind==='reopen')return tr('打回合并 {0} 期{1}',x.stackCount,note(x.reason));
  if(x.stackCount>1&&x.kind==='complete_edit')return tr('修改合并 {0} 期完成记录{1}{2}',x.stackCount,note(x.summary),actual);
  if(x.stackCount>1&&x.kind==='complete')return tr('完成合并 {0} 期{1}{2}',x.stackCount,note(x.summary),actual);
  const merged=x.stackCount>1?tr('合并 {0} 期',x.stackCount):'';
  if(x.kind==='defer'&&x.target)return tr('{0}递延至 {1}{2}',merged,fmt(x.target),note(x.reason));
  if(x.kind==='adjust')return tr('指派调整：{0} → {1}',nameOf(x.before?.assignee),nameOf(x.after?.assignee));
  if(x.kind==='approval'||x.kind==='edit_approval'){const verdict=x.decision==='approved'?tr('通过'):x.decision==='rejected'?tr('驳回'):'';return `${x.kind==='approval'?tr('完成审批'):tr('修改审批')}${verdict}${x.reason?` · ${x.reason}`:''}`}
  const detail=tr(x.summary||x.reason||x.remaining||'');
  return `${LOG_LABELS[x.kind]||x.kind}${detail?` · ${detail}`:''}`;
}
function taskHistoryHTML(task,ids=taskLineageIds(task)){
  const logs=(S.logs||[]).filter(x=>ids.has(x.taskId));
  const row=x=>`<div class="history-item"><i></i><span>${escapeHTML(logLine(x))}${x.stackDates?.length?`<span class="history-dates">${x.stackDates.map(d=>`<span>${escapeHTML(fmt(d))}</span>`).join('')}</span>`:''}</span><small>${escapeHTML([x.actor==='system'?tr('系统'):nameOf(x.actor),logTime(x.createdAt)].filter(Boolean).join(' · '))}</small></div>`;
  if(!logs.length)return tr('<div class="history-item"><i></i><span>暂无记录</span></div>');
  if(!(task.stackCount>1)&&!logs.some(x=>x.stackCount>1))return logs.map(row).join('');
  const byId=new Map(S.tasks.map(t=>[t.id,t])),periodOf=id=>{let t=byId.get(id),seen=new Set();while(t&&(t.originId||t.reworkOf)&&!seen.has(t.id)){seen.add(t.id);t=byId.get(t.originId||t.reworkOf)||t; if(seen.has(t.id))break}return t},groups=new Map(),shared=[],batches=new Set();
  for(const event of logs){
    if(event.stackCount>1){if(event.stackBatchId){if(batches.has(event.stackBatchId))continue;batches.add(event.stackBatchId)}shared.push(event);continue;}
    const root=periodOf(event.taskId),day=root?.repeatDate||(root?.id?.startsWith('repeat:')?root.id.slice(-10):root?.date)||'';
    if(!groups.has(day))groups.set(day,[]);groups.get(day).push(event);
  }
  const section=(title,events)=>`<section class="history-period"><h4>${escapeHTML(title)}</h4>${events.map(row).join('')}</section>`;
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([day,events])=>section(day?fmt(day):tr('任务记录'),events)).join('')+(shared.length?section(tr('合并操作'),shared):'');
}
function logTime(iso){const m=String(iso||'').match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/);return m?tr('{0}月{1}日 {2}',Number(m[1]),Number(m[2]),m[3]):''}
function openDrawer(id){
  const alias=S.tasks.find(x=>x.id===id);if(alias&&isSuperseded(alias)&&alias.supersededBy&&(['todo','doing'].includes(alias.status)||alias.stackCompletedBy)){const target=S.tasks.find(x=>x.id===alias.supersededBy);if(target&&target.id!==id)return openDrawer(target.id)}
  const t=S.tasks.find(x=>x.id===id);if(!t)return;
  if($('#taskDrawer').classList.contains('hidden'))UI.drawerReturnFocus=document.activeElement;
  clearFresh(taskLineageIds(t));
  const [c,l]=status(t),p=S.projects.find(p=>p.id===t.projectId),archived=['done','deferred','skipped'].includes(t.status),pendingApproval=['pending_approval','awaiting_approval','submitted'].includes(t.status),rejected=['rejected','returned'].includes(t.status),lineageIds=taskLineageIds(t);
  const manage=canManageProject(p)&&p.status==='active'&&!archived&&!pendingApproval&&!rejected,perform=!S.user.admin&&!archived&&t.assignee===S.user.id;
  const editPending=taskEditPending(t),editRequest=taskEditRequest(t),
  ownTemp=!t.projectId&&t.creator===S.user.id&&t.assignee===S.user.id,giver=!S.user.admin&&handedOut(t),
  canRequestEdit=perform&&!S.user.admin&&!ownTemp&&!editPending&&!['done','deferred','skipped','pending_approval',
    'awaiting_approval','submitted'].includes(t.status)&&(!p||p.status==='active');
  const editReviewer=editRequest?.approver===S.user.id;
  /* A finished task needs no sign-off. Its assignee can still correct the
     record, and the Owner or an admin can send it back with a reason. */
  const settled=t.status==='done'&&!t.carriedCompletion&&!isSuperseded(t)&&(!p||p.status==='active');
  const canEditCompletion=settled&&!S.user.admin&&t.assignee===S.user.id,
  canReopen=settled&&(p?canManageProject(p):Boolean(S.user.admin)||giver);
  const completionActions=canEditCompletion||canReopen?`<div class="drawer-actions">${canEditCompletion?`<button class="secondary-btn" id="editCompletion">${tr('{0}修改完成记录',icon('edit'))}</button>`:''}${canReopen?`<button class="secondary-btn" id="reopenTask">${tr('{0}打回',icon('arrow-up-right'))}</button>`:''}</div>`:'';
  const reopenNote=t.reopen&&['todo','doing'].includes(t.status)?`<p class="rejection-note">${tr('{0} 打回：{1}',escapeHTML(nameOf(t.reopen.by)),escapeHTML(t.reopen.reason||''))}</p>`:'';
  const editReviewActions=editPending&&editReviewer?`<div class="drawer-actions approval-actions"><button class="primary-btn" id="approveEditRequest">${tr('{0}同意修改',icon('check'))}</button><button class="secondary-btn" id="rejectEditRequest">${tr('驳回修改申请')}</button></div>`:'';
  const completionLogs=S.logs.filter(x=>x.taskId===t.id&&['complete','complete_pending'].includes(x.kind)),latestCompletion=completionLogs[completionLogs.length-1],completionSummary=t.completionSummary||latestCompletion?.summary||t.approval?.summary,completionActual=t.completionActual||latestCompletion?.actual;
  const rejection=t.rejection||t.approval?.reason;
  const actionCopy=pendingApproval?`<p class="muted approval-pending-note">${tr('等待')} `
    +tr('{0} 审批',escapeHTML(nameOf(t.approval?.approver||p?.owner||'superadmin')))
    +`</p>`:editPending?`<p class="muted approval-pending-note">${tr('修改申请待 {0} 审批',escapeHTML(nameOf(editApprover(t))))}`
    +`</p>`:rejected?`<p class="rejection-note">${tr('任务已驳回{0}',rejection?tr('：{0}',escapeHTML(rejection)):'')}`
    +`</p>`:archived?`<p class="muted">${isSuperseded(t)?tr('已由后续任务接替'):tr('{0} · 已归档',l)}`
    +`</p>`:perform?`<div class="drawer-actions">${t.status==='todo'?`<button class="secondary-btn" id="startTask">`
    +`${tr('{0}开始任务',icon('play'))}</button>`:''}<button class="primary-btn complete-btn" id="completeTask">${tr('{0}记录完成',icon('check'))}`
    +`</button><button class="defer-btn" id="deferTask">${tr('{0}未完成，递延',icon('arrow-up-right'))}</button></div>`:'';
  const editSummary=editPending?renderEditRequestSummary(t):'';
  /* superadmin removes any task; a project's Owner removes work in their running project. */
  const canDelete=(S.user.admin||(p?.owner===S.user.id&&p.status==='active'))&&!t.fixed&&!t.repeatId&&!pendingApproval&&!rejected;
  const canDirectEdit=(S.user.admin||(perform&&ownTemp)||giver)&&!editPending&&(!p||p.status==='active')
    &&!['done','deferred','skipped','pending_approval','awaiting_approval','submitted','rejected'].includes(t.status);
  $('#drawerContent').innerHTML=`<div class="drawer-kicker">${escapeHTML(projectName(t))} · ${escapeHTML(t.priority)}`
    +`</div><h2 class="drawer-title">${escapeHTML(t.name)}${stackBadge(t)}</h2><p class="drawer-description">`
    +`${escapeHTML(t.desc||tr('暂无描述'))}</p>${completionSummary?`<div class="completion-summary"><span>`
    +`${reopenNote?tr('上次完成总结'):tr('最新完成总结')}</span><p>${escapeHTML(completionSummary)}${completionActual?` ${tr('· 实际')} `
    +tr('{0} 分钟',completionActual):''}</p></div>`:''}${reopenNote}${editSummary}<div class="detail-grid"><div><span>${tr('状态')}`
    +`</span><strong><i class="status-dot ${c}"></i>${l}</strong></div><div><span>${tr('预计时长')}</span><strong>${tr('{0} 分钟',t.duration)}`
    +`</strong></div>${t.stackCount>1?`<div><span>${tr('合并期次')}</span><strong class="stack-period-list">${stackPeriodDates(t).map(d=>`<span>${escapeHTML(fmt(d))}</span>`).join('')}</strong></div>`:''}<div><span>${isMultiDay(t)?tr('任务周期 · {0} 天',spanDays(t)):tr('安排日期')}</span><strong>${escapeHTML(fmt(t.date))}`
    +`${isMultiDay(t)?` → ${escapeHTML(fmt(taskEnd(t)))}`:''}</strong></div><div><span>DDL</span><strong class="`
    +`${t.status==='done'?'':daysCount(S.today,taskEnd(t))<0?'overdue-text':''}">${escapeHTML(ddlText(t))}</strong>`
    +`</div><div><span>${tr('负责人')}</span><strong>${escapeHTML(nameOf(t.assignee))}</strong></div>`
    +`${!t.projectId&&t.creator&&t.creator!==t.assignee?`<div><span>${tr('指派人')}</span><strong>${escapeHTML(nameOf(t.creator))}`
    +`</strong></div>`:''}</div>`
    +`${canRequestEdit?tr('<button class="secondary-btn edit-task-request-btn" id="requestTaskEdit">申请修改任务</button>'):''}`
    +`${canDirectEdit?tr('<button class="secondary-btn edit-task-request-btn" id="directTaskEdit">直接调整任务</button>'):''}`
    +`${manage?tr('<button class="secondary-btn" id="adjustTaskAssignment">调整任务指派</button>'):''}`
    +`${canDelete?tr('<button class="secondary-btn danger-btn" id="deleteTask">删除此任务</button>'):''}<div class="history">`
    +`<h3>${tr('任务记录')}</h3>${taskHistoryHTML(t,lineageIds)}</div>${actionCopy}`
    +`${completionActions}${editReviewActions}`;
  $('#taskDrawer').classList.remove('hidden');$('#startTask')?.addEventListener('click',()=>act('task.start',{id:t.id}).then(()=>closeDrawer()).catch(()=>{}));$('#completeTask')?.addEventListener('click',()=>complete(t));$('#deferTask')?.addEventListener('click',()=>defer(t));$('#requestTaskEdit')?.addEventListener('click',()=>editTaskRequest(id));$('#directTaskEdit')?.addEventListener('click',()=>editTaskRequest(id,true));$('#adjustTaskAssignment')?.addEventListener('click',()=>editTaskAssignment(id));$('#deleteTask')?.addEventListener('click',async()=>{if(!confirm(tr('确认删除「{0}」？删除后将从日历移除，之前的递延记录一并删除。',t.name)))return;try{await act('task.delete',{id:t.id});closeDrawer()}catch(e){}});$('#editCompletion')?.addEventListener('click',()=>editCompletion(t));$('#reopenTask')?.addEventListener('click',()=>reopenTask(t));$('#approveEditRequest')?.addEventListener('click',()=>reviewTaskEdit(t.id,true));$('#rejectEditRequest')?.addEventListener('click',()=>reviewTaskEdit(t.id,false));
}
function taskEditRequest(t){
  if(!t)return null;
  const embedded=t.editRequest||t.edit_request||t.changeRequest;
  if(embedded)return embedded;
  return (S.editRequests||[]).filter(r=>r.taskId===t.id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).find(Boolean)||null;
}
/* A one-off task someone wrote for another person: the writer follows it,
   settles changes to it and may send it back, much as a project Owner does. */
const handedOut=t=>Boolean(t&&!t.projectId&&t.creator===S.user?.id&&t.assignee!==S.user?.id);
const isAdminAccount=id=>Boolean(userById(id)?.admin);
function editApprover(t){
  const p=S.projects.find(x=>x.id===t.projectId);
  if(p)return t.assignee===p.owner?'superadmin':p.owner;
  const giver=userById(t.creator);
  return giver?.active&&!giver.admin?t.creator:'superadmin';
}
function taskEditPending(t){const r=taskEditRequest(t);return Boolean(r&&(r.status==='pending'||r.state==='pending'))}
function renderEditRequestSummary(t){const r=taskEditRequest(t);if(!r)return '';const c=r.changes||r.requested||{};const labels={name:tr('名称'),desc:tr('描述'),date:tr('日期'),deadline:tr('期限'),duration:tr('时长'),priority:tr('优先级'),assignee:tr('负责人')};const rows=Object.entries(labels).filter(([k])=>c[k]!==undefined&&String(c[k])!==String(t[k]??'')).map(([k,label])=>`<li><b>${label}</b><span>${escapeHTML(String(c[k]))}</span></li>`).join('');const state=r.status==='approved'?tr('修改已通过'):r.status==='rejected'?tr('修改申请已驳回'):tr('待审批的修改申请');return `<div class="edit-request-summary"><strong>${state}</strong><small>${tr('申请人：{0}{1}{2}',escapeHTML(r.requester||r.requestedBy||t.assignee),r.reason?` ${tr('· 理由：{0}',escapeHTML(r.reason))}`:'',r.rejection?` ${tr('· 驳回建议：{0}',escapeHTML(r.rejection))}`:'')}</small>${rows?`<ul>${rows}</ul>`:''}</div>`}
/* Stored in Chinese whatever the interface language; shown through tr(). */
const FEELINGS=['顺利','一般','困难','阻塞'];
function completionFields(summary='',actual=30,feeling='顺利'){return `<label class="form-field">${tr('完成总结')}<textarea id="doneText">${escapeHTML(summary)}</textarea></label><label class="form-field">${tr('实际耗时（分钟）')}<input id="actualMins" type="number" min="1" max="1440" value="${Number(actual)||30}"></label><label class="form-field">${tr('工作感受')}<select id="feeling">${FEELINGS.map(f=>`<option value="${f}" ${f===feeling?'selected':''}>${tr(f)}</option>`).join('')}</select></label>`}
function editCompletion(t){
  openModal(`<div class="eyebrow">${tr('完成记录 · {0}',escapeHTML(t.name))}</div><h2>${tr('修改完成记录')}</h2>${completionFields(t.completionSummary||'',t.completionActual||t.duration,t.completionFeeling||'顺利')}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmCompletionEdit">${tr('保存修改')}</button></div>`);
  draftForm(`task.completion:${t.id}`, {title: tr('修改完成记录'), label: t.name, reopen: ['editCompletion', t.id],
    submit: ['task.completion.update']});
  $('#cancelAction').onclick=closeModal;
  $('#confirmCompletionEdit').onclick=async()=>{const summary=$('#doneText').value.trim();if(!summary){toast(tr('请填写完成总结'));return}try{await act('task.completion.update',{id:t.id,summary,actual:Number($('#actualMins').value),feeling:$('#feeling').value});closeModal();closeDrawer();toast(tr('完成记录已更新'))}catch(e){}};
}
function reopenTask(t){
  openModal(`<div class="eyebrow">${tr('{0} · 打回',escapeHTML(projectName(t)))}</div><h2>${tr('打回「{0}」',escapeHTML(t.name))}</h2><p>${tr('任务回到 {0} 的待办{1}，并通知对方。',escapeHTML(nameOf(t.assignee)),t.date<S.today?tr('，排到今天'):'')}</p><label class="form-field">${tr('打回原因')}<textarea id="reopenReason" placeholder="${tr('哪里还需要补充')}"></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmReopen">${tr('打回并通知')}</button></div>`);
  draftForm(`task.reopen:${t.id}`, {title: tr('打回任务'), label: t.name, reopen: ['reopenTask', t.id],
    submit: ['task.reopen']});
  $('#cancelAction').onclick=closeModal;
  $('#confirmReopen').onclick=async()=>{const reason=$('#reopenReason').value.trim();if(!reason){toast(tr('请填写打回原因'));return}try{await act('task.reopen',{id:t.id,reason});closeModal();closeDrawer();toast(tr('任务已打回'))}catch(e){}};
}
function complete(t){
  openModal([
    `<div class="eyebrow">${tr('完成记录 · {0}',escapeHTML(t.name))}</div><h2>${tr('记录完成{0}',stackBadge(t))}</h2>`,
    `<label class="form-field">${tr('完成总结')}<textarea id="doneText" ></textarea></label>`,
    `<label class="form-field">${tr('实际耗时（分钟）')}<input id="actualMins" type="number" value="${t.duration}"></label>`,
    `<label class="form-field">${tr('工作感受')}<select id="feeling">`,
    FEELINGS.map(f=>`<option value="${f}">${tr(f)}</option>`).join(''),
    '</select></label>',
    `<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button>`,
    `<button class="primary-btn" id="confirmComplete">${t.stackCount>1?tr('完成全部 {0} 期',t.stackCount):tr('确认完成')}`,
    '</button></div>',
  ].join(''));
  draftForm(`task.complete:${t.id}`, {title: tr('记录完成'), label: t.name, reopen: ['complete', t.id],
    submit: ['task.complete']});
  $('#cancelAction').onclick=closeModal;
  // A summary left empty is stored as the Chinese default, like every value the server keeps.
  $('#confirmComplete').onclick=async()=>{try{await api('/api/action',{action:'task.complete',data:{id:t.id,
      summary:$('#doneText').value||'完成任务',...(t.stackCount>1?{stackPeriods:t.stackPeriods}:{}),
      actual:Number($('#actualMins').value),feeling:$('#feeling').value}});
    closeModal();closeDrawer();await refresh();toast(tr('任务已完成'))}catch(e){toast(e.message)}}}
function editTaskRequest(id,direct=false){
  const t=S.tasks.find(x=>x.id===id),p=S.projects.find(x=>x.id===t?.projectId);if(!t)return;
  const pool = p ? projectAssignees(p)
    : S.user.admin || (handedOut(t) && !tempSelfOnly()) ? S.users.filter(u => u.active && !u.admin)
      : S.users.filter(u => u.id === S.user.id);
  // Keep the current assignee selectable so saving other fields never silently reassigns the task.
  const users=pool.some(u=>u.id===t.assignee)?pool:[...S.users.filter(u=>u.id===t.assignee),...pool];
  const minDate=p?.start||S.today,maxDate=p?.end? (p.end<DATE_HORIZON?p.end:DATE_HORIZON):DATE_HORIZON;
  openModal(`<div class="eyebrow">${tr('{0} · 任务修改',escapeHTML(projectName(t)))}</div><h2>${direct?tr('直接调整任务'):tr('申请修改任务')}</h2>`
    +`${direct?'':`<p>${tr('审批人：{0}',escapeHTML(nameOf(editApprover(t))))}</p>`}<label class="form-field">${tr('任务名称')}`
    +`<input id="editTaskName" maxlength="120" value="${escapeHTML(t.name)}"></label><label class="form-field">${tr('任务描述')}`
    +`<textarea id="editTaskDesc">${escapeHTML(t.desc||'')}</textarea></label><div class="task-form-grid">`
    +`<label class="form-field">${tr('安排日期')}<input id="editTaskDate" type="date" min="${escapeHTML(minDate)}" ${maxDate?`max="`
    +`${escapeHTML(maxDate)}"`:''} value="${escapeHTML(t.date||S.today)}"></label><label class="form-field">${tr('截止时间')}`
    +`<input id="editTaskDeadline" type="date" min="${escapeHTML(minDate)}" ${maxDate?`max="`
    +`${escapeHTML(maxDate)}"`:''} value="${escapeHTML(t.deadline||t.date||'')}"></label><label class="form-field">${tr('预计时长')}`
    +`<input id="editTaskDuration" type="number" min="1" max="1440" value="${Number(t.duration)||30}"></label>`
    +`<label class="form-field">${tr('优先级')}<select id="editTaskPriority"><option ${t.priority==='P0'?'selected':''}>P0</option>`
    +`<option ${t.priority==='P1'?'selected':''}>P1</option><option ${t.priority==='P2'?'selected':''}>P2</option>`
    +`</select></label></div><label class="form-field">${tr('协作人 / 负责人')}<select id="editTaskAssignee">`
    +`${users.map(u=>`<option value="${escapeHTML(u.id)}" ${u.id===t.assignee?'selected':''}>${escapeHTML(nameOf(u.id))}`
    +`${p&&u.id===p.owner?' · Owner':''}</option>`).join('')}</select></label><label class="form-field">${tr('修改理由')}`
    +`<textarea id="editTaskReason" required ></textarea></label><div class="modal-footer">`
    +`<button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmTaskEdit">`
    +`${direct?tr('保存调整'):tr('提交修改申请')}</button></div>`);
  if(direct)$('#editTaskReason')?.closest('label')?.remove();
  draftForm(`task.edit:${id}${direct ? ':direct' : ''}`, {title: direct ? tr('直接调整任务') : tr('申请修改任务'),
    label: t.name, reopen: ['editTaskRequest', id, direct], submit: ['task.update', 'task.edit_request']});
  $('#cancelAction').onclick=closeModal;
  $('#confirmTaskEdit').onclick=async()=>{const reason=$('#editTaskReason')?.value.trim()||'',name=$('#editTaskName').value.trim(),date=$('#editTaskDate').value,deadline=$('#editTaskDeadline').value;if(!name){toast(tr('请填写任务名称'));return}if(!direct&&!reason){toast(tr('请填写修改理由'));return}if(deadline&&date&&deadline<date){toast(tr('截止时间不能早于安排日期'));return}const changes={name,desc:$('#editTaskDesc').value,date,deadline,duration:Number($('#editTaskDuration').value),priority:$('#editTaskPriority').value,assignee:$('#editTaskAssignee').value};try{if(direct){await act('task.update',{id,...changes});closeModal();closeDrawer();toast(tr('任务已直接调整'))}else{await act('task.edit_request',{id,changes,reason});closeModal();closeDrawer();toast(tr('修改申请已发送，等待审批'))}}catch(e){}};
}
function reviewTaskEdit(id,accept,notificationId){
  const r=(S.editRequests||[]).find(x=>x.id===id)||S.editRequests?.find(x=>x.taskId===id&&x.status==='pending'),t=S.tasks.find(x=>x.id===r?.taskId);if(!t||!r)return;
  if(accept){(async()=>{try{await act('task.edit_review',{id:r.id,accept:true});if(notificationId)await act('inbox.read',{id:notificationId});closeModal();closeDrawer();toast(tr('任务修改已批准'))}catch(e){}})();return}
  openModal([
    `<div class="eyebrow">${tr('任务修改审批 · 驳回')}</div><h2>${tr('驳回修改申请')}</h2>`,
    `<p>${tr('申请理由：{0}',escapeHTML(r.reason||tr('未填写')))}</p><label class="form-field">${tr('驳回建议')}`,
    `<textarea id="editRejectReason" placeholder="${tr('请说明需要如何调整')}"></textarea></label>`,
    `<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button>`,
    `<button class="primary-btn" id="confirmEditReject">${tr('驳回并通知')}</button></div>`,
  ].join(''));
  draftForm(`editreq.reject:${r.id}`, {title: tr('驳回修改申请'), label: t.name,
    reopen: ['reviewTaskEdit', r.id, notificationId], submit: ['task.edit_review']});
  $('#cancelAction').onclick=closeModal;
  $('#confirmEditReject').onclick=async()=>{const reason=$('#editRejectReason').value.trim();
    if(!reason){toast(tr('请填写驳回建议'));return}try{await act('task.edit_review',{id:r.id,accept:false,reason});
    if(notificationId)await act('inbox.read',{id:notificationId});closeModal();closeDrawer()}catch(e){}};
}
const MIN_DEFER_MINUTES = 15;
// 递延 reasons are stored in Chinese and shown in the viewer's language.
const DEFER_REASONS = ['时间不足', '等待他人', '需求变化', '遇到阻塞', '其他'];
function defer(t){
  const remain=Math.max(MIN_DEFER_MINUTES,Math.round(t.duration/2));
  openModal([
    `<div class="eyebrow">${tr('未完成 · 递延预览')}</div><h2>${tr('先说说卡在哪里')}</h2>`,
    `<label class="form-field">${tr('原因')}<select id="deferReason">`,
    DEFER_REASONS.map(r=>`<option value="${r}">${tr(r)}</option>`).join(''),
    `</select></label><label class="form-field">${tr('剩余工作')}<textarea id="remainText"></textarea></label>`,
    `<label class="form-field">${tr('递延到')}`,
    `<input id="deferDate" type="date" max="${DATE_HORIZON}" value="${add(t.date,1)}"></label>`,
    `<label class="form-field">${tr('剩余时长')}<input id="remainMins" type="number" value="${remain}"></label>`,
    `<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('返回修改')}</button>`,
    `<button class="primary-btn" id="confirmDefer">${tr('确认递延')}</button></div>`,
  ].join(''));
  draftForm(`task.defer:${t.id}`, {title: tr('递延任务'), label: t.name, reopen: ['defer', t.id], submit: ['task.defer']});
  $('#cancelAction').onclick=closeModal;
  $('#confirmDefer').onclick=async()=>{try{await api('/api/action',{action:'task.defer',data:{id:t.id,
      ...(t.stackCount>1?{stackPeriods:t.stackPeriods}:{}),reason:$('#deferReason').value,
      remaining:$('#remainText').value||'继续完成原任务',date:$('#deferDate').value,duration:Number($('#remainMins').value)}});
    closeModal();closeDrawer();await refresh();toast(tr('任务已递延'))}catch(e){toast(e.message)}}}
function diaryReport(author,day){
  return (S.diaries||[]).find(r=>r.author===author&&r.date===day)||(S.reports||[]).filter(r=>r.author===author&&r.date===day&&r.kind!=='brief').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
}
function diaryDayStats(author,day){
  const saved=(S.diaryStats||[]).find(r=>r.userId===author&&r.date===day);if(saved)return saved;
  const tasks=S.tasks.filter(t=>t.assignee===author&&taskActiveOn(t,day)&&t.status!=='skipped'&&!isSuperseded(t)),done=tasks.filter(t=>t.status==='done');
  return {completed:done.length,total:tasks.length,load:done.reduce((n,t)=>n+(Number(t.duration)||0),0),loadRatio:tasks.length?done.length/tasks.length:0};
}
/* A day's own archive starts filled in from that day's work: what was done,
   what is still open, and what is lined up for the next day. The holder edits
   on top of it, and once saved it keeps their text. */
function diaryContent(author,day){
  const r=diaryReport(author,day);if(r)return typeof r.content==='string'?{done:r.content,risks:'',next:'',
    note:''}:r.content||{};
  const on=d=>S.tasks.filter(t=>t.assignee===author&&taskActiveOn(t,d)&&t.status!=='skipped'&&!isSuperseded(t)),tasks=on(day);
  return {done:tasks.filter(t=>t.status==='done').map(t=>'✓ '+t.name).join('\n'),risks:tasks.filter(t=>t.status!=='done').map(t=>tr('{0}（未完成）',t.name)).join('\n'),next:on(add(day,1)).filter(t=>t.status!=='done').map(t=>t.name).join('\n')};
}
/* What was actually finished on a day, newest first; for one person or the team. */
function workLogEntries(day,who=null){
  const rows=Array.isArray(S.workCompletions)?S.workCompletions.filter(l=>String(l.completedAt||'').slice(0,10)===day).map(l=>({label:tr('{0}完成 · {1}',l.kind==='project'?tr('项目'):tr('任务'),l.name),user:l.assignee||l.owner,at:l.completedAt,project:l.projectName,taskId:l.taskId,projectId:l.projectId,kind:l.kind})):S.tasks.filter(t=>t.status==='done'&&String(t.completedAt||t.date||'').slice(0,10)===day).map(t=>({label:tr('任务完成 · {0}',t.name),user:t.assignee,at:t.completedAt||t.date,project:projectName(t),taskId:t.id,projectId:t.projectId,kind:'task'}));
  return (who?rows.filter(l=>l.user===who):rows).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
}
/* Under an admin's 档案室: the picked day's work log and everyone's load. */
function renderArchiveLedger(day){
  const box=$('#archiveLedger');if(!box)return;
  const show=Boolean(S.user?.admin&&day);box.classList.toggle('hidden',!show);if(!show)return;
  const members=S.users.filter(u=>u.active&&!u.admin),logs=workLogEntries(day);
  const rows=members.map(u=>{const stats=diaryDayStats(u.id,day),pct=stats.total?Math.round(stats.completed/stats.total*100):0;return `<div class="diary-load-row"><strong title="${escapeHTML(u.id)}">${escapeHTML(nameOf(u.id))}</strong><span>${tr('{0}/{1} 项完成',stats.completed,stats.total)}</span><div class="progress"><i style="width:${pct}%"></i></div><b>${pct}%</b></div>`}).join('');
  const projectRows=visibleProjects().filter(p=>p.status==='active').map(p=>{const ts=S.tasks.filter(t=>t.projectId===p.id&&t.status!=='deferred'&&t.status!=='skipped'&&!isSuperseded(t)),done=ts.filter(t=>t.status==='done').length,pct=ts.length?Math.round(done/ts.length*100):0;return `<div class="diary-project-progress"><strong>${escapeHTML(p.name)}</strong><span>${tr('{0}/{1} 完成 · {2}%',done,ts.length,pct)}</span></div>`}).join('');
  box.innerHTML=`<div class="diary-admin-grid"><div class="diary-log-panel"><div class="panel-heading"><h2>${tr('工作日志 · {0}',fmt(day))}</h2></div><div class="diary-log-list">${logs.map(l=>`<button class="diary-log-item diary-log-button" data-task-id="${escapeHTML(l.taskId||'')}" data-project-id="${escapeHTML(l.projectId||'')}" data-log-kind="${escapeHTML(l.kind||'')}"><i></i><span>${escapeHTML(l.label)}${l.project?`<small class="diary-log-project">${escapeHTML(l.project)}</small>`:''}</span><small>${escapeHTML(l.user?nameOf(l.user):'')}　${icon('chevron-right')}</small></button>`).join('')||tr('<p class="muted">当日暂无已完成任务或项目。</p>')}</div><div class="diary-projects"><h3>${tr('项目当前进度')}</h3>${projectRows||tr('<p class="muted">暂无进行中的项目。</p>')}</div></div><div class="diary-load-panel"><div class="panel-heading"><h2>${tr('成员负载 · {0}',fmt(day))}</h2></div>${rows||tr('<p class="muted">暂无成员数据。</p>')}</div></div>`;
  box.querySelectorAll('.diary-log-button').forEach(b=>b.onclick=()=>openWorkLogDetail(b.dataset.taskId,b.dataset.projectId,b.dataset.logKind));
}
function canManageProject(p){return Boolean(p&&(S.user?.admin||p.owner===S.user?.id))}
function projectAssignees(p){return S.users.filter(u=>u.active&&p?.members?.[u.id]==='accepted')}
function manageableProjects(){return S.projects.filter(p=>p.status==='active'&&canManageProject(p))}
/* What this account may start, from its rule group (规则组): 'direct',
   'approval' or 'none'. Admins, and an Owner inside their own project, always
   act directly. */
const RULE_LABELS={direct:tr('直接创建'),approval:tr('需要审批'),none:tr('不允许')};
const ADMIN_RULES = {
  project: 'direct', tempTask: 'direct', projectTask: 'direct', agent: 'operate', tempAssign: 'anyone',
};
const MEMBER_RULES = {
  project: 'approval', tempTask: 'direct', projectTask: 'none', agent: 'read', tempAssign: 'anyone',
};
function creationRules() {
  return S.creationRules ?? (S.user?.admin ? ADMIN_RULES : MEMBER_RULES);
}
/* A rule group may keep its members' 临时任务 to themselves; then there is no one to pick. */
function tempSelfOnly() {
  return !S.user?.admin && creationRules().tempAssign === 'self';
}
function projectNameById(id) {
  return S.projects.find(x => x.id === id)?.name ?? '';
}
const projectMode=()=>S.user?.admin?'direct':creationRules().project;
const tempTaskMode=()=>S.user?.admin?'direct':creationRules().tempTask;
function taskProjects(){return S.projects.filter(p=>p.status==='active'&&!isProjectHidden(p)).map(p=>({p,mode:canManageProject(p)?'direct':p.members?.[S.user?.id]==='accepted'?creationRules().projectTask:'none'})).filter(x=>x.mode!=='none')}
function taskEntryMode(){const modes=[tempTaskMode(),...taskProjects().map(x=>x.mode)];return modes.includes('direct')?'direct':modes.includes('approval')?'approval':'none'}
const ENTRY_LABELS={task:{approval:'申请任务',direct:'新任务'},project:{approval:'申请项目',direct:'新项目'}};
function entryLabel(mode,kind){
  const labels=ENTRY_LABELS[kind];
  if(!labels)return '';
  return mode==='approval'?`${icon('arrow-up-right')}${tr(labels.approval)}`:`${icon('plus')}${tr(labels.direct)}`;
}
/* 完成项目 closes a running project, ahead of its end date if need be. An admin
   closes it at once; an Owner sends it to an admin with a closing report.
   Whatever is still open is named here and closes with the project. */
function openProjectTasks(p){
  const tasks=S.tasks.filter(t=>t.projectId===p.id&&t.status!=='deferred'&&!t.repeatId&&!isSuperseded(t));
  return tasks.filter(t=>['todo','doing'].includes(t.status));
}
function requestProjectCompletion(id){
  const p=S.projects.find(x=>x.id===id),admin=Boolean(S.user?.admin);
  if(!p||!canManageProject(p)||p.status!=='active')return;
  const open=openProjectTasks(p),early=p.end&&p.end>S.today;
  const left=open.length?[
    `<div class="project-close-note"><strong>${tr('还有 {0} 项任务没完成',open.length)}</strong><span>`,
    tr('{0}{1}；项目完成后它们不再继续。',open.slice(0,4).map(t=>escapeHTML(t.name)).join('、'),open.length>4?tr(' 等'):''),
    '</span></div>',
  ].join(''):'';
  openModal([
    `<div class="eyebrow">${tr('{0} · 完成项目',escapeHTML(p.name))}</div>`,
    `<h2>${early?tr('提前完成项目'):tr('完成项目')}</h2>`,
    early?`<p class="muted">${tr('原定 {0} 截止，现在就结束。',escapeHTML(fmt(p.end)))}</p>`:'',
    `${left}<label class="form-field">${tr('结项报告')}${admin?tr('（可留空）'):''}`,
    '<textarea id="projectCompletionReport" maxlength="10000"></textarea></label>',
    `<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button>`,
    `<button class="primary-btn" id="confirmProjectCompletion">${admin?tr('完成项目'):tr('提交结项审批')}</button></div>`,
  ].join(''));
  draftForm(`project.completion:${p.id}`, {title: early ? tr('提前完成项目') : tr('完成项目'), label: p.name,
    reopen: ['requestProjectCompletion', p.id], submit: ['project.complete', 'project.complete_request']});
  $('#cancelAction').onclick=closeModal;
  $('#confirmProjectCompletion').onclick=async()=>{
    const report=$('#projectCompletionReport').value.trim();
    if(!admin&&!report){toast(tr('请填写结项报告'));return}
    try{await act(admin?'project.complete':'project.complete_request',{id,report});closeModal();
      toast(admin?tr('「{0}」已完成',p.name):tr('结项申请已提交，等待审批'))}catch(e){}
  };
}
/* 项目任务排序. The mode is a per-browser view preference; the manual order
   itself is stored on the project so the whole team sees what the Owner
   arranged. It keys on the lineage root, so a deferral copy keeps its slot. */
const PROJECT_SORT_KEY='wc-project-sort';
const PROJECT_SORTS={priority:tr('按优先级'),manual:tr('手动排序'),start:tr('按开始时间'),end:tr('按结束时间')};
function taskRootId(t,byId){let id=t.id,parent=t.originId||t.reworkOf;const seen=new Set();while(parent&&byId.has(parent)&&!seen.has(parent)){seen.add(parent);id=parent;const node=byId.get(parent);parent=node.originId||node.reworkOf}return id}
function projectSortMode(p){let saved;try{saved=JSON.parse(localStorage.getItem(PROJECT_SORT_KEY)||'{}')[p.id]}catch(_){}return PROJECT_SORTS[saved]?saved:(p.taskOrder?.length?'manual':'priority')}
function setProjectSortMode(id,mode){try{const all=JSON.parse(localStorage.getItem(PROJECT_SORT_KEY)||'{}');all[id]=mode;localStorage.setItem(PROJECT_SORT_KEY,JSON.stringify(all))}catch(_){}}
function sortProjectTasks(p,tasks,mode){
  const base=sortTasks(tasks);
  if(mode==='start')return base.sort((x,y)=>String(x.date).localeCompare(String(y.date))||String(x.time||'').localeCompare(String(y.time||'')));
  if(mode==='end')return base.sort((x,y)=>String(taskEnd(x)).localeCompare(String(taskEnd(y)))||String(x.date).localeCompare(String(y.date)));
  if(mode==='manual'){
    const byId=new Map((S.tasks||[]).map(t=>[t.id,t])),rank=new Map((p.taskOrder||[]).map((id,i)=>[id,i]));
    const at=t=>{const root=taskRootId(t,byId);return rank.has(root)?rank.get(root):rank.size};
    return base.sort((x,y)=>at(x)-at(y));
  }
  return base;
}
function bindProjectTaskDrag(){
  $$('.project-task-tree[data-project]').forEach(tree=>{
    const rows=[...tree.querySelectorAll('.project-child-row[draggable="true"]')];
    const order=()=>[...tree.querySelectorAll('.project-child-row[data-root]')].map(r=>r.dataset.root);
    let dragged=null,before='';
    rows.forEach(row=>{
      row.ondragstart=e=>{dragged=row;before=order().join();row.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',row.dataset.root)};
      row.ondragover=e=>{if(!dragged||dragged===row)return;e.preventDefault();const r=row.getBoundingClientRect();row.parentNode.insertBefore(dragged,e.clientY>r.top+r.height/2?row.nextSibling:row)};
      row.ondrop=e=>e.preventDefault();
      row.ondragend=async()=>{
        row.classList.remove('dragging');dragged=null;
        const next=order();if(next.join()===before)return;
        try{await api('/api/action',{action:'project.reorder',data:{id:tree.dataset.project,order:next}});await refresh();toast(tr('任务顺序已保存'))}catch(err){toast(err.message);renderProjects()}
      };
    });
  });
}
function renderProjects(){
  if(UI.space&&![...visibleProjects(),...(S.fileArchives||[])].some(p=>p.id===UI.space))UI.space='';
  renderProjectNav();
  $('#projectOverview')?.classList?.toggle('hidden',Boolean(UI.space));
  $('#projectSpace')?.classList?.toggle('hidden',!UI.space);
  $('#projectsView')?.classList?.toggle('is-in-project',Boolean(UI.space));
  /* 申请项目 / 新项目 already sits in the top bar; a second copy here only repeats it. */
  $('#addProjectBtn')?.classList?.toggle('hidden',true);$('#projectActions')?.classList?.toggle('hidden',true);
  if(UI.space){$('#projectGrid').innerHTML='';renderProjectSpace(UI.space);return}
  const shelf=UI.shelf==='achievements';$('#projectOverview')?.classList?.toggle('is-shelf',shelf);
  if(shelf){$('#projectGrid').innerHTML='';$('#projectToolbar').innerHTML='';renderAchievements();return}
  const admin=Boolean(S.user?.admin),folder=UI.folder&&(S.folders||[]).find(f=>f.id===UI.folder);
  if(!folder)UI.folder='';

  const pool=visibleProjects().filter(p=>!folder||p.folderId===folder.id),mode=folderSortMode();
  const projects=mode==='nav'?navSequence().filter(p=>pool.includes(p)):sortFolderProjects(pool,mode);
  $('#projectsView .eyebrow').innerHTML=folder?tr('{0} · {1} 个项目',crumb(tr('全部项目'),''),projects.length)
    :tr('{0} · {1} 个项目',admin?tr('团队项目'):tr('我参与的项目'),projects.length);
  bindCrumbs();
  $('#projectsView h1').textContent=folder?folder.name:tr('全部项目');
  $('#projectToolbar').innerHTML=projects.length>1?`<label class="project-sort">${tr('排序')}<select id="projectSort">`
    +`${Object.entries(FOLDER_SORTS).map(([k,v])=>`<option value="${k}"${k===mode?' selected':''}>${v}</option>`).join('')}</select></label>`:'';
  const sort=$('#projectSort');if(sort)sort.onchange=()=>{setFolderSortMode(sort.value);renderProjects()};
  $('#projectGrid').innerHTML=projects.map(projectSummaryHTML).join('')+(folder?'':tempTaskCard())
    ||`<div class="empty-state">${folder?tr('这个文件夹还没有项目，把左侧的项目拖进来'):tr('暂无项目')}</div>`;
  bindProjectCards();
}
/* A folder (or 全部项目) lists its project cards in directory order or by one
   of these; the choice is kept per browser. */
const FOLDER_SORT_KEY='wc-folder-sort';
const FOLDER_SORTS={nav:tr('目录顺序'),name:tr('按名称'),end:tr('按截止日期'),progress:tr('按完成度'),created:tr('最近创建')};
function folderSortMode(){let v;try{v=localStorage.getItem(FOLDER_SORT_KEY)}catch(_){}return FOLDER_SORTS[v]?v:'nav'}
function setFolderSortMode(v){try{localStorage.setItem(FOLDER_SORT_KEY,v)}catch(_){}}
function sortFolderProjects(list,mode){
  const progress=p=>{const t=S.tasks.filter(x=>x.projectId===p.id&&x.status!=='deferred'&&!x.repeatId&&!isSuperseded(x)&&x.status!=='skipped');
    return t.length?t.filter(x=>x.status==='done').length/t.length:0};
  const by={name:(a,b)=>String(a.name).localeCompare(String(b.name),'zh-CN'),
    end:(a,b)=>String(a.end||'9999').localeCompare(String(b.end||'9999')),
    progress:(a,b)=>progress(b)-progress(a),created:(a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))}[mode];
  return [...list].sort(by);
}
/* 全部项目 and a folder list each project as a summary: where it stands and who
   is on it. Its tasks, files and actions live on the project's own page. */
function projectSummaryHTML(p){
  const personal=!S.user?.admin&&p.owner!==S.user?.id;
  const tasks=S.tasks.filter(t=>t.projectId===p.id&&t.status!=='deferred'&&!t.repeatId&&!isSuperseded(t)&&t.status!=='skipped'
    &&(!personal||t.assignee===S.user?.id));
  const done=tasks.filter(t=>t.status==='done').length,pct=tasks.length?Math.round(done/tasks.length*100):0;
  const mine=tasks.filter(t=>t.assignee===S.user?.id&&['todo','doing'].includes(t.status)).length;
  const people=Object.entries(p.members||{}).filter(([,v])=>v==='accepted').map(([id])=>id)
    .sort((a,b)=>(b===p.owner)-(a===p.owner));
  const fresh=freshRefs().has(p.id);
  return `<article class="project-card project-summary${fresh?' is-new':''}" data-project="${escapeHTML(p.id)}"`
    +` data-fresh="${fresh?escapeHTML(p.id):''}"><div class="summary-head"><h3><button type="button" class="project-title-link"`
    +` data-open-project="${escapeHTML(p.id)}">${escapeHTML(p.name)}</button></h3>${fresh?tr('<span class="new-chip">新</span>'):''}`
    +`<span class="project-status${projectOverdue(p)?' is-overdue':''}">${projectStatus(p)}</span></div>`
    +`<p class="summary-desc">${escapeHTML(p.desc||tr('暂无描述'))}</p>`
    +`<div class="summary-progress"><div class="progress"><i style="width:${pct}%"></i></div>`
    +`<span>${tasks.length?tr('{0} {1}/{2} 完成',personal?tr('我的任务'):tr('项目'),done,tasks.length):tr('暂无任务')}</span></div>`
    +`<div class="summary-foot"><span class="summary-people" title="${escapeHTML(people.map(nameOf).join('、'))}">`
    +`${people.slice(0,4).map(id=>avatarHTML(id)).join('')}${people.length>4?`<b>+${people.length-4}</b>`:''}</span>`
    +`${mine?`<span class="summary-mine">${tr('我的待办 {0}',mine)}</span>`:''}`
    +`<span class="summary-end">${p.end?tr('截止 {0}',escapeHTML(fmt(p.end))):tr('长期')}</span></div></article>`;
}
/* What can be done to a project as a whole. One primary step in view; the
   rest, and deleting, wait in 更多 so they never sit beside everyday work. */
function projectActionsHTML(p){
  const admin=Boolean(S.user?.admin),manage=canManageProject(p)&&p.status==='active';
  const joined=p.status==='active'&&!manage&&(p.members||{})[S.user?.id]==='accepted';
  const id=escapeHTML(p.id),menu=[];
  if(manage)menu.push(`<button type="button" class="project-settings" data-id="${id}">${tr('{0}项目设置',icon('settings'))}</button>`,
    `<button type="button" class="request-project-completion" data-id="${id}">${tr('{0}完成项目',icon('check'))}</button>`);
  if(joined)menu.push(`<button type="button" class="leave-project" data-id="${id}">${tr('{0}退出项目',icon('arrow-up-right'))}</button>`);
  if(canManageProject(p))menu.push(`<button type="button" class="delete-project is-danger" data-id="${id}">${tr('{0}删除项目',icon('x'))}</button>`);
  return `${manage?`<button class="primary-btn add-project-task" data-project="${id}">${tr('{0}新建任务',icon('plus'))}</button>`:''}`
    +`${joined&&creationRules().projectTask!=='none'?`<button class="secondary-btn add-project-task" data-project="${id}">`
    +`${entryLabel(creationRules().projectTask,'task')}</button>`:''}`
    +`${p.status==='pending'&&admin?`<button class="primary-btn approve-project" data-id="${id}">${tr('审批项目')}</button>`:''}`
    +`${p.status==='pending_completion'&&admin?`<button class="primary-btn approve-project-completion" data-id="${id}">${tr('审批项目完成')}</button>`:''}`
    +`${menu.length?`<details class="space-more"><summary class="secondary-btn" aria-label="${tr('更多项目操作')}">${tr('更多{0}',icon('chevron-down'))}</summary>`
    +`<div class="space-file-options">${menu.join('')}</div></details>`:''}`;
}
/* A project's task list: the root of each line of work, in the chosen order. */
function projectCardHTML(p){
    const mode=projectSortMode(p),tasks=sortProjectTasks(p,S.tasks.filter(t=>t.projectId===p.id&&t.status!=='deferred'&&!t.repeatId&&!isSuperseded(t)),mode);
    const fixed=(S.repeats||[]).filter(r=>r.projectId===p.id&&r.active!==false);
    const manage=canManageProject(p)&&p.status==='active';
    const drag=manage&&mode==='manual'&&tasks.length>1,byId=new Map(S.tasks.map(t=>[t.id,t]));
    const sorter=tasks.length>1?`<select class="project-task-sort" data-project="${escapeHTML(p.id)}" aria-label="${tr('任务排序')}">${Object.entries(PROJECT_SORTS).map(([k,v])=>`<option value="${k}" ${k===mode?'selected':''}>${v}</option>`).join('')}</select>`:'';
    return `<div class="project-task-tree" data-project="${escapeHTML(p.id)}"><div class="project-tree-label">`
      +`${canManageProject(p)?tr('全部任务'):tr('分配给我的任务')} <span>${tasks.length}</span>${sorter}</div>`
      +`${tasks.map(t=>projectChildRow(t,escapeHTML(nameOf(t.assignee)),{title:t.assignee,
      drag:drag?` draggable="true" data-root="${escapeHTML(taskRootId(t,byId))}"`:'',tail:manage&&['todo',
      'doing'].includes(t.status)?`<button class="ghost-btn assign-project-task" data-id="${escapeHTML(t.id)}">${tr('调整指派')}`
      +`</button>`:''})).join('')||`<p class="project-task-empty">${p.status==='pending'?tr('待审批'):tr('暂无任务')}</p>`}`
      +`${fixed.length?`<div class="project-tree-label">${tr('固定任务')} <span>${fixed.length}</span></div>`
      +`${fixed.map(r=>`<div class="project-fixed-row"><strong>${escapeHTML(r.name)}</strong><small>`
      +`${escapeHTML(repeatPattern(r))} · ${escapeHTML(r.time||'09:00')} · `
      +`${escapeHTML((r.assignees||[]).map(nameOf).join('、'))}${r.end?` ${tr('· 至 {0}',escapeHTML(r.end))}`:''}</small>`
      +`</div>`).join('')}`:''}</div>`;
}
/* The eyebrow above a folder or project names the levels above it; each opens. */
const crumb=(label,folder)=>`<button type="button" class="space-crumb" data-crumb="${escapeHTML(folder)}">${escapeHTML(label)}</button>`;
function bindCrumbs(){
  $$('#projectsView .space-crumb').forEach(b=>b.onclick=()=>b.dataset.crumb==='@shelf'?openAchievements():b.dataset.crumb?openFolderView(b.dataset.crumb):openProjectSpace(''));
}
function bindProjectCards(){
  $$('.project-title-link').forEach(button=>button.onclick=()=>openProjectSpace(button.dataset.openProject));
  $$('#projectGrid .project-card[data-project]').forEach(card=>card.onclick=e=>{
    if(!e.target.closest('button,a,input,select,textarea,label,.project-child-row'))openProjectSpace(card.dataset.project)});
  $$('.project-node[data-fresh]:not([data-fresh=""])').forEach(card=>card.addEventListener('pointerdown',
    ()=>clearFresh([card.dataset.fresh]),{once:true}));
  $$('.add-project-task').forEach(b=>b.onclick=()=>newTask(b.dataset.project));
  $$('.project-task-open').forEach(b=>b.onclick=()=>openDrawer(b.dataset.id));
  $$('.assign-project-task').forEach(b=>b.onclick=()=>editTaskAssignment(b.dataset.id));
  $$('.project-task-sort').forEach(s=>s.onchange=()=>{setProjectSortMode(s.dataset.project,s.value);renderProjects()});
  bindProjectTaskDrag();
  $$('.approve-project').forEach(b=>b.onclick=()=>{const n=S.notifications.find(n=>n.kind==='approval'&&n.reference===b.dataset.id);if(n)openNotification(n.id)});
  $$('.request-project-completion').forEach(b=>b.onclick=()=>requestProjectCompletion(b.dataset.id));
  $$('.approve-project-completion').forEach(b=>b.onclick=()=>{const n=S.notifications.find(n=>n.kind==='project_completion'&&n.reference===b.dataset.id);if(n)openNotification(n.id)});
  $$('.invite-members').forEach(b=>b.onclick=()=>inviteCollaborators(b.dataset.id));
  $$('.project-settings').forEach(b=>b.onclick=()=>projectSettings(b.dataset.id));
  $$('.leave-project').forEach(b=>b.onclick=()=>leaveProject(b.dataset.id));
  $$('.delete-project').forEach(b=>b.onclick=()=>deleteProject(b.dataset.id));
}
/* 项目空间 · 目录. Like a knowledge base's tree: folders (kept by admins) and
   projects share one ordered root, and a folder holds projects. Whoever may
   move a row can drag it; its place is a parent plus an order number between
   its new neighbours (navSlot). A row never moved falls back to its creation
   time, folders ahead of projects, so the tree reads the same for everyone.
   A folder closed here stays closed on this browser. */
const FOLDER_CLOSED_KEY='wc-folders-closed';
function closedFolders(){try{return new Set(JSON.parse(localStorage.getItem(FOLDER_CLOSED_KEY)||'[]'))}catch(_){return new Set()}}
function setFolderClosed(id,shut){
  const closed=closedFolders();shut?closed.add(id):closed.delete(id);
  try{localStorage.setItem(FOLDER_CLOSED_KEY,JSON.stringify([...closed]))}catch(_){}
}
function toggleFolder(id){setFolderClosed(id,!closedFolders().has(id));renderProjectNav()}
const NAV_GAP=1024;
const navOrder=(x,kind)=>Number.isFinite(x.navOrder)?x.navOrder:(Date.parse(x.createdAt||'')/1000||0)+(kind==='project'?1e10:0);
const byNavOrder=(a,b)=>a.order-b.order||String(a.item.name).localeCompare(String(b.item.name),'zh-CN');
/* Members only see folders holding a project they can open; admins see all. */
function projectTree(){
  const projects=visibleProjects(),ids=new Set((S.folders||[]).map(f=>f.id));
  const node=p=>({kind:'project',id:p.id,item:p,order:navOrder(p,'project')});
  const folders=(S.folders||[]).map(f=>({kind:'folder',id:f.id,item:f,order:navOrder(f,'folder'),
    children:projects.filter(p=>p.folderId===f.id).map(node).sort(byNavOrder)}))
    .filter(f=>S.user?.admin||f.children.length);
  return [...folders,...projects.filter(p=>!ids.has(p.folderId)).map(node)].sort(byNavOrder);
}
const navSequence=()=>projectTree().flatMap(n=>n.kind==='folder'?n.children.map(c=>c.item):[n.item]);
const navScope=(tree,parent)=>parent?tree.find(n=>n.kind==='folder'&&n.id===parent)?.children||[]:tree;
/* The order number that puts a row in `parent` (a folder id, or null for the
   root) just before `before` (null: at the end). */
function navSlot(tree,dragId,parent,before){
  const scope=navScope(tree,parent).filter(n=>n.id!==dragId);
  const i=before&&scope.some(n=>n.id===before)?scope.findIndex(n=>n.id===before):scope.length;
  const prev=scope[i-1]?.order,next=scope[i]?.order;
  return prev==null&&next==null?0:prev==null?next-NAV_GAP:next==null?prev+NAV_GAP:(prev+next)/2;
}
/* What a drop at `t` changes: null when the row would land where it already is. */
function navPlan(tree,kind,id,t){
  const node=tree.flatMap(n=>[n,...(n.children||[])]).find(n=>n.id===id);if(!node)return null;
  const parent=t.into||t.parent||null,before=t.into?null:t.before||null;
  const from=kind==='project'&&tree.some(n=>n.kind==='folder'&&n.id===node.item.folderId)?node.item.folderId:null;
  if(parent===from){
    const ids=navScope(tree,parent).map(n=>n.id),rest=ids.filter(x=>x!==id),i=before?rest.indexOf(before):-1;
    rest.splice(i<0?rest.length:i,0,id);if(rest.join()===ids.join())return null;
  }
  return {kind,id,folderId:parent,order:navSlot(tree,id,parent,before)};
}
const canDragNav=(kind,item)=>kind==='folder'?Boolean(S.user?.admin):canManageProject(item);
const navClickBlocked=()=>Date.now()-(UI.navDropAt||0)<350;
function renderProjectNav(){
  const nav=$('#projectNav');if(!nav||UI.navDrag)return;
  const tree=projectTree(),closed=closedFolders(),fresh=freshRefs(),admin=Boolean(S.user?.admin);
  const inShelf=Boolean(UI.space&&(S.fileArchives||[]).some(p=>p.id===UI.space));
  const drag=(kind,item)=>canDragNav(kind,item)?' data-drag="1"':'';
  const project=(n,level,parent='')=>{
    const p=n.item,on=UI.space===p.id,open=UI.collapsedProjectNode!==p.id&&((UI.openProjectNodes||[]).includes(p.id)||on);
    return `<div class="nav-node"><div class="project-nav-project${on?' is-on':''}" data-node-level="${level}"><button type="button" class="project-node-caret" data-project-expand="${escapeHTML(p.id)}" aria-expanded="${open}" aria-label="${tr('{0}「{1}」的内容',open?tr('收起'):tr('展开'),escapeHTML(p.name))}">${icon('chevron-right')}</button>`
      +`<button class="project-nav-item nav-row${on?' is-on':''}" data-kind="project" data-id="${escapeHTML(p.id)}" `
      +`data-level="${level}" data-parent="${escapeHTML(parent)}" data-space="${escapeHTML(p.id)}"${drag('project',p)}`
      +` title="${escapeHTML(p.name)}" aria-label="${escapeHTML(p.name)}"${on?' aria-current="page"':''}>${icon('gantt')}`
      +`<span class="nav-text">${escapeHTML(p.name)}</span>${fresh.has(p.id)?tr('<em class="new-chip">新</em>'):''}</button></div>`
      +(open?projectNavContents(p):'')+'</div>';
  };
  const folder=n=>{
    const f=n.item,open=!closed.has(f.id),on=UI.folder===f.id&&!UI.space;
    return `<div class="nav-node"><div class="project-nav-folder-row nav-row${open?' is-open':''}${on?' is-on':''}" data-kind="folder" `
      +`data-id="${escapeHTML(f.id)}" data-level="0"${drag('folder',f)}><button class="project-nav-caret" data-folder="`
      +`${escapeHTML(f.id)}" aria-expanded="${open}" aria-label="${open?tr('收起'):tr('展开')}「${escapeHTML(f.name)}」">`
      +`${icon('chevron-right')}</button><button class="project-nav-toggle" data-open-folder="${escapeHTML(f.id)}"`
      +` title="${escapeHTML(f.name)}" aria-label="${escapeHTML(f.name)}"${on?' aria-current="page"':''}><span class="nav-folder-icon">${icon('folder','is-shut')}${icon('folder-open','is-open')}</span>`
      +`<span class="nav-text">${escapeHTML(f.name)}</span><b>${n.children.length}</b></button>`
      +`${admin?tr('<button class="project-nav-edit" data-edit-folder="{0}" title="重命名或删除" aria-label="',escapeHTML(f.id))
      +`${tr('编辑文件夹「{0}」">{1}',escapeHTML(f.name),icon('edit'))}</button>`:''}</div>`
      +`${open?`<div class="nav-branch">${n.children.map(c=>project(c,1,f.id)).join('')||tr('<p class="project-nav-empty">还没有项目</p>')}</div>`:''}</div>`;
  };
  nav.innerHTML=`<div class="project-nav-head"><span class="nav-text">${tr('项目目录')}</span>${admin?`<button class="project-nav-add" `
    +`${tr('id="addFolderBtn" title="新建文件夹" aria-label="新建文件夹">{0}',icon('plus'))}</button>`:''}${navigationControls('project')}</div>`
    +`<button class="project-nav-item project-nav-all${UI.space||UI.folder||UI.shelf?'':' is-on'}" data-space="" title="${tr('全部项目')}" aria-label="${tr('全部项目')}">${icon('layout-grid')}`
    +`<span class="nav-text">${tr('全部项目')}</span><b>${visibleProjects().length}</b></button>`
    +`<div class="project-nav-tree" id="projectNavTree">${tree.map(n=>n.kind==='folder'?folder(n):project(n,0)).join('')}</div>`
    /* Finished projects live in 成果库; it stays lit while one of them is open. */
    +(admin||(S.fileArchives||[]).length?`<div class="project-nav-shelf"><button class="project-nav-item project-nav-all${(UI.shelf==='achievements'&&!UI.space)||inShelf?' is-on':''}" data-shelf="achievements" title="${tr('成果库')}" aria-label="${tr('成果库')}">${icon('award')}`
    +`<span class="nav-text">${tr('成果库')}</span><b>${shelfProjects().length}</b></button></div>`:'')
    +navigationHandle('project');
  $$('#projectNav [data-space]').forEach(b=>b.onclick=()=>{if(!navClickBlocked())openProjectSpace(b.dataset.space)});
  $$('#projectNav [data-shelf]').forEach(b=>b.onclick=()=>{if(!navClickBlocked())openAchievements()});
  $$('#projectNav [data-project-expand]').forEach(b=>b.onclick=()=>{
    const ids=new Set(UI.openProjectNodes||[]),id=b.dataset.projectExpand;
    if(ids.has(id))ids.delete(id);else ids.add(id);
    if(UI.space===id&&b.getAttribute('aria-expanded')==='true'){UI.collapsedProjectNode=id}else UI.collapsedProjectNode=null;
    UI.openProjectNodes=[...ids];renderProjectNav();
  });
  $$('#projectNav [data-project-area]').forEach(b=>b.onclick=async()=>{
    const p=[...S.projects,...(S.fileArchives||[])].find(p=>p.id===b.dataset.project);if(!p)return;
    if(UI.space!==p.id)await openProjectSpace(p.id);if(UI.space!==p.id)return;await projectArea(p,b.dataset.projectArea);
    if(b.dataset.meeting&&UI.spaceArea==='meetings')openMeetingEditor(p,b.dataset.meeting);
    if(b.dataset.file&&UI.spaceArea==='files')openProjectFile(p,b.dataset.file);
  });
  $$('#projectNav [data-folder]').forEach(b=>b.onclick=()=>{if(!navClickBlocked())toggleFolder(b.dataset.folder)});
  $$('#projectNav [data-open-folder]').forEach(b=>b.onclick=()=>{if(!navClickBlocked())openFolderView(b.dataset.openFolder)});
  $$('#projectNav [data-edit-folder]').forEach(b=>b.onclick=()=>editFolder(b.dataset.editFolder));
  const add=$('#addFolderBtn');if(add)add.onclick=()=>editFolder();
  $$('#projectNavTree .nav-row[data-drag]').forEach(row=>row.addEventListener('pointerdown',e=>{
    if(e.button===0&&e.pointerType!=='touch'&&!e.target.closest('.project-nav-edit'))startNavDrag(row,e);
  }));
  applyNavigationLayout();
}
/* A project's meetings and files hang off it like branches of a fork. */
function projectNavContents(p){
  const files=(S.files||[]).filter(f=>f.projectId===p.id),meetings=(S.meetings||[]).filter(m=>m.projectId===p.id);
  const group=(area,label,items)=>`<div class="nav-node"><button type="button" class="project-nav-resource is-group" data-project="${escapeHTML(p.id)}" data-project-area="${area}">`
    +`${icon(area==='meetings'?'chat':'folder')}<span>${label}</span><b>${items.length}</b></button>`
    +`${items.length?`<div class="nav-branch">${items.join('')}</div>`:''}</div>`;
  const meeting=m=>`<div class="nav-node"><button type="button" class="project-nav-resource" data-project="${escapeHTML(p.id)}" data-project-area="meetings" data-meeting="${escapeHTML(m.id)}" title="${escapeHTML(m.title)}">${icon('chat')}<span>${escapeHTML(m.title)}</span></button></div>`;
  const file=f=>`<div class="nav-node"><button type="button" class="project-nav-resource" data-project="${escapeHTML(p.id)}" data-project-area="files" data-file="${escapeHTML(f.id)}" title="${escapeHTML(f.name)}">${icon('file')}<span>${escapeHTML(f.name)}</span></button></div>`;
  return `<div class="nav-branch project-nav-resources">${group('meetings',tr('会议'),meetings.map(meeting))}${group('files',tr('文件'),files.map(file))}</div>`;
}
/* The selection is one marker that travels to the chosen row: its leading edge
   moves first and the trailing edge follows, so the move reads as a hand-off.
   When the rail is resized or collapsed it simply sits on the same row again. */
function placeNavIndicator(){
  const nav=$('#projectNav');if(!nav||typeof nav.querySelector!=='function')return;
  const on=nav.querySelector('.project-nav-all.is-on')||nav.querySelector('.project-nav-folder-row.is-on')||nav.querySelector('.project-nav-project.is-on');
  let mark=nav.querySelector('.nav-indicator');
  if(!mark){mark=document.createElement('i');mark.className='nav-indicator';mark.setAttribute('aria-hidden','true');nav.prepend(mark)}
  if(!on||typeof on.getBoundingClientRect!=='function'||!on.offsetHeight){mark.style.opacity='0';UI.navMark=null;return}
  watchNavWidth(nav);
  const key=on.dataset?.shelf??on.dataset?.id??on.querySelector?.('[data-id]')?.dataset?.id??'all';
  const nb=nav.getBoundingClientRect(),b=on.getBoundingClientRect();
  const next={key,y1:b.top-nb.top+nav.scrollTop,y2:b.bottom-nb.top+nav.scrollTop,x:b.left-nb.left,w:b.width},prev=UI.navMark;
  const set=g=>{mark.style.setProperty('--nav-y1',`${g.y1}px`);mark.style.setProperty('--nav-y2',`${g.y2}px`);mark.style.left=`${g.x}px`;mark.style.width=`${g.w}px`};
  UI.navMark=next;mark.style.opacity='1';
  /* A new selection, or the same row pushed up or down, glides; a change of
     width (the rail resized or collapsed) just snaps. */
  const sameWidth=prev&&Math.abs(prev.x-next.x)<.5&&Math.abs(prev.w-next.w)<.5;
  const glide=prev&&(prev.key!==key||(sameWidth&&(prev.y1!==next.y1||prev.y2!==next.y2)));
  if(!glide||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){mark.classList.remove('is-down','is-up');set(next);return}
  set(prev);mark.classList.remove('is-down','is-up');void mark.offsetWidth;mark.classList.add(next.y1>=prev.y1?'is-down':'is-up');set(next);
}
/* The rail's width animates when it is collapsed or dragged; follow it. Only a
   width change counts, so a project opening below does not cut a move short. */
function watchNavWidth(nav){
  const view=$('#projectsView');
  if(view?.dataset&&!view.dataset.navSettle&&typeof view.addEventListener==='function'){
    view.dataset.navSettle='1';
    view.addEventListener('transitionend',e=>{if(e.target===view&&e.propertyName==='grid-template-columns'&&UI.navMark)placeNavIndicator()});
  }
  if(UI.navWidthWatch||typeof ResizeObserver!=='function')return;
  let last=nav.getBoundingClientRect().width;
  UI.navWidthWatch=new ResizeObserver(entries=>{
    const width=entries[0]?.contentRect?.width;if(width==null||Math.abs(width-last)<.5)return;
    last=width;if(UI.navMark)placeNavIndicator();
  });
  UI.navWidthWatch.observe(nav);
}
/* Where a drop at (x, y) would go. Over the middle of a folder a project goes
   into it; between rows it takes that gap, and where a gap could be either
   inside a folder or at the root, the pointer's x decides: right is inside. */
function navTarget(treeEl,kind,x,y){
  const rows=[...treeEl.querySelectorAll('.nav-row:not(.is-lifted)')],box=treeEl.getBoundingClientRect();
  if(kind==='project'){
    const into=rows.find(r=>{if(r.dataset.kind!=='folder')return false;const b=r.getBoundingClientRect();
      return y>b.top+b.height*.26&&y<b.bottom-b.height*.26});
    if(into)return {into:into.dataset.id,row:into};
  }
  const level=r=>r?Number(r.dataset.level):0;
  let g=rows.findIndex(r=>{const b=r.getBoundingClientRect();return y<b.top+b.height/2});if(g<0)g=rows.length;
  if(kind==='folder')while(g<rows.length&&level(rows[g])===1)g++;
  const above=rows[g-1],below=rows[g];
  const canIn=kind==='project'&&above&&(above.dataset.kind==='folder'||level(above)===1),canRoot=!below||level(below)===0;
  const nested=canIn&&(!canRoot||x>box.left+46);
  const parent=nested?(above.dataset.kind==='folder'?above.dataset.id:above.dataset.parent):null;
  const before=nested?(below&&level(below)===1&&below.dataset.parent===parent?below.dataset.id:null):below?.dataset.id||null;
  const edge=above?above.getBoundingClientRect().bottom+1:below?below.getBoundingClientRect().top-1:box.top;
  return {parent,before,level:nested?1:0,y:edge,top:edge-box.top};
}
const NAV_TENSION=22;
const navReducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const navAnimate=(element,frames,options)=>element.animate(frames,{...options,duration:navReducedMotion()?0:options.duration}).finished.catch(()=>{});
function startNavDrag(row,down){
  if(UI.navDrag||UI.navSaving)return;
  const nav=$('#projectNav'),treeEl=$('#projectNavTree'),kind=row.dataset.kind,id=row.dataset.id;
  const x0=down.clientX,y0=down.clientY,rect=row.getBoundingClientRect(),tree=projectTree();
  const branch=row.closest?.('.nav-node');
  const group=kind==='folder'?[row,...treeEl.querySelectorAll(`.nav-row[data-parent="${CSS.escape(id)}"]`)]:[row];
  let ghost=null,line=null,target=null,raf=0,gx=rect.left,gy=rect.top,px=x0,py=y0,tilt=0;
  const off=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);
    window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',key);window.removeEventListener('blur',blur);
    try{row.releasePointerCapture(down.pointerId)}catch(_){}
  };
  const updateTarget=()=>{
    const nb=nav.getBoundingClientRect(),tb=treeEl.getBoundingClientRect();
    target=px>=nb.left&&px<=nb.right&&py>=Math.max(nb.top,tb.top)&&py<=nb.bottom?navTarget(treeEl,kind,px,py):null;
    treeEl.querySelectorAll('.is-drop').forEach(r=>r!==target?.row&&r.classList.remove('is-drop'));
    if(!target){line.classList.remove('is-on');return}
    if(target.into){target.row.classList.add('is-drop');line.classList.remove('is-on');return}
    line.classList.add('is-on');line.classList.toggle('is-nested',target.level===1);
    line.style.transform=`translateY(${target.top}px)`;
  };
  const lift=()=>{
    UI.navDrag=true;row.classList.remove('is-tense');row.style.transform='';
    ghost=row.cloneNode(true);ghost.classList.add('nav-ghost');ghost.classList.remove('is-on','is-drop');ghost.removeAttribute('data-level');
    ghost.insertAdjacentHTML('beforeend',`<span class="nav-ghost-file">${icon('file')}</span>`);
    Object.assign(ghost.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
    document.body.appendChild(ghost);navCrumbs(rect);
    try{row.setPointerCapture(down.pointerId)}catch(_){}
    branch?.classList.add('is-drag-source');
    group.forEach(el=>{el.style.height=`${el.offsetHeight}px`;el.offsetHeight;el.classList.add('is-lifted')});
    line=document.createElement('i');line.className='nav-drop-line';treeEl.appendChild(line);
    document.body.classList.add('nav-dragging');
    /* The row follows with a little weight and leans into the motion; near a
       slot it is drawn toward it, so the last few pixels snap. */
    const step=()=>{
      let tx=px-(x0-rect.left),ty=py-(y0-rect.top);
      if(target&&!target.into){const d=target.y-rect.height/2-ty,pull=Math.max(0,1-Math.abs(d)/36);ty+=d*pull*.55}
      const rate=navReducedMotion()?1:.32,vx=(tx-gx)*rate;gx+=vx;gy+=(ty-gy)*rate;
      tilt=navReducedMotion()?0:tilt+(Math.max(-4,Math.min(4,vx*.4))-tilt)*.2;
      ghost.style.transform=`translate(${gx-rect.left}px,${gy-rect.top}px) rotate(${tilt}deg)`;
      const nb=nav.getBoundingClientRect();
      if(py<nb.top+28)nav.scrollTop-=6;else if(py>nb.bottom-28)nav.scrollTop+=6;
      updateTarget();
      raf=requestAnimationFrame(step);
    };
    raf=requestAnimationFrame(step);
  };
  const move=e=>{
    if(e.pointerId!==down.pointerId)return;
    px=e.clientX;py=e.clientY;const dx=px-x0,dy=py-y0,dist=Math.hypot(dx,dy);
    if(!ghost){
      if(dist<NAV_TENSION){
        /* Still rooted: it gives a little, less the harder it is pulled. */
        const k=.24*(1-dist/NAV_TENSION*.45);row.classList.add('is-tense');
        row.style.transform=`translate(${dx*k}px,${dy*k}px) scale(${1+dist/NAV_TENSION*.025})`;return;
      }
      lift();
    }
    e.preventDefault();
    updateTarget();
  };
  const finish=()=>{cancelAnimationFrame(raf);line?.remove();document.body.classList.remove('nav-dragging');UI.navDropAt=Date.now()};
  const settleBack=async()=>{
    finish();
    await navAnimate(ghost,[{transform:ghost.style.transform},{transform:'translate(0,0) rotate(0)',scale:1}],
      {duration:300,easing:'cubic-bezier(.3,1.4,.5,1)',fill:'forwards'});
    ghost.remove();branch?.classList.remove('is-drag-source');group.forEach(el=>{el.classList.remove('is-lifted');el.style.height=''});UI.navDrag=false;
    renderProjectNav();
  };
  const up=async e=>{
    if(e.pointerId!==down.pointerId)return;
    off();
    if(!ghost){row.classList.remove('is-tense');row.style.transform='';return}
    px=e.clientX;py=e.clientY;updateTarget();
    const t=target,plan=t&&navPlan(tree,kind,id,t);
    if(!plan){settleBack();return}
    finish();
    const into=t.into&&t.row;
    if(into){
      /* It folds into a small file and drops into the open folder, which shuts on it. */
      const glyph=into.querySelector('.nav-folder-icon').getBoundingClientRect();
      const sx=gx-rect.left+(x0-rect.left)-15,sy=gy-rect.top;
      ghost.classList.add('is-filing');
      await navAnimate(ghost,[{width:`${rect.width}px`,transform:ghost.style.transform},
        {width:'30px',transform:`translate(${sx}px,${sy}px)`,borderRadius:'7px'}],
        {duration:150,easing:'ease-out',fill:'forwards'});
      const now=ghost.getBoundingClientRect();
      await navAnimate(ghost,[{opacity:1},{transform:`translate(${sx+glyph.left+glyph.width/2-now.left-now.width/2}px,`
        +`${sy+glyph.top+glyph.height/2-now.top-now.height/2}px) scale(.3)`,opacity:.15}],
        {duration:300,easing:'cubic-bezier(.55,0,.75,.35)',fill:'forwards'});
    }else{
      const box=treeEl.getBoundingClientRect(),left=box.left+(t.level?22:0);
      await navAnimate(ghost,[{transform:ghost.style.transform},{transform:`translate(${left-rect.left}px,${t.y-rect.top}px) rotate(0)`,
        width:`${box.width-(t.level?22:0)}px`,scale:1}],{duration:240,easing:'cubic-bezier(.3,1.5,.5,1)',fill:'forwards'});
    }
    commitNavMove(plan,ghost,into);
  };
  const cancel=e=>{if(e&&e.pointerId!==down.pointerId)return;off();if(ghost)settleBack();else{row.classList.remove('is-tense');row.style.transform=''}};
  const blur=()=>cancel();
  const key=e=>{if(e.key==='Escape')cancel()};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',key);window.addEventListener('blur',blur);
}
/* A little soil kicked up where the row broke loose. */
function navCrumbs(rect){
  if(navReducedMotion())return;
  for(let i=0;i<7;i++){
    const c=document.createElement('i'),a=Math.PI*(1.05+i/6*.9),r=14+Math.random()*16;
    c.className='nav-crumb';
    Object.assign(c.style,{left:`${rect.left+rect.width*(.15+i*.115)}px`,top:`${rect.top+rect.height*.55}px`});
    c.style.setProperty('--dx',`${Math.cos(a)*r*.6}px`);c.style.setProperty('--dy',`${Math.sin(a)*r}px`);
    c.style.setProperty('--r',`${Math.random()*160-80}deg`);
    document.body.appendChild(c);setTimeout(()=>c.remove(),600);
  }
}
/* Applied here first so the tree redraws at once, then saved. */
async function commitNavMove(plan,ghost,into){
  UI.navSaving=true;
  const item=plan.kind==='folder'?S.folders.find(f=>f.id===plan.id):S.projects.find(p=>p.id===plan.id);
  const old={navOrder:item.navOrder,folderId:item.folderId};
  item.navOrder=plan.order;if(plan.kind==='project')item.folderId=plan.folderId;
  UI.navDrag=false;ghost.remove();renderProjectNav();
  const tree=$('#projectNavTree');
  const landed=into?tree?.querySelector(`.nav-row[data-kind="folder"][data-id="${CSS.escape(plan.folderId)}"]`)
    :tree?.querySelector(`.nav-row[data-kind="${plan.kind}"][data-id="${CSS.escape(plan.id)}"]`);
  landed?.classList.add(into?'is-swallow':'is-landed');
  try{
    await api('/api/action',{action:'nav.move',data:{kind:plan.kind,id:plan.id,order:plan.order,
      ...(plan.kind==='project'?{folderId:plan.folderId}:{})}});
    await refresh();
  }catch(e){Object.assign(item,old);toast(e.message);await refresh()}
  finally{UI.navSaving=false}
}
function openFolderView(id){
  if(meetingLive.session||meetingLive.active)return meetingStopLive().then(()=>openFolderView(id)).catch(e=>toast(e.message));
  if($('#meetingEditor')?.dataset?.dirty==='true'&&!confirm(tr('会议修改尚未保存，确定离开？')))return;
  cancelMeetingOpen();
  UI.folder=id;UI.space='';UI.shelf='';setFolderClosed(id,false);
  if(UI.view!=='projects')switchView('projects');else renderProjects();
  $('.main-content')?.scrollTo?.({top:0,behavior:'smooth'});
}
function openProjectSpace(id){
  if(meetingLive.session||meetingLive.active)return meetingStopLive().then(()=>openProjectSpace(id)).catch(e=>toast(e.message));
  if(UI.space!==id&&$('#meetingEditor')?.dataset?.dirty==='true'&&!confirm(tr('会议修改尚未保存，确定离开？')))return;
  if(UI.space!==id){cancelMeetingOpen();UI.collapsedProjectNode=null}
  UI.space=id||'';UI.shelf='';if(!id)UI.folder='';if(id)clearFresh([id]);
  if(UI.view!=='projects')switchView('projects');else renderProjects();
  $('.main-content')?.scrollTo?.({top:0,behavior:'smooth'});
}
/* One tab bar per project. 会议 and 文件 are also reached from the directory;
   the meeting editor reads UI.spaceArea, so the two are kept together. */
const AREA_TAB={overview:'tasks',meetings:'meetings',files:'files'};
function setSpaceTab(tab){if(UI.spaceTab!==tab)cancelMeetingOpen();UI.spaceTab=tab;UI.spaceArea=tab==='meetings'||tab==='files'?tab:'overview'}
function spaceTabNow(){
  if(UI.spaceArea==='meetings'||UI.spaceArea==='files')return UI.spaceArea;
  return SPACE_TABS[UI.spaceTab]&&!['meetings','files'].includes(UI.spaceTab)?UI.spaceTab:'tasks';
}
function projectArea(p,area){
  const tab=AREA_TAB[area]||area;if(!SPACE_TABS[tab])return;
  if(UI.space===p.id&&spaceTabNow()===tab)return;
  if(meetingLive.session||meetingLive.active)return meetingStopLive().then(()=>projectArea(p,area)).catch(e=>toast(e.message));
  if($('#meetingEditor')?.dataset?.dirty==='true'&&!confirm(tr('会议修改尚未保存，确定离开？')))return;
  setSpaceTab(tab);openProjectSpace(p.id);renderProjectNav();
}
function projectSpaceTabs(p,keys=Object.keys(SPACE_TABS),counts={},tab=spaceTabNow()){
  return `<div class="space-tabs" role="tablist" aria-label="${tr('项目内容')}">${keys.map(key=>
    `<button type="button" role="tab" class="space-tab" id="spaceTab-${key}" data-space-tab="${key}" aria-controls="spacePanel-${key}"`
    +` aria-selected="${key===tab}" tabindex="${key===tab?0:-1}">${SPACE_TABS[key]}${counts[key]==null?'':` <span>${counts[key]}</span>`}</button>`).join('')}</div>`;
}
function projectMeetingList(p){
  const meetings=(S.meetings||[]).filter(m=>m.projectId===p.id).sort((a,b)=>String(b.scheduledAt||b.createdAt).localeCompare(String(a.scheduledAt||a.createdAt)));
  return meetings.map(m=>`<div class="meeting-list-row"><button type="button" class="meeting-row" data-meeting="${escapeHTML(m.id)}"><span class="meeting-icon">${icon('chat')}</span><span class="meeting-copy"><strong>${escapeHTML(m.title)}</strong><small>${escapeHTML(whenText(m.scheduledAt))} · ${m.minutes||m.hasMinutes?tr('已整理'):tr('待整理')}</small></span>${icon('chevron-right')}</button>${canDeleteMeeting(p,m)?`<button type="button" class="text-btn content-row-delete" data-delete-meeting="${escapeHTML(m.id)}" aria-label="${tr('删除会议 {0}',escapeHTML(m.title))}">${tr('删除')}</button>`:''}</div>`).join('')||tr('<p class="muted space-empty">还没有会议</p>');
}
function projectContentWritable(p){
  return Boolean(p&&!['done','archived'].includes(p.status)
    &&!(S.fileArchives||[]).some(x=>x.id===p.id));
}
function canDeleteMeeting(p,m){
  return projectContentWritable(p)&&Boolean(S.user&&(S.user.admin||p.owner===S.user.id||m.createdBy===S.user.id));
}
function canDeleteFile(p,f){
  return projectContentWritable(p)&&Boolean(S.user&&(S.user.admin||p.owner===S.user.id||f.uploader===S.user.id));
}
const contentDeletes=new Set();
async function deleteProjectMeeting(p,id,button){
  const m=(S.meetings||[]).find(x=>x.id===id&&x.projectId===p.id),key=`meeting:${id}`,owner=S.user?.id;
  if(!m||!canDeleteMeeting(p,m)||contentDeletes.has(key))return false;
  if(!confirm(tr('删除会议「{0}」？原始转录和纪要也会删除，无法恢复。',m.title)))return false;
  contentDeletes.add(key);if(button)button.disabled=true;
  try{
    if(meetingLive.meetingId===id)await meetingStopLive();
    if(owner!==S.user?.id)return false;
    await api('/api/action',{action:'meeting.delete',data:{id,expectedRevision:meetingLive.revisions.get(`${owner}:${id}`)??m.revision??0}});
    if(owner!==S.user?.id)return true;
    S.meetings=(S.meetings||[]).filter(x=>x.id!==id);meetingLive.revisions.delete(`${owner}:${id}`);
    const pane=$('#meetingEditor'),modal=$('#modalContent');
    if(pane?.dataset.meetingId===id){pane.innerHTML=tr('<p class="muted space-empty">选择一场会议</p>');pane.dataset.dirty='false';pane.dataset.metadataDirty='false';delete pane.dataset.meetingId}
    if(modal?.dataset.meetingId===id){UI.docDirty=false;closeModal()}
    if(UI.view==='projects')renderProjects();renderProjectNav();toast(tr('会议已删除'));refresh().catch(()=>{});return true;
  }catch(e){if(owner===S.user?.id){toast(e.message);refresh().catch(()=>{})}return false}
  finally{contentDeletes.delete(key);if(button)button.disabled=false}
}
async function deleteProjectFile(p,id,button){
  const f=(S.files||[]).find(x=>x.id===id&&x.projectId===p.id),key=`file:${id}`,owner=S.user?.id;
  if(!f||!canDeleteFile(p,f)||contentDeletes.has(key))return false;
  if(!confirm(tr('删除文件「{0}」？删除后无法恢复。',f.name)))return false;
  contentDeletes.add(key);if(button)button.disabled=true;
  try{
    await api('/api/action',{action:'file.delete',data:{id}});
    if(owner!==S.user?.id)return true;
    S.files=(S.files||[]).filter(x=>x.id!==id);
    if($('#mdFileEditor')?.dataset.fileId===id||$('#projectFileDetails')?.dataset.fileId===id){UI.docDirty=false;closeModal()}
    if(UI.view==='projects')renderProjects();renderProjectNav();toast(tr('文件已删除'));refresh().catch(()=>{});return true;
  }catch(e){if(owner===S.user?.id){toast(e.message);refresh().catch(()=>{})}return false}
  finally{contentDeletes.delete(key);if(button)button.disabled=false}
}
function projectMeetings(p,readonly=false){
  return `<section class="space-section space-meetings"><div class="space-head is-toolbar">${!readonly&&canManageProject(p)?tr('<button type="button" class="secondary-btn" id="newProjectMeeting">新增会议</button>'):''}</div>`
    +`<div class="meeting-workspace"><div id="projectMeetingList" class="meeting-list">${projectMeetingList(p)}</div><div id="meetingEditor" class="meeting-detail"><p class="muted space-empty">${tr('选择一场会议')}</p></div></div></section>`;
}
function bindMeetingList(p){
  $$('#projectMeetingList [data-meeting]').forEach(b=>b.onclick=()=>openMeetingEditor(p,b.dataset.meeting));
  const add=$('#newProjectMeeting');if(add)add.onclick=()=>openMeetingEditor(p);
  $$('#projectMeetingList [data-delete-meeting]').forEach(b=>b.onclick=()=>deleteProjectMeeting(p,b.dataset.deleteMeeting,b));
}
function editFolder(id){
  const f=(S.folders||[]).find(x=>x.id===id),count=f?S.projects.filter(p=>p.folderId===f.id).length:0;
  openModal(`<div class="eyebrow">${tr('项目目录')}</div><h2>${f?tr('编辑文件夹'):tr('新建文件夹')}</h2><label class="form-field">${tr('文件夹名称')}`
    +`<input id="folderName" maxlength="40" value="${escapeHTML(f?.name||'')}" placeholder="${tr('例如：年度战略')}"></label>`
    +`${f?`<p class="muted">${tr('删除文件夹不会删除项目，里面的 {0} 个项目会回到目录根层。',count)}</p>`:''}`
    +`<div class="modal-footer">${f?tr('<button class="ghost-btn is-danger" id="deleteFolder">删除文件夹</button>'):''}`
    +`<button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="saveFolder">`
    +`${f?tr('保存'):tr('创建')}</button></div>`);
  $('#cancelAction').onclick=closeModal;$('#folderName').focus();
  $('#saveFolder').onclick=async()=>{
    const name=$('#folderName').value.trim();if(!name){toast(tr('请填写文件夹名称'));return}
    try{await act(f?'folder.update':'folder.create',f?{id:f.id,name}:{name});closeModal()}catch(e){}
  };
  const drop=$('#deleteFolder');
  if(drop)drop.onclick=async()=>{try{await act('folder.delete',{id:f.id});closeModal()}catch(e){}};
}
const MEETING_PROMPT_DEFAULT='你是会议纪要整理助手。请只根据原始转录整理，不要补造事实。输出简洁的 Markdown，包含：会议结论、待办事项（负责人/截止时间/事项）、风险与待确认问题。若原稿没有对应信息，写“未提及”。';
function meetingMount(html,id=''){
  const pane=UI.spaceArea==='meetings'&&UI.space?$('#meetingEditor'):null;
  if(pane){pane.innerHTML=html;pane.dataset.dirty='false'}else openModal(html);
  const root=pane||$('#modalContent');if(root?.dataset)root.dataset.meetingId=id;return root;
}
/* The state carries meetings without their transcript and minutes; opening one
   fetches the full record once and keeps it on the list entry. */
const meetingChars=m=>m.rawTranscript!=null?m.rawTranscript.length:(m.transcriptChars||0);
function meetingLoaded(m){return !m||'rawTranscript' in m}
let meetingOpenGeneration=0;
function cancelMeetingOpen(){meetingOpenGeneration++}
const meetingOpenScope=()=>JSON.stringify([S.user?.id,UI.view,UI.space,UI.folder,UI.spaceArea,UI.spaceTab]);
function loadMeeting(m,reopen){
  const generation=meetingOpenGeneration,scope=meetingOpenScope();
  const current=()=>generation===meetingOpenGeneration&&scope===meetingOpenScope();
  toast(tr('正在加载会议…'));
  return api('/api/action',{action:'meeting.get',data:{id:m.id}}).then(full=>{
    if(!current())return;
    // A refresh may have replaced the list object while this request ran.
    const listed=(S.meetings||[]).find(x=>x.id===m.id&&x.projectId===m.projectId);
    if(!listed)return;
    if((listed.revision||0)>(full.revision||0)){toast(tr('会议已更新，请重新打开'));return}
    Object.assign(listed,full);return reopen();
  }).catch(e=>{if(current())toast(e.message)});
}
function openArchivedMeeting(p,id){
  cancelMeetingOpen();
  const m=(S.meetings||[]).find(x=>x.id===id&&x.projectId===p.id);if(!m)return;
  if(!meetingLoaded(m))return loadMeeting(m,()=>openArchivedMeeting(p,id));
  const root=meetingMount(`<div class="eyebrow">${tr('{0} · 归档会议',escapeHTML(p.name))}</div><h2>${escapeHTML(m.title)}</h2><p class="muted">${escapeHTML(m.scheduledAt||tr('未安排'))} · ${escapeHTML((m.participants||[]).join('、'))}</p><p>${escapeHTML(m.agenda||'')}</p><label class="form-field">${tr('原始转录')}<textarea readonly rows="10">${escapeHTML(m.rawTranscript||'')}</textarea></label><section class="meeting-minutes-preview"><h3>${tr('会议纪要')}</h3><div class="meeting-minutes-body md-body">${m.minutes?mdRender(m.minutes):tr('<p class="md-empty">尚未生成</p>')}</div></section><div class="modal-footer"><button type="button" class="secondary-btn" id="cancelAction">${tr('关闭')}</button></div>`);
  const close=root?.querySelector?root.querySelector('#cancelAction'):$('#cancelAction');
  close.onclick=()=>{const pane=root&&root===$('#meetingEditor')?root:null;if(pane)pane.innerHTML=tr('<p class="muted space-empty">选择一场会议</p>');else closeModal()};
}
function openMeetingEditor(p,meetingId=null){
  cancelMeetingOpen();
  const generation=meetingOpenGeneration;
  if(meetingLive.session||meetingLive.active)return meetingStopLive().then(()=>{if(generation===meetingOpenGeneration)return openMeetingEditor(p,meetingId)}).catch(e=>toast(e.message));
  const listed=meetingId?(S.meetings||[]).find(m=>m.id===meetingId&&m.projectId===p.id):null;
  if(!meetingLoaded(listed))return loadMeeting(listed,()=>openMeetingEditor(p,meetingId));
  const oldPane=$('#meetingEditor');
  if((oldPane?.dataset?.dirty==='true'||UI.docDirty)&&!confirm(tr('会议修改尚未保存，确定切换？')))return;
  if((S.fileArchives||[]).some(x=>x.id===p.id)){openArchivedMeeting(p,meetingId);return}
  const owner=S.user?.id,current=meetingId?(S.meetings||[]).find(m=>m.id===meetingId&&m.projectId===p.id):null,manage=canManageProject(p);if(meetingId&&!current){toast(tr('会议已删除或无权访问'));return}if(!current&&!manage){toast(tr('只有项目 Owner 或管理员可以新增会议'));return}
  if(current)meetingLive.revisions.set(`${S.user?.id}:${current.id}`,current.revision||0);
  const m=current||{title:'',scheduledAt:'',participants:[],agenda:'',rawTranscript:'',minutes:'',status:'scheduled'};
  const editorRoot=meetingMount(`<div class="eyebrow">${tr('{0} · 项目会议',escapeHTML(p.name))}</div><h2>${current?escapeHTML(m.title):tr('新增会议')}</h2><div class="meeting-editor-grid"><label class="form-field">${tr('会议名称')}<input id="meetingTitle" maxlength="120" value="${escapeHTML(m.title)}"></label><label class="form-field">${tr('安排时间')}<input id="meetingScheduledAt" type="datetime-local" value="${escapeHTML(m.scheduledAt||'')}"></label></div><label class="form-field">${tr('参会人（用逗号分隔）')}<input id="meetingParticipants" value="${escapeHTML((m.participants||[]).join('、'))}"></label><label class="form-field">${tr('会议议程')}<textarea id="meetingAgenda" rows="3">${escapeHTML(m.agenda||'')}</textarea></label><label class="form-field">${tr('原始转录')}<textarea id="meetingTranscript" rows="10" maxlength="200000" placeholder="${tr('可粘贴实时转录原稿，或使用下方实时录入')}">${escapeHTML(m.rawTranscript||'')}</textarea></label><div class="meeting-live-bar"><button type="button" class="secondary-btn" id="meetingLiveBtn">${tr('开始实时录入')}</button><span id="meetingLiveState" class="muted"></span></div><section class="meeting-minutes-preview"><div class="space-head"><h3>${tr('整理后的会议纪要')}</h3><button type="button" class="secondary-btn" id="generateMeetingMinutes" ${current&&m.rawTranscript?'':'disabled'}>${tr('根据模板生成')}</button></div>${mdEditorHTML({id:'meetingMinutesEditor',inputId:'meetingMinutesInput',viewId:'meetingMinutes',value:m.minutes||'',rows:12,mode:'preview',empty:tr('尚未生成，可以点「根据模板生成」，也可以直接编辑'),placeholder:tr('会议结论、待办、风险……（支持 Markdown）')})}</section><div class="modal-footer">${manage||current&&canDeleteMeeting(p,current)?`<button type="button" class="secondary-btn content-delete${current?'':' hidden'}" id="deleteMeeting">${tr('删除会议')}</button>`:''}<button type="button" class="secondary-btn" id="cancelAction">${tr('关闭')}</button><button type="button" class="primary-btn" id="saveMeeting">${current?tr('保存会议'):tr('创建会议')}</button></div>`,m.id||'');
  const field=selector=>editorRoot?.querySelector?editorRoot.querySelector(selector):$(selector);
  const inlinePane=editorRoot&&editorRoot===$('#meetingEditor')?editorRoot:null;
  const text=field('#meetingTranscript'),save=field('#saveMeeting'),generate=field('#generateMeetingMinutes'),live=field('#meetingLiveBtn'),drop=field('#deleteMeeting');
  const values=()=>({title:field('#meetingTitle').value.trim(),scheduledAt:field('#meetingScheduledAt').value,participants:field('#meetingParticipants').value.split(/[、,，]/).map(x=>x.trim()).filter(Boolean),agenda:field('#meetingAgenda').value});
  let busy=false;
  const sync=()=>{save.disabled=busy;live.disabled=busy;generate.disabled=busy||!text.value.trim();if(drop){drop.disabled=busy;drop.classList?.toggle('hidden',!m.id||!canDeleteMeeting(p,m))}};
  const persist=async()=>{
    const data=values();if(!data.title)throw new Error(tr('请填写会议名称'));
    await meetingStopLive();
    const transcript=text.value,minutes=field('#meetingMinutesInput')?.value||'';
    const result=await api('/api/action',{action:m.id?'meeting.transcript.update':'meeting.create',data:{...(m.id?{id:m.id}:{projectId:p.id}),...data,rawTranscript:transcript,minutes,...(m.id?{expectedRevision:meetingLive.revisions.get(`${S.user?.id}:${m.id}`)??m.revision??0}:{})}});
    if(S.user?.id!==owner)throw new Error(tr('账户已切换'));
    Object.assign(m,result);save.textContent=tr('保存会议');meetingLive.revisions.set(`${S.user?.id}:${m.id}`,result.revision||0);const pane=inlinePane;const root=editorRoot;if(root?.dataset)root.dataset.meetingId=m.id;const metadataChanged=JSON.stringify(values())!==JSON.stringify(data)||(field('#meetingMinutesInput')?.value||'')!==minutes;if(pane){pane.dataset.dirty=String(metadataChanged||text.value!==transcript);pane.dataset.metadataDirty=String(metadataChanged)}else UI.docDirty=metadataChanged||text.value!==transcript;S.meetings=[...(S.meetings||[]).filter(x=>x.id!==m.id),m];return m;
  };
  const run=async(work)=>{if(busy)return;busy=true;sync();try{await work()}catch(e){toast(e.message)}finally{busy=false;sync()}};
  if(drop)drop.onclick=()=>run(()=>deleteProjectMeeting(p,m.id,drop));
  const closeEditor=()=>{const pane=inlinePane;if(pane){pane.innerHTML=tr('<p class="muted space-empty">选择一场会议</p>');pane.dataset.dirty='false'}else closeModal()};
  const markDirty=e=>{const pane=inlinePane;if(pane){pane.dataset.dirty='true';if(e.target.id!=='meetingTranscript')pane.dataset.metadataDirty='true'}else UI.docDirty=true;sync()};
  ['#meetingTitle','#meetingScheduledAt','#meetingParticipants','#meetingAgenda','#meetingTranscript','#meetingMinutesInput'].forEach(id=>field(id)?.addEventListener('input',markDirty));
  bindMdEditor(field('#meetingMinutesEditor'));
  field('#cancelAction').onclick=()=>run(async()=>{await persist();if(inlinePane?.dataset?.dirty==='true'){toast(tr('已保存提交版本，仍有未保存修改'));return}closeEditor();renderProjectSpace(p.id)});text.addEventListener('input',sync);sync();
  save.onclick=()=>run(async()=>{await persist();if(!text.isConnected)return;const pane=inlinePane;if(!pane)closeModal();renderProjectSpace(p.id);renderProjectNav();toast(tr('会议已保存'))});
  generate.onclick=()=>run(async()=>{
    generate.textContent=tr('整理中…');
    try{await persist();const updated=await api('/api/action',{action:'meeting.minutes.generate',data:{id:m.id}});if(S.user?.id!==owner)return;Object.assign(m,updated);if(text.isConnected){const editor=field('#meetingMinutesEditor');if(editor?.querySelector)mdSet(editor,updated.minutes||'');else{const view=field('#meetingMinutes');if(view)view.innerHTML=mdRender(updated.minutes||tr('未生成'))}}toast(tr('会议纪要已生成'))}
    finally{generate.textContent=tr('根据模板生成')}
  });
  live.onclick=()=>run(async()=>{
    if(meetingLive.active){await meetingStopLive();return}
    if(meetingLive.session?.error){await meetingToggleLive(m.id,text);return}
    await persist();if(text.isConnected)await meetingToggleLive(m.id,text);
  });
}
const meetingLive={revisions:new Map(),session:null,recognition:null,meetingId:null,input:null,active:false,generation:0,saveTimer:null,pending:Promise.resolve()};
function meetingSaveTranscript(id,input,recording){
  const owner=S.user?.id,data={id,rawTranscript:input.value,recording};
  const request=meetingLive.pending.then(async()=>{
    if(owner!==S.user?.id)throw new Error(tr('账户已切换'));
    const current=(S.meetings||[]).find(m=>m.id===id),key=`${owner}:${id}`;
    if(current)data.expectedRevision=meetingLive.revisions.get(key)??current.revision??0;
    const result=await api('/api/action',{action:'meeting.transcript.update',data});
    if(owner===S.user?.id){meetingLive.revisions.set(key,result.revision||0);if(current)Object.assign(current,result);
      const pane=$('#meetingEditor');if(pane&&pane.dataset.metadataDirty!=='true'&&input.value===data.rawTranscript)pane.dataset.dirty='false';
    }
    return result;
  });
  meetingLive.pending=request.catch(e=>{toast(tr('原稿保存失败：{0}',e.message))});return request;
}
/* Each clip is a complete recording, including its container header. The
   next recorder starts before uploading; only three clips may be queued. */
function meetingLiveStatus(text){const s=meetingLive.session;if(!s||s.owner===S.user?.id&&s.input.isConnected){const el=$('#meetingLiveState');if(el)el.textContent=text}}
function meetingRelease(s){clearTimeout(s.timer);s.active=false;s.stream?.getTracks().forEach(t=>t.stop())}
function meetingCancelCapture(){
  cancelMeetingOpen();
  const s=meetingLive.session;if(s){s.cancelled=true;meetingRelease(s);s.controller?.abort();if(s.recorder?.state==='recording')s.recorder.stop()}
  const r=meetingLive.recognition;if(r){for(const k of ['onstart','onresult','onerror','onend'])r[k]=null;try{r.stop()}catch(_){}}
  meetingLive.recognition=null;meetingLive.revisions.clear();if(meetingLive.saveTimer)clearTimeout(meetingLive.saveTimer);
  Object.assign(meetingLive,{session:null,active:false,meetingId:null,input:null});meetingLive.generation++;
}
async function meetingDrain(s){
  if(s.draining)return s.draining;
  s.error=null;
  s.draining=(async()=>{
    while(s.queue.length&&!s.cancelled&&s.owner===S.user?.id){
      const clip=s.queue[0];
      if(clip.text===undefined){
        s.controller=new AbortController();
        const r=await apiBlob('/api/transcribe',clip.blob,{signal:s.controller.signal});
        if(s.cancelled||s.owner!==S.user?.id)return;
        clip.text=String(r.text||'').trim();
      }
      if(!clip.appended&&clip.text){
        s.input.value+=(s.input.value?'\n':'')+clip.text;s.input.dispatchEvent(new Event('input',{bubbles:true}));clip.appended=true;
      }
      await meetingSaveTranscript(s.id,s.input,s.active);
      if(s.cancelled||s.owner!==S.user?.id)return;
      s.queue.shift();meetingLiveStatus(s.active?tr('正在录入 · 原稿已保存'):tr('原稿已保存'));
      if(!s.active&&!s.queue.length)$('#meetingLiveBtn')?.replaceChildren(document.createTextNode(tr('继续实时录入')));
    }
  })().catch(e=>{
    if(s.cancelled)return;
    s.error=e;meetingRelease(s);if(s.recorder?.state==='recording')s.recorder.stop();
    meetingLive.active=false;meetingLiveStatus(tr('录入已暂停，{0} 段待重试：{1}',s.queue.length,e.message));
    $('#meetingLiveBtn')?.replaceChildren(document.createTextNode(tr('重试转写')));
  }).finally(()=>{s.draining=null});
  return s.draining;
}
function meetingRecordClip(s){
  if(!s.active||s.cancelled)return;
  const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
  const r=mime?new MediaRecorder(s.stream,{mimeType:mime}):new MediaRecorder(s.stream),parts=[];s.recorder=r;
  s.clipDone=new Promise(resolve=>{
    r.ondataavailable=e=>{if(e.data?.size)parts.push(e.data)};
    r.onstop=()=>{
      clearTimeout(s.timer);
      if(!s.cancelled){
        if(parts.length)s.queue.push({blob:new Blob(parts,{type:r.mimeType||parts[0].type||'audio/webm'})});
        if(s.queue.length>=3){meetingRelease(s);meetingLive.active=false;meetingLiveStatus(tr('转写较慢，已暂停录音，正在处理剩余片段'))}
        if(s.active){try{meetingRecordClip(s)}catch(e){s.error=e;meetingRelease(s);meetingLive.active=false}}
        // A failure keeps the audio in memory. Explicit retry resumes this queue.
        if(!s.error&&s.queue.length)meetingDrain(s);
      }
      resolve();
    };
    r.onerror=()=>{s.error=new Error(tr('录音中断'));meetingRelease(s);meetingLive.active=false;meetingLiveStatus(tr('录音中断，请停止并重试'));$('#meetingLiveBtn')?.replaceChildren(document.createTextNode(tr('重试转写')))};
  });
  r.start();s.timer=setTimeout(()=>{if(r.state==='recording')r.stop()},4000);
}
async function meetingStopServerLive(){
  const s=meetingLive.session;if(!s)return;
  meetingRelease(s);meetingLive.active=false;
  if(s.recorder?.state==='recording')s.recorder.stop();
  await s.clipDone;await s.draining;
  if(s.cancelled)return;
  if(s.error||s.queue.length)throw s.error||new Error(tr('还有录音片段未处理，请重试转写'));
  await meetingSaveTranscript(s.id,s.input,false);
  if(meetingLive.session===s)Object.assign(meetingLive,{session:null,meetingId:null,input:null});
  meetingLiveStatus(tr('原稿已保存'));$('#meetingLiveBtn')?.replaceChildren(document.createTextNode(tr('开始实时录入')));
}
async function meetingToggleLive(id,input){
  if(meetingLive.session){
    const s=meetingLive.session;
    if(s.error){s.error=null;await meetingDrain(s)}
    return meetingStopServerLive();
  }
  if(meetingLive.active)return meetingStopLive();
  const owner=S.user?.id;
  const status=await api('/api/action',{action:'speech.status',data:{}});
  if(owner!==S.user?.id||!input.isConnected)return;
  if(!status.configured)return meetingToggleBrowserLive(id,input);
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder!=='function')throw new Error(tr('当前浏览器不支持录音，请使用 HTTPS 或本机地址'));
  const generation=++meetingLive.generation;
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(owner!==S.user?.id||!input.isConnected||generation!==meetingLive.generation){stream.getTracks().forEach(t=>t.stop());return}
  const s={id,input,owner,stream,active:true,queue:[],cancelled:false};meetingLive.session=s;
  Object.assign(meetingLive,{meetingId:id,input,active:true});
  try{await meetingSaveTranscript(id,input,true);if(s.cancelled||s.owner!==S.user?.id)return;meetingRecordClip(s);meetingLiveStatus(tr('正在实时录入…'));$('#meetingLiveBtn')?.replaceChildren(document.createTextNode(tr('停止实时录入')))}
  catch(e){meetingCancelCapture();meetingLive.active=false;throw e}
}

function meetingScheduleSave(){
  clearTimeout(meetingLive.saveTimer);const {meetingId,input}=meetingLive;if(!meetingId||!input)return;
  meetingLive.saveTimer=setTimeout(()=>meetingSaveTranscript(meetingId,input,meetingLive.active).catch(()=>{}),1200);
}
function meetingStopLive(){
  if(meetingLive.session)return meetingStopServerLive();
  if(!meetingLive.meetingId&&!meetingLive.recognition)return meetingLive.pending;
  meetingLive.generation++;clearTimeout(meetingLive.saveTimer);
  const {recognition:r,meetingId,input,interim}=meetingLive;
  if(interim&&input){input.value+=(input.value?'\n':'')+interim;input.dispatchEvent(new Event('input',{bubbles:true}))}
  meetingLive.interim='';
  Object.assign(meetingLive,{recognition:null,active:false,meetingId:null,input:null});
  if(r){for(const k of ['onstart','onresult','onerror','onend'])r[k]=null;try{r.stop()}catch(_){}}
  if(!meetingId||!input)return meetingLive.pending;
  $('#meetingLiveBtn')?.replaceChildren(document.createTextNode(tr('开始实时录入')));
  const state=$('#meetingLiveState');if(state)state.textContent=tr('正在保存…');
  return meetingSaveTranscript(meetingId,input,false).then(()=>{if(input.isConnected&&state)state.textContent=tr('已保存')}).catch(()=>{if(input.isConnected&&state)state.textContent=tr('保存失败，请点击保存会议重试');throw new Error(tr('会议原稿未保存，请重试'))});
}
function meetingToggleBrowserLive(id,input){
  if(meetingLive.active){meetingStopLive();return}
  const Engine=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Engine){toast(tr('当前浏览器不支持实时语音识别，请粘贴转录原稿'));return}
  const generation=++meetingLive.generation,r=new Engine();Object.assign(meetingLive,{recognition:r,meetingId:id,input,active:true,generation,interim:''});
  r.lang=agentVoiceLang?.()||'zh-CN';r.continuous=true;r.interimResults=true;
  r.onstart=()=>{if(generation!==meetingLive.generation)return;$('#meetingLiveBtn')?.replaceChildren(document.createTextNode(tr('停止实时录入')));if($('#meetingLiveState'))$('#meetingLiveState').textContent=tr('正在实时录入…')};
  r.onresult=e=>{
    if(generation!==meetingLive.generation)return;let final='',interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';e.results[i].isFinal?final+=t:interim+=t}
    meetingLive.interim=interim;
    if(final){input.value+=(input.value?'\n':'')+final;input.dispatchEvent(new Event('input',{bubbles:true}));meetingScheduleSave()}
    if($('#meetingLiveState'))$('#meetingLiveState').textContent=interim?tr('正在识别：{0}',interim):tr('正在实时录入…');
  };
  r.onerror=e=>{if(generation!==meetingLive.generation)return;meetingStopLive().catch(()=>{});toast(e.error==='not-allowed'?tr('没有麦克风权限'):tr('实时识别中断'))};
  r.onend=()=>{if(generation===meetingLive.generation&&meetingLive.active){try{r.start()}catch(_){meetingStopLive().catch(()=>{})}}};
  try{r.start()}catch(_){meetingStopLive().catch(()=>{});toast(tr('实时识别未能启动'))}
}

/* A project's page: the levels above it, its name and actions, one line of
   facts, then a single tab bar. The tab stays put when another project opens. */
const SPACE_TABS={tasks:tr('任务'),meetings:tr('会议'),files:tr('文件'),people:tr('成员'),about:tr('概况')};
function renderProjectSpace(id){
  const archive=(S.fileArchives||[]).find(x=>x.id===id),p=S.projects.find(x=>x.id===id)||archive,box=$('#projectSpace');if(!p||!box)return;
  box.dataset=box.dataset||{};
  const keys=archive?['files','meetings']:Object.keys(SPACE_TABS);
  let tab=spaceTabNow();if(!keys.includes(tab)){tab=keys[0];setSpaceTab(tab)}
  const folder=(S.folders||[]).find(f=>f.id===p.folderId),eyebrow=$('#projectsView .eyebrow');
  if(eyebrow){eyebrow.innerHTML=`${crumb(tr('全部项目'),'')}${archive?` / ${crumb(tr('成果库'),'@shelf')}`:folder?` / ${crumb(folder.name,folder.id)}`:''}`;bindCrumbs()}
  $('#projectsView h1').textContent=p.name;
  const actions=$('#projectActions');
  if(actions){actions.innerHTML=archive?'':projectActionsHTML(p);actions.classList?.toggle('hidden',!actions.innerHTML)}
  const manage=canManageProject(p);
  const tasks=S.tasks.filter(t=>t.projectId===p.id&&t.status!=='deferred'&&!t.repeatId&&!isSuperseded(t));
  const counts={tasks:tasks.length,files:(S.files||[]).filter(f=>f.projectId===p.id).length,
    meetings:(S.meetings||[]).filter(m=>m.projectId===p.id).length,
    people:Object.values(p.members||{}).filter(v=>v==='accepted').length};
  const work=tasks.filter(t=>t.status!=='skipped'),done=work.filter(t=>t.status==='done').length;
  const pct=work.length?Math.round(done/work.length*100):0;
  const panel=(key,html)=>keys.includes(key)?`<div class="space-panel" role="tabpanel" id="spacePanel-${key}" aria-labelledby="spaceTab-${key}"`
    +`${key===tab?'':' hidden'}>${html}</div>`:'';
  const factsHTML=`<span class="project-status${projectOverdue(p)?' is-overdue':''}">${projectStatus(p)}</span>`
    +`<span class="space-owner">${avatarHTML(p.owner)}${escapeHTML(nameOf(p.owner))}</span>`
    +(archive?'':`<span>${p.start?escapeHTML(fmt(p.start)):tr('未定')} – ${p.end?escapeHTML(fmt(p.end)):tr('长期')}</span>`
    +`<span class="space-progress"><span class="progress"><i style="width:${pct}%"></i></span>`
    +`${!S.user?.admin&&p.owner!==S.user?.id?tr('我的任务 '):''}${done}/${work.length}</span>`);
  /* Refresh list metadata and header actions without replacing the live editor. */
  if(tab==='meetings'&&box.dataset.meetingProject===id&&box.dataset.meetingOwner===S.user?.id&&box.dataset.readonly===String(Boolean(archive))&&$('#meetingEditor')){
    const facts=$('#projectSpace .space-facts');if(facts)facts.innerHTML=factsHTML;
    $$('#projectSpace [data-space-tab]').forEach(b=>{const key=b.dataset.spaceTab,on=key===tab;b.innerHTML=SPACE_TABS[key]+(counts[key]==null?'':` <span>${counts[key]}</span>`);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;const pane=$(`#spacePanel-${key}`);if(pane)pane.hidden=!on});
    $('#projectMeetingList').innerHTML=projectMeetingList(p);bindProjectCards();bindMeetingList(p);return;
  }
  box.innerHTML=(p.desc?`<p class="space-description">${escapeHTML(p.desc)}</p>`:'')
    +`<div class="space-facts">${factsHTML}</div>`
    +projectSpaceTabs(p,keys,counts,tab)
    +panel('tasks',`<section class="space-section space-tasks">${projectCardHTML(p)}</section>`)
    +panel('meetings',projectMeetings(p,Boolean(archive)))
    +panel('files',projectFiles(p,Boolean(archive),false))
    +panel('people',projectStaffing(p,manage))
    +panel('about',projectLifecycle(p,manage)+projectBackground(p,manage));
  box.dataset.meetingProject=id;box.dataset.meetingOwner=S.user?.id;box.dataset.readonly=String(Boolean(archive));
  bindProjectCards();bindProjectSpace(p);bindMeetingList(p);bindProjectContentTabs();
}
/* Tabs follow the usual pattern: click or arrow keys move, Home/End jump.
   Leaving 会议 stops a recording and asks before dropping an unsaved draft. */
function bindProjectContentTabs(){
  const tabs=$$('#projectSpace .space-tab');
  const show=(button,focus)=>{
    const next=button.dataset.spaceTab;
    if(spaceTabNow()==='meetings'&&next!=='meetings'){
      if(meetingLive.session||meetingLive.active){meetingStopLive().then(()=>show(button,focus)).catch(e=>toast(e.message));return}
      if($('#meetingEditor')?.dataset?.dirty==='true'&&!confirm(tr('会议修改尚未保存，确定离开？')))return;
    }
    setSpaceTab(next);
    tabs.forEach(t=>{const on=t===button;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;
      const panel=$(`#spacePanel-${t.dataset.spaceTab}`);if(panel)panel.hidden=!on});
    if(focus)button.focus();
  };
  tabs.forEach((button,i)=>{
    button.onclick=()=>show(button);
    button.onkeydown=e=>{
      const next={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:tabs.length-1}[e.key];
      if(next===undefined)return;e.preventDefault();show(tabs[(next+tabs.length)%tabs.length],true);
    };
  });
}
/* 项目周期: 立项 → 执行 → 结项, with how far the dates and the work have come. */
function projectLifecycle(p,manage){
  /* A project entered with a start date already past was set up after it began;
     立项 is never later than 执行. */
  const made=String(p.createdAt||'').slice(0,10),created=made&&p.start?(made<p.start?made:p.start):made||p.start,start=p.start||created,end=p.end;

  const personal=!S.user?.admin&&p.owner!==S.user?.id;
  const tasks=S.tasks.filter(t=>t.projectId===p.id&&t.status!=='deferred'&&!t.repeatId&&!isSuperseded(t)&&t.status!=='skipped');
  const done=tasks.filter(t=>t.status==='done').length;
  const span=end?Math.max(1,daysCount(start,end)):0,passed=span?Math.min(span,Math.max(0,daysCount(start,S.today))):0;
  const stage=p.status==='pending'||p.status==='rejected'?0:p.status==='done'||p.status==='archived'?2:1;
  const steps=[[tr('立项'),created],[tr('执行'),start],[tr('结项'),end||tr('长期')]];
  const meter=(label,value,total,text)=>`<div class="space-meter"><span>${label}</span><div class="progress wide"><i style="width:`
    +`${total?Math.round(value/total*100):0}%"></i></div><b>${text}</b></div>`;
  const folders=S.folders||[];
  return `<section class="space-section space-cycle"><div class="space-steps">${steps.map(([label,day],i)=>`<div class="space-step`
    +`${i<stage?' is-past':i===stage?' is-now':''}"><i></i><strong>${label}</strong><small>${escapeHTML(/^\d{4}-/.test(day||'')?fmt(day):day||'')}</small></div>`).join('')}</div>`
    +`<div class="space-meters">${span?meter(tr('时间'),passed,span,tr('第 {0} / {1} 天',passed,span)):''}`
    +`${meter(personal?tr('我的任务'):tr('任务'),done,tasks.length,tr('{0} / {1} 已完成',done,tasks.length))}</div>`
    +`${manage&&folders.length?`<div class="space-meta"><label class="space-folder">${tr('放在文件夹')}<select id="spaceFolder"><option value="">${tr('未归类')}</option>`
    +`${folders.map(f=>`<option value="${escapeHTML(f.id)}"${f.id===p.folderId?' selected':''}>${escapeHTML(f.name)}</option>`).join('')}`
    +`</select></label></div>`:''}</section>`;
}
function projectBackground(p,manage){
  const text=p.background||'';
  return `<section class="space-section"><div class="space-head"><h2>${tr('项目背景')}</h2>${manage?'<button class="primary-btn is-idle" '
    +tr('id="saveBackground" disabled>已保存</button>'):''}</div>`
    +`${manage?mdEditorHTML({id:'spaceBackgroundEditor',inputId:'spaceBackground',viewId:'spaceBackgroundView',value:text,rows:8,mode:text?'preview':'edit',placeholder:tr('为什么做、要达成什么、边界在哪里（支持 Markdown）'),empty:tr('还没有写项目背景')})
    :`<div class="space-text md-body">${text?mdRender(text):tr('<span class="muted">Owner 还没有写项目背景</span>')}</div>`}</section>`;
}
/* 项目人力: who is on the project and what each one carries. A member's own
   snapshot only holds their own tasks, so others' load is shown to managers. */
function projectStaffing(p,manage){
  const people=Object.entries(p.members||{}).filter(([,v])=>v==='accepted').map(([id])=>id)
    .sort((a,b)=>(b===p.owner)-(a===p.owner));
  const tasks=S.tasks.filter(t=>t.projectId===p.id&&t.status!=='deferred'&&!isSuperseded(t)&&t.status!=='skipped'),period=loadWindow(p);
  const inPeriod=t=>t.date<=period[1]&&taskEnd(t)>=period[0];
  const row=id=>{
    const mine=tasks.filter(t=>t.assignee===id),open=mine.filter(t=>['todo','doing'].includes(t.status)&&inPeriod(t)).length;
    const done=mine.filter(t=>t.status==='done'&&inPeriod(t)).length,mins=memberLoad(id,period,tasks).mins,role=p.staffing?.[id]||'';
    return `<div class="staff-row">${avatarHTML(id)}<div class="staff-name"><strong>${escapeHTML(nameOf(id))}</strong>`
      +`<small>${id===p.owner?'Owner':tr('协作者')}</small></div>`
      +`${manage?`<input class="staff-role" data-member="${escapeHTML(id)}" maxlength="200" value="${escapeHTML(role)}" `
      +tr('placeholder="填写分工" aria-label="{0} 的分工">',escapeHTML(nameOf(id))):`<span class="staff-role-text">${escapeHTML(role||'—')}</span>`}`
      +`<span class="staff-load">${manage||id===S.user?.id?tr('进行中 {0} · 已完成 {1}{2}',open,done,mins?` ${tr('· {0} 小时',hours(mins))}`:''):''}</span></div>`;
  };
  return `<section class="space-section"><div class="space-head"><h2>${tr('分工与负荷')} <small class="space-window">${escapeHTML(loadWindowLabel(p))}</small></h2>`
    +`${manage&&p.status==='active'?`<button class="secondary-btn" id="spaceInvite">${icon('plus')}${tr('添加协作者</button>')}`:''}</div>`
    +`<div class="staff-list">${people.map(row).join('')}</div></section>`;
}
const fileExt=name=>(String(name).match(/\.([a-z0-9]{1,5})$/i)?.[1]||'FILE').toUpperCase();
const fileSize=n=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:n>=1024?`${Math.round(n/1024)} KB`:`${n} B`;
const MAX_FILE_MB=20;
/* Files and meetings form one list, newest first, with dates read as dates. */
const whenText=iso=>{const day=String(iso||'').slice(0,10),time=String(iso||'').slice(11,16);
  return /^\d{4}-\d\d-\d\d$/.test(day)?`${fmt(day)}${time?` ${time}`:''}`:tr('未安排')};
/* Markdown, the small safe subset the workbench writes and reads: headings,
   paragraphs, bold / italic / strikethrough / inline code, links, lists with
   to-dos and nesting, quotes, code blocks, tables and rules. Everything is
   escaped first; links open only http(s) and mailto. */
function mdInline(text){
  const tokens=[],keep=html=>`\u0000${tokens.push(html)-1}\u0000`;
  const marks=s=>s.replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g,(_,a,b)=>`<strong>${a??b}</strong>`)
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
  let s=escapeHTML(String(text).replace(/\u0000/g,'')).replace(/`([^`\n]+)`/g,(_,c)=>keep(`<code>${c}</code>`));
  s=s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g,(all,label,url)=>{
    const href=url.replace(/&amp;/g,'&');
    return /^(https?:\/\/|mailto:)/i.test(href)?keep(`<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${marks(label)}</a>`):all});
  s=s.replace(/(^|[\s(（])(https?:\/\/[^\s<)）]+)/g,(_,pre,url)=>pre+keep(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`));
  const restore=(_,i)=>(tokens[i]||'').replace(/\u0000(\d+)\u0000/g,restore);
  return marks(s).replace(/\u0000(\d+)\u0000/g,restore);
}
function mdRender(src){
  const lines=String(src||'').replace(/\r\n?/g,'\n').split('\n'),out=[];let i=0;
  const isList=l=>/^\s*([-*+]|\d+[.)])\s+/.test(l),isBlockStart=l=>/^(#{1,6}\s|>|```|\s*([-*_])\s*(\2\s*){2,}$)/.test(l)||isList(l)||/^\s*\|.*\|\s*$/.test(l);
  while(i<lines.length){
    const line=lines[i];
    if(!line.trim()){i++;continue}
    const fence=line.match(/^```\s*(\S*)/);
    if(fence){const code=[];i++;while(i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i++]);i++;
      out.push(`<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`);continue}
    const h=line.match(/^(#{1,6})\s+(.*)$/);
    if(h){const n=Math.min(6,h[1].length+1);out.push(`<h${n}>${mdInline(h[2].replace(/\s+#+\s*$/,''))}</h${n}>`);i++;continue}
    if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)){out.push('<hr>');i++;continue}
    if(/^>/.test(line)){const quote=[];while(i<lines.length&&/^>/.test(lines[i]))quote.push(lines[i++].replace(/^>\s?/,''));
      out.push(`<blockquote>${mdRender(quote.join('\n'))}</blockquote>`);continue}
    if(/^\s*\|.*\|\s*$/.test(line)&&/^\s*\|?\s*:?-{2,}/.test(lines[i+1]||'')){
      const cells=l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      const head=cells(line);i+=2;const body=[];
      while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i]))body.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map(c=>`<th>${mdInline(c)}</th>`).join('')}</tr></thead>`
        +`<tbody>${body.map(r=>`<tr>${head.map((_,k)=>`<td>${mdInline(r[k]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);continue}
    if(isList(line)){
      /* Nested lists by indentation; each level is a list of its own kind. */
      const stack=[];let html='';
      const close=()=>{html+=`</${stack.pop()}>`+(stack.length?'</li>':'')};
      while(i<lines.length&&(isList(lines[i])||(lines[i].trim()&&/^\s{2,}/.test(lines[i])&&stack.length))){
        const m=lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if(!m){html=html.replace(/<\/li>$/,'')+`<br>${mdInline(lines[i].trim())}</li>`;i++;continue}
        const depth=Math.floor(m[1].replace(/\t/g,'  ').length/2),tag=/\d/.test(m[2])?'ol':'ul';
        while(stack.length>depth+1||(stack.length===depth+1&&stack[stack.length-1]!==tag))close();
        while(stack.length<depth+1){if(stack.length&&html.endsWith('</li>'))html=html.slice(0,-5);stack.push(tag);html+=`<${tag}>`}
        const task=m[3].match(/^\[([ xX])\]\s+(.*)$/);
        html+=task?`<li class="md-task"><input type="checkbox" disabled${task[1]===' '?'':' checked'}> ${mdInline(task[2])}</li>`:`<li>${mdInline(m[3])}</li>`;
        i++;
      }
      while(stack.length)close();
      out.push(html);continue}
    const para=[];
    while(i<lines.length&&lines[i].trim()&&!(para.length&&isBlockStart(lines[i])))para.push(lines[i++]);
    out.push(`<p>${para.map(mdInline).join('<br>')}</p>`);
  }
  return out.join('');
}
/* An editor: 编辑 shows the text with a small toolbar, 预览 shows it rendered.
   The textarea keeps its own id so existing save logic can read it. */
const MD_TOOLS=[['h',tr('标题'),'## ',''],['b',tr('加粗'),'**','**'],['i',tr('斜体'),'*','*'],['ul',tr('列表'),'- ',''],['todo',tr('待办'),'- [ ] ',''],
  ['quote',tr('引用'),'> ',''],['code',tr('代码'),'`','`'],['link',tr('链接'),'[','](https://)']];
function mdEditorHTML({id,inputId,viewId,value='',placeholder='',rows=10,mode='preview',empty=tr('还没有内容'),readonly=false}){
  return `<div class="md-editor${readonly?' is-readonly':''}" id="${id}" data-mode="${readonly?'preview':mode}" data-empty="${escapeHTML(empty)}">`
    +`<div class="md-bar"><div class="md-tabs" role="tablist"><button type="button" role="tab" data-md-mode="edit">${tr('编辑')}</button>`
    +`<button type="button" role="tab" data-md-mode="preview">${tr('预览')}</button></div>`
    +`<div class="md-tools">${MD_TOOLS.map(([k,label])=>`<button type="button" data-md-tool="${k}" title="${label}" aria-label="${label}">${MD_TOOL_GLYPH[k]}</button>`).join('')}</div></div>`
    +`<textarea class="md-input" id="${inputId}" rows="${rows}" placeholder="${escapeHTML(placeholder)}" spellcheck="false">${escapeHTML(value)}</textarea>`
    +`<div class="md-view md-body" id="${viewId}">${mdRender(value)||`<p class="md-empty">${escapeHTML(empty)}</p>`}</div></div>`;
}
const MD_TOOL_GLYPH={h:'H',b:'<b>B</b>',i:'<i>I</i>',ul:'•',todo:'☐',quote:'❝',code:'&lt;/&gt;',link:'↗'};
function mdShow(root,mode,focus=true){
  root.dataset.mode=mode;
  root.querySelectorAll('[data-md-mode]').forEach(b=>{const on=b.dataset.mdMode===mode;b.setAttribute('aria-selected',String(on));b.classList.toggle('is-on',on)});
  const input=root.querySelector('.md-input'),view=root.querySelector('.md-view');
  if(mode==='preview')view.innerHTML=mdRender(input.value)||`<p class="md-empty">${escapeHTML(root.dataset.empty||'')}</p>`;
  else if(focus)input.focus({preventScroll:true});
}
function mdApply(input,tool){
  const t=MD_TOOLS.find(x=>x[0]===tool);if(!t)return;
  const [,,before,after]=t,{selectionStart:a,selectionEnd:b,value}=input,picked=value.slice(a,b);
  const lineTool=!after&&before.trim()!=='';
  if(lineTool){
    const start=value.lastIndexOf('\n',a-1)+1,block=value.slice(start,b);
    const next=block.split('\n').map(l=>l.startsWith(before)?l.slice(before.length):before+l).join('\n');
    input.value=value.slice(0,start)+next+value.slice(b);input.setSelectionRange(start,start+next.length);
  }else{
    const text=picked||(tool==='link'?tr('链接文字'):tr('文字'));
    input.value=value.slice(0,a)+before+text+after+value.slice(b);
    input.setSelectionRange(a+before.length,a+before.length+text.length);
  }
  input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
}
function bindMdEditor(root){
  if(!root?.querySelectorAll)return;
  const input=root.querySelector('.md-input');
  root.querySelectorAll('[data-md-mode]').forEach(b=>b.onclick=()=>mdShow(root,b.dataset.mdMode));
  root.querySelectorAll('[data-md-tool]').forEach(b=>b.onmousedown=e=>e.preventDefault());
  root.querySelectorAll('[data-md-tool]').forEach(b=>b.onclick=()=>mdApply(input,b.dataset.mdTool));
  input?.addEventListener('keydown',e=>{
    if(!(e.metaKey||e.ctrlKey))return;
    const tool={b:'b',i:'i',k:'link'}[e.key.toLowerCase()];if(tool){e.preventDefault();mdApply(input,tool)}
  });
  mdShow(root,root.dataset.mode||'preview',false);
}
function mdSet(root,value){
  if(!root?.querySelector)return;
  root.querySelector('.md-input').value=value||'';
  root.querySelector('.md-view').innerHTML=mdRender(value)||`<p class="md-empty">${escapeHTML(root.dataset.empty||'')}</p>`;
}

/* Images, PDFs and plain text open in a new tab; the server checks the bytes again. */
const filePreviewable=name=>/\.(png|jpe?g|gif|webp|pdf|txt|md|csv|log|json)$/i.test(String(name||''));
function projectFiles(p,readonly=false,includeMeetings=true){
  const canDrop=f=>!readonly&&canDeleteFile(p,f);
  const file=f=>`<div class="file-row"><span class="file-ext">${escapeHTML(fileExt(f.name))}</span><button type="button" class="file-name" data-open-file="${escapeHTML(f.id)}" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</button>`
    +`<small>${escapeHTML(fileSize(f.size))} · ${escapeHTML(nameOf(f.uploader))} · <span title="${escapeHTML(f.createdAt)}">${escapeHTML(relTime(f.createdAt))}</span></small>`
    +`<div class="file-actions"><button type="button" class="text-btn" data-open-file="${escapeHTML(f.id)}" aria-label="${tr('打开文件 {0}',escapeHTML(f.name))}">${tr('打开')}</button>`
    +`<a class="text-btn" href="/api/files/${encodeURIComponent(f.id)}" download="${escapeHTML(f.name)}" aria-label="${tr('下载文件 {0}',escapeHTML(f.name))}">${tr('下载')}</a>`
    +`${canDrop(f)?`<button type="button" class="text-btn file-delete" data-file="${escapeHTML(f.id)}" aria-label="${tr('删除文件 {0}',escapeHTML(f.name))}">${tr('删除')}</button>`:''}</div></div>`;
  const meeting=m=>`<button type="button" class="file-row meeting-row" data-meeting="${escapeHTML(m.id)}"><span class="file-ext is-meeting">${tr('会议')}</span>`
    +`<span class="file-name">${escapeHTML(m.title)}</span><small>${escapeHTML(whenText(m.scheduledAt))} · ${m.minutes||m.hasMinutes?tr('纪要已整理'):tr('待整理')}`
    +`${meetingChars(m)?` ${tr('· 原稿 {0} 字',meetingChars(m))}`:''}</small><span class="meeting-arrow">${icon('chevron-right')}</span></button>`;
  const rows=[...(S.files||[]).filter(f=>f.projectId===p.id).map(f=>({at:f.createdAt,html:file(f)})),
    ...(includeMeetings?(S.meetings||[]).filter(m=>m.projectId===p.id).map(m=>({at:m.scheduledAt||m.createdAt,html:meeting(m)})):[])]
    .sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  return `<section class="space-section space-files" id="spaceFiles"><div class="space-head is-toolbar">`
    +`${readonly?'':`<details class="space-file-create" id="fileCreateMenu"><summary class="secondary-btn">${tr('{0}新增文件',icon('plus'))}</summary><div class="space-file-options"><button type="button" id="uploadFileFromMenu">${tr('{0}上传文件',icon('file'))}</button>${canManageProject(p)?`<button type="button" id="createMeetingFromFiles">${tr('{0}新增会议',icon('chat'))}</button>`:''}</div></details><input type="file" id="spaceFileInput" multiple hidden>`}</div>`
    +`${rows.length?`<div class="file-list">${rows.map(r=>r.html).join('')}</div>`:tr('<p class="space-empty">还没有文件</p>')}`
    +`</section>`;

}
/* Every directory/file-name entry opens the same management surface; download
   remains an explicit action, including for files the browser cannot preview. */
function openProjectFile(p,id){
  const f=(S.files||[]).find(x=>x.id===id&&x.projectId===p.id);if(!f)return;
  if(/\.md$/i.test(f.name))return openMarkdownFile(p,id);
  openModal(`<div class="eyebrow">${tr('{0} · 文件',escapeHTML(p.name))}</div><h2>${escapeHTML(f.name)}</h2>`
    +`<dl class="project-file-details" id="projectFileDetails" data-file-id="${escapeHTML(id)}"><div><dt>${tr('类型')}</dt><dd>${escapeHTML(fileExt(f.name))}</dd></div>`
    +`<div><dt>${tr('大小')}</dt><dd>${escapeHTML(fileSize(f.size))}</dd></div><div><dt>${tr('上传者')}</dt><dd>${escapeHTML(nameOf(f.uploader))}</dd></div>`
    +`<div><dt>${tr('上传时间')}</dt><dd>${escapeHTML(whenText(f.createdAt))}</dd></div></dl>`
    +`<div class="modal-footer">${canDeleteFile(p,f)?tr('<button type="button" class="secondary-btn content-delete" id="deleteProjectFileBtn">删除文件</button>'):''}`
    +`${filePreviewable(f.name)?`<a class="secondary-btn" href="/api/files/${encodeURIComponent(id)}?preview=1" target="_blank" rel="noopener">${tr('预览')}</a>`:''}`
    +`<a class="primary-btn" href="/api/files/${encodeURIComponent(id)}" download="${escapeHTML(f.name)}">${tr('下载文件')}</a><button type="button" class="secondary-btn" id="closeProjectFile">${tr('关闭')}</button></div>`);
  $('#closeProjectFile').onclick=closeModal;
  $('#closeProjectFile').focus?.();
  const drop=$('#deleteProjectFileBtn');if(drop)drop.onclick=()=>deleteProjectFile(p,id,drop);
}
/* A Markdown file opens rendered; its uploader, the project Owner and admins
   can switch to 编辑 and save it in place. */
async function openMarkdownFile(p,id){
  const f=(S.files||[]).find(x=>x.id===id&&x.projectId===p.id);if(!f)return;
  // Share the meeting reader's navigation lifecycle: opening another viewer,
  // changing account/view/project or closing the modal invalidates this read.
  cancelMeetingOpen();
  const generation=meetingOpenGeneration,scope=meetingOpenScope(),owner=S.user?.id;
  const current=()=>generation===meetingOpenGeneration&&scope===meetingOpenScope()&&(S.files||[]).some(x=>x.id===id&&x.projectId===p.id);
  let text;
  try{const r=await fetch(`/api/files/${encodeURIComponent(id)}?preview=1`,{credentials:'same-origin'});if(!r.ok)throw new Error(tr('读不到文件'));text=await r.text()}
  catch(e){if(current())toast(e.message);return}
  if(!current())return;
  const editable=canDeleteFile(p,f);
  openModal(`<div class="eyebrow">${tr('{0} · 文件',escapeHTML(p.name))}</div><h2>${escapeHTML(f.name)}</h2>`
    +mdEditorHTML({id:'mdFileEditor',inputId:'mdFileInput',viewId:'mdFileView',value:text,rows:18,readonly:!editable,empty:tr('文件是空的')})
    +`<div class="modal-footer">${editable?tr('<button type="button" class="secondary-btn content-delete" id="deleteMdFile">删除文件</button>'):''}<a class="secondary-btn" href="/api/files/${encodeURIComponent(id)}" download="${escapeHTML(f.name)}">${tr('下载')}</a>`
    +`<button type="button" class="secondary-btn" id="cancelAction">${tr('关闭')}</button>${editable?tr('<button type="button" class="primary-btn" id="saveMdFile" disabled>保存</button>'):''}</div>`);
  $('#modalBackdrop .modal')?.classList?.add('is-wide');
  const editor=$('#mdFileEditor');editor.dataset.fileId=id;bindMdEditor(editor);$('#modalContent #cancelAction').onclick=closeModal;
  const drop=$('#deleteMdFile');if(drop)drop.onclick=()=>deleteProjectFile(p,id,drop);
  const input=$('#mdFileInput'),save=$('#saveMdFile');if(!save)return;
  let saved=text;
  input.addEventListener('input',()=>{UI.docDirty=input.value!==saved;save.disabled=input.value===saved});
  save.onclick=async()=>{
    if(save.disabled)return;
    const next=input.value;save.disabled=true;save.textContent=tr('保存中…');
    try{
      const r=await fetch(`/api/files/text?id=${encodeURIComponent(id)}`,{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'text/plain; charset=utf-8','X-Work-Calendar':'1'},body:next});
      const result=await readJSON(r);if(!r.ok)throw new Error(trServer(result.error)||tr('文件保存失败'));
      if(owner!==S.user?.id||!input.isConnected)return;
      saved=next;UI.docDirty=input.value!==saved;toast(tr('文件已保存'));refresh().catch(()=>{});
    }catch(e){if(owner===S.user?.id&&input.isConnected)toast(e.message)}
    finally{if(input.isConnected){save.textContent=tr('保存');save.disabled=input.value===saved}}
  };
}
async function uploadProjectFiles(p,list){
  const files=[...list];if(!files.length)return;
  const big=files.find(f=>f.size>MAX_FILE_MB*1048576);if(big){toast(tr('「{0}」超过 {1}MB',big.name,MAX_FILE_MB));return}
  toast(tr('正在上传 {0} 个文件…',files.length));
  try{
    for(const f of files){
      const r=await fetch(`/api/files?project=${encodeURIComponent(p.id)}`,{method:'POST',credentials:'same-origin',body:f,
        headers:{'Content-Type':f.type||'application/octet-stream','X-Work-Calendar':'1','X-File-Name':encodeURIComponent(f.name)}});
      const x=await readJSON(r);if(!r.ok)throw new Error(trServer(x.error)||tr('「{0}」上传未完成',f.name));
    }
    await refresh();toast(tr('已上传 {0} 个文件',files.length));
  }catch(e){toast(e.message);refresh()}
}
/* Background and 分工 save in place without a full refresh, so typing in one
   field and moving to the next never loses the caret. */
function bindProjectSpace(p){
  const save=async(data,done)=>{try{await api('/api/action',{action:'project.space',data:{id:p.id,...data}});Object.assign(p,data);done?.();return true}catch(e){toast(e.message);return false}};
  bindMdEditor($('#spaceBackgroundEditor'));
  const bg=$('#spaceBackground'),btn=$('#saveBackground');
  if(bg&&btn){
    let saved=docText(bg),saving=false;
    /* Saved reads as a quiet note; only unsaved text turns it into a button. */
    const sync=()=>{const dirty=docText(bg)!==saved;btn.disabled=saving||!dirty;btn.textContent=saving?tr('保存中…'):dirty?tr('保存'):tr('已保存');
      btn.classList?.toggle('is-idle',!saving&&!dirty)};

    bg.oninput=sync;
    btn.onclick=async()=>{
      if(saving)return;
      const submitted=docText(bg);saving=true;sync();
      if(await save({background:submitted})){
        saved=submitted;toast(docText(bg)===saved?tr('项目背景已保存'):tr('已保存提交的版本，仍有未保存修改'));
      }
      saving=false;sync();
    };
  }
  $$('#projectSpace .staff-role').forEach(input=>input.onchange=()=>{
    const staffing={};$$('#projectSpace .staff-role').forEach(x=>{if(x.value.trim())staffing[x.dataset.member]=x.value.trim()});
    save({staffing},()=>toast(tr('分工已保存')));
  });
  const folder=$('#spaceFolder');if(folder)folder.onchange=()=>act('project.space',{id:p.id,folderId:folder.value||null});
  const invite=$('#spaceInvite');if(invite)invite.onclick=()=>inviteCollaborators(p.id);
  const input=$('#spaceFileInput');if(input)input.onchange=()=>{uploadProjectFiles(p,input.files);input.value=''};
  const menu=$('#fileCreateMenu');const upload=$('#uploadFileFromMenu');if(upload)upload.onclick=()=>{menu.open=false;input.click()};
  if(menu)menu.onkeydown=e=>{if(e.key==='Escape'){menu.open=false;menu.querySelector('summary').focus()}};
  const addMeeting=$('#createMeetingFromFiles');if(addMeeting)addMeeting.onclick=async()=>{menu.open=false;await projectArea(p,'meetings');if(UI.spaceArea==='meetings')openMeetingEditor(p)};
  $$('#projectSpace .meeting-row').forEach(b=>b.onclick=()=>openMeetingEditor(p,b.dataset.meeting));
  $$('#projectSpace [data-open-file]').forEach(b=>b.onclick=()=>openProjectFile(p,b.dataset.openFile));
  $$('#projectSpace .file-delete').forEach(b=>b.onclick=()=>deleteProjectFile(p,b.dataset.file,b));
  const zone=$('#spaceFiles');if(!zone)return;
  zone.ondragover=e=>{if(![...e.dataTransfer.types].includes('Files'))return;e.preventDefault();zone.classList.add('is-over')};
  zone.ondragleave=e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('is-over')};
  zone.ondrop=e=>{e.preventDefault();zone.classList.remove('is-over');uploadProjectFiles(p,e.dataTransfer.files)};
}
/* One task line under a project or the 临时任务 card. `who` is ready HTML. */
function projectChildRow(t,who,{title='',drag='',tail=''}={}){
  const end=S.projects.find(p=>p.id===t.projectId)?.end,beyond=Boolean(end&&t.date>end);
  return `<div class="project-child-row${isFreshTask(t)?' is-new':''}"${drag}>`
    +`${drag?'<span class="drag-handle" aria-hidden="true">⋮⋮</span>':''}<button class="project-task-open" data-id="`
    +`${escapeHTML(t.id)}"><span class="priority ${escapeHTML(t.priority)}">${escapeHTML(t.priority)}</span><strong>`
    +`${escapeHTML(t.name)}${beyond?tr('<small class="beyond-chip">超出项目周期</small>'):''}</strong><span class="child-assignee"${title?` title="${escapeHTML(title)}"`:''}>${who}`
    +`</span><span class="child-date">${escapeHTML(fmt(t.date))}</span><span>${status(t)[1]}</span>`
    +`<span aria-hidden="true">${icon('chevron-right')}</span></button>${tail}</div>`;
}
/* 临时任务 belong to no project, but one handed from one person to another is
   tracked like project work: the taker finds it here, the giver follows it. */
function tempTaskCard(){
  const me=S.user?.id,recent=S.today?add(S.today,-7):'';
  const handed=S.tasks.filter(t=>!t.projectId&&!t.repeatId&&!isSuperseded(t)&&t.creator&&t.creator!==t.assignee
    &&(t.assignee===me||t.creator===me)
    &&(['todo','doing'].includes(t.status)||(t.status==='done'&&String(t.completedAt||t.date).slice(0,10)>=recent)));
  const order=list=>list.sort((a,
    b)=>(a.status==='done')-(b.status==='done')||String(a.date).localeCompare(String(b.date)));
  const group=(label,list,who)=>list.length?`<div class="project-tree-label">${label} <span>${list.length}</span></div>`
    +`${order(list).map(t=>projectChildRow(t,who(t))).join('')}`:'';
  const mine=handed.filter(t=>t.assignee===me),given=handed.filter(t=>t.creator===me);
  if(!handed.length)return '';
  return `<article class="project-card project-node temp-task-node"><div class="project-node-heading"><div>`
    +`<div class="project-title"><h3>${tr('临时任务')}</h3><span class="project-status">${tr('不属于任何项目')}</span></div></div></div>`
    +`<div class="project-task-tree">${group(tr('派给我的'),mine,t=>tr('由 {0}',escapeHTML(nameOf(t.creator))))}`
    +`${group(tr('我派出的'),given,t=>tr('给 {0}',escapeHTML(nameOf(t.assignee))))}</div></article>`;
}
/* New work handed to someone carries a notice marked fresh. Until it is opened
   the project space shows a hopping red dot on its menu entry and marks the
   project or task; each one clears as it is opened, and the dot with the last. */
/* Work marked new. The set of live ids is kept per state; the notices are
   read each time, since opening work marks them read in place. */
function freshRefs(){
  const memo=freshRefs.live,key=[S.projects,S.tasks,S.projects?.length,S.tasks?.length];
  if(!memo||!memo.key.every((v,i)=>v===key[i]))freshRefs.live={key,ids:new Set([...S.projects.map(p=>p.id),...S.tasks.map(t=>t.id)])};
  const live=freshRefs.live.ids;
  return new Set((S.notifications||[]).filter(n=>n.fresh&&!n.read&&live.has(n.reference)).map(n=>n.reference));
}
const isFreshTask=t=>{const refs=freshRefs();return refs.size>0&&[...taskLineageIds(t)].some(id=>refs.has(id))};
function renderFreshDot(){
  const dot=$('#projectsNewDot');if(!dot)return;
  const n=freshRefs().size;
  dot.classList.toggle('hidden',!n);
  dot.closest('.nav-item')?.setAttribute('aria-label',n?tr('项目空间，{0} 项新工作',n):tr('项目空间'));
}
function clearFresh(refs){
  const wanted=new Set(refs),notices=(S.notifications||[]).filter(n=>n.fresh&&!n.read&&wanted.has(n.reference));
  if(!notices.length)return;
  notices.forEach(n=>{n.read=true});
  wanted.forEach(ref=>{
    $$(`.project-node[data-fresh="${CSS.escape(ref)}"]`).forEach(card=>{card.classList.add('is-seen');
      card.dataset.fresh=''});
    $$(`.project-task-open[data-id="`
      +`${CSS.escape(ref)}"]`).forEach(b=>b.closest('.project-child-row')?.classList.add('is-seen'));
  });
  renderFreshDot();if(typeof renderInbox==='function')renderInbox();
  Promise.all(notices.map(n=>api('/api/action',{action:'inbox.read',data:{id:n.id}})))
    .catch(()=>{notices.forEach(n=>{n.read=false});refresh().catch(()=>{})});
}
/* Name, dates and Owner of a running project. Collaborators keep their own
   dialog, reached from here, because adding and removing people notifies them. */
function projectSettings(projectId){
  const p=S.projects.find(x=>x.id===projectId),admin=Boolean(S.user?.admin);
  if(!canManageProject(p)||p.status!=='active'){toast(tr('只有项目 Owner 或 superadmin 可设置进行中的项目'));return}
  const owners=S.users.filter(u=>u.active&&!u.admin||u.id===p.owner);
  const accepted=Object.entries(p.members||{}).filter(([id,v])=>v==='accepted'&&id!==p.owner).map(([id])=>nameOf(id));
  openModal(`<div class="eyebrow">${tr('{0} · 项目设置',escapeHTML(p.name))}</div><h2>${tr('项目设置')}</h2><label class="form-field">${tr('项目名称')}<input id="settingsName" maxlength="120" value="${escapeHTML(p.name)}"></label><label class="form-field">${tr('项目描述')}<textarea id="settingsDesc">${escapeHTML(p.desc||'')}</textarea></label><div class="project-date-fields"><label class="form-field">${tr('开始日期')}<input id="settingsStart" type="date" max="${DATE_HORIZON}" value="${escapeHTML(p.start||S.today)}"></label><label class="form-field">${tr('截止日期（可留空）')}<input id="settingsEnd" type="date" min="${escapeHTML(p.start||S.today)}" max="${DATE_HORIZON}" value="${escapeHTML(p.end||'')}"></label></div>${admin?`<label class="form-field">${tr('项目 Owner')}<select id="settingsOwner">${owners.map(u=>`<option value="${escapeHTML(u.id)}" ${u.id===p.owner?'selected':''}>${escapeHTML(nameOf(u.id))}</option>`).join('')}</select></label>`:`<p class="muted">${tr('Owner · {0}（更换 Owner 需联系管理员）',escapeHTML(nameOf(p.owner)))}</p>`}<div class="form-field">${tr('协作者')}<p class="muted">${escapeHTML(accepted.join('、')||tr('暂无'))}</p><button type="button" class="secondary-btn" id="settingsMembers">${tr('管理协作者')}</button></div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmSettings">${tr('保存设置')}</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#settingsStart').onchange=()=>$('#settingsEnd').min=$('#settingsStart').value;
  $('#settingsMembers').onclick=()=>inviteCollaborators(p.id);
  draftForm(`project.settings:${p.id}`, {title: tr('项目设置'), label: p.name, reopen: ['projectSettings', p.id],
    submit: ['project.update']});
  $('#confirmSettings').onclick=async()=>{
    const name=$('#settingsName').value.trim(),start=$('#settingsStart').value,end=$('#settingsEnd').value;
    if(!name||!start){toast(tr('请填写项目名称和开始日期'));return}
    if(end&&end<start){toast(tr('截止日期不能早于开始日期'));return}
    const data={id:p.id,name,desc:$('#settingsDesc').value,start,end:end||null,cycle:end?'range':'infinite'};
    if(admin)data.owner=$('#settingsOwner').value;
    try{await act('project.update',data);closeModal();toast(tr('项目设置已保存'))}catch(e){}
  };
}
function deleteProject(projectId){
  const p=S.projects.find(x=>x.id===projectId);
  if(!p)return;
  if(!canManageProject(p)){toast(tr('只有项目 Owner 或 superadmin 可删除项目'));return}
  const tasks=S.tasks.filter(t=>t.projectId===p.id),done=tasks.filter(t=>t.status==='done').length;
  const members=Object.entries(p.members||{}).filter(([,v])=>v==='accepted').map(([id])=>id);
  openModal(`<div class="eyebrow danger-eyebrow">${tr('危险操作 · 不可撤销')}</div><h2>${tr('删除项目「{0}」',escapeHTML(p.name))}</h2><div class="danger-panel"><p>${tr('删除后无法恢复。')}</p><ul class="danger-impact"><li>${tr('子任务')} <strong>${tasks.length}</strong> ${tr('项（已完成 {0} 项）',done)}</li><li>${tr('参与成员')} <strong>${members.length}</strong> ${tr('人')}</li><li>${tr('附件、会议原稿与纪要、项目沟通记录、报告、申请与通知将一并清除')}</li></ul></div><label class="danger-check"><input type="checkbox" id="deleteAck"> ${tr('我已了解该项目及全部子任务将被永久删除，且无法恢复')}</label><label class="danger-confirm">${tr('请输入项目名称')} <code>${escapeHTML(p.name)}</code> ${tr('以继续')}<input id="deleteConfirmText" autocomplete="off" spellcheck="false" placeholder="${escapeHTML(p.name)}"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="danger-btn" id="confirmDeleteProject" disabled>${tr('永久删除项目')}</button></div>`);
  const ack=$('#deleteAck'),text=$('#deleteConfirmText'),btn=$('#confirmDeleteProject');
  const sync=()=>{btn.disabled=!(ack.checked&&text.value.trim()===p.name)};
  ack.onchange=sync;text.oninput=sync;
  $('#cancelAction').onclick=closeModal;
  btn.onclick=async()=>{
    if(btn.disabled)return;
    btn.disabled=true;btn.textContent=tr('正在删除…');
    try{await act('project.delete',{id:p.id,confirm:text.value.trim()});closeModal();toast(tr('项目已删除'))}
    catch(e){btn.disabled=false;btn.textContent=tr('永久删除项目')}
  };
}
/* Leaving a project is leaving its workspace: there is no separate membership
   to cancel, the channel simply stops being yours. */
function leaveProject(projectId){
  const p=S.projects.find(x=>x.id===projectId);if(!p)return;
  openModal(`<div class="eyebrow">${tr('{0} · 退出项目',escapeHTML(p.name))}</div><h2>${tr('退出这个项目？')}</h2>`
    +`<p class="muted">${tr('你在这里的任务和记录都会保留，之后被重新加入时会原样回来。')}</p>`
    +`<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('再想想')}</button>`
    +`<button class="primary-btn" id="confirmLeaveProject">${tr('确认退出')}</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmLeaveProject').onclick=async()=>{
    try{
      await act('project.member.remove',{id:projectId,member:S.user.id});
      if(chatChannel===projectId)chatChannel='general';
      closeModal();toast(tr('已退出「{0}」',p.name));
    }catch(e){}
  };
}
function inviteCollaborators(projectId){
  const p=S.projects.find(x=>x.id===projectId),admin=Boolean(S.user?.admin),existing=p?.members||{};
  if(!canManageProject(p)||p.status!=='active'){toast(tr('只有项目 Owner 或 superadmin 可管理进行中的项目'));return}
  const candidates=S.users.filter(u=>u.active&&!u.admin&&u.id!==p.owner&&existing[u.id]!=='accepted');
  const current=Object.entries(existing).filter(([id,v])=>v==='accepted'&&id!==p.owner).map(([id])=>id);
  openModal(`<div class="eyebrow">${escapeHTML(p.name)} · ${admin?tr('管理员直接指派'):tr('Owner 添加协作者')}</div><h2>${tr('添加协作者')}</h2>`
    +`<fieldset class="member-checkboxes" id="currentMembers"><legend>${tr('当前协作者（{0}）',current.length)}</legend>`
    +`${current.map(id=>`<div class="member-row"><strong>${escapeHTML(nameOf(id))}</strong><small>`
    +`${escapeHTML(id)} · ${escapeHTML(loadWindowLabel(p))} <b>${memberTaskCount(id,p)}</b> ${tr('项任务')}</small>`
    +`<button type="button" class="ghost-btn remove-member" data-member="${escapeHTML(id)}">${tr('移出')}</button>`
    +`</div>`).join('')||tr('<p class="muted">还没有协作者</p>')}</fieldset><div class="member-checkboxes">`
    +`${candidates.map(u=>`<label><input type="checkbox" name="inviteMember" value="${escapeHTML(u.id)}"> <strong>`
    +`${escapeHTML(u.id)}</strong><small>${tr('成员 · {0}',escapeHTML(loadWindowLabel(p)))} <b data-member-load="${escapeHTML(u.id)}">`
    +`${memberTaskCount(u.id,p)}</b> ${tr('项任务')}</small></label>`).join('')||tr('<p class="muted">暂无可添加成员</p>')}</div>`
    +`<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button>`
    +`<button class="primary-btn" id="confirmInvite" ${candidates.length?'':'disabled'}>${tr('添加并通知')}</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmInvite').onclick=async()=>{const members=$$('input[name="inviteMember"]:checked').map(x=>x.value);if(!members.length){toast(tr('至少选择一位协作者'));return}try{await act('project.invite',{id:projectId,members});closeModal()}catch(e){}};
  /* Removing someone is destructive and irreversible from this dialog, so it
     asks for a second click rather than a nested confirmation. */
  $$('#currentMembers .remove-member').forEach(b=>b.onclick=async()=>{
    if(!b.dataset.armed){
      b.dataset.armed='1';b.textContent=tr('再点一次确认');b.classList.add('is-armed');
      setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent=tr('移出');b.classList.remove('is-armed')}},3000);
      return;
    }
    const who=b.dataset.member;
    try{
      await act('project.member.remove',{id:projectId,member:who});
      closeModal();toast(tr('已移出 {0}，他的沟通区里不再有这个工作区',nameOf(who)));
    }catch(e){}
  });
  const [loadStart,loadEnd]=loadWindow(p);
  api('/api/action',{action:'project.member_loads',data:{id:projectId,start:loadStart,end:loadEnd}}).then(result=>{
    if($('#modalBackdrop')?.classList.contains('hidden'))return;
    for(const [id,total] of Object.entries(result.counts||{})){const el=$$('[data-member-load]').find(node=>node.dataset.memberLoad===id);if(el)el.textContent=total}
  }).catch(()=>{});
}
/* Automatic reports and diaries arrive with their JSON payload appended to
   the body. The inbox reads it back as labelled lines instead of raw JSON. */
const NOTICE_LABELS={done:tr('完成'),progress:tr('进度'),collaborators:tr('协作'),risks:tr('风险'),next:tr('下一步'),summary:tr('总结')};
function noticeLines(body){
  const text=String(body||''),at=text.indexOf('{');
  if(at<0)return {lead:text.trim(),lines:[]};
  let data=null;try{data=JSON.parse(text.slice(at))}catch(_){return {lead:text.trim(),lines:[]}}
  if(!data||typeof data!=='object')return {lead:text.trim(),lines:[]};
  const flat=v=>String(v).replace(/\{[^{}]*\}/g,m=>{try{return Object.values(JSON.parse(m)).filter(x=>typeof x==='string').join('，')}catch(_){return m}}).replace(/\\n|\n/g,'；');
  const lines=Object.entries(data).filter(([k,v])=>NOTICE_LABELS[k]&&typeof v==='string'&&v.trim()).map(([k,v])=>[NOTICE_LABELS[k],flat(v)]);
  return {lead:text.slice(0,at).trim(),lines};
}
function noticeText(body){const {lead,lines}=noticeLines(body);return [lead,...lines.map(([k,v])=>tr('{0}：{1}',k,v))].filter(Boolean).join('　')}
function noticeDetail(body){
  const {lead,lines}=noticeLines(body);
  return (lead?`<p class="notification-detail">${escapeHTML(lead)}</p>`:'')
    +(lines.length?`<dl class="notice-fields">${lines.map(([k,v])=>`<div><dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd></div>`).join('')}</dl>`:'');
}
function relTime(iso){
  const at=new Date(iso);if(!iso||Number.isNaN(at.getTime()))return '';
  const mins=Math.round((Date.now()-at.getTime())/60000),hm=at.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
  if(mins<1)return tr('刚刚');if(mins<60)return tr('{0} 分钟前',mins);if(mins<360)return tr('{0} 小时前',Math.round(mins/60));
  const day=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(),gap=Math.round((day(new Date())-day(at))/86400000);
  return gap===0?tr('今天 {0}',hm):gap===1?tr('昨天 {0}',hm):tr('{0}月{1}日 {2}',at.getMonth()+1,at.getDate(),hm);
}
function renderInbox(){
  const notifications=S.notifications||[],requests=(S.requests||[]).filter(r=>r.status==='pending');
  const approvalInfo=x=>{const chatMention=x.kind==='chat_mention';const p=S.projects.find(p=>p.id===x.reference);const editReq=(S.editRequests||[]).find(r=>r.id===x.reference);const task=S.tasks.find(t=>t.id===x.reference||t.id===editReq?.taskId);const projectPending=Boolean(S.user?.admin&&x.kind==='approval'&&x.title==='项目审批申请'&&p?.status==='pending');const projectCompletionPending=Boolean(S.user?.admin&&x.kind==='project_completion'&&p?.status==='pending_completion');const editPending=Boolean(x.kind==='task_edit_approval'&&editReq&&editReq.status==='pending'&&editReq.approver===S.user?.id&&task);const taskRequestPending=x.kind==='task_request'&&canReviewTaskRequest(taskRequestById(x.reference));return {project:p,task,editReq,projectPending,projectCompletionPending,editPending,taskRequestPending,chatMention,pending:projectPending||projectCompletionPending||editPending||taskRequestPending}};
  const unreadRequests=requests.filter(r=>!r.read).length;
  const unreadNotifications=notifications.filter(x=>!x.read).length;
  const unreadCount=unreadRequests+unreadNotifications;$('#inboxCount').textContent=unreadCount;$('.notification-dot').classList.toggle('hidden',unreadCount===0);$('#inboxView .eyebrow').textContent=tr('通知中心 · {0} 条未读',unreadCount);
  /* Your own task requests stay visible while they wait; they are not notices,
     so they cannot be deleted and do not count as unread. */
  const asks=(S.taskRequests||[]).filter(r=>r.requester===S.user?.id&&r.status==='pending');
  const cards=[...asks.map(r=>({priority:1,time:r.createdAt,html:`<article class="inbox-item task-ask-item" data-task-request="${escapeHTML(r.id)}"><div class="inbox-icon">${icon('clock')}</div><div class="inbox-copy"><strong>${tr('任务申请审批中')}</strong><p>${tr('「{0}」· {1} · 等待{2}审批',escapeHTML(r.draft?.name||tr('任务')),escapeHTML(fmt(r.draft?.date||S.today)),escapeHTML(taskRequestApprover(r)))}</p><small title="${escapeHTML(r.createdAt)}">${escapeHTML(relTime(r.createdAt))}</small></div><span class="task-arrow">${icon('chevron-right')}</span></article>`})),...requests.map(r=>{const p=S.projects.find(x=>x.id===r.projectId);const unread=!r.read;return {priority:2,time:r.createdAt,html:`<article class="inbox-item request-inbox-item ${unread?'unread':''}" data-request="${escapeHTML(r.id)}"><div class="inbox-icon">${icon('folder')}</div><div class="inbox-copy"><strong>${tr('项目协作邀请')}</strong>${unread?'<i class="unread-dot"></i>':''}<p>「${escapeHTML(p?.name||tr('项目'))}」</p><small title="${escapeHTML(r.createdAt)}">${escapeHTML(relTime(r.createdAt))}</small><div class="inbox-actions"><button class="primary-btn accept-request" data-id="${escapeHTML(r.id)}">${tr('接受')}</button><button class="secondary-btn reject-request" data-id="${escapeHTML(r.id)}">${tr('拒绝')}</button></div></div></article>`}}),...notifications.map(x=>{const {project,task,projectPending,projectCompletionPending,editPending,taskRequestPending,chatMention,pending}=approvalInfo(x);const unread=!x.read||pending;const actions=chatMention?`<div class="inbox-actions"><button class="primary-btn open-chat-from-mention" data-channel="${escapeHTML(x.channel||'')}">${tr('去沟通区')}</button></div>`:projectPending?`<div class="inbox-actions"><button class="primary-btn approve-project-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">${tr('同意创建')}</button><button class="secondary-btn reject-project-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">${tr('驳回申请')}</button></div>`:projectCompletionPending?`<div class="inbox-actions"><button class="primary-btn approve-project-completion-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">${tr('同意完成')}</button><button class="secondary-btn reject-project-completion-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">${tr('驳回申请')}</button></div>`:editPending?`<div class="inbox-actions"><button class="primary-btn approve-edit-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">${tr('同意修改')}</button><button class="secondary-btn reject-edit-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">${tr('驳回申请')}</button></div>`:taskRequestPending?`<div class="inbox-actions"><button class="primary-btn approve-task-request" data-id="${escapeHTML(x.reference)}">${tr('同意创建')}</button><button class="secondary-btn reject-task-request" data-id="${escapeHTML(x.reference)}">${tr('驳回申请')}</button></div>`:'';return {priority:pending?2:unread?1:0,time:x.createdAt,html:`<article class="inbox-item ${unread?'unread':''} ${pending?'approval-pending':''} ${UI.inboxManage?'is-managing':''} ${UI.inboxPicked?.has(x.id)?'is-picked':''}" data-id="${escapeHTML(x.id)}">${UI.inboxManage?`<label class="inbox-pick"><input type="checkbox" tabindex="-1" ${UI.inboxPicked?.has(x.id)?'checked':''} aria-label="${tr('选择这条通知')}"></label>`:''}<div class="inbox-icon${UI.inboxManage?' hidden':''}">${taskRequestPending?icon('plus'):editPending?icon('edit'):projectCompletionPending?icon('diamond'):x.kind==='brief'?icon('archive'):x.kind==='report'?icon('clock'):x.kind==='approval'?icon('folder'):x.kind==='request'?icon('mail'):icon('trend')}</div><div class="inbox-copy"><strong>${escapeHTML(trServer(x.title))}</strong>${unread?'<i class="unread-dot"></i>':''}<p>${escapeHTML(noticeText(trServer(x.body)))}</p><small title="${escapeHTML(x.createdAt)}">${escapeHTML(relTime(x.createdAt))}</small>${actions}</div><span class="task-arrow">${icon('chevron-right')}</span>${UI.inboxManage?'':`<button class="inbox-delete" data-delete="${escapeHTML(x.id)}" title="${tr('删除这条通知')}" aria-label="${tr('删除这条通知')}">${icon('x')}</button>`}</article>`}})].sort((a,b)=>(b.priority-a.priority)||String(b.time).localeCompare(String(a.time)));
  $('#inboxList').innerHTML=cards.map(x=>x.html).join('')||tr('<div class="empty-state">收件箱很安静</div>');
  const pick=id=>{UI.inboxPicked=UI.inboxPicked||new Set();if(UI.inboxPicked.has(id))UI.inboxPicked.delete(id);else UI.inboxPicked.add(id);renderInbox()};
  $$('#inboxList .inbox-item').forEach(e=>{e.tabIndex=0;e.onkeydown=ev=>{if(ev.key==='Enter'&&!ev.target.closest('.inbox-actions,.inbox-delete')){if(e.dataset.id)UI.inboxManage?pick(e.dataset.id):openNotification(e.dataset.id);else openRequest(e.dataset.request)}}});
  $$('#inboxList .inbox-item[data-id]').forEach(e=>e.onclick=ev=>{if(ev.target.closest('.inbox-actions,.inbox-delete'))return;if(UI.inboxManage){pick(e.dataset.id);return}openNotification(e.dataset.id)});
  $$('#inboxList .inbox-delete').forEach(b=>b.onclick=ev=>{ev.stopPropagation();deleteNotices([b.dataset.delete])});
  renderInboxToolbar();
  $$('#inboxList .inbox-item[data-request]').forEach(e=>e.onclick=ev=>{if(ev.target.closest('.inbox-actions'))return;openRequest(e.dataset.request)});
  $$('.accept-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();act('request.respond',{id:b.dataset.id,accept:true})});$$('.reject-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();act('request.respond',{id:b.dataset.id,accept:false})});
  $$('.approve-project-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewProject(b.dataset.id,true,b.dataset.notification)});$$('.reject-project-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewProject(b.dataset.id,false,b.dataset.notification)});
  $$('.approve-project-completion-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewProjectCompletion(b.dataset.id,true,b.dataset.notification)});$$('.reject-project-completion-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewProjectCompletion(b.dataset.id,false,b.dataset.notification)});
  $$('.approve-edit-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewTaskEdit(b.dataset.id,true,b.dataset.notification)});$$('.reject-edit-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewTaskEdit(b.dataset.id,false,b.dataset.notification)});
  $$('.approve-task-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewTaskRequest(b.dataset.id,true)});$$('.reject-task-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewTaskRequest(b.dataset.id,false)});
  $$('#inboxList .task-ask-item').forEach(e=>{e.tabIndex=0;e.onclick=()=>openTaskRequest(e.dataset.taskRequest);e.onkeydown=ev=>{if(ev.key==='Enter')openTaskRequest(e.dataset.taskRequest)}});
}
/* Task requests: a project task is for its Owner (or an admin) to settle, a
   one-off task for an admin. */
const taskRequestById=id=>(S.taskRequests||[]).find(r=>r.id===id);
function canReviewTaskRequest(r){if(!r||r.status!=='pending')return false;if(S.user?.admin)return true;return Boolean(r.projectId&&S.projects.find(p=>p.id===r.projectId)?.owner===S.user?.id)}
function taskRequestApprover(r){const p=r.projectId&&S.projects.find(x=>x.id===r.projectId);return p?tr('{0}（项目 Owner）',nameOf(p.owner)):tr('管理员')}
function openTaskRequest(id){
  const r=taskRequestById(id);if(!r)return;const t=r.draft||{},p=r.projectId&&S.projects.find(x=>x.id===r.projectId),review=canReviewTaskRequest(r);
  const state=r.status==='pending'?tr('等待{0}审批',taskRequestApprover(r)):r.status==='approved'?tr('已通过'):tr('已驳回：{0}',r.reason||'');
  const footer=review?`<button class="secondary-btn" id="detailRejectTaskRequest">${tr('驳回申请')}</button><button class="primary-btn" id="detailApproveTaskRequest">${tr('同意创建')}</button>`:tr('<button class="secondary-btn" id="cancelAction">关闭</button>');
  openModal(`<div class="eyebrow">${tr('任务申请 · {0}',escapeHTML(nameOf(r.requester)))}</div><h2>${escapeHTML(t.name||tr('任务'))}</h2>${t.desc?`<p>${escapeHTML(t.desc)}</p>`:''}<div class="detail-grid"><div><span>${tr('项目')}</span><strong>${escapeHTML(p?.name||tr('临时任务'))}</strong></div><div><span>${tr('负责人')}</span><strong>${escapeHTML(nameOf(t.assignee))}</strong></div><div><span>${tr('安排')}</span><strong>${escapeHTML(fmt(t.date||S.today))} ${escapeHTML(t.time||'')}${t.deadline&&t.deadline!==t.date?' – '+escapeHTML(fmt(t.deadline)):''}</strong></div><div><span>${tr('时长 · 优先级')}</span><strong>${tr('{0} 分钟 · {1}',escapeHTML(String(t.duration||30)),escapeHTML(t.priority||'P1'))}</strong></div><div><span>${tr('状态')}</span><strong>${escapeHTML(state)}</strong></div></div><div class="modal-footer">${footer}</div>`);
  $('#cancelAction')?.addEventListener('click',closeModal);
  $('#detailApproveTaskRequest')?.addEventListener('click',()=>reviewTaskRequest(id,true));
  $('#detailRejectTaskRequest')?.addEventListener('click',()=>reviewTaskRequest(id,false));
}
async function reviewTaskRequest(id,accept){
  if(accept){try{closeModal();await act('task.request_review',{id,accept:true})}catch(e){}return}
  openModal(`<div class="eyebrow">${tr('任务申请')}</div><h2>${tr('驳回任务申请')}</h2><label class="form-field">${tr('驳回原因')}<textarea id="taskRequestReason"></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmTaskRequestReject">${tr('确认驳回')}</button></div>`);
  draftForm(`taskreq.reject:${id}`, {title: tr('驳回任务申请'), reopen: ['reviewTaskRequest', id],
    submit: ['task.request_review']});
  $('#cancelAction').onclick=closeModal;
  $('#confirmTaskRequestReject').onclick=async()=>{const reason=$('#taskRequestReason').value.trim();if(!reason){toast(tr('请填写驳回原因'));return}try{await act('task.request_review',{id,accept:false,reason});closeModal()}catch(e){}};
}
function openRequest(id){const r=S.requests.find(x=>x.id===id);if(!r)return;const p=S.projects.find(x=>x.id===r.projectId);openModal(`<div class="eyebrow">${tr('收件箱详情 · 项目邀请')}</div><h2>${tr('加入「{0}」',escapeHTML(p?.name||tr('项目')))}</h2><div class="detail-grid"><div><span>Owner</span><strong>${escapeHTML(p?.owner?nameOf(p.owner):'—')}</strong></div><div><span>${tr('项目状态')}</span><strong>${p?projectStatus(p):'—'}</strong></div></div><div class="modal-footer"><button class="secondary-btn" id="detailRejectRequest">${tr('拒绝')}</button><button class="primary-btn" id="detailAcceptRequest">${tr('接受邀请')}</button></div>`);$('#detailAcceptRequest').onclick=()=>{closeModal();act('request.respond',{id,accept:true})};$('#detailRejectRequest').onclick=()=>{closeModal();act('request.respond',{id,accept:false})};api('/api/action',{action:'request.read',data:{id}}).then(refresh).catch(()=>{})}
function openNotification(id){
  const n=S.notifications.find(x=>x.id===id); if(!n)return;
  if(n.kind==='brief'){if(!n.read)api('/api/action',{action:'inbox.read',data:{id}}).then(refresh).catch(()=>{});openBrief(String(n.reference||'').replace(/^brief:/,''));return}
  if((n.kind==='task_request'||n.kind==='task_request_result')&&taskRequestById(n.reference)){if(!n.read)api('/api/action',{action:'inbox.read',data:{id}}).then(refresh).catch(()=>{});openTaskRequest(n.reference);return}
  const editReq=(S.editRequests||[]).find(r=>r.id===n.reference),p=n.reference&&S.projects.find(x=>x.id===n.reference),t=n.reference&&S.tasks.find(x=>x.id===n.reference)||S.tasks.find(x=>x.id===editReq?.taskId),projectPending=Boolean(S.user?.admin&&n.kind==='approval'&&p?.status==='pending'),projectCompletionPending=Boolean(S.user?.admin&&n.kind==='project_completion'&&p?.status==='pending_completion'),editPending=Boolean(n.kind==='task_edit_approval'&&editReq&&editReq.status==='pending'&&editReq.approver===S.user?.id&&t);
  const action=projectPending?`<div class="modal-footer"><button class="secondary-btn" id="detailRejectProject">${tr('驳回申请')}</button><button class="primary-btn" id="detailApproveProject">${tr('同意创建')}</button></div>`:projectCompletionPending?`<div class="modal-footer"><button class="secondary-btn" id="detailRejectProjectCompletion">${tr('驳回申请')}</button><button class="primary-btn" id="detailApproveProjectCompletion">${tr('同意完成')}</button></div>`:editPending?`<div class="modal-footer"><button class="secondary-btn" id="detailRejectEdit">${tr('驳回申请')}</button><button class="primary-btn" id="detailApproveEdit">${tr('同意修改')}</button></div>`:tr('<div class="modal-footer"><button class="secondary-btn" id="cancelAction">关闭</button></div>');
  openModal(`<div class="eyebrow">${tr('收件箱详情 · {0}',escapeHTML(n.kind||tr('通知')))}</div><h2>${escapeHTML(trServer(n.title))}</h2>${noticeDetail(trServer(n.body))}${t?`<div class="detail-grid"><div><span>${tr('任务')}</span><strong>${escapeHTML(t.name)}</strong></div><div><span>${tr('负责人')}</span><strong>${escapeHTML(nameOf(t.assignee))}</strong></div><div><span>${tr('状态')}</span><strong>${status(t)[1]}</strong></div><div><span>${tr('项目')}</span><strong>${escapeHTML(projectName(t))}</strong></div></div>${t.completionSummary?`<div class="completion-summary"><span>${tr('提交的完成总结')}</span><p>${escapeHTML(t.completionSummary)}</p></div>`:''}${editReq?renderEditRequestSummary(t):''}`:p?`<div class="detail-grid"><div><span>${tr('关联项目')}</span><strong>${escapeHTML(p.name)}</strong></div><div><span>${tr('项目 Owner')}</span><strong>${escapeHTML(nameOf(p.owner))}</strong></div><div><span>${tr('项目状态')}</span><strong>${projectStatus(p)}</strong></div></div>${p.completionReport?`<div class="completion-summary"><span>${tr('结项报告')}</span><p>${escapeHTML(p.completionReport)}</p></div>`:''}`:''}<div class="detail-grid"><div><span>${tr('通知时间')}</span><strong title="${escapeHTML(n.createdAt)}">${escapeHTML(relTime(n.createdAt))}</strong></div></div>${action}`);
  $('#cancelAction')?.addEventListener('click',closeModal);
  $('#detailApproveProject')?.addEventListener('click',()=>reviewProject(p.id,true,n.id));
  $('#detailRejectProject')?.addEventListener('click',()=>reviewProject(p.id,false,n.id));
  $('#detailApproveProjectCompletion')?.addEventListener('click',()=>reviewProjectCompletion(p.id,true,n.id));$('#detailRejectProjectCompletion')?.addEventListener('click',()=>reviewProjectCompletion(p.id,false,n.id));
  $('#detailApproveEdit')?.addEventListener('click',()=>reviewTaskEdit(editReq.id,true,n.id));
  $('#detailRejectEdit')?.addEventListener('click',()=>reviewTaskEdit(editReq.id,false,n.id));
  if(!n.read)api('/api/action',{action:'inbox.read',data:{id}}).then(refresh).catch(()=>{});
}
async function reviewProjectCompletion(id,accept,notificationId){
  if(accept){try{closeModal();await act('project.complete_review',{id,accept:true});
    if(notificationId)await act('inbox.read',{id:notificationId})}catch(e){}return}
  openModal([
    `<div class="eyebrow">${tr('项目完成审批')}</div><h2>${tr('驳回项目完成申请')}</h2>`,
    `<label class="form-field">${tr('驳回原因')}<textarea id="projectCompletionRejectReason" ></textarea></label>`,
    `<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button>`,
    `<button class="primary-btn" id="confirmProjectCompletionReject">${tr('确认驳回')}</button></div>`,
  ].join(''));
  draftForm(`project.completion.reject:${id}`, {title: tr('驳回项目完成申请'), label: projectNameById(id),
    reopen: ['reviewProjectCompletion', id, notificationId], submit: ['project.complete_review']});
  $('#cancelAction').onclick=closeModal;
  $('#confirmProjectCompletionReject').onclick=async()=>{const reason=$('#projectCompletionRejectReason').value.trim();
    if(!reason){toast(tr('请填写驳回原因'));return}try{await act('project.complete_review',{id,accept:false,reason});
    if(notificationId)await act('inbox.read',{id:notificationId});closeModal()}catch(e){}}}
async function reviewProject(id,accept,notificationId){
  if(accept){try{closeModal();await act('project.review',{id,accept:true});if(notificationId)await act('inbox.read',{id:notificationId})}catch(e){}}
  else{openModal([
    `<div class="eyebrow">${tr('项目审批')}</div><h2>${tr('驳回项目申请')}</h2><label class="form-field">${tr('驳回原因')}`,
    '<textarea id="projectRejectReason" ></textarea></label><div class="modal-footer">',
    `<button class="secondary-btn" id="cancelAction">${tr('取消')}</button>`,
    `<button class="primary-btn" id="confirmReject">${tr('确认驳回')}</button></div>`,
  ].join(''));
  draftForm(`project.reject:${id}`, {title: tr('驳回项目申请'), label: projectNameById(id),
    reopen: ['reviewProject', id, notificationId], submit: ['project.review']});
  $('#cancelAction').onclick=closeModal;$('#confirmReject').onclick=async()=>{try{await act('project.review',{id,
    accept:false,reason:$('#projectRejectReason').value||'申请信息需要补充'});if(notificationId)await act('inbox.read',
    {id:notificationId});closeModal()}catch(e){}}}
}
const REPEAT_DAY_NAMES=[tr('周一'),tr('周二'),tr('周三'),tr('周四'),tr('周五'),tr('周六'),tr('周日')];
function repeatPattern(r){
  const dayNames=REPEAT_DAY_NAMES,weekdayName=iso=>dayNames[(new Date(`${iso}T12:00:00`).getDay()+6)%7];
  const days=(r.weekdays||[]).map(i=>dayNames[i]).join('、');
  const every=Math.max(1,Number(r.every||1));
  if(r.frequency==='daily')return tr('每天');
  if(r.frequency==='workdays')return tr('工作日');
  if(r.frequency==='monthly')return tr('每月 {0} 号',Math.min(31,Math.max(1,Number(r.monthDay||1))));
  if(r.frequency==='dates'||r.frequency==='specific')return tr('指定日期');
  const base=days||(r.start?tr('同起始日（{0}）',weekdayName(r.start)):tr('每周'));
  return every>1?tr('每 {0} 周 · {1}',every,base):tr('每周 · {0}',base);
}
/* Attach a fixed-task rule to a project, move it to another, or take it out.
   Only the project's members can carry it, so the dialog says who is missing
   instead of letting the save fail. */
function repeatProjectDialog(repeatId){
  const r=(S.repeats||[]).find(x=>x.id===repeatId);if(!r)return;
  const current=r.projectId&&S.projects.find(x=>x.id===r.projectId);
  const choices=S.projects.filter(p=>p.status==='active'&&p.id!==r.projectId);
  openModal(`<div class="eyebrow">${tr('固定任务 · 所属项目')}</div><h2>${r.projectId?tr('调整所属项目'):tr('挂载到项目')}</h2><p>${escapeHTML(r.name)} · ${escapeHTML(repeatPattern(r))} · ${escapeHTML((r.assignees||[]).map(nameOf).join('、'))}</p><p class="muted">${tr('当前：{0}',r.projectId?escapeHTML(current?.name||tr('项目已结束')):tr('不属于任何项目'))}</p>${choices.length?`<label class="form-field">${r.projectId?tr('改挂到'):tr('挂载到')}<select id="repeatTarget">${choices.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}${p.end?` ${tr('· 截止 {0}',escapeHTML(p.end))}`:''}</option>`).join('')}</select></label><p class="muted" id="repeatTargetHint"></p>`:tr('<p class="muted">没有其他进行中的项目可以挂载。</p>')}<div class="modal-footer">${r.projectId?tr('<button class="secondary-btn" id="repeatDetach">移出项目</button>'):''}<button class="secondary-btn" id="cancelAction">${tr('取消')}</button>${choices.length?`<button class="primary-btn" id="repeatAttach">${r.projectId?tr('保存调整'):tr('挂载')}</button>`:''}</div>`);
  $('#cancelAction').onclick=closeModal;
  const save=async projectId=>{try{await act('repeat.update',{id:r.id,projectId});closeModal();toast(projectId?tr('已挂到项目，从今天起生效'):tr('已移出项目'))}catch(e){}};
  const sync=()=>{
    const p=S.projects.find(x=>x.id===$('#repeatTarget')?.value);if(!p)return;
    const missing=(r.assignees||[]).filter(a=>(p.members||{})[a]!=='accepted');
    $('#repeatTargetHint').textContent=missing.length?tr('{0} 不是该项目成员，请先把他们加入项目',missing.map(nameOf).join('、')):tr('从今天起的安排归入该项目{0}；已发生的记录保持不变。',p.end?tr('，{0} 之后不再生成',p.end):'');
    $('#repeatAttach').disabled=missing.length>0;
  };
  if(choices.length){$('#repeatTarget').onchange=sync;sync();$('#repeatAttach').onclick=()=>save($('#repeatTarget').value)}
  $('#repeatDetach')?.addEventListener('click',()=>save(null));
}
function renderRepeats(){
  const list=$('#repeatList');if(!list)return;const repeats=S.repeats||[];
  const patternOf=repeatPattern;
  list.innerHTML=repeats.map(r=>{
    const span=Math.max(1,Number(r.span||1));
    const state=r.active===false?tr('已暂停'):tr('启用中');
    const spanText=span>1?` ${tr('· 持续 {0} 天',span)}`:'';
    const untilText=r.end?` ${tr('· 至 {0}',escapeHTML(r.end))}`:'';
    const project=r.projectId&&S.projects.find(x=>x.id===r.projectId),projectText=r.projectId?` ${tr('· 项目 {0}',escapeHTML(project?.name||tr('已结束')))}`:'';
    return `<article class="repeat-admin-item"><div><strong>${escapeHTML(r.name)}</strong><span>${escapeHTML(patternOf(r))} · ${escapeHTML(r.time||'09:00')} · ${escapeHTML((r.assignees||[]).join('、'))}</span><small>${state}${projectText}${spanText}${untilText}${r.skipDates?.length?` ${tr('· 已挖空 {0} 天',r.skipDates.length)}`:''}</small></div><div class="repeat-admin-actions"><button class="ghost-btn repeat-project" data-id="${escapeHTML(r.id)}">${r.projectId?tr('调整项目'):tr('挂载到项目')}</button><button class="ghost-btn skip-repeat" data-id="${escapeHTML(r.id)}">${tr('挖空本次')}</button></div></article>`}).join('')||tr('<p class="muted">还没有固定任务规则。</p>');
  $$('.repeat-project').forEach(b=>b.onclick=()=>repeatProjectDialog(b.dataset.id));
  $$('.skip-repeat').forEach(b=>b.onclick=()=>{const date=prompt(tr('请输入本次不执行的日期（YYYY-MM-DD）'),S.today);if(!date)return;act('repeat.skip',{id:b.dataset.id,date,skip:true}).catch(()=>{})});
}
/* Identity is only the 权限组: superadmin, admin or 普通用户. Owning or joining
   a project is not an identity. */
const ROLE_LABELS={superadmin:'superadmin',admin:'admin',member:tr('普通用户')};
function accountRoleLabel(x){return ROLE_LABELS[roleOf(x)]||tr('普通用户')}
function roleOf(x){return x&&(x.role||(x.admin?'superadmin':'member'))}
function userById(id){return (S.users||[]).find(u=>u.id===id)}
/* 中文名称 is the formal ledger name; 昵称 is what the holder calls themselves.
   Anything displayed to the team falls back through displayName → id. */
function nameOf(id){const u=userById(id);return (u&&u.displayName)||id}
function nickOf(id){const u=userById(id);return (u&&u.nickname)||''}
function avatarSeed(id){
  const u=userById(id)||{};
  const text=u.displayName||u.nickname||id||'?';
  return [...String(text)][0]||'?';
}
/* A stable hue per account keeps the fallback initial recognisable. */
function avatarHue(id){
  let h=0;for(const ch of String(id||''))h=(h*31+ch.charCodeAt(0))%360;
  return h;
}
function avatarHTML(id,extra=''){
  const u=userById(id)||{};
  const cls='avatar'+(extra?' '+extra:'')+(u.avatar?' has-image':'');
  if(u.avatar)return `<span class="${cls}" style="--avatar-hue:${avatarHue(id)}"><img src="${escapeHTML(u.avatar)}" alt=""></span>`;
  return `<span class="${cls}" style="--avatar-hue:${avatarHue(id)}">${escapeHTML(avatarSeed(id))}</span>`;
}
/* Updates an avatar element in place so existing bindings stay valid. */
function applyAvatar(el,id){
  if(!el)return el;
  const u=userById(id)||{};
  el.classList.toggle('has-image',Boolean(u.avatar));
  el.style.setProperty('--avatar-hue',String(avatarHue(id)));
  el.innerHTML=u.avatar?`<img src="${escapeHTML(u.avatar)}" alt="">`:escapeHTML(avatarSeed(id));
  return el;
}
/* Downscales a picked image to a 128px square before it ever reaches the API,
   so the stored data URL stays small enough for the state payload. */
function readAvatarFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error(tr('读取文件失败')));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error(tr('无法识别这张图片')));
      img.onload=()=>{
        const size=128;
        const canvas=document.createElement('canvas');
        canvas.width=size;canvas.height=size;
        const ctx=canvas.getContext('2d');
        const scale=Math.max(size/img.width,size/img.height);
        const w=img.width*scale,h=img.height*scale;
        ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
        resolve(canvas.toDataURL('image/jpeg',.82));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function editProfile(id,initialMode){
  const target=userById(id);if(!target){toast(tr('找不到该账户'));return}
  const self=id===S.user.id;
  const canName=S.user?.role==='superadmin';
  if(!canName&&!self){toast(tr('只有 superadmin 可以修改他人资料'));return}
  let pendingAvatar=target.avatar||'';
  const nameField=canName?`<label class="form-field">${tr('中文名称')}<input id="profileDisplayName" maxlength="12" value="${escapeHTML(target.displayName||'')}" ></label>`:'';
  const selfFields=self?`<label class="form-field">${tr('昵称')}<input id="profileNickname" maxlength="12" value="${escapeHTML(target.nickname||'')}" placeholder="${tr('自己想被叫的名字')}"></label>
    <div class="form-field">${tr('头像')}<div class="avatar-editor"><span class="avatar large" id="profileAvatarPreview">${escapeHTML(avatarSeed(id))}</span><input type="file" id="profileAvatarFile" accept="image/*" class="hidden"><button type="button" class="secondary-btn" id="profileAvatarPick">${tr('选择图片')}</button><button type="button" class="ghost-btn" id="profileAvatarClear">${tr('移除')}</button></div></div>
    <label class="form-field">${tr('个性签名')}<input id="profileSignature" maxlength="40" value="${escapeHTML(target.signature||'')}" placeholder="${tr('一句话，显示在头像下方')}"></label>`:'';
  openModal(`<div class="eyebrow">${tr('账户资料 · {0}',escapeHTML(target.id))}</div><h2>${escapeHTML(target.displayName||target.id)}</h2>${nameField}${selfFields}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmProfile">${tr('保存')}</button></div>`);
  /* The avatar element only exists on your own card. A superadmin opening
     someone else's card just to set their 中文名称 used to hit a null here and
     throw, which skipped the whole footer wiring below — so 保存 did nothing.
     Guarding it keeps the dialog working for both kinds of edit. */
  const preview=$('#profileAvatarPreview');
  const paint=()=>{
    if(!preview)return;
    preview.classList.toggle('has-image',Boolean(pendingAvatar));
    preview.style.setProperty('--avatar-hue',String(avatarHue(id)));
    preview.innerHTML=pendingAvatar?`<img src="${escapeHTML(pendingAvatar)}" alt="">`:escapeHTML(avatarSeed(id));
  };
  paint();
  $('#profileAvatarPick')?.addEventListener('click',()=>$('#profileAvatarFile').click());
  $('#profileAvatarFile')?.addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{pendingAvatar=await readAvatarFile(file);paint()}
    catch(err){toast(err.message||tr('图片处理失败'))}
    e.target.value='';
  });
  $('#profileAvatarClear')?.addEventListener('click',()=>{pendingAvatar='';paint()});
  $('#cancelAction').onclick=closeModal;
  $('#confirmProfile').onclick=async()=>{
    const btn=$('#confirmProfile');btn.disabled=true;btn.textContent=tr('保存中…');
    try{
      if(canName&&$('#profileDisplayName')){
        await api('/api/action',{action:'account.profile',data:{id,displayName:$('#profileDisplayName').value.trim()}});
      }
      if(self){
        await api('/api/action',{action:'profile.self',data:{nickname:($('#profileNickname')?.value||'').trim(),avatar:pendingAvatar,signature:($('#profileSignature')?.value||'').trim()}});
      }
      closeModal();await refresh();toast(tr('资料已更新'));
    }catch(err){
      btn.disabled=false;btn.textContent=tr('保存');
      toast(err?.message||tr('保存失败'));
    }
  };
}
/* Rule groups (规则组) for 普通用户: what each group may start and how far its
   AI assistant goes. They sit apart from the superadmin / admin / 普通用户
   roles, which still decide who is an administrator. Only superadmin sees them,
   in 系统设置. */
const CREATION_KINDS=['project','tempTask','projectTask'],KIND_LABELS={project:tr('新项目'),tempTask:tr('临时任务'),projectTask:tr('项目任务')};
const AGENT_ACCESS_LABELS={off:tr('关闭'),read:tr('查询与规划'),operate:tr('可代为操作')};
const TEMP_ASSIGN_LABELS = {anyone: tr('可派给他人'), self: tr('只给自己')};
const RULE_ROW_FACES = 4;
const RULE_ID_RADIX = 36, RULE_ID_CHARS = 6;
function ruleGroupId() {
  return `g-${Math.random().toString(RULE_ID_RADIX).slice(2, 2 + RULE_ID_CHARS)}`;
}
function groupOf(x){const policy=S.creationPolicy,gid=policy?.assign?.[x.id];return policy?.groups?.some(g=>g.id===gid)?gid:'default'}
async function saveCreationPolicy(patch={}){const p=S.creationPolicy;await api('/api/action',{action:'creation.update',data:{groups:patch.groups||p.groups,assign:patch.assign||p.assign}});await refresh()}
/* 系统设置 holds what used to sit under 账户管理: the rule groups (superadmin)
   and the diary automation (admins). */
/* 系统设置, laid out like an editor's settings: categories on the left that
   follow the scroll, a search box that filters rows, one row per setting with
   its control on the right. Changes save as they are made; each row says
   "已保存" in place, and a row that differs from the default shows a bar and
   恢复默认. Rows the account may not change are left out. */
const SETTING_DEFAULTS={
  week:{modified:()=>weekStartDay()!==6,reset:()=>['week_start.update',{day:6}]},
  stacking:{modified:()=>Boolean(S.repeatStacking),reset:()=>['repeat.stacking.update',{enabled:false}]},
  auto:{modified:()=>S.automation?.enabled===false,reset:()=>['automation.update',{enabled:true}]},
  collection:{modified:()=>(S.automation?.mode||'daily')!=='daily'||(S.automation?.time||'00:00')!=='00:00',reset:()=>['automation.update',{mode:'daily',time:'00:00'}]},
  prompt:{modified:()=>Boolean(S.meetingPrompt)&&S.meetingPrompt!==MEETING_PROMPT_DEFAULT,reset:()=>['meeting.prompt.update',{prompt:MEETING_PROMPT_DEFAULT}]}
};
/* A setting with more than one control opens on its own page inside 系统设置,
   with a way back, instead of crowding the list. */
const SETTINGS_PAGES={ai:{title:tr('AI 接入与模型'),render:()=>renderAiSettingsPage()},prompt:{title:tr('会议纪要提示词'),render:()=>renderPromptPage()}};
function openSettingsPage(page){
  UI.settingsPageNext=SETTINGS_PAGES[page]?page:'';
  if(UI.view!=='settings'){switchView('settings');return}
  UI.settingsPage=UI.settingsPageNext;UI.settingsPageNext='';renderSettings();
  $('.main-content')?.scrollTo?.({top:0});
  if(!UI.settingsPage)$(`#settingsView [data-settings-page="${page}"]`)?.focus?.();
}
function renderSettingsPage(){
  const page=SETTINGS_PAGES[UI.settingsPage],box=$('#settingsPage');
  $('#settingsView .settings-layout')?.classList?.toggle('hidden',Boolean(page));box?.classList?.toggle('hidden',!page);
  const eyebrow=$('#settingsView .page-intro .eyebrow'),title=$('#settingsView .page-intro h1');
  if(!page){if(eyebrow)eyebrow.textContent=tr('团队设置');if(title)title.textContent=tr('系统设置');return false}
  if(eyebrow)eyebrow.innerHTML=`<button type="button" class="settings-back" id="settingsBack">${tr('{0}系统设置',icon('chevron-left'))}</button>`;
  if(title)title.textContent=page.title;
  const back=$('#settingsBack');if(back)back.onclick=()=>openSettingsPage('');
  page.render();return true;
}
/* The list shows where each page stands without opening it. */
function renderSettingsSummaries(){
  const accounts=$('#accountSummary');if(accounts)accounts.textContent=tr('{0} 个账户',(S.users||[]).filter(u=>u.active).length);
  const prompt=$('#promptSummary');if(prompt)prompt.textContent=S.meetingPrompt&&S.meetingPrompt!==MEETING_PROMPT_DEFAULT?tr('已自定义'):tr('内置模板');
  const ai=$('#aiSummary');if(!ai)return;
  if(!aiSettings&&S.user?.admin){loadAiSettings();return}
  const chat=aiSettings?.scenes?.chat,count=aiSettings?.sources?.length||0;
  ai.textContent=!aiSettings||aiSettings.error?'':count?tr('{0} 个来源 · 对话助手 {1}',count,chat?.model||tr('未选模型')):tr('还没有来源');
}
function renderPromptPage(){
  const box=$('#settingsPage');if(!box)return;
  if(!box.querySelector('#meetingPromptSetting'))box.innerHTML=`<section class="settings-sheet"><dl class="prompt-vars"><dt>{{title}}</dt><dd>${tr('会议标题')}</dd>`
    +`<dt>{{agenda}}</dt><dd>${tr('议程，没有时写「未提及」')}</dd><dt>{{transcript}}</dt><dd>${tr('会议原稿')}</dd></dl>`
    +`<div class="setting-row is-wide" data-setting="prompt" data-role="admin"><div class="setting-text"><h3><span>${tr('提示词')}</span><span class="setting-meta">`
    +`<span class="setting-status" aria-live="polite"></span><span class="setting-reset-slot"></span></span></h3></div><div id="meetingPromptSetting" class="setting-body"></div></div></section>`;
  renderMeetingPromptSetting();
  const row=box.querySelector('.setting-row'),changed=SETTING_DEFAULTS.prompt.modified(),slot=row?.querySelector('.setting-reset-slot');
  row?.classList.toggle('is-modified',changed);
  if(slot){slot.innerHTML=changed?tr('<button type="button" class="setting-reset" id="promptReset">恢复默认</button>'):'';
    $('#promptReset')?.addEventListener('click',async()=>{const [action,data]=SETTING_DEFAULTS.prompt.reset();
      try{await act(action,data,{quiet:true});const input=$('#meetingPromptSettingInput');if(input){input.value=MEETING_PROMPT_DEFAULT;input.dataset.saved=input.value}
        box.innerHTML='';renderPromptPage();flashSaved($('#settingsPage .setting-status'),tr('已恢复默认'))}catch(e){}})}
}

/* 系统设置 → AI 接入与模型. A source is where models come from: an address and
   a key, kept on the server. Each job picks a source and a model. A test runs
   against what is saved and refreshes that source's model list; only the
   newest test of a source may report, and editing it voids the one running. */
const AI_CONTEXT_CHOICES={16000:tr('精简 · 1.6 万字符'),32000:tr('标准 · 3.2 万字符'),64000:tr('充足 · 6.4 万字符')};
const AI_REASONING_CHOICES={auto:tr('默认'),none:tr('关闭'),minimal:tr('极低'),low:tr('低'),medium:tr('中'),high:tr('高'),xhigh:tr('极高'),max:tr('最高')};
let aiSettings=null,aiEditing=null;const aiTests={};
let aiSettingsLoad=null,aiSettingsEpoch=0,aiSceneQueue=Promise.resolve(),aiScenePending=0,aiSceneRevision=0;
async function loadAiSettings(){
  if(aiSettingsLoad)return aiSettingsLoad;
  const owner=S.user?.id,epoch=aiSettingsEpoch,revision=aiSceneRevision;
  const current=()=>owner===S.user?.id&&epoch===aiSettingsEpoch;
  aiSettingsLoad=(async()=>{
    try{const result=await api('/api/action',{action:'ai.settings.get',data:{}});if(current()&&!aiScenePending&&revision===aiSceneRevision)aiSettings=result}
    catch(e){if(current()&&!aiSettings)aiSettings={error:e.message}}
    finally{if(current()){aiSettingsLoad=null;renderSettingsSummaries();if(UI.view==='settings'&&UI.settingsPage==='ai')renderAiSettingsPage()}}
  })();
  return aiSettingsLoad;
}
const aiProviderName=p=>(LLM_PRESETS[p]?.name||tr('自定义')).replace(tr('（推荐）'),'');
const aiHost=url=>{try{return new URL(url).host}catch(_){return url||''}};
/* The models a scene may pick from: its source's list, plus the one in use. */
function aiSceneModels(source,current){return [...new Set([...(source?.models||[]),...(current?[current]:[])])]}
function renderAiSettingsPage(){
  const box=$('#settingsPage');if(!box||UI.settingsPage!=='ai')return;
  if(!aiSettings||aiSettings.loading){box.innerHTML=tr('<p class="muted settings-loading">正在读取…</p>');loadAiSettings();return}
  if(aiSettings.error){box.innerHTML=`<p class="muted settings-loading">${tr('读取失败：{0}',escapeHTML(aiSettings.error))}</p>`;return}
  // Keep the actual editor (including password, selection and pending submit)
  // across unrelated source-test and scene updates. Explicit cancel/save drops it.
  const editor=box.querySelector('.ai-source-editor'),focused=document.activeElement;
  const keepEditor=editor&&aiEditing&&!aiEditing.scene&&editor.dataset.editor===(aiEditing.id||'')
    &&(aiEditing.id||editor.dataset.kind===aiEditing.kind);
  const {sources,scenes,sceneInfo,contextChars}=aiSettings;
  const card=s=>{
    if(aiEditing?.id===s.id)return aiSourceEditor(s);
    const t=aiTests[s.id]||{},kind=s.kind==='speech'?tr('语音转写'):aiProviderName(s.provider);
    /* Which jobs rely on it, so a change or a delete is not a surprise. */
    const used=sceneInfo.filter(i=>(scenes[i.id]||{}).source===s.id).map(i=>i.name);
    return `<article class="ai-source" data-source="${escapeHTML(s.id)}"><div class="ai-source-main"><div class="ai-source-title"><strong>${escapeHTML(s.name)}</strong>`
      +`${s.kind==='speech'||s.name!==kind?`<span class="ai-chip${s.kind==='speech'?' is-speech':''}">${escapeHTML(kind)}</span>`:''}</div>`
      +`<div class="ai-source-meta"><span>${escapeHTML(aiHost(s.baseUrl))}</span><span>${s.apiKeySet?tr('密钥 {0}',escapeHTML(s.apiKeyMasked)):tr('未设置密钥')}</span>`
      +`<span>${s.models?.length?tr('{0} 个模型',s.models.length):tr('还没有模型列表')}</span></div>`
      +`<p class="ai-source-usage">${used.length?tr('用于 {0}',escapeHTML(used.join('、'))):tr('暂未使用')}</p>`
      +`${t.text?`<p class="ai-source-status is-${t.state}" role="status">${escapeHTML(t.text)}</p>`:''}</div>`
      +`<div class="ai-source-actions"><button type="button" class="secondary-btn" data-ai-test="${escapeHTML(s.id)}"${t.busy?' disabled aria-busy="true"':''}>${t.busy?tr('测试中…'):tr('测试')}</button>`
      +`<button type="button" class="text-btn" data-ai-edit="${escapeHTML(s.id)}">${tr('编辑')}</button><button type="button" class="text-btn is-danger" data-ai-delete="${escapeHTML(s.id)}">${tr('删除')}</button></div></article>`;
  };
  const sceneRow=info=>{
    const c=scenes[info.id]||{},speech=info.id==='transcribe',pool=sources.filter(s=>(s.kind==='speech')===speech),follow=['plan','minutes'].includes(info.id);
    const source=pool.find(s=>s.id===c.source),models=aiSceneModels(source,c.model),pending=aiEditing?.scene===info.id;
    const controls=!pool.length?`<span class="ai-scene-empty">${tr('添加{0}来源后可选',speech?tr('语音转写'):tr('对话模型'))}</span>`
      :`<label class="ai-field"><span>${tr('来源')}</span><select data-scene-source="${info.id}">${follow?`<option value=""${c.follows?' selected':''}>${tr('跟随对话助手')}</option>`:''}`
        +`${speech?`<option value=""${!c.source?' selected':''}>${tr('停用')}</option>`:!c.source&&!follow?tr('<option value="" selected disabled>选择来源</option>'):''}`
        +`${pool.map(s=>`<option value="${escapeHTML(s.id)}"${!c.follows&&s.id===c.source?' selected':''}>${escapeHTML(s.name)}</option>`).join('')}</select></label>`
        +`<label class="ai-field"><span>${tr('模型')}</span>${c.follows||speech&&!c.source?`<input value="${escapeHTML(c.model||'')}" disabled aria-label="${tr('模型')}">`
          :models.length&&!pending?`<select data-scene-model="${info.id}">${models.map(m=>`<option${m===c.model?' selected':''}>${escapeHTML(m)}</option>`).join('')}<option value="__custom">${tr('手动填写…')}</option></select>`
          :`<input data-scene-model-input="${info.id}" value="${escapeHTML(c.model||'')}" placeholder="${tr('填写模型 ID，回车保存')}" aria-label="${tr('模型 ID')}">`}</label>`
        +`${speech?`<label class="ai-field is-short"><span>${tr('语言')}</span><input data-scene-language="${info.id}" value="${escapeHTML(c.language||'zh')}" maxlength="12"${!c.source?' disabled':''}></label>`
          :`<label class="ai-field"><span>${tr('思考强度')}</span><select data-scene-reasoning="${info.id}" title="${tr('需模型支持；默认使用服务商设置')}"${c.follows||!c.source||!c.model?' disabled':''}>${Object.entries(AI_REASONING_CHOICES).map(([v,label])=>`<option value="${v}"${v===(c.reasoningEffort||'auto')?' selected':''}>${label}</option>`).join('')}</select></label>`}`;
    return `<div class="setting-row ai-scene" data-scene="${info.id}"><div class="setting-text"><h3><span>${escapeHTML(info.name)}</span><span class="setting-meta">`
      +`<span class="setting-status" aria-live="polite"></span></span></h3><p>${escapeHTML(info.desc)}</p></div><div class="ai-scene-controls">${controls}</div></div>`;
  };
  const adding=aiEditing&&!aiEditing.id&&!aiEditing.scene;
  box.innerHTML=`<section class="settings-sheet"><h2 class="settings-group-title">${tr('来源')}</h2><div class="ai-sources">${sources.map(card).join('')}`
    +`${!sources.length&&!adding?`<div class="ai-empty-state"><strong>${tr('还没有模型来源')}</strong>`
      +`<div class="ai-empty-actions"><button type="button" class="primary-btn" data-ai-add="chat">${tr('{0}添加对话模型来源',icon('plus'))}</button>`
      +`<button type="button" class="text-btn" data-ai-add="speech">${tr('添加语音转写来源')}</button></div></div>`:''}`
    +`${adding?aiSourceEditor(null):''}</div>${adding||!sources.length?'':`<div class="ai-add-row"><button type="button" class="text-btn is-add" data-ai-add="chat">${tr('{0}添加对话模型来源',icon('plus'))}</button>`
    +`<button type="button" class="text-btn is-add" data-ai-add="speech">${tr('{0}添加语音转写来源',icon('plus'))}</button></div>`}</section>`
    +`<section class="settings-sheet"><h2 class="settings-group-title">${tr('使用场景')}</h2>`
    +`${sceneInfo.map(sceneRow).join('')}</section>`
    +`<section class="settings-sheet"><h2 class="settings-group-title">${tr('对话')}</h2><div class="setting-row" data-ai="context"><div class="setting-text"><h3><span>${tr('单次对话容量')}</span>`
    +`<span class="setting-meta"><span class="setting-status" aria-live="polite"></span></span></h3></div>`
    +`<div class="setting-control"><select id="aiContextChars" aria-label="${tr('单次对话容量')}">${Object.entries(AI_CONTEXT_CHOICES).map(([v,l])=>`<option value="${v}"${Number(v)===contextChars?' selected':''}>${l}</option>`).join('')}</select></div></div></section>`;
  if(keepEditor)box.querySelector('.ai-source-editor')?.replaceWith(editor);
  bindAiSettingsPage(box);
  if(keepEditor&&editor.contains(focused))focused.focus({preventScroll:true});
}
function aiSourceEditor(s){
  const kind=s?.kind||aiEditing?.kind||'chat',provider=s?.provider||(kind==='speech'?'custom':'openai');
  return `<form class="ai-source-editor" data-editor="${escapeHTML(s?.id||'')}" data-kind="${kind}"><div class="ai-editor-title">${s?tr('编辑来源'):kind==='speech'?tr('添加语音转写来源'):tr('添加对话模型来源')}</div>`
    +`<div class="ai-editor-grid">${kind==='speech'?'':`<label class="ai-field"><span>${tr('服务商')}</span><select name="provider">${Object.entries(LLM_PRESETS).map(([k,v])=>`<option value="${k}"${k===provider?' selected':''}>${escapeHTML(v.name)}</option>`).join('')}</select></label>`}`
    +`<label class="ai-field"><span>${tr('名称')}</span><input name="name" maxlength="40" value="${escapeHTML(s?.name||'')}" placeholder="${kind==='speech'?tr('例如：本地 Qwen3-ASR'):tr('例如：DeepSeek 主账号')}"></label>`
    +`<label class="ai-field is-wide"><span>${tr('API 地址')}</span><input name="baseUrl" value="${escapeHTML(s?.baseUrl||(kind==='speech'?'':LLM_PRESETS[provider]?.base||''))}" placeholder="https://api.example.com/v1" autocomplete="url"></label>`
    +`<label class="ai-field is-wide"><span>API Key</span><input name="apiKey" type="password" autocomplete="off" placeholder="${s?.apiKeySet?tr('留空沿用已保存的密钥（{0}）',escapeHTML(s.apiKeyMasked)):LLM_PRESETS[provider]?.key&&kind!=='speech'?tr('例如 {0}',LLM_PRESETS[provider].key):tr('本地服务可以不填')}"></label>`
    +`${s?.apiKeySet?tr('<label class="ai-check"><input type="checkbox" name="clearApiKey">移除已保存的密钥</label>'):''}</div>`
    +`<div class="ai-editor-actions"><button type="button" class="secondary-btn" data-ai-cancel>${tr('取消')}</button><button type="submit" class="primary-btn">${tr('保存并测试')}</button></div></form>`;
}
/* Run one test of a saved source; a newer test or an edit makes this one stale. */
async function aiTestSource(id){
  const run=(aiTests[id]?.run||0)+1,owner=S.user?.id;aiTests[id]={run,busy:true};renderAiSettingsPage();
  const current=()=>aiTests[id]?.run===run&&owner===S.user?.id;
  try{
    const r=await api('/api/action',{action:'agent.config.test',data:{sourceId:id}});if(!current())return;
    aiTests[id]={run,state:r.ok?'ok':'fail',text:r.ok?`${r.message}${r.ms?` · ${r.ms} ms`:''}`:r.reason};
    if(r.ok){await loadAiSettings();return}
  }catch(e){if(!current())return;aiTests[id]={run,state:'fail',text:e.message||tr('测试失败')}}
  if(UI.settingsPage==='ai')renderAiSettingsPage();
}
async function aiSaveScene(scene,data){
  const owner=S.user?.id,epoch=aiSettingsEpoch,payload={scene,...data};
  const current=()=>owner===S.user?.id&&epoch===aiSettingsEpoch;
  aiScenePending++;aiSceneRevision++;
  const save=async()=>{
    if(!current())return;
    let saved=false;
    try{
      const result=await api('/api/action',{action:'ai.scene.set',data:payload});if(!current())return;
      aiSettings=result;
      saved=true;
      if(aiEditing?.scene===scene)aiEditing=null;
      agentLoadServerConfig?.();if(scene==='transcribe')loadSpeechStatus();
    }catch(e){if(current())toast(e.message)}
    finally{if(current()&&!--aiScenePending){renderAiSettingsPage();renderSettingsSummaries();
      if(saved)flashSaved($(`#settingsPage [data-scene="${scene}"] .setting-status`))}}
  };
  aiSceneQueue=aiSceneQueue.then(save,save);
  return aiSceneQueue;
}
function bindAiSettingsPage(box){
  const sceneOf=id=>aiSettings.scenes[id]||{},sourceOf=id=>aiSettings.sources.find(s=>s.id===id);
  box.querySelectorAll('[data-ai-test]').forEach(b=>b.onclick=()=>aiTestSource(b.dataset.aiTest));
  box.querySelectorAll('[data-ai-edit]').forEach(b=>b.onclick=()=>{aiEditing={id:b.dataset.aiEdit};aiTests[b.dataset.aiEdit]={run:(aiTests[b.dataset.aiEdit]?.run||0)+1};renderAiSettingsPage();box.querySelector('.ai-source-editor input[name="name"]')?.focus()});
  box.querySelectorAll('[data-ai-add]').forEach(b=>b.onclick=()=>{aiEditing={kind:b.dataset.aiAdd};renderAiSettingsPage();box.querySelector('.ai-source-editor input[name="baseUrl"]')?.focus()});
  box.querySelectorAll('[data-ai-cancel]').forEach(b=>b.onclick=()=>{aiEditing=null;renderAiSettingsPage()});
  box.querySelectorAll('[data-ai-delete]').forEach(b=>b.onclick=async()=>{
    const s=sourceOf(b.dataset.aiDelete);
    /* A second click deletes, so one stray click never does. */
    if(!b.dataset.armed){b.dataset.armed='1';b.textContent=tr('再点一次删除');b.classList.add('is-armed');setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent=tr('删除');b.classList.remove('is-armed')}},3000);return}
    try{aiSettings=await api('/api/action',{action:'ai.source.delete',data:{id:s.id}});delete aiTests[s.id];renderAiSettingsPage();toast(tr('已删除「{0}」',s.name))}catch(e){toast(e.message)}
  });
  const form=box.querySelector('.ai-source-editor');
  if(form){
    const provider=form.elements.provider,base=form.elements.baseUrl;
    if(provider)provider.onchange=()=>{const before=Object.values(LLM_PRESETS).map(p=>p.base);if(!base.value.trim()||before.includes(base.value.trim()))base.value=LLM_PRESETS[provider.value]?.base||''};
    form.onsubmit=async e=>{
      e.preventDefault();const id=form.dataset.editor,submit=form.querySelector('[type="submit"]');
      const data={id:id||undefined,kind:form.dataset.kind,provider:provider?.value||'custom',name:form.elements.name.value.trim(),baseUrl:base.value.trim(),
        apiKey:form.elements.apiKey.value.trim(),clearApiKey:Boolean(form.elements.clearApiKey?.checked)};
      if(!data.baseUrl&&data.provider!=='opencode-go'){toast(tr('请填写 API 地址'));base.focus();return}
      submit.disabled=true;
      try{
        const before=new Set((aiSettings.sources||[]).map(s=>s.id));
        aiSettings=await api('/api/action',{action:'ai.source.save',data});aiEditing=null;
        const saved=id||aiSettings.sources.find(s=>!before.has(s.id))?.id||(data.kind==='speech'?'speech':'main');
        renderAiSettingsPage();renderSettingsSummaries();if(data.kind==='speech')loadSpeechStatus();aiTestSource(saved);
      }catch(err){toast(err.message);submit.disabled=false}
    };
  }
  box.querySelectorAll('[data-scene-source]').forEach(sel=>sel.onchange=()=>{
    const scene=sel.dataset.sceneSource,id=sel.value;
    if(!id){aiSaveScene(scene,{source:''});return}
    const source=sourceOf(id),current=sceneOf(scene).model,list=source?.models||[];
    const model=list.includes(current)?current:agentPreferredModel(list);
    if(!model){aiEditing={scene};aiSettings.scenes[scene]={...sceneOf(scene),source:id,model:'',follows:false};renderAiSettingsPage();
      box.querySelector(`[data-scene-model-input="${scene}"]`)?.focus();return}
    aiSaveScene(scene,{source:id,model,language:sceneOf(scene).language});
  });
  box.querySelectorAll('[data-scene-model]').forEach(sel=>sel.onchange=()=>{
    const scene=sel.dataset.sceneModel,c=sceneOf(scene);
    if(sel.value==='__custom'){aiEditing={scene};renderAiSettingsPage();box.querySelector(`[data-scene-model-input="${scene}"]`)?.focus();return}
    aiSaveScene(scene,{source:c.source,model:sel.value,language:c.language});
  });
  box.querySelectorAll('[data-scene-model-input]').forEach(input=>{
    const save=()=>{const scene=input.dataset.sceneModelInput,c=sceneOf(scene),model=input.value.trim();if(!model||!c.source||(model===c.model&&!aiEditing))return;
      aiSaveScene(scene,{source:c.source,model,language:c.language})};
    input.onchange=save;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save()}if(e.key==='Escape'&&aiEditing){aiEditing=null;renderAiSettingsPage()}};
  });
  box.querySelectorAll('[data-scene-language]').forEach(input=>input.onchange=()=>{const scene=input.dataset.sceneLanguage,c=sceneOf(scene);
    if(c.source&&c.model)aiSaveScene(scene,{source:c.source,model:c.model,language:input.value.trim()||'zh'})});
  box.querySelectorAll('[data-scene-reasoning]').forEach(input=>input.onchange=()=>{
    aiSaveScene(input.dataset.sceneReasoning,{reasoningEffort:input.value})});
  const context=box.querySelector('#aiContextChars');
  if(context)context.onchange=async()=>{try{aiSettings=await api('/api/action',{action:'ai.context.set',data:{contextChars:Number(context.value)}});renderAiSettingsPage();
    flashSaved($('#settingsPage [data-ai="context"] .setting-status'))}catch(e){toast(e.message);renderAiSettingsPage()}};
}
function renderSettings(){
  if(renderSettingsPage())return;
  const admin=Boolean(S.user?.admin),superadmin=S.user?.role==='superadmin';
  $$('#settingsView .setting-row').forEach(row=>row.classList.toggle('is-forbidden',row.dataset.role==='superadmin'?!superadmin:!admin));
  renderRepeatStackingSetting();
  renderProjectAutomationSetting();
  renderCollectionSchedule();
  renderWeekStartSetting();
  renderCreationPolicy();
  renderSettingsSummaries();
  renderSettingIndicators();
  $('#settingsView .setting-row[data-setting="collection"]')?.classList.toggle('is-muted',S.automation?.enabled===false);
  renderSettingsNav();applySettingsFilter();
}
function renderSettingIndicators(){
  $$('#settingsView .setting-row').forEach(row=>{
    const rule=SETTING_DEFAULTS[row.dataset.setting],changed=Boolean(rule?.modified()),slot=row.querySelector('.setting-reset-slot');
    row.classList.toggle('is-modified',changed);
    const saving=row.dataset.setting==='prompt'&&$('#meetingPromptSettingInput')?.dataset.saving==='true';
    /* A row that opens its own page offers 恢复默认 there, not on the link. */
    if(slot)slot.innerHTML=changed&&!row.classList.contains('is-link')?`<button type="button" class="setting-reset" data-reset="${row.dataset.setting}"${saving?' disabled':''}>${tr('恢复默认')}</button>`:'';
  });
  $$('#settingsView [data-reset]').forEach(b=>b.onclick=async()=>{
    if(b.disabled)return;
    if(b.dataset.reset==='prompt'){await $('#meetingPromptSetting')?.resetPrompt?.();return}
    if(b.dataset.reset==='collection'){await $('#collectionSchedule')?.collectionEditor?.reset();return}
    const [action,data]=SETTING_DEFAULTS[b.dataset.reset].reset();b.disabled=true;
    try{await act(action,data,{quiet:true});flashSaved($(`#settingsView .setting-row[data-setting="${b.dataset.reset}"] .setting-status`),tr('已恢复默认'))}catch(e){}finally{b.disabled=false}
  });
}
/* "已保存" beside the row's title, for a moment. */
function flashSaved(target,text=tr('已保存')){
  const status=target?.classList?.contains('setting-status')?target:target?.closest?.('.setting-row')?.querySelector('.setting-status');
  if(!status)return;
  status.textContent=text;status.classList.add('is-on');clearTimeout(status._hide);
  status._hide=setTimeout(()=>status.classList.remove('is-on'),1800);
}
function renderSettingsNav(){
  const nav=$('#settingsNav');if(!nav)return;
  const groups=$$('#settingsView .settings-group').filter(g=>g.querySelector('.setting-row:not(.is-forbidden)'));
  $$('#settingsView .settings-group').forEach(g=>g.classList.toggle('is-forbidden',!groups.includes(g)));
  const active=UI.settingsSection&&groups.some(g=>g.id===UI.settingsSection)?UI.settingsSection:groups[0]?.id;
  nav.innerHTML=groups.map(g=>`<button type="button" class="settings-nav-item${g.id===active?' is-on':''}" data-target="${g.id}"`
    +`${g.id===active?' aria-current="true"':''}>${icon(g.dataset.navIcon)}<span>${escapeHTML(g.dataset.nav)}</span></button>`).join('');
  $$('#settingsNav [data-target]').forEach(b=>b.onclick=()=>{
    const group=document.getElementById(b.dataset.target);if(!group)return;
    UI.settingsLock=Date.now();setSettingsSection(group.id);
    group.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  });
  watchSettingsScroll(groups);
}
function setSettingsSection(id){
  UI.settingsSection=id;
  $$('#settingsNav [data-target]').forEach(b=>{const on=b.dataset.target===id;b.classList.toggle('is-on',on);on?b.setAttribute('aria-current','true'):b.removeAttribute('aria-current')});
}
/* The category under the top of the page lights up as one scrolls; a click on
   the nav holds its choice while the smooth scroll passes the others. */
function watchSettingsScroll(groups){
  if(typeof IntersectionObserver!=='function')return;
  UI.settingsObserver?.disconnect();
  UI.settingsObserver=new IntersectionObserver(entries=>{
    if(Date.now()-(UI.settingsLock||0)<700)return;
    const top=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];
    if(top)setSettingsSection(top.target.id);
  },{rootMargin:'-120px 0px -55% 0px'});
  groups.forEach(g=>UI.settingsObserver.observe(g));
}
/* Search matches a row's title, description and a few extra words. */
function applySettingsFilter(){
  const input=$('#settingsSearch'),query=String(input?.value||'').trim().toLowerCase();
  let shown=0;
  $$('#settingsView .setting-row').forEach(row=>{
    const text=`${row.querySelector('.setting-text')?.textContent||''} ${row.dataset.keywords||''}`.toLowerCase();
    const hit=!query||text.includes(query);row.classList.toggle('is-filtered',!hit);
    if(hit&&!row.classList.contains('is-forbidden'))shown++;
  });
  $$('#settingsView .settings-group').forEach(g=>g.classList.toggle('is-filtered',Boolean(query)&&!g.querySelector('.setting-row:not(.is-filtered):not(.is-forbidden)')));
  $$('#settingsNav [data-target]').forEach(b=>b.classList.toggle('is-empty',Boolean(document.getElementById(b.dataset.target)?.classList.contains('is-filtered'))));
  /* While searching, the highlight follows the first category that still has a match. */
  const first=$$('#settingsView .settings-group').find(g=>!g.classList.contains('is-filtered')&&!g.classList.contains('is-forbidden'));
  if(query&&first&&document.getElementById(UI.settingsSection||'')?.classList.contains('is-filtered'))setSettingsSection(first.id);
  const empty=$('#settingsEmpty');
  if(empty?.classList){empty.classList.toggle('hidden',shown>0);empty.textContent=shown?'':tr('没有和「{0}」相关的设置',String(input?.value||'').trim())}
}
function renderMeetingPromptSetting(){
  const box=$('#meetingPromptSetting');if(!box)return;
  const admin=Boolean(S.user?.admin);box.classList.toggle('hidden',!admin);if(!admin){box.innerHTML='';return;}
  if(box.dataset.owner!==S.user.id){box.innerHTML='';box.dataset.owner=S.user.id}
  const existing=box.querySelector('#meetingPromptSettingInput');if(existing&&(existing.value!==existing.dataset.saved||existing===document.activeElement||existing.dataset.saving==='true'))return;
  const value=S.meetingPrompt||MEETING_PROMPT_DEFAULT;
  box.innerHTML=`<textarea aria-label="${tr('会议纪要系统提示词')}" id="meetingPromptSettingInput" class="settings-prompt" rows="7" maxlength="12000">${escapeHTML(value)}</textarea>`
    +`<div class="setting-actions"><button type="button" class="primary-btn" id="saveMeetingPrompt">${tr('保存')}</button></div>`;
  const input=$('#meetingPromptSettingInput'),save=$('#saveMeetingPrompt');let saved=value,saving=false;input.dataset.saved=saved;
  const sync=()=>{save.disabled=saving||!input.value.trim()||input.value===saved;};input.oninput=sync;sync();
  const owner=S.user.id;
  const submit=async(submitted,reset=false)=>{
    if(saving)return;saving=true;input.dataset.saving='true';input.disabled=reset;sync();renderSettingIndicators();
    try{
      const result=await api('/api/action',{action:'meeting.prompt.update',data:{prompt:submitted}});
      if(S.user?.id!==owner)return;
      saved=result.value;input.dataset.saved=saved;S.meetingPrompt=saved;if(reset)input.value=saved;
      flashSaved(box,reset?tr('已恢复默认'):tr('已保存'));
    }catch(e){toast(e.message)}finally{saving=false;input.disabled=false;input.dataset.saving='false';sync();renderSettingIndicators()}
  };
  save.onclick=()=>submit(input.value);
  box.resetPrompt=()=>submit(MEETING_PROMPT_DEFAULT,true);
}
function settingSwitch(id,label,checked){
  return `<label class="settings-switch"><span>${escapeHTML(label)}</span><span class="settings-switch-control"><input type="checkbox" role="switch" id="${id}"${checked?' checked':''}><span class="settings-switch-track" aria-hidden="true"></span></span></label>`;
}
function bindSettingSwitch(input,save,current){
  input.onchange=async()=>{
    if(input.disabled)return;
    input.disabled=true;
    try{await save(input.checked);flashSaved($('#'+input.id))}catch(e){input.checked=current()}
    finally{input.disabled=false;if(UI.view==='settings')$('#'+input.id)?.focus()}
  };
}
function renderProjectAutomationSetting(){
  const box=$('#projectAutomationToggle');if(!box)return;
  box.innerHTML='';if(!S.user?.admin)return;
  box.innerHTML=settingSwitch('projectAutomationEnabled',tr('开启'),S.automation?.enabled!==false);
  bindSettingSwitch(box.querySelector('input'),enabled=>act('automation.update',{enabled},{quiet:true}),()=>S.automation?.enabled!==false);
}
function renderRepeatStackingSetting(){
  const box=$('#repeatStackingCard');if(!box)return;
  const allowed=S.user?.role==='superadmin';box.classList.toggle('hidden',!allowed);if(!allowed){box.innerHTML='';return}
  box.innerHTML=settingSwitch('repeatStackingEnabled',tr('合并'),S.repeatStacking);
  bindSettingSwitch(box.querySelector('input'),enabled=>act('repeat.stacking.update',{enabled},{quiet:true}),()=>Boolean(S.repeatStacking));
}
/* 补报时间, set in place. A choice that is not complete yet (每周 with no day,
   指定日期 with none) waits on the page and is saved once it is. */
function renderCollectionSchedule(){
  const box=$('#collectionSchedule');if(!box)return;
  if(!S.user?.admin){box.innerHTML='';box.collectionEditor=null;return}
  const previous=box.collectionEditor;
  if(previous?.owner===S.user.id&&(previous.dirty||previous.pending||box.contains(document.activeElement)))return;
  const cfg=S.automation||{},modes={daily:tr('每天'),weekly:tr('每周几'),dates:tr('指定日期')};
  let mode=cfg.mode==='specific'?'dates':modes[cfg.mode]?cfg.mode:'daily';
  const picked=new Set(cfg.weekdays||[]),days=[tr('一'),tr('二'),tr('三'),tr('四'),tr('五'),tr('六'),tr('日')];
  box.innerHTML=`<div class="collection-form"><div class="rule-line"><span>${tr('周期')}</span><div class="rule-seg" role="radiogroup" aria-label="${tr('补报周期')}">`
    +`${Object.entries(modes).map(([v,l])=>`<button type="button" class="rule-opt${v===mode?' is-on':''}" role="radio" aria-checked="${v===mode}" data-mode="${v}">${l}</button>`).join('')}</div></div>`
    +`<div class="rule-line${mode==='weekly'?'':' hidden'}" data-part="weekly"><span>${tr('星期')}</span><div class="rule-seg is-multi" role="group" aria-label="${tr('每周补报日')}">`
    +`${days.map((d,i)=>`<button type="button" class="rule-opt${picked.has(i)?' is-on':''}" aria-pressed="${picked.has(i)}" data-weekday="${i}">${d}</button>`).join('')}</div></div>`
    +`<div class="rule-line${mode==='dates'?'':' hidden'}" data-part="dates"><span>${tr('日期')}</span><input id="collectionDates" class="settings-input" value="${escapeHTML((cfg.dates||[]).join(', '))}" placeholder="2026-12-01, 2026-12-15" aria-label="${tr('指定补报日期')}"></div>`
    +`<div class="rule-line"><span>${tr('时间')}</span><input id="collectionTime" class="settings-input is-time" type="time" value="${escapeHTML(cfg.time||'00:00')}" aria-label="${tr('补报时间')}"></div>`
    +`<p class="collection-hint muted" aria-live="polite"></p><button type="button" class="ghost-btn hidden" id="collectionRetry">${tr('重试保存')}</button></div>`;
  const hint=box.querySelector('.collection-hint'),retry=box.querySelector('#collectionRetry'),dateInput=box.querySelector('#collectionDates'),timeInput=box.querySelector('#collectionTime');
  const editor=box.collectionEditor={owner:S.user.id,dirty:false,pending:0,revision:0,tail:Promise.resolve()};
  const current=()=>S.user?.id===editor.owner&&box.collectionEditor===editor;
  const changed=()=>{editor.dirty=true;editor.revision++;retry.classList.add('hidden')};
  const paint=()=>{
    box.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('is-on',on);b.setAttribute('aria-checked',String(on))});
    box.querySelectorAll('[data-weekday]').forEach(b=>{const on=picked.has(Number(b.dataset.weekday));b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on))});
    box.querySelector('[data-part="weekly"]').classList.toggle('hidden',mode!=='weekly');box.querySelector('[data-part="dates"]').classList.toggle('hidden',mode!=='dates');
  };
  const save=(reset=false)=>{
    const dates=dateInput.value.split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean);
    if(mode==='weekly'&&!picked.size){hint.textContent=tr('请选择星期');return Promise.resolve()}
    if(mode==='dates'&&!dates.length){hint.textContent=tr('请填写日期');return Promise.resolve()}
    const revision=editor.revision,data={mode,time:timeInput.value||'00:00',weekdays:[...picked].sort(),dates};
    editor.pending++;hint.textContent=tr('保存中…');
    // Requests are serialized; a newer edit is never overwritten by an older response.
    const request=editor.tail.then(async()=>{
      if(!current())return;
      try{
        const result=await api('/api/action',{action:'automation.update',data});if(!current())return;
        S.automation=result;renderSettingIndicators();
        if(revision===editor.revision){editor.dirty=false;hint.textContent='';retry.classList.add('hidden');flashSaved(box,reset?tr('已恢复默认'):tr('已保存'))}
      }catch(e){if(current()&&revision===editor.revision){hint.textContent=e.message||tr('保存失败');retry.classList.remove('hidden')}}
      finally{editor.pending--}
    });
    editor.tail=request;return request;
  };
  box.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(b.dataset.mode===mode)return;mode=b.dataset.mode;changed();paint();return save()});
  box.querySelectorAll('[data-weekday]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.weekday);picked.has(i)?picked.delete(i):picked.add(i);changed();paint();return save()});
  timeInput.oninput=dateInput.oninput=changed;
  timeInput.onchange=dateInput.onchange=()=>{changed();return save()};
  retry.onclick=()=>save();
  editor.reset=()=>{mode='daily';picked.clear();dateInput.value='';timeInput.value='00:00';changed();paint();return save(true)};
}

function renderWeekStartSetting(){
  const box=$('#weekStartCard');if(!box)return;
  box.classList.toggle('hidden',!S.user?.admin);if(!S.user?.admin)return;
  const order=[1,2,3,4,5,6,0],day=weekStartDay();
  box.innerHTML=`<div class="rule-seg week-start-seg" role="radiogroup" aria-label="${tr('每周开始日')}">${order.map(d=>`<button type="button" `
    +`class="rule-opt${d===day?' is-on':''}" role="radio" aria-checked="${d===day}" data-day="${d}">${WEEKDAY_SHORT[d]}</button>`).join('')}</div>`;
  box.querySelectorAll('[data-day]').forEach(b=>b.onclick=async()=>{
    const next=Number(b.dataset.day);if(next===weekStartDay()||box.dataset.saving)return;
    /* One change at a time: the choice shows at once and the row waits for the save. */
    box.dataset.saving='1';box.querySelectorAll('[data-day]').forEach(x=>{const on=x===b;x.classList.toggle('is-on',on);x.setAttribute('aria-checked',String(on));x.disabled=true});
    try{await act('week_start.update',{day:next},{quiet:true});flashSaved($('#weekStartCard'))}catch(e){renderWeekStartSetting()}
    finally{delete box.dataset.saving}
  });
}
/* Groups that exist read as a list, one row each; a group is made or changed
   on a card (editRuleGroup). */
/* The built-in group is stored as 默认规则; it is shown in the interface
   language but saved back unchanged unless someone renames it. */
function ruleGroupName(g){
  return g?.id==='default'&&g.name==='默认规则'?tr('默认规则'):g?.name??'';
}
function renderCreationPolicy(){
  const box=$('#creationPolicy');if(!box)return;
  const policy=S.creationPolicy,show=Boolean(S.user?.role==='superadmin'&&policy);
  box.classList.toggle('hidden',!show);if(!show)return;
  const inGroup=gid=>S.users.filter(u=>roleOf(u)==='member'&&groupOf(u)===gid);
  const tag=(label,value,labels)=>`<span class="rule-tag is-${escapeHTML(value)}"><small>${label}</small>${labels[value]||''}</span>`;
  const row=g=>{const list=inGroup(g.id);return [
    `<div class="rule-row" data-group="${escapeHTML(g.id)}" role="button" tabindex="0"`,
    ` aria-label="${tr('编辑「{0}」',escapeHTML(ruleGroupName(g)))}">`,
    `<div class="rule-row-name"><strong>${escapeHTML(ruleGroupName(g))}</strong></div><div class="rule-row-tags">`,
    CREATION_KINDS.map(k=>tag(KIND_LABELS[k],g[k],RULE_LABELS)).join(''),
    g.tempTask!=='none'?tag(tr('临时任务指派'),g.tempAssign??'anyone',TEMP_ASSIGN_LABELS):'',
    `${tag(tr('AI 助手'),g.agent??'read',AGENT_ACCESS_LABELS)}</div>`,
    `<div class="rule-row-people" title="${escapeHTML(list.map(u=>nameOf(u.id)).join('、'))}">`,
    `${list.slice(0,RULE_ROW_FACES).map(u=>avatarHTML(u.id)).join('')}<span>${tr('{0} 人',list.length)}</span></div>`,
    `<span class="task-arrow">${icon('chevron-right')}</span></div>`,
  ].join('')};
  box.innerHTML=`<div class="rule-list">${policy.groups.map(row).join('')}</div><button type="button" class="text-btn is-add rule-add" id="addCreationGroup">${tr('{0}新建规则组',icon('plus'))}</button>`;
  $$('#creationPolicy .rule-row').forEach(r=>{r.onclick=()=>editRuleGroup(r.dataset.group);r.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();editRuleGroup(r.dataset.group)}}});
  $('#addCreationGroup').onclick=()=>editRuleGroup(null);
}
/* One card both makes a group and changes it: each rule is one click and the
   members are ticked on the card itself, several at once. Nothing is saved
   until 创建 / 保存. Who is left in no group follows 默认规则, so that card
   shows its members without letting them be picked. */
function editRuleGroup(gid){
  const policy=S.creationPolicy;if(!policy)return;
  const isNew=!gid,current=policy.groups.find(g=>g.id===gid),fallback=ruleGroupName(policy.groups.find(g=>g.id==='default')||{id:'default',name:'默认规则'});
  if(!isNew&&!current)return;
  const names=new Set(policy.groups.map(g=>g.name));let n=1,name=tr('新规则组');while(names.has(name))name=tr('新规则组 {0}',++n);
  const draft=isNew?{id:ruleGroupId(),name,project:'approval',tempTask:'direct',projectTask:'none',agent:'read',
    tempAssign:'anyone'}
    :{agent:'read',tempAssign:'anyone',...current};
  const isDefault=draft.id==='default',members=S.users.filter(u=>roleOf(u)==='member');
  const picked=new Set(isNew?[]:members.filter(u=>groupOf(u)===draft.id).map(u=>u.id));
  const groupName=id=>{const g=policy.groups.find(x=>x.id===id);return g?ruleGroupName(g):fallback};
  const seg=(key,labels,label)=>`<div class="rule-line"><span>${label}</span><div class="rule-seg" role="radiogroup" aria-label="${label}">${Object.entries(labels).map(([v,l])=>`<button type="button" class="rule-opt${draft[key]===v?' is-on':''}" role="radio" aria-checked="${draft[key]===v}" data-key="${key}" data-value="${v}">${l}</button>`).join('')}</div></div>`;
  const person=u=>{const cur=groupOf(u),from=!picked.has(u.id)&&cur!=='default'?`<small>${escapeHTML(groupName(cur))}</small>`:'';return `<button type="button" class="rule-person${picked.has(u.id)?' is-on':''}" data-user="${escapeHTML(u.id)}" aria-pressed="${picked.has(u.id)}"${isDefault?' disabled':''}>${avatarHTML(u.id)}<span>${escapeHTML(nameOf(u.id))}${from}</span></button>`};
  const tools=isDefault?''
    :tr('<span><button type="button" class="ghost-btn" id="rulePickAll">全选</button> <button type="button" class="ghost-btn" id="rulePickNone">全不选</button></span>');
  const deleteButton=isNew||isDefault?'':tr('<button class="ghost-btn rule-delete" id="deleteRuleGroup">删除</button>');
  openModal([
    '<div class="rule-card is-editing"><header class="rule-card-head">',
    `<label class="rule-name-wrap" title="${tr('点击修改名称')}">`,
    `<input class="rule-name" id="ruleGroupName" value="${escapeHTML(ruleGroupName(draft))}" maxlength="20"`,
    ` aria-label="${tr('规则组名称')}">${icon('edit','rule-name-icon')}</label></header>`,
    `<div class="rule-lines">${CREATION_KINDS.map(k=>seg(k,RULE_LABELS,KIND_LABELS[k])).join('')}`,
    `${seg('tempAssign',TEMP_ASSIGN_LABELS,tr('临时任务指派'))}${seg('agent',AGENT_ACCESS_LABELS,tr('AI 助手'))}</div>`,
    `<div class="rule-members"><div class="rule-members-head"><span>${tr('成员')}</span>${tools}</div>`,
    `<div class="rule-people">${members.map(person).join('')||tr('<span class="muted">还没有普通用户。</span>')}</div>`,
    '</div></div>',
    `<div class="modal-footer">${deleteButton}<button class="secondary-btn" id="cancelAction">${tr('取消')}</button>`,
    `<button class="primary-btn" id="saveRuleGroup">${isNew?tr('创建'):tr('保存')}</button></div>`,
  ].join(''));
  const sync=()=>$$('#modalContent .rule-person').forEach(b=>{const on=picked.has(b.dataset.user);b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on))});
  $$('#modalContent .rule-opt').forEach(b=>b.onclick=()=>{draft[b.dataset.key]=b.dataset.value;b.parentElement.querySelectorAll('.rule-opt').forEach(x=>{x.classList.toggle('is-on',x===b);x.setAttribute('aria-checked',String(x===b))})});
  if(!isDefault){
    $$('#modalContent .rule-person').forEach(b=>b.onclick=()=>{const id=b.dataset.user;if(picked.has(id))picked.delete(id);else picked.add(id);sync()});
    $('#rulePickAll').onclick=()=>{members.forEach(u=>picked.add(u.id));sync()};
    $('#rulePickNone').onclick=()=>{picked.clear();sync()};
  }
  $('#cancelAction').onclick=closeModal;
  $('#deleteRuleGroup')?.addEventListener('click',async()=>{const count=members.filter(u=>groupOf(u)===draft.id).length;if(!confirm(tr('删除「{0}」？组里的 {1} 人会回到「{2}」。',ruleGroupName(current),count,fallback)))return;try{await saveCreationPolicy({groups:policy.groups.filter(x=>x.id!==draft.id),assign:Object.fromEntries(Object.entries(policy.assign||{}).filter(([,g])=>g!==draft.id))});closeModal();toast(tr('规则组已删除'))}catch(e){toast(e.message)}});
  $('#saveRuleGroup').onclick=async()=>{
    const label=$('#ruleGroupName').value.trim();if(!label){toast(tr('请填写规则组名称'));return}
    const group={...draft,name:label===ruleGroupName(draft)?draft.name:label},groups=isNew?[...policy.groups,group]:policy.groups.map(g=>g.id===group.id?group:g);
    const assign={...policy.assign};
    if(!isDefault){Object.keys(assign).forEach(id=>{if(assign[id]===group.id&&!picked.has(id))delete assign[id]});picked.forEach(id=>{assign[id]=group.id})}
    try{await saveCreationPolicy({groups,assign});closeModal();toast(isNew?tr('已创建「{0}」',label):tr('「{0}」已保存',label))}catch(e){toast(e.message)}
  };
}
/* 账户管理 lists accounts by 权限组 and nothing else. superadmin drags a row to
   reorder it or to move it into another 权限组, and works on several accounts
   at once from a group's 管理 mode; everyone else only sees the list. */
const RESET_PASSWORD='123456';
const ACCOUNT_GROUPS=[['superadmin',tr('superadmin 权限组')],['admin',tr('admin 权限组')],['member',tr('普通用户')]];
function sortedAccounts(list){const order=S.accountOrder||[],at=(u,i)=>{const k=order.indexOf(u.id);return k<0?order.length+i:k};return list.map((u,i)=>[at(u,i),u]).sort((a,b)=>a[0]-b[0]).map(x=>x[1])}
function renderAccountItem(x,owner,picking){
  const self=x.id===S.user.id,on=Boolean(UI.accountPicked?.has(x.id));
  const grip=owner&&!picking?`<span class="account-grip" title="${tr('拖动调整顺序或权限组')}">${icon('grip')}</span>`:'';
  const pick=picking?`<input type="checkbox" class="account-pick" value="${escapeHTML(x.id)}"${on?' checked':''}${self?' disabled':''} aria-label="${tr('选择 {0}',escapeHTML(x.displayName||x.id))}">`:'';
  const tags=(x.nickname?`<span class="name-tag nick">${escapeHTML(x.nickname)}</span>`:'')+(x.displayName?`<span class="name-tag code">${escapeHTML(x.id)}</span>`:'')+(self?tr('<span class="name-tag self">我</span>'):'')+(x.active?'':tr('<span class="name-tag off">已停用</span>'));
  return `<article class="account-item${self?' current-account':''}${on?' is-picked':''}${x.active?'':' is-off'}" data-user="${escapeHTML(x.id)}">${grip}${pick}${avatarHTML(x.id)}<div class="account-copy"><div class="account-name"><strong>${escapeHTML(x.displayName||x.id)}</strong>${tags}</div>${x.signature?`<em class="signature">${escapeHTML(x.signature)}</em>`:''}</div></article>`;
}
function renderAccounts(){
  /* A refresh mid-drag would rebuild the rows under the pointer. */
  if(UI.accountDrag)return;
  const owner=S.user?.role==='superadmin',admin=Boolean(S.user?.admin);
  $('#forceAssignBtn').classList.toggle('hidden',!admin);
  if(!owner)UI.accountManage=null;
  if(!UI.accountPicked)UI.accountPicked=new Set();
  const section=([role,title])=>{
    const list=sortedAccounts(S.users.filter(x=>roleOf(x)===role)),picking=UI.accountManage===role;
    const choosable=list.filter(u=>u.id!==S.user.id),picked=choosable.filter(u=>UI.accountPicked.has(u.id));
    const btn=(kind,label,ok,cls='ghost-btn')=>`<button class="${cls}" data-batch="${kind}"${ok?'':' disabled'}>${label}</button>`;
    const tools=picking?`<div class="group-tools"><label class="group-all"><input type="checkbox" class="account-pick-all"${choosable.length&&picked.length===choosable.length?' checked':''}>${tr('全选')}</label><span class="group-picked">${tr('已选 {0}',picked.length)}</span>${btn('off',tr('停用'),picked.some(u=>u.active))}${btn('on',tr('启用'),picked.some(u=>!u.active))}${btn('password',tr('重置密码'),picked.length)}${btn('name',tr('设置中文名'),picked.length)}${btn('delete',tr('删除'),picked.length,'ghost-btn is-danger')}${btn('done',tr('完成'),true,'primary-btn')}</div>`:owner&&choosable.length?`<button class="ghost-btn group-manage" data-role="${role}">${tr('管理')}</button>`:'';
    return `<div class="account-group${picking?' is-managing':''}" data-role="${role}"><div class="account-group-heading"><strong>${title}</strong><span>${list.length}</span>${tools}</div><div class="account-rows">${list.map(x=>renderAccountItem(x,owner,picking)).join('')}<p class="muted account-empty">${tr('暂无账户')}</p></div></div>`;
  };
  const box=$('#accountList');
  box.innerHTML=ACCOUNT_GROUPS.map(section).join('');
  box.classList.toggle('can-drag',owner&&!UI.accountManage);
  const pick=(id,on)=>{if(id===S.user.id)return;if(on)UI.accountPicked.add(id);else UI.accountPicked.delete(id);renderAccounts()};
  $$('#accountList .group-manage').forEach(b=>b.onclick=()=>{UI.accountManage=b.dataset.role;UI.accountPicked=new Set();renderAccounts()});
  $$('#accountList .is-managing .account-item').forEach(r=>r.onclick=e=>{if(e.target.closest('.account-pick'))return;pick(r.dataset.user,!UI.accountPicked.has(r.dataset.user))});
  $$('#accountList .account-pick').forEach(c=>c.onchange=()=>pick(c.value,c.checked));
  $$('#accountList .account-pick-all').forEach(c=>c.onchange=()=>{const role=c.closest('.account-group').dataset.role;S.users.filter(u=>roleOf(u)===role&&u.id!==S.user.id).forEach(u=>c.checked?UI.accountPicked.add(u.id):UI.accountPicked.delete(u.id));renderAccounts()});
  $$('#accountList [data-batch]').forEach(b=>b.onclick=()=>batchAccountAction(b.dataset.batch));
  $$('#accountList .account-grip').forEach(g=>g.onpointerdown=e=>startAccountDrag(e,g.closest('.account-item')));
}
async function runAccountBatch(ids,label,run){
  const fails=[];
  for(const id of ids){try{await run(id)}catch(e){fails.push(tr('{0}：{1}',nameOf(id),e?.message||tr('失败')))}}
  try{await refresh()}catch(_){}
  /* The same people often need a second action, so the picks stay. */
  UI.accountPicked=new Set([...(UI.accountPicked||[])].filter(id=>userById(id)));
  renderAccounts();
  toast(fails.length?tr('{0} {1} 个，{2} 个没成功：{3}',label,ids.length-fails.length,fails.length,fails.join('；')):tr('已{0} {1} 个账户',label,ids.length));
}
async function batchAccountAction(kind){
  if(kind==='done'){UI.accountManage=null;UI.accountPicked=new Set();renderAccounts();return}
  const ids=[...(UI.accountPicked||[])].filter(id=>userById(id)&&id!==S.user.id);if(!ids.length)return;
  if(kind==='name')return accountNamesDialog(ids);
  if(kind==='delete')return deleteAccounts(ids);
  if(kind==='password'){
    if(!confirm(tr('把 {0} 个账户的密码重置为 {1}？',ids.length,RESET_PASSWORD)))return;
    return runAccountBatch(ids,tr('重置密码'),id=>api('/api/password',{id,password:RESET_PASSWORD}));
  }
  const active=kind==='on';
  return runAccountBatch(ids.filter(id=>Boolean(userById(id).active)!==active),active?tr('启用'):tr('停用'),id=>api('/api/action',{action:'account.toggle',data:{id,active}}));
}
function accountNamesDialog(ids){
  openModal(`<h2>${tr('设置中文名')}</h2><div class="account-name-list">${ids.map(id=>{const u=userById(id);return `<label class="account-name-row">${avatarHTML(id)}<span>${escapeHTML(id)}</span><input data-user="${escapeHTML(id)}" maxlength="12" value="${escapeHTML(u?.displayName||'')}" placeholder="${tr('中文名')}"></label>`}).join('')}</div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmNames">${tr('保存')}</button></div>`);
  $('#modalContent .account-name-row input')?.focus();
  $('#cancelAction').onclick=closeModal;
  $('#confirmNames').onclick=async()=>{
    const changed=$$('#modalContent .account-name-row input').filter(i=>i.value.trim()!==(userById(i.dataset.user)?.displayName||'')).map(i=>[i.dataset.user,i.value.trim()]);
    closeModal();if(!changed.length)return;
    const names=Object.fromEntries(changed);
    await runAccountBatch(Object.keys(names),tr('设置中文名'),id=>api('/api/action',{action:'account.profile',data:{id,displayName:names[id]}}));
  };
}
/* One account keeps the typed-name check; several are confirmed together. */
function deleteAccounts(ids){
  if(ids.length===1){UI.accountPicked=new Set();return deleteAccount(ids[0])}
  openModal(`<div class="eyebrow danger-eyebrow">${tr('不可撤销')}</div><h2>${tr('删除 {0} 个账户',ids.length)}</h2><div class="danger-panel"><ul class="danger-impact">${ids.map(id=>`<li><strong>${escapeHTML(nameOf(id))}</strong> ${escapeHTML(id)}</li>`).join('')}</ul></div><label class="danger-confirm">${tr('输入')} <code>${tr('删除')}</code> ${tr('以继续')}<input id="deleteAccountsConfirm" autocomplete="off" spellcheck="false"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="danger-btn" id="confirmDeleteAccounts" disabled>${tr('永久删除')}</button></div>`);
  const text=$('#deleteAccountsConfirm'),btn=$('#confirmDeleteAccounts');
  text.oninput=()=>{btn.disabled=text.value.trim()!==tr('删除')};
  $('#cancelAction').onclick=closeModal;
  btn.onclick=async()=>{if(btn.disabled)return;closeModal();await runAccountBatch(ids,tr('删除'),id=>api('/api/action',{action:'account.delete',data:{id,confirm:id}}))};
}
/* Drag by the grip: the row lifts into a floating copy, the others slide out
   of the way, and dropping it in another 权限组 changes that account's group.
   Pointer events keep it working with a mouse, a pen or a finger. */
function startAccountDrag(e,row){
  if(!row||e.button>0||UI.accountManage||S.user?.role!=='superadmin')return;
  e.preventDefault();
  const id=row.dataset.user,from=row.closest('.account-group').dataset.role,self=id===S.user.id;
  const start=[...$$('#accountList .account-item')].map(r=>r.dataset.user).join();
  const rect=row.getBoundingClientRect(),offX=e.clientX-rect.left,offY=e.clientY-rect.top;
  const ghost=row.cloneNode(true);ghost.classList.add('account-ghost');
  Object.assign(ghost.style,{width:rect.width+'px',left:rect.left+'px',top:rect.top+'px'});
  document.body.appendChild(ghost);row.classList.add('is-placeholder');document.body.classList.add('is-dragging-account');
  UI.accountDrag={id};
  const rows=()=>[...$$('#accountList .account-item')];
  const flip=change=>{const before=new Map(rows().map(r=>[r,r.getBoundingClientRect().top]));change();rows().forEach(r=>{if(r===row)return;const d=before.get(r)-r.getBoundingClientRect().top;if(d&&!navReducedMotion())r.animate([{transform:`translateY(${d}px)`},{transform:'none'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'})})};
  let scroll=0;
  const move=ev=>{
    ghost.style.left=(ev.clientX-offX)+'px';ghost.style.top=(ev.clientY-offY)+'px';
    scroll=ev.clientY<70?-10:ev.clientY>innerHeight-70?10:0;
    const group=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('#accountList .account-group');
    if(!group||(self&&group.dataset.role!==from))return;
    const list=group.querySelector('.account-rows'),others=[...list.querySelectorAll('.account-item')].filter(r=>r!==row);
    const before=others.find(r=>{const b=r.getBoundingClientRect();return ev.clientY<b.top+b.height/2})||list.querySelector('.account-empty');
    if(row.parentElement===list&&row.nextElementSibling===before)return;
    flip(()=>list.insertBefore(row,before));
  };
  const tick=setInterval(()=>{if(scroll)scrollBy(0,scroll)},16);
  const drop=async()=>{
    removeEventListener('pointermove',move);removeEventListener('pointerup',drop);removeEventListener('pointercancel',drop);clearInterval(tick);
    const to=row.closest('.account-group').dataset.role,end=row.getBoundingClientRect(),now=ghost.getBoundingClientRect();
    ghost.animate([{transform:'scale(1.02)'},{transform:`translate(${end.left-now.left}px,${end.top-now.top}px)`}],{duration:navReducedMotion()?0:170,easing:'cubic-bezier(.2,.8,.2,1)'}).onfinish=()=>{ghost.remove();row.classList.remove('is-placeholder');document.body.classList.remove('is-dragging-account')};
    const order=rows().map(r=>r.dataset.user);
    UI.accountDrag=null;
    if(to===from&&order.join()===start)return;
    try{
      if(to!==from)await api('/api/action',{action:'account.role',data:{id,role:to}});
      await api('/api/action',{action:'account.order',data:{order}});
      if(to!==from)toast(tr('{0} 已移到 {1}',nameOf(id),ACCOUNT_GROUPS.find(g=>g[0]===to)[1]));
    }catch(err){toast(err?.message||tr('调整失败'))}
    try{await refresh()}catch(_){}
  };
  addEventListener('pointermove',move);addEventListener('pointerup',drop);addEventListener('pointercancel',drop);
}
/* The workspace chip opens a menu: who you are, your own settings, a fast
   account switch and sign-out. Switching accounts only signs out and carries
   the target id into the sign-in form — passwords are never bypassed. */
function renderAccountMenu(){
  const menu=$('#accountMenu');if(!menu)return;
  const me=userById(S.user.id)||{};
  const others=knownAccounts().filter(id=>id!==S.user.id).map(userById).filter(u=>u?.active);
  const head=`<div class="account-menu-head">${avatarHTML(S.user.id,'large')}<div class="account-menu-identity"><strong>${escapeHTML(me.displayName||S.user.id)}</strong>${me.nickname?`<span class="name-tag nick">${escapeHTML(me.nickname)}</span>`:''}<small>${escapeHTML(accountRoleLabel(S.user))}</small></div>${me.signature?`<em class="signature">${escapeHTML(me.signature)}</em>`:''}</div>`;
  const row=(action,label,hint)=>`<button class="account-menu-item" data-action="${action}" role="menuitem">${escapeHTML(label)}${hint?`<small>${escapeHTML(hint)}</small>`:''}</button>`;
  const mine=`<div class="account-menu-group">${row('profile',tr('我的资料'),tr('昵称 / 头像 / 签名'))}${row('password',tr('修改密码'))}${S.user?.admin?row('accounts',tr('账户管理'))+row('settings',tr('系统设置')):''}</div>`;
  const switchGroup=`<div class="account-menu-group"><span class="account-menu-label">${tr('切换账户')}</span>${others.map(u=>`<button class="account-menu-item switch" data-user="${escapeHTML(u.id)}" role="menuitem">${avatarHTML(u.id)}<span>${escapeHTML(u.displayName||u.id)}${u.nickname?`<small>${escapeHTML(u.nickname)}</small>`:''}</span></button>`).join('')}<button class="account-menu-item switch" data-user="" role="menuitem">${tr('登录其他账户')}</button></div>`;
  const foot=`<div class="account-menu-group"><button class="account-menu-item danger" data-action="logout" role="menuitem">${tr('退出登录')}</button></div>`;
  menu.innerHTML=`${head}${mine}${languageChooserHTML('account-menu-group')}${switchGroup}${foot}`;
  bindLanguageChooser(menu);
  menu.querySelectorAll('.account-menu-item[data-action]').forEach(b=>b.onclick=()=>accountMenuAction(b.dataset.action));
  menu.querySelectorAll('.account-menu-item.switch').forEach(b=>b.onclick=()=>signOutTo(b.dataset.user));
  positionAccountMenu();
}
/* 界面语言 lives in the account menu: it is each person's own preference,
   and the login screen offers the same choice before anyone signs in. */
function languageChooserHTML(cls){
  return `<div class="${cls} language-chooser" role="group" aria-label="${tr('界面语言')}"><span class="account-menu-label">${tr('界面语言')}</span>`
    +`<div class="language-options">${Object.entries(LANGS).map(([id,label])=>`<button type="button" class="language-option${id===LANG?' is-active':''}" data-lang="${id}" lang="${id==='en'?'en':'zh-CN'}" aria-pressed="${id===LANG}">${label}</button>`).join('')}</div></div>`;
}
function bindLanguageChooser(root){root.querySelectorAll('.language-option').forEach(b=>b.onclick=()=>setLanguage(b?.dataset?.lang))}
function positionAccountMenu(){
  const menu=$('#accountMenu'),anchor=$('#workspaceSwitcher');
  if(!menu||menu.classList.contains('hidden')||!anchor?.getBoundingClientRect||typeof window==='undefined')return;
  const rect=anchor.getBoundingClientRect(),width=Math.min(300,window.innerWidth-24);
  Object.assign(menu.style,{position:'fixed',width:width+'px',right:'auto',
    maxHeight:Math.min(520,window.innerHeight*.72,window.innerHeight-24)+'px'});
  const left=window.innerWidth<=760?rect.right-width:rect.left;
  menu.style.left=Math.max(12,Math.min(window.innerWidth-width-12,left))+'px';
  const below=rect.bottom+8,above=rect.top-menu.offsetHeight-8;
  menu.style.top=Math.max(12,below+menu.offsetHeight<=window.innerHeight-12?below:above)+'px';
}
function accountMenuAction(action){
  toggleAccountMenu(false);
  if(action==='profile')editProfile(S.user.id,'self');
  else if(action==='password')changeOwnPassword();
  else if(action==='accounts')switchView('accounts');
  else if(action==='settings')switchView('settings');
  else if(action==='logout')signOutTo('');
}
function changeOwnPassword(){
  const current=prompt(tr('请输入当前密码'));if(current===null)return;
  const next=prompt(tr('请输入新密码（至少 6 位）'));if(!next)return;
  if(next.length<6){toast(tr('密码至少 6 位'));return}
  api('/api/password',{id:S.user.id,current,password:next}).then(()=>toast(tr('密码已更新'))).catch(e=>toast(e?.message||tr('修改失败')));
}
async function signOutTo(userId){
  if(typeof agentIsBusy==='function'&&agentIsBusy()){toast(tr('请先停止助手，等待正在执行的操作结束后再切换账户'));return}
  if(typeof agentResetUser==='function')agentResetUser();
  await meetingStopLive();
  toggleAccountMenu(false);
  if(UI.formDraft){
    const saving=flushFormDraft();
    $('#modalBackdrop').classList.add('hidden');
    await saving;
  }
  try{await api('/api/logout',{})}catch(_){}
  showAuth();
  $('#loginUser').value=userId||'';
  if(userId)$('#loginPass').focus();else $('#loginUser').focus();
}
function toggleAccountMenu(open){
  const menu=$('#accountMenu'),btn=$('#workspaceSwitcher');
  if(!menu)return;
  const next=(open===undefined)?menu.classList.contains('hidden'):Boolean(open);
  if(next)renderAccountMenu();
  menu.classList.toggle('hidden',!next);
  btn?.setAttribute('aria-expanded',next?'true':'false');
  if(next)positionAccountMenu();
}
function deleteAccount(id){
  const x=S.users.find(u=>u.id===id);
  if(!x){toast(tr('账户不存在'));return}
  if(x.id===S.user.id){toast(tr('不能删除当前登录账户'));return}
  if(x.id==='superadmin'){toast(tr('内置 superadmin 账户不能删除'));return}
  const role=roleOf(x),roleLabel=role==='superadmin'?'Super Admin':role==='admin'?'Admin':tr('普通用户');
  openModal(`<div class="eyebrow danger-eyebrow">${tr('危险操作 · 不可撤销')}</div><h2>${tr('删除账户「{0}」',escapeHTML(x.id))}</h2><div class="danger-panel"><p>${tr('删除后无法恢复。')}</p><ul class="danger-impact"><li>${tr('权限组：')}<strong>${roleLabel}</strong></li><li>${tr('若该账户仍负责进行中的项目或有未完成任务，删除会被拒绝，请先转交职责')}</li><li>${tr('历史审计记录会保留')}</li></ul></div><label class="danger-check"><input type="checkbox" id="deleteAccountAck"> ${tr('我已了解该账户及其个人数据将被永久删除，且无法恢复')}</label><label class="danger-confirm">${tr('请输入账户名')} <code>${escapeHTML(x.id)}</code> ${tr('以继续')}<input id="deleteAccountConfirm" autocomplete="off" spellcheck="false" placeholder="${escapeHTML(x.id)}"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="danger-btn" id="confirmDeleteAccount" disabled>${tr('永久删除账户')}</button></div>`);
  const ack=$('#deleteAccountAck'),text=$('#deleteAccountConfirm'),btn=$('#confirmDeleteAccount');
  const sync=()=>{btn.disabled=!(ack.checked&&text.value.trim()===x.id)};
  ack.onchange=sync;text.oninput=sync;
  $('#cancelAction').onclick=closeModal;
  btn.onclick=async()=>{
    if(btn.disabled)return;
    btn.disabled=true;btn.textContent=tr('正在删除…');
    try{await act('account.delete',{id:x.id,confirm:text.value.trim()});closeModal();toast(tr('账户已删除'))}
    catch(e){btn.disabled=false;btn.textContent=tr('永久删除账户')}
  };
}
async function act(action,data,{quiet=false}={}){try{await api('/api/action',{action,data});await refresh();if(!quiet)toast(tr('操作已完成'))}catch(e){toast(e.message);throw e}}
function restorePanelFocus(target){
  if(target?.isConnected&&!target.closest('.hidden'))target.focus?.({preventScroll:true});
}
function openModal(html){flushFormDraft();cancelMeetingOpen();meetingStopLive().catch(e=>toast(e.message));
  if($('#modalBackdrop')?.classList.contains('hidden'))UI.modalReturnFocus=document.activeElement;UI.docDirty=false;
  if(UI.briefSource){UI.briefSource.closest('.archive-file')?.classList.remove('is-out');UI.briefSource=null}
  UI.briefTyping?.finish();UI.briefTyping=null;
  document.querySelectorAll('.brief-folder').forEach(x=>x.remove());
  ['#modalBackdrop','#modalBackdrop .modal','#modalContent'].forEach(s=>$(s)?.getAnimations?.().forEach(a=>a.cancel()));
  $('#modalContent').innerHTML=html;
  if($('#modalContent').dataset)delete $('#modalContent').dataset.meetingId;
  $('#modalBackdrop .modal')?.classList?.remove('is-wide','is-flown');$('#modalBackdrop')?.classList.remove('hidden')};
function closeModal(){if(UI.docDirty&&!confirm(tr('修改还没保存，确定关闭？')))return;flushFormDraft(true);cancelMeetingOpen();
  meetingStopLive().catch(e=>toast(e.message));UI.docDirty=false;if(typeof foldBrief==='function'&&foldBrief())return;
  $('#modalBackdrop')?.classList.add('hidden');restorePanelFocus(UI.modalReturnFocus)};
function closeDrawer(){$('#taskDrawer').classList.add('hidden');restorePanelFocus(UI.drawerReturnFocus)}
/* Form text boxes grow and shrink with what is typed, up to the max-height that
   styles.css gives them, and 展开 opens one up to most of the screen for reading
   a long description through. */
function fitTextarea(el) {
  if (!el?.style || el.closest?.('.voice-field')?.classList.contains('is-expanded')) {
    return;
  }
  const limit = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(el).maxHeight) : NaN;
  el.style.height = 'auto';
  const wanted = el.scrollHeight + 2;
  el.style.height = `${Number.isFinite(limit) ? Math.min(limit, wanted) : wanted}px`;
}
/* 草稿箱: what is typed into a form is kept on the server as it is typed, so
   closing the form by accident (a click outside, Esc, 取消) loses nothing. The
   same form opens with its draft filled back in, and 草稿箱 lists every one.
   A form registers here with the actions that submit it; once one of them goes
   through, its draft is gone. */
const DRAFT_FIELDS = 'textarea[id]:not([readonly]):not([disabled]), select[id]:not([disabled]), '
  + 'input[id]:not([disabled]):not([readonly])'
  + ':is(:not([type]),[type="text"],[type="date"],[type="time"],[type="number"])';
const DRAFT_DELAY = 700;
const DRAFT_PREVIEW_CHARS = 160;
// A browser sends at most 64 KB while a page closes; a bigger draft waits here.
const DRAFT_KEEPALIVE_BYTES = 60000;
const DRAFT_STASH = 'hola-form-draft-stash';
// Without TextEncoder, size a draft as if every UTF-16 unit took the most UTF-8 bytes it can.
const UTF8_MAX_BYTES_PER_UNIT = 3;
const OPEN_TASK = ['todo', 'doing'];
const DONE_TASK = ['done'];
function taskIn(id, statuses) {
  return S.tasks.find(x => x.id === id && statuses.includes(x.status));
}
function pendingRequest(list, id) {
  return (list ?? []).some(r => r.id === id && r.status === 'pending');
}
function projectIn(id, status) {
  return S.projects.some(p => p.id === id && p.status === status);
}
/* Each opener reopens its form only while the work it is about can still take it. */
const DRAFT_OPENERS = {
  newTask: (projectId, initialDate) => newTask(projectId || undefined, initialDate || undefined),
  newProject: () => newProject(),
  editTaskRequest: (id, direct) => editTaskRequest(id, Boolean(direct)),
  projectSettings: id => projectSettings(id),
  complete: id => {
    const t = taskIn(id, OPEN_TASK);
    if (t) {
      complete(t);
    }
  },
  editCompletion: id => {
    const t = taskIn(id, DONE_TASK);
    if (t) {
      editCompletion(t);
    }
  },
  defer: id => {
    const t = taskIn(id, OPEN_TASK);
    if (t) {
      defer(t);
    }
  },
  reopenTask: id => {
    const t = taskIn(id, DONE_TASK);
    if (t) {
      reopenTask(t);
    }
  },
  requestProjectCompletion: id => requestProjectCompletion(id),
  fixedTask: () => fixedTask(),
  reviewTaskEdit: (id, notice) => {
    if (pendingRequest(S.editRequests, id)) {
      reviewTaskEdit(id, false, notice || undefined);
    }
  },
  reviewTaskRequest: id => {
    if (canReviewTaskRequest(taskRequestById(id))) {
      reviewTaskRequest(id, false);
    }
  },
  reviewProjectCompletion: (id, notice) => {
    if (projectIn(id, 'pending_completion')) {
      reviewProjectCompletion(id, false, notice || undefined);
    }
  },
  reviewProject: (id, notice) => {
    if (projectIn(id, 'pending')) {
      reviewProject(id, false, notice || undefined);
    }
  },
};
// Keep failed or in-flight writes by account so a state refresh cannot erase
// a draft that the server has not acknowledged yet.
const pendingFormDrafts = new Map();
// This page's name and the number of its last draft write, so the server can tell a late write from it.
const DRAFT_WRITER = (typeof crypto === 'object' && crypto.randomUUID?.())
  || `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
let draftSeq = 0;
// Each save of a form's draft here bumps its generation, so a late submit can
// tell whether the draft it would clear has been written again since.
const draftGenerations = new Map();
function formDraftSlot(owner, key) {
  return JSON.stringify([owner, key]);
}
function restorePendingFormDrafts() {
  for (const write of pendingFormDrafts.values()) {
    if (write.owner !== S.user?.id) {
      continue;
    }
    if (write.row) {
      keepFormDraftLocally(write.row);
    } else {
      dropFormDraftLocally(write.key);
    }
  }
}
function resetFormDraft() {
  if (!UI.formDraft) {
    return;
  }
  clearTimeout(UI.formDraft.timer);
  UI.formDraft = null;
  $('#modalBackdrop')?.classList.add('hidden');
}
function formDraftOf(key) {
  return (S.formDrafts ?? []).find(d => d.key === key);
}
function updateDraftList() {
  renderDraftCount();
  if (UI.view === 'drafts') {
    renderDrafts();
  }
}
function keepFormDraftLocally(row) {
  S.formDrafts = [row, ...(S.formDrafts || []).filter(d => d.key !== row.key)];
  updateDraftList();
}
function dropFormDraftLocally(key) {
  S.formDrafts = (S.formDrafts || []).filter(d => d.key !== key);
  updateDraftList();
}
/* A form can capture and restore choices outside its input fields with
   `extra` and `restore`. */
function draftForm(key, {title, label = '', reopen, submit, extra = null, restore = null}) {
  const root = $('#modalContent');
  if (!root?.querySelectorAll) {
    return;
  }
  const fields = [...root.querySelectorAll(DRAFT_FIELDS)];
  if (!fields.length) {
    return;
  }
  const initial = Object.fromEntries(fields.map(el => [el.id, el.value]));
  const [fn, ...args] = reopen;
  const f = {
    owner: S.user?.id, key, title, label, submit, fields, initial, extra, restore,
    reopen: {fn, args: args.map(a => a ?? null)},
    initialExtra: extra?.(),
    timer: null, saved: false, dirty: false, submitting: false,
    generation: draftGenerations.get(key) ?? 0,
  };
  UI.formDraft = f;
  bindFormDrafts(root);
  const old = formDraftOf(key);
  if (!old) {
    return;
  }
  const values = old.fields ?? {};
  restore?.(values);
  fields.forEach(el => {
    const value = values[el.id];
    if (typeof value !== 'string' || value === el.value) {
      return;
    }
    if (el.options && ![...el.options].some(o => o.value === value)) {
      return;
    }
    el.value = value;
    if (el.tagName === 'TEXTAREA') {
      fitTextarea(el);
    }
  });
  f.saved = true;
  root.insertAdjacentHTML('afterbegin', [
    `<div class="draft-restored" id="draftRestored">${icon('file-pen')}`,
    `<span>${tr('已恢复草稿 ·')} ${escapeHTML(relTime(old.updatedAt))}</span>`,
    `<button type="button" class="text-btn" id="discardDraft">${tr('丢弃')}</button></div>`,
  ].join(''));
  const discard = $('#discardDraft');
  if (discard) {
    discard.onclick = () => discardRestoredDraft(f);
  }
}
function bindFormDrafts(root) {
  if (UI.formDraftBound) {
    return;
  }
  UI.formDraftBound = true;
  const schedule = e => {
    const f = UI.formDraft;
    if (!f || !f.fields.includes(e.target)) {
      return;
    }
    f.dirty = true;
    clearTimeout(f.timer);
    f.timer = setTimeout(saveFormDraft, DRAFT_DELAY);
  };
  root.addEventListener('input', schedule);
  root.addEventListener('change', schedule);
  root.addEventListener('click', e => {
    if (e.target.closest?.('.task-kind-btn')) {
      schedule({target: UI.formDraft?.fields[0]});
    }
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      if (UI.formDraft?.timer) {
        saveFormDraft({keepalive: true});
      }
    });
  }
}
/* 丢弃 puts the form back the way it opened, typed text and choices alike. */
function discardRestoredDraft(f) {
  f.fields?.forEach(el => {
    el.value = f.initial?.[el.id] ?? '';
    if (el.tagName === 'TEXTAREA') {
      fitTextarea(el);
    }
  });
  f.restore?.(f.initialExtra ?? {});
  $('#draftRestored')?.remove();
  f.dirty = false;
  discardFormDraft(f).catch(e => toast(e.message));
}
function writeFormDraft(owner, key, row, options = {}) {
  const slot = formDraftSlot(owner, key);
  const previous = pendingFormDrafts.get(slot);
  const write = {owner, key, row}, seq = ++draftSeq;
  pendingFormDrafts.set(slot, write);
  const send = async () => {
    if (S.user?.id !== owner) {
      throw new Error(tr('账户已切换，草稿尚未同步'));
    }
    const action = row ? 'formdraft.save' : 'formdraft.delete';
    const data = {...(row ?? {key}), owner, writer: DRAFT_WRITER, seq};
    if (options.keepalive && row && !fitsKeepalive({action, data})) {
      stashFormDraft(owner, {...row, writer: DRAFT_WRITER, seq});
      return;
    }
    const saved = await api('/api/action', {action, data}, options);
    if (pendingFormDrafts.get(slot) !== write) {
      return;
    }
    pendingFormDrafts.delete(slot);
    dropStashedFormDraft(owner, key);
    if (row && S.user?.id === owner && saved.key === key) {
      keepFormDraftLocally(saved);
    }
  };
  // A closing page cannot wait for the write before it, so that one goes at once.
  write.promise = previous && !options.keepalive ? previous.promise.catch(() => {}).then(send) : send();
  return write.promise;
}
function discardFormDraft(f) {
  clearTimeout(f.timer);
  f.timer = null;
  f.saved = false;
  const old = formDraftOf(f.key), slot = formDraftSlot(f.owner, f.key);
  if (S.user?.id === f.owner) {
    dropFormDraftLocally(f.key);
  }
  // A delete that does not go through puts the draft back, as 草稿箱's 删除 does.
  return writeFormDraft(f.owner, f.key, null).catch(e => {
    if (pendingFormDrafts.get(slot)?.row === null) {
      pendingFormDrafts.delete(slot);
      if (old && S.user?.id === f.owner) {
        keepFormDraftLocally(old);
      }
    }
    throw e;
  });
}
function saveFormDraft(options = {}) {
  const f = UI.formDraft;
  if (!f || f.owner !== S.user?.id) {
    return null;
  }
  clearTimeout(f.timer);
  f.timer = null;
  f.dirty = false;
  // Typed text goes first, so 草稿箱 previews it rather than a chosen project or date.
  const ordered = [...f.fields].sort((a, b) => Number(!isTextField(a)) - Number(!isTextField(b)));
  const typed = Object.fromEntries(ordered.map(el => [el.id, el.value]));
  const extra = f.extra?.() ?? {};
  const changed = Object.keys(typed).some(k => typed[k] !== f.initial[k])
    || Object.keys(extra).some(k => extra[k] !== f.initialExtra?.[k]);
  if (!changed) {
    if (f.saved || formDraftOf(f.key)) {
      discardFormDraft(f).catch(e => toast(e.message));
    }
    return null;
  }
  const now = new Date().toISOString();
  const row = {key: f.key, title: f.title, label: f.label, fields: {...typed, ...extra}, reopen: f.reopen,
    updatedAt: now, typedAt: now};
  keepFormDraftLocally(row);
  f.saved = true;
  f.generation = (draftGenerations.get(f.key) ?? 0) + 1;
  draftGenerations.set(f.key, f.generation);
  const saved = writeFormDraft(f.owner, f.key, row, options);
  saved.catch(() => {
    if (UI.formDraft === f) {
      toast(tr('草稿未同步，请检查网络后重试'));
    }
  });
  return saved;
}
function isTextField(el) {
  return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (!el.type || el.type === 'text'));
}
function fitsKeepalive(body) {
  const text = JSON.stringify(body);
  const bytes = typeof TextEncoder === 'function'
    ? new TextEncoder().encode(text).length
    : text.length * UTF8_MAX_BYTES_PER_UNIT;
  return bytes <= DRAFT_KEEPALIVE_BYTES;
}
/* A draft too big to send while the page closes is kept in this browser and
   sent the next time the same account opens the app, unless that draft has
   been written again since. */
function stashFormDraft(owner, row) {
  try {
    localStorage.setItem(DRAFT_STASH, JSON.stringify({owner, row}));
  } catch (_) {
    // Storage full or blocked; the draft saved at the last pause remains.
  }
}
function readStashedFormDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_STASH) ?? 'null');
  } catch (_) {
    return null;
  }
}
function dropStashedFormDraft(owner, key) {
  const stash = readStashedFormDraft();
  if (!stash || stash.owner !== owner || stash.row?.key !== key) {
    return;
  }
  try {
    localStorage.removeItem(DRAFT_STASH);
  } catch (_) {
    // Blocked storage holds nothing to drop.
  }
}
function sendStashedFormDraft() {
  if (!S.user || UI.draftStashChecked === S.user.id) {
    return;
  }
  UI.draftStashChecked = S.user.id;
  const stash = readStashedFormDraft();
  // Another account's stash waits for that account.
  if (!stash || stash.owner !== S.user.id || !stash.row?.key) {
    return;
  }
  const {owner, row} = stash;
  dropStashedFormDraft(owner, row.key);
  const current = formDraftOf(row.key);
  // A copy the same page wrote later wins; from another page, the later typing does.
  const samePage = Boolean(current?.writer) && current.writer === row.writer;
  const newer = current && (samePage
    ? (current.seq ?? 0) >= (row.seq ?? 0)
    : Boolean(current.typedAt && row.typedAt && current.typedAt >= row.typedAt));
  if (newer) {
    return;
  }
  keepFormDraftLocally(row);
  writeFormDraft(owner, row.key, row).catch(e => toast(tr('草稿未同步：{0}', e.message)));
}
/* Leaving a form (closing it, or another dialog taking its place) keeps what
   was typed; closing says whether it was kept. A form whose submit is still on
   its way says nothing, since its draft goes once the submit lands. */
async function flushFormDraft(closing = false) {
  const f = UI.formDraft;
  if (!f) {
    return;
  }
  // Nothing new typed: report on the save already on its way, if there is one.
  // A delete on its way (after 丢弃) keeps nothing, so it is not reported.
  const write = pendingFormDrafts.get(formDraftSlot(f.owner, f.key));
  const pending = write?.row ? write.promise : null;
  const saved = f.timer || f.dirty ? saveFormDraft() : pending || null;
  UI.formDraft = null;
  const speak = closing && !f.submitting && S.user?.id === f.owner;
  if (!saved) {
    if (speak && f.saved) {
      toast(tr('已存为草稿，可在草稿箱继续'));
    }
    return;
  }
  try {
    await saved;
    if (speak) {
      toast(tr('已存为草稿，可在草稿箱继续'));
    }
  } catch (_) {
    if (S.user?.id === f.owner) {
      toast(tr('草稿未同步，可在本页草稿箱继续编辑'));
    }
  }
}
/* Once a form's submit has gone through, its draft goes, even if the form was
   closed while the request was on its way, unless the same form has been
   opened again and holds newer text. The delete is not waited for. */
async function draftSubmitted(path, body, f) {
  if (!f || f.owner !== S.user?.id || path !== '/api/action' || !f.submit?.includes(body?.action)) {
    return;
  }
  const target = f.reopen?.fn === 'newTask' ? null : f.reopen?.args?.[0];
  if (target && body.data?.id !== target) {
    return;
  }
  if (f.key?.includes('.reject:') && body.data?.accept !== false) {
    return;
  }
  if (UI.formDraft === f) {
    UI.formDraft = null;
  }
  clearTimeout(f.timer);
  f.timer = null;
  if ((draftGenerations.get(f.key) ?? 0) !== f.generation) {
    return;
  }
  // The same form opened again, with nothing new saved, no longer holds a draft.
  if (UI.formDraft?.key === f.key) {
    UI.formDraft.saved = false;
    $('#draftRestored')?.remove();
  }
  if (f.saved || formDraftOf(f.key)) {
    discardFormDraft(f).catch(() => toast(tr('提交成功，草稿删除未同步')));
  }
}
function renderDraftCount() {
  sendStashedFormDraft();
  const n = (S.formDrafts || []).length, badge = $('#draftCount');
  if (badge) {
    badge.textContent = n;
    badge.classList.toggle('hidden', !n);
  }
}
function openFormDraft(key) {
  const d = formDraftOf(key), open = DRAFT_OPENERS[d?.reopen?.fn];
  if (!d || !open) {
    toast(tr('这份草稿打不开了'));
    return;
  }
  open(...(d.reopen.args ?? []));
  if (UI.formDraft?.key !== key) {
    toast(tr('原来的任务或项目已不在，可以删除这份草稿'));
  }
}
function draftPreview(d) {
  const typed = Object.entries(d.fields ?? {}).filter(([k]) => !k.startsWith('_')).map(([, v]) => String(v));
  return (typed.find(v => v.trim()) || '').slice(0, DRAFT_PREVIEW_CHARS);
}
function renderDrafts() {
  const list = $('#draftList');
  if (!list) {
    return;
  }
  const drafts = S.formDrafts || [];
  $('#draftsView .eyebrow').textContent = tr('草稿箱 · {0} 份', drafts.length);
  $('#draftEmpty')?.classList.toggle('hidden', drafts.length > 0);
  list.innerHTML = drafts.map(d => [
    `<article class="draft-row" data-key="${escapeHTML(d.key)}"><div class="draft-main">`,
    `<strong>${escapeHTML(d.title)}</strong>${d.label ? `<small>${escapeHTML(d.label)}</small>` : ''}`,
    `<p>${escapeHTML(draftPreview(d))}</p></div>`,
    `<time title="${escapeHTML(d.updatedAt ?? '')}">${escapeHTML(relTime(d.updatedAt))}</time>`,
    '<div class="draft-actions">',
    `<button type="button" class="secondary-btn draft-open">${tr('继续编辑')}</button>`,
    `<button type="button" class="ghost-btn draft-delete">${tr('删除')}</button></div></article>`,
  ].join('')).join('');
  list.querySelectorAll('.draft-row').forEach(row => {
    const open = row.querySelector('.draft-open'), button = row.querySelector('.draft-delete');
    if (!open || !button) {
      return;
    }
    open.onclick = () => openFormDraft(row.dataset.key);
    button.onclick = async () => {
      if (!confirm(tr('删除这份草稿？'))) {
        return;
      }
      const owner = S.user?.id, key = row.dataset.key;
      button.disabled = true;
      try {
        await writeFormDraft(owner, key, null);
        if (S.user?.id === owner) {
          dropFormDraftLocally(key);
        }
      } catch (e) {
        const slot = formDraftSlot(owner, key);
        if (pendingFormDrafts.get(slot)?.row === null) {
          pendingFormDrafts.delete(slot);
        }
        button.disabled = false;
        toast(e.message);
      }
    };
  });
}
function newTask(projectId,initialDate){
  const admin=Boolean(S.user.admin),paths=taskProjects(),projects=paths.map(x=>x.p),temp=tempTaskMode(),locked=typeof projectId==='string';
  if(locked&&!projects.some(p=>p.id===projectId)){toast(tr('原项目已不可新建任务'));return}
  if(!projects.length&&temp==='none'){toast(tr('你所在的规则组不能新建任务'));return}
  const initial=projects.find(p=>p.id===projectId)?.id||projects[0]?.id;
  /* 临时任务 belongs to no project. Like a small project, whoever writes it may
     keep it or hand it to any member (unless their rule group keeps 临时任务 to
     oneself, which drops 指派给), and follows it from then on. Each kind
     and project is offered only where the account's rule group allows it;
     where it needs approval the dialog turns into a request. */
  let kind=projects.length?'project':'adhoc',serverMinutes=null,ask=0;
  const kinds=locked?'':`<div class="task-kind-switch">${projects.length?tr('<button type="button" class="task-kind-btn" data-kind="project">项目任务</button>'):''}${temp!=='none'?tr('<button type="button" class="task-kind-btn" data-kind="adhoc">临时任务</button>'):''}${admin?tr('<button type="button" class="task-kind-btn" id="kindFixedTask">固定任务</button>'):''}</div>`;
  const taskDay=initialDate||(UI.view==='dayDetail'?UI.detailDate:displayDay());
  const projectOptions=projects.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('');
  openModal([
    `<h2 id="taskDialogTitle">${tr('新任务')}</h2>${kinds}<label class="form-field" id="taskProjectField">${tr('所属项目')}`,
    `<select id="taskProject" ${locked?'disabled':''}>${projectOptions}</select></label>`,
    `<label class="form-field">${tr('任务名称')}<input id="taskName" maxlength="120"></label>`,
    `<label class="form-field">${tr('任务描述')}<textarea id="taskDesc"></textarea></label>`,
    `<label class="form-field" id="taskAssigneeField">${tr('指派给')}<select id="taskAssignee"></select>`,
    '<div id="taskAssigneeLoad" class="assignee-load-hint"></div></label><div class="task-form-grid">',
    `<label class="form-field">${tr('安排日期')}`,
    `<input id="taskDate" type="date" max="${DATE_HORIZON}" value="${taskDay}"></label>`,
    `<label class="form-field">${tr('结束日期')}<input id="taskDeadline" type="date" max="${DATE_HORIZON}"></label>`,
    `<label class="form-field">${tr('时间')}<input id="taskTime" type="time" value="09:00"></label>`,
    `<label class="form-field">${tr('预计时长')}<input id="taskDuration" type="number" min="1" max="1440" value="30"></label>`,
    `<label class="form-field">${tr('优先级')}<select id="taskPriority"><option>P0</option><option selected>P1</option>`,
    '<option>P2</option></select></label></div>',
    `<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button>`,
    `<button class="primary-btn" id="confirmTask">${tr('创建任务')}</button></div>`,
  ].join(''));
  const project=()=>kind==='project'?projects.find(p=>p.id===$('#taskProject').value):null;
  const mode=()=>kind==='project'?paths.find(x=>x.p.id===$('#taskProject').value)?.mode:temp;
  const candidates=()=>kind==='adhoc'&&tempSelfOnly()?S.users.filter(u=>u.id===S.user.id)
    :kind==='adhoc'?S.users.filter(u=>u.active&&!u.admin).sort((a,
    b)=>(b.id===S.user.id)-(a.id===S.user.id)):projectAssignees(project());
  /* The load beside each name is what that person already has inside this
     task's own dates, across every project, not their whole backlog. */
  const span=()=>{const start=$('#taskDate').value||S.today,end=$('#taskDeadline').value;return [start,end&&end>start?end:start]};
  const hours=mins=>Math.round(mins/60*10)/10;
  const load=(id,period)=>{const mine=memberLoad(id,period);return {count:mine.count,mins:serverMinutes&&id in serverMinutes?serverMinutes[id]:mine.mins}};
  /* A member holds only their own tasks, so another person's load is unknown
     outside the projects they run; it is left out rather than shown as 0. */
  const known=id=>admin||id===S.user.id||Boolean(serverMinutes&&id in serverMinutes);
  const render=()=>{
    const users=candidates(),p=project(),picked=$('#taskAssignee').value,period=span();
    $('#taskAssignee').innerHTML=users.map(u=>`<option value="${escapeHTML(u.id)}">${escapeHTML(nameOf(u.id))}`
      +`${p&&u.id===p.owner?' · Owner':''}${!p&&u.id===S.user.id&&!admin?tr(' · 自己'):''}${known(u.id)?` · `
      +`${hours(load(u.id,period).mins)}h`:''}</option>`).join('');
    if(users.some(u=>u.id===picked))$('#taskAssignee').value=picked;
    const who=$('#taskAssignee').value,mine=who?load(who,period):null,[start,end]=period;
    $('#taskAssigneeLoad').textContent=!users.length?tr('项目暂无成员'):known(who)?`${fmt(start)}`
      +tr('{0} 已安排 {1}h · {2} 项',end!==start?' – '+fmt(end):'',hours(mine.mins),mine.count):`${tr('指派后')} `
      +tr('{0} 会收到通知，进度会回到你这里',nameOf(who));
    $('#confirmTask').disabled=!users.length;
    const asking=mode()==='approval';
    $('#taskDialogTitle').textContent=asking?tr('申请任务'):tr('新任务');$('#confirmTask').textContent=asking?tr('提交申请'):tr('创建任务');
  };
  /* An Owner only sees their own projects' tasks, so their numbers come from
     the server; an admin already holds every task. */
  const recount=()=>{
    serverMinutes=null;render();const p=project();if(admin||!p||p.owner!==S.user.id)return;
    const [start,end]=span(),mine=++ask,dialog=$('#taskDialogTitle');
    api('/api/action',{action:'project.member_loads',data:{id:p.id,start,end}}).then(r=>{
      if(mine!==ask||dialog!==$('#taskDialogTitle')||$('#modalBackdrop')?.classList.contains('hidden'))return;
      serverMinutes=r.minutes||null;render()}).catch(()=>{});
  };
  const setKind=k=>{kind=k;$$('.task-kind-btn[data-kind]').forEach(b=>b.classList.toggle('active',b.dataset.kind===k));
    $('#taskProjectField').classList.toggle('hidden',k!=='project');
    $('#taskAssigneeField')?.classList.toggle('hidden',k==='adhoc'&&tempSelfOnly());
    recount();
  };
  $$('.task-kind-btn[data-kind]').forEach(b=>b.onclick=()=>setKind(b.dataset.kind));
  $('#kindFixedTask')?.addEventListener('click',fixedTask);
  if(initial)$('#taskProject').value=initial;
  const _sd=$('#taskDate'),_dl=$('#taskDeadline');const _syncDl=()=>{_dl.min=_sd.value||S.today;if(_dl.value&&_dl.value<_dl.min)_dl.value=''};
  _sd.onchange=()=>{_syncDl();recount()};_dl.onchange=recount;$('#taskProject').onchange=recount;$('#taskAssignee').onchange=render;_syncDl();
  setKind(kind);$('#cancelAction').onclick=closeModal;
  draftForm(`task.new${locked ? `:${projectId}` : ''}`, {
    title: tr('新任务'),
    label: locked ? projectNameById(projectId) : '',
    reopen: ['newTask', locked ? projectId : null, initialDate],
    submit: ['task.create'],
    extra: () => ({_kind: kind, _project: kind === 'project' ? $('#taskProject').value : ''}),
    restore: f => {
      if (!locked && projects.some(p => p.id === f._project)) {
        $('#taskProject').value = f._project;
      }
      if ((f._kind === 'adhoc' && temp !== 'none') || (f._kind === 'project' && projects.length)) {
        setKind(f._kind);
      }
    },
  });
  $('#confirmTask').onclick=async()=>{if(!$('#taskName').value.trim()){toast(tr('请填写任务名称'));return}const _start=$('#taskDate').value,_end=$('#taskDeadline').value;if(_end&&_end<_start){toast(tr('结束日期不能早于安排日期'));return}const data={name:$('#taskName').value,desc:$('#taskDesc').value,projectId:kind==='project'?$('#taskProject').value:null,assignee:$('#taskAssignee').value,date:$('#taskDate').value,deadline:$('#taskDeadline').value||null,time:$('#taskTime').value,duration:Number($('#taskDuration').value),priority:$('#taskPriority').value};try{const r=await api('/api/action',{action:'task.create',data});await refresh();toast(r?.requested?tr('申请已提交，等待审批'):tr('任务已创建'));closeModal()}catch(e){toast(e.message)}};
}
function editTaskAssignment(id){
  const t=S.tasks.find(t=>t.id===id),p=S.projects.find(p=>p.id===t?.projectId);
  if(!canManageProject(p)||p.status!=='active'||!['todo','doing'].includes(t.status)){toast(tr('当前任务不可调整'));return}
  const users=projectAssignees(p);
  openModal(`<div class="eyebrow">${escapeHTML(p.name)}</div><h2>${tr('调整任务指派')}</h2><p>${escapeHTML(t.name)}<br>${tr('当前负责人：{0}。调整后将通知原负责人及新负责人。',escapeHTML(nameOf(t.assignee)))}</p><label class="form-field">${tr('指派给')}<select id="assignmentUser">${users.map(u=>`<option value="${escapeHTML(u.id)}">${escapeHTML(nameOf(u.id))}${u.id===p.owner?' · Owner':''}</option>`).join('')}</select></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmAssignment" ${users.length?'':'disabled'}>${tr('保存指派并通知')}</button></div>`);
  if(users.some(u=>u.id===t.assignee))$('#assignmentUser').value=t.assignee;
  $('#cancelAction').onclick=closeModal;$('#confirmAssignment').onclick=async()=>{const assignee=$('#assignmentUser').value;if(assignee===t.assignee){toast(tr('负责人未变更'));return}try{await act('task.update',{id,assignee});closeModal();if(!$('#taskDrawer').classList.contains('hidden'))openDrawer(id)}catch(e){}};
}
function newProject(){
  /* An admin names the Owner; anyone else owns what they start. Collaborators
     join at once (once approved, where the rule group asks for that) and can
     leave from inside the project. */
  const admin=S.user?.admin,asking=projectMode()==='approval',ownerOptions=S.users.filter(u=>u.active&&!u.admin),owner=admin?`<label class="form-field">${tr('项目 Owner')}<select id="projectOwner">${ownerOptions.map(u=>`<option value="${escapeHTML(u.id)}">${escapeHTML(nameOf(u.id))}</option>`).join('')}</select></label>`:'';
  const pool=admin?ownerOptions:ownerOptions.filter(u=>u.id!==S.user.id);
  const collaborators=pool.length?`<fieldset class="member-checkboxes"><legend>${asking?tr('协作者（审批通过后加入）'):tr('协作者（直接加入项目）')}`
    +`</legend>${pool.map(u=>`<label><input type="checkbox" name="projectMember" value="${escapeHTML(u.id)}"> <strong>`
    +`${escapeHTML(nameOf(u.id))}</strong></label>`).join('')}</fieldset>`:'';
  openModal(`<div class="eyebrow">${tr('项目空间 · {0}',admin?tr('superadmin 创建'):asking?tr('成员申请'):tr('成员创建'))}</div><h2>${asking?tr('申请项目'):tr('新项目')}</h2><label class="form-field">${tr('项目名称')}<input id="projectName" maxlength="120"></label><label class="form-field">${tr('项目描述')}<textarea id="projectDesc"></textarea></label>${owner}<div class="project-date-fields"><label class="form-field">${tr('开始日期')}<input id="projectStart" type="date" max="${DATE_HORIZON}" value="${S.today}"></label><label class="form-field">${tr('截止日期（可留空）')}<input id="projectEnd" type="date" min="${S.today}" max="${DATE_HORIZON}"></label></div>${collaborators}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmProject">${asking?tr('提交申请'):tr('创建项目')}</button></div>`);
  draftForm('project.new', {title: asking ? tr('申请项目') : tr('新项目'), reopen: ['newProject'],
    submit: ['project.create']});
  $('#cancelAction').onclick=closeModal;$('#projectStart').onchange=()=>$('#projectEnd').min=$('#projectStart').value;
  /* The Owner is on the project by definition, so they are never offered as a collaborator. */
  const syncOwner=()=>{const owner=$('#projectOwner')?.value;$$('input[name="projectMember"]').forEach(x=>{const own=x.value===owner;if(own)x.checked=false;x.closest('label').classList.toggle('hidden',own)})};
  if(admin){$('#projectOwner').onchange=syncOwner;syncOwner()}
  $('#confirmProject').onclick=async()=>{const start=$('#projectStart').value,end=$('#projectEnd').value;if(!$('#projectName').value.trim()||!start){toast(tr('请填写项目名称和开始日期'));return}if(end&&end<start){toast(tr('截止日期不能早于开始日期'));return}const data={name:$('#projectName').value,desc:$('#projectDesc').value,start,end,cycle:end?'range':'infinite',members:$$('input[name="projectMember"]:checked').map(x=>x.value)};if(admin)data.owner=$('#projectOwner').value;try{const p=await api('/api/action',{action:'project.create',data});await refresh();toast(p?.status==='pending'?tr('申请已提交，等待审批'):tr('项目已创建'));closeModal()}catch(e){toast(e.message)}};
}
function fixedTask(){
  const users=S.users.filter(u=>u.active&&!u.admin),days=[tr('周一'),tr('周二'),tr('周三'),tr('周四'),tr('周五'),tr('周六'),tr('周日')];
  const monthOptions=Array.from({length:31},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===1?'selected':''}>${tr('{0} 号',n)}</option>`).join('');
  openModal(`<div class="eyebrow">${tr('Super Admin · 固定任务')}</div><h2>${tr('发布固定安排')}</h2>
    <label class="form-field">${tr('任务名称')}<input id="repeatName" maxlength="120" required></label>
    <label class="form-field">${tr('所属项目（可选）')}<select id="repeatProject"><option value="">${tr('不挂项目')}</option>${S.projects.filter(p=>p.status==='active').map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('')}</select></label>
    <fieldset class="member-checkboxes" id="repeatUsers"><legend>${tr('安排给（可多选）')}</legend>${users.map(u=>`<label><input type="checkbox" name="repeatUser" value="${escapeHTML(u.id)}"> ${escapeHTML(u.id)}</label>`).join('')}</fieldset>
    <label class="form-field">${tr('周期')}<select id="repeatFreq"><option value="daily">${tr('每天')}</option><option value="weekly" selected>${tr('每周')}</option><option value="monthly">${tr('每月')}</option><option value="workdays">${tr('工作日')}</option><option value="dates">${tr('指定日期')}</option></select></label>
    <label class="form-field" id="repeatEveryField">${tr('间隔')}<select id="repeatEvery"><option value="1">${tr('每 1 周')}</option><option value="2">${tr('每 2 周（双周）')}</option><option value="3">${tr('每 3 周')}</option><option value="4">${tr('每 4 周')}</option></select></label>
    <fieldset class="member-checkboxes" id="repeatWeekdayFields"><legend>${tr('每周几执行')}</legend>${days.map((d,i)=>`<label><input type="checkbox" name="repeatWeekday" value="${i}" ${i<5?'checked':''}> ${d}</label>`).join('')}</fieldset>
    <label class="form-field hidden" id="repeatMonthField">${tr('每月执行日')}<select id="repeatMonthDay">${monthOptions}</select></label>
    <label class="form-field hidden" id="repeatDatesField">${tr('指定日期（逗号分隔）')}<input id="repeatDates" placeholder="2026-09-20, 2026-10-01"></label>
    <label class="form-field">${tr('持续天数')}<input id="repeatSpan" type="number" min="1" max="30" value="1"></label>
    <label class="form-field">${tr('开始日期')}<input id="repeatStart" type="date" max="${DATE_HORIZON}" value="${S.today}"></label>
    <label class="form-field">${tr('结束日期（可留空）')}<input id="repeatEnd" type="date" max="${DATE_HORIZON}"></label>
    <label class="form-field">${tr('开始时间')}<input id="repeatTime" type="time" value="09:00"></label>
    <label class="form-field">${tr('每次时长')}<input id="repeatDuration" type="number" min="1" max="1440" value="30"></label>
    <label class="form-field">${tr('本次挖空日期（可留空）')}<input id="repeatSkipDates" placeholder="2026-10-01, 2026-10-02"></label>
    <div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmRepeat">${tr('保存固定任务')}</button></div>`);
  draftForm('repeat.new', {title: tr('发布固定安排'), reopen: ['fixedTask'], submit: ['repeat.create']});
  const sync=()=>{
    const freq=$('#repeatFreq').value;
    $('#repeatEveryField').classList.toggle('hidden',freq!=='weekly');
    $('#repeatWeekdayFields').classList.toggle('hidden',freq!=='weekly');
    $('#repeatMonthField').classList.toggle('hidden',freq!=='monthly');
    $('#repeatDatesField').classList.toggle('hidden',freq!=='dates');
  };
  $('#repeatFreq').onchange=sync;sync();
  $('#repeatStart').onchange=()=>$('#repeatEnd').min=$('#repeatStart').value;
  /* Under a project only its members can take the task, and it ends with the project. */
  const syncProject=()=>{const p=S.projects.find(x=>x.id===$('#repeatProject').value);$$('input[name="repeatUser"]').forEach(x=>{const out=Boolean(p)&&(p.members||{})[x.value]!=='accepted';if(out)x.checked=false;x.closest('label').classList.toggle('hidden',out)});$('#repeatEnd').max=p?.end&&p.end<DATE_HORIZON?p.end:DATE_HORIZON;if(p?.end&&$('#repeatEnd').value>p.end)$('#repeatEnd').value=p.end};
  $('#repeatProject').onchange=syncProject;
  $('#cancelAction').onclick=closeModal;
  $('#confirmRepeat').onclick=async()=>{
    const freq=$('#repeatFreq').value;
    const assignees=$$('input[name="repeatUser"]:checked').map(x=>x.value);
    const weekdays=$$('input[name="repeatWeekday"]:checked').map(x=>Number(x.value));
    const dates=$('#repeatDates').value.split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean);
    const skipDates=$('#repeatSkipDates').value.split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean);
    if(!$('#repeatName').value.trim()||!assignees.length){toast(tr('请填写任务名称并选择成员'));return}
    if(freq==='weekly'&&!weekdays.length){toast(tr('请选择每周执行日'));return}
    if(freq==='dates'&&!dates.length){toast(tr('请填写至少一个指定日期'));return}
    const start=$('#repeatStart').value,end=$('#repeatEnd').value;
    if(!start){toast(tr('请填写开始日期'));return}
    if(end&&end<start){toast(tr('结束日期不能早于开始日期'));return}
    try{await act('repeat.create',{name:$('#repeatName').value,assignees,frequency:freq,
      every:freq==='weekly'?Number($('#repeatEvery').value||1):1,
      weekdays,monthDay:Number($('#repeatMonthDay').value||1),
      span:Math.max(1,Number($('#repeatSpan').value||1)),
      dates,start,end,time:$('#repeatTime').value,
      duration:Number($('#repeatDuration').value),priority:'P1',skipDates,projectId:$('#repeatProject').value||null});closeModal()}catch(e){}};
}
/* 使用教程 · 演示. Each demo is a miniature of the real screen that plays its
   steps in a loop while it is on screen. Elements say when they appear
   (data-in), leave (data-out), move (data-move with --to), type (data-type) or
   fill (data-fill with --w); the step classes s1…sN switch them on. */
const card=(prio,name,meta,state,attrs='',cls='')=>`<div class="dm-card${cls?' '+cls:''}"${attrs}><b class="dm-prio is-${prio.toLowerCase()}">${prio}</b><span class="dm-name">${name}</span><small>${meta}</small><em class="dm-state">${state}</em></div>`;
const GUIDE_DEMOS={
  'login':{steps:[tr('输入账户名和密码'),tr('点「进入工作台」'),tr('进入后点左上角的头像'),tr('账户菜单里改资料、改密码或切换账户')],html:`
    <div class="dm-swap is-block">
      <div class="dm-pane dm-dialog" data-out="2"><h6>${tr('登录工作台')}</h6>
        <label>${tr('账户')}<i>linmo</i></label>
        <label data-point="0">${tr('密码')}<i>••••••••</i></label>
        <span class="dm-btn is-primary" data-point="1">${tr('进入工作台')}</span></div>
      <div class="dm-pane" data-in="2"><h6><span class="dm-avatar" data-point="2">${tr('林')}</span>${tr('林默 · 成员工作区')}</h6>
        <div class="dm-menu" data-in="3"><span data-point="3">${tr('个人资料')}</span><span>${tr('修改密码')}</span><span>${tr('登录其他账户')}</span><span class="is-muted">${tr('退出登录')}</span></div>
        <div class="dm-min" data-in="3"><b>${tr('个人资料')}</b><span>${tr('昵称 · 头像 · 个性签名（中文名由 superadmin 设置）')}</span></div></div>
    </div>`},
  'layout':{steps:[tr('左侧是主导航和快捷筛选，顶栏是常用入口'),tr('点「P0 重要任务」，今日任务只留下最紧急的'),tr('点导航顶部的箭头，导航收成只显示图标')],html:`
    <div class="dm-shell">
      <div class="dm-side" data-narrow="2" style="--narrow:44px">
        <span class="dm-collapse" data-point="2">${icon('chevron-left')}</span>
        ${[['calendar-check',tr('今日任务'),'3'],['layout-grid',tr('周视图'),''],['folder',tr('项目空间'),''],['inbox',tr('收件箱'),'2']].map(([i,l,n])=>`<span class="dm-nav">${icon(i)}<em data-out="2">${l}</em>${n?`<b data-out="2">${n}</b>`:''}</span>`).join('')}
        <small data-out="2">${tr('快捷筛选')}</small>
        <span class="dm-nav is-filter" data-point="1"><i class="dm-dot is-p0"></i><em data-out="2">${tr('P0 重要任务')}</em></span>
        <span class="dm-nav is-filter"><i class="dm-dot is-doing"></i><em data-out="2">${tr('进行中')}</em></span></div>
      <div class="dm-main"><div class="dm-top"><span>${icon('search')}</span><span>${icon('bell')}<i class="dm-badge">2</i></span><span class="dm-btn is-primary">${tr('{0}新任务',icon('plus'))}</span></div>
        ${card('P0',tr('提交方案初稿'),tr('16:00 · 2 小时'),tr('进行中'))}
        ${card('P1',tr('晨会同步'),tr('09:30 · 15 分钟'),tr('已完成'),' data-out="1"')}
        ${card('P2',tr('整理参考资料'),tr('17:00 · 30 分钟'),tr('待开始'),' data-out="1"')}</div>
    </div>`},
  'timeline':{steps:[tr('每个项目一条横条，从开始日期画到截止日期'),tr('竖线是今天；没有截止日期的长期项目画到右边缘'),tr('日期有问题的项目标出「日期待修正」'),tr('左右箭头翻看前后时段')],html:`
    <div class="dm-pane dm-wide dm-gantt"><h6>${tr('项目时间轴')} <span class="dm-arrows" data-point="3">${icon('chevron-left')}${icon('chevron-right')}</span></h6>
      <div class="dm-gbody">
        <div class="dm-gnames"><span></span><span>${tr('2027 战略规划')}</span><span>${tr('官网改版')}</span><span>${tr('团队周会')}</span><span>${tr('竞品月报')}</span></div>
        <div class="dm-gcanvas"><div class="dm-gscroll" data-move="3" style="--to:translateX(-18%)">
          <div class="dm-months"><span>${tr('10 月')}</span><span>${tr('11 月')}</span><span>${tr('12 月')}</span><span>${tr('1 月')}</span></div>
          <div class="dm-lane"><i style="left:14%;width:30%"></i></div>
          <div class="dm-lane"><i style="left:29%;width:35%"></i></div>
          <div class="dm-lane"><i class="is-long" data-in="1" style="left:6%;right:0"></i></div>
          <div class="dm-lane"><i class="is-bad" style="left:42%;width:5%"></i><em data-in="2" style="left:49%">${tr('日期待修正')}</em></div>
          <b class="dm-today" data-in="1" style="left:35%"></b></div></div>
      </div></div>`},
  'achievements':{steps:[tr('已结项的项目都收在成果库里，顶部是总数'),tr('每张卡写着生命周期和任务完成情况'),tr('卡上有结项报告，还能进项目文件和沟通记录')],html:`
    <div class="dm-kpis is-row"><span><b>8</b>${tr('已完成项目')}</span><span><b>214</b>${tr('累计完成子任务')}</span></div>
    <div class="dm-pane dm-wide"><h6>${tr('官网改版')} <small>${tr('何雨 · 11月30日结项')}</small></h6>
      <div class="dm-life is-dots" data-in="1">${[tr('创建'),tr('审批启动'),tr('提交结项'),tr('完成')].map(x=>`<span>${x}</span>`).join('<i></i>')}</div>
      <div class="dm-meter"><span>${tr('任务')}</span><div class="dm-bar"><i class="is-full" data-fill="1" style="--w:100%"></i></div><b>24 / 24</b></div>
      <div class="dm-min" data-in="2" data-point="2"><b>${tr('结项报告')}</b><span>${tr('首屏与信息架构已上线，转化提升 18%')}</span></div>
      <div class="dm-links" data-in="2"><span>${tr('项目文件')}</span><span>${tr('沟通记录')}</span><span>${tr('查看项目详情')}</span></div></div>`},
  'search':{steps:[tr('在任何页面按 /'),tr('输入关键词，任务和项目一起列出'),tr('按 N 直接新建任务'),tr('按 ? 查看全部快捷键')],html:`
    <div class="dm-keys"><kbd class="is-hit" data-out="1">/</kbd><kbd class="is-hit" data-in="2" data-out="3">N</kbd><kbd class="is-hit" data-in="3">?</kbd></div>
    <div class="dm-swap is-block">
    <div class="dm-pane dm-wide dm-dialog" data-out="2"><h6>${tr('搜索任务与项目')}</h6><label>${tr('关键词')}<i><span data-type="1">${tr('报价')}</span></i></label>
      <div class="dm-file" data-in="1"><b>${tr('任务')}</b><span>${tr('整理竞品报价')}</span><small>${tr('陈曦 · 2027 战略规划')}</small></div>
      <div class="dm-file" data-in="1"><b>${tr('项目')}</b><span>${tr('竞品月报')}</span><small>${tr('Owner · 周一')}</small></div></div>
    <div class="dm-pane dm-wide dm-dialog" data-in="2" data-out="3"><h6>${tr('新任务')}</h6><label>${tr('任务名称')}<i></i></label></div>
    <div class="dm-pane dm-wide" data-in="3"><h6>${tr('快捷键')}</h6><div class="dm-shortcuts"><span><kbd>/</kbd>${tr('搜索')}</span><span><kbd>N</kbd>${tr('新建任务')}</span><span><kbd>T</kbd>${tr('今日任务')}</span><span><kbd>W</kbd>${tr('周视图')}</span><span><kbd>P</kbd>${tr('项目空间')}</span><span><kbd>I</kbd>${tr('收件箱')}</span><span><kbd>H</kbd>${tr('使用教程')}</span><span><kbd>Esc</kbd>${tr('关闭')}</span></div></div></div>`},
  'accounts':{steps:[tr('点「添加账户」'),tr('填好账户名、中文名、初始密码和权限组'),tr('新账户出现在列表里'),tr('停用后账户还在，但不能再登录')],html:`
    <div class="dm-split">
      <div class="dm-pane"><h6>${tr('账户管理')} <span class="dm-btn" data-point="0">${tr('{0}添加账户',icon('plus'))}</span></h6>
        <div class="dm-acct"><span class="dm-avatar">${tr('林')}</span><b>${tr('林默')}</b><small>${tr('普通用户')}</small><em>${tr('启用')}</em></div>
        <div class="dm-acct"><span class="dm-avatar">${tr('周')}</span><b>${tr('周一')}</b><small>${tr('普通用户')}</small><em>${tr('启用')}</em></div>
        <div class="dm-acct" data-in="2"><span class="dm-avatar">${tr('赵')}</span><b>${tr('赵六')}</b><small>${tr('普通用户')}</small><span class="dm-swap"><em data-out="3">${tr('启用')}</em><em class="is-off" data-in="3" data-point="3">${tr('已停用')}</em></span></div></div>
      <div class="dm-pane dm-dialog" data-in="1" data-out="2"><h6>${tr('添加账户')}</h6><label>${tr('账户名')}<i><span data-type="1">zhaoliu</span></i></label><label>${tr('中文名称')}<i><span data-in="1">${tr('赵六')}</span></i></label>
        <label>${tr('初始密码')}<i><span data-in="1">••••••••</span></i></label><label>${tr('权限组')}<i><span data-in="1">${tr('普通用户')}</span></i></label><span class="dm-btn is-primary" data-point="1">${tr('创建账户')}</span></div>
    </div>`},
  'automation':{steps:[tr('09:30，到点的任务自动变成「进行中」'),tr('23:30，每个人的当天档案自动整理好'),tr('零点过后，没做完的任务递延到第二天'),tr('到补报时间，团队日报汇总完成')],html:`
    <div class="dm-clockline"><i class="dm-hand"></i>
      ${['09:30','23:30','00:00','00:30'].map((t,i)=>`<span class="dm-tick${i?'':' is-first'}"${i?` data-in="${i}"`:''}>${t}</span>`).join('')}</div>
    <div class="dm-week is-four">
      <div class="dm-col"><h6>${tr('任务')}</h6><div class="dm-card"><b class="dm-prio is-p1">P1</b><span class="dm-name">${tr('晨会同步')}</span><small>09:30</small><em class="dm-state is-doing">${tr('进行中')}</em></div></div>
      <div class="dm-col"><h6>${tr('档案')}</h6><div class="dm-min" data-in="1"><b>${tr('今日完成')}</b><span>${tr('✓ 晨会同步')}</span></div></div>
      <div class="dm-col"><h6>${tr('递延')}</h6><div class="dm-card is-carried" data-in="2"><b class="dm-prio is-p0">P0</b><span class="dm-name">${tr('提交方案初稿')}</span><small>${tr('由周四递延')}</small></div></div>
      <div class="dm-col"><h6>${tr('日报')}</h6><div class="dm-kpis" data-in="3"><span><b>12</b>${tr('完成')}</span><span><b>5</b>${tr('成员')}</span></div></div>
    </div>`},
  'new-task':{steps:[tr('点「新建任务」打开表单'),tr('填好名称、负责人和时间'),tr('点「创建任务」'),tr('任务立刻出现在负责人的今日任务里'),tr('负责人收到指派通知')],html:`
    <div class="dm-split">
      <div class="dm-pane dm-dialog" data-out="3"><h6>${tr('新任务')}</h6>
        <label data-point="1">${tr('任务名称')}<i><span data-type="1">${tr('整理竞品报价')}</span></i></label>
        <label>${tr('指派给')}<i><span data-in="1">${tr('陈曦')}</span></i></label>
        <label>${tr('安排')}<i><span data-in="1">${tr('今天 14:00 · 60 分钟 · P1')}</span></i></label>
        <span class="dm-btn is-primary" data-point="2">${tr('创建任务')}</span></div>
      <div class="dm-pane"><h6>${tr('陈曦 · 今日任务')} <span class="dm-bell">${icon('bell')}<i data-in="4">1</i></span></h6>
        ${card('P1',tr('晨会同步'),tr('09:30 · 15 分钟'),tr('进行中'))}
        ${card('P1',tr('整理竞品报价'),tr('14:00 · 60 分钟'),tr('待开始'),' data-in="3"')}</div>
    </div>`},
  'task-life':{steps:[tr('任务排在 14:00，还没到时间'),tr('到点自动变成「进行中」'),tr('做完点「记录完成」，写一句总结和实际耗时'),tr('任务完成，今日进度随之前进')],html:`
    <div class="dm-pane dm-wide"><h6>${tr('今日任务')} <span class="dm-clock"><i data-out="1">13:58</i><i data-in="1">14:00</i></span></h6>
      <div class="dm-card"><b class="dm-prio is-p1">P1</b><span class="dm-name">${tr('整理竞品报价')}</span><small>${tr('14:00 · 60 分钟')}</small>
        <em class="dm-state" data-out="1">${tr('待开始')}</em><em class="dm-state is-doing" data-in="1" data-out="3">${tr('进行中')}</em><em class="dm-state is-done" data-in="3">${tr('{0}已完成',icon('check'))}</em></div>
      <div class="dm-sheet" data-in="2" data-out="3"><span>${tr('完成总结')}</span><i><span data-type="2">${tr('已整理 6 家报价，见文件')}</span></i><span>${tr('实际耗时')} <b>${tr('75 分钟')}</b> ${tr('· 顺利')}</span></div>
      <div class="dm-meter"><span>${tr('今日进度')}</span><div class="dm-bar"><i data-fill="3" style="--w:50%"></i></div><b><i data-out="3">0 / 2</i><i data-in="3">1 / 2</i></b></div>
    </div>`},
  'defer':{steps:[tr('周四还有一项没做完'),tr('过了零点，系统把它递延到周五'),tr('周五的卡片写明「由周四递延 · 第 1 次」，周四那张留作记录')],html:`
    <div class="dm-week is-two">
      <div class="dm-col"><h6>${tr('周四')}</h6>${card('P0',tr('提交方案初稿'),tr('16:00 · 2 小时'),tr('进行中'),' data-out="1"')}
        ${card('P0',tr('提交方案初稿'),tr('16:00 · 2 小时'),tr('已递延'),' data-in="1"','is-muted')}</div>
      <div class="dm-col"><h6>${tr('周五')}</h6><div class="dm-ghost" data-move="1" data-out="2" style="--to:translateX(calc(100% + 12px))"></div>
        <div class="dm-card is-carried" data-in="2"><b class="dm-prio is-p0">P0</b><span class="dm-name">${tr('提交方案初稿')}</span><small>${tr('由周四递延 · 第 1 次')}</small><em class="dm-state">${tr('待开始')}</em></div></div>
      <span class="dm-night" data-in="1" data-out="2">00:00</span>
    </div>`},
  'repeat':{steps:[tr('制定一条规则：每周一、三、五 09:30 晨会，15 分钟'),tr('保存后，系统按规则把之后的晨会排进每个人的日程'),tr('不需要的那一次，在规则里「挖空本次」')],html:`
    <div class="dm-rule"><span>${tr('{0}晨会同步',icon('repeat'))}</span><b>${tr('每周 一 · 三 · 五')}</b><small>${tr('09:30 · 15 分钟 · 林默、周一')}</small></div>
    <div class="dm-week">${[tr('一'),tr('二'),tr('三'),tr('四'),tr('五')].map((d,i)=>`<div class="dm-col"><h6>${tr('周{0}',d)}</h6>${i%2===0?`<div class="dm-mini" data-in="1"${i===4?' data-out="2" data-point="2"':''}>${tr('晨会')}</div>${i===4?tr('<div class="dm-mini is-skipped" data-in="2">已挖空</div>'):''}`:''}</div>`).join('')}</div>`},
  'stack':{steps:[tr('同一条固定任务，三期都没做完'),tr('开启「递延合并」后，它们合成一张卡，标着「3 期」'),tr('点一次「完成全部 3 期」就全部结清')],html:`
    <div class="dm-pane dm-wide"><h6>${tr('今日任务')}</h6>
      <div class="dm-stack">
        ${[tr('周一'),tr('周三'),tr('周五')].map((d,i)=>`<div class="dm-card" data-move="1" style="--to:translateY(${-i*44}px)" data-out="1"><b class="dm-prio is-p1">P1</b><span class="dm-name">${tr('周报汇总')}</span><small>${tr('{0} · 30 分钟',d)}</small><em class="dm-state">${tr('已递延')}</em></div>`).join('')}
        <div class="dm-card is-stacked" data-in="1"><b class="dm-prio is-p1">P1</b><span class="dm-name">${tr('周报汇总')} <i class="dm-count">${tr('3 期')}</i></span><small>${tr('30 分钟')}</small>
          <em class="dm-state" data-out="2">${tr('待开始')}</em><em class="dm-state is-done" data-in="2">${tr('{0}已完成',icon('check'))}</em></div>
      </div><span class="dm-btn is-primary" data-in="1" data-out="2" data-point="1">${tr('完成全部 3 期')}</span></div>`},
  'approval':{steps:[tr('所在规则组需要审批时，按钮显示「申请任务」'),tr('申请进入审批人的收件箱，上面直接有同意和驳回'),tr('同意后，任务出现在负责人的日程里，申请人收到结果')],html:`
    <div class="dm-split">
      <div class="dm-pane"><h6>${tr('何雨')}</h6><span class="dm-btn" data-point="0">${tr('申请任务')}</span><div class="dm-swap is-block">
        <div class="dm-card" data-in="1" data-out="2"><b class="dm-prio is-p1">P1</b><span class="dm-name">${tr('官网首屏改版')}</span><small>${tr('等待审批')}</small><em class="dm-state">${tr('申请中')}</em></div>
        ${card('P1',tr('官网首屏改版'),tr('周五 10:00 · 3 小时'),tr('待开始'),' data-in="2"')}</div></div>
      <div class="dm-pane"><h6>${tr('收件箱 · 林默')}</h6>
        <div class="dm-notice" data-in="1"><b>${tr('任务申请')}</b><span>${tr('何雨 申请「官网首屏改版」')}</span>
          <div><span class="dm-btn is-primary" data-point="2">${tr('同意创建')}</span><span class="dm-btn">${tr('驳回申请')}</span></div></div></div>
    </div>`},
  'rework':{steps:[tr('任务已完成'),tr('Owner 觉得还缺东西，点「打回」并写明原因'),tr('任务回到负责人的待办，排到今天，原因写在卡上')],html:`
    <div class="dm-split">
      <div class="dm-pane"><h6>${tr('周一 · 今日任务')}</h6>
        <div class="dm-swap is-block">${card('P1',tr('市场规模数据'),tr('昨天 · 2 小时'),tr('已完成'),' data-out="2"')}
        <div class="dm-card is-returned" data-in="2"><b class="dm-prio is-p1">P1</b><span class="dm-name">${tr('市场规模数据')}</span><small>${tr('打回：补上数据来源')}</small><em class="dm-state">${tr('待开始')}</em></div></div></div>
      <div class="dm-pane dm-dialog" data-in="1" data-out="2"><h6>${tr('打回「市场规模数据」')}</h6><label>${tr('打回原因')}<i><span data-type="1">${tr('补上数据来源')}</span></i></label><span class="dm-btn is-primary" data-point="1">${tr('打回并通知')}</span></div>
    </div>`},
  'tree':{steps:[tr('目录：文件夹装着项目'),tr('点项目，选中块滑过去，项目在右边打开'),tr('项目下展开会议和文件，点会议直接进会议标签')],html:`
    <div class="dm-tree"><i class="dm-mark" data-move="1" style="--to:translateY(66px)"></i>
      <div class="dm-tnode">${tr('{0}全部项目',icon('layout-grid'))}</div>
      <div class="dm-tnode">${tr('{0}年度战略',icon('folder'))}</div>
      <div class="dm-tbranch"><div class="dm-tnode" data-point="1">${tr('{0}2027 战略规划',icon('gantt'))}</div>
        <div class="dm-tbranch" data-in="2"><div class="dm-tnode is-sub" data-point="2">${tr('{0}会议 2',icon('chat'))}</div><div class="dm-tnode is-sub">${tr('{0}文件 5',icon('folder'))}</div></div>
        <div class="dm-tnode">${tr('{0}竞品月报',icon('gantt'))}</div></div>
    </div>
    <div class="dm-pane dm-page" data-in="1"><h6>${tr('2027 战略规划')}</h6><div class="dm-tabs"><b>${tr('任务')}</b><span>${tr('会议')}</span><span>${tr('文件')}</span><span>${tr('成员')}</span><span>${tr('概况')}</span></div>
      ${card('P0',tr('确定三大战略主题'),tr('林默 · 11月4日'),tr('进行中'))}</div>`},
  'upload':{steps:[tr('把文件从电脑拖到「文件」标签'),tr('松手就开始上传，单个文件不超过 20MB'),tr('上传完成，所有成员都能下载')],html:`
    <div class="dm-pane dm-wide is-drop"><h6>${tr('文件')} <span class="dm-btn">${tr('新增文件')}</span></h6>
      <div class="dm-file" data-in="1" data-point="1"><b>PDF</b><span>${tr('竞品格局一页纸.pdf')}</span><small><i data-out="2">${tr('上传中…')}</i><i data-in="2">${tr('1.8 MB · 你 · 刚刚')}</i></small></div>
      <div class="dm-file"><b>XLSX</b><span>${tr('资源分配表.xlsx')}</span><small>${tr('94 KB · 周一 · 昨天')}</small></div>
      <div class="dm-drag" data-move="1" data-out="1" data-point="0" style="--to:translate(-120px,26px)"><b>PDF</b>${tr('竞品格局一页纸.pdf')}</div>
    </div>`},
  'meeting':{steps:[tr('会议开始，点「开始实时录入」'),tr('边说边转成文字，原稿自动保存'),tr('点「根据模板生成」'),tr('AI 整理出会议结论、待办和风险')],html:`
    <div class="dm-split">
      <div class="dm-pane"><h6>${tr('原始转录')} <span class="dm-rec" data-in="1" data-out="2">${tr('● 录入中')}</span></h6>
        <p class="dm-line" data-in="1">${tr('林默：先看方向，明年聚焦两条主线。')}</p><p class="dm-line" data-in="1">${tr('周一：资源表周五前补齐。')}</p><p class="dm-line" data-in="1">${tr('陈曦：竞品数据还差两家。')}</p>
        <span class="dm-btn is-primary" data-point="2">${tr('根据模板生成')}</span></div>
      <div class="dm-pane"><h6>${tr('会议纪要')}</h6>
        <div class="dm-min" data-in="3"><b>${tr('会议结论')}</b><span>${tr('明年聚焦两条主线')}</span></div>
        <div class="dm-min" data-in="3"><b>${tr('待办')}</b><span>${tr('周一 · 资源表 · 周五前')}</span><span>${tr('陈曦 · 补两家竞品')}</span></div>
        <div class="dm-min" data-in="3"><b>${tr('风险与待确认')}</b><span>${tr('竞品数据不完整')}</span></div></div>
    </div>`},
  'project-life':{steps:[tr('申请项目，管理员在收件箱审批'),tr('通过后项目开始，任务推进'),tr('Owner 点「完成项目」写结项报告'),tr('管理员同意，项目进入成果库')],html:`
    <div class="dm-life">${[tr('申请'),tr('执行'),tr('结项审批'),tr('成果库')].map((s,i)=>`<span class="dm-stage"${i?` data-in="${i}"`:''}>${s}</span>`).join('<i></i>')}</div>
    <div class="dm-pane dm-wide"><h6>${tr('官网改版')} <span class="dm-swap"><em class="dm-state" data-out="1">${tr('待审批')}</em><em class="dm-state is-doing" data-in="1" data-out="3">${tr('进行中')}</em><em class="dm-state is-done" data-in="3">${tr('已完成')}</em></span></h6>
      <div class="dm-meter"><span>${tr('任务')}</span><div class="dm-bar"><i data-fill="1" style="--w:62%"></i><i class="is-full" data-fill="2" style="--w:100%"></i></div></div>
      <div class="dm-sheet" data-in="2" data-out="3"><span>${tr('结项报告')}</span><i><span data-type="2">${tr('首屏与信息架构已上线，转化提升 18%')}</span></i></div>
      <div class="dm-trophy" data-in="3">${tr('{0}已归入成果库',icon('award'))}</div></div>`},
  'inbox':{steps:[tr('收件箱是空的'),tr('新的指派和 @ 进来，红点显示几条没看'),tr('又来一条修改申请'),tr('「全部标为已读」一次清掉')],html:`
    <div class="dm-pane dm-wide"><h6>${tr('收件箱')} <span class="dm-bell">${icon('bell')}<i data-in="1" data-out="3"><i data-out="2">2</i><i data-in="2">3</i></i></span></h6>
      <div class="dm-notice is-unread" data-in="1"><b>${tr('任务指派')}</b><span>${tr('林默 把「整理竞品报价」指派给你')}</span></div>
      <div class="dm-notice is-unread" data-in="1"><b>${tr('沟通区')}</b><span>${tr('周一 在「2027 战略规划」里 @ 了你')}</span></div>
      <div class="dm-notice is-unread" data-in="2"><b>${tr('修改申请')}</b><span>${tr('何雨 申请把截止改到下周一')}</span></div>
      <span class="dm-btn" data-point="3">${tr('全部标为已读')}</span></div>`},
  'chat':{steps:[tr('在项目频道里输入 @'),tr('选中成员'),tr('发送后，对方收到通知，频道里也能看到')],html:`
    <div class="dm-pane dm-wide"><h6>${tr('# 2027 战略规划')}</h6>
      <div class="dm-msg"><b>${tr('林默')}</b><span>${tr('今天下午对一下资源表')}</span></div>
      <div class="dm-msg is-mine" data-in="2"><b>${tr('你')}</b><span><mark>${tr('@陈曦')}</mark> ${tr('竞品还差两家，今天能补吗？')}</span></div>
      <div class="dm-mention" data-out="2"><span class="is-on" data-point="1">${tr('陈曦')}</span><span>${tr('何雨')}</span><span>${tr('所有人')}</span></div>
      <div class="dm-input" data-point="0 2"><i data-out="1">${tr('@陈')}</i><i data-in="1" data-out="2"><mark>${tr('@陈曦')}</mark> ${tr('竞品还差两家，今天能补吗？')}</i></div>
      <span class="dm-ping" data-in="2">${tr('陈曦 {0}',icon('bell'))}</span></div>`},
  'archive':{steps:[tr('今天的档案还空着'),tr('系统先整理当天的完成和未完成'),tr('你补上明日计划和随记，点保存'),tr('第二天，团队日报汇总所有人和项目')],html:`
    <div class="dm-split">
      <div class="dm-pane"><h6>${tr('我的档案 · 11月5日')}</h6>
        <div class="dm-min"><b>${tr('今日完成')}</b><span data-in="1">${tr('✓ 整理竞品报价')}</span><span data-in="1">${tr('✓ 晨会同步')}</span></div>
        <div class="dm-min"><b>${tr('未完成与阻塞')}</b><span data-in="1">${tr('提交方案初稿（递延到明天）')}</span></div>
        <div class="dm-min" data-point="2"><b>${tr('明日计划')}</b><span><i data-type="2">${tr('先交方案初稿，再约评审')}</i></span></div></div>
      <div class="dm-pane" data-in="3"><h6>${tr('团队日报 · 11月5日')}</h6>
        <div class="dm-kpis"><span><b>12</b>${tr('完成任务')}</span><span><b>18.5h</b>${tr('完成工时')}</span><span><b>5</b>${tr('位成员')}</span></div>
        <div class="dm-min"><b>${tr('项目进展')}</b><span>${tr('2027 战略规划 · 1/5 · Owner 汇报')}</span><span>${tr('官网改版 · 0/1 · 系统汇总')}</span></div></div>
    </div>`},
  'assistant':{steps:[tr('打开规划模式'),tr('用一句话说要安排的事'),tr('助手起草出几张卡片：谁、哪天、多久'),tr('你逐张检查、修改，确认后才真正创建')],html:`
    <div class="dm-pane dm-wide"><h6>${tr('{0}AI 助手 · 规划',icon('sparkles'))}</h6>
      <div class="dm-msg is-mine" data-in="1" data-point="1"><span><i data-type="1">${tr('下周把季度复盘做完：整理数据、出初稿、找林默评审')}</i></span></div>
      <div class="dm-drafts">${[[tr('整理复盘数据'),tr('周一 · 周一 · 2 小时')],[tr('写复盘初稿'),tr('周三 · 你 · 3 小时')],[tr('复盘评审'),tr('周五 · 林默 · 1 小时')]].map(([n,m],i)=>
        `<div class="dm-card is-draft" data-in="2" style="transition-delay:${i*.18}s"><b class="dm-prio is-p1">P1</b><span class="dm-name">${n}</span><small>${m}</small><em class="dm-state" data-out="3">${tr('草稿')}</em><em class="dm-state is-done" data-in="3">${tr('{0}已创建',icon('check'))}</em></div>`).join('')}</div>
      <span class="dm-btn is-primary" data-in="2" data-out="3" data-point="3">${tr('接受所选')}</span></div>`},
  'widget':{steps:[tr('点顶栏的桌面小组件图标'),tr('小组件浮在所有窗口之上'),tr('开始一轮 25 分钟专注'),tr('勾选今天的任务，直接记为完成')],html:`
    <div class="dm-pip" data-in="1"><h6>${tr('今日待办')} <small>${tr('还剩')} <span class="dm-num"><i data-out="3">2</i><i data-in="3">1</i></span> ${tr('项')}</small></h6>
      <div class="dm-pomo" data-point="2"><b><i data-out="2">25:00</i><i data-in="2">24:13</i></b><span>${tr('专注 25 分钟')}</span><div class="dm-ring"><i data-fill="2" style="--w:4%"></i></div></div>
      <label class="dm-check" data-point="3"><i class="dm-box"><b data-in="3">${icon('check')}</b></i>${tr('整理竞品报价')}</label>
      <label class="dm-check"><i class="dm-box"></i>${tr('提交方案初稿')}</label></div>`},
  'rules':{steps:[tr('默认规则：成员新建项目需要审批'),tr('管理员把它改成「直接创建」'),tr('成员那边的按钮立刻从「申请项目」变成「新建项目」')],html:`
    <div class="dm-split">
      <div class="dm-pane"><h6>${tr('规则组 · 默认规则')}</h6>
        <div class="dm-seg" data-point="1"><span>${tr('新项目')}</span><b data-out="1">${tr('需要审批')}</b><b class="is-ok" data-in="1">${tr('直接创建')}</b></div>
        <div class="dm-seg"><span>${tr('临时任务')}</span><b class="is-ok">${tr('直接创建')}</b></div>
        <div class="dm-seg"><span>${tr('AI 助手')}</span><b>${tr('查询与规划')}</b></div></div>
      <div class="dm-pane"><h6>${tr('成员的顶栏')}</h6><span class="dm-swap is-block"><span class="dm-btn" data-out="2">${tr('{0}申请项目',icon('arrow-up-right'))}</span><span class="dm-btn is-primary" data-in="2">${tr('{0}新建项目',icon('plus'))}</span></span></div>
    </div>`},
};
/* Plays the demos that are on screen; each step holds for its share of the loop.
   With reduced motion nothing plays: the dots step through by hand. */
const DEMO_STEP_MS=2100;
function demoStep(fig,step){
  const steps=GUIDE_DEMOS[fig.dataset.demo]?.steps||[];fig.dataset.step=String(step);
  for(let i=1;i<=8;i++)fig.classList.toggle(`s${i}`,i<=step);
  const caption=fig.querySelector('.demo-caption');if(caption)caption.textContent=steps[step]||'';
  fig.querySelectorAll('.demo-dot').forEach((d,i)=>{d.classList.toggle('is-on',i===step);d.setAttribute('aria-current',String(i===step))});
  demoPoint(fig,step);
}
/* The pointer goes to whatever the person would press on this step
   (data-point="n", several steps separated by spaces) and taps it. */
function demoPoint(fig,step){
  const stage=fig.querySelector?.('.demo-stage'),ptr=stage?.querySelector?.('.demo-pointer');
  if(!ptr||typeof stage.getBoundingClientRect!=='function')return;
  const target=stage.querySelector(`[data-point~="${step}"]`);
  const revision=ptr._pointRevision=(ptr._pointRevision||0)+1;
  clearTimeout(ptr._tap);ptr.classList.remove('is-tap');
  if(!target){ptr.classList.remove('is-on');return}
  const place=()=>{
    if(ptr._pointRevision!==revision||fig.isConnected===false||(UI.view&&UI.view!=='guide'))return;
    const s=stage.getBoundingClientRect(),r=target.getBoundingClientRect();
    if(!r.width||!r.height||target.checkVisibility?.({opacityProperty:true,visibilityProperty:true})===false){ptr.classList.remove('is-on');return}
    ptr.style.transform=`translate(${Math.round(r.left-s.left+Math.min(r.width*.6,r.width-6))}px,${Math.round(r.top-s.top+r.height*.6)}px)`;
    ptr.classList.add('is-on');
    ptr._tap=setTimeout(()=>{if(ptr._pointRevision===revision)ptr.classList.add('is-tap')},navReducedMotion()?0:650);
  };
  // Flush the step styles, then wait for the target and its ancestors to settle.
  target.getBoundingClientRect();
  const moving=[];
  if(!navReducedMotion())for(let el=target;el;el=el===stage?null:el.parentElement){
    moving.push(...(el.getAnimations?.()||[]).filter(a=>(a.pending||a.playState==='running')&&a.effect?.getComputedTiming?.()?.iterations!==Infinity));
  }
  if(moving.length){ptr.classList.remove('is-on');Promise.allSettled(moving.map(a=>a.finished)).then(place)}else place();
}
function bindGuideDemos(root){
  const figs=[...root.querySelectorAll?.('.guide-demo')||[]];if(!figs.length)return;
  const still=navReducedMotion();
  figs.forEach(fig=>{
    demoStep(fig,0);
    fig.querySelectorAll('.demo-dot').forEach((d,i)=>d.onclick=()=>{fig.dataset.paused='1';fig.querySelector('.demo-play').textContent=tr('播放');demoStep(fig,i)});
    const play=fig.querySelector('.demo-play');
    if(play){play.textContent=still?tr('播放'):tr('暂停');if(still)fig.dataset.paused='1';
      play.onclick=()=>{const paused=fig.dataset.paused==='1';fig.dataset.paused=paused?'':'1';play.textContent=paused?tr('暂停'):tr('播放')}}
  });
  clearInterval(UI.demoTimer);
  UI.demoResize?.disconnect?.();
  if(typeof ResizeObserver==='function'){
    UI.demoResize=new ResizeObserver(entries=>entries.forEach(e=>{
      const fig=e.target.closest('.guide-demo');if(fig)demoPoint(fig,Number(fig.dataset.step)||0);
    }));
    figs.forEach(f=>{const stage=f.querySelector('.demo-stage');if(stage)UI.demoResize.observe(stage)});
  }
  if(typeof IntersectionObserver==='function'){
    UI.demoSeen?.disconnect?.();
    UI.demoSeen=new IntersectionObserver(entries=>entries.forEach(e=>e.target.classList.toggle('is-visible',e.isIntersecting)),{threshold:.35});
    figs.forEach(f=>UI.demoSeen.observe(f));
  }else figs.forEach(f=>f.classList.add('is-visible'));
  UI.demoTimer=setInterval(()=>{
    if(UI.view!=='guide'){clearInterval(UI.demoTimer);UI.demoResize?.disconnect?.();return}
    figs.forEach(fig=>{
      if(fig.dataset.paused==='1'||!fig.classList.contains('is-visible'))return;
      const n=GUIDE_DEMOS[fig.dataset.demo]?.steps.length||1,held=Number(fig.dataset.held||0)+1;
      if(Number(fig.dataset.step)===n-1&&held<2){fig.dataset.held=String(held);return}
      fig.dataset.held='0';demoStep(fig,(Number(fig.dataset.step)+1)%n);
    });
  },DEMO_STEP_MS);
}
function guideDemoHTML(id){
  const d=GUIDE_DEMOS[id];if(!d)return '';
  return `<figure class="guide-demo" data-demo="${id}" data-step="0"><div class="demo-stage" aria-hidden="true">${d.html}<i class="demo-pointer"></i></div>`
    +`<figcaption><span class="demo-caption" aria-live="polite"></span><span class="demo-dots">${d.steps.map((s,i)=>`<button type="button" class="demo-dot" aria-label="${tr('第 {0} 步：{1}',i+1,escapeHTML(s))}"></button>`).join('')}</span>`
    +`<button type="button" class="text-btn demo-play">${tr('暂停')}</button></figcaption></figure>`;
}
/* 使用教程: every part of the workbench, one chapter each. A chapter opens with
   a short demo of what the feature does, then steps, an example, the people
   who can use it and the edge cases worth knowing. Kinds: steps (numbered),
   list, example, note, who. */
const GUIDE=[
  {id:'start',title:tr('开始使用'),icon:'book-open',demo:'login',lead:tr('登录、三种角色和你自己的资料。'),parts:[
    [tr('登录'),[tr('打开工作台，输入账户名和密码，点「进入工作台」。'),tr('登录状态保留 7 天；在别的设备登录不会挤掉当前设备。'),tr('同一浏览器登录过的账户会列在左上角账户菜单中，切换时仍需验证该账户密码。')]],
    [tr('三种角色'),[tr('superadmin：系统所有者，负责系统配置、账户管理、审批与调度，不执行任务。'),tr('管理员：管理全部项目与任务、审批申请、查看成果库和账户列表，不执行任务。'),tr('普通成员：处理分给自己的任务，按所在规则组新建项目或任务，参与被加入的项目。')],'list'],
    [tr('三种角色能做什么'),[[tr('操作'), "superadmin", tr('管理员'), tr('普通成员')], [tr('执行任务、记录完成'), tr('不执行任务'), tr('不执行任务'), tr('仅分给自己的任务')], [tr('新建项目 / 任务'), tr('直接创建'), tr('直接创建'), tr('按所在规则组')], [tr('审批申请'), tr('可以'), tr('可以'), tr('项目 Owner 审批自己项目的申请')], [tr('查看全部已结项项目、账户列表'), tr('可以'), tr('可以'), tr('只看自己参与的已结项项目，看不到账户列表')], [tr('添加、停用账户或重置密码'), tr('可以'), tr('不可以'), tr('不可以')], [tr('规则组、删除账户'), tr('可以'), tr('不可以'), tr('看不到')]],"table"],
    [tr('你的资料'),[tr('点左上角的头像打开账户菜单。'),tr('「个人资料」里可以改昵称、头像（选择图片 / 移除）和个性签名；中文名由 superadmin 设置。'),tr('「修改密码」需要输入当前密码，新密码至少 6 位，改完后其他设备会退出登录。'),tr('「登录其他账户」切换到另一个账户；「退出登录」结束本设备的登录。')]],
    [tr('第一次进来'),[tr('第一次登录会自动开始约 3 分钟的导览，逐个点亮界面上的主要入口；标着「试一试」的步骤可以直接点一下看效果。'),tr('之后随时可以在「使用教程」页顶部点「开始导览」重看。')],'list'],
    [tr('常见问题'),[[tr('忘记密码怎么办？'), tr('请 superadmin 在「账户管理」里为你重置密码，登录后再到「修改密码」换成自己的。')], [tr('为什么我的中文名改不了？'), tr('中文名用在日报、成员列表等正式场合，由 superadmin 统一设置；你可以改昵称。')], [tr('换了电脑要重新登录吗？'), tr('要。每台设备单独登录，登录状态保留 7 天；改密码后所有设备都需要重新登录。')]],"faq"],
  ]},
  {id:'layout',title:tr('界面与导航'),icon:'layout-grid',demo:'layout',lead:tr('左侧导航、顶栏和常用入口在哪里。'),parts:[
    [tr('左侧主导航'),[tr('今日任务、周视图、档案室、项目空间、项目时间轴、收件箱、使用教程对所有人开放；账户管理、系统设置只对管理员显示。成果库在项目空间的目录里。'),tr('导航右侧的数字是待处理数量，红点表示有新分到你的工作。'),tr('点导航顶部的箭头收成只显示图标；拖动导航右边缘调宽窄，双击边缘恢复默认宽度。')],'list'],
    [tr('快捷筛选'),[tr('点「P0 重要任务」「进行中」「已递延」会跳到今日任务，只列出对应的任务。'),tr('在今日任务里点「全部」回到完整列表。')]],
    [tr('今日安排'),[tr('左下角显示你今天所有任务的预计总时长，进度条随完成情况增长。')],'list'],
    [tr('导航宽窄'),[[tr('宽度'), tr('显示什么')], [tr('默认'), tr('图标、名称、待处理数量和快捷筛选')], [tr('调窄'), tr('名称和数量，分组标题和底部的今日安排收起')], [tr('收起'), tr('只剩图标')]],"table"],
    [tr('顶栏'),[tr('搜索：找任务和项目，快捷键 /。'),tr('通知铃铛：打开收件箱，红点表示有未读。'),tr('桌面小组件：悬浮的今日待办和番茄钟。'),tr('AI 助手：打开右侧的助手面板。'),tr('新建项目 / 新建任务：按你所在规则组显示为「新建」或「申请」，不允许时不显示。'),tr('沟通区：顶栏左侧的对话图标，有未读消息时出现红点。')],'list'],
  ]},
  {id:'today',title:tr('今日任务'),icon:'calendar-check',demo:'task-life',lead:tr('一天要做的事，按项目分组；任务从待开始到完成都在这里推进。'),parts:[
    [tr('看今天'),[tr('页面顶部是日期卡和「今天做什么？」，右侧箭头可以前后翻一天。'),tr('「今日进度」显示已完成 / 全部和百分比。'),tr('「全部 / 待处理 / 已完成」切换下面列表的范围。')]],
    [tr('任务卡上有什么'),[tr('序号和优先级：P0 最高，P1、P2 依次降低。'),tr('名称、负责人、时间与时长、日期和状态（待开始、进行中、已完成、已递延…）。'),tr('「固定」标记：由固定任务规则生成。'),tr('「由某日递延 · 第 N 次」：前一天没做完自动挪过来的。'),tr('「N 期」：几期没做完的固定任务合成了一张卡。')],'list'],
    [tr('任务状态'),[[tr('状态'), tr('什么时候出现'), tr('接下来')], [tr('待开始'), tr('刚创建，还没到安排的时间'), tr('到点自动开始，或在详情里点「开始任务」')], [tr('进行中'), tr('到了安排的时间，或手动开始'), tr('做完点「记录完成」')], [tr('已完成'), tr('记录了完成'), tr('可以「修改完成记录」；Owner 觉得不够可以打回')], [tr('待审批'), tr('按规则组需要审批的新任务'), tr('同意后变为待开始，驳回后变为已驳回')], [tr('已驳回'), tr('申请没有通过'), tr('只作记录，驳回原因写在任务里')], [tr('已递延'), tr('过了零点还没做完'), tr('第二天有一张新卡接着做，这张保留作记录')], [tr('已跳过'), tr('所属项目已结束时还没做完'), tr('不再处理，也不再递延')]],"table"],
    [tr('例子'),[tr('林默的「整理竞品报价」排在今天 14:00。13:59 它还是「待开始」，14:00 自动变成「进行中」；15:15 他点「记录完成」，写下「已整理 6 家报价，见文件」，实际耗时 75 分钟，今日进度从 0/2 走到 1/2。')],'example'],
    [tr('常见问题'),[[tr('到了时间任务没有变成「进行中」？'), tr('系统每半分钟检查一次，最多晚半分钟；待审批的任务不会自动开始。')], [tr('今天的任务做不完怎么办？'), tr('不用处理，过了零点会自动递延到第二天；也可以在详情里主动递延，写明卡点、剩余工作和要挪到哪天。')], [tr('点「全部」和「待处理」有什么区别？'), tr('「待处理」只列还没完成的，「已完成」只列做完的，「全部」两者都列。')]],"faq"],
  ]},
  {id:'calendar',title:tr('周视图'),icon:'layout-grid',demo:'defer',lead:tr('按周查看安排；没做完的任务会自己挪到下一天。'),parts:[
    [tr('翻周'),[tr('页面显示一周七天，左右箭头切到上一周或下一周，「本周」回到当前周。'),tr('每周从哪天开始由管理员在「系统设置 → 日程」里设定。')]],
    [tr('看某一天'),[tr('点某一天进入「日期详情」，列出这天所有任务；点「返回周视图」回来。'),tr('管理员可以在顶部切换只看某位成员。')]],
    [tr('自动递延'),[tr('当天没做完的任务，过了零点会在第二天生成一张新卡，原来那张标为「已递延」保留作记录。'),tr('新卡写明「由某日递延 · 第 N 次」，任务详情底部能看到整条递延链。'),tr('跨多天的任务只有过了结束日期才会递延；所属项目已结束的任务不再递延，标为已跳过。')],'list'],
    [tr('例子'),[tr('周四 16:00 的「提交方案初稿」到晚上还没交。零点一过，周四那张变成「已递延」；周五多了一张同名卡片，写着「由周四递延 · 第 1 次」。周五仍没做完，周六那张就是「第 2 次」，详情底部能看到周四、周五、周六这条完整的链。')],"example"],
    [tr('注意'),[tr('服务器停机几天后重新启动，会一次补上这些天的递延，不会漏。')],'note'],
  ]},
  {id:'tasks',title:tr('任务'),icon:'check',demo:'new-task',lead:tr('新建、执行、完成，以及修改、指派和打回。'),parts:[
    [tr('新建任务'),[tr('点顶栏「新建任务」（快捷键 N），或在项目页点「新建任务」。'),tr('选类型：项目任务（属于某个项目）、临时任务（不属于任何项目）、固定任务（按周期重复，见下一章）。'),tr('填写所属项目、任务名称、任务描述、指派给、安排日期、结束日期（跨多天时填写）、时间、预计时长和优先级。'),tr('规则组允许直接创建时按钮是「创建任务」，任务立即出现在对方日程里并通知对方；需要审批时按钮是「提交申请」，审批通过后才生效。')]],
    [tr('新建任务的每一项'),[[tr('字段'), tr('说明')], [tr('类型'), tr('项目任务、临时任务或固定任务')], [tr('所属项目'), tr('项目任务必选，只列出你参与的项目')], [tr('任务名称'), tr('必填，最多 120 字')], [tr('任务描述'), tr('要交付什么、参考资料在哪里（可留空）')], [tr('指派给'), tr('谁来做这项任务，对方会收到通知')], [tr('安排日期 / 结束日期'), tr('哪天做；跨多天时填结束日期，过了结束日期才会递延')], [tr('时间 / 预计时长'), tr('几点开始、预计多少分钟；到点自动开始')], [tr('优先级'), tr('P0 最高，P1、P2 依次降低；P0 会出现在「P0 重要任务」筛选里')]],"table"],
    [tr('执行与完成'),[tr('到了安排的时间，任务自动从「待开始」变成「进行中」，也可以在详情里点「开始任务」。'),tr('做完后点「记录完成」，填写完成总结、实际耗时（分钟）和工作感受（顺利 / 一般 / 困难 / 阻塞）。'),tr('任务完成后直接结束，不需要审批；之后可以点「修改完成记录」更正。'),tr('合并了多期的固定任务，一次完成即可结清全部期次。')]],
    [tr('修改与指派'),[tr('管理员或有管理权限的任务安排人、项目 Owner 可以「直接调整任务」；执行人需要改时点「申请修改任务」，写明理由并等待审批。'),tr('有管理权限时，「调整任务指派」可以把任务换给别人，原负责人和新负责人都会收到通知。'),tr('项目 Owner 可以在项目任务列表里直接点「调整指派」。'),tr('「删除此任务」会把任务从日历移除，需要确认。')]],
    [tr('例子'),[tr('陈曦想把「官网首屏改版」的截止从周五改到下周一。她是执行人，于是点「申请修改任务」，写上「设计稿要等品牌确认」。审批人在收件箱里看到这条修改申请，点「同意修改」后，日期自动更新，陈曦收到通知。')],'example'],
    [tr('谁能用'),[tr('普通成员处理分给自己的任务；管理员和 superadmin 负责管理、审批与调度，不执行任务。'),tr('新建与修改是否需要审批，由「系统设置 → 成员与权限」里的规则组决定。')],'who'],
    [tr('常见问题'),[[tr('为什么我看不到「新建任务」？'), tr('你所在规则组的临时任务和项目任务都设为「不允许」。项目 Owner 在自己的项目里始终可以新建。')], [tr('完成记录写错了能改吗？'), tr('能。打开任务详情点「修改完成记录」，总结、耗时和感受都可以改。')], [tr('任务被指派给了别人，我还能看到吗？'), tr('不在你的今日任务里了；如果你是项目 Owner，仍能在项目的任务标签里看到。')]],"faq"],
  ]},
  {id:'approval',title:tr('审批与打回'),icon:'inbox',demo:'approval',lead:tr('需要审批的申请怎么走，完成后的工作怎么退回补充。'),parts:[
    [tr('需要审批的事'),[tr('所在规则组设为「需要审批」时，新建项目、临时任务或项目任务都会先成为申请。'),tr('执行人修改任务（日期、内容等）需要审批人同意。'),tr('Owner 提交的结项需要管理员同意。'),tr('任务完成不需要审批。')],'list'],
    [tr('三种创建方式'),[[tr('规则组设为'), tr('点按钮后')], [tr('直接创建'), tr('立刻生效，相关的人收到通知')], [tr('需要审批'), tr('先成为申请，审批人同意后才生效')], [tr('不允许'), tr('不显示对应的新建按钮')]],"table"],
    [tr('审批人怎么处理'),[tr('申请出现在审批人的收件箱，卡片上直接有「同意」「驳回」。'),tr('驳回时必须写原因，申请人会收到。'),tr('同意后，任务或项目立即生效，申请人收到结果通知。')]],
    [tr('打回'),[tr('Owner 对已完成的任务不满意时，在任务详情点「打回」，写明哪里还需要补充。'),tr('任务回到负责人的待办并排到今天，原因写在卡上，负责人收到通知。')],'steps'],
    [tr('常见问题'),[[tr('申请被驳回了怎么办？'), tr('在收件箱里看驳回原因，按要求调整后重新提交一条新申请。')], [tr('谁可以打回？'), tr('项目任务由项目 Owner 或管理员打回；临时任务由派出它的人或管理员打回。')], [tr('什么时候不能打回？'), tr('项目已经结束或过了截止日期时不能打回；只有「已完成」的任务可以打回。')], [tr('没设置规则组时按什么来？'), tr('按「默认规则」：项目需要审批，临时任务直接创建，项目任务只有 Owner 能建。')]],"faq"],
    [tr('注意'),[tr('审批和打回都会写进任务记录，任务详情底部可以看到谁在什么时候做了什么。')],'note'],
  ],extraDemo:'rework'},
  {id:'repeats',title:tr('固定任务'),icon:'repeat',demo:'repeat',lead:tr('每天、每周或每月都要做的事，定一次规则自动生成。'),parts:[
    [tr('制定规则'),[tr('在项目空间点「制定固定任务」，或新建任务时选「固定任务」。'),tr('所属项目可选，选「不挂项目」就是个人或团队的例行事项。'),tr('「安排给」可以多选，每人各生成一份。'),tr('周期可选：每天、工作日、每周（可设每 1–4 周一次和每周几执行）、每月（设执行日，月份天数不够时取最后一天）、指定日期。'),tr('再填时间、预计时长、优先级和可选的结束日期，点「保存固定任务」。')]],
    [tr('周期怎么选'),[[tr('周期'), tr('适合'), tr('要再填')], [tr('每天'), tr('每日站会、日检'), tr('无')], [tr('工作日'), tr('只在周一到周五做的事'), tr('无')], [tr('每周'), tr('周会、周报'), tr('每 1–4 周一次，以及每周几')], [tr('每月'), tr('月报、对账'), tr('每月几号；当月没有这一天时取最后一天')], [tr('指定日期'), tr('不规律的几次'), tr('日期列表，用逗号分隔')]],"table"],
    [tr('之后'),[tr('系统按规则预生成未来半年的任务，调度器每天继续补齐；可排期上限随今天滚动到两年后。'),tr('某一次不需要做时，在规则里点「挖空本次」跳过那一天。'),tr('停用规则后不再生成新的任务，已经生成的保留。')],'list'],
    [tr('递延合并'),[tr('「系统设置 → 日程 → 固定任务递延合并」开启时，同一条规则连续几期没做完会合成一张卡，标着「N 期」。'),tr('点一次「完成全部 N 期」即可全部结清；原始记录都保留。')],'list'],
    [tr('例子'),[tr('团队晨会定为每周一、三、五 09:30、15 分钟，安排给林默和周一。保存后两人的日程里都排上了之后半年的晨会；国庆那周的周三不开，就在规则里挖空那一天。')],'example'],
    [tr('常见问题'),[[tr('「持续天数」是什么？'), tr('每一次任务跨几天，1 到 30。比如每月 1 号开始、持续 3 天的对账。')], [tr('挂在项目下有什么不同？'), tr('只能安排给项目成员，结束日期不会晚于项目截止日期。')], [tr('停用以后已有的任务会消失吗？'), tr('不会。停用只是不再生成新的任务。')]],"faq"],
  ],extraDemo:'stack'},
  {id:'projects',title:tr('项目空间'),icon:'folder',demo:'tree',lead:tr('左边是目录，中间是项目，项目里是任务、会议和文件。'),parts:[
    [tr('目录'),[tr('「全部项目」列出你能看到的所有项目。'),tr('管理员可以点目录标题旁的 + 新建文件夹，点文件夹右侧的铅笔重命名或删除；删除文件夹不会删除里面的项目。'),tr('有权限的人可以拖动文件夹和项目调整顺序，把项目拖到文件夹上就放进去。'),tr('点项目左侧的箭头展开，能直接看到它的会议和文件；点会议打开会议，点文件下载。'),tr('选中的行有一块底色，换选时这块底色会滑到新的位置。目录调窄时只列文件夹和项目，收起时只剩图标。')],'list'],
    [tr('全部项目与文件夹页'),[tr('每个项目一张卡：状态、简介、任务完成进度、成员头像、截止日期和你在这个项目里的待办数。'),tr('右上角「排序」可以按目录顺序、名称、截止日期、完成度或最近创建排列。'),tr('点卡片进入项目。')],'list'],
    [tr('项目页'),[tr('顶部路径「全部项目 / 文件夹」可以点回上一层。'),tr('标题右侧是「新建任务」；「更多」里有项目设置、完成项目、退出项目和删除项目。'),tr('标题下面一行是状态、Owner、起止日期和完成进度。')],'list'],
    [tr('五个标签'),[tr('任务：项目的全部任务（协作者只看到分给自己的）；右上角选排序，选「手动」时 Owner 可以拖动调整顺序；下面单独列出固定任务规则。'),tr('会议：左边是会议列表，右边是打开的会议（见「会议」一章）。'),tr('文件：上传、下载、删除（见下）。'),tr('成员：Owner 和协作者各一行；Owner 可以填写每人的分工，离开输入框即保存；右侧是项目周期内每人进行中、已完成的任务数和工时；Owner 和管理员可以「添加协作者」或移出成员。'),tr('概况：立项、执行、结项三个阶段和日期，时间进度与任务进度，「放在文件夹」，以及项目背景。')],'list'],
    [tr('在项目里谁能做什么'),[[tr('操作'), "Owner", tr('协作者'), tr('管理员')], [tr('看任务'), tr('全部'), tr('只看分给自己的'), tr('全部')], [tr('新建任务'), tr('可以'), tr('按所在规则组'), tr('可以')], [tr('新增会议'), tr('可以'), tr('只能查看'), tr('可以')], [tr('上传文件'), tr('可以'), tr('可以'), tr('可以')], [tr('删除文件'), tr('可以'), tr('只能删自己上传的'), tr('可以')], [tr('添加或移出协作者'), tr('可以'), tr('不可以'), tr('可以')], [tr('完成项目'), tr('提交结项报告'), tr('不可以'), tr('直接完成或审批')]],"table"],
    [tr('注意'),[tr('切到另一个项目时，停留在同一个标签：看完一个项目的文件，点下一个项目就直接是它的文件。')],'note'],
    [tr('常见问题'),[[tr('为什么项目列表里少了一个项目？'), tr('已结项或已归档的项目不在列表里，它们在目录下方的「成果库」里。')], [tr('拖不动文件夹和项目？'), tr('只有管理员和有管理权限的人能调整目录顺序。')]],"faq"],
  ]},
  {id:'files',title:tr('项目文件'),icon:'file',demo:'upload',lead:tr('把项目资料放在项目里，所有成员都能取用。'),parts:[
    [tr('上传'),[tr('在项目的「文件」标签点「新增文件 → 上传文件」，或直接把文件从电脑拖到列表上。'),tr('单个文件不超过 20MB，可以一次选多个。')]],
    [tr('预览'),[tr('图片、PDF、文本、CSV、JSON 和日志文件旁边有「预览」，在新标签页里直接打开，不用下载。'), tr('Markdown（.md）文件点开就是排版好的样子；上传者、项目 Owner 和管理员可以切到「编辑」修改后保存。')],"list"],
    [tr('打开、下载与删除'),[tr('点文件名或左侧目录打开文件详情，Markdown 文件进入编辑器；点「下载」保存文件。'),tr('上传者、项目 Owner 和管理员可在列表右侧或详情底部删除文件；逾期项目仍可管理，结项和归档项目只读。删除前需确认，无法恢复。')],'list'],
    [tr('项目结束以后'),[tr('项目结项后，文件和会议仍能在目录下方的「成果库」里只读查看和下载。')],'list'],
    [tr('常见问题'),[[tr('文件太大传不上去？'), tr('单个文件上限 20MB，可以压缩或拆分后再传。')], [tr('误删了文件能找回吗？'), tr('不能，删除前请确认。')]],"faq"],
  ]},
  {id:'project-life',title:tr('项目的一生'),icon:'gantt',demo:'project-life',lead:tr('从申请、审批、协作到结项和归档。'),parts:[
    [tr('新建或申请'),[tr('点「新建项目」或「申请项目」，填写项目名称、项目描述、开始日期、截止日期（长期项目可留空）、Owner 和协作者。'),tr('规则组允许直接创建时项目立即生效；需要审批时提交给管理员，审批通过后才出现在项目空间。'),tr('添加协作者后会直接加入项目并收到通知，无需接受邀请。')]],
    [tr('执行中'),[tr('Owner 负责分派任务、维护背景与分工；协作者处理自己的任务。'),tr('协作者可以在「更多 → 退出项目」离开，已有的任务和记录保留，重新加入后原样回来。'),tr('「项目设置」可以改名称、描述、起止日期和 Owner，并管理协作者。')],'list'],
    [tr('结项'),[tr('Owner 在「更多 → 完成项目」提交结项报告，等待管理员审批；管理员也可直接完成项目。'),tr('管理员在收件箱同意后项目结项，从日程和项目列表中移出，进入成果库。'),tr('项目文件和会议在结项后仍能在目录下方的「成果库」里只读查看。')]],
    [tr('删除'),[tr('「更多 → 删除项目」会删除项目及其全部任务、记录、文件、会议和项目频道的消息，需要输入完整项目名确认，不可恢复。')],'note'],
  ]},
  {id:'meetings',title:tr('会议'),icon:'chat',demo:'meeting',lead:tr('记录会议原稿，用模板整理成纪要。'),parts:[
    [tr('新增会议'),[tr('在项目页的「会议」标签点「新增会议」，或在「文件」标签的「新增文件」里选「新增会议」。'),tr('填写会议名称、安排时间、参会人（用逗号或顿号分隔）和议程。')]],
    [tr('记录原稿'),[tr('点「开始实时录入」用麦克风边说边转成文字，再点一次停止；浏览器不支持时可以直接粘贴转录原稿。'),tr('原稿会自动保存，离开前有未保存的修改会提醒你。')]],
    [tr('生成纪要'),[tr('原稿有内容后点「根据模板生成」，AI 按「系统设置 → 会议纪要提示词」整理出会议结论、待办和风险。'),tr('生成的纪要显示在原稿下方，随会议一起保存，之后可以重新生成。')]],
    [tr('纪要编辑器'),[tr('纪要支持 Markdown：标题、加粗、斜体、列表、待办、引用、代码和链接，工具栏一键插入。'), tr('「编辑」和「预览」两个标签来回切换，保存会议时一起保存。项目背景也用同一个编辑器。')],"list"],
    [tr('删除会议'),[tr('会议创建者、项目 Owner 和管理员可点会议行右侧的「删除」，或打开会议后点底部的「删除会议」。'),tr('确认后原始转录和纪要一起删除；项目结项或归档后只读。')],'list'],
    [tr('谁能用'),[tr('只有项目 Owner 和管理员可以新增会议；项目成员都能查看。'),tr('生成纪要需要管理员先在「系统设置 → AI 接入与模型」配置模型。')],'who'],
    [tr('常见问题'),[[tr('点了「开始实时录入」没反应？'), tr('浏览器需要允许使用麦克风；不支持时可以把别处的转录原稿直接粘贴进来。')], [tr('生成的纪要不满意？'), tr('可以直接在编辑器里改，或修改原稿后重新生成；整体格式由「会议纪要提示词」决定。')]],"faq"],
  ]},
  {id:'timeline',title:tr('项目时间轴'),icon:'gantt',demo:'timeline',lead:tr('所有项目在时间上的排布。'),parts:[
    [tr('怎么看'),[tr('每个项目一条横条，从开始日期到截止日期；没有截止日期的显示为长期。'),tr('左右箭头翻看前后时段，「今天」回到当前。'),tr('日期有问题的项目会标出「日期待修正」，提醒 Owner 修改起止日期。'),tr('右上角可以直接新建项目。')],'list'],
    [tr('横条的样子'),[[tr('样子'), tr('意思')], [tr('实心横条'), tr('有开始和截止日期的项目')], [tr('右端渐隐、画到边缘'), tr('没有截止日期的长期项目')], [tr('虚线框加「日期待修正」'), tr('起止日期有问题，需要 Owner 修改')], [tr('竖线'), tr('今天')]],"table"],
  ]},
  {id:'inbox',title:tr('收件箱'),icon:'inbox',demo:'inbox',lead:tr('所有通知和待你处理的申请。'),parts:[
    [tr('会收到什么'),[tr('任务指派、任务自动开始、任务申请、修改申请、项目申请、协作者加入通知、项目完成审批、沟通区里 @ 到你的消息等。'),tr('需要你处理的申请上直接有按钮：同意创建 / 驳回申请、同意修改、同意完成、去沟通区。'),tr('驳回时要写原因，对方会收到。')],'list'],
    [tr('整理'),[tr('点「全部标为已读」清掉未读。'),tr('点「管理」进入选择模式，勾选后「删除所选」。')]],
    [tr('常见问题'),[[tr('同意或驳回之后还能改吗？'), tr('不能，处理结果会通知对方；如需更改，请对方重新申请。')], [tr('删掉通知会影响任务吗？'), tr('不会，只是从收件箱里移除这条提醒。')]],"faq"],
    [tr('注意'),[tr('已读的普通通知只保留最近 200 条在页面里；未读和待处理的申请不受影响。')],'note'],
  ]},
  {id:'chat',title:tr('沟通区'),icon:'chat',demo:'chat',lead:tr('团队和各项目的聊天频道。'),parts:[
    [tr('频道'),[tr('左侧列出你能进入的频道：「沟通」「闲聊」两个团队频道，以及你参与的每个项目。'),tr('有未读消息的频道显示未读数；顶栏的沟通区图标出现红点。')],'list'],
    [tr('发消息'),[tr('在底部输入后点「发送」，单条不超过 1000 字。'),tr('输入 @ 选择成员，对方会收到通知；@所有人 会通知频道里的全体成员。')]],
    [tr('成员与在线'),[tr('右侧显示频道成员，以及谁在线、最后活跃时间。')],'list'],
    [tr('历史消息'),[tr('频道先显示最近的消息，滚到最上面点「加载更早的消息」继续往前翻。')],"list"],
    [tr('注意'),[tr('项目结项后，它的频道变为只读，沟通记录在成果库里查看；项目被删除时频道消息一并删除。')],'note'],
  ]},
  {id:'archive',title:tr('档案室'),icon:'archive',demo:'archive',lead:tr('每天的个人档案，以及团队日报和周报。'),parts:[
    [tr('我的档案'),[tr('普通成员点档案室右上角的今日按钮，打开今天的档案。'),tr('档案分四栏：今日完成、未完成与阻塞、明日计划和随记；系统会先把当天的工作日志整理进去，你补充后点「保存」。'),tr('档案只有你自己和管理员能看到。'),tr('按月份翻看以前的档案，已记录的日子有标记。')]],
    [tr('团队日报与周报'),[tr('系统每天自动汇总团队日报：完成任务数、完成工时、各项目进展（Owner 汇报或系统汇总）和成员总结。'),tr('管理员可以打开任意一天的日报修改，修改过的会标「已改」。'),tr('周报同时记录本周完成的项目和任务，任务带完成总结与反馈；项目未结项、没有所属项目的任务也会纳入。未完成部分按项目整理，临时待办单列。')]],
    [tr('自动补报'),[tr('开启「系统设置 → 日报与补报 → 自动补报」后，到点时前一天没交项目日报的项目会自动汇总成一份补报，交给 Owner 确认。')]],
    [tr('常见问题'),[[tr('档案没有保存会丢吗？'), tr('系统整理的部分会保留；你补充的内容需要点「保存」。')], [tr('周报从哪天算到哪天？'), tr('按「系统设置 → 日程」里设的每周开始日计算。')]],"faq"],
  ]},
  {id:'achievements',title:tr('成果库'),icon:'award',demo:'achievements',lead:tr('已结项的项目收在项目空间目录的「成果库」里。'),parts:[
    [tr('在哪里'),[tr('项目空间左侧目录里，文件夹下方就是「成果库」。'),tr('点「成果库」，右边列出已结项项目的卡片；点卡片上的「项目文件」打开项目，文件和会议只读。'),tr('管理员看到全部已结项项目；成员看到自己参与过的，可以进入项目文件和沟通记录。')],'list'],
    [tr('管理员看到的内容'),[tr('顶部统计已完成项目数和累计完成的子任务数。'),tr('每个项目一张卡：Owner、结项时间、任务完成情况、生命周期（创建、审批启动、提交结项、完成）和结项报告。'),tr('可以从卡片进入项目文件、沟通记录和项目详情。')],'list'],
    [tr('常见问题'),[[tr('项目怎样进入成果库？'), tr('Owner 提交结项报告并经管理员同意，或管理员直接完成项目。')], [tr('成果库里的项目还能改吗？'), tr('项目、文件和沟通记录都只读，用于查阅和复盘。')]],"faq"],
  ]},
  {id:'assistant',title:tr('AI 助手'),icon:'sparkles',demo:'assistant',lead:tr('用自然语言查询、规划和安排工作。'),parts:[
    [tr('打开与提问'),[tr('点顶栏「AI 助手」打开右侧面板，直接输入问题，比如「今天有哪些任务要交」「团队这周的负载怎么样」。'),tr('点麦克风可以语音输入，再点一次结束并转成文字。'),tr('「对话记录」可以回到以前的对话；生成中可以点「停止」。')]],
    [tr('规划模式'),[tr('点输入框旁的规划按钮，用一句话说要安排的事，比如「下周把季度复盘做完：整理数据、出初稿、找人评审」。'),tr('助手会起草创建、修改或删除的卡片；你逐张检查、修改，接受或拒绝，确认前不会改动任何数据。')]],
    [tr('能做到哪一步'),[tr('每个人的助手权限由规则组决定：关闭、查询与规划，或可代为操作。'),tr('可代为操作时，助手会一步步执行并在每步后核对结果；遇到需要你确认的操作会停下来等「确认执行」。'),tr('面板顶部显示当前模型；管理员配置了多个可选模型时可以切换。还没配置时，管理员可以去「系统设置 → AI 接入与模型」配置。')],'list'],
    [tr('注意'),[tr('助手只能看到你本来就能看到的项目和任务；起草的卡片若缺少信息，会标出需要你补充的地方，不会擅自编造负责人。')],'note'],
    [tr('常见问题'),[[tr('为什么助手说没有权限？'), tr('你所在规则组的助手权限是「关闭」或「查询与规划」，它不能替你改数据。')], [tr('规划的卡片会直接生效吗？'), tr('不会。每张卡片都要你点接受，拒绝的不会留下任何改动。')]],"faq"],
  ]},
  {id:'widget',title:tr('桌面小组件'),icon:'clock',demo:'widget',lead:tr('悬浮在桌面上的今日待办和番茄钟。'),parts:[
    [tr('打开'),[tr('点顶栏的小组件图标，会弹出一个始终在最前的小窗口（需要较新版本的 Chrome 或 Edge）。')]],
    [tr('使用'),[tr('上半部分是番茄钟：专注 25 分钟、休息 5 分钟，可以开始 / 暂停、重置、切换；一轮结束会提醒你。'),tr('下半部分是今天的任务，勾选即记为完成。'),tr('小窗口每分钟自动同步一次。')],'list'],
  ]},
  {id:'search',title:tr('搜索与快捷键'),icon:'search',demo:'search',lead:tr('不用鼠标也能快速到达。'),parts:[
    [tr('搜索'),[tr('按 / 或点顶栏放大镜，输入关键词即可找到任务和项目。'),tr('在系统设置页按 / 是搜索设置项。')],'list'],
    [tr('快捷键'),[tr('? 打开快捷键列表；H 使用教程；N 新建任务；T 今日任务；W 周视图；P 项目空间；I 收件箱；Esc 关闭弹窗或面板。'),tr('在输入框里打字时快捷键不会触发。')],'list'],
  ]},
  {id:'accounts',title:tr('账户管理'),icon:'users',demo:'accounts',lead:tr('管理员可查看账户列表；添加和维护账户仅限 superadmin。'),parts:[
    [tr('添加账户'),[tr('superadmin 点「添加账户」，填写账户名、中文名（可留空）、初始密码和权限组。')]],
    [tr('维护'),[tr('superadmin 可以停用 / 启用账户、重置密码、设置中文名，或调整权限组（superadmin、管理员、普通用户）。'),tr('superadmin 点「管理」可以多选账户批量操作；管理员可查看账户列表，但不能维护账户。')],'list'],
    [tr('三种权限组'),[[tr('权限组'), tr('适合')], ["superadmin", tr('系统所有者，通常只有一位')], [tr('管理员'), tr('负责审批和项目管理，可查看账户列表')], [tr('普通用户'), tr('团队成员，按规则组新建项目和任务')]],"table"],
    [tr('注意'),[tr('删除账户仅限 superadmin，且不可撤销，需要输入账户名确认；仍负责进行中项目或有未完成任务的账户不能删除，要先转交。')],'note'],
  ]},
  {id:'settings',title:tr('系统设置'),icon:'settings',demo:'rules',lead:tr('对全体成员生效的规则，仅管理员可见。'),parts:[
    [tr('查找设置'),[tr('左侧按类别跳转，顶部搜索框可以直接搜设置项。'),tr('改过默认值的设置左侧有一条竖线，点「恢复默认」改回。')],'list'],
    [tr('成员与权限'),[tr('规则组分别设定项目和任务的创建方式（直接创建、需要审批或不允许），以及 AI 助手的使用范围（关闭、查询与规划或可代为操作）。'),tr('点「新建规则组」创建新组并选择成员；没分到任何组的成员按「默认规则」。'),tr('「账户与权限组」进入账户管理。')],'list'],
    [tr('日程'),[tr('每周从哪天开始：影响周视图、档案室的周范围和周报。'),tr('固定任务递延合并：开启后同一固定任务没做完的几期合成一张卡。')],'list'],
    [tr('日报与补报'),[tr('自动补报：开启后到点自动为没交日报的项目生成补报。'),tr('补报时间：每天、每周固定几天或指定日期，再选具体时间。'),tr('立即运行：不等调度器，马上检查一次。')],'list'],
    [tr('会议纪要提示词'),[tr('会议生成纪要时交给 AI 的系统提示词，对所有项目生效。'),tr('可以用 {{title}}、{{agenda}}、{{transcript}} 引用会议标题、议程和原稿。')],'list'],
    [tr('AI 接入与模型'),[tr('来源：添加对话模型来源或语音转写来源，填服务商、名称、API 地址和密钥，「保存并测试」会验证并取回可用模型；可测试、编辑、删除。'),tr('使用场景：对话助手、规划任务、会议纪要、语音转写分别选来源和模型；规划任务和会议纪要可以跟随对话助手。'),tr('单次对话容量：每轮发送给助手的总输入容量，包括指令、历史、工具和查询结果；模型窗口小时选「精简」。')],'list'],
  ]},
  {id:'automation',title:tr('系统自动完成的事'),icon:'clock',demo:'automation',lead:tr('不需要操作，但值得知道的后台规则。'),parts:[
    [tr('每半分钟'),[tr('到点的任务自动开始，并通知项目 Owner。'),tr('按固定任务规则补齐之后的任务。')],'list'],
    [tr('每天'),[tr('没做完的任务递延到下一天，保留递延链。'),tr('23:30 为每位成员整理当天档案；到补报时间生成团队日报，开启自动补报时为没交日报的项目生成补报。')],'list'],
    [tr('时间表'),[[tr('时间'), tr('系统做的事')], [tr('每半分钟'), tr('到点的任务开始；固定任务补齐')], ["23:30", tr('整理每位成员的当天档案')], [tr('零点过后'), tr('没做完的任务递延到第二天')], [tr('补报时间'), tr('汇总团队日报；开启自动补报时生成补报')]],"table"],
    [tr('停机之后'),[tr('服务器停了几天再启动，会一次补上这些天的递延、档案和日报，不会重复也不会漏。')],'note'],
  ]},
];
const GUIDE_KIND={example:tr('例子'),note:tr('注意'),who:tr('谁能用')};
function guidePart([h,items,kind='steps']){
  if(GUIDE_KIND[kind])return `<aside class="guide-callout is-${kind}"><b>${escapeHTML(h===GUIDE_KIND[kind]?h:`${GUIDE_KIND[kind]} · ${h}`)}</b>`
    +items.map(s=>`<p>${escapeHTML(s)}</p>`).join('')+`</aside>`;
  if(kind==='table'){const [head,...rows]=items;return `<section><h3>${escapeHTML(h)}</h3><div class="guide-table"><table>`
    +`<thead><tr>${head.map(c=>`<th>${escapeHTML(c)}</th>`).join('')}</tr></thead>`
    +`<tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`}
  if(kind==='faq')return `<section class="guide-faq"><h3>${escapeHTML(h)}</h3>`
    +items.map(([q,a])=>`<details><summary>${escapeHTML(q)}</summary><p>${escapeHTML(a)}</p></details>`).join('')+`</section>`;
  const tag=kind==='list'?'ul':'ol';
  return `<section><h3>${escapeHTML(h)}</h3><${tag}>${items.map(s=>`<li>${escapeHTML(s)}</li>`).join('')}</${tag}></section>`;
}
function renderGuide(){
  const box=$('#guideContent'),toc=$('#guideToc');if(!box||!toc)return;
  const start=$('#startTourBtn');if(start)start.onclick=startTour;
  toc.innerHTML=GUIDE.map(c=>`<a class="guide-toc-item" href="#guide-${c.id}" data-guide="${c.id}">${icon(c.icon)}<span>${escapeHTML(c.title)}</span></a>`).join('');
  box.innerHTML=GUIDE.map((c,i)=>`<article class="guide-chapter" id="guide-${c.id}" tabindex="-1"><header><span class="guide-index">${String(i+1).padStart(2,'0')}</span>`
    +`<h2>${escapeHTML(c.title)}</h2><p>${escapeHTML(c.lead)}</p></header>`
    +(c.demo?guideDemoHTML(c.demo):'')+c.parts.map(guidePart).join('')+(c.extraDemo?guideDemoHTML(c.extraDemo):'')
    +`</article>`).join('');
  $$('#guideToc [data-guide]').forEach(a=>a.onclick=e=>{e.preventDefault();
    const chapter=$(`#guide-${a.dataset.guide}`);chapter?.scrollIntoView?.({behavior:navReducedMotion()?'auto':'smooth',block:'start'});chapter?.focus?.({preventScroll:true});
    $$('#guideToc [data-guide]').forEach(x=>x.classList.toggle('is-on',x===a))});
  bindGuideDemos(box);
}
/* 导览: a guided walk through the real interface. Each step opens its page,
   lights up one control and explains it beside it, with a short animation of
   what that control does. Steps marked `try` let the person click the lit
   control for real; the tour moves on once they have. Esc leaves, ← → turn the
   page, and the chapter names jump. It runs once per account on first visit and
   any time from 使用教程; it ends where it began. */
const myOpenTask=()=>S.tasks.find(t=>t.assignee===S.user?.id&&['todo','doing'].includes(t.status)&&!isSuperseded(t))
  ||S.tasks.find(t=>t.assignee===S.user?.id&&!isSuperseded(t));
const TOUR=[
  {ch:tr('开始'),title:tr('欢迎来到哗啦！'),body:tr('三分钟走一遍主线：安排任务 → 跟进项目 → 处理收件箱 → 写档案。标着「试一试」的步骤可以直接点亮起来的地方，看它真的怎么动。随时按 [[Esc]] 退出，[[←]] [[→]] 翻页。')},
  {ch:tr('今天'),view:'today',target:'#addTaskBtn',demo:'new-task',title:tr('新建任务'),body:tr('按 [[N]] 或点这里。填好名称、负责人、日期和时长，任务立刻出现在对方的今日任务里，对方收到通知。所在规则组需要审批时，按钮会变成「申请任务」。')},
  {ch:tr('今天'),view:'today',target:'.quick-tabs [data-filter="open"]',done:()=>UI.filter==='open',try:tr('点「待处理」，列表只留下还没做完的'),title:tr('全部 · 待处理 · 已完成'),body:tr('这三个标签切换下面列表的范围，上面的今日进度按已完成的任务计算。')},
  {ch:tr('今天'),view:'today',prep:()=>{const t=myOpenTask();if(t&&$('#taskDrawer').classList.contains('hidden'))openDrawer(t.id)},leave:()=>closeDrawer(),
    target:'#taskDrawer .drawer-actions',demo:'task-life',title:tr('任务详情'),
    body:()=>tr('点任何一张任务卡都会打开这样的详情，这是你的「{0}」。到点自动开始；做完点「记录完成」，写一句总结和实际耗时。完成不需要审批。',myOpenTask()?.name||tr('任务'))},
  {ch:tr('今天'),target:'.sidebar-section [data-filter="inprogress"]',done:()=>UI.filter==='inprogress',try:tr('点「进行中」，只看正在做的任务'),title:tr('快捷筛选'),body:tr('P0 重要任务、进行中、已递延：点一下跳到今日任务，只列出这一类；再点一次回到全部。')},
  {ch:tr('周视图'),view:'calendar',target:'#weekCarousel',demo:'defer',title:tr('一周的安排'),body:tr('七天一列，点某一天看当天的全部任务。当天没做完的，过了零点自动递延到第二天，卡片上写着「由某日递延 · 第 N 次」。')},
  {ch:tr('周视图'),view:'calendar',target:'#nextWeekBtn',done:()=>UI.selectedWeek===tour.trialWeek+1,try:tr('点右边的箭头，翻到下一周'),title:tr('翻周'),body:tr('左右箭头前后翻一周，「本周」回到今天所在的这一周。')},
  {ch:tr('项目'),view:'projects',prep:()=>{if(UI.space)openProjectSpace('')},target:'#projectNav [data-space]:not([data-space=""])',done:el=>UI.space===el.dataset.space,demo:'tree',try:tr('点亮起的项目，它会在右边打开'),title:tr('项目目录'),body:tr('文件夹装着项目，项目下面是会议和文件。选中的那一行有块底色，换选时它会滑过去。拖右边缘调宽窄，点顶部的箭头收起。')},
  {ch:tr('项目'),view:'projects',prep:()=>{const p=visibleProjects()[0];if(p&&!UI.space)openProjectSpace(p.id)},target:'#projectSpace [data-space-tab="files"]',done:()=>UI.spaceTab==='files',try:tr('点「文件」标签'),title:tr('一个项目里'),body:tr('任务、会议、文件、成员、概况五个标签。换到另一个项目时，停留在同一个标签上。')},
  {ch:tr('项目'),view:'projects',target:'#projectActions',demo:'project-life',title:tr('项目从开始到结项'),body:tr('主按钮是新建任务；项目设置、完成项目、退出项目和删除项目都收在「更多」里。Owner 提交结项报告，管理员同意后项目进入成果库。')},
  {ch:tr('收件箱'),view:'inbox',target:'#inboxList .inbox-item, #inboxList',demo:'approval',title:tr('收件箱'),body:tr('指派、审批、@ 你的消息都在这里。需要你处理的申请上直接有「同意」「驳回」，驳回时要写原因。')},
  {ch:tr('沟通'),view:'chat',target:'#chatForm',demo:'chat',title:tr('沟通区'),body:tr('团队频道和每个项目各自的频道。输入 @ 选成员，对方会收到通知；@所有人 通知整个频道。')},
  {ch:tr('档案'),view:'archive',target:'#archiveView .page-intro',demo:'archive',title:tr('档案室'),body:tr('系统每晚把你当天的完成和未完成整理进档案，你补上明日计划和随记；管理员在这里看团队日报和周报。')},
  {ch:tr('助手'),target:'#agentBtn',done:()=>!$('#agentPanel')?.classList.contains('hidden'),try:tr('点一下，打开助手'),title:tr('AI 助手'),body:tr('用一句话查询或安排工作，比如「今天有哪些任务要交」。')},
  {ch:tr('助手'),prep:()=>{if($('#agentPanel')?.classList.contains('hidden'))$('#agentBtn')?.click()},leave:()=>{if(!$('#agentPanel')?.classList.contains('hidden'))$('#agentCloseBtn')?.click()},
    target:'#agentPlanBtn, #agentForm',demo:'assistant',title:tr('规划模式'),body:tr('说一句要安排的事，助手起草几张任务卡片：谁、哪天、多久。你逐张检查后接受，确认前不会改动任何数据。')},
  {ch:tr('助手'),target:'#pipBtn',demo:'widget',title:tr('桌面小组件'),body:tr('悬浮在桌面最前面的今日待办和番茄钟，勾选就记为完成。')},
  {ch:tr('助手'),target:'#searchBtn',demo:'search',title:tr('搜索与快捷键'),body:tr('按 [[/]] 搜任务和项目，[[N]] 新建任务，[[?]] 查看全部快捷键。')},
  {ch:tr('设置'),view:'settings',admin:true,target:'#settingsNav',demo:'rules',title:tr('系统设置'),body:tr('规则组决定谁能直接创建、谁要审批；还有日程、补报、会议纪要提示词和 AI 模型，修改对全员生效。')},
  {ch:tr('完成'),target:'.nav-item[data-view="guide"]',title:tr('就这些'),body:tr('每个功能的详细说明和演示都在「使用教程」里，按 [[H]] 打开；也可以在那里重新开始这段导览。')},
];
const TOUR_KEY='wc-tour-done';
let tour=null,tourOfferTimer=0;
function tourDone(){try{return localStorage.getItem(`${TOUR_KEY}:${S.user?.id}`)==='1'}catch(_){return true}}
function cancelTourOffer(){if(tourOfferTimer)clearTimeout(tourOfferTimer);tourOfferTimer=0}
function tourBusy(){return Boolean(UI.docDirty||meetingLive.session||meetingLive.active
  ||$('#meetingEditor')?.dataset?.dirty==='true'
  ||['#modalBackdrop','#taskDrawer','#agentPanel'].some(s=>{const el=$(s);return el&&!el.classList.contains('hidden')}))}
function offerTour(){
  if(tour||tourOfferTimer||!S.user||tourDone()||window.innerWidth<900)return;
  const owner=S.user.id;
  const offer=()=>{
    tourOfferTimer=0;
    if(tour||S.user?.id!==owner||tourDone()||window.innerWidth<900||document.body.classList.contains('auth-locked'))return;
    if(tourBusy()){tourOfferTimer=setTimeout(offer,1000);return}
    startTour();
  };
  tourOfferTimer=setTimeout(offer,700);
}
function startTour(){
  if(tour||!S.user||document.body.classList.contains('auth-locked')||tourBusy())return;
  cancelTourOffer();
  const steps=TOUR.filter(s=>!s.admin||S.user?.admin);
  tour={i:0,steps,owner:S.user.id,returnFocus:document.activeElement,from:{view:UI.view,filter:UI.filter,week:UI.selectedWeek},
    background:[...document.body.children].map(el=>({el,inert:el.inert}))};
  tourInert(true);
  const veil=document.createElement('div');veil.id='tourVeil';veil.className='tour-veil';
  veil.setAttribute('role','dialog');veil.setAttribute('aria-modal','true');veil.setAttribute('aria-labelledby','tourTitle');
  veil.innerHTML='<div class="tour-spot"></div>'+['top','right','bottom','left','hole'].map(s=>`<div class="tour-block" data-side="${s}"></div>`).join('')
    +'<div class="tour-card" tabindex="-1"></div>';
  document.body.appendChild(veil);
  document.addEventListener('keydown',tourKey,true);document.addEventListener('focusin',tourFocus,true);document.addEventListener('click',tourTried,true);
  window.addEventListener('resize',tourPlace);window.addEventListener('scroll',tourPlace,true);
  tourShow(0,1);
}
/* Outside a 试一试 step the page is inert; during one it is live, and the
   blocks around the light keep every click but the lit control's. */
function tourInert(on){tour?.background.forEach(({el,inert})=>el.inert=on||inert)}
function tourLeave(){
  const step=tour?.steps[tour.i];if(tour?.demoTimer)clearInterval(tour.demoTimer);
  tour?.layoutObserver?.disconnect();if(tour)tour.layoutObserver=null;
  if(tour?.entered){tour.entered=false;step?.leave?.()}
}
function endTour(markDone=true){
  if(!tour)return;tourLeave();const ended=tour;tour=null;
  const assistant=$('#agentPanel');if(assistant&&!assistant.classList.contains('hidden'))$('#agentCloseBtn')?.click();
  $('#tourVeil')?.remove();document.removeEventListener('keydown',tourKey,true);document.removeEventListener('focusin',tourFocus,true);document.removeEventListener('click',tourTried,true);
  window.removeEventListener('resize',tourPlace);window.removeEventListener('scroll',tourPlace,true);
  ended.background.forEach(({el,inert})=>el.inert=inert);
  if(markDone){
    try{localStorage.setItem(`${TOUR_KEY}:${ended.owner}`,'1')}catch(_){}
    if(S.user?.id===ended.owner){
      UI.filter=ended.from.filter;switchView(ended.from.view);
      if(UI.selectedWeek!==ended.from.week){UI.selectedWeek=ended.from.week;if(UI.view==='calendar')renderCalendar()}
      toast(tr('导览结束，随时可以在「使用教程」里重看'));
    }
  }
  const focus=ended.returnFocus;
  if(focus?.isConnected&&focus.getClientRects().length&&!focus.closest('[inert]'))focus.focus({preventScroll:true});
  else $('.nav-item.active')?.focus({preventScroll:true});
}
function tourFocus(e){if(tour&&!e.target.closest('#tourVeil')&&!(tour.try&&tour.target?.contains(e.target)))$('#tourVeil .tour-next')?.focus({preventScroll:true})}
function tourTried(e){
  if(!tour?.try||e.target.closest('#tourVeil'))return;
  if(!tour.target?.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();return}
  if(tour.tried)return;
  const active=tour,i=tour.i,step=tour.steps[i],control=tour.target;tour.tried=true;
  /* Wait until the real click handler has run, then verify its result. */
  setTimeout(()=>{
    if(tour!==active||tour.i!==i)return;
    if(!step.done?.(control)){tour.tried=false;return}
    $('#tourVeil .tour-try')?.classList.add('is-done');
    setTimeout(()=>{if(tour===active&&tour.i===i)tourShow(i+1,1)},navReducedMotion()?150:650);
  },0);
}
function tourKey(e){
  if(!tour)return;
  e.stopPropagation();
  if(e.key==='Escape'){e.preventDefault();endTour();return}
  if(e.key==='Tab'){
    const buttons=[...(tour.try&&tour.target&&!tour.target.disabled?[tour.target]:[]),...$$('#tourVeil button').filter(tourVisible)],i=buttons.indexOf(document.activeElement);
    if(tour.try||i<0||e.shiftKey&&i===0||!e.shiftKey&&i===buttons.length-1){
      e.preventDefault();buttons[i<0?(e.shiftKey?buttons.length-1:0):(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();
    }
    return;
  }
  if(tour.try&&tour.target?.contains(e.target)){
    if(e.key!=='Enter'&&e.key!==' ')e.preventDefault();
    return;
  }
  if(e.key==='Enter'&&e.target.closest('#tourVeil button'))return;
  const go={ArrowRight:1,Enter:1,ArrowLeft:-1}[e.key];
  if(go){e.preventDefault();tourShow(tour.i+go,go)}
}
const tourVisible=el=>Boolean(el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
const tourTarget=step=>step?.target?step.target.split(',').flatMap(s=>$$(s.trim())).find(tourVisible)||null:null;
const tourText=s=>escapeHTML(s).replace(/\[\[(.+?)\]\]/g,'<kbd>$1</kbd>');
function tourShow(i,dir){
  if(!tour)return;
  if(i>=tour.steps.length){endTour();return}
  if(i<0)i=0;
  if(i!==tour.i||tour.entered)tourLeave();
  const step=tour.steps[i];
  if(step.view&&UI.view!==step.view)switchView(step.view);
  step.prep?.();tour.entered=true;tour.i=i;
  const target=tourTarget(step);
  if(step.target&&!target){tourLeave();if(i+dir>=0&&i+dir<tour.steps.length)tourShow(i+dir,dir);else if(dir>0)endTour();return}
  tour.target=target;tour.try=Boolean(step.try&&target);tour.tried=false;tour.trialWeek=UI.selectedWeek;
  tourInert(!tour.try);
  tourReveal(target);
  /* Navigation and demo layout can settle after the window's resize event. */
  if(target&&typeof ResizeObserver==='function'){
    const active=tour;tour.layoutObserver=new ResizeObserver(()=>{if(tour===active)tourPlace()});
    for(let el=target;el&&el!==document.body;el=el.parentElement)tour.layoutObserver.observe(el);
  }
  const chapters=[...new Set(tour.steps.map(s=>s.ch))],last=i===tour.steps.length-1;
  const veil=$('#tourVeil'),card=veil?.querySelector('.tour-card');if(!card)return;
  veil.classList.toggle('is-try',tour.try);
  card.classList.toggle('has-demo',Boolean(step.demo));
  card.innerHTML=`<div class="tour-chapters">${chapters.map(c=>`<button type="button" data-tour-ch="${escapeHTML(c)}"${c===step.ch?' class="is-on" aria-current="step"':''}>${escapeHTML(c)}</button>`).join('')}</div>`
    +`<div class="tour-progress" aria-hidden="true"><i style="width:${((i+1)/tour.steps.length*100).toFixed(1)}%"></i></div>`
    +`<h3 id="tourTitle">${escapeHTML(step.title)}</h3><p>${tourText(typeof step.body==='function'?step.body():step.body)}</p>`
    +(tour.try?`<div class="tour-try">${icon('check')}<span><b>${tr('试一试')}</b>${escapeHTML(step.try)}</span></div>`:'')
    +(step.demo?guideDemoHTML(step.demo).replace(/<button type="button" class="text-btn demo-play">[^<]*<\/button>/,''):'')
    +`<div class="tour-foot"><span class="tour-count">${i+1} / ${tour.steps.length}</span>`
    +`${last?'':tr('<button type="button" class="text-btn tour-skip">跳过</button>')}<span class="tour-gap"></span>`
    +`${i?tr('<button type="button" class="secondary-btn tour-prev">上一步</button>'):''}`
    +`<button type="button" class="primary-btn tour-next">${i===0?tr('开始'):last?tr('完成'):tr('下一步')}</button></div>`;
  card.querySelector('.tour-next').onclick=()=>tourShow(tour.i+1,1);
  const prev=card.querySelector('.tour-prev');if(prev)prev.onclick=()=>tourShow(tour.i-1,-1);
  const skip=card.querySelector('.tour-skip');if(skip)skip.onclick=()=>endTour();
  card.querySelectorAll('[data-tour-ch]').forEach(b=>b.onclick=()=>{const to=tour.steps.findIndex(s=>s.ch===b.dataset.tourCh);if(to>=0)tourShow(to,to<tour.i?-1:1)});
  tourDemo(card);tourPlace();
  setTimeout(()=>{if(tour?.i===i)tourPlace()},300);
  requestAnimationFrame(()=>{tourPlace();const on=card.querySelector('.tour-chapters .is-on');on?.scrollIntoView?.({block:'nearest',inline:'center'});card.querySelector('.tour-next')?.focus({preventScroll:true})});
}
/* Bring the control into view by scrolling the panel it lives in, never the
   page itself: the shell is fixed, so a scrolled document hides the app. */
function tourReveal(el){
  if(!el?.getBoundingClientRect)return;
  for(let box=el.parentElement;box&&box!==document.body;box=box.parentElement){
    const style=getComputedStyle(box);if(!/(auto|scroll)/.test(style.overflowY)||box.scrollHeight<=box.clientHeight)continue;
    const r=el.getBoundingClientRect(),b=box.getBoundingClientRect();
    if(r.top<b.top||r.bottom>b.bottom)box.scrollTop+=r.height>b.height?r.top-b.top-12:r.top-b.top-(b.height-r.height)/2;
    break;
  }
  const page=document.scrollingElement;if(page&&page.scrollTop)page.scrollTop=0;
}
/* The card's demo plays on its own clock; with reduced motion it waits for the dots. */
function tourDemo(card){
  const fig=card.querySelector('.guide-demo');if(!fig)return;
  const n=GUIDE_DEMOS[fig.dataset.demo]?.steps.length||1;
  fig.querySelectorAll('.demo-dot').forEach((d,k)=>d.onclick=()=>{if(tour?.demoTimer)clearInterval(tour.demoTimer);demoStep(fig,k)});
  demoStep(fig,0);if(navReducedMotion())return;
  let held=0;
  tour.demoTimer=setInterval(()=>{const s=Number(fig.dataset.step);if(s===n-1&&held++<1)return;held=0;demoStep(fig,(s+1)%n)},DEMO_STEP_MS);
}
/* The light sits 6px around the control; the card goes below it, above it or
   beside it, whichever fits, and never leaves the window. The blocks cover
   everything but the light. */
function tourCardPosition(box,cw,ch,vw,vh){
  const gap=14,margin=16,clamp=(x,y)=>({x:Math.max(margin,Math.min(x,vw-cw-margin)),y:Math.max(margin,Math.min(y,vh-ch-margin))});
  if(!box)return {...clamp((vw-cw)/2,(vh-ch)/2),clear:true};
  const choices=[clamp(box.x,box.y+box.h+gap),clamp(box.x,box.y-gap-ch),clamp(box.x+box.w+gap,box.y),clamp(box.x-gap-cw,box.y)];
  const clear=p=>p.x+cw+gap<=box.x||p.x>=box.x+box.w+gap||p.y+ch+gap<=box.y||p.y>=box.y+box.h+gap;
  const place=choices.find(clear)||choices[0];
  return {...place,clear:clear(place)};
}
function tourPlace(){
  const veil=$('#tourVeil');if(!tour||!veil)return;
  const spot=veil.querySelector('.tour-spot'),card=veil.querySelector('.tour-card');
  /* A page that re-renders replaces the lit control; find it again. */
  if(tour.target&&!tour.target.isConnected)tour.target=tourTarget(tour.steps[tour.i]);
  const vw=window.innerWidth,vh=window.innerHeight;
  const r=tour.target?.getBoundingClientRect?.();
  let box={x:vw/2,y:vh/2,w:0,h:0};
  if(r){const x=Math.max(4,r.left-6),y=Math.max(4,r.top-6);box={x,y,w:Math.min(vw-4,r.right+6)-x,h:Math.min(vh-4,r.bottom+6)-y}}
  Object.assign(spot.style,{left:`${box.x}px`,top:`${box.y}px`,width:`${box.w}px`,height:`${box.h}px`});
  const px=n=>`${Math.max(0,n)}px`,blocks={top:[0,0,vw,box.y],bottom:[0,box.y+box.h,vw,vh-box.y-box.h],left:[0,box.y,box.x,box.h],right:[box.x+box.w,box.y,vw-box.x-box.w,box.h],hole:[box.x,box.y,box.w,box.h]};
  veil.querySelectorAll('.tour-block').forEach(b=>{const [x,y,w,h]=blocks[b.dataset.side];Object.assign(b.style,{left:px(x),top:px(y),width:px(w),height:px(h)})});
  veil.classList.toggle('is-centered',!r);
  card.classList.remove('is-compact');card.style.maxHeight='';
  const place=()=>tourCardPosition(r?box:null,card.offsetWidth,card.offsetHeight,vw,vh);
  let position=place();
  if(tour.try&&!position.clear){card.classList.add('is-compact');position=place()}
  if(tour.try&&!position.clear){
    card.style.maxHeight=`${Math.max(0,Math.max(box.y-30,vh-box.y-box.h-30))}px`;position=place();
  }
  card.style.left=`${position.x}px`;card.style.top=`${position.y}px`;
}
function renderAll(){
  if(typeof ensureAccountCreateButton==='function')ensureAccountCreateButton();
  $$('.admin-only-nav').forEach(n=>n.classList.toggle('hidden',!S.user?.admin));
  const pm=projectMode();
  ['#addProjectBtn','#addProjectTopBtn','#timelineAddProjectBtn'].forEach(id=>{$(id).innerHTML=entryLabel(pm,'project');$(id).classList.toggle('hidden',pm==='none')});
  const tm=taskEntryMode();
  $('#addTaskBtn').innerHTML=entryLabel(tm,'task');$('#addTaskBtn').classList.toggle('hidden',tm==='none');
  $('#emptyAddBtn').textContent=tm==='approval'?tr('申请任务'):tr('新任务');$('#emptyAddBtn').classList.toggle('hidden',tm==='none');
  $('#createFixedBtn')?.classList.toggle('hidden',!S.user.admin);
  $('#repeatAdminPanel')?.classList.toggle('hidden',!S.user.admin);
  renderRepeats();
  $('#forceAssignBtn').textContent=tr('管理项目与任务');
  $('[data-view="today"]').removeAttribute('disabled');
  applyAvatar($('.workspace-switcher .avatar'),S.user.id);
  $('.workspace-switcher small').textContent=S.user.admin?tr('团队工作区'):tr('成员工作区');
  const meUser=userById(S.user.id)||{};
  $('.workspace-switcher strong').innerHTML=escapeHTML(meUser.displayName||S.user.id)+(meUser.nickname?` <span class="name-tag nick">${escapeHTML(meUser.nickname)}</span>`:'');
  /* 个性签名: one line under the name, cut short here and shown whole on hover
     and in the account menu. */
  $('.workspace-switcher em.signature')?.remove();
  if(meUser.signature)$('.workspace-switcher strong').insertAdjacentHTML('afterend',`<em class="signature" title="${escapeHTML(meUser.signature)}">${escapeHTML(meUser.signature)}</em>`);
  if(!$('#accountMenu')?.classList.contains('hidden'))renderAccountMenu();
  $('#crumbRoot').textContent=S.user.admin?tr('团队工作台'):tr('我的工作台');
  /* superadmin can switch a rule group's assistant off entirely. */
  const agentOff=S.agentCapabilities?.mode==='off';
  $('#agentBtn')?.classList.toggle('hidden',agentOff);
  if(agentOff)$('#agentPanel')?.classList.add('hidden');
  $('.focus-card > span').textContent=S.user.admin?tr('成员今日安排'):tr('今日安排');
  renderStats();renderInbox();renderDraftCount();renderAccounts();renderSettings();switchView(UI.view);
  // Keep single periods too: their first merge from one to two is growth.
  rememberStackSizes();
}

function scheduleTasks(includeHistory){
  const visible=S.tasks.filter(t=>(includeHistory||!isSuperseded(t))&&(!t.projectId||!isProjectHidden(S.projects.find(p=>p.id===t.projectId))));
  if(!S.user)return [];
  if(!S.user?.admin)return visible.filter(t=>t.assignee===S.user.id);
  return UI.member!=='all'?visible.filter(t=>t.assignee===UI.member):visible;
}
/* 人力 numbers cover a project's own dates; one without an end counts only the
   last week and the coming one, not its whole open-ended history. */
function loadWindow(p){return p?.end?[p.start||p.end,p.end]:[add(S.today,-6),add(S.today,7)]}
function loadWindowLabel(p){const [start,end]=loadWindow(p);return p?.end?tr('项目周期内'):tr('近两周（{0}–{1}）',fmt(start),fmt(end))}
/* What someone carries over [start, end]: every task touching those days, less
   what was skipped or handed on by a deferral. */
function memberLoad(id,[start,end],tasks=S.tasks){
  const ts=tasks.filter(t=>t.assignee===id&&!['skipped','deferred'].includes(t.status)&&!isSuperseded(t)&&t.date<=end&&taskEnd(t)>=start);
  return {count:ts.length,mins:ts.reduce((n,t)=>n+Number(t.duration||0),0)};
}
function memberTaskCount(userId,project){return project?memberLoad(userId,loadWindow(project)).count:0}
function renderScheduleScope(){
  const visible=Boolean(S.user?.admin&&['today','calendar','dayDetail'].includes(UI.view));
  $('#scheduleScope').classList.toggle('hidden',!visible);
  if(!visible)return;
  const members=[...new Set([...S.users.map(u=>u.id),...S.tasks.map(t=>t.assignee)])];
  if(UI.member!=='all'&&!members.includes(UI.member))UI.member='all';
  const select=$('#scheduleMember');
  select.innerHTML=tr('<option value="all">全部成员（含管理员）</option>')+members.map(id=>`<option value="${escapeHTML(id)}">${escapeHTML(id)}</option>`).join('');
  select.value=UI.member;
  const dates=UI.view==='calendar'?week(UI.selectedWeek):[UI.view==='dayDetail'?UI.detailDate:displayDay()];
  const tasks=scheduleTasks().filter(t=>dates.some(d=>taskActiveOn(t,d)));
  $('#scheduleScopeTitle').textContent=UI.member==='all'?tr('全部成员的安排'):tr('{0} 的安排',UI.member);
  $('#scheduleScopeHint').textContent=tr('{0} {1} 项任务 · {2} 人有安排',UI.view==='calendar'?tr('当前周'):tr('当日'),tasks.length,new Set(tasks.map(t=>t.assignee)).size);
  select.onchange=()=>{UI.member=select.value;renderStats();switchView(UI.view)};
}
const projectStatus=p=>projectOverdue(p)?tr('已逾期 {0} 天',projectOverdue(p)):({active:tr('进行中'),pending:tr('待审批'),pending_completion:tr('完成待审批'),rejected:tr('已驳回'),paused:tr('已暂停'),done:tr('已完成'),archived:tr('已归档')}[p.status]||tr('未设置'));
/* Passing the end date does not close a project; it shows as overdue until it is completed or moved. */
const isProjectHidden=p=>Boolean(p&&(p.status==='done'||p.status==='archived'));
const projectOverdue=p=>p?.status==='active'&&p.end&&S.today&&p.end<S.today?daysCount(p.end,S.today):0;
const visibleProjects=()=>S.projects.filter(p=>!isProjectHidden(p));
// Finished projects are removed from the normal `projects` snapshot so they
// no longer appear in calendars/timelines.  Superadmin's成果库 is backed by
// the dedicated archive payload and includes its de-duplicated task leaves.
const completedProjects=()=>S.user?.admin?((Array.isArray(S.achievements)&&S.achievements.length?S.achievements:S.projects.filter(p=>['done','archived'].includes(p.status))).slice().sort((a,b)=>String(b.completedAt||b.end||b.createdAt||'').localeCompare(String(a.completedAt||a.end||a.createdAt||'')) )):[];
function achievementLifecycle(project,tasks=[]){
  const doneTasks=tasks.filter(t=>t.status==='done');
  const latestTaskDone=doneTasks.map(t=>t.completedAt||t.approvedAt||t.date).filter(Boolean).sort().at(-1)||'';
  return [
    {key:'created',label:tr('创建'),at:String(project.createdAt||project.start||'').slice(0,10)},
    {key:'started',label:tr('启动'),at:String(project.start||'').slice(0,10)},
    {key:'tasks',label:tr('子任务完成'),at:String(latestTaskDone).slice(0,10),meta:`${doneTasks.length}/${tasks.length}`},
    {key:'submitted',label:tr('结项申请'),at:String(project.completionRequestedAt||'').slice(0,10)},
    {key:'completed',label:tr('审批完成'),at:String(project.completedAt||project.end||'').slice(0,10)}
  ];
}
/* A finished project carries its own task leaves in the archive payload. */
function projectTasks(p) {
  return Array.isArray(p.tasks) ? p.tasks : S.tasks.filter(t => t.projectId === p.id);
}
/* 成果库 is a shelf in the project space: superadmin and 管理员 see every
   finished project with its lifecycle and report; a member sees the finished
   projects they worked on, whose files and meetings stay readable. */
const shelfProjects=()=>S.user?.admin?completedProjects()
  :(S.fileArchives||[]).slice().sort((a,b)=>String(b.completedAt||b.end||'').localeCompare(String(a.completedAt||a.end||'')));
function openAchievements(){
  if(meetingLive.session||meetingLive.active)return meetingStopLive().then(()=>openAchievements()).catch(e=>toast(e.message));
  if($('#meetingEditor')?.dataset?.dirty==='true'&&!confirm(tr('会议修改尚未保存，确定离开？')))return;
  cancelMeetingOpen();
  UI.shelf='achievements';UI.space='';UI.folder='';
  if(UI.view!=='projects')switchView('projects');else renderProjects();
  $('.main-content')?.scrollTo?.({top:0,behavior:'smooth'});
}
function renderAchievements(){
  const admin=Boolean(S.user?.admin),grid=$('#achievementGrid'),empty=$('#achievementEmpty'),stats=$('#achievementStats');
  const projects=shelfProjects(),eyebrow=$('#projectsView .eyebrow'),title=$('#projectsView h1');
  if(eyebrow)eyebrow.innerHTML=`${crumb(tr('全部项目'),'')} · ${tr('{0} 个已结项',projects.length)}`;
  if(title)title.textContent=tr('成果库');
  bindCrumbs();
  if(stats&&!admin)stats.innerHTML=`<div class="achievement-stat"><span>${tr('我参与的已结项项目')}</span><strong>${projects.length}</strong></div>`;
  else if(stats){const totalTasks=projects.reduce((n,p)=>n+projectTasks(p).length,0),doneTasks=projects.reduce((n,p)=>n+projectTasks(p).filter(t=>t.status==='done').length,0);stats.innerHTML=`<div class="achievement-stat"><span>${tr('已完成项目')}</span><strong>${projects.length}</strong></div><div class="achievement-stat"><span>${tr('累计完成子任务')}</span><strong>${doneTasks}</strong><small>${tr('共 {0} 项',totalTasks)}</small></div><div class="achievement-stat"><span>${tr('最近结项')}</span><strong>${projects[0]?escapeHTML(String(projects[0].completedAt||projects[0].end||'').slice(0,10)):'—'}</strong>${projects[0]?`<small>${escapeHTML(projects[0].name)}</small>`:''}</div>`}
  if(empty)empty.classList.toggle('hidden',projects.length>0);
  if(!grid)return;
  grid.innerHTML=projects.map(p=>{
    if(!admin)return memberShelfCard(p);
    const tasks=sortTasks(projectTasks(p)),done=tasks.filter(t=>t.status==='done').length,stages=achievementLifecycle(p,tasks);
    return `<article class="achievement-card" data-project="${escapeHTML(p.id)}"><div class="achievement-card-head"><div><span class="achievement-kicker">${tr('已归档成果')}</span><h2>${escapeHTML(p.name)}</h2><p>${escapeHTML(p.desc||tr('暂无项目描述'))}</p></div><span class="achievement-status">${projectStatus(p)}</span></div><div class="achievement-meta"><span>Owner · <b>${escapeHTML(p.owner?nameOf(p.owner):'—')}</b></span><span>${tr('任务完成 ·')} <b>${done}/${tasks.length}</b></span><span>${tr('完成于 ·')} <b>${escapeHTML(String(p.completedAt||p.end||'—').slice(0,10))}</b></span></div><div class="achievement-actions">${(S.fileArchives||[]).some(x=>x.id===p.id)?`<button class="ghost-btn achievement-files" data-project="${escapeHTML(p.id)}">${tr('项目文件')}</button>`:''}<button class="ghost-btn open-channel-archive" data-project="${escapeHTML(p.id)}" data-name="${escapeHTML(p.name)}">${tr('沟通记录')}</button></div><ol class="achievement-lifecycle">${stages.map((s,i)=>`<li class="${s.at?'is-complete':''}"><i></i><span><b>${escapeHTML(s.label)}</b><small>${escapeHTML(s.at||tr('未记录'))}${s.meta?` · ${escapeHTML(s.meta)}`:''}</small></span>${i<stages.length-1?'<em></em>':''}</li>`).join('')}</ol>${p.completionReport?`<div class="achievement-report"><span>${tr('结项报告')}</span><p>${escapeHTML(p.completionReport)}</p></div>`:''}<div class="achievement-actions"><button class="secondary-btn achievement-open" data-project="${escapeHTML(p.id)}">${tr('查看项目详情')}</button></div></article>`;
  }).join('');
  $$('#achievementGrid .achievement-open').forEach(b=>b.onclick=()=>openWorkLogDetail('',b.dataset.project,'project'));
  $$('#achievementGrid .achievement-files').forEach(b=>b.onclick=()=>openProjectSpace(b.dataset.project));
}
const memberShelfCard=p=>`<article class="achievement-card" data-project="${escapeHTML(p.id)}"><div class="achievement-card-head"><div>`
  +`<span class="achievement-kicker">${tr('已归档成果')}</span><h2>${escapeHTML(p.name)}</h2></div><span class="achievement-status">${projectStatus(p)}</span></div>`
  +`<div class="achievement-meta"><span>Owner · <b>${escapeHTML(p.owner?nameOf(p.owner):'—')}</b></span>`
  +`<span>${tr('完成于')} · <b>${escapeHTML(String(p.completedAt||p.end||'—').slice(0,10))}</b></span></div>`
  +`<div class="achievement-actions"><button class="ghost-btn achievement-files" data-project="${escapeHTML(p.id)}">${tr('项目文件')}</button>`
  +`<button class="ghost-btn open-channel-archive" data-project="${escapeHTML(p.id)}" data-name="${escapeHTML(p.name)}">${tr('沟通记录')}</button></div></article>`;
/* Work-log rows and 成果库 cards open the live task or project while it is still
   in the snapshot. A finished project only lives in the archive payload, so it
   opens as a read-only summary instead; one known only by its archived files
   opens its read-only project space. */
function openWorkLogDetail(taskId,projectId,kind){
  if(taskId&&kind!=='project'&&S.tasks.some(t=>t.id===taskId))return openDrawer(taskId);
  if(!projectId){toast(tr('这条记录已不在当前数据中'));return}
  if(visibleProjects().some(p=>p.id===projectId))return openProjectSpace(projectId);
  const p=completedProjects().find(x=>x.id===projectId);
  if(!p&&(S.fileArchives||[]).some(x=>x.id===projectId))return openProjectSpace(projectId);
  if(!p){toast(tr('这个项目已不在当前数据中'));return}
  const tasks=sortTasks(projectTasks(p)),done=tasks.filter(t=>t.status==='done').length;
  openModal(`<div class="eyebrow">${tr('已归档成果')}</div><h2>${escapeHTML(p.name)}</h2>${p.desc?`<p>${escapeHTML(p.desc)}</p>`:''}`
    +`<div class="detail-grid"><div><span>${tr('项目 Owner')}</span><strong>${escapeHTML(p.owner?nameOf(p.owner):'—')}</strong></div>`
    +`<div><span>${tr('项目状态')}</span><strong>${projectStatus(p)}</strong></div><div><span>${tr('任务完成')}</span><strong>${done}/${tasks.length}</strong></div>`
    +`<div><span>${tr('完成于')}</span><strong>${escapeHTML(String(p.completedAt||p.end||'—').slice(0,10))}</strong></div></div>`
    +`${p.completionReport?`<div class="completion-summary"><span>${tr('结项报告')}</span><p>${escapeHTML(p.completionReport)}</p></div>`:''}`
    +`${tasks.length?`<div class="detail-grid">${tasks.map(t=>`<div><span>${escapeHTML(t.name)}</span><strong>${escapeHTML(t.assignee?nameOf(t.assignee):'—')} · ${status(t)[1]}</strong></div>`).join('')}</div>`:''}`
    +`<div class="modal-footer"><button class="secondary-btn" id="closeWorkLogDetail">${tr('关闭')}</button></div>`);
  const close=$('#closeWorkLogDetail');
  close.onclick=closeModal;
  close.focus?.();
}
const DAY_MS=86400000;
const dateNumber=iso=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))return null;
  const value=Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===iso?Math.floor(value/DAY_MS):null;
};
const dateFromNumber=n=>new Date(n*DAY_MS).toISOString().slice(0,10);
function timelineModel(projects,today){
  const todayDay=dateNumber(today);
  const rows=projects.filter(project=>!isProjectHidden(project,today)).map(project=>{
    const start=dateNumber(project.start),end=project.end?dateNumber(project.end):null;
    const invalid=start===null||(project.end&&(end===null||end<start));
    return {project,start,end,invalid:Boolean(invalid),openEnded:!project.end};
  }).sort((a,b)=>(a.start??Infinity)-(b.start??Infinity)||a.project.name.localeCompare(b.project.name,'zh'));
  const valid=rows.filter(r=>!r.invalid);
  const start=Math.min(todayDay-7,...valid.map(r=>r.start));
  const end=Math.max(todayDay+90,...valid.map(r=>(r.end??r.start)+14));
  return {start,end,today:todayDay,days:end-start+1,rows:rows.map(r=>({...r,offset:r.invalid?0:r.start-start,span:r.invalid?0:(r.end??end)-r.start+1}))};
}
function renderTimeline(){
  const model=timelineModel(S.projects,S.today),horizon=dateNumber(DATE_HORIZON);
  if(horizon!==null&&horizon>model.end){model.end=horizon;model.rows=model.rows.map(r=>r.openEnded?({...r,span:horizon-r.start+1}):r)}
  const dayWidth=32,scroll=$('#timelineScroll'),grid=$('#timelineGrid');
  $('#timelineProjectCount').textContent=tr('{0} 个项目',model.rows.length);
  $('#timelineEmpty').classList.toggle('hidden',model.rows.length>0);
  scroll.classList.toggle('hidden',model.rows.length===0);
  
  grid.style.setProperty('--day-width',`${dayWidth}px`);
  grid.style.setProperty('--track-width',`${model.days*dayWidth}px`);
  const days=Array.from({length:model.days},(_,i)=>{const n=model.start+i,iso=dateFromNumber(n),d=new Date(n*DAY_MS);return {n,iso,day:d.getUTCDate(),dow:d.getUTCDay(),month:iso.slice(0,7)}});
  const months=[];
  for(const d of days){const last=months.at(-1);if(last?.month===d.month)last.count++;else months.push({month:d.month,offset:d.n-model.start,count:1})}
  const todayLine=`<i class="gantt-today-line" style="left:${(model.today-model.start+.5)*dayWidth}px" aria-hidden="true"></i>`;
  grid.innerHTML=`<div class="gantt-header"><div class="gantt-corner"><strong>${tr('项目 / Owner')}</strong></div><div class="gantt-axis"><div class="gantt-months">${months.map(m=>`<span style="left:${m.offset*dayWidth}px;width:${m.count*dayWidth}px"><b>${monthLabel(m.month)}</b></span>`).join('')}</div><div class="gantt-dates">${days.map(d=>`<div class="gantt-date ${[0,6].includes(d.dow)?'weekend':''} ${d.n===model.today?'is-today':''}" title="${d.iso}"><strong>${d.day}</strong><small>${[tr('日'),tr('一'),tr('二'),tr('三'),tr('四'),tr('五'),tr('六')][d.dow]}</small></div>`).join('')}</div></div></div>${model.rows.map((r,i)=>{
    const p=r.project,palette=['blue','green','purple','gold','coral'][i%5],range=r.invalid?tr('日期待修正'):`${p.start} → ${p.end||tr('未设截止')}`;
    return `<div class="gantt-row" data-project="${escapeHTML(p.id)}"><div class="gantt-project"><div><i class="project-color ${palette}"></i><strong title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</strong></div><small>${escapeHTML(nameOf(p.owner))} <span>· ${projectStatus(p)}</span></small><span class="gantt-range">${escapeHTML(range)}</span></div><div class="gantt-track">${todayLine}${r.invalid?tr('<span class="gantt-invalid">请修正项目起止日期</span>'):`<div class="gantt-bar ${palette} ${r.openEnded?'open-ended':''} ${['pending','rejected'].includes(p.status)?'awaiting':''}" style="left:${r.offset*dayWidth+3}px;width:${Math.max(26,r.span*dayWidth-6)}px" tabindex="0" aria-label="${escapeHTML(p.name)}，${escapeHTML(range)}，${projectStatus(p)}" title="${escapeHTML(p.name)} · ${escapeHTML(nameOf(p.owner))}\n${escapeHTML(range)} · ${projectStatus(p)}"><span>${escapeHTML(p.name)}${r.openEnded?tr(' · 未设截止 →'):''}</span></div>`}</div></div>`;
  }).join('')}`;
  const updateRange=()=>{
    UI.timelineScroll=scroll.scrollLeft;
    const labelWidth=grid.querySelector('.gantt-corner')?.offsetWidth||220;
    const visibleDays=Math.max(1,Math.floor((scroll.clientWidth-labelWidth)/dayWidth));
    const first=model.start+Math.floor(scroll.scrollLeft/dayWidth);
    const last=Math.min(model.end,first+visibleDays-1);
    $('#timelineVisibleRange').textContent=model.rows.length?`${dateFromNumber(first)} — ${dateFromNumber(last)}`:'';
  };
  scroll.onscroll=updateRange;
  const smooth=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  $('#timelinePrev').onclick=()=>scroll.scrollBy({left:-dayWidth*7,behavior:smooth()});
  $('#timelineNext').onclick=()=>scroll.scrollBy({left:dayWidth*7,behavior:smooth()});
  $('#timelineToday').onclick=()=>scroll.scrollTo({left:Math.max(0,(model.today-model.start-3)*dayWidth),behavior:smooth()});
  scroll.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();scroll.scrollBy({left:dayWidth*3*(e.key==='ArrowRight'?1:-1),behavior:smooth()})}};
  scroll.scrollLeft=UI.timelineScroll??Math.max(0,(model.today-model.start-3)*dayWidth);
  updateRange();
}

/* ---------------------------------------------------------------------------
   桌面小组件 · today's to-dos and a pomodoro in an always-on-top window. It uses
   Document Picture-in-Picture (Chrome / Edge 116+ on desktop); browsers without
   it never see the button. The timer lives in localStorage, so closing the
   window or reloading the page does not lose a running pomodoro.
   ------------------------------------------------------------------------- */
const POMO_KEY='wc-pomodoro',POMO_SECONDS={focus:25*60,rest:5*60};
const PIP_CSS=`:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1F1B15;background:#FFFDF9}
body{margin:0;padding:14px 14px 10px;font-size:13px;line-height:1.45}
header{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:10px}
header strong{font-size:15px}
small{color:#7C7466;font-size:11.5px}
.pomo{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:6px 12px;padding:10px 12px;border:1px solid #E2DDD0;border-radius:10px;background:#F7F4ED;margin-bottom:10px;transition:background .3s,border-color .3s}
.pomo b{font:600 28px/1 ui-monospace,Consolas,monospace;grid-row:span 2}
.pomo span{color:#7C7466;font-size:12px}
.pomo div{display:flex;gap:6px;flex-wrap:wrap}
button{font:inherit;font-size:12px;border:1px solid #D2CBBB;background:#FFFDF9;color:inherit;border-radius:7px;padding:3px 9px;cursor:pointer}
button.primary{background:#D97757;border-color:#C05F41;color:#fff}
body.pomo-ring .pomo{border-color:#D97757;background:#FBF1EA}
ul{list-style:none;margin:0;padding:0}
li{padding:7px 2px;border-top:1px solid #EDE9DE}
li label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
li input{margin:2px 0 0;accent-color:#D97757}
li small{display:block;padding-left:22px}
li.closed span{color:#9E9688;text-decoration:line-through}
li.empty{color:#7C7466;text-align:center;padding:18px 0}
#pipNote{min-height:16px;margin:8px 0 0;color:#C05F41;font-size:12px}`;
let pipWindow=null,pipTimers=[];
const pipSupported=()=>typeof window!=='undefined'&&'documentPictureInPicture' in window;
function pomoRead(){try{const v=JSON.parse(localStorage.getItem(POMO_KEY)||'null');if(v&&POMO_SECONDS[v.mode])return v}catch(_){}return {mode:'focus',left:POMO_SECONDS.focus,endsAt:null}}
function pomoWrite(v){try{localStorage.setItem(POMO_KEY,JSON.stringify(v))}catch(_){}}
const pomoLeft=v=>v.endsAt?Math.max(0,Math.ceil((v.endsAt-Date.now())/1000)):Number(v.left)||0;
const pomoFresh=mode=>({mode,left:POMO_SECONDS[mode],endsAt:null});
function pomoAction(kind){
  let v=pomoRead();
  if(kind==='toggle')v=v.endsAt?{...v,left:pomoLeft(v),endsAt:null}:{...v,endsAt:Date.now()+pomoLeft(v)*1000};
  if(kind==='reset')v=pomoFresh(v.mode);
  if(kind==='switch')v=pomoFresh(v.mode==='focus'?'rest':'focus');
  pomoWrite(v);renderPomo();
}
function renderPomo(){
  const doc=pipWindow?.document;if(!doc?.querySelector('#pipClock'))return;
  let v=pomoRead();
  if(v.endsAt&&pomoLeft(v)===0){
    // A finished round flips to the other mode and waits to be started.
    v=pomoFresh(v.mode==='focus'?'rest':'focus');pomoWrite(v);
    doc.body.classList.add('pomo-ring');setTimeout(()=>doc.body.classList.remove('pomo-ring'),6000);
    pipNote(v.mode==='rest'?tr('专注结束，休息一下'):tr('休息结束，开始下一轮专注'));
  }
  const left=pomoLeft(v);
  doc.querySelector('#pipClock').textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
  doc.querySelector('#pipMode').textContent=v.mode==='focus'?tr('专注 25 分钟'):tr('休息 5 分钟');
  doc.querySelector('[data-pomo="toggle"]').textContent=v.endsAt?tr('暂停'):tr('开始');
  doc.querySelector('[data-pomo="switch"]').textContent=v.mode==='focus'?tr('切到休息'):tr('切到专注');
}
function pipNote(text){const note=pipWindow?.document.querySelector('#pipNote');if(!note)return;note.textContent=text;clearTimeout(note._t);note._t=setTimeout(()=>{note.textContent=''},4000)}
function renderPip(){
  const doc=pipWindow?.document;if(!doc?.querySelector('#pipList')||!S.user)return;
  const open=t=>['todo','doing'].includes(t.status);
  const tasks=sortTasks(scheduleTasks().filter(t=>taskActiveOn(t,S.today)&&!isArchivedTask(t))).sort((a,b)=>open(b)-open(a));
  const tickable=t=>!S.user.admin&&t.assignee===S.user.id&&open(t);
  doc.querySelector('#pipSummary').textContent=tr('{0} · 还剩 {1} 项',fmt(S.today),tasks.filter(open).length);
  doc.querySelector('#pipList').innerHTML=tasks.map(t=>`<li class="${open(t)?'':'closed'}"><label><input type="checkbox" data-id="${escapeHTML(t.id)}" ${open(t)?'':'checked'} ${tickable(t)?'':'disabled'}><span>${escapeHTML(t.name)}${t.stackCount>1?` ${tr('· {0} 期',t.stackCount)}`:''}</span></label><small>${escapeHTML([t.time,S.user.admin?nameOf(t.assignee):'',projectName(t),open(t)?'':status(t)[1]].filter(Boolean).join(' · '))}</small></li>`).join('')||tr('<li class="empty">今天没有待办</li>');
  doc.querySelectorAll('#pipList input[data-id]:not([disabled])').forEach(box=>box.onchange=()=>pipComplete(box));
}
async function pipComplete(box){
  const t=S.tasks.find(x=>x.id===box.dataset.id);if(!t)return;
  box.disabled=true;
  try{
    await api('/api/action',{action:'task.complete',data:{id:t.id,summary:'完成任务',...(t.stackCount>1?{stackPeriods:t.stackPeriods}:{}),actual:Number(t.duration)||30,feeling:'顺利'}});
    await refresh();pipNote(tr('「{0}」已完成',t.name));
  }catch(e){box.checked=false;box.disabled=false;pipNote(e.message)}
}
async function openPip(){
  if(!pipSupported())return;
  if(pipWindow){pipWindow.focus();return}
  try{pipWindow=await documentPictureInPicture.requestWindow({width:320,height:460})}catch(e){toast(tr('无法打开桌面小组件：{0}',e.message));return}
  const doc=pipWindow.document;
  doc.title=tr('今日待办');
  const style=doc.createElement('style');style.textContent=PIP_CSS;doc.head.append(style);
  doc.body.innerHTML=tr('<header><strong>今日待办</strong><small id="pipSummary"></small></header><section class="pomo"><b id="pipClock">25:00</b><span id="pipMode"></span><div><button class="primary" data-pomo="toggle">开始</button><button data-pomo="reset">重置</button><button data-pomo="switch">切到休息</button></div></section><ul id="pipList"></ul><p id="pipNote"></p>');
  doc.querySelectorAll('[data-pomo]').forEach(b=>b.onclick=()=>pomoAction(b.dataset.pomo));
  renderPip();renderPomo();
  // The widget stays current while the main tab sits in the background.
  pipTimers=[setInterval(renderPomo,1000),setInterval(()=>refresh(),60000)];
  pipWindow.addEventListener('pagehide',()=>{pipTimers.forEach(clearInterval);pipTimers=[];pipWindow=null});
}
/* ---------------------------------------------------------------------------
   档案室 · one line-drawn archive box per month, its folders standing newest
   at the front. The arrows change the box. Sliding the pointer across the box
   or along the date ruler picks a folder, which lifts clear of the stack and
   reads out in the caption; a click opens the whole brief. The snapshot only
   carries index cards; the full brief is fetched on open.
   ------------------------------------------------------------------------- */
const WEEKDAY_SHORT=[tr('周日'),tr('周一'),tr('周二'),tr('周三'),tr('周四'),tr('周五'),tr('周六')];
const briefCards=()=>(S.reports||[]).filter(r=>r.kind==='brief');
function archiveDrawers(cards){
  const months=new Map();
  for(const card of [...cards].sort((a,b)=>String(b.date).localeCompare(String(a.date)))){
    const key=String(card.date).slice(0,7);
    if(!months.has(key))months.set(key,[]);
    months.get(key).push(card);
  }
  return [...months].map(([month,files])=>({month,files}));
}
const hours=minutes=>(Number(minutes||0)/60).toFixed(1);
const archiveDay=date=>{const d=new Date(`${date}T12:00:00`);return tr('{0}月{1}日 · {2}',d.getMonth()+1,d.getDate(),WEEKDAY_SHORT[d.getDay()])};
function archiveFile(card,index,picked=false){
  const d=new Date(`${card.date}T12:00:00`),t=card.totals||{},mine=card.kind==='diary';
  const body=mine?`<strong>${card.date===S.today?tr('今天'):tr('我的档案')} · ${archiveDay(card.date)}</strong><span>${tr('完成 {0}/{1} 项 · {2}h',t.completed||0,t.tasks||0,hours(t.load))}</span><span>${{manual:tr('已记录'),auto:tr('系统整理'),draft:tr('待记录')}[card.source]||''}</span>`
    :`<strong>${tr('团队日报 · {0}',archiveDay(card.date))}</strong><span>${tr('完成 {0}/{1} 项 · {2}h',t.completed||0,t.tasks||0,hours(t.load))}</span><span>${tr('{0} 位成员 · {1} 个项目{2}',t.members||0,t.projects||0,card.riskCount?` ${tr('· {0} 条关注',card.riskCount)}`:'')}</span>`;
  return `<button class="archive-file${picked?' is-picked':''}" data-date="${escapeHTML(card.date)}" style="--i:${index};--tab:${index%4}" tabindex="-1" aria-label="${escapeHTML(card.date)} ${mine?tr('我的档案'):tr('团队日报')}"><span class="file-sheet" aria-hidden="true"><span class="file-tab"><b>${d.getDate()}</b>${WEEKDAY_SHORT[d.getDay()]}</span><span class="file-face"></span></span><span class="file-body" hidden>${body}</span></button>`;
}
function archiveBox(month,files,pick){
  const [year,mon]=month.split('-');
  return `<div class="drawer-stage" style="--n:${files.length}"><div class="open-drawer"><span class="od-ground"></span><span class="od-floor"></span><span class="od-side is-left"></span><span class="od-side is-right"></span><span class="od-back"></span>${files.map((f,i)=>archiveFile(f,i,f.date===pick)).join('')}<span class="od-front"><span class="od-label"><b>${tr('{0} 月',Number(mon))}</b><small>${tr('{0} · {1} 份',escapeHTML(year),files.length)}</small></span><span class="od-pull"></span></span></div></div>`;
}
/* Ticks sit where their day falls in the month, so gaps in the record show.
   The pointer stands on the picked tick and carries its day. */
const rulerAt=(day,days)=>((Math.min(days,Math.max(1,day))-1)/(days-1)*100).toFixed(2);
const pointerText=date=>`${Number(date.slice(8,10))} ${WEEKDAY_SHORT[new Date(`${date}T12:00:00`).getDay()]}`;
function archiveRuler(month,files,pick){
  const [y,m]=month.split('-').map(Number),days=new Date(y,m,0).getDate(),
  at=date=>rulerAt(Number(String(date).slice(8,10)),days);
  const ticks=[...files].reverse().map((f,k)=>`<span class="ruler-tick${f.date===pick?' is-picked':''}" data-date="${escapeHTML(f.date)}" style="--at:${at(f.date)}%;--k:${k}"><b>${Number(String(f.date).slice(8,10))}</b></span>`).join('');
  const pointer=pick?`<span class="ruler-pointer" style="--at:${at(pick)}%"><b>${pointerText(pick)}</b></span>`:'';
  return tr('<div class="archive-ruler" role="slider" tabindex="0" aria-label="选择日期" aria-valuemin="1" aria-valuemax="')
    +`${days}" aria-valuenow="${Number(String(pick||'').slice(8,10))||1}" aria-valuetext="${pick?archiveDay(pick):''}">`
    +`<span class="ruler-end">1</span><div class="ruler-track"><span class="ruler-week" aria-hidden="true"></span>`
    +`${ticks}${pointer}</div><span class="ruler-end">${days}</span></div>`;
}
const archiveStill=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||!document.body.animate;
function renderArchive(){
  const root=$('#archiveCabinet');if(!root)return;
  const admin=Boolean(S.user?.admin),cards=archiveCards(),drawers=archiveDrawers(cards),months=drawers.map(x=>x.month);
  if(!months.includes(UI.archiveMonth))UI.archiveMonth=months[0]||null;
  const files=drawers.find(x=>x.month===UI.archiveMonth)?.files||[];
  if(!files.some(f=>f.date===UI.archivePick))UI.archivePick=files[0]?.date||null;
  $('#archiveEyebrow').textContent=tr('{0} · {1} 份',admin?tr('团队日报'):tr('我的档案'),cards.length);
  $('#archiveTodayBtn')?.classList.toggle('hidden',admin);
  $('#archiveExportBtn')?.classList.toggle('hidden',!admin);
  renderArchiveLedger(UI.archivePick);
  /* Refreshes re-render every view; leave the box alone unless something in it
     changed, so the picked folder does not drop back mid-slide. */
  const key=JSON.stringify([cards,UI.archiveMonth]);
  if(root.dataset.key===key)return;
  root.dataset.key=key;
  if(!files.length){root.innerHTML=`<div class="archive-room is-empty"><div class="empty-state"><div class="empty-icon">${icon('archive')}</div><h3>${tr('档案室还是空的')}</h3></div></div>`;return}
  const at=months.indexOf(UI.archiveMonth),[year,mon]=UI.archiveMonth.split('-');
  root.innerHTML=`<div class="archive-room"><header class="box-title"><strong>${tr('{0} 年 {1} 月',escapeHTML(year),Number(mon))}</strong><small>${tr('{0} 份',files.length)}</small></header><div class="box-stage">${archiveBox(UI.archiveMonth,files,UI.archivePick)}<button class="box-step is-prev" data-step="1"${at<months.length-1?'':' disabled'} aria-label="${tr('上一个月')}">${icon('chevron-left')}</button><button class="box-step is-next" data-step="-1"${at>0?'':' disabled'} aria-label="${tr('下一个月')}">${icon('chevron-right')}</button></div><footer class="box-foot"><div class="drawer-caption"><div class="caption-body" aria-live="polite"></div><button class="secondary-btn caption-open">${tr('打开')}</button></div>${archiveRuler(UI.archiveMonth,files,UI.archivePick)}</footer></div>`;
  bindArchive();
  fitArchiveDrawer(root.querySelector('.drawer-stage'));
  pickArchive(UI.archivePick,true);
}
/* The pointer glides to the picked tick unless the hand is on the ruler, and its
   label bumps when the day changes. */
function pickArchive(date,force=false){
  const root=$('#archiveCabinet'),file=date&&root?.querySelector(`.archive-file[data-date="${date}"]`);if(!file)return;
  const ruler=root.querySelector('.archive-ruler'),pointer=root.querySelector('.ruler-pointer'),tick=root.querySelector(`.ruler-tick[data-date="${date}"]`);
  if(pointer&&tick&&!ruler.classList.contains('is-tracking'))pointer.style.setProperty('--at',tick.style.getPropertyValue('--at'));
  if(!force&&file.classList.contains('is-picked'))return;
  UI.archivePick=date;
  /* The admin's log and load follow the picked day, once the hand settles. */
  if(S.user?.admin){clearTimeout(UI.ledgerTimer);UI.ledgerTimer=setTimeout(()=>renderArchiveLedger(UI.archivePick),140)}
  root.querySelectorAll('.archive-file').forEach(b=>b.classList.toggle('is-picked',b===file));
  /* The week a 周报 would cover: those folders and that stretch of the ruler. */
  const from=weekStart(date),to=add(from,6),band=root.querySelector('.ruler-week');
  root.querySelectorAll('.archive-file').forEach(b=>b.classList.toggle('in-week',
    b.dataset.date>=from&&b.dataset.date<=to));
  if(band){const [y,m]=date.split('-').map(Number),last=new Date(y,m,0).getDate(),at=d=>rulerAt(d,last)+'%',
    month=date.slice(0,7);
    band.style.setProperty('--from',at(from.slice(0,7)<month?1:Number(from.slice(8,10))));
    band.style.setProperty('--to',at(to.slice(0,7)>month?last:Number(to.slice(8,10))))}
  root.querySelectorAll('.ruler-tick').forEach(t=>t.classList.toggle('is-picked',t===tick));
  const caption=root.querySelector('.caption-body'),label=pointer?.querySelector('b');
  if(caption)caption.innerHTML=file.querySelector('.file-body').innerHTML;
  if(ruler){ruler.setAttribute('aria-valuenow',String(Number(date.slice(8,10))));ruler.setAttribute('aria-valuetext',archiveDay(date))}
  if(label&&label.textContent!==pointerText(date)){
    label.textContent=pointerText(date);
    if(!archiveStill())label.animate([{transform:'translateX(-50%) scale(.82)'},{transform:'translateX(-50%) scale(1.06)',offset:.6},{transform:'translateX(-50%) scale(1)'}],{duration:240,easing:'ease-out'});
  }
}
/* Folders run newest (front) to oldest (back), so +1 steps back in time. */
function stepArchive(delta){
  const dates=$$('#archiveCabinet .archive-file').map(b=>b.dataset.date),i=dates.indexOf(UI.archivePick);
  if(i>=0)pickArchive(dates[Math.max(0,Math.min(dates.length-1,i+delta))]);
}
function switchArchiveMonth(step){
  const months=archiveDrawers(archiveCards()).map(x=>x.month),next=months[months.indexOf(UI.archiveMonth)+step];
  if(!next)return;
  UI.archiveMonth=next;UI.archivePick=null;renderArchive();
  const stage=$('#archiveCabinet .drawer-stage');
  if(stage&&!archiveStill())stage.animate([{transform:`translateX(${step>0?-64:64}px)`,opacity:0},{transform:'none',opacity:1}],{duration:380,easing:'cubic-bezier(.2,.8,.2,1)'});
}
function bindArchive(){
  const root=$('#archiveCabinet'),stage=root.querySelector('.drawer-stage'),ruler=root.querySelector('.archive-ruler');
  root.querySelectorAll('.box-step').forEach(b=>b.onclick=()=>switchArchiveMonth(Number(b.dataset.step)));
  const openPicked=()=>openArchive(UI.archivePick,root.querySelector('.archive-file.is-picked'));
  root.querySelector('.caption-open').onclick=openPicked;
  root.querySelectorAll('.archive-file').forEach(b=>b.onclick=openPicked);
  /* Sliding across the box picks whichever folder is under the pointer, as the
     browser hit-tests it in 3D; the picked folder's lifted sheet counts as that
     folder, so it stays up while the pointer is on it. Off the folders nothing
     changes, and a quick sweep (on the way to 打开, say) only picks where the
     pointer comes to rest. */
  let last=null,rest=0;
  const under=(x,y)=>{const hit=document.elementFromPoint(x,y)?.closest('.archive-file');if(hit&&root.contains(hit))pickArchive(hit.dataset.date)};
  stage.onpointermove=e=>{
    const speed=last?Math.hypot(e.clientX-last.x,e.clientY-last.y)/Math.max(1,e.timeStamp-last.t):0;
    last={x:e.clientX,y:e.clientY,t:e.timeStamp};
    clearTimeout(rest);
    if(speed<.8)under(e.clientX,e.clientY);else rest=setTimeout(()=>under(e.clientX,e.clientY),90);
  };
  stage.onpointerleave=()=>{clearTimeout(rest);last=null};
  /* The wheel steps folders only while the pointer is over the box itself;
     anywhere else it scrolls the page as usual. */
  const overBox=(x,y)=>[...stage.querySelector('.open-drawer').children].some(el=>{const r=el.getBoundingClientRect();return x>=r.left-16&&x<=r.right+16&&y>=r.top-16&&y<=r.bottom+16});
  let wheel=0;
  stage.onwheel=e=>{if(!overBox(e.clientX,e.clientY))return;e.preventDefault();wheel+=e.deltaY;while(Math.abs(wheel)>=40){stepArchive(wheel>0?1:-1);wheel-=Math.sign(wheel)*40}};
  /* The pointer on the ruler follows the mouse (or a finger) along it, picking
     the nearest tick, and springs onto that tick once the hand leaves; a
     click opens the picked brief. */
  const track=ruler.querySelector('.ruler-track'),pointer=ruler.querySelector('.ruler-pointer');
  const pickAt=x=>{let best=null,gap=Infinity;ruler.querySelectorAll('.ruler-tick').forEach(t=>{const r=t.getBoundingClientRect(),d=Math.abs(r.left+r.width/2-x);if(d<gap){gap=d;best=t}});if(best)pickArchive(best.dataset.date)};
  const follow=x=>{const r=track.getBoundingClientRect();ruler.classList.add('is-tracking');pointer?.style.setProperty('--at',`${Math.max(0,Math.min(100,(x-r.left)/r.width*100)).toFixed(2)}%`);pickAt(x)};
  ruler.onpointermove=e=>follow(e.clientX);
  ruler.onpointerdown=e=>{if(e.pointerType!=='mouse')ruler.setPointerCapture?.(e.pointerId);follow(e.clientX)};
  ruler.onpointerleave=()=>{ruler.classList.remove('is-tracking');pickArchive(UI.archivePick)};
  ruler.onclick=openPicked;
  ruler.onkeydown=e=>{
    const step={ArrowLeft:1,ArrowDown:1,ArrowRight:-1,ArrowUp:-1}[e.key];
    if(step){e.preventDefault();stepArchive(step)}
    else if(e.key==='Home'||e.key==='End'){e.preventDefault();stepArchive(e.key==='Home'?Infinity:-Infinity)}
    else if(e.key==='Enter'||e.key===' '){e.preventDefault();openPicked()}
  };
}
/* Long months make a long box: shrink it about its front until it and a lifted
   folder fit between the arrows (which move up beside the month on narrow
   screens), then centre it in the stage. */
function fitArchiveDrawer(stage){
  const drawer=stage?.querySelector('.open-drawer'),area=stage?.closest('.box-stage');if(!drawer||!area)return;
  ['--fit','--shift','--shift-y'].forEach(p=>drawer.style.removeProperty(p));
  const box=area.getBoundingClientRect(),at=stage.getBoundingClientRect(),parts=[...drawer.children].map(e=>e.getBoundingClientRect());
  const lift=parseFloat(getComputedStyle(drawer).getPropertyValue('--lift'))||0,side=area.querySelector('.box-step')?.offsetTop<0?12:68;
  const ax=at.left+drawer.offsetLeft+drawer.offsetWidth/2,ay=at.top+drawer.offsetTop+drawer.offsetHeight;
  const top=Math.min(...parts.map(r=>r.top))-lift,bottom=Math.max(...parts.map(r=>r.bottom));
  const left=Math.min(...parts.map(r=>r.left)),right=Math.max(...parts.map(r=>r.right));
  const fit=Math.max(.3,Math.min(1,(box.height-24)/(bottom-top),(box.width-2*side)/(right-left)));
  drawer.style.setProperty('--fit',fit.toFixed(3));
  drawer.style.setProperty('--shift',`${Math.round(box.left+box.width/2-ax-fit*(right+left-2*ax)/2)}px`);
  drawer.style.setProperty('--shift-y',`${Math.round(box.top+box.height/2-ay-fit*(bottom+top-2*ay)/2)}px`);
}

function briefFields(content){
  if(!content)return '';
  if(typeof content!=='object')return `<p class="brief-text">${escapeHTML(content)}</p>`;
  const rows=Object.entries(content).filter(([k,v])=>NOTICE_LABELS[k]&&String(v??'').trim());
  return rows.length?`<dl class="notice-fields">${rows.map(([k,v])=>`<div><dt>${NOTICE_LABELS[k]}</dt><dd>${escapeHTML(v)}</dd></div>`).join('')}</dl>`:'';
}
function briefDocument(brief,editable=false){
  const c=brief.content||{},t=c.totals||{},d=new Date(`${brief.date}T12:00:00`);
  const entry=(title,meta,body,edited)=>`<div class="brief-entry"><div class="brief-entry-head"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(meta)}</span>${editable&&edited?tr('<em class="doc-edited">已改</em>'):''}</div>${body}</div>`;
  const fields=(content,scope,id,keys)=>editable?editFields(content,scope,id,keys):briefFields(content);
  const memberKeys=m=>m.summary&&typeof m.summary!=='object'?['summary']:['done','risks','next'];
  const risks=editable?`<section class="brief-section"><h3>${tr('需要关注')}</h3>${docEdit((c.risks||[]).join('\n'),'data-scope="risks"')}</section>`
    :(c.risks?.length?`<section class="brief-section"><h3>${tr('需要关注')}</h3><ul class="brief-risks">${c.risks.map(r=>`<li>${escapeHTML(r)}</li>`).join('')}</ul></section>`:'');
  return `<article class="brief-doc"><header class="brief-head"><div class="eyebrow">${tr('档案室 · 团队日报')}</div><h2>${tr('{0}年{1}月{2}日 · {3}',d.getFullYear(),d.getMonth()+1,d.getDate(),WEEKDAY_SHORT[d.getDay()])}</h2><div class="brief-stats"><div><b>${t.completed||0}/${t.tasks||0}</b><span>${tr('完成任务')}</span></div><div><b>${hours(t.load)}h</b><span>${tr('完成工时')}</span></div><div><b>${t.members||0}</b><span>${tr('位成员')}</span></div><div><b>${t.projects||0}</b><span>${tr('个项目')}</span></div></div></header>`
    +risks
    +(c.projects?.length?`<section class="brief-section"><h3>${tr('项目进展')}</h3>${c.projects.map(p=>entry(p.name,tr('Owner · {0} · {1} · {2}/{3} 完成',p.ownerName||p.owner||'',p.source==='owner'?tr('Owner 汇报'):tr('系统汇总'),p.completed,p.tasks),fields(p.content,'projects',p.id,['done','progress','collaborators','risks','next']),p.edited)).join('')}</section>`:'')
    +(c.members?.length?`<section class="brief-section"><h3>${tr('成员总结')}</h3>${c.members.map(m=>entry(m.name,tr('{0}/{1} 完成 · {2}h · {3}',m.completed,m.tasks,hours(m.load),m.source==='diary'?tr('本人日记'):tr('系统统计')),fields(m.summary,'members',m.id,memberKeys(m)),m.edited)).join('')}</section>`:'')
    +'</article>';
}
/* Opened from the archive, the folder rises a little further while the brief
   loads. A copy of it then leaves the box keeping its shape, turns to face
   you and grows evenly; the brief slides up out of it like a sheet of paper,
   the folder drops away and the text types itself out. Closing plays the
   same motion backwards. From the inbox the brief simply opens. */
const BRIEF_MS=950;
function briefFolder(folder,face){
  const el=document.createElement('div');
  el.className='brief-folder';el.setAttribute('aria-hidden','true');
  el.style.setProperty('--tab',folder.style.getPropertyValue('--tab'));
  el.style.width=`${face.offsetWidth}px`;el.style.height=`${face.offsetHeight}px`;
  el.innerHTML=`${folder.querySelector('.file-tab').outerHTML}<span class="file-face"></span>`;
  document.body.appendChild(el);
  return el;
}
function briefMotion(face,modal,clone){
  const style=getComputedStyle(face.closest('.open-drawer')),fit=parseFloat(style.getPropertyValue('--fit'))||1,view=style.getPropertyValue('--view').trim();
  const w=face.offsetWidth,h=face.offsetHeight,f=face.getBoundingClientRect(),p=modal.getBoundingClientRect();
  /* Grown evenly to just wider than the brief, its top edge across the brief's
     middle: the brief is pulled up out of it from there. */
  const k=Math.min(p.width+40,innerWidth-24)/w,fh=h*k,top=Math.round(Math.min(p.top+p.height*.5,innerHeight-fh-16)),cx=innerWidth/2,cy=top+fh/2;
  clone.style.left=`${Math.round(cx-w/2)}px`;clone.style.top=`${Math.round(cy-h/2)}px`;
  const flat=s=>`perspective(1400px) rotateX(0deg) rotateY(0deg) scale(${s})`;
  const folder=[
    {offset:0,transform:`translate(${Math.round(f.left+f.width/2-cx)}px,${Math.round(f.top+f.height/2-cy)}px) perspective(1400px) ${view} scale(${fit})`,opacity:1,easing:'cubic-bezier(.25,.8,.25,1)'},
    {offset:.42,transform:`translate(0px,0px) ${flat(k)}`,opacity:1},
    {offset:.7,transform:`translate(0px,0px) ${flat(k)}`,opacity:1,easing:'cubic-bezier(.55,0,.8,.4)'},
    {offset:1,transform:`translate(0px,${Math.round(fh*.6+60)}px) ${flat(k)}`,opacity:0}];
  /* The brief waits behind the folder, then rises; whatever is still below the
     folder's top edge stays clipped, as if inside it. */
  const rise=Math.round(top+12-p.top),inside=Math.round(p.bottom-top),hidden=`inset(-60px -60px ${Math.round(p.height+12)}px -60px)`;
  const paper=[
    {offset:0,transform:`translate(-50%,-50%) translateY(${rise}px)`,clipPath:hidden},
    {offset:.4,transform:`translate(-50%,-50%) translateY(${rise}px)`,clipPath:hidden,easing:'cubic-bezier(.3,.6,.2,1)'},
    {offset:.74,transform:'translate(-50%,-50%) translateY(0px)',clipPath:`inset(-60px -60px ${Math.max(0,inside)}px -60px)`,easing:'cubic-bezier(.55,0,.8,.4)'},
    {offset:1,transform:'translate(-50%,-50%) translateY(0px)',clipPath:'inset(-60px -60px -60px -60px)'}];
  return {folder,paper};
}
/* Typewriter: every text node is split into what has been typed and the rest,
   which stays in place but invisible, so the layout never jumps. A tap
   anywhere on the brief finishes it at once. */
function typeOut(root,budget=1200){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),parts=[];
  for(let n=walker.nextNode();n;n=walker.nextNode())if(n.nodeValue.trim())parts.push({n,text:n.nodeValue});
  for(const part of parts){part.rest=document.createElement('span');part.rest.className='type-rest';part.rest.textContent=part.text;part.n.nodeValue='';part.n.after(part.rest)}
  const total=parts.reduce((s,x)=>s+x.text.length,0),span=Math.min(budget,total*24),caret=document.createElement('span');
  caret.className='type-caret';
  let frame=0,start=0;
  const show=count=>{
    let left=count,at=null;
    for(const part of parts){const take=Math.max(0,Math.min(part.text.length,left));left-=take;part.n.nodeValue=part.text.slice(0,take);part.rest.textContent=part.text.slice(take);if(!at&&take<part.text.length)at=part}
    if(at)at.n.after(caret);else caret.remove();
  };
  const step=now=>{start||=now;const count=Math.ceil(Math.min(1,(now-start)/span)*total);show(count);if(count<total)frame=requestAnimationFrame(step);else finish()};
  const finish=()=>{cancelAnimationFrame(frame);caret.remove();for(const part of parts){part.n.nodeValue=part.text;part.rest.remove()}};
  root.addEventListener('pointerdown',finish,{once:true});root.addEventListener('focusin',finish,{once:true});
  return {start:delay=>setTimeout(()=>{frame=requestAnimationFrame(step)},delay),finish};
}
async function openBrief(date,folder=null){
  folder?.classList.add('is-opening');
  let brief;
  try{brief=await api('/api/action',{action:'brief.get',data:{date}})}catch(e){toast(e.message);return}
  finally{folder?.classList.remove('is-opening')}
  openModal(`${briefDocument(brief,true)}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('关闭')}</button><button class="primary-btn" id="saveArchiveDoc">${tr('保存')}</button></div>`);
  bindArchiveDoc(async()=>{
    const doc=$('#modalContent'),data={date},risks=doc.querySelector('.doc-edit[data-scope="risks"]');
    if(risks)data.risks=docText(risks).split('\n').map(x=>x.trim()).filter(Boolean);
    doc.querySelectorAll('.doc-edit[data-scope="projects"],.doc-edit[data-scope="members"]').forEach(el=>{const scope=data[el.dataset.scope]||(data[el.dataset.scope]={}),row=scope[el.dataset.id]||(scope[el.dataset.id]={});row[el.dataset.field]=docText(el)});
    await api('/api/action',{action:'brief.update',data});
  });
  flyArchive(folder);
}
/* 档案室 holds each person's own record. A member's folders are their daily
   archives; an admin's are the team's daily briefs. */
function archiveCards(){
  if(!S.user)return [];
  if(S.user.admin)return briefCards();
  const me=S.user.id,days=new Set([S.today]);
  (S.diaries||[]).forEach(d=>{if(d.author===me)days.add(d.date)});
  (S.diaryStats||[]).forEach(r=>{if(r.userId===me&&r.total)days.add(r.date)});
  return [...days].filter(d=>d&&d<=S.today).map(date=>{const s=diaryDayStats(me,date),r=diaryReport(me,date);return {kind:'diary',date,totals:{completed:s.completed,tasks:s.total,load:s.load},source:r?(r.auto?'auto':'manual'):'draft'}});
}
function openArchive(date,folder=null){return S.user?.admin?openBrief(date,folder):openDiaryArchive(date,folder)}
/* The folder flies out of the box and the paper rises out of it (see briefMotion). */
function flyArchive(folder){
  const modal=$('#modalBackdrop .modal');
  modal?.classList.add('is-wide');
  const face=folder?.querySelector('.file-face');
  if(!modal||!face?.isConnected||archiveStill())return;
  modal.classList.add('is-flown');folder.classList.add('is-out');UI.briefSource=face;
  const clone=briefFolder(folder,face),motion=briefMotion(face,modal,clone);
  clone.animate(motion.folder,{duration:BRIEF_MS,fill:'forwards'}).onfinish=()=>clone.remove();
  modal.animate(motion.paper,{duration:BRIEF_MS});
  UI.briefTyping=typeOut($('#modalContent'));
  UI.briefTyping.start(BRIEF_MS*.5);
}
/* Archives are edited in place: every collected block is plain editable text
   on the page itself, and 保存 lights up once something changes. */
const docText=el=>String((el?.tagName==='TEXTAREA'?el.value:null)??el?.innerText??el?.textContent??el?.value??'').replace(/\u00a0/g,' ').replace(/\n{3,}/g,'\n\n').trim();
const docEdit=(value,attrs)=>`<div class="doc-edit" contenteditable="plaintext-only" spellcheck="false" ${attrs}>${escapeHTML(value??'')}</div>`;
/* 随记 under the three fixed blocks is the holder's own blank page: nothing
   fills it in, and it stays out of the team brief. */
const DIARY_NOTE_HINT=tr('今天想记下的任何事');
function editFields(content,scope,id,keys){
  const v=content&&typeof content==='object'?content:{summary:content||''};
  return `<dl class="notice-fields is-editable">${keys.map(k=>`<div><dt>${NOTICE_LABELS[k]}</dt><dd>${docEdit(v[k],`data-scope="${scope}" data-id="${escapeHTML(id)}" data-field="${k}"`)}</dd></div>`).join('')}</dl>`;
}
function bindArchiveDoc(save,ready=false){
  const btn=$('#saveArchiveDoc');
  $('#cancelAction').onclick=closeModal;
  btn.disabled=!ready;
  $('#modalContent').addEventListener('input',e=>{if(!e.target.closest('.doc-edit'))return;UI.docDirty=true;btn.disabled=false;btn.textContent=tr('保存')});
  btn.onclick=async()=>{
    btn.disabled=true;btn.textContent=tr('保存中…');
    try{await save();UI.docDirty=false;btn.textContent=tr('已保存');toast(tr('档案已保存'));refresh().catch(()=>{})}
    catch(e){btn.disabled=false;btn.textContent=tr('保存');toast(e?.message||tr('保存失败'))}
  };
}
function diaryDocument(day){
  const me=S.user.id,c=diaryContent(me,day),s=diaryDayStats(me,day),r=diaryReport(me,day),d=new Date(`${day}T12:00:00`),logs=workLogEntries(day,me);
  const block=(k,label)=>`<section class="brief-section"><h3>${label}</h3>${docEdit(c[k],`data-field="${k}"`)}</section>`;
  const log=logs.length?`<ul class="doc-log">${logs.map(l=>`<li><button type="button" class="doc-log-item" data-task-id="${escapeHTML(l.taskId||'')}" data-project-id="${escapeHTML(l.projectId||'')}" data-log-kind="${escapeHTML(l.kind||'')}"><time>${escapeHTML(String(l.at||'').slice(11,16))}</time><span>${escapeHTML(l.label)}</span>${l.project?`<small>${escapeHTML(l.project)}</small>`:''}</button></li>`).join('')}</ul>`:'<p class="muted">—</p>';
  return `<article class="brief-doc is-personal"><header class="brief-head"><div class="eyebrow">${tr('我的档案 ·')} `
    +`${r?(r.auto?tr('系统整理'):tr('已记录')):tr('待记录')}</div><h2>${tr('{0}年{1}月{2}日 ·',d.getFullYear(),d.getMonth()+1,d.getDate())} `
    +`${WEEKDAY_SHORT[d.getDay()]}</h2><div class="brief-stats"><div><b>${s.completed}/${s.total}</b><span>${tr('完成任务')}</span>`
    +`</div><div><b>${hours(s.load)}h</b><span>${tr('完成工时')}</span></div><div><b>${Math.max(0,s.total-s.completed)}</b><span>${tr('未完成')}`
    +`</span></div><div><b>${logs.length}</b><span>${tr('条日志')}</span></div></div></header>${block('done',tr('今日完成'))}`
    +`${block('risks',tr('未完成与阻塞'))}${block('next',tr('明日计划'))}<section class="brief-section diary-note"><h3>${tr('随记')}</h3>`
    +`${docEdit(c.note,`data-field="note" data-placeholder="${DIARY_NOTE_HINT}"`)}</section>`
    +`<section class="brief-section"><h3>${tr('工作日志')}</h3>${log}</section></article>`;
}
function openDiaryArchive(day,folder=null){
  openModal(`${diaryDocument(day)}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('关闭')}</button><button class="primary-btn" id="saveArchiveDoc">${tr('保存')}</button></div>`);
  $$('#modalContent .doc-log-item').forEach(b=>b.onclick=()=>{closeModal();openWorkLogDetail(b.dataset.taskId,b.dataset.projectId,b.dataset.logKind)});
  /* A day nobody has saved yet is only a template, so it can be kept as it is. */
  bindArchiveDoc(async()=>{const content={};$$('#modalContent .doc-edit').forEach(el=>{content[el.dataset.field]=docText(el)});await api('/api/action',{action:'diary.save',data:{date:day,content}})},!diaryReport(S.user.id,day));
  flyArchive(folder);
}
function openTodayArchive(){
  UI.archiveMonth=S.today.slice(0,7);UI.archivePick=S.today;
  if(UI.view!=='archive')switchView('archive');else renderArchive();
  pickArchive(S.today,true);
  openDiaryArchive(S.today,$(`#archiveCabinet .archive-file[data-date="${S.today}"]`));
}
/* Weekly outcomes are computed from task events by the server. */
function weekReportDocument(week){
  const work=week.work||{},done=work.completedProjects||[],doneTasks=work.completedTasks||[],pending=work.unfinishedProjects||[],other=work.unfinishedOther||[],esc=escapeHTML;
  const text=(label,value)=>value?`<p><span class="muted">${label}</span>${esc(String(value))}</p>`:'';
  const people=p=>`Owner · ${esc(p.ownerName||tr('未指派'))}${p.members?.length?tr(' · 参与人：{0}',esc(p.members.join('、'))):''}`;
  const task=t=>`<li><div class="week-work-head"><strong>${esc(t.name)}</strong><span>${esc(t.assigneeName||tr('未指派'))}</span></div>`
    +`${text(tr('剩余事项：'),tr(t.remaining??''))}${text(tr('原因：'),tr(t.reason??''))}${text(tr('后续安排：'),t.scheduledOn>week.end?fmt(t.scheduledOn):tr('尚未安排到下周'))}${text(tr('截止日期：'),t.deadline?fmt(t.deadline):'')}</li>`;
  const completedTask=t=>`<li><div class="week-work-head"><strong>${esc(t.name)}${t.stackCount>1?` ${tr('· {0} 期',esc(t.stackCount))}`:''}</strong><time>${esc(fmt(t.completedOn))}</time></div>`
    +`<small>${esc(t.assigneeName||tr('未指派'))}${Number(t.actual)>0?` ${tr('· {0} 分钟',esc(t.actual))}`:''}</small>`
    +`${text(tr('任务内容：'),t.description)}${text(tr('完成情况：'),tr(t.summary||'未填写完成总结'))}${text(tr('反馈：'),[t.feeling&&tr(t.feeling),t.followup].filter(Boolean).join(' · '))}</li>`;
  const completedList=tasks=>tasks.length?`<ul class="week-remaining-list">${tasks.map(completedTask).join('')}</ul>`:'';
  const completedProjectIds=new Set(done.map(p=>p.projectId).filter(Boolean)),taskGroups=new Map();
  for(const t of doneTasks){
    if(t.projectId&&completedProjectIds.has(t.projectId))continue;
    const key=t.projectId?`project:${t.projectId}`:t.fixed?'fixed':'temporary';
    if(!taskGroups.has(key))taskGroups.set(key,{name:t.projectId?(t.projectName||tr('项目资料缺失')):t.fixed?tr('固定任务'):tr('临时任务'),description:t.projectDescription||'',tasks:[]});
    taskGroups.get(key).tasks.push(t);
  }
  const completed=done.map(p=>`<li><div class="week-work-head"><strong>${esc(p.name)}</strong><time>${esc(fmt(p.completedOn))}</time></div>`
    +`<small>${people(p)}</small><p class="week-project-summary">${esc(p.summary||[p.description,p.completionReport].filter(Boolean).join('\n'))}</p>`
    +`${completedList(doneTasks.filter(t=>t.projectId&&t.projectId===p.projectId))}</li>`).join('')
    +[...taskGroups.values()].map(g=>`<li><div class="week-work-head"><strong>${esc(g.name)}</strong><span>${tr('本周完成任务')}</span></div>`
      +`${text(tr('项目内容：'),g.description)}${completedList(g.tasks)}</li>`).join('');
  const unfinished=pending.map(p=>`<li><div class="week-work-head"><strong>${esc(p.name)}</strong><span>${p.status==='pending_completion'?tr('待结项审批'):tr('进行中')}</span></div>`
    +`<small>${people(p)}</small>${text(tr('项目内容：'),p.description)}`
    +`${p.status==='pending_completion'?tr('<p>已提交结项，等待审批</p>'):''}`
    +`${p.remaining?.length?`<ul class="week-remaining-list">${p.remaining.map(task).join('')}</ul>`:p.status==='pending_completion'?'':tr('<p class="muted">项目尚未结项，暂无已记录的未完成任务</p>')}</li>`).join('');
  const remainingCount=pending.reduce((n,p)=>n+(p.remaining||[]).length,other.length);
  return `<article class="brief-doc week-report"><header class="brief-head"><div class="week-report-top"><div class="eyebrow">${tr('档案室 · 周报')}</div><div class="week-report-nav">`
    +`<button type="button" class="icon-btn" data-week="-1" aria-label="${tr('上一周')}">${icon('chevron-left')}</button>`
    +`<button type="button" class="icon-btn" data-week="1" ${week.end>=S.today?'disabled':''} aria-label="${tr('下一周')}">${icon('chevron-right')}</button></div></div>`
    +`<h2>${esc(fmt(week.start))} — ${esc(fmt(week.end))}</h2><p class="muted">${tr('截至 {0}',esc(fmt(work.asOf||week.end)))}</p>`
    +`<div class="brief-stats"><div><b data-count="${done.length}">${done.length}</b><span>${tr('本周完成项目')}</span></div>`
    +`<div><b data-count="${doneTasks.length}">${doneTasks.length}</b><span>${tr('本周完成任务')}</span></div>`
    +`<div><b data-count="${remainingCount}">${remainingCount}</b><span>${tr('剩余任务')}</span></div></div></header>`
    +`<section class="brief-section"><h3>${tr('这周做了什么')}</h3>${completed?`<ul class="week-work-list">${completed}</ul>`:tr('<p class="muted">本周暂无已完成项目或任务</p>')}</section>`
    +`<section class="brief-section"><h3>${tr('还有什么没做')}</h3>${unfinished?`<ul class="week-work-list">${unfinished}</ul>`:tr('<p class="muted">暂无待完成项目</p>')}`
    +`${other.length?`<h4>${tr('其他待续事项')}</h4><ul class="week-work-list">${other.map(task).join('')}</ul>`:''}</section>`
    +`<footer class="week-daily-links">${(week.briefs||[]).filter(b=>b.filed!==false).map(b=>`<button type="button" class="text-btn week-cell" data-date="${esc(b.date)}">${tr('{0} 日报',esc(fmt(b.date)))}</button>`).join('')}</footer></article>`;
}
/* Numbers run up from zero as the report settles; a tap shows them at once. */
function countUp(root){
  if(archiveStill())return;
  const els=[...root.querySelectorAll('[data-count]')],start=performance.now(),ms=700;
  const step=now=>{const k=Math.min(1,(now-start)/ms),e=1-Math.pow(1-k,3);
    els.forEach(el=>{const to=Number(el.dataset.count)||0,d=Number(el.dataset.decimals)||0;
    el.textContent=(to*e).toFixed(d)});if(k<1)requestAnimationFrame(step)};
  requestAnimationFrame(step);
}
/* The report's week shows on the ruler and the box while the button is in
   reach, so it is clear which folders the report is made of. */
function markArchiveWeek(on){
  const root=$('#archiveCabinet');if(!root)return;
  root.classList.toggle('show-week',Boolean(on&&S.user?.admin));
}
async function openWeekReport(date=UI.archivePick||S.today,dir=0){
  const btn=$('#archiveExportBtn'),seq=(UI.weekSeq||0)+1;UI.weekSeq=seq;
  if(btn&&!dir)btn.disabled=true;
  let week;
  try{week=await api('/api/action',{action:'brief.week',data:{date}})}
  catch(e){if(seq===UI.weekSeq)toast(e?.message||tr('周报没有打开'));return}
  finally{if(btn&&!dir)btn.disabled=false}
  if(seq!==UI.weekSeq)return;
  if(dir){
    const current=$('#modalContent .week-report');
    if(!current?.isConnected||$('#modalBackdrop')?.classList.contains('hidden'))return;
    /* Paging slides the old week out and the next one in from that side. */
    const swap=()=>{if(seq!==UI.weekSeq||!current.isConnected)return;current.outerHTML=weekReportDocument(week);
      bindWeekReport(week,dir)};
    if(archiveStill())swap();else current.animate([{opacity:1,transform:'none'},{opacity:0,transform:`translateX(`
      +`${dir*-28}px)`}],{duration:160,easing:'ease-in'}).onfinish=swap;
    return;
  }
  openModal(`${weekReportDocument(week)}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('关闭')}`
    +`</button></div>`);
  $('#modalBackdrop .modal')?.classList.add('is-wide');
  $('#cancelAction').onclick=closeModal;
  bindWeekReport(week,0);
}
function bindWeekReport(week,dir){
  const doc=$('#modalContent .week-report');if(!doc)return;
  if(dir)doc.classList.add(dir>0?'from-next':'from-prev');
  doc.querySelectorAll('[data-week]').forEach(b=>b.onclick=()=>openWeekReport(add(week.start,Number(b.dataset.week)*7),
    Number(b.dataset.week)));
  doc.querySelectorAll('.week-cell:not([disabled])').forEach(b=>b.onclick=()=>openBrief(b.dataset.date));
  countUp(doc);
}
/* Fold the brief back into its folder; true when that takes over closing. */
function foldBrief(){
  const face=UI.briefSource;if(!face)return false;
  const back=$('#modalBackdrop'),modal=back?.querySelector('.modal'),folder=face.closest('.archive-file');
  UI.briefSource=null;UI.briefTyping?.finish();UI.briefTyping=null;
  if(!face.isConnected||!modal?.classList.contains('is-flown')||back.classList.contains('hidden')){folder?.classList.remove('is-out');return false}
  const clone=briefFolder(folder,face),motion=briefMotion(face,modal,clone),reverse={duration:BRIEF_MS*.85,direction:'reverse',fill:'forwards'};
  const done=()=>{back.classList.add('hidden');modal.classList.remove('is-flown');[modal,back].forEach(el=>el.getAnimations().forEach(a=>a.cancel()));clone.remove();folder.classList.remove('is-out')};
  modal.animate(motion.paper,reverse);
  clone.animate(motion.folder,reverse).onfinish=done;
  back.animate([{opacity:1},{opacity:1,offset:.45},{opacity:0}],{duration:BRIEF_MS*.85,fill:'forwards'});
  return true;
}

/* Inbox housekeeping: delete a notice from its card, or switch to 管理 to pick
   several. Invitations are answered rather than deleted, so they never take part. */
async function deleteNotices(ids,read=false){
  try{
    const r=await api('/api/action',{action:'inbox.delete',data:read?{read:true}:{ids}});
    (ids||[]).forEach(id=>UI.inboxPicked?.delete(id));
    await refresh();toast(r.deleted?tr('已删除 {0} 条通知',r.deleted):tr('没有可删除的通知'));
  }catch(e){toast(e.message)}
}
function renderInboxToolbar(){
  const bar=$('#inboxToolbar');if(!bar)return;
  const manage=Boolean(UI.inboxManage),ids=(S.notifications||[]).map(n=>n.id);
  UI.inboxPicked=new Set([...(UI.inboxPicked||[])].filter(id=>ids.includes(id)));
  const picked=UI.inboxPicked.size;
  $('#manageInboxBtn').textContent=manage?tr('完成'):tr('管理');
  bar.classList.toggle('hidden',!manage);
  if(!manage)return;
  bar.innerHTML=`<label class="inbox-pick-all"><input type="checkbox" id="inboxPickAll" ${ids.length&&picked===ids.length?'checked':''} ${ids.length?'':'disabled'}>${tr('全选')}</label><span class="inbox-picked">${tr('已选 {0} 条',picked)}</span><button class="secondary-btn" id="inboxDeletePicked" ${picked?'':'disabled'}>${tr('删除所选')}</button><button class="secondary-btn" id="inboxDeleteRead" ${(S.notifications||[]).some(n=>n.read)?'':'disabled'}>${tr('清除已读')}</button>`;
  $('#inboxPickAll').onchange=e=>{UI.inboxPicked=new Set(e.target.checked?ids:[]);renderInbox()};
  $('#inboxDeletePicked').onclick=()=>deleteNotices([...UI.inboxPicked]);
  $('#inboxDeleteRead').onclick=()=>deleteNotices(null,true);
}
function openSearch(){openModal(`<div class="eyebrow">${tr('工作台搜索')}</div><h2>${tr('搜索任务与项目')}</h2><label class="form-field">${tr('关键词')}<input id="searchQuery" placeholder="${tr('搜索')}"></label><div id="searchResults" class="search-results"><span class="muted">${tr('输入关键词开始搜索')}</span></div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('关闭')}</button></div>`);$('#cancelAction').onclick=closeModal;const input=$('#searchQuery'),results=$('#searchResults');input.oninput=()=>{const q=input.value.trim().toLowerCase();if(!q){results.innerHTML=tr('<span class="muted">输入关键词开始搜索</span>');return}const ts=(S.user?.admin?S.tasks.filter(t=>!isSuperseded(t)):scheduleTasks()).filter(t=>[t.name,t.assignee,nameOf(t.assignee),projectName(t)].some(v=>String(v||'').toLowerCase().includes(q)));const ps=S.projects.filter(p=>[p.name,p.owner,nameOf(p.owner),p.desc].some(v=>String(v||'').toLowerCase().includes(q)));results.innerHTML=ts.map(t=>`<button class="search-result" data-task="${escapeHTML(t.id)}"><strong>${escapeHTML(t.name)}</strong><small>${escapeHTML(nameOf(t.assignee))} · ${escapeHTML(projectName(t))}</small></button>`).join('')+ps.map(p=>`<button class="search-result" data-project="${escapeHTML(p.id)}"><strong>${escapeHTML(p.name)}</strong><small>Owner · ${escapeHTML(nameOf(p.owner))} · ${projectStatus(p)}</small></button>`).join('')||tr('<span class="muted">没有找到匹配项</span>');$$('.search-result').forEach(b=>b.onclick=()=>{if(b.dataset.task)openDrawer(b.dataset.task);else{closeModal();openWorkLogDetail('',b.dataset.project,'project')}})};input.focus()}
$$('.nav-item').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
translateStatic(document.body);
window.addEventListener('beforeunload',e=>{if(meetingLive.session||meetingLive.active||$('#meetingEditor')?.dataset?.dirty==='true'){e.preventDefault();e.returnValue=''}});
$('#workspaceSwitcher')?.addEventListener('click',()=>toggleAccountMenu());
$('#workspaceSwitcher')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleAccountMenu()}});
document.addEventListener('click',e=>{
  const menu=$('#accountMenu');if(!menu||menu.classList.contains('hidden'))return;
  if(e.target.closest('#accountMenu')||e.target.closest('#workspaceSwitcher'))return;
  toggleAccountMenu(false);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleAccountMenu(false)});
document.addEventListener('keydown',e=>{
  if(UI.view!=='archive'||e.altKey||e.ctrlKey||e.metaKey||!$('#modalBackdrop').classList.contains('hidden'))return;
  if(e.target.closest('input,textarea,select,[contenteditable],.archive-ruler'))return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();stepArchive(e.key==='ArrowLeft'?1:-1)}});
addEventListener('resize',()=>{if(UI.view==='archive')fitArchiveDrawer($('#archiveCabinet .drawer-stage'))});
/* A quick filter narrows 今日任务; picking the one already on goes back to 全部. */
$$('.filter-link').forEach(b=>b.onclick=()=>{UI.filter=UI.view==='today'&&UI.filter===b.dataset.filter?'all':b.dataset.filter;switchView('today')});
function syncFilterLinks(){$$('.filter-link').forEach(b=>{const on=UI.view==='today'&&UI.filter===b.dataset.filter;
  b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on))})}
$$('.quick-tab').forEach(b=>b.onclick=()=>{UI.filter=b.dataset.filter;renderToday()});
$('#prevDay').onclick=()=>{UI.dayOffset=(UI.dayOffset||0)-1;renderToday()};
$('#nextDay').onclick=()=>{if(displayDay()>=DATE_HORIZON){toast(`${tr('日期范围目前只支持到')} `
  +`${DATE_HORIZON}`);return}UI.dayOffset=(UI.dayOffset||0)+1;renderToday()};
$('#inboxBtn').onclick=()=>switchView('inbox');$('#searchBtn').onclick=openSearch;
/* Single-key shortcuts, as the sidebar's 快捷键 hint promises. They never fire
   while typing, with a modifier held, or behind an open dialog or drawer. */
const SHORTCUTS=[['?',tr('快捷键列表')],['H',tr('使用教程')],['/',tr('搜索任务与项目；在系统设置里搜索设置')],['N',tr('新建任务')],['T',tr('今日任务')],['W',tr('周视图')],['P',tr('项目空间')],['I',tr('收件箱')],['Esc',tr('关闭弹窗或面板')]];
function openShortcuts(){
  openModal(`<div class="eyebrow">${tr('键盘')}</div><h2>${tr('快捷键')}</h2><dl class="shortcut-list">${SHORTCUTS.map(([k,v])=>`<dt><kbd>${k}</kbd></dt><dd>${v}</dd>`).join('')}</dl>`
    +`<div class="modal-footer"><button class="primary-btn" id="closeShortcuts">${tr('知道了')}</button></div>`);
  $('#closeShortcuts').onclick=closeModal;
}
function shortcutKey(e){
  if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||!S.user||document.body.classList.contains('auth-locked'))return;
  if(e.key==='Escape'){
    if(!$('#modalBackdrop').classList.contains('hidden')){e.preventDefault();closeModal();return}
    if(!$('#taskDrawer').classList.contains('hidden')){e.preventDefault();closeDrawer();return}
  }
  if(e.target.closest?.('input,textarea,select,[contenteditable],[contenteditable="plaintext-only"]'))return;
  if(!$('#modalBackdrop').classList.contains('hidden')||!$('#taskDrawer').classList.contains('hidden'))return;
  const key=e.key.length===1?e.key.toLowerCase():e.key;
  const run={'?':openShortcuts,'/':()=>UI.view==='settings'&&$('#settingsSearch')?$('#settingsSearch').focus():openSearch(),n:()=>{if(!$('#addTaskBtn').classList.contains('hidden'))newTask()},
    t:()=>switchView('today'),h:()=>switchView('guide'),w:()=>switchView('calendar'),p:()=>switchView('projects'),i:()=>switchView('inbox')}[key];
  if(run){e.preventDefault();run()}
}
document.addEventListener('keydown',shortcutKey);
$('#shortcutHelp').onclick=openShortcuts;

$('#closeDrawer').onclick=closeDrawer;$('#closeModal').onclick=closeModal;
$('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};
$('#taskDrawer').onclick=e=>{if(e.target.id==='taskDrawer')closeDrawer()};
$('#backWeekBtn').onclick=()=>switchView('calendar');
$('#backTodayBtn').onclick=()=>{if(UI.selectedWeek)UI.weekDir=UI.selectedWeek>0?'prev':'next';UI.selectedWeek=0;
  UI.dayOffset=0;switchView('calendar');renderCalendar()};$('#prevWeekBtn').onclick=()=>turnWeek(-1);
$('#nextWeekBtn').onclick=()=>turnWeek(1);
document.addEventListener('keydown',e=>{
  if(UI.view!=='calendar'||e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.target.closest('input,textarea,select,[contenteditable]'))return;
  if(!$('#modalBackdrop').classList.contains('hidden')||!$('#taskDrawer').classList.contains('hidden'))return;
  if(e.key==='ArrowLeft'){e.preventDefault();turnWeek(-1)}
  else if(e.key==='ArrowRight'){e.preventDefault();turnWeek(1)}});
$('#addProjectBtn').onclick=newProject;$('#addProjectTopBtn').onclick=newProject;
$('#addTaskBtn').onclick=newTask;$('#emptyAddBtn').onclick=newTask;$('#timelineAddProjectBtn').onclick=newProject;
$('#createFixedBtn').onclick=fixedTask;
$('#forceAssignBtn').onclick=()=>switchView('projects');/* 立即运行一次检查 does what the scheduler does every half minute anyway, so it
   needs no confirmation; it says what it found instead of a bare 操作已完成. */
$('#runAutomationBtn').onclick=async()=>{
  const b=$('#runAutomationBtn');if(b.disabled)return;b.disabled=true;
  try{const r=await api('/api/action',{action:'scheduler.run',data:{}});await refresh();
    flashSaved(b,r?.created?tr('已完成 · 生成或发出 {0} 项',r.created):tr('已完成 · 没有需要处理的'))}catch(e){toast(e.message)}finally{b.disabled=false}
};
$('#settingsSearch')?.addEventListener('input',applySettingsFilter);
$('#settingsSearch')?.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target.value){e.preventDefault();e.stopPropagation();e.target.value='';applySettingsFilter()}});
$$('#settingsView [data-settings-go]').forEach(row=>{
  row.onclick=()=>switchView(row.dataset.settingsGo);
  row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();switchView(row.dataset.settingsGo)}};
});
$$('#settingsView [data-settings-page]').forEach(row=>{
  row.onclick=()=>openSettingsPage(row.dataset.settingsPage);
  row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSettingsPage(row.dataset.settingsPage)}};
});

$('#markAllReadBtn').onclick=()=>act('inbox.read',{all:true});
$('#manageInboxBtn').onclick=()=>{UI.inboxManage=!UI.inboxManage;UI.inboxPicked=new Set();renderInbox()};
$('#archiveTodayBtn').onclick=openTodayArchive;
$('#archiveExportBtn').onclick=()=>{markArchiveWeek(false);openWeekReport()};
['pointerenter','focus'].forEach(e=>$('#archiveExportBtn').addEventListener(e,()=>markArchiveWeek(true)));
['pointerleave','blur'].forEach(e=>$('#archiveExportBtn').addEventListener(e,()=>markArchiveWeek(false)));
window.addEventListener('focus',()=>{if(UI.view==='inbox')refreshInboxState()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&UI.view==='inbox')refreshInboxState()});
$('#pipBtn').classList.toggle('hidden',!pipSupported());$('#pipBtn').onclick=openPip;
hydrateIcons();
if(location.protocol==='file:'){showAuth()}else{refresh().catch(e=>toast(e.message||tr('连接工作台失败，请刷新重试')))}

/* Embedded Agent UI: superadmin-managed OpenAI-compatible endpoint via server proxy. */
const AGENT_CONFIG_KEY='work-calendar-agent-config-v1';
const TRANSCRIBE_ENDPOINT='/api/transcribe';
const OPENCODE_GO_ENDPOINT='https://opencode.ai/zen/go/v1/chat/completions';
const OPENCODE_GO_MODELS=['glm-5.3-flash','glm-5.3','glm-5.2','glm-5.1','kimi-k3','kimi-k2.7-code','kimi-k2.6','longcat-2.0','deepseek-v4.1-flash','deepseek-v4-pro','deepseek-v4-flash','deepseek-v4-flash-vision-exp','mimo-v2.5','mimo-v2.5-pro','hy4-preview','hy3','grok-4.5'];
const agentState={clientId:(globalThis.crypto?.randomUUID?.()||`page-${Date.now()}-${Math.random().toString(36).slice(2)}`),messages:[],busy:false,paused:false,resume:null,controller:null,lastInput:'',editing:null,steps:0,failures:0,mode:null,lastActionKey:'',repeats:0,autoRun:false,stop:false,pendingResolve:null,plan:false,planBoard:null,conversationDrafts:new Map(),historyLoad:0,historyLoading:false,historyError:false,sessionRender:0,sessionId:(globalThis.crypto?.randomUUID?.()||`wc-${Date.now()}-${Math.random().toString(36).slice(2)}`)};
let agentServerConfig=null;
let agentServerAsr=null;
function agentIsBusy(){return agentState.busy}
function agentResetUser(){
  aiSettingsEpoch++;aiSettings=null;aiSettingsLoad=null;aiEditing=null;aiSceneQueue=Promise.resolve();aiScenePending=0;
  agentState.lastTools=[];agentState.lastMessageId=null;
  if(typeof agentCancelVoice==='function')agentCancelVoice();
  agentHalt();agentState.messages=[];agentState.lastInput='';agentState.editing=null;
  agentState.plan=false;agentState.planBoard=null;
  agentState.historyLoad++;agentState.sessionRender++;agentState.historyLoading=false;agentState.historyError=false;
  agentState.conversationDrafts.clear();
  agentState.conversationId=null;agentState.viewing=null;agentState.viewConversation=null;agentToggleSessions(false);
  agentSyncReview();
  for(const id of ['#agentMessages','#agentDraftCards']){const el=$(id);if(el)el.innerHTML=''}
  $('#agentPanel')?.classList.add('hidden');$('#agentDraftArea')?.classList.add('hidden');
}
function agentConfig(){
  try{return JSON.parse(localStorage.getItem(AGENT_CONFIG_KEY)||'{}')}catch(_){return {}}
}
function saveAgentConfig(c){localStorage.setItem(AGENT_CONFIG_KEY,JSON.stringify(c||{}))}
function renderAgentCapability(){
  const e=$('#agentCapability');if(!e)return;
  const c=S.agentCapabilities||{};
  const configBtn=$('#agentConfigBtn');
  if(configBtn)configBtn.classList.toggle('hidden',c.role!=='superadmin');
  const operator=c.mode==='operator';
  e.innerHTML=`<span class="agent-role-chip ${operator?'is-operator':''}">${escapeHTML(operator?(c.role==='member'?tr('可代为操作'):tr('操作员')):tr('查询与规划'))}</span>`;
  /* Step-by-step versus hands-off only means something when the assistant
     can act; for a read-only assistant the switch is just noise. */
  $('#agentPanel .agent-mode')?.classList.toggle('hidden',!operator);
  renderAgentModelChip();
}
/* Which model is answering, at a glance — "not configured" is the state that
   actually needs to be visible, since everything else is self-evident. */
function renderAgentModelChip(){
  const el=$('#agentModelChip');if(!el)return;
  const cfg=agentServerConfig||{};
  const ready=Boolean(cfg.configured);
  const switchable=ready&&S.user?.admin&&(cfg.models||[]).length>1;
  el.className='agent-model '+(ready?'ready':'missing')+(switchable?' is-switch':'');
  el.setAttribute('role',switchable?'button':'status');el.tabIndex=switchable?0:-1;
  el.setAttribute('aria-controls','agentModelMenu');
  el.setAttribute('aria-expanded',String(!$('#agentModelMenu')?.classList.contains('hidden')));
  el.textContent=ready?(cfg.model||tr('已接入')):tr('未接入');
  el.title=ready
    ?tr('当前模型：{0}{1}',(cfg.model||tr('（服务端已配置）')).trim(),cfg.provider?` · ${cfg.provider}`:'')
    :(S.user?.role==='superadmin'?tr('还没有配置模型，打开 AI 接入配置'):tr('还没有配置模型，请联系管理员'));
  if(switchable)el.title+=tr('（点一下切换）');
}

/* Sample prompts on an empty transcript: the panel explains itself better by
   being tried than by being described. */
function agentSamples(context){
  const c=context||agentContext();
  const items=[{text:tr('今天有哪些任务要交？')},{text:tr('团队这周的负载怎么样？')}];
  if(c.mode==='operator')items.push({text:tr('哪些人的任务逾期了？')});
  else items.push({text:tr('我这个月完成了多少任务？')});
  items.push({text:tr('下周把季度复盘做完：整理数据、出初稿、找王零零评审'),plan:true});
  return items;
}
function agentRenderEmptyState(list){
  const samples=agentSamples();
  if(!list)return;
  if(agentServerConfig&&!agentServerConfig.configured){list.innerHTML=`<div class="agent-setup"><strong>${tr('先接入 AI 模型')}</strong>${S.user?.role==='superadmin'?'':tr('<p>请联系管理员配置模型。</p>')}${S.user?.role==='superadmin'?tr('<button type="button" class="secondary-btn" id="agentSetupBtn">配置模型</button>'):''}</div>`;$('#agentSetupBtn')?.addEventListener('click',()=>openSettingsPage('ai'));return}
  list.innerHTML='<div class="agent-samples">'
    +samples.map(s=>`<button type="button" class="agent-sample ${s.plan?'is-plan':''}" data-text="${escapeHTML(s.text)}"${s.plan?' data-plan="1"':''}>`
      +(s.plan?icon('sparkles'):'')+escapeHTML(s.text)+'</button>').join('')
    +'</div>';
  $$('#agentMessages .agent-sample').forEach(b=>b.onclick=()=>{
    const input=$('#agentInput');if(!input)return;
    input.value=b.dataset.text;
    agentState.plan=Boolean(b.dataset.plan);
    agentSyncPlanButton();
    input.focus();
  });
}
function agentAppend(role,content,kind='',intent=''){
  const tools=role==='assistant'&&!kind?(agentState.lastTools||[]):[];
  const messageId=role==='assistant'&&!kind?agentState.lastMessageId:null;
  if(role==='assistant'&&!kind){agentState.lastTools=[];agentState.lastMessageId=null;}
  if(role==='assistant'&&agentState.planBoard&&!agentState.planBoard.closed){agentState.unreadReply=agentState.pane!=='chat';if(kind==='error')agentSetPane('chat');else agentSyncPane()}
  agentState.messages.push({role,content,...(tools.length?{tools}:{}),...(messageId?{id:messageId}:{})});
  const list=$('#agentMessages');if(!list)return;
  const el=document.createElement('div');
  el.className=`agent-message ${role==='user'?'user':'assistant'} ${kind}`.trim();
  const chip=agentIntentChip(intent);
  if(chip)el.appendChild(chip);
  /* The chip carries the intent, so the mark itself would just be noise in the
     bubble — the stored line keeps it, the transcript does not. */
  const shown=intent==='plan'?agentPlanIntent(content).body:content;
  el.appendChild(document.createTextNode(shown));
  agentToolSummary(el,tools);
  if(!kind)agentMessageTools(el,{role,content},agentState.messages.length-1);
  list.appendChild(el);list.scrollTop=list.scrollHeight;
  return el;
}
function agentToolSummary(node,tools){
  const reads=(tools||[]).filter(t=>['workspace_schema','workspace_query','workspace_read'].includes(t.name));
  if(!reads.length)return;
  const label=document.createElement('small');label.className='agent-query-summary';
  const errors=reads.filter(t=>!t.ok).length;
  label.textContent=tr('查询资料 · {0} 次{1}',reads.length,errors?tr(' · {0} 次未成功',errors):'');
  label.title=tr('查询范围遵循当前账户权限');node.appendChild(label);
}
function agentMessageTools(node,message,index){
  if(!['user','assistant'].includes(message.role))return;
  const body=document.createElement('div');body.className='agent-message-body';
  while(node.firstChild)body.appendChild(node.firstChild);
  node.appendChild(body);node.classList.add('has-tools');
  const tools=document.createElement('div');tools.className='agent-message-tools';
  const button=(name,label,run)=>{const b=document.createElement('button');b.type='button';b.className='agent-tool-btn';
    b.innerHTML=icon(name);b.title=label;b.setAttribute('aria-label',label);b.onclick=()=>run(b);tools.appendChild(b)};
  button('copy',tr('复制'),async b=>{
    try{await navigator.clipboard.writeText(message.content);b.innerHTML=icon('check');b.classList.add('is-done');
      setTimeout(()=>{b.innerHTML=icon('copy');b.classList.remove('is-done')},1400)}catch(_){toast(tr('复制失败，请选中文字复制'))}
  });
  if(index>=0){
    if(message.role==='user')button('edit',tr('修改重发'),()=>agentEditMessage(index));
    button('undo',tr('回退到这里'),()=>agentRewind(index));
  }
  node.appendChild(tools);
}
function agentEditMessage(index){
  if(agentState.busy){toast(tr('先暂停并停止当前执行，再修改消息'));return}
  const m=agentState.messages[index];if(m?.role!=='user')return;
  const intent=agentPlanIntent(m.content),input=$('#agentInput');
  agentState.editing=index;agentState.plan=intent.plan;input.value=intent.body;
  agentSyncPlanButton();input.focus();toast(tr('修改后发送，将从这条消息重新开始；已创建的数据保留'));
}
async function agentRewind(index){
  if(agentState.busy){toast(tr('先停止当前执行，再回退对话'));return}
  const m=agentState.messages[index];if(!m)return;
  if(m.id){const owner=S.user?.id,thread=agentState.conversationId;agentState.busy=true;agentUpdateBusy();try{await api('/api/action',{action:'agent.conversation.rewind',data:{conversationId:thread||'legacy',messageId:m.id}})}catch(e){toast(e.message);return}finally{if(owner===S.user?.id&&thread===agentState.conversationId){agentState.busy=false;agentUpdateBusy()}}if(owner!==S.user?.id||thread!==agentState.conversationId)return;}
  agentState.planBoard=null;agentSyncDraftLayout();
  agentState.messages=agentState.messages.slice(0,index+1);
  agentRenderTranscript($('#agentMessages'),agentState.messages);
  agentShowStep(tr('已回退当前对话。已执行的操作和已创建的数据保留。'));
  $('#agentInput')?.focus();
}
function agentPrepareMessage(text,planning=false){
  if(agentState.editing!==null){
    agentState.planBoard=null;agentSyncDraftLayout();
    agentState.messages=agentState.messages.slice(0,agentState.editing);
    agentState.editing=null;agentRenderTranscript($('#agentMessages'),agentState.messages);
  }
  agentState.lastInput=planning?AGENT_PLAN_MARK+' '+text:text;
}
function agentInputKeydown(e){
  if(imeEnter(e))return;
  const input=e.currentTarget||$('#agentInput');
  if(e.key==='ArrowUp'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!input.value){
    const last=agentState.lastInput||[...agentState.messages].reverse().find(m=>m.role==='user'&&!m.content.startsWith('【系统回执'))?.content;
    if(last){e.preventDefault();const intent=agentPlanIntent(last);input.value=intent.body;agentState.plan=intent.plan;agentSyncPlanButton()}
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();agentSubmit()}
}
/* A run that executes actions leaves a long trail of interim replies, cards
   and receipts. Once it settles the trail folds under one summary line and
   only the closing reply stays in view; a plain answer is left alone. */
function agentFoldRun(nodes){
  const isCard=n=>n.classList?.contains('agent-action')||n.classList?.contains('agent-action-record');
  const count=nodes.filter(isCard).length||nodes.filter(n=>n.classList?.contains('agent-step')).length;
  if(!count)return nodes;
  const rest=nodes.slice(),last=rest[rest.length-1];
  const tail=last&&last.classList?.contains('agent-message')&&!isCard(last)?rest.pop():null;
  const box=document.createElement('details');box.className='agent-run';
  const summary=document.createElement('summary');summary.textContent=tr('执行过程 · {0} 步',count);
  box.appendChild(summary);rest.forEach(n=>box.appendChild(n));
  return tail?[box,tail]:[box];
}
function agentFoldTrail(anchor){
  const list=$('#agentMessages');if(!list||!anchor||anchor.parentNode!==list)return;
  const trail=[];for(let n=anchor.nextSibling;n;n=n.nextSibling)trail.push(n);
  agentFoldRun(trail).forEach(n=>list.appendChild(n));
  list.scrollTop=list.scrollHeight;
}
function agentRenderTranscript(box,messages){
  if(!box)return;
  box.innerHTML='';
  const live=box===$('#agentMessages')&&!agentState.viewing;let turn=0;
  let trail=[];
  const flush=()=>{agentFoldRun(trail).forEach(n=>box.appendChild(n));trail=[]};
  messages.forEach(m=>{const index=live&&['user','assistant'].includes(m.role)&&String(m.content||'').trim()?turn++:-1;const node=agentMessageNode(m,index);if(!node)return;if(m.role==='user'){flush();box.appendChild(node)}else trail.push(node)});
  flush();
}
/* Models like to prefix a task with its project's name ("项目名·任务"). The
   project is already carried by projectId, so the prefix is dropped before the
   card is shown, and what the user confirms is what gets saved. */
function agentTidyTaskName(action,data){
  if(!['task.create','task.update'].includes(action)||typeof data?.name!=='string')return data;
  const pid=data.projectId||(S.tasks||[]).find(t=>t.id===data.id)?.projectId;
  const project=(S.projects||[]).find(p=>p.id===pid)?.name;
  if(!project)return data;
  const quoted=project.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const trimmed=data.name.trim();
  const name=trimmed.replace(new RegExp(`^[\\[【(（「]?\\s*${quoted}\\s*[\\]】)）」]?[\\s·・:：\\-—_|｜/、，,]*`),'');
  return name&&name!==trimmed?{...data,name}:data;
}
function agentIntentChip(intent){
  if(!intent)return null;
  const chip=document.createElement('span');
  chip.className='agent-intent';
  chip.innerHTML=icon('sparkles')+escapeHTML(intent==='plan'?tr('管理草稿'):'');
  return chip;
}
function agentFormatTime(iso){try{return new Date(iso).toLocaleString(LANG==='en'?'en-US':'zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(_){return iso||''}}
function agentMessageNode(m,index=-1){
  /* A blank line carries nothing, and older transcripts still hold a couple
     from when an empty model reply was recorded. Rendering them is what made
     the room look broken, so every caller gets null instead. */
  if((m.role==='user'||m.role==='assistant')&&!String(m.content||'').trim())return null;
  const node=document.createElement('div');
  if(m.role==='action'){
    const label=AGENT_ACTION_LABELS[m.action]||m.action||tr('操作');
    node.className='agent-message assistant agent-action-record';
    const managed=/^(project|task)\.(create|update|delete)$/.test(m.action)||m.action==='task.edit_request';
    node.innerHTML=`<div class="agent-action-title">${tr('已提交 · {0}',escapeHTML(label))}</div>`+(managed?`<span>${escapeHTML(m.data?.name||m.content||label)}</span>`:agentActionHTML(m.action,m.data||{},true))+`<small class="agent-time">${escapeHTML(agentFormatTime(m.createdAt))}</small>`;
    return node;
  }
  node.className=`agent-message ${m.role==='user'?'user':'assistant'}`;
  const intent=m.role==='user'?agentPlanIntent(m.content):{plan:false,body:m.content||''};
  const chip=agentIntentChip(intent.plan?'plan':'');
  if(chip)node.appendChild(chip);
  const text=document.createElement('span');text.textContent=intent.plan?intent.body:(m.content||'');node.appendChild(text);
  /* A stored draft reads as a one-line summary and can be opened again as cards. */
  if(m.role==='assistant'&&/<plan>/i.test(m.content||'')){
    const draft=agentSplitPlan(m.content);
    text.textContent=`${draft.clean?`${draft.clean} `:''}${tr('（草稿：{0}{1} 个任务）',draft.projects.length?tr('{0} 个项目、',draft.projects.length):'',draft.tasks.length)}`;
    if((draft.projects.length||draft.tasks.length)&&!agentState.viewing){const btn=document.createElement('button');btn.type='button';btn.className='ghost-btn plan-reopen-history';btn.textContent=draft.draftId?tr('恢复这份草稿'):tr('复制为新草稿');btn.onclick=()=>agentRestoreBoard(draft);node.appendChild(btn)}
  }
  if(m.role==='assistant'&&/<action>/i.test(m.content||'')){const parsed=agentSplitActions(m.content);text.textContent=parsed.clean||parsed.actions.map(x=>tr('当时提议：{0}',AGENT_ACTION_LABELS[x.action]||tr('业务操作'))).join('；')}
  const stamp=document.createElement('small');stamp.className='agent-time';stamp.textContent=agentFormatTime(m.createdAt);node.appendChild(stamp);
  agentToolSummary(node,m.tools);agentMessageTools(node,m,index);
  return node;
}
/* Each history load belongs to its requested account/conversation. A late
   response must never replace a newer selection or become its model context. */
async function agentLoadOwnHistory(){
  if(agentState.viewing||agentState.busy)return;
  const version=++agentState.historyLoad,user=S.user?.id;
  const active=()=>version===agentState.historyLoad&&S.user?.id===user&&!agentState.viewing;
  agentState.historyLoading=true;agentState.historyError=false;agentUpdateBusy();
  const list=$('#agentMessages');if(list)list.innerHTML=tr('<p class="muted agent-sessions-empty">正在加载对话…</p>');
  try{
    if(!agentState.conversationId){
      const latest=(await api('/api/action',{action:'agent.conversations',data:{}})).conversations?.[0]?.id;
      if(!active())return;
      agentUseConversation(latest||agentNewConversationId());
    }
    const thread=agentState.conversationId;
    const data=await api('/api/action',{action:'agent.history',data:{conversationId:thread}});
    if(!active()||thread!==agentState.conversationId)return;
    const messages=data.messages||[],list=$('#agentMessages');if(!list)return;
    const turns=messages.filter(m=>(m.role==='user'||m.role==='assistant')&&String(m.content||'').trim());
    agentState.messages=turns.map(m=>({role:m.role,content:m.content,...(m.id?{id:m.id}:{}),...(Array.isArray(m.tools)&&m.tools.length?{tools:m.tools}:{})}));
    if(messages.length)agentRenderTranscript(list,messages);else agentRenderEmptyState(list);
    if(!agentState.planBoard){const source=[...messages].reverse().find(m=>m.role==='assistant'&&/<plan>/i.test(m.content||''));if(source){const raw=agentSplitPlan(source.content);if(raw.draftId){await agentRestoreBoard(raw,true);if(!active()||thread!==agentState.conversationId)return}}}
    const card=agentState.pendingCard;
    if(card&&agentState.pendingResolve&&!card.isConnected)list.appendChild(card);
    const board=agentState.planBoard;
    if(board&&!board.closed&&!board.el.isConnected)$('#agentDraftCards')?.appendChild(board.el);
    list.scrollTop=list.scrollHeight;
  }catch(e){
    if(!active())return;
    agentState.historyError=true;
    const list=$('#agentMessages');
    if(list){list.innerHTML=`<p class="muted agent-sessions-empty">${tr('加载失败：{0}',escapeHTML(e.message||tr('请重试')))}</p><button type="button" class="ghost-btn" id="agentHistoryRetry">${tr('重试')}</button>`;
      $('#agentHistoryRetry').onclick=()=>agentLoadOwnHistory()}
  }finally{if(active()){agentState.historyLoading=false;agentUpdateBusy()}}
}
/* 对话记录: a side list like a general agent's, opened from the header. Each
   conversation keeps its own lines (its id is the session id the chat sends);
   lines from before conversations existed sit under 早期记录. One may start a
   new conversation, open, rename or delete one; admins can also read another
   account's conversations, read-only. */
const agentNewConversationId=()=>globalThis.crypto?.randomUUID?.()||`wc-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
function agentUseConversation(id){
  if(typeof agentCancelVoice==='function')agentCancelVoice();
  const input=$('#agentInput'),previous=agentState.conversationId;
  if(agentState.planBoard)planFlush(agentState.planBoard);
  if(previous)agentState.conversationDrafts.set(previous,{board:agentState.planBoard,input:input?.value||'',plan:agentState.plan});
  const saved=agentState.conversationDrafts.get(id);
  agentState.conversationId=id;agentState.sessionId=id==='legacy'?null:id;
  agentState.messages=[];agentState.editing=null;agentState.lastInput='';
  agentState.planBoard=saved?.board||null;agentState.plan=Boolean(saved?.plan);
  const cards=$('#agentDraftCards');if(cards)cards.innerHTML='';
  if(input)input.value=saved?.input||'';
  if(saved?.board){cards?.appendChild(saved.board.el);planRender(saved.board)}
  agentSyncDraftLayout();agentSyncPlanButton();
}
function agentWriteBlocked(){
  if(agentState.viewing){toast(tr('正在只读查看对话，请先切回自己的账户'));return true}
  if(agentState.historyLoading||agentState.historyError){toast(agentState.historyError?tr('请先重试加载这段对话'):tr('对话正在加载，请稍候'));return true}
  return false;
}
async function agentPersistEdit(){
  if(agentState.editing===null)return true;
  const cut=agentState.messages.slice(0,agentState.editing).filter(m=>m.id).at(-1),owner=S.user?.id,thread=agentState.conversationId;
  agentState.busy=true;agentUpdateBusy();
  try{await api('/api/action',{action:'agent.conversation.rewind',data:{conversationId:agentState.conversationId||'legacy',messageId:cut?.id||null}});return owner===S.user?.id&&thread===agentState.conversationId}
  catch(e){toast(e.message||tr('暂时无法建立对话分支，请重试'));return false}
  finally{if(owner===S.user?.id&&thread===agentState.conversationId){agentState.busy=false;agentUpdateBusy()}}
}
function agentOfferSetup(){
  if(S.user?.admin)openSettingsPage('ai');
  else toast(tr('模型尚未接入，请联系管理员配置。输入内容已保留。'));
}
function agentSetPane(pane){
  agentState.pane=pane==='chat'?'chat':'cards';if(pane==='chat')agentState.unreadReply=false;
  agentSyncPane();
}
function agentPaneKeydown(e){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();const pane=e.key==='Home'?'cards':e.key==='End'?'chat':agentState.pane==='chat'?'cards':'chat';
  agentSetPane(pane);$(pane==='chat'?'#agentPaneChat':'#agentPaneCards')?.focus();
}
function agentSyncPane(){
  const show=Boolean(agentState.planBoard&&!agentState.planBoard.closed&&!agentState.viewing),chat=agentState.pane==='chat';
  $('#agentPaneTabs')?.classList.toggle('hidden',!show);
  $('#agentPanel')?.classList.toggle('is-chat-pane',chat);
  $('#agentPaneCards')?.setAttribute('aria-selected',String(!chat));
  $('#agentPaneChat')?.setAttribute('aria-selected',String(chat));
  $('#agentPaneCards')?.setAttribute('tabindex',chat?'-1':'0');
  $('#agentPaneChat')?.setAttribute('tabindex',chat?'0':'-1');
  const badge=$('#agentReplyBadge');if(badge){badge.textContent=agentState.unreadReply?tr(' · 新回复'):'';badge.classList.toggle('hidden',!agentState.unreadReply)}
}
function agentSyncDraftLayout(){
  const board=agentState.planBoard,show=Boolean(board&&!board.closed&&!agentState.viewing);
  $('#agentPanel')?.classList.toggle('is-planning',show);
  $('#agentDraftArea')?.classList.toggle('hidden',!show);
  $('#agentDraftToggle')?.classList.toggle('hidden',!board||Boolean(agentState.viewing));
  applyAgentPanelSize();agentSyncPane();
}
async function agentToggleSessions(open=!agentState.sessionsOpen){
  agentState.sessionsOpen=open;agentState.sessionRender++;
  $('#agentSessions')?.classList.toggle('hidden',!open);
  $('#agentPanel')?.classList.toggle('is-browsing',open);
  $('#agentHistoryBtn')?.setAttribute('aria-pressed',String(open));
  applyAgentPanelSize();
  if(open)await agentRenderSessions();
  else if(agentState.viewing){agentState.viewing=null;agentState.viewConversation=null;agentSyncReview();await agentLoadOwnHistory()}
}
function agentSyncReview(){
  const who=agentState.viewing;
  agentSyncDraftLayout();agentUpdateBusy();
  $('#agentPanel')?.classList.toggle('is-reviewing',Boolean(who));
  const banner=$('#agentReviewBanner');if(banner)banner.textContent=who?tr('正在查看 {0} 的对话，只读',nameOf(who)):'';
}
async function agentRenderSessions(){
  const box=$('#agentSessions');if(!box||!agentState.sessionsOpen)return;
  const me=S.user?.id,target=agentState.viewing||me,mine=target===me,version=++agentState.sessionRender;
  const active=()=>version===agentState.sessionRender&&agentState.sessionsOpen&&S.user?.id===me&&(agentState.viewing||me)===target;
  let list=[];
  try{list=(await api('/api/action',{action:'agent.conversations',data:{userId:target}})).conversations||[]}
  catch(e){if(active())box.innerHTML=`<p class="muted agent-sessions-empty">${tr('加载失败：{0}',escapeHTML(e.message||''))}</p>`;return}
  if(!active())return;
  const current=mine?agentState.conversationId:agentState.viewConversation;
  /* A conversation just started has no lines yet, so it is listed by hand. */
  if(mine&&current&&!list.some(c=>c.id===current))list.unshift({id:current,title:tr('新对话'),count:0,updatedAt:''});
  const row=c=>`<div class="agent-session${c.id===current?' is-on':''}" data-conv="${escapeHTML(c.id)}"><button type="button" `
    +`class="agent-session-open"><span>${escapeHTML(c.title)}</span><small>${c.updatedAt?escapeHTML(relTime(c.updatedAt))+' · ':''}`
    +`${tr('{0} 条',c.count)}</small></button>${mine?`${tr('<button type="button" class="agent-session-act" data-act="rename" title="重命名"')} `
    +`${tr('aria-label="重命名「{0}」">{1}',escapeHTML(c.title),icon('edit'))}</button>`:''}${`<button type="button" class="agent-session-act" `
    +`${tr('data-act="delete" title="删除" aria-label="删除「{0}」">{1}',escapeHTML(c.title),icon('x'))}</button>`}</div>`;
  box.innerHTML=`<div class="agent-sessions-head"><strong>${tr('对话')}</strong>${mine?`<button type="button" class="agent-icon-btn" `
    +`${tr('id="agentNewChat" title="新对话" aria-label="新对话">{0}',icon('plus'))}</button>`:''}</div>`
    +`${S.user?.admin?`<select id="agentSessionsUser" class="agent-sessions-user" aria-label="${tr('查看账户')}">${S.users.map(u=>`<option `
    +`value="${escapeHTML(u.id)}"${u.id===target?' selected':''}>${escapeHTML(nameOf(u.id))}</option>`).join('')}</select>`:''}`
    +`<div class="agent-session-list">${list.map(row).join('')||tr('<p class="muted agent-sessions-empty">还没有对话</p>')}</div>`;
  $('#agentNewChat')?.addEventListener('click',agentNewChat);
  $('#agentSessionsUser')?.addEventListener('change',e=>{
    if(agentState.busy){e.target.value=agentState.viewing||me;toast(tr('先停止当前执行，再查看其他账户'));return}
    agentState.historyLoad++;agentState.historyLoading=false;agentState.historyError=false;
    if(typeof agentCancelVoice==='function')agentCancelVoice();
    const who=e.target.value===me?null:e.target.value;agentState.viewing=who;agentState.viewConversation=null;agentSyncReview();
    if(!who)agentLoadOwnHistory();else{const box=$('#agentMessages');if(box)box.innerHTML=tr('<p class="muted agent-sessions-empty">选一段对话查看</p>')}
    agentRenderSessions();
  });
  box.querySelectorAll('.agent-session').forEach(el=>{
    const id=el.dataset.conv,c=list.find(x=>x.id===id);
    el.querySelector('.agent-session-open').onclick=()=>agentOpenConversation(id);
    const rename=el.querySelector('[data-act="rename"]');if(rename)rename.onclick=()=>agentRenameConversation(el,c);
    const drop=el.querySelector('[data-act="delete"]');if(drop)drop.onclick=()=>{
      /* A second click deletes, so one stray click never does. */
      if(!drop.dataset.armed){drop.dataset.armed='1';drop.classList.add('is-armed');drop.title=tr('再点一次删除');
        setTimeout(()=>{if(drop.isConnected){delete drop.dataset.armed;drop.classList.remove('is-armed');drop.title=tr('删除')}},3000);return}
      agentDeleteConversation(id,target);
    };
  });
}
async function agentNewChat(){
  if(agentState.busy||agentState.viewing){toast(tr('先停止当前执行，并切回自己的账户'));return}
  const user=S.user?.id,version=++agentState.historyLoad,id=agentNewConversationId();
  agentState.historyLoading=true;agentUpdateBusy();
  try{
    await api('/api/action',{action:'agent.conversation.create',data:{conversationId:id}});
    if(version!==agentState.historyLoad||S.user?.id!==user||agentState.viewing)return;
    agentState.historyError=false;agentUseConversation(id);
    const list=$('#agentMessages');if(list)agentRenderEmptyState(list);
    await agentRenderSessions();$('#agentInput')?.focus();
  }catch(e){if(version===agentState.historyLoad)toast(e.message)}
  finally{if(version===agentState.historyLoad){agentState.historyLoading=false;agentUpdateBusy()}}
}
async function agentOpenConversation(id){
  if(agentState.viewing){
    const target=agentState.viewing,user=S.user?.id,version=++agentState.historyLoad;
    agentState.viewConversation=id;
    try{const data=await api('/api/action',{action:'agent.history',data:{userId:target,conversationId:id}});
      if(version!==agentState.historyLoad||S.user?.id!==user||agentState.viewing!==target||agentState.viewConversation!==id)return;
      agentRenderTranscript($('#agentMessages'),data.messages||[])}catch(e){if(version===agentState.historyLoad)toast(e.message)}
    agentRenderSessions();return;
  }
  if(id===agentState.conversationId&&!agentState.historyError)return;
  if(agentState.busy){toast(tr('先停止当前执行，再切换对话'));return}
  agentUseConversation(id);await agentLoadOwnHistory();agentRenderSessions();
}
function agentRenameConversation(el,c){
  const open=el.querySelector('.agent-session-open');
  const input=document.createElement('input');input.className='agent-session-rename';input.maxLength=40;input.value=c.title;
  input.setAttribute('aria-label',tr('对话名称'));open.replaceWith(input);input.focus();input.select();
  let done=false;
  const save=async keep=>{
    if(done)return;done=true;const title=input.value.trim();
    if(keep&&title&&title!==c.title){try{await api('/api/action',{action:'agent.conversation.rename',data:{conversationId:c.id,title}})}catch(e){toast(e.message)}}
    agentRenderSessions();
  };
  input.onkeydown=e=>{if(imeEnter(e))return;if(e.key==='Enter'){e.preventDefault();save(true)}if(e.key==='Escape')save(false)};
  input.onblur=()=>save(true);
}
async function agentDeleteConversation(id,target){
  const owner=S.user?.id;
  if(target===owner&&id===agentState.conversationId&&agentState.busy){toast(tr('先停止当前执行，再删除这段对话'));return}
  try{await api('/api/action',{action:'agent.conversation.delete',data:{userId:target,conversationId:id}})}catch(e){toast(e.message);return}
  if(S.user?.id!==owner)return;
  const deletedOwnActive=target===owner&&id===agentState.conversationId;
  if(target===owner){
    if(deletedOwnActive)agentUseConversation(null);
    agentState.conversationDrafts.delete(id);agentForgetDraftCache(id,owner);
  }
  if((agentState.viewing||owner)===target){
    if(agentState.viewing&&agentState.viewConversation===id){agentState.viewConversation=null;const box=$('#agentMessages');if(box)box.innerHTML=''}
    else if(deletedOwnActive)await agentLoadOwnHistory();
  }
  toast(tr('对话已删除'));agentRenderSessions();
}
/* Providers whose OpenAI-compatible endpoint is known; picking one fills the
   address. Any other service goes under 自定义. */
const LLM_PRESETS={
  'opencode-go':{name:tr('OpenCode Go（推荐）'),base:OPENCODE_GO_ENDPOINT,key:''},
  openai:{name:'OpenAI',base:'https://api.openai.com/v1',key:'sk-…'},
  anthropic:{name:tr('Claude（需 OpenAI 兼容网关）'),base:'',key:'sk-…'},
  gemini:{name:'Google Gemini',base:'https://generativelanguage.googleapis.com/v1beta/openai',key:'AIza…'},
  deepseek:{name:'DeepSeek',base:'https://api.deepseek.com/v1',key:'sk-…'},
  moonshot:{name:'Moonshot Kimi',base:'https://api.moonshot.cn/v1',key:'sk-…'},
  dashscope:{name:tr('阿里云百炼 · 通义千问'),base:'https://dashscope.aliyuncs.com/compatible-mode/v1',key:'sk-…'},
  zhipu:{name:tr('智谱 GLM'),base:'https://open.bigmodel.cn/api/paas/v4',key:''},
  siliconflow:{name:tr('硅基流动'),base:'https://api.siliconflow.cn/v1',key:'sk-…'},
  openrouter:{name:'OpenRouter',base:'https://openrouter.ai/api/v1',key:'sk-or-…'},
  ollama:{name:tr('本地 Ollama'),base:'http://127.0.0.1:11434/v1',key:''},
  custom:{name:tr('自定义 OpenAI 兼容 API'),base:'',key:''}
};/* A provider's list also carries embedding, speech and image models; the
   first chat-looking one is the better default. */
const agentPreferredModel=list=>list.find(m=>!/embed|whisper|tts|dall-e|image|moderation|rerank|audio|vision-exp/i.test(m))||list[0]||'';

/* The header chip doubles as a model switch for admins, over the models the
   last test found. */
function agentToggleModelMenu(open){
  const menu=$('#agentModelMenu'),cfg=agentServerConfig||{};if(!menu)return;
  const models=cfg.models||[],show=open??menu.classList.contains('hidden');
  $('#agentModelChip')?.setAttribute('aria-expanded',String(Boolean(show&&S.user?.admin&&cfg.configured&&models.length>1)));
  if(!show||!S.user?.admin||!cfg.configured||models.length<2){menu.classList.add('hidden');return}
  menu.innerHTML=models.map(m=>`<button type="button" role="option" class="agent-model-opt${m===cfg.model?' is-on':''}" `
    +`aria-selected="${m===cfg.model}" data-model="${escapeHTML(m)}">${escapeHTML(m)}</button>`).join('');
  menu.classList.remove('hidden');
  menu.querySelectorAll('[data-model]').forEach(b=>b.onclick=async()=>{
    agentToggleModelMenu(false);if(b.dataset.model===cfg.model)return;
    try{agentServerConfig=await api('/api/action',{action:'agent.config.model',data:{model:b.dataset.model}});renderAgentModelChip();
      toast(tr('已切换到 {0}',b.dataset.model))}catch(e){toast(e.message)}
  });
}
async function agentLoadServerConfig(){
  try{agentServerConfig=await api('/api/action',{action:'agent.config.get',data:{}})}catch(_){agentServerConfig=null}
  try{agentServerAsr=await api('/api/action',{action:'agent.asr.get',data:{}})}catch(_){agentServerAsr=null}
  renderAgentModelChip();agentInitVoice();
  if(!agentState.messages.length&&!agentState.historyError)agentRenderEmptyState($('#agentMessages'));
}
function agentExtractText(data){
  const text=data?.choices?.[0]?.message?.content||data?.choices?.[0]?.text||data?.message?.content||data?.message||data?.content||data?.text;
  if(text)return text;
  /* Some gateways deliver the answer under reasoning_content instead. Checked
     last so a normal reply always wins. */
  return data?.choices?.[0]?.message?.reasoning_content||data?.reasoning_content||'';
}
async function agentRequest(messages,planning=false){
  /* Every role uses the authenticated server proxy. The browser never sends
     an API key or chooses a model, so members cannot bypass superadmin policy
     through localStorage or a direct cross-origin request. */
  agentState.lastTools=[];agentState.lastMessageId=null;
  const controller=new AbortController();agentState.controller=controller;
  try{
    const parentMessageId=[...agentState.messages].reverse().find(m=>m.role==='assistant'&&m.id)?.id;
    const data=await api('/api/agent/chat',{messages,sessionId:agentState.sessionId,planning,parentMessageId,runGoal:agentState.runGoal||''},{signal:controller.signal});
    agentState.lastTools=Array.isArray(data.tools)?data.tools:[];agentState.lastMessageId=data.messageId||null;
    const asked=[...agentState.messages].reverse().find(m=>m.role==='user');if(asked&&data.userMessageId)asked.id=data.userMessageId;
    if(agentState.sessionsOpen&&!agentState.viewing)agentRenderSessions();
    const text=agentExtractText(data);if(!text)throw new Error(tr('服务端 Agent 未返回文本'));return String(text);
  }finally{if(agentState.controller===controller)agentState.controller=null}
}
const AGENT_ACTION_LABELS={
  'task.completion.update':tr('更正完成记录'),'task.reopen':tr('打回任务'),'project.complete_request':tr('申请项目结项'),'report.schedule.update':tr('设置报告收集'),
  'task.create':tr('创建任务'),'task.update':tr('调整任务'),'task.delete':tr('删除任务'),'task.complete':tr('完成任务'),
  'task.edit_review':tr('审批修改申请'),'project.create':tr('创建项目'),
  'project.delete':tr('删除项目'),'project.review':tr('审批项目'),'project.update':tr('调整项目'),'project.invite':tr('添加协作者'),
  'project.complete_review':tr('审批项目结项'),'assignment.manual':tr('强行指派'),'repeat.create':tr('创建固定安排'),
  'repeat.update':tr('调整固定安排'),'repeat.skip':tr('挖空固定安排'),'account.create':tr('创建账户'),
  'account.toggle':tr('停用/启用账户'),'account.delete':tr('删除账户'),'request.manage':tr('处理协作邀请'),'report.manage':tr('管理日报'),
  'automation.update':tr('更新自动化设置'),'collection.update':tr('更新补报时间'),'profile.correct':tr('修正成员画像'),
  'scheduler.run':tr('运行一次调度检查')
};
function agentSplitActions(text){
  /* The operator model appends a single <action>{...}</action> envelope.  It is
     parsed here so only the human-readable text is shown, and the payload turns
     into a confirmation card instead of being executed silently. */
  const actions=[];
  const clean=String(text||'').replace(/<action>([\s\S]*?)<\/action>/gi,(_,body)=>{
    try{const parsed=JSON.parse(body.trim());if(parsed&&typeof parsed.action==='string'&&parsed.action)actions.push(parsed)}catch(_){}
    return '';
  }).trim();
  return {clean,actions};
}
/* How a run should proceed is a standing preference, not a per-run question.
   It is remembered per browser so the answer only has to be given once. */
const AGENT_MODE_KEY='wc-agent-mode';
function agentPref(){try{return localStorage.getItem(AGENT_MODE_KEY)==='auto'?'auto':'step'}catch(_){return 'step'}}
function agentSetPref(mode){
  const next=mode==='auto'?'auto':'step';
  try{localStorage.setItem(AGENT_MODE_KEY,next)}catch(_){}
  agentRenderModeOptions();
  toast(next==='auto'?tr('助手会一路做完，不再逐步问你'):tr('助手每做一步都会先等你确认'));
}
function agentRenderModeOptions(){
  $$('#agentPanel .agent-mode-opt').forEach(b=>{
    const on=b.dataset.mode===agentPref();
    b.classList.toggle('is-on',on);
    b.setAttribute('aria-pressed',on?'true':'false');
  });
}
/* Planning is asked for with a mark at the start of the message rather than a
   separate button besides the composer: the mark rides in the text the user can
   see and edit, the send path reads it back out, and the transcript still shows
   what was actually asked. Typing it by hand works the same way. */
const AGENT_PLAN_MARK='\u2726';
const AGENT_PLAN_ALIASES=[AGENT_PLAN_MARK,'/plan','[规划]','[Plan]'];
function agentPlanIntent(text){
  const raw=String(text||'').replace(/^\s+/,'');
  for(const alias of AGENT_PLAN_ALIASES){
    if(!raw.startsWith(alias))continue;
    return {plan:true,body:raw.slice(alias.length).replace(/^\s+/,'')};
  }
  return {plan:false,body:String(text||'')};
}
/* 规划任务 is a switch on the composer rather than a command typed into it:
   with words already in the box one click drafts them at once, otherwise the
   next message is drafted. The typed marks above still work for people who
   prefer them, and stored lines keep the mark so history can label them. */
function agentTogglePlan(){
  const input=$('#agentInput');if(!input||agentState.busy||agentWriteBlocked())return;
  const intent=agentPlanIntent(input.value);
  if(intent.plan){input.value=intent.body;agentState.plan=false}
  else if(!agentState.plan&&input.value.trim()){const text=input.value;input.value='';agentState.plan=false;agentSyncPlanButton();agentPlanSubmit(text);return}
  else agentState.plan=!agentState.plan;
  agentSyncPlanButton();
  input.focus();
}
function agentSyncPlanButton(){
  const input=$('#agentInput');
  const on=Boolean(agentState.plan)||(Boolean(input)&&agentPlanIntent(input.value).plan);
  const btn=$('#agentPlanBtn');
  if(btn){
    btn.classList.toggle('is-on',on);
    btn.setAttribute('aria-pressed',on?'true':'false');
  }
  $('#agentPanel')?.classList.toggle('is-plan-mode',on);
  $('#agentPlanHint')?.classList.toggle('hidden',!on);
  agentUpdateBusy();
}
/* The draft comes back as {projects, tasks}; an older reply that is a bare
   array is read as tasks. Anything malformed is dropped, never half-used. */
function agentSplitPlan(text){
  let projects=[],tasks=[];
  const named=x=>Array.isArray(x)?x.filter(i=>i&&typeof i==='object'&&!Array.isArray(i)):[];
  const read=body=>{
    const parsed=JSON.parse(body.trim());
    if(Array.isArray(parsed))tasks=named(parsed);
    else if(parsed&&typeof parsed==='object'){projects=named(parsed.projects);tasks=named(parsed.tasks)}
  };
  const clean=String(text||'').replace(/<plan>([\s\S]*?)<\/plan>/gi,(_,body)=>{
    try{read(body)}catch(_){}
    return '';
  }).trim();
  if(!projects.length&&!tasks.length&&!/<plan>/i.test(text)){
    try{read(clean.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''))}catch(_){}
    if(projects.length||tasks.length)return {clean:'',projects,tasks};
  }
  let draftId;try{const m=String(text||'').match(/<plan>([\s\S]*?)<\/plan>/i);if(m)draftId=JSON.parse(m[1]).draftId}catch(_){}
  return {clean,projects,tasks,...(draftId?{draftId}:{})};
}

/* Runs are meant to go the distance for a real job, so the ceiling sits far
   above anything a sane task needs. What actually prevents a runaway is the
   refusal budget and the repeat detector below, not the step count. */
const AGENT_MAX_STEPS=200;
const AGENT_MAX_FAILURES=5;    /* repairs a few refusals, then stops */
const AGENT_MAX_REPEATS=2;     /* same action proposed this many extra times */
const AGENT_CONTEXT_LIMIT=24;  /* how many turns we replay back to the model */

function agentContext(){
  return {role:S.agentCapabilities?.role||'member',mode:S.agentCapabilities?.mode||'readonly',rules:S.user?.admin?null:creationRules(),self:S.user?.id||''};
}
const AGENT_PLAN_RULE='这次是一条任务/项目管理请求。把需求起草成可编辑卡片，operation 为 create/update/delete，修改或删除须先查询真实 id，只传要改的字段。'
  +'但不要执行任何操作，不要输出 <action> 动作块，也不要声称已经创建——用户会在卡片上逐个修改，再自己确认。'
  +'先用一句话（不超过 30 字，不列步骤，不解释你的推理）说明你怎么拆的，然后另起一行输出一个 <plan> 块，块里是单行 JSON 对象：'
  +'<plan>{"projects":[{"ref":"P1","name":"项目名","desc":"一句话说明","start":"YYYY-MM-DD","end":"YYYY-MM-DD 或空","owner":"负责人账户","members":["协作者账户"]}],'
  +'"tasks":[{"name":"任务名","desc":"可选","projectId":"已有项目ID","projectRef":"P1","assignee":"负责人账户","date":"YYYY-MM-DD","time":"HH:MM","duration":分钟数,"priority":"P0/P1/P2"}]}</plan>。'
  +'规则：只有这件事明显是一个要多人、多步推进的新目标，而且已有项目里没有合适的，才起草新项目，否则 projects 留空；'
  +'任务放进已有项目时写 projectId，放进新项目时写 projectRef，都不写就是临时任务。'
  +'name 只写事情本身，不带项目名前缀；projectId 与账户必须是数据里真实存在的 id（账户写 id，不是中文名）；'
  +'date 不早于今天、不晚于可排期上限；用户没说的按默认补齐：负责人为点名的人，否则当前账户；日期今天；时间 09:00；时长 60；优先级 P1。'
  +'缺少项目名、任务名、负责人等信息也要返回草稿卡片：未知字段用空字符串，missing 数组说明需要用户补充什么，不能因为信息不全拒绝生成。'
  +'如果用户点名了不存在或不能确定的负责人，不要擅自改派；assignee 留空并在 missing 中注明。宁可少拆几张，也不要编造不存在的项目或账户。';
function agentSystemPrompt(context,planning){
  /* The prompts stay in Chinese (the server's receipts and checks speak it);
     an English interface only asks the model to answer in English. */
  const agentReplyLanguage=()=>LANG==='en'?'\n\nThe user is using the English interface. Reply in English, and write card names, descriptions and summaries in English; keep the names of existing projects, tasks and accounts exactly as they are.':'';
  /* The rule lives in the system prompt rather than wrapped around the user's
     words, so the stored transcript stays exactly what was typed. */
  if(planning){
    const r=context.rules,labels={direct:'直接创建',approval:'需审批',none:'不允许'};
    const own=r?[
      `当前账户 ${context.self} 的创建规则：新项目${labels[r.project]}，给自己的临时任务${labels[r.tempTask]}，`,
      `在参与的项目里建任务${labels[r.projectTask]}（自己做 Owner 的项目总能直接建）；`,
      r.tempAssign==='self'?'临时任务只能给自己，不要起草指派给别人的临时任务；':'临时任务可以给自己，也可以指派给任何成员；',
      '新项目由当前账户做 Owner。规则为「不允许」的那类卡片不要起草。',
    ].join(''):'';
    return `你是「哗啦待办」的安排助手。当前账户角色：${context.role}。${own}${AGENT_PLAN_RULE}${agentReplyLanguage()}`;
  }
  const rule=context.mode==='operator'
    ?'任务和项目的创建/修改/删除必须调用 work_cards 起草卡片，等待用户检查后手动确认。其他管理操作才输出一个 <action>{"action":"…","data":{…}}</action> 动作块，一次只输出一个动作，然后停下来等待系统回执。系统会把结果以【系统回执】或【系统回执·失败】的形式发给你。收到成功回执后，先看回执里的「数据核对」，确认这一步确实产生了预期的变化，再输出下一个动作；核对结果与预期不符就先修正它。如果用户的目标还没完成就继续输出下一个动作，完成了就用一句话总结并明确结束。收到失败回执时先读懂原因：如果是缺了前置步骤（例如负责人还没加入项目、项目还没审批），就输出补救动作把它补上再继续；如果确实做不到，用一句话说明原因并结束。绝对不要在收到回执之前声称操作已经完成，也不要重复提交同一个已经失败的动作。'
    :'你是只读助手，可用 work_cards 起草任务/项目管理卡片交给用户确认，不能代为执行修改或审批。';
  return `你是「哗啦待办」工作助手。当前账户角色：${context.role}，权限模式：${context.mode}。遵守服务端权限边界：${rule}`+agentReplyLanguage();
}
function agentRecentMessages(){
  /* Last line of defence: the proxy refuses an empty message, and a blank turn
     carries nothing the model needs anyway. */
  const recent=agentState.messages
    .filter(x=>String(x.content||'').trim())
    .slice(-AGENT_CONTEXT_LIMIT)
    .map(x=>({role:x.role,content:x.content}));
  if(agentState.runGoal&&!recent.some(m=>m.role==='user'&&m.content===agentState.runGoal))recent.unshift({role:'user',content:agentState.runGoal});
  return recent;
}
async function agentNext(context){
  if(!await agentWaitForResume())return [];
  const answer=await agentRequest([{role:'system',content:agentSystemPrompt(context)},...agentRecentMessages()]);
  if(!await agentWaitForResume())return [];
  const draft=agentSplitPlan(answer);
  const {clean,actions}=agentSplitActions(draft.clean);
  if(clean)agentAppend('assistant',clean);
  if(draft.projects.length||draft.tasks.length){
    if(!clean)agentAppend('assistant',tr('已起草管理卡片，请检查后确认。'));
    agentState.messages.at(-1).content=answer;agentPlanBoard(draft);return [];
  }
  return actions;
}
/* A second look at the ledger after every write. The model is told what the
   data actually looks like now, so it cannot treat a return value as proof and
   has to reconcile the two before moving on. */
function agentFingerprint(){
  const of=list=>Object.fromEntries((list||[]).map(x=>[x.id,JSON.stringify(x)]));
  return {
    tasks:of(S.tasks,['name','status','assignee','date','deadline','priority']),
    projects:of(S.projects,['name','status','owner']),
    users:of(S.users,['active','role','displayName','nickname']),
    repeats:of(S.repeats,['name','active','every','span']),
  };
}
function agentVerify(before,after){
  const kinds={tasks:[tr('任务'),()=>S.tasks],projects:[tr('项目'),()=>S.projects],
               users:[tr('账户'),()=>S.users],repeats:[tr('固定安排'),()=>S.repeats]};
  const out=[];
  for(const key of Object.keys(kinds)){
    const label=kinds[key][0],list=kinds[key][1];
    const b=before[key]||{},a=after[key]||{};
    const nameOf=id=>{const hit=(list()||[]).find(x=>x.id===id);return (hit&&(hit.name||hit.displayName||hit.id))||id};
    const added=Object.keys(a).filter(id=>!(id in b));
    const removed=Object.keys(b).filter(id=>!(id in a));
    const changed=Object.keys(a).filter(id=>id in b&&a[id]!==b[id]);
    if(!added.length&&!removed.length&&!changed.length)continue;
    const bits=[];
    if(added.length)bits.push(tr('新增 {0}',added.map(nameOf).join('、')));
    if(removed.length)bits.push(tr('移除 {0}',removed.join('、')));
    if(changed.length)bits.push(tr('更新 {0}',changed.map(nameOf).join('、')));
    out.push(`${label}${bits.join(tr('，'))}`);
  }
  return out;
}
function agentSummarize(result){
  if(result==null)return tr('已完成');
  if(typeof result!=='object')return String(result).slice(0,300);
  if(result.deleted)return tr('已删除');
  if(result.id)return tr('记录 {0}',result.id);
  try{return JSON.stringify(result).slice(0,300)}catch(_){return tr('已完成')}
}
function agentSafeParams(value){
  if(Array.isArray(value))return value.map(agentSafeParams);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/password|api.?key|authorization|token|secret/i.test(k)).map(([k,v])=>[k,agentSafeParams(v)]));
  return value;
}
function agentTaskScope(action,payload){
  const task=S.tasks?.find(t=>t.id===payload.id);
  return ['task.complete','task.defer'].includes(action)&&task?.stackCount>1?{...payload,stackPeriods:[...task.stackPeriods]}:payload;
}
function agentActionHTML(action,payload,executed=false){
  const safe=agentSafeParams(payload),labels={stackPeriods:tr('合并期次'),id:tr('操作对象'),name:tr('名称'),username:tr('账户'),role:tr('权限组'),assignee:tr('执行人'),assignees:tr('执行人'),owner:tr('负责人'),projectId:tr('所属项目'),date:tr('日期'),start:tr('开始'),end:tr('结束'),time:tr('时间'),duration:tr('分钟'),priority:tr('优先级'),active:tr('启用'),accept:tr('同意'),reason:tr('原因'),frequency:tr('重复方式'),weekdays:tr('星期'),dates:tr('指定日期'),status:tr('状态'),summary:tr('总结'),actual:tr('实际用时'),report:tr('报告'),title:tr('标题'),content:tr('内容')};
  const display=(k,v)=>{if(k==='stackPeriods')return v.map(id=>{const t=S.tasks?.find(x=>x.id===id);return t?fmt(t.repeatDate||(t.id.startsWith('repeat:')?t.id.slice(-10):t.date)):id}).join('、');if(k==='id'){const task=S.tasks?.find(x=>x.id===v);if(task)return task.name+(task.stackCount>1?' · '+task.stackCount+tr(' 期'):'');return S.projects?.find(x=>x.id===v)?.name||S.repeats?.find(x=>x.id===v)?.name||nameOf(v)}if(['owner','assignee'].includes(k))return nameOf(v);if(k==='role')return ({member:tr('普通成员'),admin:tr('管理员'),superadmin:tr('超级管理员')}[v]||v);if(k==='projectId')return S.projects?.find(x=>x.id===v)?.name||tr('临时任务');if(Array.isArray(v))return v.map(x=>['assignees','members'].includes(k)?nameOf(x):String(x)).join('、');if(typeof v==='boolean')return v?tr('是'):tr('否');return typeof v==='object'?JSON.stringify(v):String(v??'—')};
  const entries=Object.entries(safe),known=entries.filter(([k])=>labels[k]);
  return `<dl class="agent-action-fields">${known.map(([k,v])=>`<div><dt>${labels[k]}</dt><dd>${escapeHTML(display(k,v))}</dd></div>`).join('')}</dl>${!executed&&action==='account.delete'?tr('<p class="agent-action-impact">将移除该账户。</p>'):''}`+(entries.some(([k])=>!labels[k])?`<details class="agent-action-details"><summary>${tr('其他参数')}</summary><pre>${escapeHTML(JSON.stringify(safe,null,2))}</pre></details>`:'');
}
/* A step line is replayed to the model as a user turn but rendered as a quiet
   receipt, so the transcript stays readable while the model keeps its context. */
function agentShowStep(display){
  const list=$('#agentMessages');if(!list)return;
  const el=document.createElement('div');el.className='agent-step';el.textContent=display;
  list.appendChild(el);list.scrollTop=list.scrollHeight;
}
function agentRecordStep(display,forModel){
  if(String(forModel||'').trim())agentState.messages.push({role:'user',content:forModel});
  agentShowStep(display);
}
function agentUpdateBusy(){
  const send=$('#agentSendBtn'),stop=$('#agentStopBtn'),input=$('#agentInput');
  if(send){send.disabled=agentState.busy||agentState.historyLoading||agentState.historyError||Boolean(agentState.viewing);send.textContent=agentState.busy?'…':agentState.historyLoading?tr('加载中…'):tr('发送')}
  if(stop){stop.classList.toggle('hidden',!agentState.busy);stop.textContent=agentState.steps?tr('停止（已执行 {0} 步）',agentState.steps):tr('停止')}
  const pause=$('#agentPauseBtn');
  if(pause){pause.classList.toggle('hidden',!agentState.busy);pause.textContent=agentState.paused?tr('继续'):tr('暂停');pause.setAttribute('aria-pressed',String(agentState.paused))}
  const mic=$('#agentMicBtn');
  if(mic){mic.disabled=agentState.busy||(!voice.target&&(voice.transcribing||voice.starting));mic.setAttribute('aria-disabled',agentState.busy?'true':'false')}
  const status=$('#agentStatus');if(status)status.textContent=agentState.paused?tr('已暂停'):agentState.pendingResolve?tr('等待确认'):agentState.busy?tr('正在处理…'):'';
  /* Say on the composer itself what the run is waiting for, so a paused card
     is never mistaken for a composer that ate the message. */
  if(input){
    input.placeholder=agentState.paused?tr('已暂停，点「继续」保留进度接着处理…')
      :agentState.pendingResolve?tr('等待确认…')
      :agentState.busy?tr('处理中…')
      :voice.active&&!voice.target?tr('正在聆听…')
      :agentState.plan?tr('说说要安排什么，我来起草项目和任务卡片…')
      :tr('问点什么…');
  }
}
function agentWaitForResume(){
  if(agentState.stop)return Promise.resolve(false);
  if(!agentState.paused)return Promise.resolve(true);
  return new Promise(resolve=>{agentState.resume=resolve});
}
function agentTogglePause(){
  if(!agentState.busy)return;
  agentState.paused=!agentState.paused;
  if(!agentState.paused){const resume=agentState.resume;agentState.resume=null;resume?.(!agentState.stop)}
  agentUpdateBusy();
  toast(agentState.paused?tr('已暂停：正在发送的操作会完成，后续步骤等待继续'):tr('继续处理'));
}
function agentHalt(note){
  agentState.stop=true;agentState.autoRun=false;
  agentState.controller?.abort();
  const resume=agentState.resume;agentState.resume=null;agentState.paused=false;resume?.(false);
  const pending=agentState.pendingResolve;
  agentState.pendingResolve=null;
  if(pending&&!agentState.pendingExecuting)pending({cancelled:true});
  if(note)agentAppend('assistant',note,'');
}
function agentRunOne(proposal){
  if(/^(project|task)\.(create|update|delete)$/.test(proposal.action)||['task.edit_request','project.invite','project.member.remove'].includes(proposal.action)){
    const [kind,op]=proposal.action.split('.'),data=proposal.data||{};
    const card=op==='invite'?{id:data.id,addMembers:data.members,operation:'update'}:op==='member'?{id:data.id,removeMembers:[data.member],operation:'update'}:op==='edit_request'?{...data.changes,id:data.id,reason:data.reason,operation:'update'}:{...data,operation:op};
    return api('/api/action',{action:'work.cards.preview',data:{[kind+'s']:[card]}}).then(raw=>{agentPlanBoard(raw);return {drafted:true}}).catch(e=>{agentAppend('assistant',e.message,'error');return {cancelled:true}});
  }
  /* Renders one action card. The first card of a run also asks how the run
     should proceed; after that the step simply executes. */
  return new Promise(resolve=>{
    const list=$('#agentMessages');
    if(!list){resolve({cancelled:true});return}
    const label=AGENT_ACTION_LABELS[proposal.action]||proposal.action;
    const payload=agentTaskScope(proposal.action,agentTidyTaskName(proposal.action,agentSafeParams((proposal.data&&typeof proposal.data==='object')?proposal.data:{})));
    /* The pace comes from the standing switch beside the input, so the card
       only has to show what is about to happen. */
    const card=document.createElement('div');
    card.className='agent-message assistant agent-action';
    card.innerHTML=`<div class="agent-action-title">${tr('待确认操作 · {0}',escapeHTML(label))}</div>`
      +agentActionHTML(proposal.action,payload)
      +(proposal.action==='account.create'?tr('<label class="agent-account-password">初始密码<input type="password" minlength="6" autocomplete="new-password" aria-label="新账户初始密码"></label>'):'')
      +'<div class="agent-action-buttons"></div>';
    list.appendChild(card);list.scrollTop=list.scrollHeight;
    /* The card is a piece of live UI, not a line of the stored transcript.
       Both it and the proposal it stands for are held here so replaying the
       history can put the card back instead of erasing the only button that
       can finish this run. */
    const finish=value=>{
      agentState.pendingResolve=null;agentState.pendingProposal=null;agentState.pendingCard=null;
      /* The card stays in the transcript as a record of what was proposed, but
         once nothing is waiting on it, it must stop looking clickable. */
      if(card.isConnected&&buttons&&!buttons.querySelector('.agent-action-done'))
        buttons.innerHTML=tr('<span class="agent-action-done">已取消</span>');
      resolve(value);
    };
    agentState.pendingResolve=finish;
    agentState.pendingProposal=proposal;
    agentState.pendingCard=card;
    const buttons=card.querySelector('.agent-action-buttons');
    const cancel=()=>{card.remove();agentHalt();finish({cancelled:true})};
    const execute=async()=>{
      if(agentWriteBlocked()){finish({cancelled:true});return}
      if(agentState.pendingExecuting)return;
      agentState.pendingExecuting=true;
      if(!await agentWaitForResume()){agentState.pendingExecuting=false;finish({cancelled:true});return}
      if(proposal.action==='account.create'){const secret=card.querySelector('input[type=password]');if(!secret||secret.value.length<6){agentState.pendingExecuting=false;toast(tr('请在卡片里填写至少 6 位初始密码'));return}payload.password=secret.value;secret.value='';}
      buttons.innerHTML=tr('<span class="agent-action-done">执行中…</span>');
      const before=agentFingerprint();
      try{
        const result=await api('/api/action',{action:'agent.execute',data:{action:proposal.action,data:payload,confirmed:true,sessionId:agentState.sessionId}});
        delete payload.password;
        let verificationWarning='';
        try{await refresh()}catch(_){verificationWarning=tr('操作已成功，但界面核对暂未完成；请刷新查看，不要重复提交。')}
        /* The ledger is read again here rather than trusting the return value:
           a step that reports success but changed nothing has to be visible to
           the model before it plans the next one. */
        const diff=verificationWarning?[]:agentVerify(before,agentFingerprint());
        const summary=agentSummarize(result);
        buttons.innerHTML=tr('<span class="agent-action-done">已执行</span>');
        toast(tr('已{0}',label));
        agentRecordStep(tr('已{0} · {1}',label,summary),
          `【系统回执】${label} 执行成功，返回：${summary}。`
          +`数据核对：${verificationWarning|| (diff.length?diff.join('；'):'服务端已确认成功；当前可见列表没有可比较的变化，不要仅据此重复执行')}。`
          +`先核对这一步有没有达到预期：达到了再输出下一个动作；对不上或没生效，先修正它再继续。`);
        agentState.pendingExecuting=false;finish({label,result});
      }catch(err){
        delete payload.password;
        const message=err?.message||tr('执行失败');
        toast(message);
        agentState.failures+=1;
        /* Hand the refusal back to the model instead of ending the run here.
           The failure usually names the step that is missing, so the model can
           supply it and finish what the user actually asked for. */
        buttons.innerHTML=tr('<span class="agent-action-done">未执行</span>');
        agentRecordStep(tr('执行未通过 · {0}',label),
          `【系统回执·失败】${label} 没有执行。原因：${message}。`
          +`请判断能否再补一步达成用户的目标：能就输出那个补救动作，不能就用一句话说明原因并结束。`
          +`不要重复提交同一个动作。`);
        agentState.pendingExecuting=false;finish({failed:true});
      }
    };
    buttons.innerHTML=tr('<button class="ghost-btn agent-action-cancel">取消</button>')
      +tr('<button class="ghost-btn agent-action-handover hidden">后续自动做完</button>')
      +tr('<button class="primary-btn agent-action-confirm">确认执行</button>');
    /* The composer now reads as busy while this card waits, so refresh it. */
    agentUpdateBusy();
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{if(card.isConnected&&agentState.pendingCard===card)list.scrollTop=list.scrollHeight});
    buttons.querySelector('.agent-action-cancel').onclick=cancel;
    buttons.querySelector('.agent-action-confirm').onclick=execute;
    const hand=buttons.querySelector('.agent-action-handover');
    /* Mid-run change of mind: the remaining steps stop asking. */
    if(agentState.mode==='step'){
      hand.classList.remove('hidden');
      hand.onclick=()=>{agentState.mode='auto';execute()};
    }
    if(agentState.mode==='auto'&&!agentState.stop)buttons.querySelector('.agent-action-confirm').click();
  });
}
async function agentLoop(context){
  /* One pass = ask the model for its next move, then run what it proposed.
     The loop no longer cares whether the user confirms every step or handed
     the rest over: either way it keeps going until the model has nothing left
     to propose, the user stops it, or one of the guards trips. */
  let steps=0,stalled=false;
  while(steps<AGENT_MAX_STEPS&&!agentState.stop){
    const actions=await agentNext(context);
    if(!actions.length)break;
    if(context.mode!=='operator'){
      agentAppend('assistant',tr('当前账户为只读权限，无法执行该操作。'),'error');
      break;
    }
    stalled=false;
    for(const proposal of actions){
      if(agentState.stop)break;
      /* A model that keeps re-proposing the same action is stuck, not working. */
      const key=proposal.action+'|'+JSON.stringify(proposal.data||{});
      if(key===agentState.lastActionKey){
        agentState.repeats+=1;
        if(agentState.repeats>AGENT_MAX_REPEATS){
          agentAppend('assistant',tr('模型连续几次提出同一个「{0}」，看起来是卡住了，先停在这里。可以说一句换个做法。',AGENT_ACTION_LABELS[proposal.action]||proposal.action),'error');
          stalled=true;break;
        }
      }else{
        agentState.lastActionKey=key;agentState.repeats=0;
      }
      const outcome=await agentRunOne(proposal);
      if(outcome.drafted)return steps;
      if(outcome.cancelled){stalled=true;break}
      steps+=1;
      agentState.steps=steps;agentUpdateBusy();
      /* A refusal counts as a step too, so a model that keeps proposing
         impossible actions still runs into a ceiling. */
      if(outcome.failed&&agentState.failures>=AGENT_MAX_FAILURES){stalled=true;break}
      if(steps>=AGENT_MAX_STEPS){stalled=true;break}
    }
    if(stalled)break;
  }
  if(steps>=AGENT_MAX_STEPS)
    agentAppend('assistant',tr('已连续执行 {0} 步，为安全起见先停在这里。你可以继续追问，我会接着往下做。',steps),'');
  else if(stalled&&agentState.failures>=AGENT_MAX_FAILURES)
    agentAppend('assistant',tr('连续 {0} 步没有通过校验，先停在这里。可以补充必要信息，或手动处理后让我接着做。',agentState.failures),'error');
  return steps;
}
async function agentSubmit(){
  const owner=S.user?.id,thread=agentState.conversationId;
  const input=$('#agentInput'),text=input?.value.trim();if(!text||agentWriteBlocked())return;
  /* Dropping this on the floor is what made a stuck run look like it was
     eating messages: the text stayed in the box and nothing happened. */
  if(agentState.busy){
    toast(agentState.pendingResolve?tr('上一步还在等你确认：点卡片上的按钮，或点「停止」结束这次执行')
                               :tr('助手还在处理上一条消息，点「停止」可以打断它'));
    return;
  }
  if(agentServerConfig&& !agentServerConfig.configured){agentOfferSetup();return}
  const intent=agentPlanIntent(text);
  /* The 规划任务 switch, or a typed mark, turns this message into a draft. */
  if(intent.plan||agentState.plan){input.value='';agentState.plan=false;agentSyncPlanButton();return agentPlanSubmit(intent.body)}
  if(!await agentPersistEdit()||agentState.busy||owner!==S.user?.id||thread!==agentState.conversationId)return;
  agentState.runGoal=text;agentSetPane('chat');
  agentPrepareMessage(text);input.value='';const asked=agentAppend('user',text);
  agentState.autoRun=false;agentState.stop=false;agentState.paused=false;agentState.steps=0;agentState.failures=0;
  agentState.mode=agentPref();agentState.lastActionKey='';agentState.repeats=0;
  agentState.pendingResolve=null;
  agentState.busy=true;agentUpdateBusy();
  try{
    await agentLoop(agentContext());
  }catch(e){
    if(e.name!=='AbortError')agentAppend('assistant',e?.message||tr('暂时无法连接 Agent 服务。'),'error');
  }
  agentFoldTrail(asked);
  agentState.busy=false;agentState.autoRun=false;agentState.steps=0;agentState.runGoal='';
  agentState.pendingResolve=null;
  agentUpdateBusy();
  input.focus();
}
/* ------------------------------------------------------------ 规划草稿 --
   A plan comes back as cards that are already filled in and already split.
   Nothing is written until the user has gone over the cards, changed what they
   like and pressed confirm; each card is then made through the same actions as
   the normal dialogs, under the user's own rules, so this works whatever the
   assistant itself is allowed to do. */
async function agentPlanSubmit(body){
  const owner=S.user?.id,thread=agentState.conversationId;
  if(agentWriteBlocked())return;
  const input=$('#agentInput');
  if(agentServerConfig&&!agentServerConfig.configured){if(body!==undefined&&input)input.value=body;agentOfferSetup();return}
  const source=body===undefined?(input?.value||''):body;
  const text=agentPlanIntent(source).body.trim();
  if(!text){toast(tr('先在输入框里写下你的安排'));return}
  if(agentState.busy){
    toast(agentState.pendingResolve?tr('上一步还在等你确认：点卡片上的按钮，或点「停止」结束这次执行')
                               :tr('助手还在处理上一条消息，点「停止」可以打断它'));
    return;
  }
  if(!await agentPersistEdit()||agentState.busy||owner!==S.user?.id||thread!==agentState.conversationId)return;
  agentState.runGoal=text;
  agentPrepareMessage(text,true);input.value='';agentSyncPlanButton();
  agentAppend('user',AGENT_PLAN_MARK+' '+text,'','plan');
  agentState.busy=true;agentState.stop=false;agentState.paused=false;agentUpdateBusy();
  const wait=agentAppend('assistant',tr('正在起草卡片…'),'agent-drafting');
  agentState.messages.pop();
  try{
    const answer=await agentRequest([{role:'system',content:agentSystemPrompt(agentContext(),true)},...agentRecentMessages()],true);
    if(!await agentWaitForResume()){wait?.remove();return}
    agentState.messages.push({role:'assistant',content:answer,tools:agentState.lastTools||[],...(agentState.lastMessageId?{id:agentState.lastMessageId}:{})});agentState.lastTools=[];agentState.lastMessageId=null;
    wait?.remove();
    const draft=agentSplitPlan(answer);
    if(!draft.projects.length&&!draft.tasks.length){
      agentAppend('assistant',draft.clean||tr('没有生成可用卡片。请补充目标或稍后重试，原请求已保留。'),'error');input.value=text;return;
    }
    agentPlanBoard(draft);
  }catch(e){
    wait?.remove();
    if(e.name!=='AbortError'){
      input.value=text;agentSetPane('chat');
      agentAppend('assistant',e?.message||tr('暂时无法连接 Agent 服务。'),'error');
    }
  }finally{
    agentState.busy=false;agentState.runGoal='';agentUpdateBusy();input.focus();
  }
}
const PLAN_DAY=/^\d{4}-\d{2}-\d{2}$/;
function planDay(v,fallback){v=String(v||'');return PLAN_DAY.test(v)&&v<=DATE_HORIZON?(v<S.today?S.today:v):fallback}
function planUser(v){v=String(v||'').trim();if(!v)return '';const u=S.users.find(u=>u.id===v)||S.users.find(u=>u.displayName===v||u.nickname===v);return u&&u.active?u.id:''}
/* Turn what the model wrote into editable cards: unknown people and projects
   are dropped to sensible defaults rather than carried along. */
function planDraft(raw){
  const admin=Boolean(S.user?.admin),people=S.users.filter(u=>u.active&&!u.admin).map(u=>u.id);
  const projects=(raw.projects||[]).slice(0,6).map((p,i)=>{
    const owner=admin?(p.owner?planUser(p.owner):(people[0]||'')):S.user.id;
    const members=[...new Set((Array.isArray(p.members)?p.members:[]).map(planUser).filter(id=>id&&id!==owner&&people.includes(id)))];
    return {ref:String(p.ref||'P'+(i+1)),name:String(p.name||'').trim().slice(0,120),desc:String(p.desc||'').slice(0,2000),start:planDay(p.start,S.today),end:planDay(p.end,''),owner,members,priority:['P0','P1','P2'].includes(p.priority)?p.priority:'P1',status:'active',state:'draft'};
  });
  const tasks=(raw.tasks||[]).slice(0,30).map((t,i)=>{
    const ref=projects.find(p=>p.ref===String(t.projectRef||'')),existing=S.projects.find(p=>p.id===t.projectId);
    const project=ref?'ref:'+ref.ref:existing?'id:'+existing.id:(t.projectId||t.projectRef)?'missing:'+String(t.projectId||t.projectRef):'';
    const name=agentTidyTaskName('task.create',{name:String(t.name||'').trim().slice(0,120),projectId:existing?.id}).name;
    const assignee=t.assignee?planUser(t.assignee):(admin?'':S.user.id);
    return {key:'t'+i,deadline:t.deadline||null,name,desc:String(t.desc||'').slice(0,2000),project,assignee,date:planDay(t.date,S.today),time:/^\d{2}:\d{2}$/.test(String(t.time||''))?t.time:'09:00',duration:Math.min(1440,Math.max(1,Math.round(Number(t.duration)||60))),priority:['P0','P1','P2'].includes(t.priority)?t.priority:'P1',state:'draft'};
  });
  for(const [kind,list] of [['project',projects],['task',tasks]])list.forEach((x,i)=>{
    const rawItem=raw[kind+'s'][i],op=rawItem.operation||'create';x.operation=op;x.cardId=rawItem.cardId||agentNewConversationId();
    if(op==='create')return;
    const before=rawItem.before||{},changes=Object.fromEntries(Object.entries(rawItem).filter(([k])=>!['before','id','revision','impact','operation','ref','key'].includes(k)));
    Object.assign(x,before,changes,{id:rawItem.id,before,revision:rawItem.revision,impact:rawItem.impact||{},operation:op,confirm:'',deleteConfirmed:false});
    x.name=String(x.name||'');x.desc=String(x.desc||'');
    if(kind==='task')x.project=x.projectId?'id:'+x.projectId:'';
    else{const old=Object.keys(before.members||{}).filter(id=>id!==x.owner);x.addMembers=Array.isArray(rawItem.addMembers)?rawItem.addMembers:[];x.removeMembers=Array.isArray(rawItem.removeMembers)?rawItem.removeMembers:[];x.members=[...new Set([...old.filter(id=>!x.removeMembers.includes(id)),...x.addMembers])];}
  });
  return {projects,tasks,next:tasks.length,draftId:raw.draftId||agentNewConversationId()};
}
/* What would happen to a task card and who may take it: 'direct', 'approval',
   'wait' (its project still has to be approved) or 'none'. Mirrors the server's
   rules so the card says it before the user presses anything. */
function planTaskPath(board,t){
  if((t.operation||'create')!=='create')return planMutationPath(t,'task');
  const admin=Boolean(S.user?.admin),people=S.users.filter(u=>u.active&&!u.admin).map(u=>u.id);
  const draftProject=t.project.startsWith('ref:')?board.projects.find(x=>'ref:'+x.ref===t.project):null;
  if(draftProject&&draftProject.state==='rejected')return {mode:'none',assignees:[t.assignee].filter(Boolean),note:tr('所属项目卡已拒绝，请选择其他项目或临时任务')};
  if(draftProject&&(draftProject.operation||'create')!=='create')return {mode:'none',assignees:[],note:tr('只能选择新建项目卡或已有项目')};
  if(draftProject){
    const pm=projectMode(),p=draftProject;
    if(pm==='none')return {mode:'none',assignees:[S.user.id],note:tr('你的规则组不能新建项目，可以改成已有项目或临时任务')};
    if(pm==='approval')return {mode:'wait',assignees:[S.user.id],note:tr('项目要先通过审批；这张卡会留在草稿里，通过后再建')};
    return {mode:'direct',assignees:[p.owner,...p.members].filter(Boolean),note:''};
  }
  if(t.project.startsWith('id:')){
    const id=t.project.slice(3),p=S.projects.find(x=>x.id===id),path=taskProjects().find(x=>x.p.id===id);
    if(path)return {mode:path.mode,assignees:projectAssignees(path.p).map(u=>u.id),note:path.mode==='approval'?tr('由「{0}」的 Owner 审批',path.p.name):''};
    if(p?.status==='pending')return {mode:'wait',assignees:[t.assignee||S.user.id],note:tr('「{0}」通过审批后再建',p.name)};
    return {mode:'none',assignees:[],note:tr('这个项目现在不能新建任务')};
  }
  const mode=tempTaskMode();
  return {mode,assignees:people,note:mode==='none'?tr('你的规则组不能新建临时任务'):mode==='approval'?tr('临时任务由管理员审批'):''};
}
function planProblems(board,x,scope=planOpenCards(board)){
  if(!planPending(x))return {};
  const errors={};
  const op=planOperation(x),kind=x.ref!=null?'project':'task';
  if(kind==='task'&&scope.some(p=>p.ref!=null&&p.id===(x.before?.projectId||x.project?.replace(/^id:/,''))&&planOperation(p)==='delete'&&planPending(p)))errors.project=tr('本组将删除所属项目，请移除这张任务卡');
  if(op!=='create'){
    const path=planMutationPath(x,kind);
    if(path.mode==='none')errors.target=path.note;
    if(!['update','delete'].includes(op))errors.target=tr('未知操作，请重新起草');
    if(scope.some(y=>y!==x&&(y.ref!=null?'project':'task')===kind&&y.id===x.id&&planPending(y)))errors.target=tr('同一对象只能保留一张修改或删除卡');
    if(op==='delete'){
      if(kind==='project'&&scope.some(t=>t.ref==null&&(t.before?.projectId||t.project?.replace(/^id:/,''))===x.id&&planPending(t)))errors.target=tr('请分开接受项目删除与其关联任务的卡片');
      if(kind==='project'&&x.confirm!==x.before?.name)errors.confirm=tr('请输入完整项目名以确认删除');
      if(kind==='task'&&!x.deleteConfirmed)errors.deleteConfirmed=tr('请勾选确认删除');
      return errors;
    }
    if(!Object.keys(planChanges(x,kind)).length)errors.changes=tr('请至少修改一个字段');
    if(path.mode==='approval'&&!String(x.reason||'').trim())errors.reason=tr('请填写修改理由');
  }
  if(!String(x.name||'').trim())errors.name=x.ref!=null?tr('请填写项目名称'):tr('请填写任务名称');
  const validDay=v=>PLAN_DAY.test(String(v||''))&&!Number.isNaN(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  if(x.ref!=null){
    if(!S.users.some(u=>u.id===x.owner&&u.active&&!u.admin))errors.owner=tr('请选择项目负责人');
    if(!validDay(x.start)||op==='create'&&x.start<S.today||x.start>DATE_HORIZON)errors.start=tr('请选择可排期范围内的开始日期');
    if(x.end&&(!validDay(x.end)||x.end<x.start||x.end>DATE_HORIZON))errors.end=tr('截止日期应在开始日期之后且不超出排期范围');
  }else{
    const path=planTaskPath(board,x);
    if(!x.assignee||!path.assignees.includes(x.assignee))errors.assignee=tr('请选择可执行这项任务的负责人');
    if(scope.some(p=>p.ref!=null&&p.id===(x.before?.projectId||x.project?.replace(/^id:/,''))&&planOperation(p)==='delete'&&planPending(p)))errors.project=tr('本组将删除所属项目，请移除这张任务卡');
    if(x.deadline&&(!validDay(x.deadline)||x.deadline<x.date))errors.deadline=tr('截止日期不能早于任务日期');
    if(x.project.startsWith('missing:'))errors.project=tr('未找到所属项目，请重新选择');
    const p=x.project.startsWith('ref:')?board.projects.find(p=>'ref:'+p.ref===x.project):S.projects.find(p=>'id:'+p.id===x.project);
    if(!validDay(x.date)||op==='create'&&x.date<S.today||x.date>DATE_HORIZON||(p?.start&&x.date<p.start)||(p?.end&&x.date>p.end))errors.date=tr('任务日期应在排期范围和项目周期内');
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time))errors.time=tr('请填写有效时间');
    if(!Number.isInteger(Number(x.duration))||Number(x.duration)<1||Number(x.duration)>1440)errors.duration=tr('时长应为 1–1440 分钟');
  }
  return errors;
}
function planPending(x){return !x.state||x.state==='draft'}
function planOpenCards(board){return board.projects.concat(board.tasks).filter(planPending)}
function planSelectedCards(board){return planOpenCards(board).filter(x=>x.selected)}
function planUpdateSelection(board){
  const open=planOpenCards(board),selected=open.filter(x=>x.selected),el=board.el;
  const all=el.querySelector('.plan-select-all');
  if(all){all.checked=open.length>0&&selected.length===open.length;all.indeterminate=selected.length>0&&selected.length<open.length;all.disabled=Boolean(board.busy)||!open.length;}
  const count=el.querySelector('.plan-select-count');if(count)count.textContent=selected.length?tr('已选 {0} 项',selected.length):tr('待处理 {0} 项',open.length);
  el.querySelectorAll('.plan-card').forEach(card=>{const x=card.dataset.ref!=null?board.projects.find(p=>p.ref===card.dataset.ref):board.tasks.find(t=>t.key===card.dataset.key);card.classList.toggle('is-selected',Boolean(x?.selected));const box=card.querySelector('[data-plan-select]');if(box)box.checked=Boolean(x?.selected)});
  el.querySelectorAll('.plan-accept-selected,.plan-reject-selected').forEach(b=>{b.disabled=Boolean(board.busy)||!selected.length;if(b.classList.contains('plan-accept-selected'))b.textContent=selected.length?tr('接受所选 {0} 项',selected.length):tr('接受所选')});
  const acceptAll=el.querySelector('.plan-confirm');if(acceptAll){acceptAll.classList.toggle('primary-btn',!selected.length);acceptAll.classList.toggle('secondary-btn',Boolean(selected.length));acceptAll.title=tr('处理全部 {0} 张待处理卡片，包含未勾选项',open.length);acceptAll.setAttribute('aria-label',tr('全部接受，共 {0} 项',open.length));}
  planScheduleSave(board);
}
async function planRetire(board,x,state,result){
  x.state=state;x.selected=false;x.result=result;x.error='';
  const card=Array.from(board.el?.querySelectorAll?.('.plan-card')||[]).find(el=>x.ref!=null?el.dataset.ref===x.ref:el.dataset.key===x.key);
  if(card?.animate&&!navReducedMotion()){
    try{const animation=card.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(-12px) scale(1.025)'}],{duration:180,easing:'ease-out',fill:'forwards'});await animation.finished.catch(()=>{})}catch(_){}
  }
}
async function planReject(board,items){
  if(board.conflict){toast(tr('草稿在其他页面有更新，请点“重新加载草稿”后继续'));return}
  if(board.busy||board.restoring||agentState.busy||agentWriteBlocked())return;
  if(board.conversationId!==undefined&&(board!==agentState.planBoard||board.conversationId!==agentState.conversationId))return;
  const targets=planOpenCards(board).filter(x=>items.includes(x));if(!targets.length)return;
  planCheckpoint(board);board.busy=true;planRender(board);
  try{for(const x of targets){await planRetire(board,x,'rejected',tr('已拒绝'));planRender(board)}}
  finally{board.busy=false;planRender(board)}
  toast(tr('已拒绝 {0} 张卡片',targets.length));
}

/* Persist reviewed cards separately from the model transcript. A receipt always
   wins over a stale editor snapshot; reopening is recovery, never re-execution. */
function planSnapshot(board){
  const copy=JSON.parse(JSON.stringify({projects:board.projects,tasks:board.tasks,next:board.next,note:board.note||'',closed:Boolean(board.closed)}));
  [...copy.projects,...copy.tasks].forEach(x=>{if(x.state==='submitting')x.state='draft'});return copy;
}
function agentForgetDraftCache(thread,user=S.user?.id){
  try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith(`wc-agent-draft:${user}:`)&&JSON.parse(localStorage.getItem(key)||'null')?.conversationId===thread)localStorage.removeItem(key)}}catch(_){}
}
function planCacheKey(board){return `wc-agent-draft:${board.ownerUser||S.user?.id}:${board.draftId}`}
function planCache(board,snapshot){try{localStorage.setItem(planCacheKey(board),JSON.stringify({version:board.persistVersion||0,writer:agentState.clientId,conversationId:board.conversationId,board:snapshot}))}catch(_){}}
function planScheduleSave(board){
  if(!board?.draftId||board.deleted||board.ownerUser&&board.ownerUser!==S.user?.id||!board.conversationId||board.restoring||typeof setTimeout!=='function')return;
  const snapshot=planSnapshot(board),serialized=JSON.stringify(snapshot);planCache(board,snapshot);
  if(serialized===board.savedSnapshot||board.conflict)return;
  clearTimeout(board.saveTimer);board.saveTimer=setTimeout(()=>planFlush(board),350);
}
async function planFlush(board){
  if(!board?.draftId||board.deleted||board.ownerUser&&board.ownerUser!==S.user?.id||!board.conversationId||board.restoring||board.conflict)return;
  clearTimeout(board.saveTimer);
  if(board.saving){await board.saving;if(!board.saveError)return planFlush(board);return}
  const user=S.user?.id,snapshot=planSnapshot(board),serialized=JSON.stringify(snapshot);
  if(serialized===board.savedSnapshot)return;
  board.saving=(async()=>{
    try{const r=await api('/api/action',{action:'agent.draft.save',data:{draftId:board.draftId,conversationId:board.conversationId,version:board.persistVersion||0,writer:agentState.clientId,board:snapshot}});
      if(S.user?.id!==user)return;board.persistVersion=r.version;board.savedSnapshot=serialized;board.saveError='';planCache(board,planSnapshot(board));
    }catch(e){board.saveError=e.message||tr('未同步，已保留本机草稿');const raw=e.status===409?String(e.raw??''):'';board.conflict=/其他页面|已删除/.test(raw);board.deleted=/已删除/.test(raw);}
    finally{board.saving=null;const status=board.el?.querySelector?.('.plan-save-status');if(status)status.textContent=board.saveError||'';if(board.conflict)planRender(board);}
  })();
  await board.saving;
  if(!board.saveError&&serialized!==JSON.stringify(planSnapshot(board)))return planFlush(board);
}
function planApplyReceipts(board,receipts){
  for(const x of board.projects.concat(board.tasks))if(receipts?.[x.cardId]){
    const r=receipts[x.cardId];x.state='done';x.selected=false;x.error='';x.result=r?.requested||r?.status==='pending'?tr('已提交申请'):tr('已接受');
    if(x.ref!=null&&planOperation(x)==='create')board.tasks.forEach(t=>{if(t.project==='ref:'+x.ref)t.project='id:'+r.id});
  }
}
async function agentRestoreBoard(raw,loading=false){
  const user=S.user?.id,thread=agentState.conversationId;
  if(!loading&&agentWriteBlocked())return null;
  let saved;
  if(raw.draftId){
    if(agentState.planBoard?.draftId===raw.draftId)await planFlush(agentState.planBoard);
    try{saved=await api('/api/action',{action:'agent.draft.get',data:{draftId:raw.draftId}})}catch(e){toast(e.message||tr('无法恢复草稿，请重试'));return null}
  }
  if(user!==S.user?.id||thread!==agentState.conversationId||agentState.viewing)return null;
  const board=agentPlanBoard(saved?.raw||raw,true);board.restoring=true;board.persistVersion=saved?.version||0;
  let snapshot=saved?.board;
  try{const cached=JSON.parse(localStorage.getItem(planCacheKey(board))||'null');if(cached&&(cached.version===(saved?.version||0)||cached.writer&&cached.writer===saved?.writer))snapshot=cached.board}catch(_){}
  if(snapshot)Object.assign(board,snapshot);
  board.closed=false;planApplyReceipts(board,saved?.receipts);board.restoring=false;planRender(board);return board;
}

function planCheckpoint(board){
  const copy=JSON.stringify({projects:board.projects,tasks:board.tasks,next:board.next});
  board.history=board.history||[];
  if(board.history.at(-1)!==copy)board.history.push(copy);
  if(board.history.length>30)board.history.shift();
}
function planUndo(board){
  if(board.busy||!board.history?.length)return;
  Object.assign(board,JSON.parse(board.history.pop()));planRender(board);
}
function planMarkFields(board){
  board.el.querySelectorAll('.plan-card').forEach(card=>{
    const x=card.dataset.ref!=null?board.projects.find(p=>p.ref===card.dataset.ref):board.tasks.find(t=>t.key===card.dataset.key);
    if(!x)return;
    const errors=planProblems(board,x);
    card.classList.toggle('needs-info',Object.keys(errors).length>0);
    card.querySelectorAll('[data-f]').forEach(field=>{field.setAttribute('aria-invalid',String(Boolean(errors[field.dataset.f])));field.title=errors[field.dataset.f]||''});
    const diff=card.querySelector('.plan-diff');if(diff){const template=document.createElement('div');template.innerHTML=planMutationHTML(board,x,x.ref!=null?'project':'task');diff.innerHTML=template.querySelector('.plan-diff')?.innerHTML||'';}
    const note=card.querySelector('.plan-validation');if(note)note.textContent=Object.values(errors).join('；');
  });
}
const PLAN_STATE={direct:tr('创建'),approval:tr('提交申请'),wait:tr('稍后再建'),none:tr('不能创建')};
function planOperation(x){return x.operation||'create'}
function planChanges(x,kind){
  const keys=kind==='project'?['name','desc','owner','start','end','cycle','priority','status','addMembers','removeMembers']:['name','desc','assignee','date','deadline','time','duration','priority','status'];
  const value=k=>['addMembers','removeMembers'].includes(k)?x[k]||[]:x[k]===undefined?null:x[k];
  return Object.fromEntries(keys.filter(k=>planOperation(x)==='create'||JSON.stringify(value(k))!==JSON.stringify(['addMembers','removeMembers'].includes(k)?[]:x.before?.[k]??null)).map(k=>[k,value(k)]));
}
function planMutationPath(x,kind){
  const admin=Boolean(S.user?.admin),before=x.before||{},op=planOperation(x);
  if(!x.id||!x.revision)return {mode:'none',assignees:[],note:tr('请重新读取目标后再确认')};
  if(kind==='project')return {mode:admin||before.owner===S.user.id?'direct':'none',note:tr('只有管理员或 Owner 可以管理此项目')};
  const p=S.projects.find(p=>p.id===before.projectId);
  const assignees=p?projectAssignees(p).map(u=>u.id):S.users.filter(u=>u.active&&!u.admin).map(u=>u.id);
  if(op==='delete')return {mode:admin&&!before.fixed&&!before.repeatId&&!['pending_approval','awaiting_approval','submitted'].includes(before.status)?'direct':'none',assignees,note:tr('仅管理员可删除普通任务；固定安排请挖空本次，待审批任务先完成审批')};
  if(['done','deferred','skipped','pending_approval','rejected'].includes(before.status))return {mode:'none',assignees,note:tr('已归档或待审批任务不可调整')};
  if(before.projectId&&p?.status!=='active')return {mode:'none',assignees,note:tr('只能调整进行中项目的任务')};
  const direct=admin||(before.projectId?p?.owner===S.user.id:before.creator===S.user.id||before.creator==null&&before.assignee===S.user.id);
  return {mode:direct?'direct':before.assignee===S.user.id?'approval':'none',assignees:direct?assignees:[before.assignee],note:direct?'':tr('填写修改理由，提交给安排人审批')};
}
function planMutationHTML(board,x,kind){
  const op=planOperation(x),path=planMutationPath(x,kind),project=kind==='project',attr=project?`data-ref="${escapeHTML(x.ref)}"`:`data-key="${escapeHTML(x.key)}"`;
  const label=op==='delete'?(project?tr('删除项目'):tr('删除任务')):(project?tr('修改项目'):tr('修改任务'));
  const fieldLabels={name:tr('名称'),desc:tr('说明'),owner:'Owner',start:tr('开始日期'),end:tr('截止日期'),cycle:tr('周期'),priority:tr('优先级'),status:tr('状态'),assignee:tr('负责人'),date:tr('日期'),deadline:tr('截止日期'),time:tr('时间'),duration:tr('时长'),addMembers:tr('新增协作者'),removeMembers:tr('移出协作者')};
  const display=(k,v)=>Array.isArray(v)?v.map(nameOf).join('、')||'—':v==null||v===''?'—':['owner','assignee'].includes(k)?nameOf(v):k==='status'?({todo:tr('待开始'),doing:tr('进行中'),active:tr('进行中'),paused:tr('已暂停'),done:tr('已完成'),archived:tr('已归档')}[v]||v):k==='cycle'?({infinite:tr('无截止日期'),range:tr('固定周期'),deadline:tr('截止日期')}[v]||v):String(v);
  const select=(key,title,values)=>`<label>${title}<select data-f="${key}">${values.map(([v,l])=>`<option value="${escapeHTML(v)}"${x[key]===v?' selected':''}>${escapeHTML(l)}</option>`).join('')}</select></label>`;
  const input=(key,title,type='date')=>`<label>${title}<input data-f="${key}" type="${type}" value="${escapeHTML(x[key]??'')}"${type==='date'?` max="${DATE_HORIZON}"`:type==='number'?' min="1" max="1440"':''}></label>`;
  const changes=Object.entries(planChanges(x,kind));
  const diff=()=>`<div class="plan-diff" aria-label="${tr('修改前后')}">${changes.map(([k,v])=>`<div><span>${fieldLabels[k]||k}</span><del>${escapeHTML(display(k,x.before?.[k]))}</del><strong>${escapeHTML(display(k,v))}</strong></div>`).join('')||tr('<p>尚未修改字段</p>')}</div>`;
  let body='';
  if(op==='delete'){
    const impact=project?tr('同时删除 {0} 项任务、{1} 个附件、{2} 条固定安排、{3} 场会议、{4} 条沟通记录及相关记录，删除后不可恢复。',Number(x.impact?.tasks)||0,Number(x.impact?.files)||0,Number(x.impact?.repeats)||0,Number(x.impact?.meetings)||0,Number(x.impact?.messages)||0):tr('任务将从日历移除；此操作不可撤销。');
    body=`<strong class="plan-target">${escapeHTML(x.before?.name||x.name)}</strong><p class="plan-delete-impact">${impact}</p>`+(project?`<label class="plan-delete-confirm">${tr('输入完整项目名以确认')}<input data-f="confirm" autocomplete="off" value="${escapeHTML(x.confirm||'')}" placeholder="${escapeHTML(x.before?.name||tr('项目名称'))}"></label>`:`<label class="plan-delete-confirm"><input type="checkbox" data-f="deleteConfirmed"${x.deleteConfirmed?' checked':''}>${tr('我确认删除这项任务')}</label>`);
  }else{
    body=`<p class="plan-target">${tr('正在修改：{0}',escapeHTML(x.before?.name||''))}</p><input class="plan-title" data-f="name" value="${escapeHTML(x.name)}" maxlength="120" aria-label="${tr('{0}名称',project?tr('项目'):tr('任务'))}"><textarea class="plan-desc" data-f="desc" rows="2" aria-label="${tr('说明')}">${escapeHTML(x.desc)}</textarea><div class="plan-grid">`;
    if(project){
      if(S.user.admin)body+=select('owner','Owner',S.users.filter(u=>u.active&&!u.admin).map(u=>[u.id,nameOf(u.id)]));
      body+=input('start',tr('开始'))+input('end',tr('截止（可空）'))+select('priority',tr('优先级'),['P0','P1','P2'].map(v=>[v,v]))+select('status',tr('状态'),(S.user.admin?['active','paused','done','archived']:['active','paused']).map(v=>[v,display('status',v)]));
    }else{
      body+=select('assignee',tr('负责人'),path.assignees.map(id=>[id,nameOf(id)]))+input('date',tr('日期'))+input('deadline',tr('截止（可空）'))+input('time',tr('时间'),'time')+input('duration',tr('时长（分钟）'),'number')+select('priority',tr('优先级'),['P0','P1','P2'].map(v=>[v,v]))+select('status',tr('状态'),['todo','doing'].map(v=>[v,display('status',v)]));
    }
    body+='</div>';
    if(project)body+=`<div class="plan-people"><span>${tr('协作者')}</span>${S.users.filter(u=>u.active&&!u.admin&&u.id!==x.owner).map(u=>`<button type="button" class="plan-person${x.members.includes(u.id)?' is-on':''}" data-user="${escapeHTML(u.id)}" aria-pressed="${x.members.includes(u.id)}">${escapeHTML(nameOf(u.id))}</button>`).join('')}</div>`;
    body+=diff();
    if(path.mode==='approval')body+=`<label class="plan-change-reason">${tr('修改理由')}<textarea data-f="reason" rows="2">${escapeHTML(x.reason||'')}</textarea></label>`;
  }
  return `<article class="plan-card is-${op} is-${path.mode}${project?' is-project':''}" ${attr}><div class="plan-card-top"><span class="plan-kind">${icon(project?'folder':'calendar-check')}${label}</span><span class="plan-state is-${path.mode}">${path.mode==='approval'?tr('提交申请'):path.mode==='none'?tr('无权操作'):tr('待确认')}</span><button type="button" class="plan-remove" aria-label="${tr('移除这张卡')}" title="${tr('移除这张卡')}">${icon('x')}</button></div>${body}<p class="plan-note">${escapeHTML(path.mode==='none'||path.mode==='approval'?path.note:'')}</p><button type="button" class="ghost-btn plan-reload">${tr('重新读取')}</button>${x.error?`<p class="plan-error">${escapeHTML(x.error)}</p>`:''}</article>`;
}
async function planReload(board,x){
  if(board.busy||agentState.busy||agentWriteBlocked())return;
  const kind=x.ref!=null?'project':'task',op=planOperation(x),changes=op==='update'?planChanges(x,kind):{};
  board.busy=true;agentState.busy=true;planRender(board);agentUpdateBusy();
  try{
    const raw=await api('/api/action',{action:'work.cards.preview',data:{[kind+'s']:[{...changes,id:x.id,operation:op}]}});
    const fresh=planDraft(raw)[kind+'s'][0];
    Object.assign(x,fresh,kind==='project'?{ref:x.ref}:{key:x.key},{error:''});board.history=[];
  }catch(e){x.error=e?.message||tr('读取失败')}
  finally{board.busy=false;agentState.busy=false;planRender(board);agentUpdateBusy()}
}

function planCardsHTML(board){
  const admin=Boolean(S.user?.admin),people=S.users.filter(u=>u.active&&!u.admin),pm=projectMode();
  const opt=(v,l,cur)=>`<option value="${escapeHTML(v)}"${v===cur?' selected':''}>${escapeHTML(l)}</option>`;
  const chip=(mode,why='')=>`<span class="plan-state is-${mode}"${why?` title="${escapeHTML(why)}"`:''}>${PLAN_STATE[mode]}</span>`;
  const top=(kind,label,mode,extra='',why='')=>`<div class="plan-card-top"><span class="plan-kind">${icon(kind)}${label}</span>${extra}${chip(mode,why)}<button type="button" class="plan-remove" title="${tr('移除这张卡')}" aria-label="${tr('移除这张卡')}">${icon('x')}</button></div>`;
  const note=(text,cls='plan-note')=>text?`<p class="${cls}">${escapeHTML(text)}</p>`:'';
  const projectCard=p=>planOperation(p)!=='create'?planMutationHTML(board,p,'project'):`<article class="plan-card is-project is-${pm}" data-ref="${escapeHTML(p.ref)}">${top('folder',tr('新项目'),pm,'',pm==='none'?tr('你的规则组不能新建项目'):pm==='approval'?tr('提交后由管理员审批'):'')}<input class="plan-title" data-f="name" value="${escapeHTML(p.name)}" maxlength="120" placeholder="${tr('项目名称')}" aria-label="${tr('项目名称')}"><textarea class="plan-desc" data-f="desc" rows="2" placeholder="${tr('项目描述（可选）')}" aria-label="${tr('项目描述')}">${escapeHTML(p.desc)}</textarea><div class="plan-grid">${admin?`<label class="is-wide">Owner<select data-f="owner">${opt('',tr('请选择负责人'),p.owner)}${people.map(u=>opt(u.id,nameOf(u.id),p.owner)).join('')}</select></label>`:''}<label>${tr('优先级')}<select data-f="priority">${['P0','P1','P2'].map(v=>opt(v,v,p.priority)).join('')}</select></label><label>${tr('开始')}<input type="date" data-f="start" value="${escapeHTML(p.start)}" min="${S.today}" max="${DATE_HORIZON}"></label><label>${tr('截止（可空）')}<input type="date" data-f="end" value="${escapeHTML(p.end)}" min="${escapeHTML(p.start)}" max="${DATE_HORIZON}"></label></div><div class="plan-people"><span>${admin?tr('协作者'):tr('邀请协作者')}</span>${people.filter(u=>u.id!==p.owner).map(u=>`<button type="button" class="plan-person${p.members.includes(u.id)?' is-on':''}" data-user="${escapeHTML(u.id)}" aria-pressed="${p.members.includes(u.id)}">${escapeHTML(nameOf(u.id))}</button>`).join('')||tr('<span class="muted">没有其他成员</span>')}</div>${note(p.error,'plan-error')}</article>`;
  const taskCard=t=>{
    if(planOperation(t)!=='create')return planMutationHTML(board,t,'task');
    const path=planTaskPath(board,t);
    const open=taskProjects(),projects=[opt('',tr('临时任务（不挂项目）'),t.project),...board.projects.filter(p=>planPending(p)&&planOperation(p)==='create').map(p=>opt(`ref:${p.ref}`,tr('新项目 · {0}',p.name||tr('未命名')),t.project)),...open.map(x=>opt('id:'+x.p.id,x.p.name,t.project))];
    if(t.project.startsWith('ref:')&&!board.projects.some(p=>'ref:'+p.ref===t.project&&planPending(p)))projects.push(opt(t.project,tr('原新项目已拒绝，请重新选择'),t.project));
    if(t.project.startsWith('missing:'))projects.push(opt(t.project,tr('请选择所属项目'),t.project));
    if(t.project.startsWith('id:')&&!open.some(x=>'id:'+x.p.id===t.project))projects.push(opt(t.project,S.projects.find(x=>'id:'+x.id===t.project)?.name||tr('已不存在的项目'),t.project));
    const prio=`<span class="plan-prio" role="radiogroup" aria-label="${tr('优先级')}">${['P0','P1','P2'].map(v=>`<button type="button" class="priority ${v}${t.priority===v?' is-on':''}" data-prio="${v}" aria-checked="${t.priority===v}" role="radio">${v}</button>`).join('')}</span>`;
    return `<article class="plan-card is-${path.mode}" data-key="${escapeHTML(t.key)}">${top('calendar-check',tr('任务'),path.mode,prio,path.note)}<input class="plan-title" data-f="name" value="${escapeHTML(t.name)}" maxlength="120" placeholder="${tr('任务名称')}" aria-label="${tr('任务名称')}"><div class="plan-grid"><label class="is-wide">${tr('放在')}<select data-f="project">${projects.join('')}</select></label><label>${tr('负责人')}<select data-f="assignee">${opt('',tr('请选择负责人'),t.assignee)}${path.assignees.map(id=>opt(id,nameOf(id),t.assignee)).join('')||opt('','—','')}</select></label><label>${tr('日期')}<input type="date" data-f="date" value="${escapeHTML(t.date)}" min="${S.today}" max="${DATE_HORIZON}"></label><label>${tr('时间')}<input type="time" data-f="time" value="${escapeHTML(t.time)}"></label><label>${tr('时长（分钟）')}<input type="number" data-f="duration" min="1" max="1440" value="${escapeHTML(t.duration)}"></label></div><textarea class="plan-desc" data-f="desc" rows="1" placeholder="${tr('补充说明（可选）')}" aria-label="${tr('任务说明')}">${escapeHTML(t.desc)}</textarea>${note(path.note)}${note(t.error,'plan-error')}</article>`;
  };
  const decorate=(html,x)=>{
    const working=x.state==='submitting',disabled=board.busy?' disabled':'';
    html=html.replace(/<button type="button" class="plan-remove"[\s\S]*?<\/button>/,'');
    html=html.replace('<div class="plan-card-top">',`<div class="plan-card-top"><label class="plan-pick" title="${tr('选择这张卡片（不会立即执行）')}"><input type="checkbox" data-plan-select aria-label="${tr('选择{0}',escapeHTML(x.name||tr('这张卡片')))}"${x.selected?' checked':''}${disabled}></label>`);
    if(working)html=html.replace(/(<span class="plan-state[^>]*>)[^<]*/, tr('$1接受中…'));
    return html.replace('</article>',`<p class="plan-validation" role="status"></p><div class="plan-card-actions"><button type="button" class="ghost-btn plan-reject"${disabled}>${tr('拒绝')}</button><button type="button" class="primary-btn plan-accept"${disabled}>${working?tr('接受中…'):tr('接受')}</button></div></article>`);
  };
  const visible=x=>planPending(x)||x.state==='submitting';
  return board.projects.filter(visible).map(x=>decorate(projectCard(x),x)).join('')+board.tasks.filter(visible).map(x=>decorate(taskCard(x),x)).join('');

}
/* How many cards would be made, asked for, held back or refused. */
function planTally(board){
  const n={direct:0,approval:0,wait:0,none:0,update:0,delete:0},pm=projectMode();
  board.projects.forEach(p=>{if(planPending(p))n[planOperation(p)==='create'?pm:planMutationPath(p,'project').mode]+=1});
  board.projects.concat(board.tasks).forEach(x=>{if(planPending(x)&&planOperation(x)!=='create')n[planOperation(x)]++});
  board.tasks.forEach(t=>{if(planPending(t))n[planTaskPath(board,t).mode]+=1});
  return n;
}
function planConfirmLabel(){return tr('全部接受');
}
function agentPlanBoard(raw,restoring=false){
  const list=$('#agentDraftCards')||$('#agentMessages');if(!list)return null;
  const board={...planDraft(raw),ownerUser:S.user?.id,conversationId:agentState.conversationId,note:raw.clean||'',closed:false,busy:false,restoring,history:[]};
  board.el=document.createElement('div');
  board.el.className='agent-message assistant plan-board';
  agentState.pane='cards';agentState.unreadReply=false;
  planActivate(board);
  planRender(board,true);planScheduleSave(board);
  list.scrollTop=Math.max(0,board.el.offsetTop-12);
  return board;
}
function planActivate(board){
  const previous=agentState.planBoard;
  if(previous&&previous!==board){
    previous.closed=true;planRender(previous);$('#agentMessages')?.appendChild(previous.el);
  }
  agentState.planBoard=board;board.closed=false;
  $('#agentDraftCards')?.appendChild(board.el);
}
function planRender(board,entering=false){
  const el=board.el,all=board.projects.concat(board.tasks),open=planOpenCards(board),accepted=all.filter(x=>x.state==='done').length,rejected=all.filter(x=>x.state==='rejected').length,working=all.filter(x=>x.state==='submitting').length;
  agentSyncDraftLayout();
  const progress=[working?tr('接受中 {0}',working):'',accepted?tr('已接受 {0}',accepted):'',rejected?tr('已拒绝 {0}',rejected):''].filter(Boolean).join(' · ');
  const head=`<div class="plan-board-head">${icon('sparkles')}<strong>${tr('待处理 · {0} 张卡片',open.length)}</strong><span>${escapeHTML(progress)}</span></div>`;
  if(board.closed){
    el.innerHTML=head+`<div class="plan-foot is-closed"><span class="plan-sum">${escapeHTML(board.closedNote||tr('未处理的卡片已保留'))}</span><button type="button" class="ghost-btn plan-reopen">${tr('重新打开')}</button></div>`;
  }else{
    const n=planTally(board),sum=[n.delete?tr('含 {0} 项删除',n.delete):'',n.wait?tr('{0} 项要等审批',n.wait):'',n.none?tr('{0} 项暂不能接受',n.none):''].filter(Boolean).join(' · ');
    el.innerHTML=head+`<div class="plan-draft-tools"><button type="button" class="ghost-btn plan-undo"${board.history?.length&&!board.busy?'':' disabled'}>${tr('撤销修改')}</button><button type="button" class="ghost-btn plan-copy">${tr('复制草稿')}</button>${board.conflict?tr('<button type="button" class="ghost-btn plan-restore">重新加载草稿</button>'):''}<small class="plan-save-status" role="status">${escapeHTML(board.saveError||'')}</small></div><div class="plan-selection"><label class="plan-select-label"><input type="checkbox" class="plan-select-all">${tr('全选')}</label><span class="plan-select-count" role="status"></span><div class="plan-selection-actions"><button type="button" class="ghost-btn plan-reject-selected">${tr('拒绝所选')}</button><button type="button" class="primary-btn plan-accept-selected">${tr('接受所选')}</button></div></div><div class="plan-cards${entering?' is-entering':''}">${planCardsHTML(board)||'<div class="plan-empty">'+icon('check')+tr('<strong>本组卡片已处理完</strong></div>')}</div><div class="plan-foot"><button type="button" class="ghost-btn plan-add">${tr('{0}加一个任务',icon('plus'))}</button><span class="plan-sum">${tr('全部 {0} 项{1}{2}',open.length,sum?' · '+sum:'',board.saveError?' · '+escapeHTML(board.saveError):'')}</span><button type="button" class="ghost-btn plan-cancel">${open.length?tr('收起草稿'):tr('收起')}</button><button type="button" class="primary-btn plan-confirm"${open.length&&!board.busy?'':' disabled'}>${board.busy?tr('正在接受…'):planConfirmLabel()}</button></div>`;
    el.querySelectorAll('input,textarea,select,button').forEach(field=>{field.disabled=Boolean(board.busy)||field.disabled});
    planMarkFields(board);planUpdateSelection(board);
    if(entering)el.querySelectorAll('.plan-card').forEach((c,i)=>c.style.setProperty('--i',String(i)));
  }
  planBind(board);planScheduleSave(board);
}
/* One set of listeners per board; every card reads and writes the draft. */
function planBind(board){
  const el=board.el;if(el.dataset.bound)return;el.dataset.bound='1';
  const item=node=>{const card=node.closest('.plan-card');if(!card)return null;return card.dataset.ref!=null?board.projects.find(p=>p.ref===card.dataset.ref):board.tasks.find(t=>t.key===card.dataset.key)};
  el.addEventListener('focusin',e=>{if(item(e.target)&&!board.busy)planCheckpoint(board)});
  el.addEventListener('input',e=>{const f=e.target.dataset?.f,x=item(e.target);if(board.busy)return;if(x&&['name','desc','reason','confirm'].includes(f)){x[f]=e.target.value;planMarkFields(board);const undo=el.querySelector('.plan-undo');if(undo)undo.disabled=!board.history?.length;planScheduleSave(board)}});
  el.addEventListener('change',e=>{
    const f=e.target.dataset?.f,x=item(e.target);if(board.busy)return;
    planScheduleSave(board);
    if(e.target.classList.contains('plan-select-all')){planOpenCards(board).forEach(x=>x.selected=e.target.checked);planUpdateSelection(board);return}
    if(e.target.hasAttribute('data-plan-select')&&x){x.selected=e.target.checked;planUpdateSelection(board);return}
    if(!f||!x)return;
    if(!['name','desc','reason','confirm'].includes(f))planCheckpoint(board);
    x[f]=f==='deleteConfirmed'?e.target.checked:f==='duration'?Number(e.target.value):e.target.value;x.error='';
    if(f==='start'&&x.end&&x.end<x.start)x.end='';
    if(f==='end'&&x.ref!=null&&planOperation(x)==='update')x.cycle=x.end?(x.before?.cycle==='infinite'?'range':x.before?.cycle||'range'):'infinite';
    if(f==='owner')x.members=x.members.filter(id=>id!==x.owner);
    // A blur-triggered change must not replace the button under pointerdown.
    // Rebuild only when the available people/project controls actually change.
    if(['owner','project'].includes(f))planRender(board);
    else{const end=e.target.closest('.plan-card')?.querySelector('[data-f="end"]');if(f==='start'&&end){end.value=x.end||'';end.min=x.start;}planMarkFields(board);const undo=el.querySelector('.plan-undo');if(undo)undo.disabled=!board.history?.length;}
  });
  el.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||board.busy)return;
    const x=item(b);
    if(b.classList.contains('plan-restore'))return agentRestoreBoard({draftId:board.draftId});
    if(b.classList.contains('plan-undo'))return planUndo(board);
    if(b.classList.contains('plan-copy')){navigator.clipboard.writeText(JSON.stringify({projects:board.projects.filter(planPending),tasks:board.tasks.filter(planPending)},null,2)).then(()=>toast(tr('草稿已复制'))).catch(()=>toast(tr('复制失败，请稍后重试')));return}
    if(b.classList.contains('plan-reload')&&x)return planReload(board,x);
    if(b.classList.contains('plan-accept')&&x)return planSubmit(board,[x]);
    if(b.classList.contains('plan-reject')&&x)return planReject(board,[x]);
    if(b.classList.contains('plan-accept-selected'))return planSubmit(board,planSelectedCards(board));
    if(b.classList.contains('plan-reject-selected'))return planReject(board,planSelectedCards(board));
    if(x)planCheckpoint(board);
    if(b.classList.contains('plan-remove')&&x)return planRemove(board,x);
    if(b.classList.contains('plan-person')&&x){const id=b.dataset.user;x.members=x.members.includes(id)?x.members.filter(m=>m!==id):[...x.members,id];if(planOperation(x)==='update'){const old=Object.keys(x.before.members||{}).filter(id=>id!==x.owner);x.addMembers=x.members.filter(id=>!old.includes(id));x.removeMembers=old.filter(id=>!x.members.includes(id));}return planRender(board)}
    if(b.dataset.prio&&x){x.priority=b.dataset.prio;return planRender(board)}
    if(b.classList.contains('plan-add'))return planAddTask(board);
    if(b.classList.contains('plan-cancel')){board.closed=true;board.closedNote=board.closedNote||tr('未处理的卡片已保留');return planRender(board)}
    if(b.classList.contains('plan-reopen')){planActivate(board);return planRender(board)}
    if(b.classList.contains('plan-confirm'))planSubmit(board);
  });
}
function planRemove(board,x){return planReject(board,[x])}
function planAddTask(board){
  planCheckpoint(board);
  const last=board.tasks.filter(t=>planPending(t)&&planOperation(t)==='create').at(-1),key='t'+(board.next++);
  board.tasks.push({key,cardId:agentNewConversationId(),name:'',desc:'',project:last?.project||'',assignee:last?.assignee||'',date:last?.date||S.today,time:'09:00',duration:60,priority:'P1',state:'draft'});
  planRender(board);
  board.el.querySelector(`.plan-card[data-key="${key}"] .plan-title`)?.focus();
}
/* Projects first, so tasks drafted under them can follow; each card goes
   through the normal action and keeps its own error if it is refused, so the
   user fixes that card and confirms again without redoing the rest. */
async function planSubmit(board,items=null){
  if(board.conflict){toast(tr('草稿在其他页面有更新，请点“重新加载草稿”后继续'));return}
  if(board.busy||board.restoring||agentState.busy||agentWriteBlocked())return;
  if(board.conversationId!==undefined&&(board!==agentState.planBoard||board.conversationId!==agentState.conversationId))return;
  const candidates=planOpenCards(board).filter(x=>items===null||items.includes(x));if(!candidates.length)return;
  board.busy=true;agentState.busy=true;agentState.stop=false;agentState.paused=false;agentUpdateBusy();planRender(board);
  const results={create:0,update:0,delete:0,approval:0,failed:0};
  const submit=async(x,kind)=>{
    if(!await agentWaitForResume())return;
    const op=planOperation(x),path=kind==='project'?(op==='create'?{mode:projectMode()}:planMutationPath(x,kind)):planTaskPath(board,x);
    const errors=planProblems(board,x,candidates);
    if(Object.keys(errors).length){x.error='';results.failed++;return}
    if(['wait','none'].includes(path.mode)){x.error=path.note||tr('当前不能接受这张卡片');results.failed++;return}
    if(kind==='task'&&x.project.startsWith('ref:')){x.error=tr('请先接受所属的新项目卡片，或将项目与任务一并选中');results.failed++;return}
    x.state='submitting';x.error='';planRender(board);
    try{
      let changes=planChanges(x,kind);
      if(op==='create')changes=kind==='project'?{name:x.name.trim(),desc:x.desc,start:x.start,end:x.end,cycle:x.end?'range':'infinite',priority:x.priority||'P1',members:x.members,...(S.user.admin?{owner:x.owner}:{})}:{name:x.name.trim(),desc:x.desc,projectId:x.project.startsWith('id:')?x.project.slice(3):null,assignee:x.assignee,date:x.date,deadline:x.deadline||null,time:x.time,duration:Number(x.duration)||60,priority:x.priority};
      const r=await api('/api/action',{action:'work.card.apply',data:{kind,operation:op,id:x.id,revision:x.revision,cardId:x.cardId,changes,confirmed:true,confirm:op==='delete'?(kind==='project'?x.confirm:x.deleteConfirmed?x.before.name:''):undefined,request:path.mode==='approval',reason:x.reason,sessionId:agentState.sessionId}});
      const pending=r?.requested||r?.status==='pending'||path.mode==='approval';
      results[pending?'approval':op]++;board.history=[];
      if(kind==='project'&&op==='create')board.tasks.forEach(t=>{if(t.project==='ref:'+x.ref)t.project='id:'+r.id});
      await planRetire(board,x,'done',pending?tr('已提交申请'):op==='create'?tr('已创建'):op==='update'?tr('已修改'):tr('已删除'));
    }catch(e){x.state='draft';x.error=e?.message||tr('提交失败');results.failed++;if(board.conversationId&&board.draftId){try{const recovered=await api('/api/action',{action:'agent.draft.get',data:{draftId:board.draftId,cardIds:board.projects.concat(board.tasks).map(t=>t.cardId)}});planApplyReceipts(board,recovered.receipts);if(x.state==='done'){results.failed--;results[op]++;}}catch(_){}}}
    planRender(board);
  };
  try{
    for(const p of board.projects.filter(p=>candidates.includes(p)&&planPending(p)&&planOperation(p)!=='delete'))await submit(p,'project');
    try{await refresh()}catch(_){}
    for(const t of board.tasks.filter(t=>candidates.includes(t)&&planPending(t)))await submit(t,'task');
    for(const p of board.projects.filter(p=>candidates.includes(p)&&planPending(p)&&planOperation(p)==='delete'))await submit(p,'project');
    try{await refresh()}catch(_){}
  }finally{board.busy=false;agentState.busy=false;agentUpdateBusy()}
  const parts=[results.create?tr('创建了 {0} 项',results.create):'',results.update?tr('修改了 {0} 项',results.update):'',results.delete?tr('删除了 {0} 项',results.delete):'',results.approval?tr('提交了 {0} 个申请',results.approval):'',results.failed?tr('{0} 张卡片未接受，原因留在卡片上',results.failed):''].filter(Boolean);
  board.closedNote=parts.join(tr('，'));
  planRender(board);agentAppend('assistant',`${board.closedNote||tr('没有提交新的改动')}${tr('。')}`);
}
/* ---------------------------------------------------------------- 沟通区 --
   One shared room, plus a channel per project. Chat deliberately sits outside
   the task permission model: a member who cannot reassign work can still say
   something about it. */
const CHAT_POLL_MS=4000;
const CHAT_PRESENCE_MS=15000;
/* A broadcast is a sentinel rather than an account id, so it can never
   collide with a real member and needs no row of its own. */
const CHAT_EVERYONE='*';
let chatPollTimer=0,chatPresenceTimer=0,chatLastAt='',chatLastDay='',chatFirstAt='';
let chatFirstCursor=null,chatLastCursor=null;
let chatLoadGeneration=0;
let chatChannel='general',chatPresence={},chatMentionQuery=null,chatMentionIndex=0;
/* One line of the newest message per room, sent along with chat.list so the
   sidebar can read like a list of conversations. */
let chatPreviews={};

function updateChatDot(){
  const dot=$('#chatDot');if(!dot)return;
  const unread=Number((S.chat||{}).unread||0);
  /* Not while you are looking at the room — you are reading it, not missing it. */
  const show=unread>0&&UI.view!=='chat';
  dot.classList.toggle('hidden',!show);
  dot.textContent=show?(unread>99?'99+':String(unread)):'';
}
const chatMentionName=id=>id===CHAT_EVERYONE?tr('所有人'):nameOf(id);
function chatDayLabel(iso){
  const d=new Date(iso),today=new Date();
  const key=x=>`${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if(key(d)===key(today))return tr('今天');
  const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
  if(key(d)===key(yesterday))return tr('昨天');
  return tr('{0} 月 {1} 日',d.getMonth()+1,d.getDate());
}
function chatClock(iso){
  const d=new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
/* The two standing rooms first, then a channel per live project. A finished
   project drops off this list and its history moves to 成果库. */
function chatChannelList(){
  const items=[{id:'general',name:tr('沟通')},{id:'lounge',name:tr('闲聊')}];
  (S.projects||[]).filter(pr=>pr.status==='active').forEach(pr=>items.push({id:pr.id,name:pr.name}));
  return items;
}
function chatChannelUnread(id){
  return Number(((S.chat||{}).byChannel||{})[id]||0);
}
/* A compact stamp for the list: a time today, 昨天, or a date. */
function chatListTime(iso){
  const d=new Date(iso),today=new Date();
  const key=x=>`${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if(key(d)===key(today))return chatClock(iso);
  const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
  if(key(d)===key(yesterday))return tr('昨天');
  return `${d.getMonth()+1}/${d.getDate()}`;
}
/* The mark beside a conversation: an icon for the two standing rooms, the
   project's first glyph otherwise. */
function chatChannelMark(c){
  if(c.id==='general')return `<span class="chat-mark">${icon('chat')}</span>`;
  if(c.id==='lounge')return `<span class="chat-mark">${icon('users')}</span>`;
  return `<span class="chat-mark is-project" style="--avatar-hue:${avatarHue(c.id)}">${escapeHTML(String(c.name||'#').slice(0,1))}</span>`;
}
function chatPreviewText(id){
  const meta=chatPreviews[id]||{};
  if(!meta.body)return tr('<span class="chat-channel-idle">还没有消息</span>');
  const mine=meta.author===S.user?.id;
  return escapeHTML((mine?tr('我：'):'')+String(meta.body).replace(/\s+/g,' '));
}
function renderChatCurrent(){
  const el=$('#chatCurrent');if(!el)return;
  const item=chatChannelList().find(c=>c.id===chatChannel);
  el.textContent=item?item.name:tr('沟通');
}
function renderChatChannels(){
  const bar=$('#chatChannels');if(!bar)return;
  const items=chatChannelList();
  /* A project can finish while you are sitting in its channel. */
  if(!items.some(c=>c.id===chatChannel))chatChannel='general';
  bar.innerHTML=items.map(c=>{
    const n=chatChannelUnread(c.id);
    const meta=chatPreviews[c.id]||{};
    const time=meta.createdAt?`<time class="chat-channel-time">${escapeHTML(chatListTime(meta.createdAt))}</time>`:'';
    const badge=n?`<i class="chat-channel-badge">${n>99?'99+':n}</i>`:'';
    return `<button type="button" role="tab" aria-selected="${c.id===chatChannel}" class="chat-channel ${c.id===chatChannel?'is-on':''}" data-channel="${escapeHTML(c.id)}" title="${escapeHTML(c.name)}" aria-label="${escapeHTML(c.name)}${n?'，'+n+tr(' 条未读'):''}">`
      +chatChannelMark(c)
      +`<span class="chat-channel-body"><span class="chat-channel-name">${escapeHTML(c.name)}</span>`
      +`<span class="chat-channel-preview">${chatPreviewText(c.id)}</span></span>`
      +`<span class="chat-channel-side">${time}${badge}</span></button>`;
  }).join('');
  $$('#chatChannels .chat-channel').forEach(b=>b.onclick=()=>{
    /* Switching rooms reads only the room you switched to. */
    if(chatChannel!==b.dataset.channel){
      if(typeof voice!=='undefined'&&voice.target?.id==='chatInput')agentCancelVoice();
      chatChannel=b.dataset.channel;
      renderChatCurrent();
    }
    renderChatChannels();
    loadChat(true);
  });
  renderChatCurrent();
  applyNavigationLayout();
}
/* Mentions are read back out of the text, so a hand-typed @名字 works exactly
   like one picked from the menu. */
function chatParseMentions(text){
  const found=[];
  if(text.includes('@所有人')||text.includes(`@${tr('所有人')}`))found.push(CHAT_EVERYONE);
  (S.users||[]).forEach(u=>{
    const name=u.displayName||u.id;
    if(text.includes('@'+name)||text.includes('@'+u.id))if(!found.includes(u.id))found.push(u.id);
  });
  return found;
}
function chatMentionsHTML(text){
  let html=escapeHTML(text);
  chatParseMentions(text).forEach(id=>{
    const name=escapeHTML(chatMentionName(id));
    const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const cls=id===CHAT_EVERYONE?'chat-mention chat-mention-all':'chat-mention';
    html=html.replace(new RegExp('@'+safe,'g'),`<em class="${cls}">@${name}</em>`);
  });
  return html;
}
/* Only http(s) and bare www. are linked. Trailing punctuation belongs to the
   sentence, not the address, so it is trimmed back outside the anchor — except
   for a closing bracket that the address itself opened. */
const CHAT_URL_RE=/\b(?:https?:\/\/|www\.)[^\s<>"'，。；：！？、（）「」『』【】《》…]+/gi;
function chatTrimUrl(url){
  let text=url,tail='';
  for(;;){
    const last=text.slice(-1);
    if(!/[.,;:!?，。；：！？、"'）)】》…]/.test(last))break;
    if((last===')'||last==='）')&&(text.split('(').length>=text.split(')').length))break;
    tail=last+tail;text=text.slice(0,-1);
  }
  return {url:text,tail};
}
function chatSplitLinks(text){
  const parts=[];let last=0,m;
  CHAT_URL_RE.lastIndex=0;
  while((m=CHAT_URL_RE.exec(text))){
    const cut=chatTrimUrl(m[0]);
    if(!cut.url)continue;
    if(m.index>last)parts.push({text:text.slice(last,m.index)});
    parts.push(cut);
    last=m.index+cut.url.length;      /* the tail falls back into the text */
  }
  if(last<text.length)parts.push({text:text.slice(last)});
  return parts;
}
function chatBodyHTML(text){
  return chatSplitLinks(text).map(p=>p.url!==undefined
    ?`<a class="chat-link" href="${escapeHTML(/^www\./i.test(p.url)?'https://'+p.url:p.url)}"`
      +` target="_blank" rel="noopener noreferrer nofollow">${escapeHTML(p.url+p.tail)}</a>`
    :chatMentionsHTML(p.text)).join('');
}
function chatBubble(m,withDay){
  const mine=m.author===S.user?.id;
  const day=withDay?`<div class="chat-day">${escapeHTML(chatDayLabel(m.createdAt))}</div>`:'';
  return day+`<div class="chat-message ${mine?'mine':''}">${avatarHTML(m.author)}`
    +`<div class="chat-body"><div class="chat-meta"><strong>${escapeHTML(nameOf(m.author))}</strong>`
    +`<time>${escapeHTML(chatClock(m.createdAt))}</time></div>`
    +`<div class="chat-text">${chatBodyHTML(m.body)}</div></div></div>`;
}
async function loadChat(reset){
  const log=$('#chatLog');if(!log)return;
  if(reset)chatLoadGeneration++;
  const generation=chatLoadGeneration,channel=chatChannel,owner=S.user?.id;
  let rows=[],more=false,firstCursor=null,lastCursor=null;
  try{
    const scope={channel};
    const data=await api('/api/action',{action:'chat.list',data:reset?scope:{...scope,...(chatLastCursor?{sinceCursor:chatLastCursor}:{since:chatLastAt})}});
    if(generation!==chatLoadGeneration||channel!==chatChannel||owner!==S.user?.id||!log.isConnected)return;
    rows=data.messages||[];more=Boolean(data.more);
    firstCursor=data.beforeCursor;lastCursor=data.sinceCursor;
    if(data.previews)chatPreviews=data.previews;
  }catch(e){
    if(generation!==chatLoadGeneration||channel!==chatChannel||owner!==S.user?.id)return;
    if(reset)log.innerHTML=`<p class="chat-empty">${tr('读不到消息：{0}',escapeHTML(e?.message||tr('加载失败')))}</p>`;
    return;
  }
  if(reset){log.innerHTML='';chatLastAt='';chatLastDay='';chatFirstAt='';chatFirstCursor=null;chatLastCursor=null}
  if(!rows.length){
    if(reset)log.innerHTML=chatChannel==='general'
      ?tr('<p class="chat-empty">暂无消息</p>')
      :tr('<p class="chat-empty">暂无消息</p>');
    return;
  }
  /* Follow the newest line, but do not yank the reader back down if they have
     scrolled up into the history. */
  const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<90;
  if(log.querySelector('.chat-empty'))log.innerHTML='';
  rows.forEach(m=>{
    const day=(m.createdAt||'').slice(0,10);
    log.insertAdjacentHTML('beforeend',chatBubble(m,Boolean(day)&&day!==chatLastDay));
    if(day)chatLastDay=day;
    if(m.createdAt)chatLastAt=m.createdAt;
  });
  chatLastCursor=lastCursor||null;
  if(reset){chatFirstAt=rows[0]?.createdAt||'';chatFirstCursor=firstCursor||null;if(more)log.insertAdjacentHTML('afterbegin',chatMoreButton())}
  bindChatMore();
  if(reset||nearBottom)log.scrollTop=log.scrollHeight;
  /* The list carries the newest line of every room, so a poll keeps it fresh. */
  renderChatChannels();
  reportChatRead(chatLastAt);
}
/* Older history comes a page at a time from the top of the log; the reader
   stays on the line they were reading. */
const chatMoreButton=()=>tr('<button type="button" class="chat-more" id="chatMore">加载更早的消息</button>');
function bindChatMore(){const b=$('#chatMore');if(b)b.onclick=loadEarlierChat}
async function loadEarlierChat(){
  const log=$('#chatLog'),button=$('#chatMore');if(!log||!button||!chatFirstAt)return;
  const channel=chatChannel,owner=S.user?.id,generation=chatLoadGeneration;button.disabled=true;button.textContent=tr('加载中…');
  let data;
  try{data=await api('/api/action',{action:'chat.list',data:{channel,...(chatFirstCursor?{beforeCursor:chatFirstCursor}:{before:chatFirstAt}),limit:120}})}
  catch(e){button.disabled=false;button.textContent=tr('加载更早的消息');toast(e.message);return}
  if(channel!==chatChannel||owner!==S.user?.id||generation!==chatLoadGeneration||!button.isConnected)return;
  const rows=data.messages||[];let day='',html='';
  rows.forEach(m=>{const d=(m.createdAt||'').slice(0,10);html+=chatBubble(m,Boolean(d)&&d!==day);if(d)day=d});
  /* The day already shown at the top no longer starts there. */
  const before=log.scrollHeight;
  const firstDay=log.querySelector('.chat-day');
  if(firstDay&&rows.length&&(rows[rows.length-1].createdAt||'').slice(0,10)===(chatFirstAt||'').slice(0,10))firstDay.remove();
  button.insertAdjacentHTML('afterend',html);
  if(rows[0]?.createdAt)chatFirstAt=rows[0].createdAt;
  if(rows.length)chatFirstCursor=data.beforeCursor||null;
  if(data.more){button.disabled=false;button.textContent=tr('加载更早的消息')}else button.remove();
  log.scrollTop+=log.scrollHeight-before;
}
async function reportChatRead(at){
  const channel=chatChannel;
  const was=chatChannelUnread(channel);
  try{
    await api('/api/action',{action:'chat.read',data:{at:at||'',channel}});
  }catch(_){return}
  /* Only this room is cleared; the badge stays until every room is read. */
  const byChannel={...((S.chat||{}).byChannel||{})};
  delete byChannel[channel];
  S.chat={...(S.chat||{}),unread:Object.values(byChannel).reduce((a,n)=>a+Number(n||0),0),byChannel};
  updateChatDot();
  if(was)renderChatChannels();
}
async function refreshChatPresence(){
  try{
    chatPresence=await api('/api/action',{action:'chat.presence',data:{}});
    renderChatMembers();
  }catch(_){}
}
/* Everyone active is listed, not only whoever is around right now: a strip
   that answers "who is here" is only telling the truth if it also shows who
   is not, and the dimmed faces are how you tell at a glance. */
const CHAT_PRESENCE_SHOWN=14;
function renderChatMembers(){
  const bar=$('#chatMembers');if(!bar)return;
  const ids=Object.keys(chatPresence||{}).sort((a,b)=>{
    const online=(chatPresence[b].online?1:0)-(chatPresence[a].online?1:0);
    if(online)return online;
    return String(chatPresence[b].at||'').localeCompare(String(chatPresence[a].at||''));
  });
  const online=ids.filter(id=>chatPresence[id].online).length;
  const shown=ids.slice(0,CHAT_PRESENCE_SHOWN),rest=ids.length-shown.length;
  bar.innerHTML=`<span class="chat-online">${tr('{0}/{1} 在线',online,ids.length)}</span>`+shown.map(id=>{
    const state=chatPresence[id];
    const label=state.online?tr('在线'):(state.at?tr('最后活跃 {0}',chatClock(state.at)):tr('还没来过'));
    return `<span class="chat-presence ${state.online?'is-on':''}" title="${escapeHTML(nameOf(id))} · ${escapeHTML(label)}">${avatarHTML(id)}</span>`;
  }).join('')+(rest>0?`<span class="chat-presence-more" title="${tr('还有 {0} 位成员',rest)}">+${rest}</span>`:'');
}
function startChatPolling(){
  stopChatPolling();
  chatPollTimer=setInterval(()=>{loadChat(false)},CHAT_POLL_MS);
  chatPresenceTimer=setInterval(()=>{refreshChatPresence()},CHAT_PRESENCE_MS);
}
function stopChatPolling(){
  if(chatPollTimer)clearInterval(chatPollTimer);
  if(chatPresenceTimer)clearInterval(chatPresenceTimer);
  chatPollTimer=0;chatPresenceTimer=0;
}
/* --- @ completion --- */
function chatMentionContext(input){
  const pos=input.selectionStart;
  if(pos==null)return null;
  const before=input.value.slice(0,pos);
  const hit=before.match(/@([^\s@]{0,12})$/);
  if(!hit)return null;
  const at=pos-hit[0].length;
  /* Only after a line start or a space, so an email address stays an address. */
  if(at>0&&!/\s/.test(input.value[at-1]))return null;
  return {query:hit[1],start:at,end:pos};
}
function chatMentionCandidates(query){
  const q=(query||'').toLowerCase();
  const list=(S.users||[]).filter(u=>u.active&&u.id!==S.user?.id)
    .filter(u=>!q||(u.displayName||'').toLowerCase().includes(q)||u.id.toLowerCase().includes(q))
    .slice(0,6);
  /* 所有人 is a broadcast rather than an account, so it never comes from the
     account list — it is offered at the top of it. */
  if(!q||tr('所有人').includes(q)||'all'.startsWith(q)||'everyone'.startsWith(q))
    list.unshift({id:CHAT_EVERYONE,name:tr('所有人'),every:true});
  return list;
}
function renderChatMentionMenu(){
  const menu=$('#chatMentionMenu');if(!menu)return;
  const list=chatMentionQuery===null?[]:chatMentionCandidates(chatMentionQuery);
  if(!list.length){menu.classList.add('hidden');menu.innerHTML='';return}
  if(chatMentionIndex>=list.length)chatMentionIndex=0;
  menu.innerHTML=list.map((u,i)=>`<button type="button" role="option" aria-selected="${i===chatMentionIndex}" class="chat-mention-option ${u.every?'is-everyone':''} ${i===chatMentionIndex?'is-on':''}" data-id="${escapeHTML(u.id)}">`
    +(u.every?icon('users'):avatarHTML(u.id))
    +`<span class="chat-mention-name">${escapeHTML(u.name||u.displayName||u.id)}</span>`
    +`<small>${escapeHTML(u.every?tr('通知全体成员'):u.id)}</small></button>`).join('');
  menu.classList.remove('hidden');
  $$('#chatMentionMenu .chat-mention-option').forEach(b=>b.onclick=()=>chatApplyMention(b.dataset.id));
}
function chatApplyMention(id){
  const input=$('#chatInput');if(!input)return;
  const info=chatMentionContext(input);if(!info)return;
  const name=chatMentionName(id);
  input.value=input.value.slice(0,info.start)+'@'+name+' '+input.value.slice(info.end);
  const caret=info.start+name.length+2;
  input.setSelectionRange(caret,caret);
  chatMentionQuery=null;chatMentionIndex=0;renderChatMentionMenu();
  input.focus();resizeChatInput();
}
function resizeChatInput(){
  const input=$('#chatInput');if(!input)return;
  input.style.height='auto';
  input.style.height=Math.min(120,input.scrollHeight)+'px';
}
async function chatSend(){
  if(voice.target?.id==='chatInput')agentCancelVoice();
  const input=$('#chatInput'),text=input?.value.trim();
  if(!text)return;
  input.value='';input.style.height='';chatMentionQuery=null;renderChatMentionMenu();
  try{
    await api('/api/action',{action:'chat.send',data:{body:text,channel:chatChannel,mentions:chatParseMentions(text)}});
    await loadChat(false);
    input.focus();
  }catch(e){
    toast(e?.message||tr('发送失败'));
    input.value=text;                     /* keep the draft rather than losing it */
  }
}
/* Landing on the room a notice came from, rather than on whichever channel was
   open last. */
function openChatChannel(channel){
  if(channel&&chatChannelList().some(c=>c.id===channel))chatChannel=channel;
  switchView('chat');
}
/* Reading a finished project's channel: the messages stay where they are, they
   just stop being reachable from the room and become part of 成果库. */
async function openChannelArchive(projectId,projectName){
  let rows=[];
  try{
    const data=await api('/api/action',{action:'chat.list',data:{channel:projectId,limit:300}});
    rows=data.messages||[];
  }catch(e){toast(e?.message||tr('读不到归档消息'));return}
  let dayKey='';
  const body=rows.map(m=>{
    const day=(m.createdAt||'').slice(0,10);
    const withDay=Boolean(day)&&day!==dayKey;
    if(day)dayKey=day;
    return chatBubble(m,withDay);
  }).join('');
  openModal(`<div class="eyebrow">${tr('归档 · {0}',escapeHTML(projectName||''))}</div><h2>${tr('沟通记录')}</h2>`
    +`<p>${rows.length?tr('共 {0} 条消息',rows.length):tr('暂无沟通记录')}</p>`
    +`<div class="chat-log chat-archive">${body}</div>`
    +`<div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('关闭')}</button></div>`);
  $('#cancelAction').onclick=closeModal;
}
/* The Enter that confirms an IME candidate (pinyin, or letters typed while a
   Chinese IME is on) must never send. Safari reports that Enter after
   compositionend with isComposing false, hence keyCode 229 and the short
   grace period set on compositionend. */
let imeUntil=0;
const imeEnter=e=>Boolean(e.isComposing||e.keyCode===229||Date.now()<imeUntil);
function initChatUI(){
  $('#chatEntryBtn')?.addEventListener('click',()=>switchView('chat'));
  $('#chatForm')?.addEventListener('submit',e=>{e.preventDefault();chatSend()});
  const input=$('#chatInput');
  input?.addEventListener('input',()=>{
    const info=chatMentionContext(input);
    chatMentionQuery=info?info.query:null;
    chatMentionIndex=0;
    renderChatMentionMenu();
    resizeChatInput();
  });
  input?.addEventListener('keydown',e=>{
    const menu=$('#chatMentionMenu');
    const open=menu&&!menu.classList.contains('hidden');
    if(open){
      const list=chatMentionCandidates(chatMentionQuery||'');
      if(e.key==='ArrowDown'&&list.length){e.preventDefault();chatMentionIndex=(chatMentionIndex+1)%list.length;renderChatMentionMenu();return}
      if(e.key==='ArrowUp'&&list.length){e.preventDefault();chatMentionIndex=(chatMentionIndex-1+list.length)%list.length;renderChatMentionMenu();return}
      if((e.key==='Enter'||e.key==='Tab')&&list.length&&!imeEnter(e)){e.preventDefault();chatApplyMention(list[chatMentionIndex].id);return}
      if(e.key==='Escape'){e.preventDefault();chatMentionQuery=null;renderChatMentionMenu();return}
    }
    /* isComposing keeps the Enter that confirms a Chinese IME candidate from
       sending a half-finished message. */
    if(e.key==='Enter'&&!e.shiftKey&&!imeEnter(e)){e.preventDefault();chatSend()}
  });
  input?.addEventListener('blur',()=>setTimeout(()=>{chatMentionQuery=null;renderChatMentionMenu()},150));
  /* Delegated, so it keeps working across inbox re-renders. */
  document.addEventListener('click',e=>{
    const mention=e.target.closest?.('.open-chat-from-mention');
    if(mention){openChatChannel(mention.dataset.channel);return}
    const archive=e.target.closest?.('.open-channel-archive');
    if(archive)openChannelArchive(archive.dataset.project,archive.dataset.name);
  });
  updateChatDot();
}
function initAgentUI(){
  initAgentPanelResize();
  $('#agentBtn')?.addEventListener('click',async()=>{$('#agentPanel').classList.remove('hidden');applyAgentPanelSize();renderAgentCapability();await agentLoadOwnHistory();await agentLoadServerConfig();agentSyncPlanButton();agentInitVoice();$('#agentInput').focus()});
  $('#agentHistoryBtn')?.addEventListener('click',()=>agentToggleSessions());
  $('#agentCloseBtn')?.addEventListener('click',()=>{if(!voice.target)agentCancelVoice();agentToggleModelMenu(false);$('#agentPanel').classList.add('hidden')});
  $('#agentStopBtn')?.addEventListener('click',()=>agentHalt(tr('已停止，草稿和已执行记录保留。')));
  $('#agentPauseBtn')?.addEventListener('click',()=>agentTogglePause());
  $('#agentDraftToggle')?.addEventListener('click',()=>{const b=agentState.planBoard;if(b){b.closed=!b.closed;planRender(b)}});
  $('#agentDraftClose')?.addEventListener('click',()=>{const b=agentState.planBoard;if(b&&!b.busy){b.closed=true;planRender(b)}});
  $('#agentPlanBtn')?.addEventListener('click',()=>agentTogglePlan());
  $$('#agentPanel .agent-mode-opt').forEach(b=>b.addEventListener('click',()=>agentSetPref(b.dataset.mode)));
  agentRenderModeOptions();
  /* The AI connection is configured in 系统设置; the gear goes there. */
  $('#agentConfigBtn')?.addEventListener('click',()=>openSettingsPage('ai'));
  $('#agentModelChip')?.addEventListener('click',e=>{e.stopPropagation();agentToggleModelMenu()});
  $('#agentModelChip')?.addEventListener('keydown',e=>{if(['Enter',' ','ArrowDown'].includes(e.key)){e.preventDefault();agentToggleModelMenu(true);$('#agentModelMenu [data-model]')?.focus()}});
  $('#agentModelMenu')?.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();agentToggleModelMenu(false);$('#agentModelChip')?.focus();return}
    const options=$$('#agentModelMenu [data-model]'),index=options.indexOf(document.activeElement);
    const next={ArrowDown:(index+1)%options.length,ArrowUp:(index-1+options.length)%options.length,Home:0,End:options.length-1}[e.key];
    if(next!==undefined){e.preventDefault();options[next]?.focus()}
  });
  document.addEventListener('click',e=>{if(!e.target.closest?.('.agent-model-slot'))agentToggleModelMenu(false)});
  $('#agentPaneCards')?.addEventListener('click',()=>agentSetPane('cards'));
  $('#agentPaneChat')?.addEventListener('click',()=>agentSetPane('chat'));
  $('#agentPaneTabs')?.addEventListener('keydown',agentPaneKeydown);
  document.addEventListener('keydown',e=>{if(e.key!=='Escape'||e.defaultPrevented||$('#agentPanel')?.classList.contains('hidden')||agentPanelDrag)return;
    e.preventDefault();if(!$('#agentModelMenu')?.classList.contains('hidden')){agentToggleModelMenu(false);$('#agentModelChip')?.focus()}
    else{$('#agentCloseBtn')?.click();$('#agentBtn')?.focus()}});
    $('#agentForm')?.addEventListener('submit',e=>{e.preventDefault();agentSubmit()});
  document.addEventListener('compositionend',()=>{imeUntil=Date.now()+80},true);
  $('#agentInput')?.addEventListener('keydown',agentInputKeydown);
  $('#agentInput')?.addEventListener('input',()=>{agentSyncPlanButton();agentVoiceFollowEdit()});
  $('#agentMicBtn')?.addEventListener('click',()=>agentToggleVoice());
  renderAgentCapability();
  agentSyncPlanButton();
}

/* ---------------------------------------------------------------------------
   Voice input · the composer can also be dictated. Two engines are supported:
   a superadmin-configured speech-to-text service (Qwen3-ASR, Whisper, …) that
   keeps audio on infrastructure the operator chose, and the browser's built-in
   Web Speech API as a zero-config fallback. The transcript only lands in the
   input box where you can edit it before sending; nothing is auto-sent.
   ------------------------------------------------------------------------- */
const voice={recorder:null,stream:null,chunks:[],recognition:null,engine:null,active:false,base:'',final:'',interim:'',lang:'',startedAt:0,generation:0,transcribing:false,starting:false,session:null,controller:null,target:null,scope:null,writing:false};
let sharedSpeechStatus=null,speechStatusOwner=null;
function agentSpeechRecognition(){
  return window.SpeechRecognition||window.webkitSpeechRecognition||null;
}
function agentCanRecord(){
  return Boolean(navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder==='function');
}
/* Prefer the server engine when it is configured and the browser can record;
   otherwise fall back to whatever recognition the browser itself provides. */
function agentVoiceEngine(){
  if((sharedSpeechStatus??agentServerAsr)?.configured&&agentCanRecord())return 'server';
  if(agentSpeechRecognition())return 'browser';
  return null;
}
function agentVoiceLang(){
  if(voice.lang)return voice.lang;
  try{
    for(const tag of (navigator.languages||[navigator.language||'zh-CN'])){
      if(String(tag).toLowerCase().startsWith('zh'))return voice.lang=tag;
    }
    return voice.lang=navigator.language||'zh-CN';
  }catch(_){return voice.lang='zh-CN'}
}
/* Recognition emits a fresh interim guess for the tail while the settled text
   accumulates; only `final` is kept, so the box never stutters. */
function agentVoiceRender(){
  const input=voiceInput();if(!input)return;
  const settled=voice.base+voice.final;
  voiceWrite(input,settled+(voice.interim?voice.interim:''));
  try{input.setSelectionRange(input.value.length,input.value.length)}catch(_){}
  agentSyncPlanButton();
}
/* The transcript joins whatever the box holds when it arrives, so text typed or
   deleted while recording or transcribing is neither lost nor brought back. */
function agentVoiceAppend(text){
  const input=voiceInput();
  if(!text||!input)return;
  voiceWrite(input,input.value+text);
  try{input.setSelectionRange(input.value.length,input.value.length)}catch(_){}
  agentSyncPlanButton();
}
/* Typing while dictating makes the box's current text the new starting point, so
   words recognized next are added after the edit instead of over it. */
function agentVoiceFollowEdit(){
  if(voice.writing||!voice.active||voice.engine!=='browser')return;
  const input=voiceInput();if(!input)return;
  const tail=voice.interim||'';
  const tailKept=Boolean(tail)&&input.value.endsWith(tail);
  voice.base=tailKept?input.value.slice(0,-tail.length):input.value;
  if(!tailKept)voice.interim='';
  voice.final='';
}
function agentVoiceStart(){
  const engine=agentVoiceEngine();
  if(!engine||voice.starting||voice.transcribing)return;
  agentStopVoice();
  if(engine==='server')agentVoiceStartRecording();
  else agentVoiceStartRecognition();
}
/* ---------- server engine: record with MediaRecorder, transcribe on upload ---------- */
async function agentVoiceStartRecording(){
  if(voice.starting||voice.transcribing)return;
  const generation=voice.generation;voice.starting=true;agentVoiceState();
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(_){
    if(generation===voice.generation){voice.starting=false;agentVoiceState();toast(tr('没有拿到麦克风权限，请在地址栏允许后重试'))}
    return;
  }
  if(generation!==voice.generation||!voiceInput()){stream.getTracks().forEach(track=>track.stop());return}
  voice.starting=false;
  const mime=typeof MediaRecorder.isTypeSupported==='function'
    ? ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t))||''
    : '';
  let recorder;
  try{
    try{recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream)}catch(_){recorder=new MediaRecorder(stream)}
  }catch(_){stream.getTracks().forEach(track=>track.stop());agentVoiceState();toast(tr('浏览器无法录音，请重试'));return}
  voice.stream=stream;voice.recorder=recorder;voice.chunks=[];voice.interim='';
  voice.engine='server';voice.active=true;voice.startedAt=Date.now();
  const session={recorder,stream,chunks:voice.chunks,generation};voice.session=session;
  recorder.ondataavailable=event=>{if(event.data&&event.data.size)session.chunks.push(event.data)};
  recorder.onstop=()=>agentVoiceFinishRecording(session);
  recorder.onerror=()=>{if(generation===voice.generation){agentCancelVoice();toast(tr('录音中断，请重试'))}};
  try{recorder.start()}catch(_){agentStopVoice();return}
  agentVoiceState();
}
async function agentVoiceFinishRecording(session=null){
  session=session||{recorder:voice.recorder,stream:voice.stream,chunks:voice.chunks,generation:voice.generation};
  const {recorder,stream,generation}=session,chunks=session.chunks.slice();
  stream?.getTracks().forEach(track=>{try{track.stop()}catch(_){}});
  if(generation!==voice.generation||!voiceInput())return;
  voice.chunks=[];voice.stream=null;voice.active=false;voice.transcribing=Boolean(chunks.length);
  agentVoiceState();
  if(!chunks.length){if(voice.recorder===recorder)voice.recorder=null;return}
  const blob=new Blob(chunks,{type:recorder?.mimeType||chunks[0]?.type||'audio/webm'});
  const controller=typeof AbortController==='function'?new AbortController():null;voice.controller=controller;
  try{
    const result=await apiBlob(TRANSCRIBE_ENDPOINT,blob,controller?{signal:controller.signal}:{});
    if(generation!==voice.generation)return;
    agentVoiceAppend(result?.text||'');
    if(!result?.text)toast(tr('没有识别到内容，再说一次试试'));
  }catch(err){if(generation===voice.generation&&err.name!=='AbortError')toast(err?.message||tr('语音转写失败'))}
  finally{
    if(generation===voice.generation){if(voice.recorder===recorder)voice.recorder=null;voice.session=null;voice.transcribing=false;voice.controller=null;agentVoiceState()}
  }
}
/* ---------- browser engine: Web Speech API, zero config ---------- */
function agentVoiceStartRecognition(){
  const Engine=agentSpeechRecognition();
  if(!Engine)return;
  const generation=voice.generation,recognition=new Engine();
  recognition.lang=agentVoiceLang();recognition.continuous=true;recognition.interimResults=true;
  voice.recognition=recognition;voice.engine='browser';voice.starting=true;agentVoiceState();
  voice.base=voiceInput()?.value||'';voice.final='';voice.interim='';
  recognition.onstart=()=>{if(generation!==voice.generation)return;voice.starting=false;voice.active=true;agentVoiceState();agentVoiceRender()};
  recognition.onresult=event=>{
    if(generation!==voice.generation)return;
    let interim='',final='';
    for(let i=event.resultIndex;i<event.results.length;i+=1){
      const result=event.results[i],text=result[0]?.transcript||'';
      if(result.isFinal)final+=text;else interim+=text;
    }
    if(final)voice.final+=final;
    voice.interim=interim;agentVoiceRender();
  };
  recognition.onerror=event=>{
    if(generation!==voice.generation)return;
    const reason=event?.error||'';
    voice.starting=false;voice.active=false;voice.recognition=null;agentVoiceState();
    if(reason==='not-allowed'||reason==='service-not-allowed')toast(tr('浏览器没有麦克风权限，请在地址栏允许后重试'));
    else if(reason==='audio-capture')toast(tr('没有检测到可用的麦克风'));
    else if(reason!=='aborted'&&reason!=='no-speech')toast(tr('语音识别中断，请重试'));
  };
  recognition.onend=()=>{
    if(generation!==voice.generation)return;
    voice.starting=false;voice.active=false;voice.recognition=null;voice.interim='';agentVoiceRender();agentVoiceState();
  };
  try{recognition.start()}catch(_){voice.starting=false;voice.recognition=null;agentVoiceState();toast(tr('语音识别未能启动，请重试'))}
}
function agentStopVoice(){
  const recognition=voice.recognition,recorder=voice.recorder;
  voice.recognition=null;voice.active=false;voice.interim='';
  if(recognition){try{recognition.stop()}catch(_){}}
  if(recorder&&recorder.state!=='inactive'){voice.transcribing=true;try{recorder.stop()}catch(_){voice.transcribing=false}}else{
    voice.stream?.getTracks().forEach(track=>{try{track.stop()}catch(_){}});
    voice.stream=null;agentVoiceState();
  }
  agentVoiceState();
}
/* Changing conversations cancels audio instead of delivering its late text
   into the new composer. A normal Stop still transcribes in the same chat. */
function agentCancelVoice(){
  voice.generation++;voice.controller?.abort();voice.starting=false;voice.transcribing=false;
  if(voice.recognition)for(const key of ['onstart','onresult','onerror','onend'])voice.recognition[key]=null;
  if(voice.recorder){voice.recorder.onstop=null;voice.recorder.ondataavailable=null;voice.recorder.onerror=null}
  agentStopVoice();
  voice.stream?.getTracks().forEach(track=>{try{track.stop()}catch(_){}});voice.stream=null;
  voice.recorder=null;voice.session=null;voice.transcribing=false;voice.chunks=[];voice.base='';voice.final='';voice.interim='';agentVoiceState();
}
function agentToggleVoice(){
  if(voice.target&&voice.target!==$('#agentInput'))agentCancelVoice();
  voice.target=null;voice.scope=null;
  if(!agentVoiceEngine()||voice.starting||voice.transcribing)return;
  if(voice.active)agentStopVoice();else agentVoiceStart();
}
function agentVoiceState(){
  const mic=$('#agentMicBtn');
  if(mic){
    mic.classList.toggle('is-on',voice.active&&!voice.target);
    mic.setAttribute('aria-pressed',voice.active&&!voice.target?'true':'false');
    mic.title=voice.active&&!voice.target?tr('正在聆听：再点一下结束并转成文字'):tr('语音输入：点一下开始说话，再点一下结束并转成文字');
    const slot=mic.querySelector('.icon-slot');if(slot)slot.dataset.icon=voice.active&&!voice.target?'square':'mic';
  }
  const voiceBar=$('#agentVoiceBar');
  if(voiceBar){voiceBar.classList.toggle('hidden',Boolean(voice.target)||(!voice.active&&!voice.transcribing&&!voice.starting));voiceBar.textContent=voice.transcribing?tr('正在转写…'):voice.starting?tr('等待麦克风权限…'):tr('正在聆听…')}
  updateFieldVoiceButtons();
  agentUpdateBusy();
}
/* Keep the assistant entry consistent with the shared dictation capability. */
function agentInitVoice(){
  $('#agentMicBtn')?.classList.toggle('hidden',!agentVoiceEngine());
  $('#agentVoiceHint')?.classList.add('hidden');
  agentVoiceState();
}
function voiceScope(){
  return {user:typeof S==='undefined'?null:S.user?.id,view:typeof UI==='undefined'?null:UI.view,
    channel:typeof chatChannel==='undefined'?null:chatChannel};
}
function voiceInput(){
  const input=voice.target||$('#agentInput');
  if(!voice.target)return input;
  const scope=voiceScope(),same=voice.scope&&scope.user===voice.scope.user&&scope.view===voice.scope.view
    &&(input.id!=='chatInput'||scope.channel===voice.scope.channel);
  if(!same||input.isConnected===false||input.disabled||input.readOnly||input.closest?.('.hidden,[hidden],fieldset[disabled],.view:not(.active-view)')||input.getClientRects?.().length===0){
    agentCancelVoice();return null;
  }
  return input;
}
function voiceWrite(input,value){
  const limit=input.maxLength;
  input.value=Number.isInteger(limit)&&limit>=0?value.slice(0,limit):value;
  // Notify draft/dirty-state handlers without treating recognition as a manual edit.
  voice.writing=true;
  try{if(typeof Event==='function')input.dispatchEvent?.(new Event('input',{bubbles:true}))}
  finally{voice.writing=false}
}
function toggleFieldVoice(input){
  if(voice.target===input&&(voice.active||voice.starting||voice.transcribing)){
    if(voice.active)agentStopVoice();else agentCancelVoice();
    return;
  }
  agentCancelVoice();voice.target=input;voice.scope=voiceScope();
  if(voiceInput())agentVoiceStart();
}
function updateFieldVoiceButtons(){
  if(typeof document==='undefined')return;
  document.querySelectorAll('.field-voice-btn').forEach(button=>{
    const input=button.parentElement.querySelector('textarea'),on=voice.target===input;
    const busy=on&&(voice.active||voice.starting||voice.transcribing);
    const label=busy?(voice.active?tr('结束录音'):voice.starting?tr('取消等待麦克风'):tr('取消转写')):tr('语音输入');
    button.hidden=!agentVoiceEngine()||input.disabled||input.readOnly;
    button.classList.toggle('is-on',busy);
    button.classList.toggle('is-transcribing',on&&voice.transcribing);
    if(button.getAttribute('aria-label')!==label){button.setAttribute('aria-label',label);button.title=label}
    button.setAttribute('aria-pressed',busy?'true':'false');
  });
}
async function loadSpeechStatus(){
  const owner=S.user?.id;if(!owner)return;
  // A new account must not inherit the previous account's service capability.
  if(speechStatusOwner!==owner){sharedSpeechStatus=null;speechStatusOwner=owner}
  try{
    const status=await api('/api/action',{action:'speech.status',data:{}});
    if(S.user?.id!==owner)return;
    sharedSpeechStatus=status;agentInitVoice();scanVoiceFields();
  }catch(_){if(S.user?.id===owner){sharedSpeechStatus={configured:false};agentInitVoice();scanVoiceFields()}}
}
function scanVoiceFields(){
  document.querySelectorAll('textarea').forEach(input=>{
    if(input.id==='agentInput'||input.id==='meetingTranscript'||input.disabled||input.readOnly||input.closest('.voice-field'))return;
    if(!input.hasAttribute('aria-label')&&!input.hasAttribute('aria-labelledby')&&input.labels?.length===1){
      const label=input.labels[0].textContent.trim();if(label)input.setAttribute('aria-label',label);
    }
    const wrapper=document.createElement('span');wrapper.className='voice-field';
    input.before(wrapper);wrapper.append(input);
    const button=document.createElement('button');button.type='button';button.className='field-voice-btn';
    button.innerHTML=icon('mic');button.onclick=()=>toggleFieldVoice(input);wrapper.append(button);
    if(input.closest('.form-field'))addFieldExpand(wrapper,input);
  });
  if(voice.target&&(voice.active||voice.starting||voice.transcribing))voiceInput();
  updateFieldVoiceButtons();
}
function addFieldExpand(wrapper, input) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'field-expand-btn';
  const sync = () => {
    const open = wrapper.classList.contains('is-expanded');
    button.innerHTML = icon(open ? 'minimize-2' : 'maximize-2');
    button.setAttribute('aria-label', open ? tr('收起') : tr('展开'));
    button.title = open ? tr('收起') : tr('展开');
    button.setAttribute('aria-pressed', String(open));
  };
  button.onclick = () => {
    wrapper.classList.toggle('is-expanded');
    sync();
    if (!wrapper.classList.contains('is-expanded')) {
      fitTextarea(input);
    }
    input.focus();
  };
  sync();
  wrapper.append(button);
  requestAnimationFrame(() => fitTextarea(input));
}
function initSharedVoice(){
  scanVoiceFields();
  document.addEventListener('input',event=>{if(event.target.matches?.('.form-field textarea'))fitTextarea(event.target)});
  document.addEventListener('input',event=>{if(event.target===voice.target)agentVoiceFollowEdit()});
  document.addEventListener('submit',event=>{if(voice.target&&event.target.contains(voice.target))agentCancelVoice()},true);
  // Forms and assistant proposal cards are mounted dynamically. Observe only
  // structural/visibility changes, not our own button feedback attributes.
  const observer=new MutationObserver(scanVoiceFields);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','disabled','readonly']});
}


initAgentUI();
initChatUI();
initSharedVoice();
initNavigationLayout();
function ensureAccountCreateButton(){
  const owner=Boolean(S.user?.role==='superadmin'),host=$('#accountsView .page-intro');if(!host)return;
  let b=$('#createAccountBtn');
  if(!b){b=document.createElement('button');b.id='createAccountBtn';b.className='secondary-btn';b.innerHTML=`${icon('plus')}${tr('添加账户')}`;host.appendChild(b)}
  b.onclick=createAccountDialog;b.classList.toggle('hidden',!owner);
}
function createAccountDialog(){
  const groups={superadmin:S.users.filter(u=>roleOf(u)==='superadmin').length,admin:S.users.filter(u=>roleOf(u)==='admin').length};
  openModal(`<div class="eyebrow">${tr('账户管理 · 新建账户')}</div><h2>${tr('添加账户')}</h2><label class="form-field">${tr('账户名')}<input id="newAccountName" autocomplete="off" placeholder="zhangsan"></label><label class="form-field">${tr('中文名称（可留空）')}<input id="newAccountDisplayName" maxlength="12"></label><label class="form-field">${tr('初始密码')}<input id="newAccountPassword" type="password" autocomplete="new-password" placeholder="${tr('至少 6 位')}"></label><label class="form-field">${tr('权限组')}<select id="newAccountRole"><option value="member">${tr('普通用户')}</option><option value="admin">${tr('admin（{0}）',groups.admin)}</option><option value="superadmin">${tr('superadmin（{0}）',groups.superadmin)}</option></select></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">${tr('取消')}</button><button class="primary-btn" id="confirmCreateAccount">${tr('创建账户')}</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmCreateAccount').onclick=async()=>{
    const username=$('#newAccountName').value.trim(),password=$('#newAccountPassword').value,role=$('#newAccountRole').value,displayName=$('#newAccountDisplayName').value.trim();
    if(!username){toast(tr('请填写账户名'));return}
    if(password.length<6){toast(tr('密码至少 6 位'));return}
    try{await api('/api/action',{action:'account.create',data:{username,password,role,displayName}});closeModal();await refresh();toast(role==='member'?tr('已创建普通账户 {0}',username):tr('已创建管理账户 {0}',username))}
    catch(e){toast(e.message||tr('创建失败'))}
  };
}
window.addEventListener('load',()=>setTimeout(ensureAccountCreateButton,200));
