const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const UI={view:'calendar',member:'all',filter:'all',selectedWeek:0,detailDate:null,timelineScroll:null,dayOffset:0};
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* One stroked 24px icon set. Everything the UI used to draw with text glyphs
   (◷ ▦ ✦ ◇ ＋ › ↻ ▶ …) now comes from here, so stroke weight, optical size and
   alignment stay consistent and nothing depends on the system symbol font. */
const ICON_PATHS={
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
  'pip':'<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>'
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
let S={user:null,users:[],tasks:[],projects:[],achievements:[],logs:[],reports:[],diaries:[],diaryStats:[],notifications:[],requests:[],editRequests:[],suggestions:[],profiles:[],today:''};
/* The server always answers in JSON, but the tunnel in front of it does not:
   a request that runs past its time limit comes back as an HTML error page.
   Safari reports parsing that as "The string did not match the expected
   pattern", so anything that is not JSON becomes a readable message here. */
const readJSON=async r=>{const text=await r.text();try{return text?JSON.parse(text):{}}catch(_){throw new Error([504,524].includes(r.status)?'服务响应超时，请稍后再试；给 AI 助手的需求可以拆短一点':`服务暂时不可用（HTTP ${r.status}），请稍后再试`)}};
const api=(path,body)=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Work-Calendar':'1'},credentials:'same-origin',body:JSON.stringify(body)}).then(async r=>{const x=await readJSON(r);if(!r.ok)throw new Error(x.error||'操作未完成');return x});
/* Raw-body sibling of api() for uploads: audio is sent as-is, not as JSON. */
const apiBlob=(path,blob)=>fetch(path,{method:'POST',headers:{'Content-Type':blob.type||'application/octet-stream','X-Work-Calendar':'1'},credentials:'same-origin',body:blob}).then(async r=>{const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(x.error||'请求未完成');return x});
const getState=()=>fetch('/api/state',{credentials:'same-origin'}).then(async r=>{const x=await readJSON(r);if(!r.ok)throw new Error(x.error||'请登录');return x});
const fmt=iso=>{const d=new Date(`${iso}T12:00:00`);return `${d.getMonth()+1}月${d.getDate()}日`};
const wd=iso=>['周日','周一','周二','周三','周四','周五','周六'][new Date(`${iso}T12:00:00`).getDay()];
const add=(iso,n)=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const weekStart=iso=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()-(d.getDay()+1)%7);return d.toISOString().slice(0,10)};
const DATE_HORIZON='2027-04-30';
const displayDay=()=>{const day=add(S.today,UI.dayOffset||0);return day>DATE_HORIZON?DATE_HORIZON:day};
const week=off=>{const start=add(weekStart(S.today),off*7);return Array.from({length:7},(_,i)=>add(start,i))};
const weekOffsetFor=iso=>Math.round((new Date(`${weekStart(iso)}T12:00:00`)-new Date(`${weekStart(S.today)}T12:00:00`))/604800000);
const sortTasks=a=>a.slice().sort((x,y)=>({P0:0,P1:1,P2:2}[x.priority]-({P0:0,P1:1,P2:2}[y.priority])||x.name.localeCompare(y.name,'zh')));
const status=t=>{
  if(t.status==='done')return ['done','已完成'];
  if(['pending_approval','awaiting_approval','submitted'].includes(t.status))return ['pending-approval','待审批'];
  if(['rejected','returned'].includes(t.status))return ['rejected','已驳回'];
  if(t.status==='deferred')return ['defer','已递延'];
  if(t.status==='doing')return ['doing','进行中'];
  if(t.status==='skipped')return ['defer','已跳过'];
  return ['','待开始'];
};
const projectName=t=>(S.projects.find(p=>p.id===t.projectId)||{}).name||'个人';
function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}
function showAuth(){document.body.classList.add('auth-locked');let e=$('#authScreen');if(!e){e=document.createElement('section');e.id='authScreen';document.body.prepend(e)}const local=location.protocol==='file:';e.innerHTML=`<div class="auth-card"><div class="brand"><span class="brand-mark">战</span><span>战略小组<br><strong>台账</strong></span></div><h1>登录工作台</h1><form id="loginForm"><label>账户<input id="loginUser" autocomplete="username" value="superadmin" required></label><label>密码<input id="loginPass" type="password" autocomplete="current-password" required></label><button class="primary-btn" type="submit" ${local?'disabled':''}>${local?'请先启动本地服务':'进入工作台'}</button><div id="loginError" class="login-error">${local?'请在工作区运行 ./run.sh，然后访问 http://127.0.0.1:4173/':''}</div></form></div>`;$('#loginForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/login',{username:$('#loginUser').value,password:$('#loginPass').value});document.body.classList.remove('auth-locked');e.target.closest('#authScreen').remove();await refresh();switchView('calendar')}catch(err){$('#loginError').textContent=err.message}}}
/* Accounts that have signed in on this browser, newest first. The switcher
   offers only these, so it never lists the whole team to everyone. */
const KNOWN_ACCOUNTS_KEY='wc-accounts';
function knownAccounts(){try{const v=JSON.parse(localStorage.getItem(KNOWN_ACCOUNTS_KEY)||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[]}catch(_){return []}}
function rememberAccount(id){if(!id)return;try{localStorage.setItem(KNOWN_ACCOUNTS_KEY,JSON.stringify([id,...knownAccounts().filter(x=>x!==id)].slice(0,8)))}catch(_){}}
async function refresh(){
  let next;
  try{next=await getState()}catch(e){showAuth();return}
  if(S.user?.id!==next.user.id){Object.assign(UI,{view:'calendar',member:'all',filter:'all',selectedWeek:0,detailDate:null,timelineScroll:null,dayOffset:0})}
  /* updateChatDot is defined further down the file than the unit-test sandbox
     loads, so guard the call rather than assume it is in scope. */
  S=next;rememberAccount(S.user.id);renderAll();renderPip();if(typeof updateChatDot==='function')updateChatDot();
}
let inboxRefreshPromise=null;
async function refreshInboxState(){
  if(!S.user||document.body.classList.contains('auth-locked'))return;
  if(inboxRefreshPromise)return inboxRefreshPromise;
  inboxRefreshPromise=(async()=>{
    try{
      const next=await getState();
      if(next.user?.id!==S.user?.id){S=next;renderAll();return}
      S=next;
      if(UI.view==='inbox')renderInbox();
    }catch(e){}
    finally{inboxRefreshPromise=null}
  })();
  return inboxRefreshPromise;
}
function switchView(view){
  if((view==='achievements'||view==='accounts'||view==='archive')&&!S.user?.admin){view='calendar'}
  const changed=UI.view!==view;
  UI.view=view;
  /* Returning to the week rail should show the current week, not whichever
     panel the rail happened to be parked on last. */
  if(view==='calendar'&&changed)UI.selectedWeek=0;
  $$('.view').forEach(v=>v.classList.toggle('active-view',v.id===`${view}View`));
  $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
  const labels={today:'今日任务',calendar:'周视图',summary:'日记',projects:'项目空间',timeline:'项目时间轴',achievements:'成果库',archive:'档案室',inbox:'收件箱',accounts:'账户管理',dayDetail:'日期详情',chat:'沟通区'};
  $('#crumbCurrent').textContent=`/ ${labels[view]||view}`;
  renderScheduleScope();
  if(view==='calendar')renderCalendar();
  if(view==='today')renderToday();
  if(view==='dayDetail')renderDayContent();
  if(view==='summary')renderSummary();
  if(view==='projects')renderProjects();
  if(view==='timeline')renderTimeline();
  if(view==='achievements')renderAchievements();
  if(view==='archive')renderArchive();
  if(view==='inbox'){renderInbox();refreshInboxState();}
  if(view==='accounts')renderAccounts();
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
/* Every occurrence of one task shares originId/reworkOf links. Walking them
   lets the drawer show a single history for a task that was deferred or redone. */
function taskLineageIds(task){
  const byId=new Map((S.tasks||[]).map(x=>[x.id,x])),ids=new Set([task.id]);
  let parent=task.originId||task.reworkOf;const seen=new Set();
  while(parent&&byId.has(parent)&&!seen.has(parent)){seen.add(parent);ids.add(parent);const node=byId.get(parent);parent=node.originId||node.reworkOf}
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
  const label=settled?'已完成':left<0?`已逾期 ${-left} 天`:left===0?'今天到期':`还剩 ${left} 天`;
  return `<span class="task-ddl ${state}"><em>DDL</em> ${escapeHTML(fmt(end))}<b>${label}</b></span>`;
}
function ddlText(t){
  const end=taskEnd(t);
  if(!isMultiDay(t))return fmt(end);
  const left=daysCount(S.today,end);
  if(t.status==='done')return `${fmt(end)} · 已完成`;
  if(left<0)return `${fmt(end)} · 已逾期 ${-left} 天`;
  if(left===0)return `${fmt(end)} · 今天到期`;
  return `${fmt(end)} · 还剩 ${left} 天`;
}
function renderStats(day=displayDay()){const d=scheduleTasks().filter(t=>taskActiveOn(t,day)),current=d.filter(t=>!isArchivedTask(t)),done=current.filter(t=>t.status==='done').length;$('#todayCount').textContent=current.filter(t=>t.status!=='done').length;$('#p0Count').textContent=current.filter(t=>t.priority==='P0'&&t.status!=='done').length;$('#doingCount').textContent=scheduleTasks().filter(t=>t.status==='doing').length;$('#deferredCount').textContent=scheduleTasks(true).filter(t=>t.status==='deferred').length;$('#allTabCount').textContent=d.length;$('#openTabCount').textContent=current.length-done;$('#doneTabCount').textContent=done;$('#progressText').textContent=`${done} / ${current.length} 已完成`;const pct=current.length?done/current.length*100:0;$('#dayProgress').style.width=`${pct}%`;$('#progressPercent').textContent=`${Math.round(pct)}%`;$('#focusTime').textContent=`${String(Math.floor(current.reduce((n,t)=>n+t.duration,0)/60)).padStart(2,'0')}:${String(current.reduce((n,t)=>n+t.duration,0)%60).padStart(2,'0')}`;$('#focusProgress').style.width=`${pct}%`}
function taskCard(t){
  const [c,l]=status(t),deferLog=t.status==='deferred'?S.logs.find(x=>x.taskId===t.id&&x.kind==='defer'):null,carriedFrom=!isSuperseded(t)&&t.originId?S.logs.find(x=>x.nextTaskId===t.id&&x.kind==='defer'):null;
  /* The log is dated when the carry ran, which for the overnight rollover is
     already the new day; the badge names the day the work came from. */
  const carriedDay=carriedFrom&&(S.tasks.find(x=>x.id===carriedFrom.taskId)?.date||carriedFrom.date);
  /* One dense row per task: priority, name and badges, then fixed columns for
     owner, time, DDL and status. The description lives in the drawer. */
  return `<article class="task-card" data-id="${escapeHTML(t.id)}" tabindex="0"${t.desc?` title="${escapeHTML(t.desc)}"`:''}><span class="priority ${escapeHTML(t.priority)}">${escapeHTML(t.priority)}</span><div class="task-main"><span class="task-name">${escapeHTML(t.name)}</span>${t.fixed?`<span class="fixed-badge">${icon('repeat')} 固定</span>`:''}${isMultiDay(t)?`<span class="span-badge">${spanDays(t)} 天</span>`:''}${isSuperseded(t)?`<span class="superseded-badge">已被后续任务接替</span>`:''}${carriedFrom?`<span class="carried-badge">${icon('arrow-right')} 由 ${escapeHTML(carriedDay||'前一日')} 递延</span>`:''}${deferLog?.target?`<span class="defer-target">${icon('arrow-right')} ${escapeHTML(deferLog.target)}</span>`:''}<span class="project-tag">${escapeHTML(projectName(t))}</span></div><span class="assignee-tag" title="${escapeHTML(t.assignee)}">${escapeHTML(nameOf(t.assignee))}</span><span class="task-time">${icon('clock')} ${escapeHTML(t.time||'09:00')} · ${t.duration} 分钟</span><span class="task-when">${ddlBadge(t)}</span><span class="task-status"><i class="status-dot ${c}"></i>${l}</span><span class="task-arrow">${icon('chevron-right')}</span></article>`;
}
function dailyTaskGroups(tasks){
  const groups=new Map();
  for(const task of sortTasks(tasks)){
    const project=S.projects.find(p=>p.id===task.projectId),key=project?.id||'__unattached__';
    if(!groups.has(key))groups.set(key,{project,tasks:[]});
    groups.get(key).tasks.push(task);
  }
  return [...groups.values()].map(({project,tasks})=>{
    const unattached=!project, title=project?.name||(tasks.every(t=>t.fixed)?'固定安排':tasks.every(t=>t.type==='临时')?'临时任务':'其他安排'), sub=project?`Owner · ${nameOf(project.owner)} · ${projectStatus(project)}`:tasks.every(t=>t.fixed)?'按周期自动生成':tasks.every(t=>t.type==='临时')?'不属于任何项目':'历史记录', done=tasks.filter(t=>t.status==='done').length;
    return `<section class="daily-project-card ${unattached?'unattached-project':''}" data-project="${escapeHTML(project?.id||'')}"><div class="daily-project-heading"><div><span class="daily-project-kicker">${unattached?'安排':'项目'}</span><h3>${escapeHTML(title)}</h3></div><span class="daily-project-meta">${escapeHTML(sub)} · ${done}/${tasks.length} 已完成</span></div><div class="daily-project-tasks">${tasks.map(taskCard).join('')}</div></section>`;
  }).join('');
}
function bindTaskCards(root){$$(root+' .task-card').forEach(e=>{e.onclick=()=>openDrawer(e.dataset.id);e.onkeydown=x=>{if(x.key==='Enter')openDrawer(e.dataset.id)}})}
function renderDayTab(day){const tab=$('#dayTab');if(!tab)return;const d=new Date(`${day}T12:00:00`),n=String(d.getDate());if($('#dayTabDay').textContent!==n){tab.classList.remove('turn');void tab.offsetWidth;tab.classList.add('turn')}$('#dayTabMonth').textContent=`${d.getMonth()+1}月`;$('#dayTabDay').textContent=n;$('#dayTabWeek').textContent=wd(day);tab.classList.toggle('is-today',day===S.today);const h=$('#todayView h1');if(h)h.textContent=day===S.today?'今天做什么？':day===add(S.today,1)?'明天做什么？':day===add(S.today,-1)?'昨天做了什么？':'这一天的安排'}
function renderToday(){const day=displayDay(),deferredView=UI.filter==='deferred';renderStats(day);renderDayTab(day);$('#todayLabel').textContent=deferredView?'递延任务':`${wd(day)} · ${fmt(day)}`;$('#dateChip').textContent=deferredView?'全部日期':fmt(day);$$('.quick-tab').forEach(b=>b.classList.toggle('active',b.dataset.filter===UI.filter));let ts=(deferredView?scheduleTasks(true):scheduleTasks().filter(t=>taskActiveOn(t,day)));if(UI.filter==='open')ts=ts.filter(t=>!isArchivedTask(t)&&t.status!=='done');if(UI.filter==='done')ts=ts.filter(t=>t.status==='done');if(UI.filter==='P0')ts=ts.filter(t=>t.priority==='P0');if(UI.filter==='inprogress')ts=ts.filter(t=>t.status==='doing');if(deferredView)ts=ts.filter(t=>isSuperseded(t)||t.status==='deferred');const emptyCopy=UI.filter==='inprogress'?['暂无进行中的任务','']:deferredView?['暂无递延记录','']:['今天没有待处理任务',''];$('#todayEmptyTitle').textContent=emptyCopy[0];$('#todayEmptyHint').textContent=emptyCopy[1];$('#todayTaskList').innerHTML=dailyTaskGroups(ts);$('#todayEmpty').classList.toggle('hidden',ts.length>0);bindTaskCards('#todayTaskList')}
/* ---------------------------------------------------------------------------
   周视图 · one week at a time. Seven ruled columns list each day's tasks
   outright; the arrows (or ← →) turn the page. Nothing hides behind a hover.
   ------------------------------------------------------------------------- */
const WEEK_DAY_LIMIT=6;
function weekLabel(off){
  if(off===0)return '本周';if(off===-1)return '上周';if(off===1)return '下周';
  return off>0?`${off} 周后`:`${-off} 周前`;
}
function weekTaskChip(t,iso){
  const cont=iso>t.date,[c,l]=status(t);
  const meta=cont?`续 · ${nameOf(t.assignee)}`:`${escapeHTML(t.time||'09:00')} · ${nameOf(t.assignee)}`;
  return `<button class="week-task ${escapeHTML(t.priority)} ${c}${cont?' cont':''}" type="button" data-id="${escapeHTML(t.id)}" title="${escapeHTML(`${t.name} · ${nameOf(t.assignee)} · ${l}`)}">`
    +`<span class="week-task-name">${escapeHTML(t.name)}</span>`
    +`<span class="week-task-meta">${escapeHTML(meta)}${!cont&&isMultiDay(t)?` · ${spanDays(t)} 天`:''}</span></button>`;
}
function weekDayColumn(iso,tasks,admin){
  const today=iso===S.today,past=iso<S.today,out=iso>DATE_HORIZON,day=sortTasks(tasks.filter(t=>taskActiveOn(t,iso)));
  const shown=day.slice(0,WEEK_DAY_LIMIT),more=day.length-shown.length,done=day.filter(t=>t.status==='done').length;
  return `<section class="week-day${today?' today':''}${past?' past':''}${out?' out':''}" data-date="${iso}">`
    +`<header class="week-day-head"><button class="week-day-open" type="button" data-date="${iso}" aria-label="${escapeHTML(`${wd(iso)} ${fmt(iso)}，${day.length} 项任务`)}"><span>${wd(iso)}</span><strong>${new Date(`${iso}T12:00:00`).getDate()}</strong>${today?'<em>今天</em>':''}</button>`
    +`${day.length?`<small>${done}/${day.length}</small>`:''}</header>`
    +`<div class="week-day-tasks">${shown.map(t=>weekTaskChip(t,iso)).join('')}`
    +`${more>0?`<button class="week-day-more" type="button" data-date="${iso}">还有 ${more} 项</button>`:''}</div>`
    +`${admin&&!out?`<button class="week-day-add" type="button" data-date="${iso}" aria-label="在 ${escapeHTML(fmt(iso))} 新增任务">${icon('plus')}</button>`:''}</section>`;
}
function renderCalendar(){
  const horizon=weekOffsetFor(DATE_HORIZON);
  UI.selectedWeek=Math.min(UI.selectedWeek||0,horizon);
  const days=week(UI.selectedWeek),tasks=scheduleTasks(),admin=Boolean(S.user?.admin);
  const inWeek=tasks.filter(t=>days.some(d=>taskActiveOn(t,d))),done=inWeek.filter(t=>t.status==='done').length;
  $('#weekRangeLabel').textContent=`${weekLabel(UI.selectedWeek)} · ${fmt(days[0])} — ${fmt(days[6])} · ${inWeek.length} 项任务${inWeek.length?` · 完成 ${done}`:''}`;
  $('#backTodayBtn').classList.toggle('is-current',UI.selectedWeek===0);
  $('#nextWeekBtn').disabled=UI.selectedWeek>=horizon;
  const board=$('#weekCarousel');
  board.dataset.turn=UI.weekDir||'';UI.weekDir='';
  board.innerHTML=`<div class="week-grid">${days.map(iso=>weekDayColumn(iso,tasks,admin)).join('')}</div>`;
  $$('#weekCarousel .week-task').forEach(b=>b.onclick=()=>openDrawer(b.dataset.id));
  $$('#weekCarousel .week-day-open, #weekCarousel .week-day-more').forEach(b=>b.onclick=()=>renderDayDetail(b.dataset.date));
  $$('#weekCarousel .week-day-add').forEach(b=>b.onclick=()=>newTask(null,b.dataset.date));
  /* On a tablet the board scrolls sideways; open it with today in the middle. */
  const today=board.querySelector('.week-day.today');
  if(board.scrollWidth>board.clientWidth)board.scrollLeft=today?today.getBoundingClientRect().left-board.getBoundingClientRect().left+board.scrollLeft-(board.clientWidth-today.offsetWidth)/2:0;
}
function turnWeek(step){
  if(step>0&&UI.selectedWeek>=weekOffsetFor(DATE_HORIZON)){toast(`日期范围目前只支持到 ${DATE_HORIZON}`);return}
  UI.weekDir=step>0?'next':'prev';UI.selectedWeek=(UI.selectedWeek||0)+step;
  renderScheduleScope();renderCalendar();
}
function renderDayDetail(iso){UI.detailDate=iso;switchView('dayDetail')}
function renderDayContent(){
  const iso=UI.detailDate||displayDay();
  $('#dayDetailKicker').textContent=`${wd(iso)} · ${fmt(iso)}`;
  const tasks=scheduleTasks().filter(t=>taskActiveOn(t,iso));
  const add=S.user?.admin?`<button class="secondary-btn calendar-add-task" data-date="${iso}">${icon('plus')}在此日期新增任务</button>`:'';
  $('#dayDetailContent').innerHTML=add+(dailyTaskGroups(tasks)||'<div class="empty-state"><div class="empty-icon">—</div><h3>这一天还没有安排</h3></div>');
  bindTaskCards('#dayDetailContent');
  $('#dayDetailContent .calendar-add-task')?.addEventListener('click',()=>newTask(null,iso));
}
/* Log kinds are storage keys; the drawer reads them back in people's words. */
const LOG_LABELS={start:'开始任务',auto_start:'到点自动开始',complete:'完成任务',complete_pending:'提交完成审批',defer:'未完成，递延',skip:'跳过本次',edit_request:'申请修改任务',task_approval_superseded:'审批由后续任务接续',complete_edit:'修改完成记录',reopen:'被打回'};
function logLine(x){
  if(x.kind==='adjust')return `指派调整：${nameOf(x.before?.assignee)} → ${nameOf(x.after?.assignee)}`;
  if(x.kind==='approval'||x.kind==='edit_approval'){const verdict=x.decision==='approved'?'通过':x.decision==='rejected'?'驳回':'';return `${x.kind==='approval'?'完成审批':'修改审批'}${verdict}${x.reason?` · ${x.reason}`:''}`}
  const detail=x.summary||x.reason||x.remaining||'';
  return `${LOG_LABELS[x.kind]||x.kind}${detail?` · ${detail}`:''}`;
}
function logTime(iso){const m=String(iso||'').match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/);return m?`${Number(m[1])}月${Number(m[2])}日 ${m[3]}`:''}
function openDrawer(id){
  const t=S.tasks.find(x=>x.id===id);if(!t)return;
  const [c,l]=status(t),p=S.projects.find(p=>p.id===t.projectId),archived=['done','deferred','skipped'].includes(t.status),pendingApproval=['pending_approval','awaiting_approval','submitted'].includes(t.status),rejected=['rejected','returned'].includes(t.status),lineageIds=taskLineageIds(t);
  const manage=canManageProject(p)&&p.status==='active'&&!archived&&!pendingApproval&&!rejected,perform=!S.user.admin&&!archived&&t.assignee===S.user.id;
  const editPending=taskEditPending(t),editRequest=taskEditRequest(t),ownTemp=!t.projectId&&t.creator===S.user.id&&t.assignee===S.user.id,canRequestEdit=perform&&!S.user.admin&&!ownTemp&&!editPending&&!['done','deferred','skipped','pending_approval','awaiting_approval','submitted'].includes(t.status)&&(!p||p.status==='active');
  const editReviewer=editRequest?.approver===S.user.id;
  /* A finished task needs no sign-off. Its assignee can still correct the
     record, and the Owner or an admin can send it back with a reason. */
  const settled=t.status==='done'&&!t.carriedCompletion&&!isSuperseded(t)&&(!p||p.status==='active');
  const canEditCompletion=settled&&!S.user.admin&&t.assignee===S.user.id,canReopen=settled&&(p?canManageProject(p):Boolean(S.user.admin));
  const completionActions=canEditCompletion||canReopen?`<div class="drawer-actions">${canEditCompletion?`<button class="secondary-btn" id="editCompletion">${icon('edit')}修改完成记录</button>`:''}${canReopen?`<button class="secondary-btn" id="reopenTask">${icon('arrow-up-right')}打回</button>`:''}</div>`:'';
  const reopenNote=t.reopen&&['todo','doing'].includes(t.status)?`<p class="rejection-note">${escapeHTML(nameOf(t.reopen.by))} 打回：${escapeHTML(t.reopen.reason||'')}</p>`:'';
  const editReviewActions=editPending&&editReviewer?`<div class="drawer-actions approval-actions"><button class="primary-btn" id="approveEditRequest">${icon('check')}同意修改</button><button class="secondary-btn" id="rejectEditRequest">驳回修改申请</button></div>`:'';
  const completionLogs=S.logs.filter(x=>x.taskId===t.id&&['complete','complete_pending'].includes(x.kind)),latestCompletion=completionLogs[completionLogs.length-1],completionSummary=t.completionSummary||latestCompletion?.summary||t.approval?.summary,completionActual=t.completionActual||latestCompletion?.actual;
  const rejection=t.rejection||t.approval?.reason;
  const actionCopy=pendingApproval?`<p class="muted approval-pending-note">等待 ${escapeHTML(nameOf(t.approval?.approver||p?.owner||'superadmin'))} 审批</p>`:editPending?`<p class="muted approval-pending-note">修改申请待 ${escapeHTML(nameOf(t.assignee===p?.owner?'superadmin':p?.owner||'superadmin'))} 审批</p>`:rejected?`<p class="rejection-note">任务已驳回${rejection?`：${escapeHTML(rejection)}`:''}</p>`:archived?`<p class="muted">${isSuperseded(t)?'已由后续任务接替':`${l} · 已归档`}</p>`:perform?`<div class="drawer-actions">${t.status==='todo'?`<button class="secondary-btn" id="startTask">${icon('play')}开始任务</button>`:''}<button class="primary-btn complete-btn" id="completeTask">${icon('check')}记录完成</button><button class="defer-btn" id="deferTask">${icon('arrow-up-right')}未完成，递延</button></div>`:'';
  const editSummary=editPending?renderEditRequestSummary(t):'';
  const canDelete=S.user.admin&&!t.fixed&&!t.repeatId&&!pendingApproval&&!rejected;
  $('#drawerContent').innerHTML=`<div class="drawer-kicker">${escapeHTML(projectName(t))} · ${escapeHTML(t.priority)}</div><h2 class="drawer-title">${escapeHTML(t.name)}</h2><p class="drawer-description">${escapeHTML(t.desc||'暂无描述')}</p>${completionSummary?`<div class="completion-summary"><span>${reopenNote?'上次完成总结':'最新完成总结'}</span><p>${escapeHTML(completionSummary)}${completionActual?` · 实际 ${completionActual} 分钟`:''}</p></div>`:''}${reopenNote}${editSummary}<div class="detail-grid"><div><span>状态</span><strong><i class="status-dot ${c}"></i>${l}</strong></div><div><span>预计时长</span><strong>${t.duration} 分钟</strong></div><div><span>${isMultiDay(t)?`任务周期 · ${spanDays(t)} 天`:'安排日期'}</span><strong>${escapeHTML(t.date)}${isMultiDay(t)?` → ${escapeHTML(taskEnd(t))}`:''}</strong></div><div><span>DDL</span><strong class="${t.status==='done'?'':daysCount(S.today,taskEnd(t))<0?'overdue-text':''}">${escapeHTML(ddlText(t))}</strong></div><div><span>负责人</span><strong>${escapeHTML(nameOf(t.assignee))}</strong></div></div>${canRequestEdit?'<button class="secondary-btn edit-task-request-btn" id="requestTaskEdit">申请修改任务</button>':''}${(S.user.admin||(perform&&ownTemp))&&!editPending&&!['done','deferred','skipped','pending_approval','awaiting_approval','submitted','rejected'].includes(t.status)&&(!p||p.status==='active')?'<button class="secondary-btn edit-task-request-btn" id="directTaskEdit">直接调整任务</button>':''}${manage?'<button class="secondary-btn" id="adjustTaskAssignment">调整任务指派</button>':''}${canDelete?'<button class="secondary-btn danger-btn" id="deleteTask">删除此任务</button>':''}<div class="history"><h3>任务记录</h3>${S.logs.filter(x=>lineageIds.has(x.taskId)).map(x=>`<div class="history-item"><i></i><span>${escapeHTML(logLine(x))}</span><small>${escapeHTML([nameOf(x.actor),logTime(x.createdAt)].filter(Boolean).join(' · '))}</small></div>`).join('')||'<div class="history-item"><i></i><span>暂无记录</span></div>'}</div>${actionCopy}${completionActions}${editReviewActions}`;
  $('#taskDrawer').classList.remove('hidden');$('#startTask')?.addEventListener('click',()=>act('task.start',{id:t.id}).then(()=>closeDrawer()).catch(()=>{}));$('#completeTask')?.addEventListener('click',()=>complete(t));$('#deferTask')?.addEventListener('click',()=>defer(t));$('#requestTaskEdit')?.addEventListener('click',()=>editTaskRequest(id));$('#directTaskEdit')?.addEventListener('click',()=>editTaskRequest(id,true));$('#adjustTaskAssignment')?.addEventListener('click',()=>editTaskAssignment(id));$('#deleteTask')?.addEventListener('click',async()=>{if(!confirm(`确认删除「${t.name}」？删除后将从日历移除。`))return;try{await act('task.delete',{id:t.id});closeDrawer()}catch(e){}});$('#editCompletion')?.addEventListener('click',()=>editCompletion(t));$('#reopenTask')?.addEventListener('click',()=>reopenTask(t));$('#approveEditRequest')?.addEventListener('click',()=>reviewTaskEdit(t.id,true));$('#rejectEditRequest')?.addEventListener('click',()=>reviewTaskEdit(t.id,false));
}
function taskEditRequest(t){
  if(!t)return null;
  const embedded=t.editRequest||t.edit_request||t.changeRequest;
  if(embedded)return embedded;
  return (S.editRequests||[]).filter(r=>r.taskId===t.id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).find(Boolean)||null;
}
function taskEditPending(t){const r=taskEditRequest(t);return Boolean(r&&(r.status==='pending'||r.state==='pending'))}
function renderEditRequestSummary(t){const r=taskEditRequest(t);if(!r)return '';const c=r.changes||r.requested||{};const labels={name:'名称',desc:'描述',date:'日期',deadline:'期限',duration:'时长',priority:'优先级',assignee:'负责人'};const rows=Object.entries(labels).filter(([k])=>c[k]!==undefined&&String(c[k])!==String(t[k]??'')).map(([k,label])=>`<li><b>${label}</b><span>${escapeHTML(String(c[k]))}</span></li>`).join('');const state=r.status==='approved'?'修改已通过':r.status==='rejected'?'修改申请已驳回':'待审批的修改申请';return `<div class="edit-request-summary"><strong>${state}</strong><small>申请人：${escapeHTML(r.requester||r.requestedBy||t.assignee)}${r.reason?` · 理由：${escapeHTML(r.reason)}`:''}${r.rejection?` · 驳回建议：${escapeHTML(r.rejection)}`:''}</small>${rows?`<ul>${rows}</ul>`:''}</div>`}
const FEELINGS=['顺利','一般','困难','阻塞'];
function completionFields(summary='',actual=30,feeling='顺利'){return `<label class="form-field">完成总结<textarea id="doneText">${escapeHTML(summary)}</textarea></label><label class="form-field">实际耗时（分钟）<input id="actualMins" type="number" min="1" max="1440" value="${Number(actual)||30}"></label><label class="form-field">工作感受<select id="feeling">${FEELINGS.map(f=>`<option ${f===feeling?'selected':''}>${f}</option>`).join('')}</select></label>`}
function editCompletion(t){
  openModal(`<div class="eyebrow">完成记录 · ${escapeHTML(t.name)}</div><h2>修改完成记录</h2>${completionFields(t.completionSummary||'',t.completionActual||t.duration,t.completionFeeling||'顺利')}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmCompletionEdit">保存修改</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmCompletionEdit').onclick=async()=>{const summary=$('#doneText').value.trim();if(!summary){toast('请填写完成总结');return}try{await act('task.completion.update',{id:t.id,summary,actual:Number($('#actualMins').value),feeling:$('#feeling').value});closeModal();closeDrawer();toast('完成记录已更新')}catch(e){}};
}
function reopenTask(t){
  openModal(`<div class="eyebrow">${escapeHTML(projectName(t))} · 打回</div><h2>打回「${escapeHTML(t.name)}」</h2><p>任务回到 ${escapeHTML(nameOf(t.assignee))} 的待办${t.date<S.today?'，排到今天':''}，并通知对方。</p><label class="form-field">打回原因<textarea id="reopenReason" placeholder="哪里还需要补充"></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmReopen">打回并通知</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmReopen').onclick=async()=>{const reason=$('#reopenReason').value.trim();if(!reason){toast('请填写打回原因');return}try{await act('task.reopen',{id:t.id,reason});closeModal();closeDrawer();toast('任务已打回')}catch(e){}};
}
function complete(t){openModal(`<div class="eyebrow">完成记录 · ${escapeHTML(t.name)}</div><h2>记录完成</h2><label class="form-field">完成总结<textarea id="doneText" ></textarea></label><label class="form-field">实际耗时（分钟）<input id="actualMins" type="number" value="${t.duration}"></label><label class="form-field">工作感受<select id="feeling"><option>顺利</option><option>一般</option><option>困难</option><option>阻塞</option></select></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmComplete">确认完成</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmComplete').onclick=async()=>{try{await api('/api/action',{action:'task.complete',data:{id:t.id,summary:$('#doneText').value||'完成任务',actual:Number($('#actualMins').value),feeling:$('#feeling').value}});closeModal();closeDrawer();await refresh();toast('任务已完成')}catch(e){toast(e.message)}}}
function editTaskRequest(id,direct=false){
  const t=S.tasks.find(x=>x.id===id),p=S.projects.find(x=>x.id===t?.projectId);if(!t)return;
  const pool=p?projectAssignees(p):S.user.admin?S.users.filter(u=>u.active&&!u.admin):S.users.filter(u=>u.id===S.user.id);
  // Keep the current assignee selectable so saving other fields never silently reassigns the task.
  const users=pool.some(u=>u.id===t.assignee)?pool:[...S.users.filter(u=>u.id===t.assignee),...pool];
  const minDate=p?.start||S.today,maxDate=p?.end? (p.end<DATE_HORIZON?p.end:DATE_HORIZON):DATE_HORIZON;
  openModal(`<div class="eyebrow">${escapeHTML(projectName(t))} · 任务修改</div><h2>${direct?'直接调整任务':'申请修改任务'}</h2>${direct?'':`<p>审批人：${escapeHTML(nameOf(p?.owner||'superadmin'))}</p>`}<label class="form-field">任务名称<input id="editTaskName" maxlength="120" value="${escapeHTML(t.name)}"></label><label class="form-field">任务描述<textarea id="editTaskDesc">${escapeHTML(t.desc||'')}</textarea></label><div class="task-form-grid"><label class="form-field">安排日期<input id="editTaskDate" type="date" min="${escapeHTML(minDate)}" ${maxDate?`max="${escapeHTML(maxDate)}"`:''} value="${escapeHTML(t.date||S.today)}"></label><label class="form-field">截止时间<input id="editTaskDeadline" type="date" min="${escapeHTML(minDate)}" ${maxDate?`max="${escapeHTML(maxDate)}"`:''} value="${escapeHTML(t.deadline||t.date||'')}"></label><label class="form-field">预计时长<input id="editTaskDuration" type="number" min="1" max="1440" value="${Number(t.duration)||30}"></label><label class="form-field">优先级<select id="editTaskPriority"><option ${t.priority==='P0'?'selected':''}>P0</option><option ${t.priority==='P1'?'selected':''}>P1</option><option ${t.priority==='P2'?'selected':''}>P2</option></select></label></div><label class="form-field">协作人 / 负责人<select id="editTaskAssignee">${users.map(u=>`<option value="${escapeHTML(u.id)}" ${u.id===t.assignee?'selected':''}>${escapeHTML(u.id)}${p&&u.id===p.owner?' · Owner':''}</option>`).join('')}</select></label><label class="form-field">修改理由<textarea id="editTaskReason" required ></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmTaskEdit">${direct?'保存调整':'提交修改申请'}</button></div>`);
  if(direct)$('#editTaskReason')?.closest('label')?.remove();
  $('#cancelAction').onclick=closeModal;
  $('#confirmTaskEdit').onclick=async()=>{const reason=$('#editTaskReason')?.value.trim()||'',name=$('#editTaskName').value.trim(),date=$('#editTaskDate').value,deadline=$('#editTaskDeadline').value;if(!name){toast('请填写任务名称');return}if(!direct&&!reason){toast('请填写修改理由');return}if(deadline&&date&&deadline<date){toast('截止时间不能早于安排日期');return}const changes={name,desc:$('#editTaskDesc').value,date,deadline,duration:Number($('#editTaskDuration').value),priority:$('#editTaskPriority').value,assignee:$('#editTaskAssignee').value};try{if(direct){await act('task.update',{id,...changes});closeModal();closeDrawer();toast('任务已直接调整')}else{await act('task.edit_request',{id,changes,reason});closeModal();closeDrawer();toast('修改申请已发送，等待审批')}}catch(e){}};
}
function reviewTaskEdit(id,accept,notificationId){
  const r=(S.editRequests||[]).find(x=>x.id===id)||S.editRequests?.find(x=>x.taskId===id&&x.status==='pending'),t=S.tasks.find(x=>x.id===r?.taskId);if(!t||!r)return;
  if(accept){(async()=>{try{await act('task.edit_review',{id:r.id,accept:true});if(notificationId)await act('inbox.read',{id:notificationId});closeModal();closeDrawer();toast('任务修改已批准')}catch(e){}})();return}
  openModal(`<div class="eyebrow">任务修改审批 · 驳回</div><h2>驳回修改申请</h2><p>申请理由：${escapeHTML(r.reason||'未填写')}</p><label class="form-field">驳回建议<textarea id="editRejectReason" placeholder="请说明需要如何调整"></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmEditReject">驳回并通知</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmEditReject').onclick=async()=>{const reason=$('#editRejectReason').value.trim();if(!reason){toast('请填写驳回建议');return}try{await act('task.edit_review',{id:r.id,accept:false,reason});if(notificationId)await act('inbox.read',{id:notificationId});closeModal();closeDrawer()}catch(e){}};
}
function defer(t){openModal(`<div class="eyebrow">未完成 · 递延预览</div><h2>先说说卡在哪里</h2><label class="form-field">原因<select id="deferReason"><option>时间不足</option><option>等待他人</option><option>需求变化</option><option>遇到阻塞</option><option>其他</option></select></label><label class="form-field">剩余工作<textarea id="remainText"></textarea></label><label class="form-field">递延到<input id="deferDate" type="date" max="${DATE_HORIZON}" value="${add(t.date,1)}"></label><label class="form-field">剩余时长<input id="remainMins" type="number" value="${Math.max(15,Math.round(t.duration/2))}"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">返回修改</button><button class="primary-btn" id="confirmDefer">确认递延</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmDefer').onclick=async()=>{try{await api('/api/action',{action:'task.defer',data:{id:t.id,reason:$('#deferReason').value,remaining:$('#remainText').value||'继续完成原任务',date:$('#deferDate').value,duration:Number($('#remainMins').value)}});closeModal();closeDrawer();await refresh();toast('任务已递延')}catch(e){toast(e.message)}}}
function diaryReport(author,day){
  return (S.diaries||[]).find(r=>r.author===author&&r.date===day)||(S.reports||[]).filter(r=>r.author===author&&r.date===day).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
}
function diaryWeekDays(){return week(UI.diaryWeek||0)}
function diaryDayStats(author,day){
  const saved=(S.diaryStats||[]).find(r=>r.userId===author&&r.date===day);if(saved)return saved;
  const tasks=S.tasks.filter(t=>t.assignee===author&&taskActiveOn(t,day)&&t.status!=='skipped'&&!isSuperseded(t)),done=tasks.filter(t=>t.status==='done');
  return {completed:done.length,total:tasks.length,load:done.reduce((n,t)=>n+(Number(t.duration)||0),0),loadRatio:tasks.length?done.length/tasks.length:0};
}
function diaryContent(author,day){
  const draft=UI.diaryDrafts?.[`${author}:${day}`];if(draft)return draft;
  const r=diaryReport(author,day);if(r)return typeof r.content==='string'?{done:r.content,risks:'',next:''}:r.content||{};
  const tasks=S.tasks.filter(t=>t.assignee===author&&taskActiveOn(t,day)&&t.status!=='skipped'&&!isSuperseded(t));
  return {done:tasks.filter(t=>t.status==='done').map(t=>'✓ '+t.name).join('\n'),risks:'',next:''};
}
function diaryDayCard(day,author){
  const r=diaryReport(author,day),c=diaryContent(author,day),stats=diaryDayStats(author,day),draft=UI.diaryDrafts?.[`${author}:${day}`];
  return `<button class="diary-day-card ${day===S.today?'today':''}" data-diary-date="${day}"><span class="diary-day-top"><b>${wd(day)}</b><strong>${fmt(day)}</strong></span><span class="diary-day-status">${draft?'有未保存编辑':r?(r.auto?'系统已统计':'已记录'):'待记录'} · ${stats.completed}/${stats.total} 项完成</span><span class="diary-day-preview">${escapeHTML(c.done??'')||'点击打开这一天的笔记本'}</span></button>`;
}
function diaryNotebook(author,day,admin=false){
  const r=diaryReport(author,day),c=diaryContent(author,day),stats=diaryDayStats(author,day),draft=UI.diaryDrafts?.[`${author}:${day}`],readonly=admin?' readonly':'';
  return `<div class="diary-notebook"><div class="notebook-toolbar"><button class="secondary-btn diary-back">← 返回${admin?'成员日记':''}周视图</button><div><span class="eyebrow">${escapeHTML(author)} · 日记本${admin?' · 只读':''}</span><h2>${wd(day)} · ${fmt(day)}</h2></div><span class="notebook-state">${draft?'未保存':r?(r.auto?'系统统计 · 可编辑':'已保存'):'未记录'}</span></div><div class="diary-date-nav"><button class="secondary-btn diary-prev-date">← 前一天</button><span>${escapeHTML(day)}</span><button class="secondary-btn diary-next-date">后一天 →</button></div><div class="notebook-paper"><div class="notebook-date">${fmt(day)}　${wd(day)}</div><label>今日完成<textarea id="diaryDone"${readonly} placeholder="${admin?'这一天尚未记录':'今天完成了什么？'}">${escapeHTML(c.done??'')}</textarea></label><label>未完成与阻塞<textarea id="diaryRisks"${readonly} placeholder="${admin?'暂无记录':'哪些事情被递延？原因是什么？'}">${escapeHTML(c.risks??'')}</textarea></label><label>明日计划<textarea id="diaryNext"${readonly} placeholder="${admin?'暂无记录':'明天最重要的工作'}">${escapeHTML(c.next??'')}</textarea></label><div class="notebook-footer"><span class="muted">${stats.completed}/${stats.total} 项任务完成 · 已完成任务预计 ${(stats.load/60).toFixed(1)}h</span>${admin?'':'<button class="primary-btn" id="saveDiaryBtn">保存日记</button>'}</div></div></div>`;
}
function renderDiaryAdmin(){
  const members=S.users.filter(u=>u.active&&!u.admin),day=UI.diaryLogDate||S.today;
  const logs=Array.isArray(S.workCompletions)?S.workCompletions.filter(l=>String(l.completedAt||'').slice(0,10)===day).map(l=>({label:`${l.kind==='project'?'项目':'任务'}完成 · ${l.name}`,user:l.assignee||l.owner,at:l.completedAt,project:l.projectName,taskId:l.taskId,projectId:l.projectId,kind:l.kind})):S.tasks.filter(t=>t.status==='done'&&String(t.completedAt||t.date||'').slice(0,10)===day).map(t=>({label:`任务完成 · ${t.name}`,user:t.assignee,at:t.completedAt||t.date,project:projectName(t),taskId:t.id,projectId:t.projectId,kind:'task'}));
  const rows=members.map(u=>{const stats=diaryDayStats(u.id,day),pct=stats.total?Math.round(stats.completed/stats.total*100):0;return `<div class="diary-load-row"><strong title="${escapeHTML(u.id)}">${escapeHTML(nameOf(u.id))}</strong><span>${stats.completed}/${stats.total} 项完成</span><div class="progress"><i style="width:${pct}%"></i></div><b>${pct}%</b></div>`}).join('');
  const projectRows=visibleProjects().filter(p=>p.status==='active').map(p=>{const ts=S.tasks.filter(t=>t.projectId===p.id&&t.status!=='skipped'&&!isSuperseded(t)),done=ts.filter(t=>t.status==='done').length,pct=ts.length?Math.round(done/ts.length*100):0;return `<div class="diary-project-progress"><strong>${escapeHTML(p.name)}</strong><span>${done}/${ts.length} 完成 · ${pct}%</span></div>`}).join('');
  $('#diaryWorkspace').innerHTML=`<div class="diary-admin"><div class="notebook-shelf-heading"><div><span class="eyebrow">SUPERADMIN · 成员笔记本</span><h2>笔记本展示柜</h2></div></div><div class="notebook-shelf">${members.map(u=>{const r=diaryReport(u.id,S.today);return `<button class="member-notebook" data-member="${escapeHTML(u.id)}"><span class="notebook-cover">${escapeHTML(String(nameOf(u.id)).slice(0,1))}</span><strong>${escapeHTML(nameOf(u.id))}</strong><small>${r?(r.auto?'今日系统已统计':'今日已记录'):'等待今日记录'}</small></button>`}).join('')||'<p class="muted">暂无成员笔记本。</p>'}</div><div class="diary-log-toolbar"><label>查看工作日期<input id="diaryLogDate" type="date" max="${DATE_HORIZON}" value="${escapeHTML(day)}"></label><button class="secondary-btn" id="diaryLogToday">返回今天</button></div><div class="diary-admin-grid"><div class="diary-log-panel"><div class="panel-heading"><div><h2>工作日志 · ${fmt(day)}</h2></div></div><div class="diary-log-list">${logs.length?logs.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).map(l=>`<button class="diary-log-item diary-log-button" data-task-id="${escapeHTML(l.taskId||'')}" data-project-id="${escapeHTML(l.projectId||'')}" data-log-kind="${escapeHTML(l.kind||'')}"><i></i><span>${escapeHTML(l.label)}${l.project?`<small class="diary-log-project">${escapeHTML(l.project)}</small>`:''}</span><small>${escapeHTML(l.user?nameOf(l.user):'')}　${icon('chevron-right')}</small></button>`).join(''):'<p class="muted">当日暂无已完成任务或项目。</p>'}</div><div class="diary-projects"><h3>项目当前进度</h3>${projectRows||'<p class="muted">暂无进行中的项目。</p>'}</div></div><div class="diary-load-panel"><div class="panel-heading"><div><h2>成员负载</h2></div></div>${rows||'<p class="muted">暂无成员数据。</p>'}</div></div></div>`;
  $$('.member-notebook').forEach(b=>b.onclick=()=>{UI.diaryAuthor=b.dataset.member;UI.diaryWeek=0;UI.diaryDate=null;renderSummary()});
  $('#diaryLogDate').onchange=e=>{if(e.target.value){UI.diaryLogDate=e.target.value;renderSummary()}};
  $('#diaryLogToday').onclick=()=>{UI.diaryLogDate=S.today;renderSummary()};
  $$('.diary-log-button').forEach(b=>b.onclick=()=>openWorkLogDetail(b.dataset.taskId,b.dataset.projectId,b.dataset.logKind));
}
function openWorkLogDetail(taskId,projectId,kind){
  if(kind==='task'&&taskId){openDrawer(taskId);return}
  const p=S.projects.find(x=>x.id===projectId)||((S.achievements||[]).find(x=>x.id===projectId));if(!p){toast('找不到对应项目详情');return}
  const tasks=Array.isArray(p.tasks)?p.tasks:S.tasks.filter(t=>t.projectId===p.id),done=tasks.filter(t=>t.status==='done').length;
  openModal(`<div class="eyebrow">项目完成记录</div><h2>${escapeHTML(p.name)}</h2><div class="detail-grid"><div><span>Owner</span><strong>${escapeHTML(p.owner)}</strong></div><div><span>状态</span><strong>${escapeHTML(projectStatus(p))}</strong></div><div><span>任务进度</span><strong>${done}/${tasks.length} 已完成</strong></div><div><span>完成时间</span><strong>${escapeHTML(p.completedAt||'')}</strong></div></div>${p.completionReport?`<div class="completion-summary"><span>结项报告</span><p>${escapeHTML(p.completionReport)}</p></div>`:''}<div class="history"><h3>项目子任务</h3>${tasks.map(t=>`<div class="history-item"><i></i><span>${escapeHTML(t.name)} · ${escapeHTML(status(t)[1])} · ${escapeHTML(t.assignee)}</span></div>`).join('')||'<div class="history-item"><i></i><span>暂无子任务</span></div>'}</div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">返回日志</button></div>`);
  $('#cancelAction').onclick=closeModal;
}
function openTodayDiary(){
  if(!S.user||S.user.admin)return;
  UI.diaryAuthor=S.user.id;UI.diaryDate=S.today;UI.diaryWeek=0;renderSummary();
}
function renderSummary(){
  const me=S.user;if(!me)return;
  if(UI.diaryViewer!==me.id){Object.assign(UI,{diaryViewer:me.id,diaryAuthor:me.admin?null:me.id,diaryWeek:0,diaryDate:null,diaryDrafts:{},diaryLogDate:S.today})}
  const todayButton=$('#generateSummaryBtn');todayButton.hidden=Boolean(me.admin);todayButton.onclick=openTodayDiary;
  if(me.admin&&!S.users.some(u=>u.id===UI.diaryAuthor&&u.active&&!u.admin)){UI.diaryAuthor=null;UI.diaryDate=null;renderDiaryAdmin();return}
  const author=me.admin?UI.diaryAuthor:me.id,days=diaryWeekDays().filter(d=>d<=DATE_HORIZON),day=UI.diaryDate;
  if(day){
    $('#diaryWorkspace').innerHTML=diaryNotebook(author,day,me.admin);
    $('#diaryWorkspace .diary-back').onclick=()=>{UI.diaryDate=null;renderSummary()};
    const changeDay=offset=>{const next=add(day,offset);if(next>DATE_HORIZON){toast(`日期范围目前只支持到 ${DATE_HORIZON}`);return}UI.diaryDate=next;UI.diaryWeek=Math.round((new Date(`${weekStart(UI.diaryDate)}T12:00:00`)-new Date(`${weekStart(S.today)}T12:00:00`))/604800000);renderSummary()};
    $('.diary-prev-date').onclick=()=>changeDay(-1);$('.diary-next-date').onclick=()=>changeDay(1);
    if(!me.admin){
      const key=`${author}:${day}`,readContent=()=>({done:$('#diaryDone').value,risks:$('#diaryRisks').value,next:$('#diaryNext').value});
      $$('#diaryWorkspace textarea').forEach(input=>input.oninput=()=>{UI.diaryDrafts[key]=readContent();$('.notebook-state').textContent='未保存'});
      $('#saveDiaryBtn').onclick=async()=>{const content=readContent(),button=$('#saveDiaryBtn');button.disabled=true;try{await act('diary.save',{date:day,content});delete UI.diaryDrafts[key];renderSummary();toast('日记已保存')}catch(e){button.disabled=false}};
    }
    return;
  }
  const stats=diaryDayStats(author,S.today);
  $('#diaryWorkspace').innerHTML=`<div class="diary-week">${me.admin?'<div><button class="secondary-btn diary-shelf-back">← 返回笔记本展示柜</button></div>':''}<div class="diary-week-toolbar"><div><span class="eyebrow">${escapeHTML(author)} · ${fmt(days[0])} — ${fmt(days.at(-1))}</span><h2>${me.admin?escapeHTML(author)+' 的日记':'我的日记'}周视图</h2></div><div class="diary-week-actions"><button class="secondary-btn diary-prev-week">← 上周</button><button class="secondary-btn diary-current-week">返回本周</button><button class="secondary-btn diary-next-week">下周 →</button></div></div><div class="diary-week-track">${days.map(d=>diaryDayCard(d,author)).join('')}</div><div class="diary-stat-strip"><span>今日完成 <b>${stats.completed}/${stats.total}</b></span><span>已完成任务预计时长 <b>${(stats.load/60).toFixed(1)}h</b></span><span>今日完成比例 <b>${Math.round((stats.loadRatio||0)*100)}%</b></span></div></div>`;
  $('.diary-prev-week').onclick=()=>{UI.diaryWeek=(UI.diaryWeek||0)-1;renderSummary()};$('.diary-next-week').onclick=()=>{if((UI.diaryWeek||0)>=weekOffsetFor(DATE_HORIZON)){toast(`日期范围目前只支持到 ${DATE_HORIZON}`);return}UI.diaryWeek=(UI.diaryWeek||0)+1;renderSummary()};$('.diary-current-week').onclick=()=>{UI.diaryWeek=0;renderSummary()};
  if(me.admin)$('.diary-shelf-back').onclick=()=>{UI.diaryAuthor=null;UI.diaryDate=null;renderSummary()};
  $$('.diary-day-card').forEach(b=>b.onclick=()=>{UI.diaryDate=b.dataset.diaryDate;renderSummary()});
}
function canManageProject(p){return Boolean(p&&(S.user?.admin||p.owner===S.user?.id))}
function projectAssignees(p){return S.users.filter(u=>u.active&&p?.members?.[u.id]==='accepted')}
function manageableProjects(){return S.projects.filter(p=>p.status==='active'&&canManageProject(p))}
function projectTasksComplete(p){
  if(!p||p.status!=='active')return false;
  const tasks=S.tasks.filter(t=>t.projectId===p.id&&!t.repeatId);
  if(!tasks.length)return false;
  const byId=new Map(tasks.map(t=>[t.id,t]));
  const groups=new Map();
  tasks.forEach(task=>{
    let root=task.id,parent=task.originId||task.reworkOf;const seen=new Set();
    while(parent&&byId.has(parent)&&!seen.has(parent)){
      seen.add(parent);root=parent;
      const parentTask=byId.get(parent);parent=parentTask.originId||parentTask.reworkOf;
    }
    if(!groups.has(root))groups.set(root,[]);groups.get(root).push(task);
  });
  const latest=[...groups.values()].map(chain=>chain.reduce((a,b)=>(`${b.date||''}${b.createdAt||''}`>=`${a.date||''}${a.createdAt||''}`?b:a)));
  return latest.length>0&&latest.every(t=>t.status==='done');
}
function requestProjectCompletion(id){
  const p=S.projects.find(x=>x.id===id);
  if(!p||!projectTasksComplete(p)){toast('请先完成并审批通过项目下的所有子任务');return}
  openModal(`<div class="eyebrow">${escapeHTML(p.name)} · 项目结项</div><h2>申请项目结项</h2><label class="form-field">结项报告<textarea id="projectCompletionReport" required maxlength="10000" ></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmProjectCompletion">提交结项审批</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmProjectCompletion').onclick=async()=>{const report=$('#projectCompletionReport').value.trim();if(!report){toast('请填写结项报告');return}try{await act('project.complete_request',{id,report});closeModal()}catch(e){}};
}
/* 项目任务排序. The mode is a per-browser view preference; the manual order
   itself is stored on the project so the whole team sees what the Owner
   arranged. It keys on the lineage root, so a deferral copy keeps its slot. */
const PROJECT_SORT_KEY='wc-project-sort';
const PROJECT_SORTS={priority:'按优先级',manual:'手动排序',start:'按开始时间',end:'按结束时间'};
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
        try{await api('/api/action',{action:'project.reorder',data:{id:tree.dataset.project,order:next}});await refresh();toast('任务顺序已保存')}catch(err){toast(err.message);renderProjects()}
      };
    });
  });
}
function renderProjects(){
  const admin=Boolean(S.user?.admin);
  const projects=visibleProjects();
  $('#projectsView .eyebrow').textContent=`${admin?'团队项目管理':'我的项目'} · ${projects.length} 个项目`;
  $('#projectsView h1').textContent=admin?'项目与任务管理':'我的项目与任务';
  $('#projectGrid').innerHTML=projects.map(p=>{
    const mode=projectSortMode(p),tasks=sortProjectTasks(p,S.tasks.filter(t=>t.projectId===p.id&&!t.repeatId&&!isSuperseded(t)),mode),done=tasks.filter(t=>t.status==='done').length;
    const fixed=(S.repeats||[]).filter(r=>r.projectId===p.id&&r.active!==false);
    const accepted=Object.entries(p.members||{}).filter(([,v])=>v==='accepted').map(([id])=>id),pending=Object.entries(p.members||{}).filter(([,v])=>v==='pending').map(([id])=>id);
    const manage=canManageProject(p)&&p.status==='active',hasSlot=S.users.some(u=>u.active&&!u.admin&&u.id!==p.owner&&!accepted.includes(u.id)&&(admin||!pending.includes(u.id)));
    const drag=manage&&mode==='manual'&&tasks.length>1,byId=new Map(S.tasks.map(t=>[t.id,t]));
    const sorter=tasks.length>1?`<select class="project-task-sort" data-project="${escapeHTML(p.id)}" aria-label="任务排序">${Object.entries(PROJECT_SORTS).map(([k,v])=>`<option value="${k}" ${k===mode?'selected':''}>${v}</option>`).join('')}</select>`:'';
    return `<article class="project-card project-node"><div class="project-node-heading"><div><div class="project-title"><h3>${escapeHTML(p.name)}</h3><span class="project-status">${projectStatus(p)}</span></div><p>${escapeHTML(p.desc||'暂无描述')}</p></div><div class="project-node-actions">${manage?`<button class="primary-btn add-project-task" data-project="${escapeHTML(p.id)}">${icon('plus')}新建并指派任务</button><button class="secondary-btn project-settings" data-id="${escapeHTML(p.id)}">项目设置</button>`:''}${manage&&hasSlot?`<button class="secondary-btn invite-members" data-id="${escapeHTML(p.id)}">${admin?'直接添加协作者':'邀请协作者'}</button>`:''}${p.status==='active'&&!manage&&(p.members||{})[S.user.id]==='accepted'?`<button class="ghost-btn leave-project" data-id="${escapeHTML(p.id)}">退出项目</button>`:''}${p.status==='pending'&&admin?`<button class="secondary-btn approve-project" data-id="${escapeHTML(p.id)}">审批项目</button>`:''}${p.status==='active'&&manage&&!admin&&projectTasksComplete(p)?`<button class="secondary-btn request-project-completion" data-id="${escapeHTML(p.id)}">申请项目结项</button>`:''}${p.status==='active'&&manage&&!admin&&!projectTasksComplete(p)?``:''}${p.status==='pending_completion'&&admin?`<button class="secondary-btn approve-project-completion" data-id="${escapeHTML(p.id)}">审批项目完成</button>`:''}${canManageProject(p)?`<button class="ghost-btn delete-project" data-id="${escapeHTML(p.id)}">删除项目</button>`:''}</div></div><div class="project-members"><span>Owner · ${escapeHTML(nameOf(p.owner))}　协作者：${accepted.filter(id=>id!==p.owner).map(id=>escapeHTML(nameOf(id))).join('、')||'暂无'}${pending.length?`　待确认：${pending.map(id=>escapeHTML(nameOf(id))).join('、')}`:''}</span><span>${canManageProject(p)?'项目':'我的任务'} ${done}/${tasks.length} 已完成 · 截止 ${escapeHTML(p.end||'未设置')}</span></div><div class="project-task-tree" data-project="${escapeHTML(p.id)}"><div class="project-tree-label">${canManageProject(p)?'项目任务':'分配给我的任务'} <span>${tasks.length}</span>${sorter}</div>${tasks.map(t=>`<div class="project-child-row"${drag?` draggable="true" data-root="${escapeHTML(taskRootId(t,byId))}"`:''}>${drag?'<span class="drag-handle" aria-hidden="true">⋮⋮</span>':''}<button class="project-task-open" data-id="${escapeHTML(t.id)}"><span class="priority ${escapeHTML(t.priority)}">${escapeHTML(t.priority)}</span><strong>${escapeHTML(t.name)}</strong><span class="child-assignee" title="${escapeHTML(t.assignee)}">${escapeHTML(nameOf(t.assignee))}</span><span class="child-date">${escapeHTML(fmt(t.date))}</span><span>${status(t)[1]}</span><span aria-hidden="true">${icon('chevron-right')}</span></button>${manage&&['todo','doing'].includes(t.status)?`<button class="ghost-btn assign-project-task" data-id="${escapeHTML(t.id)}">调整指派</button>`:''}</div>`).join('')||`<p class="project-task-empty">${p.status==='pending'?'待审批':'暂无任务'}</p>`}${fixed.length?`<div class="project-tree-label">固定任务 <span>${fixed.length}</span></div>${fixed.map(r=>`<div class="project-fixed-row"><strong>${escapeHTML(r.name)}</strong><small>${escapeHTML(repeatPattern(r))} · ${escapeHTML(r.time||'09:00')} · ${escapeHTML((r.assignees||[]).map(nameOf).join('、'))}${r.end?` · 至 ${escapeHTML(r.end)}`:''}</small></div>`).join('')}`:''}</div></article>`;
  }).join('')||'<div class="empty-state">暂无项目</div>';
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
/* Name, dates and Owner of a running project. Collaborators keep their own
   dialog, reached from here, because adding and removing people notifies them. */
function projectSettings(projectId){
  const p=S.projects.find(x=>x.id===projectId),admin=Boolean(S.user?.admin);
  if(!canManageProject(p)||p.status!=='active'){toast('只有项目 Owner 或 superadmin 可设置进行中的项目');return}
  const owners=S.users.filter(u=>u.active&&!u.admin||u.id===p.owner);
  const accepted=Object.entries(p.members||{}).filter(([id,v])=>v==='accepted'&&id!==p.owner).map(([id])=>nameOf(id));
  openModal(`<div class="eyebrow">${escapeHTML(p.name)} · 项目设置</div><h2>项目设置</h2><label class="form-field">项目名称<input id="settingsName" maxlength="120" value="${escapeHTML(p.name)}"></label><label class="form-field">项目描述<textarea id="settingsDesc">${escapeHTML(p.desc||'')}</textarea></label><div class="project-date-fields"><label class="form-field">开始日期<input id="settingsStart" type="date" max="${DATE_HORIZON}" value="${escapeHTML(p.start||S.today)}"></label><label class="form-field">截止日期（可留空）<input id="settingsEnd" type="date" min="${escapeHTML(p.start||S.today)}" max="${DATE_HORIZON}" value="${escapeHTML(p.end||'')}"></label></div>${admin?`<label class="form-field">项目 Owner<select id="settingsOwner">${owners.map(u=>`<option value="${escapeHTML(u.id)}" ${u.id===p.owner?'selected':''}>${escapeHTML(u.id)}</option>`).join('')}</select></label>`:`<p class="muted">Owner · ${escapeHTML(nameOf(p.owner))}（更换 Owner 需联系管理员）</p>`}<div class="form-field">协作者<p class="muted">${escapeHTML(accepted.join('、')||'暂无')}</p><button type="button" class="secondary-btn" id="settingsMembers">管理协作者</button></div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmSettings">保存设置</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#settingsStart').onchange=()=>$('#settingsEnd').min=$('#settingsStart').value;
  $('#settingsMembers').onclick=()=>inviteCollaborators(p.id);
  $('#confirmSettings').onclick=async()=>{
    const name=$('#settingsName').value.trim(),start=$('#settingsStart').value,end=$('#settingsEnd').value;
    if(!name||!start){toast('请填写项目名称和开始日期');return}
    if(end&&end<start){toast('截止日期不能早于开始日期');return}
    const data={id:p.id,name,desc:$('#settingsDesc').value,start,end:end||null,cycle:end?'range':'infinite'};
    if(admin)data.owner=$('#settingsOwner').value;
    try{await act('project.update',data);closeModal();toast('项目设置已保存')}catch(e){}
  };
}
function deleteProject(projectId){
  const p=S.projects.find(x=>x.id===projectId);
  if(!p)return;
  if(!canManageProject(p)){toast('只有项目 Owner 或 superadmin 可删除项目');return}
  const tasks=S.tasks.filter(t=>t.projectId===p.id),done=tasks.filter(t=>t.status==='done').length;
  const members=Object.entries(p.members||{}).filter(([,v])=>v==='accepted').map(([id])=>id);
  openModal(`<div class="eyebrow danger-eyebrow">危险操作 · 不可撤销</div><h2>删除项目「${escapeHTML(p.name)}」</h2><div class="danger-panel"><p>删除后无法恢复。</p><ul class="danger-impact"><li>子任务 <strong>${tasks.length}</strong> 项（已完成 ${done} 项）</li><li>参与成员 <strong>${members.length}</strong> 人</li><li>相关报告、申请与通知将一并清除</li></ul></div><label class="danger-check"><input type="checkbox" id="deleteAck"> 我已了解该项目及全部子任务将被永久删除，且无法恢复</label><label class="danger-confirm">请输入项目名称 <code>${escapeHTML(p.name)}</code> 以继续<input id="deleteConfirmText" autocomplete="off" spellcheck="false" placeholder="${escapeHTML(p.name)}"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="danger-btn" id="confirmDeleteProject" disabled>永久删除项目</button></div>`);
  const ack=$('#deleteAck'),text=$('#deleteConfirmText'),btn=$('#confirmDeleteProject');
  const sync=()=>{btn.disabled=!(ack.checked&&text.value.trim()===p.name)};
  ack.onchange=sync;text.oninput=sync;
  $('#cancelAction').onclick=closeModal;
  btn.onclick=async()=>{
    if(btn.disabled)return;
    btn.disabled=true;btn.textContent='正在删除…';
    try{await act('project.delete',{id:p.id,confirm:text.value.trim()});closeModal();toast('项目已删除')}
    catch(e){btn.disabled=false;btn.textContent='永久删除项目'}
  };
}
/* Leaving a project is leaving its workspace: there is no separate membership
   to cancel, the channel simply stops being yours. */
function leaveProject(projectId){
  const p=S.projects.find(x=>x.id===projectId);if(!p)return;
  openModal(`<div class="eyebrow">${escapeHTML(p.name)} · 退出项目</div><h2>退出这个项目？</h2>`
    +`<div class="modal-footer"><button class="secondary-btn" id="cancelAction">再想想</button>`
    +`<button class="primary-btn" id="confirmLeaveProject">确认退出</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmLeaveProject').onclick=async()=>{
    try{
      await act('project.member.remove',{id:projectId,member:S.user.id});
      if(chatChannel===projectId)chatChannel='general';
      closeModal();toast('已退出「'+p.name+'」');
    }catch(e){}
  };
}
function inviteCollaborators(projectId){
  const p=S.projects.find(x=>x.id===projectId),admin=Boolean(S.user?.admin),existing=p?.members||{};
  if(!canManageProject(p)||p.status!=='active'){toast('只有项目 Owner 或 superadmin 可管理进行中的项目');return}
  const candidates=S.users.filter(u=>u.active&&!u.admin&&u.id!==p.owner&&existing[u.id]!=='accepted'&&(admin||existing[u.id]!=='pending'));
  const current=Object.entries(existing).filter(([id,v])=>v==='accepted'&&id!==p.owner).map(([id])=>id);
  openModal(`<div class="eyebrow">${escapeHTML(p.name)} · ${admin?'管理员直接指派':'Owner 协作邀请'}</div><h2>${admin?'直接添加协作者':'邀请协作者'}</h2><fieldset class="member-checkboxes" id="currentMembers"><legend>当前协作者（${current.length}）</legend>${current.map(id=>`<div class="member-row"><strong>${escapeHTML(nameOf(id))}</strong><small>${escapeHTML(id)} · 时间范围内 <b>${memberTaskCount(id,p)}</b> 项任务</small><button type="button" class="ghost-btn remove-member" data-member="${escapeHTML(id)}">移出</button></div>`).join('')||'<p class="muted">还没有协作者</p>'}</fieldset><div class="member-checkboxes">${candidates.map(u=>`<label><input type="checkbox" name="inviteMember" value="${escapeHTML(u.id)}"> <strong>${escapeHTML(u.id)}</strong><small>${existing[u.id]==='pending'?'当前待确认 · 可直接加入':'成员'} · 时间范围内 <b data-member-load="${escapeHTML(u.id)}">${memberTaskCount(u.id,p)}</b> 项任务</small></label>`).join('')||'<p class="muted">暂无可添加成员</p>'}</div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmInvite" ${candidates.length?'':'disabled'}>${admin?'直接添加并通知':'发送邀请'}</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmInvite').onclick=async()=>{const members=$$('input[name="inviteMember"]:checked').map(x=>x.value);if(!members.length){toast('至少选择一位协作者');return}try{await act('project.invite',{id:projectId,members});closeModal()}catch(e){}};
  /* Removing someone is destructive and irreversible from this dialog, so it
     asks for a second click rather than a nested confirmation. */
  $$('#currentMembers .remove-member').forEach(b=>b.onclick=async()=>{
    if(!b.dataset.armed){
      b.dataset.armed='1';b.textContent='再点一次确认';b.classList.add('is-armed');
      setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent='移出';b.classList.remove('is-armed')}},3000);
      return;
    }
    const who=b.dataset.member;
    try{
      await act('project.member.remove',{id:projectId,member:who});
      closeModal();toast('已移出 '+nameOf(who)+'，他的沟通区里不再有这个工作区');
    }catch(e){}
  });
  api('/api/action',{action:'project.member_loads',data:{id:projectId}}).then(result=>{
    if($('#modalBackdrop')?.classList.contains('hidden'))return;
    for(const [id,total] of Object.entries(result.counts||{})){const el=$$('[data-member-load]').find(node=>node.dataset.memberLoad===id);if(el)el.textContent=total}
  }).catch(()=>{});
}
/* Automatic reports and diaries arrive with their JSON payload appended to
   the body. The inbox reads it back as labelled lines instead of raw JSON. */
const NOTICE_LABELS={done:'完成',progress:'进度',collaborators:'协作',risks:'风险',next:'下一步',summary:'总结'};
function noticeLines(body){
  const text=String(body||''),at=text.indexOf('{');
  if(at<0)return {lead:text.trim(),lines:[]};
  let data=null;try{data=JSON.parse(text.slice(at))}catch(_){return {lead:text.trim(),lines:[]}}
  if(!data||typeof data!=='object')return {lead:text.trim(),lines:[]};
  const flat=v=>String(v).replace(/\{[^{}]*\}/g,m=>{try{return Object.values(JSON.parse(m)).filter(x=>typeof x==='string').join('，')}catch(_){return m}}).replace(/\\n|\n/g,'；');
  const lines=Object.entries(data).filter(([k,v])=>NOTICE_LABELS[k]&&typeof v==='string'&&v.trim()).map(([k,v])=>[NOTICE_LABELS[k],flat(v)]);
  return {lead:text.slice(0,at).trim(),lines};
}
function noticeText(body){const {lead,lines}=noticeLines(body);return [lead,...lines.map(([k,v])=>`${k}：${v}`)].filter(Boolean).join('　')}
function noticeDetail(body){
  const {lead,lines}=noticeLines(body);
  return (lead?`<p class="notification-detail">${escapeHTML(lead)}</p>`:'')
    +(lines.length?`<dl class="notice-fields">${lines.map(([k,v])=>`<div><dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd></div>`).join('')}</dl>`:'');
}
function relTime(iso){
  const at=new Date(iso);if(!iso||Number.isNaN(at.getTime()))return '';
  const mins=Math.round((Date.now()-at.getTime())/60000),hm=at.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
  if(mins<1)return '刚刚';if(mins<60)return `${mins} 分钟前`;if(mins<360)return `${Math.round(mins/60)} 小时前`;
  const day=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(),gap=Math.round((day(new Date())-day(at))/86400000);
  return gap===0?`今天 ${hm}`:gap===1?`昨天 ${hm}`:`${at.getMonth()+1}月${at.getDate()}日 ${hm}`;
}
function renderInbox(){
  const notifications=S.notifications||[],requests=(S.requests||[]).filter(r=>r.status==='pending');
  const approvalInfo=x=>{const chatMention=x.kind==='chat_mention';const p=S.projects.find(p=>p.id===x.reference);const editReq=(S.editRequests||[]).find(r=>r.id===x.reference);const task=S.tasks.find(t=>t.id===x.reference||t.id===editReq?.taskId);const projectPending=Boolean(S.user?.admin&&x.kind==='approval'&&x.title==='项目审批申请'&&p?.status==='pending');const projectCompletionPending=Boolean(S.user?.admin&&x.kind==='project_completion'&&p?.status==='pending_completion');const editPending=Boolean(x.kind==='task_edit_approval'&&editReq&&editReq.status==='pending'&&editReq.approver===S.user?.id&&task);return {project:p,task,editReq,projectPending,projectCompletionPending,editPending,chatMention,pending:projectPending||projectCompletionPending||editPending}};
  const unreadRequests=requests.filter(r=>!r.read).length;
  const unreadNotifications=notifications.filter(x=>!x.read).length;
  const unreadCount=unreadRequests+unreadNotifications;$('#inboxCount').textContent=unreadCount;$('.notification-dot').classList.toggle('hidden',unreadCount===0);$('#inboxView .eyebrow').textContent=`通知中心 · ${unreadCount} 条未读`;
  const cards=[...requests.map(r=>{const p=S.projects.find(x=>x.id===r.projectId);const unread=!r.read;return {priority:2,time:r.createdAt,html:`<article class="inbox-item request-inbox-item ${unread?'unread':''}" data-request="${escapeHTML(r.id)}"><div class="inbox-icon">${icon('folder')}</div><div class="inbox-copy"><strong>项目协作邀请</strong>${unread?'<i class="unread-dot"></i>':''}<p>「${escapeHTML(p?.name||'项目')}」</p><small title="${escapeHTML(r.createdAt)}">${escapeHTML(relTime(r.createdAt))}</small><div class="inbox-actions"><button class="primary-btn accept-request" data-id="${escapeHTML(r.id)}">接受</button><button class="secondary-btn reject-request" data-id="${escapeHTML(r.id)}">拒绝</button></div></div></article>`}}),...notifications.map(x=>{const {project,task,projectPending,projectCompletionPending,editPending,chatMention,pending}=approvalInfo(x);const unread=!x.read||pending;const actions=chatMention?`<div class="inbox-actions"><button class="primary-btn open-chat-from-mention" data-channel="${escapeHTML(x.channel||'')}">去沟通区</button></div>`:projectPending?`<div class="inbox-actions"><button class="primary-btn approve-project-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">同意创建</button><button class="secondary-btn reject-project-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回申请</button></div>`:projectCompletionPending?`<div class="inbox-actions"><button class="primary-btn approve-project-completion-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">同意完成</button><button class="secondary-btn reject-project-completion-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回申请</button></div>`:editPending?`<div class="inbox-actions"><button class="primary-btn approve-edit-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">同意修改</button><button class="secondary-btn reject-edit-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回申请</button></div>`:'';return {priority:pending?2:unread?1:0,time:x.createdAt,html:`<article class="inbox-item ${unread?'unread':''} ${pending?'approval-pending':''} ${UI.inboxManage?'is-managing':''} ${UI.inboxPicked?.has(x.id)?'is-picked':''}" data-id="${escapeHTML(x.id)}">${UI.inboxManage?`<label class="inbox-pick"><input type="checkbox" tabindex="-1" ${UI.inboxPicked?.has(x.id)?'checked':''} aria-label="选择这条通知"></label>`:''}<div class="inbox-icon${UI.inboxManage?' hidden':''}">${editPending?icon('edit'):projectCompletionPending?icon('diamond'):x.kind==='brief'?icon('archive'):x.kind==='report'?icon('clock'):x.kind==='approval'?icon('folder'):x.kind==='request'?icon('mail'):icon('trend')}</div><div class="inbox-copy"><strong>${escapeHTML(x.title)}</strong>${unread?'<i class="unread-dot"></i>':''}<p>${escapeHTML(noticeText(x.body))}</p><small title="${escapeHTML(x.createdAt)}">${escapeHTML(relTime(x.createdAt))}</small>${actions}</div><span class="task-arrow">${icon('chevron-right')}</span>${UI.inboxManage?'':`<button class="inbox-delete" data-delete="${escapeHTML(x.id)}" title="删除这条通知" aria-label="删除这条通知">${icon('x')}</button>`}</article>`}})].sort((a,b)=>(b.priority-a.priority)||String(b.time).localeCompare(String(a.time)));
  $('#inboxList').innerHTML=cards.map(x=>x.html).join('')||'<div class="empty-state">收件箱很安静</div>';
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
}
function openRequest(id){const r=S.requests.find(x=>x.id===id);if(!r)return;const p=S.projects.find(x=>x.id===r.projectId);openModal(`<div class="eyebrow">收件箱详情 · 项目邀请</div><h2>加入「${escapeHTML(p?.name||'项目')}」</h2><div class="detail-grid"><div><span>Owner</span><strong>${escapeHTML(p?.owner||'—')}</strong></div><div><span>项目状态</span><strong>${p?projectStatus(p):'—'}</strong></div></div><div class="modal-footer"><button class="secondary-btn" id="detailRejectRequest">拒绝</button><button class="primary-btn" id="detailAcceptRequest">接受邀请</button></div>`);$('#detailAcceptRequest').onclick=()=>{closeModal();act('request.respond',{id,accept:true})};$('#detailRejectRequest').onclick=()=>{closeModal();act('request.respond',{id,accept:false})};api('/api/action',{action:'request.read',data:{id}}).then(refresh).catch(()=>{})}
function openNotification(id){
  const n=S.notifications.find(x=>x.id===id); if(!n)return;
  if(n.kind==='brief'){if(!n.read)api('/api/action',{action:'inbox.read',data:{id}}).then(refresh).catch(()=>{});openBrief(String(n.reference||'').replace(/^brief:/,''));return}
  const editReq=(S.editRequests||[]).find(r=>r.id===n.reference),p=n.reference&&S.projects.find(x=>x.id===n.reference),t=n.reference&&S.tasks.find(x=>x.id===n.reference)||S.tasks.find(x=>x.id===editReq?.taskId),projectPending=Boolean(S.user?.admin&&n.kind==='approval'&&p?.status==='pending'),projectCompletionPending=Boolean(S.user?.admin&&n.kind==='project_completion'&&p?.status==='pending_completion'),editPending=Boolean(n.kind==='task_edit_approval'&&editReq&&editReq.status==='pending'&&editReq.approver===S.user?.id&&t);
  const action=projectPending?`<div class="modal-footer"><button class="secondary-btn" id="detailRejectProject">驳回申请</button><button class="primary-btn" id="detailApproveProject">同意创建</button></div>`:projectCompletionPending?`<div class="modal-footer"><button class="secondary-btn" id="detailRejectProjectCompletion">驳回申请</button><button class="primary-btn" id="detailApproveProjectCompletion">同意完成</button></div>`:editPending?`<div class="modal-footer"><button class="secondary-btn" id="detailRejectEdit">驳回申请</button><button class="primary-btn" id="detailApproveEdit">同意修改</button></div>`:'<div class="modal-footer"><button class="secondary-btn" id="cancelAction">关闭</button></div>';
  openModal(`<div class="eyebrow">收件箱详情 · ${escapeHTML(n.kind||'通知')}</div><h2>${escapeHTML(n.title)}</h2>${noticeDetail(n.body)}${t?`<div class="detail-grid"><div><span>任务</span><strong>${escapeHTML(t.name)}</strong></div><div><span>负责人</span><strong>${escapeHTML(nameOf(t.assignee))}</strong></div><div><span>状态</span><strong>${status(t)[1]}</strong></div><div><span>项目</span><strong>${escapeHTML(projectName(t))}</strong></div></div>${t.completionSummary?`<div class="completion-summary"><span>提交的完成总结</span><p>${escapeHTML(t.completionSummary)}</p></div>`:''}${editReq?renderEditRequestSummary(t):''}`:p?`<div class="detail-grid"><div><span>关联项目</span><strong>${escapeHTML(p.name)}</strong></div><div><span>项目 Owner</span><strong>${escapeHTML(nameOf(p.owner))}</strong></div><div><span>项目状态</span><strong>${projectStatus(p)}</strong></div></div>${p.completionReport?`<div class="completion-summary"><span>结项报告</span><p>${escapeHTML(p.completionReport)}</p></div>`:''}`:''}<div class="detail-grid"><div><span>通知时间</span><strong title="${escapeHTML(n.createdAt)}">${escapeHTML(relTime(n.createdAt))}</strong></div></div>${action}`);
  $('#cancelAction')?.addEventListener('click',closeModal);
  $('#detailApproveProject')?.addEventListener('click',()=>reviewProject(p.id,true,n.id));
  $('#detailRejectProject')?.addEventListener('click',()=>reviewProject(p.id,false,n.id));
  $('#detailApproveProjectCompletion')?.addEventListener('click',()=>reviewProjectCompletion(p.id,true,n.id));$('#detailRejectProjectCompletion')?.addEventListener('click',()=>reviewProjectCompletion(p.id,false,n.id));
  $('#detailApproveEdit')?.addEventListener('click',()=>reviewTaskEdit(editReq.id,true,n.id));
  $('#detailRejectEdit')?.addEventListener('click',()=>reviewTaskEdit(editReq.id,false,n.id));
  if(!n.read)api('/api/action',{action:'inbox.read',data:{id}}).then(refresh).catch(()=>{});
}
async function reviewProjectCompletion(id,accept,notificationId){if(accept){try{closeModal();await act('project.complete_review',{id,accept:true});if(notificationId)await act('inbox.read',{id:notificationId})}catch(e){}}else{openModal(`<div class="eyebrow">项目完成审批</div><h2>驳回项目完成申请</h2><label class="form-field">驳回原因<textarea id="projectCompletionRejectReason" ></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmProjectCompletionReject">确认驳回</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmProjectCompletionReject').onclick=async()=>{const reason=$('#projectCompletionRejectReason').value.trim();if(!reason){toast('请填写驳回原因');return}try{await act('project.complete_review',{id,accept:false,reason});if(notificationId)await act('inbox.read',{id:notificationId});closeModal()}catch(e){}}}}
async function reviewProject(id,accept,notificationId){
  if(accept){try{closeModal();await act('project.review',{id,accept:true});if(notificationId)await act('inbox.read',{id:notificationId})}catch(e){}}
  else{openModal(`<div class="eyebrow">项目审批</div><h2>驳回项目申请</h2><label class="form-field">驳回原因<textarea id="projectRejectReason" ></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmReject">确认驳回</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmReject').onclick=async()=>{try{await act('project.review',{id,accept:false,reason:$('#projectRejectReason').value||'申请信息需要补充'});if(notificationId)await act('inbox.read',{id:notificationId});closeModal()}catch(e){}}}
}
const REPEAT_DAY_NAMES=['周一','周二','周三','周四','周五','周六','周日'];
function repeatPattern(r){
  const dayNames=REPEAT_DAY_NAMES,weekdayName=iso=>dayNames[(new Date(`${iso}T12:00:00`).getDay()+6)%7];
  const days=(r.weekdays||[]).map(i=>dayNames[i]).join('、');
  const every=Math.max(1,Number(r.every||1));
  if(r.frequency==='daily')return '每天';
  if(r.frequency==='workdays')return '工作日';
  if(r.frequency==='monthly')return `每月 ${Math.min(31,Math.max(1,Number(r.monthDay||1)))} 号`;
  if(r.frequency==='dates'||r.frequency==='specific')return '指定日期';
  const base=days||(r.start?`同起始日（${weekdayName(r.start)}）`:'每周');
  return every>1?`每 ${every} 周 · ${base}`:`每周 · ${base}`;
}
/* Attach a fixed-task rule to a project, move it to another, or take it out.
   Only the project's members can carry it, so the dialog says who is missing
   instead of letting the save fail. */
function repeatProjectDialog(repeatId){
  const r=(S.repeats||[]).find(x=>x.id===repeatId);if(!r)return;
  const current=r.projectId&&S.projects.find(x=>x.id===r.projectId);
  const choices=S.projects.filter(p=>p.status==='active'&&p.id!==r.projectId);
  openModal(`<div class="eyebrow">固定任务 · 所属项目</div><h2>${r.projectId?'调整所属项目':'挂载到项目'}</h2><p>${escapeHTML(r.name)} · ${escapeHTML(repeatPattern(r))} · ${escapeHTML((r.assignees||[]).map(nameOf).join('、'))}</p><p class="muted">当前：${r.projectId?escapeHTML(current?.name||'项目已结束'):'不属于任何项目'}</p>${choices.length?`<label class="form-field">${r.projectId?'改挂到':'挂载到'}<select id="repeatTarget">${choices.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}${p.end?` · 截止 ${escapeHTML(p.end)}`:''}</option>`).join('')}</select></label><p class="muted" id="repeatTargetHint"></p>`:'<p class="muted">没有其他进行中的项目可以挂载。</p>'}<div class="modal-footer">${r.projectId?'<button class="secondary-btn" id="repeatDetach">移出项目</button>':''}<button class="secondary-btn" id="cancelAction">取消</button>${choices.length?`<button class="primary-btn" id="repeatAttach">${r.projectId?'保存调整':'挂载'}</button>`:''}</div>`);
  $('#cancelAction').onclick=closeModal;
  const save=async projectId=>{try{await act('repeat.update',{id:r.id,projectId});closeModal();toast(projectId?'已挂到项目，从今天起生效':'已移出项目')}catch(e){}};
  const sync=()=>{
    const p=S.projects.find(x=>x.id===$('#repeatTarget')?.value);if(!p)return;
    const missing=(r.assignees||[]).filter(a=>(p.members||{})[a]!=='accepted');
    $('#repeatTargetHint').textContent=missing.length?`${missing.map(nameOf).join('、')} 不是该项目成员，请先把他们加入项目`:`从今天起的安排归入该项目${p.end?`，${p.end} 之后不再生成`:''}；已发生的记录保持不变。`;
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
    const state=r.active===false?'已暂停':'启用中';
    const spanText=span>1?` · 持续 ${span} 天`:'';
    const untilText=r.end?` · 至 ${escapeHTML(r.end)}`:'';
    const project=r.projectId&&S.projects.find(x=>x.id===r.projectId),projectText=r.projectId?` · 项目 ${escapeHTML(project?.name||'已结束')}`:'';
    return `<article class="repeat-admin-item"><div><strong>${escapeHTML(r.name)}</strong><span>${escapeHTML(patternOf(r))} · ${escapeHTML(r.time||'09:00')} · ${escapeHTML((r.assignees||[]).join('、'))}</span><small>${state}${projectText}${spanText}${untilText}${r.skipDates?.length?` · 已挖空 ${r.skipDates.length} 天`:''}</small></div><div class="repeat-admin-actions"><button class="ghost-btn repeat-project" data-id="${escapeHTML(r.id)}">${r.projectId?'调整项目':'挂载到项目'}</button><button class="ghost-btn skip-repeat" data-id="${escapeHTML(r.id)}">挖空本次</button></div></article>`}).join('')||'<p class="muted">还没有固定任务规则。</p>';
  $$('.repeat-project').forEach(b=>b.onclick=()=>repeatProjectDialog(b.dataset.id));
  $$('.skip-repeat').forEach(b=>b.onclick=()=>{const date=prompt('请输入本次不执行的日期（YYYY-MM-DD）',S.today);if(!date)return;act('repeat.skip',{id:b.dataset.id,date,skip:true}).catch(()=>{})});
}
function accountProjectRoles(id){const owned=S.projects.filter(p=>p.owner===id).map(p=>p.name),joined=S.projects.filter(p=>p.owner!==id&&(p.members||{})[id]==='accepted').map(p=>p.name);return {owned,joined}}
function accountRoleLabel(x){
  const role=roleOf(x);
  if(role==='superadmin'||role==='admin')return '';
  const {owned,joined}=accountProjectRoles(x.id);const parts=[];
  if(owned.length)parts.push('Owner：'+owned.join('、'));
  if(joined.length)parts.push('协作者：'+joined.join('、'));
  if(!x.active)parts.push('账户已停用');
  return parts.join('　')||'暂无项目归属';
}
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
    reader.onerror=()=>reject(new Error('读取文件失败'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('无法识别这张图片'));
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
  const target=userById(id);if(!target){toast('找不到该账户');return}
  const self=id===S.user.id;
  const canName=S.user?.role==='superadmin';
  if(!canName&&!self){toast('只有 superadmin 可以修改他人资料');return}
  let pendingAvatar=target.avatar||'';
  const nameField=canName?`<label class="form-field">中文名称<input id="profileDisplayName" maxlength="12" value="${escapeHTML(target.displayName||'')}" ></label>`:'';
  const selfFields=self?`<label class="form-field">昵称<input id="profileNickname" maxlength="12" value="${escapeHTML(target.nickname||'')}" placeholder="自己想被叫的名字"></label>
    <div class="form-field">头像<div class="avatar-editor"><span class="avatar large" id="profileAvatarPreview">${escapeHTML(avatarSeed(id))}</span><input type="file" id="profileAvatarFile" accept="image/*" class="hidden"><button type="button" class="secondary-btn" id="profileAvatarPick">选择图片</button><button type="button" class="ghost-btn" id="profileAvatarClear">移除</button></div></div>`:'';
  openModal(`<div class="eyebrow">账户资料 · ${escapeHTML(target.id)}</div><h2>${escapeHTML(target.displayName||target.id)}</h2>${nameField}${selfFields}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmProfile">保存</button></div>`);
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
    catch(err){toast(err.message||'图片处理失败')}
    e.target.value='';
  });
  $('#profileAvatarClear')?.addEventListener('click',()=>{pendingAvatar='';paint()});
  $('#cancelAction').onclick=closeModal;
  $('#confirmProfile').onclick=async()=>{
    const btn=$('#confirmProfile');btn.disabled=true;btn.textContent='保存中…';
    try{
      if(canName&&$('#profileDisplayName')){
        await api('/api/action',{action:'account.profile',data:{id,displayName:$('#profileDisplayName').value.trim()}});
      }
      if(self){
        await api('/api/action',{action:'profile.self',data:{nickname:($('#profileNickname')?.value||'').trim(),avatar:pendingAvatar}});
      }
      closeModal();await refresh();toast('资料已更新');
    }catch(err){
      btn.disabled=false;btn.textContent='保存';
      toast(err?.message||'保存失败');
    }
  };
}
function roleText(x){const role=roleOf(x);return role==='superadmin'?'Super Admin':role==='admin'?'Admin':(accountProjectRoles(x.id).owned.length?'项目 Owner':'普通用户')}
function renderAccountItem(x,owner,admin){
  const self=x.id===S.user.id,role=roleOf(x);
  const nameBtn=owner?`<button class="ghost-btn edit-profile" data-user="${x.id}" data-mode="name">中文名</button>`:'';
  const selfBtn=self?`<button class="ghost-btn edit-profile" data-user="${x.id}" data-mode="self">昵称 / 头像</button>`:'';
  const actions=self?`<span class="permission-pill">当前身份</span> ${selfBtn} <button class="ghost-btn change-password" data-user="${x.id}">修改密码</button>`
    :owner?`<select class="role-select" data-user="${x.id}" title="权限组"><option value="superadmin"${role==='superadmin'?' selected':''}>superadmin</option><option value="admin"${role==='admin'?' selected':''}>admin</option><option value="member"${role==='member'?' selected':''}>普通用户</option></select> <button class="ghost-btn reset-password" data-user="${x.id}">重置密码</button> ${nameBtn} <button class="ghost-btn toggle-account" data-user="${x.id}" data-active="${x.active?1:0}">${x.active?'停用':'启用'}</button> ${x.id!=='superadmin'?`<button class="ghost-btn delete-account" data-user="${x.id}">删除</button>`:''} `
    :(self?nameBtn:'');
  const tail=self?'':(x.active?`<button class="ghost-btn switch-login" data-user="${x.id}">切换</button>`:'<span class="muted">不可用</span>');
  const nickTag=x.nickname?`<span class="name-tag nick">${escapeHTML(x.nickname)}</span>`:'';
  const codeTag=x.displayName?`<span class="name-tag code">${escapeHTML(x.id)}</span>`:'';
  return `<article class="account-item ${self?'current-account':''}">${avatarHTML(x.id)}<div class="account-copy"><div class="account-name"><strong>${escapeHTML(x.displayName||x.id)}</strong>${nickTag}${codeTag}</div><span>${escapeHTML(roleText(x))}</span><small>${escapeHTML(accountRoleLabel(x))}</small></div>${actions||tail?`<div class="account-actions">${actions}${tail}</div>`:''}</article>`;
}
function renderAccounts(){
  const u=S.users,admin=Boolean(S.user?.admin),owner=S.user?.role==='superadmin';
  const ownerProjects=S.projects.filter(p=>p.owner===S.user.id);
  $('#currentRoleLabel').textContent=owner?'Super Admin':admin?'Admin':ownerProjects.length?'项目 Owner':'协作者';
  const me=userById(S.user.id)||{};
  applyAvatar($('.account-banner .avatar'),S.user.id);
  $('.account-banner strong').innerHTML=escapeHTML(me.displayName||S.user.id)+(me.nickname?` <span class="name-tag nick">${escapeHTML(me.nickname)}</span>`:'');
  $('.account-banner span').textContent=owner?'Super Admin':admin?'Admin':'';
  $('.account-banner .permission-pill')?.remove();
  $('#forceAssignBtn').classList.toggle('hidden',!admin);
  $('#runAutomationBtn').classList.toggle('hidden',!admin);
  $('#accountsView .automation-card').classList.toggle('hidden',!admin);
  const superadmins=u.filter(x=>roleOf(x)==='superadmin'),admins=u.filter(x=>roleOf(x)==='admin'),members=u.filter(x=>roleOf(x)==='member');
  const section=(title,hint,list)=>`<div class="account-group"><div class="account-group-heading"><strong>${title}</strong><span>${list.length}</span></div>${list.map(x=>renderAccountItem(x,owner,admin)).join('')||'<p class="muted">暂无账户。</p>'}</div>`;
  $('#accountList').innerHTML=section('superadmin 权限组','',superadmins)+section('admin 权限组','',admins)+section('普通用户','',members);
  $$('.switch-login').forEach(b=>b.onclick=async()=>{try{await api('/api/logout',{});showAuth();$('#loginUser').value=b.dataset.user;$('#loginPass').focus()}catch(e){toast(e.message)}});
  $$('.toggle-account').forEach(b=>b.onclick=async()=>{try{await act('account.toggle',{id:b.dataset.user,active:b.dataset.active==='0'});toast(b.dataset.active==='0'?'账户已启用':'账户已停用')}catch(e){}});
  $$('.role-select').forEach(sel=>sel.onchange=async()=>{const next=sel.value,prev=sel.dataset.changed||sel.querySelector(`option[selected]`)?.value;try{await api('/api/action',{action:'account.role',data:{id:sel.dataset.user,role:next}});await refresh();toast(`${sel.dataset.user} 已设为 ${next==='member'?'普通用户':next}`)}catch(e){toast(e.message||'操作失败');await refresh()}});
  $$('.change-password').forEach(b=>b.onclick=async()=>{const current=prompt('请输入当前密码');if(current===null)return;const pw=prompt('请输入新密码（至少6位）');if(!pw)return;try{await api('/api/password',{id:b.dataset.user,current,password:pw});toast('密码已更新')}catch(e){toast(e.message)}});
  $$('.reset-password').forEach(b=>b.onclick=async()=>{const pw=prompt(`为 ${b.dataset.user} 设置新密码（至少6位）`);if(!pw)return;try{await api('/api/password',{id:b.dataset.user,password:pw});toast('密码已重置，该账户需重新登录')}catch(e){toast(e.message)}});
  $$('.edit-profile').forEach(b=>b.onclick=()=>editProfile(b.dataset.user,b.dataset.mode));
  $$('.delete-account').forEach(b=>b.onclick=()=>deleteAccount(b.dataset.user));
}
/* The workspace chip opens a menu: who you are, your own settings, a fast
   account switch and sign-out. Switching accounts only signs out and carries
   the target id into the sign-in form — passwords are never bypassed. */
function renderAccountMenu(){
  const menu=$('#accountMenu');if(!menu)return;
  const me=userById(S.user.id)||{};
  const others=knownAccounts().filter(id=>id!==S.user.id).map(userById).filter(u=>u?.active);
  const head=`<div class="account-menu-head">${avatarHTML(S.user.id,'large')}<div class="account-menu-identity"><strong>${escapeHTML(me.displayName||S.user.id)}</strong>${me.nickname?`<span class="name-tag nick">${escapeHTML(me.nickname)}</span>`:''}<small>${escapeHTML(accountRoleLabel(S.user))}</small></div></div>`;
  const row=(action,label,hint)=>`<button class="account-menu-item" data-action="${action}" role="menuitem">${escapeHTML(label)}${hint?`<small>${escapeHTML(hint)}</small>`:''}</button>`;
  const mine=`<div class="account-menu-group">${row('profile','我的资料','昵称 / 头像')}${row('password','修改密码')}${S.user?.admin?row('accounts','账户管理'):''}</div>`;
  const switchGroup=`<div class="account-menu-group"><span class="account-menu-label">切换账户</span>${others.map(u=>`<button class="account-menu-item switch" data-user="${escapeHTML(u.id)}" role="menuitem">${avatarHTML(u.id)}<span>${escapeHTML(u.displayName||u.id)}${u.nickname?`<small>${escapeHTML(u.nickname)}</small>`:''}</span></button>`).join('')}<button class="account-menu-item switch" data-user="" role="menuitem">登录其他账户</button></div>`;
  const foot=`<div class="account-menu-group"><button class="account-menu-item danger" data-action="logout" role="menuitem">退出登录</button></div>`;
  menu.innerHTML=head+mine+switchGroup+foot;
  menu.querySelectorAll('.account-menu-item[data-action]').forEach(b=>b.onclick=()=>accountMenuAction(b.dataset.action));
  menu.querySelectorAll('.account-menu-item.switch').forEach(b=>b.onclick=()=>signOutTo(b.dataset.user));
}
function accountMenuAction(action){
  toggleAccountMenu(false);
  if(action==='profile')editProfile(S.user.id,'self');
  else if(action==='password')changeOwnPassword();
  else if(action==='accounts')switchView('accounts');
  else if(action==='logout')signOutTo('');
}
function changeOwnPassword(){
  const current=prompt('请输入当前密码');if(current===null)return;
  const next=prompt('请输入新密码（至少 6 位）');if(!next)return;
  if(next.length<6){toast('密码至少 6 位');return}
  api('/api/password',{id:S.user.id,current,password:next}).then(()=>toast('密码已更新')).catch(e=>toast(e?.message||'修改失败'));
}
async function signOutTo(userId){
  toggleAccountMenu(false);
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
}
function deleteAccount(id){
  const x=S.users.find(u=>u.id===id);
  if(!x){toast('账户不存在');return}
  if(x.id===S.user.id){toast('不能删除当前登录账户');return}
  if(x.id==='superadmin'){toast('内置 superadmin 账户不能删除');return}
  const role=roleOf(x),roleLabel=role==='superadmin'?'Super Admin':role==='admin'?'Admin':'普通用户';
  openModal(`<div class="eyebrow danger-eyebrow">危险操作 · 不可撤销</div><h2>删除账户「${escapeHTML(x.id)}」</h2><div class="danger-panel"><p>删除后无法恢复。</p><ul class="danger-impact"><li>权限组：<strong>${roleLabel}</strong></li><li>若该账户仍负责进行中的项目或有未完成任务，删除会被拒绝，请先转交职责</li><li>历史审计记录会保留</li></ul></div><label class="danger-check"><input type="checkbox" id="deleteAccountAck"> 我已了解该账户及其个人数据将被永久删除，且无法恢复</label><label class="danger-confirm">请输入账户名 <code>${escapeHTML(x.id)}</code> 以继续<input id="deleteAccountConfirm" autocomplete="off" spellcheck="false" placeholder="${escapeHTML(x.id)}"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="danger-btn" id="confirmDeleteAccount" disabled>永久删除账户</button></div>`);
  const ack=$('#deleteAccountAck'),text=$('#deleteAccountConfirm'),btn=$('#confirmDeleteAccount');
  const sync=()=>{btn.disabled=!(ack.checked&&text.value.trim()===x.id)};
  ack.onchange=sync;text.oninput=sync;
  $('#cancelAction').onclick=closeModal;
  btn.onclick=async()=>{
    if(btn.disabled)return;
    btn.disabled=true;btn.textContent='正在删除…';
    try{await act('account.delete',{id:x.id,confirm:text.value.trim()});closeModal();toast('账户已删除')}
    catch(e){btn.disabled=false;btn.textContent='永久删除账户'}
  };
}
async function act(action,data){try{await api('/api/action',{action,data});await refresh();toast('操作已完成')}catch(e){toast(e.message);throw e}}
function openModal(html){$('#modalContent').innerHTML=html;$('#modalBackdrop .modal')?.classList?.remove('is-wide');$('#modalBackdrop').classList.remove('hidden')};function closeModal(){$('#modalBackdrop').classList.add('hidden')};function closeDrawer(){$('#taskDrawer').classList.add('hidden')}
function newTask(projectId,initialDate){
  const admin=Boolean(S.user.admin),projects=manageableProjects().filter(p=>!isProjectHidden(p)),locked=typeof projectId==='string';
  const initial=projects.find(p=>p.id===projectId)?.id||projects[0]?.id;
  /* 临时任务 belongs to no project: a member writes one for themselves, an
     admin can hand one to any member. */
  let kind=projects.length?'project':'adhoc',serverMinutes=null,ask=0;
  const kinds=locked?'':`<div class="task-kind-switch">${projects.length?'<button type="button" class="task-kind-btn" data-kind="project">项目任务</button>':''}<button type="button" class="task-kind-btn" data-kind="adhoc">临时任务</button>${admin?'<button type="button" class="task-kind-btn" id="kindFixedTask">固定任务</button>':''}</div>`;
  openModal(`<div class="eyebrow">${admin?'管理员':projects.length?'项目 Owner':'我的任务'}</div><h2>新建任务</h2>${kinds}<label class="form-field" id="taskProjectField">所属项目<select id="taskProject" ${locked?'disabled':''}>${projects.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('')}</select></label><label class="form-field">任务名称<input id="taskName" maxlength="120"></label><label class="form-field">任务描述<textarea id="taskDesc"></textarea></label><label class="form-field">指派给<select id="taskAssignee"></select><div id="taskAssigneeLoad" class="assignee-load-hint"></div></label><div class="task-form-grid"><label class="form-field">安排日期<input id="taskDate" type="date" max="${DATE_HORIZON}" value="${initialDate||(UI.view==='dayDetail'?UI.detailDate:displayDay())}"></label><label class="form-field">结束日期<input id="taskDeadline" type="date" max="${DATE_HORIZON}"></label><label class="form-field">时间<input id="taskTime" type="time" value="09:00"></label><label class="form-field">预计时长<input id="taskDuration" type="number" min="1" max="1440" value="30"></label><label class="form-field">优先级<select id="taskPriority"><option>P0</option><option selected>P1</option><option>P2</option></select></label></div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmTask">创建任务</button></div>`);
  const project=()=>kind==='project'?projects.find(p=>p.id===$('#taskProject').value):null;
  const candidates=()=>kind==='adhoc'?S.users.filter(u=>u.active&&(admin?!u.admin:u.id===S.user.id)):projectAssignees(project());
  /* The load beside each name is what that person already has inside this
     task's own dates, across every project, not their whole backlog. */
  const span=()=>{const start=$('#taskDate').value||S.today,end=$('#taskDeadline').value;return [start,end&&end>start?end:start]};
  const hours=mins=>Math.round(mins/60*10)/10;
  const load=(id,[start,end])=>{const ts=S.tasks.filter(t=>t.assignee===id&&!['skipped','deferred'].includes(t.status)&&!isSuperseded(t)&&t.date<=end&&taskEnd(t)>=start);return {count:ts.length,mins:serverMinutes&&id in serverMinutes?serverMinutes[id]:ts.reduce((n,t)=>n+Number(t.duration||0),0)}};
  const render=()=>{
    const users=candidates(),p=project(),picked=$('#taskAssignee').value,period=span();
    $('#taskAssignee').innerHTML=users.map(u=>`<option value="${escapeHTML(u.id)}">${escapeHTML(nameOf(u.id))}${p&&u.id===p.owner?' · Owner':''} · ${hours(load(u.id,period).mins)}h</option>`).join('');
    if(users.some(u=>u.id===picked))$('#taskAssignee').value=picked;
    const who=$('#taskAssignee').value,mine=who?load(who,period):null,[start,end]=period;
    $('#taskAssigneeLoad').textContent=users.length?`${fmt(start)}${end!==start?' – '+fmt(end):''} 已安排 ${hours(mine.mins)}h · ${mine.count} 项`:'项目暂无成员';
    $('#confirmTask').disabled=!users.length;
  };
  /* An Owner only sees their own projects' tasks, so their numbers come from
     the server; an admin already holds every task. */
  const recount=()=>{
    serverMinutes=null;render();const p=project();if(admin||!p)return;
    const [start,end]=span(),mine=++ask;
    api('/api/action',{action:'project.member_loads',data:{id:p.id,start,end}}).then(r=>{if(mine!==ask||$('#modalBackdrop').classList.contains('hidden'))return;serverMinutes=r.minutes||null;render()}).catch(()=>{});
  };
  const setKind=k=>{kind=k;$$('.task-kind-btn[data-kind]').forEach(b=>b.classList.toggle('active',b.dataset.kind===k));$('#taskProjectField').classList.toggle('hidden',k!=='project');recount()};
  $$('.task-kind-btn[data-kind]').forEach(b=>b.onclick=()=>setKind(b.dataset.kind));
  $('#kindFixedTask')?.addEventListener('click',fixedTask);
  if(initial)$('#taskProject').value=initial;
  const _sd=$('#taskDate'),_dl=$('#taskDeadline');const _syncDl=()=>{_dl.min=_sd.value||S.today;if(_dl.value&&_dl.value<_dl.min)_dl.value=''};
  _sd.onchange=()=>{_syncDl();recount()};_dl.onchange=recount;$('#taskProject').onchange=recount;$('#taskAssignee').onchange=render;_syncDl();
  setKind(kind);$('#cancelAction').onclick=closeModal;
  $('#confirmTask').onclick=async()=>{if(!$('#taskName').value.trim()){toast('请填写任务名称');return}const _start=$('#taskDate').value,_end=$('#taskDeadline').value;if(_end&&_end<_start){toast('结束日期不能早于安排日期');return}const data={name:$('#taskName').value,desc:$('#taskDesc').value,projectId:kind==='project'?$('#taskProject').value:null,assignee:$('#taskAssignee').value,date:$('#taskDate').value,deadline:$('#taskDeadline').value||null,time:$('#taskTime').value,duration:Number($('#taskDuration').value),priority:$('#taskPriority').value};try{await act('task.create',data);closeModal()}catch(e){}};
}
function editTaskAssignment(id){
  const t=S.tasks.find(t=>t.id===id),p=S.projects.find(p=>p.id===t?.projectId);
  if(!canManageProject(p)||p.status!=='active'||!['todo','doing'].includes(t.status)){toast('当前任务不可调整');return}
  const users=projectAssignees(p);
  openModal(`<div class="eyebrow">${escapeHTML(p.name)} · ${S.user.admin?'管理员':'项目 Owner'}</div><h2>调整任务指派</h2><p>${escapeHTML(t.name)}<br>当前负责人：${escapeHTML(t.assignee)}。调整后将通知原负责人及新负责人。</p><label class="form-field">指派给<select id="assignmentUser">${users.map(u=>`<option value="${escapeHTML(u.id)}">${escapeHTML(u.id)}${u.id===p.owner?' · Owner':''}</option>`).join('')}</select></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmAssignment" ${users.length?'':'disabled'}>保存指派并通知</button></div>`);
  if(users.some(u=>u.id===t.assignee))$('#assignmentUser').value=t.assignee;
  $('#cancelAction').onclick=closeModal;$('#confirmAssignment').onclick=async()=>{const assignee=$('#assignmentUser').value;if(assignee===t.assignee){toast('负责人未变更');return}try{await act('task.update',{id,assignee});closeModal();if(!$('#taskDrawer').classList.contains('hidden'))openDrawer(id)}catch(e){}};
}
function newProject(){
  const admin=S.user?.admin,ownerOptions=S.users.filter(u=>u.active&&!u.admin),owner=admin?`<label class="form-field">项目 Owner<select id="projectOwner">${ownerOptions.map(u=>`<option value="${escapeHTML(u.id)}">${escapeHTML(u.id)}</option>`).join('')}</select></label>`:'';
  const collaborators=admin?`<fieldset class="member-checkboxes"><legend>协作者（直接加入项目）</legend>${ownerOptions.map(u=>`<label><input type="checkbox" name="projectMember" value="${escapeHTML(u.id)}"> <strong>${escapeHTML(u.id)}</strong></label>`).join('')}</fieldset>`:'';
  openModal(`<div class="eyebrow">项目空间 · ${admin?'superadmin 创建':'成员申请'}</div><h2>${admin?'创建项目':'申请创建项目'}</h2><label class="form-field">项目名称<input id="projectName" maxlength="120"></label><label class="form-field">项目描述<textarea id="projectDesc"></textarea></label>${owner}<div class="project-date-fields"><label class="form-field">开始日期<input id="projectStart" type="date" max="${DATE_HORIZON}" value="${S.today}"></label><label class="form-field">截止日期（可留空）<input id="projectEnd" type="date" min="${S.today}" max="${DATE_HORIZON}"></label></div>${collaborators}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmProject">${admin?'创建项目':'提交审批'}</button></div>`);
  $('#cancelAction').onclick=closeModal;$('#projectStart').onchange=()=>$('#projectEnd').min=$('#projectStart').value;
  /* The Owner is on the project by definition, so they are never offered as a collaborator. */
  const syncOwner=()=>{const owner=$('#projectOwner')?.value;$$('input[name="projectMember"]').forEach(x=>{const own=x.value===owner;if(own)x.checked=false;x.closest('label').classList.toggle('hidden',own)})};
  if(admin){$('#projectOwner').onchange=syncOwner;syncOwner()}
  $('#confirmProject').onclick=async()=>{const start=$('#projectStart').value,end=$('#projectEnd').value;if(!$('#projectName').value.trim()||!start){toast('请填写项目名称和开始日期');return}if(end&&end<start){toast('截止日期不能早于开始日期');return}const data={name:$('#projectName').value,desc:$('#projectDesc').value,start,end,cycle:end?'range':'infinite'};if(admin){data.owner=$('#projectOwner').value;data.members=$$('input[name="projectMember"]:checked').map(x=>x.value)}try{await act('project.create',data);closeModal()}catch(e){}};
}
function fixedTask(){
  const users=S.users.filter(u=>u.active&&!u.admin),days=['周一','周二','周三','周四','周五','周六','周日'];
  const monthOptions=Array.from({length:31},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===1?'selected':''}>${n} 号</option>`).join('');
  openModal(`<div class="eyebrow">Super Admin · 固定任务</div><h2>发布固定安排</h2>
    <label class="form-field">任务名称<input id="repeatName" maxlength="120" required></label>
    <label class="form-field">所属项目（可选）<select id="repeatProject"><option value="">不挂项目</option>${S.projects.filter(p=>p.status==='active').map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('')}</select></label>
    <fieldset class="member-checkboxes" id="repeatUsers"><legend>安排给（可多选）</legend>${users.map(u=>`<label><input type="checkbox" name="repeatUser" value="${escapeHTML(u.id)}"> ${escapeHTML(u.id)}</label>`).join('')}</fieldset>
    <label class="form-field">周期<select id="repeatFreq"><option value="daily">每天</option><option value="weekly" selected>每周</option><option value="monthly">每月</option><option value="workdays">工作日</option><option value="dates">指定日期</option></select></label>
    <label class="form-field" id="repeatEveryField">间隔<select id="repeatEvery"><option value="1">每 1 周</option><option value="2">每 2 周（双周）</option><option value="3">每 3 周</option><option value="4">每 4 周</option></select></label>
    <fieldset class="member-checkboxes" id="repeatWeekdayFields"><legend>每周几执行</legend>${days.map((d,i)=>`<label><input type="checkbox" name="repeatWeekday" value="${i}" ${i<5?'checked':''}> ${d}</label>`).join('')}</fieldset>
    <label class="form-field hidden" id="repeatMonthField">每月执行日<select id="repeatMonthDay">${monthOptions}</select></label>
    <label class="form-field hidden" id="repeatDatesField">指定日期（逗号分隔）<input id="repeatDates" placeholder="2026-09-20, 2026-10-01"></label>
    <label class="form-field">持续天数<input id="repeatSpan" type="number" min="1" max="30" value="1"></label>
    <label class="form-field">开始日期<input id="repeatStart" type="date" max="${DATE_HORIZON}" value="${S.today}"></label>
    <label class="form-field">结束日期（可留空）<input id="repeatEnd" type="date" max="${DATE_HORIZON}"></label>
    <label class="form-field">开始时间<input id="repeatTime" type="time" value="09:00"></label>
    <label class="form-field">每次时长<input id="repeatDuration" type="number" min="1" max="1440" value="30"></label>
    <label class="form-field">本次挖空日期（可留空）<input id="repeatSkipDates" placeholder="2026-10-01, 2026-10-02"></label>
    <div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmRepeat">保存固定任务</button></div>`);
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
    if(!$('#repeatName').value.trim()||!assignees.length){toast('请填写任务名称并选择成员');return}
    if(freq==='weekly'&&!weekdays.length){toast('请选择每周执行日');return}
    if(freq==='dates'&&!dates.length){toast('请填写至少一个指定日期');return}
    const start=$('#repeatStart').value,end=$('#repeatEnd').value;
    if(!start){toast('请填写开始日期');return}
    if(end&&end<start){toast('结束日期不能早于开始日期');return}
    try{await act('repeat.create',{name:$('#repeatName').value,assignees,frequency:freq,
      every:freq==='weekly'?Number($('#repeatEvery').value||1):1,
      weekdays,monthDay:Number($('#repeatMonthDay').value||1),
      span:Math.max(1,Number($('#repeatSpan').value||1)),
      dates,start,end,time:$('#repeatTime').value,
      duration:Number($('#repeatDuration').value),priority:'P1',skipDates,projectId:$('#repeatProject').value||null});closeModal()}catch(e){}};
}
function collectionSettings(){
  const cfg=S.automation||{},mode=cfg.mode||'daily',days=['周一','周二','周三','周四','周五','周六','周日'],selected=cfg.weekdays||[0,1,2,3,4];
  openModal(`<div class="eyebrow">Super Admin · 自动收集</div><h2>设置总结收集时间</h2><label class="form-field">收集周期<select id="collectionMode"><option value="daily">每天</option><option value="weekly">每周指定星期</option><option value="dates">指定日期</option></select></label><label class="form-field">收集时间<input id="collectionTime" type="time" value="${escapeHTML(cfg.time||'00:00')}"></label><fieldset class="member-checkboxes" id="collectionWeekdayFields"><legend>每周几收集</legend>${days.map((d,i)=>`<label><input type="checkbox" name="collectionWeekday" value="${i}" ${selected.includes(i)?'checked':''}> ${d}</label>`).join('')}</fieldset><label class="form-field hidden" id="collectionDatesField">指定日期（逗号分隔）<input id="collectionDates" value="${escapeHTML((cfg.dates||[]).join(', '))}" placeholder="2026-09-20, 2026-10-01"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="saveCollection">保存收集规则</button></div>`);
  $('#collectionMode').value=mode;
  const sync=()=>{const m=$('#collectionMode').value;$('#collectionWeekdayFields').classList.toggle('hidden',m!=='weekly');$('#collectionDatesField').classList.toggle('hidden',m!=='dates')};
  $('#collectionMode').onchange=sync;sync();$('#cancelAction').onclick=closeModal;
  $('#saveCollection').onclick=async()=>{const m=$('#collectionMode').value,weekdays=$$('input[name="collectionWeekday"]:checked').map(x=>Number(x.value)),dates=$('#collectionDates').value.split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean);if(m==='weekly'&&!weekdays.length){toast('请选择每周收集日');return}if(m==='dates'&&!dates.length){toast('请填写指定收集日期');return}try{await act('automation.update',{mode:m,time:$('#collectionTime').value,weekdays,dates});closeModal()}catch(e){}};
}
function renderAll(){
  $$('.admin-only-nav').forEach(n=>n.classList.toggle('hidden',!S.user?.admin));
  const projectLabel=(S.user.admin?'创建项目':'申请项目');
  ['#addProjectBtn','#addProjectTopBtn','#timelineAddProjectBtn'].forEach(id=>$(id).innerHTML=icon('plus')+projectLabel);
  const canAssign=Boolean(S.user.admin||manageableProjects().length);
  $('#addTaskBtn').innerHTML=icon('plus')+(canAssign?'指派任务':'新建任务');
  $('#createFixedBtn')?.classList.toggle('hidden',!S.user.admin);
  $('#repeatAdminPanel')?.classList.toggle('hidden',!S.user.admin);
  renderRepeats();
  $('#forceAssignBtn').textContent='管理项目与任务';
  $('[data-view="today"]').removeAttribute('disabled');
  applyAvatar($('.workspace-switcher .avatar'),S.user.id);
  $('.workspace-switcher small').textContent=S.user.admin?'团队工作区':'成员工作区';
  const meUser=userById(S.user.id)||{};
  $('.workspace-switcher strong').innerHTML=escapeHTML(meUser.displayName||S.user.id)+(meUser.nickname?` <span class="name-tag nick">${escapeHTML(meUser.nickname)}</span>`:'');
  if(!$('#accountMenu')?.classList.contains('hidden'))renderAccountMenu();
  $('#crumbRoot').textContent=S.user.admin?'团队工作台':'我的工作台';
  $('.focus-card > span').textContent=S.user.admin?'成员今日安排':'今日安排';
  renderStats();renderInbox();renderAccounts();switchView(UI.view);
}

function scheduleTasks(includeHistory){
  const visible=S.tasks.filter(t=>(includeHistory||!isSuperseded(t))&&(!t.projectId||!isProjectHidden(S.projects.find(p=>p.id===t.projectId))));
  if(!S.user)return [];
  if(!S.user?.admin)return visible.filter(t=>t.assignee===S.user.id);
  return UI.member!=='all'?visible.filter(t=>t.assignee===UI.member):visible;
}
function memberTaskCount(userId,project){
  if(!project)return 0;
  const start=project.start||'0000-01-01',end=project.end||'9999-12-31';
  return S.tasks.filter(t=>t.assignee===userId&&t.date>=start&&t.date<=end&&!isSuperseded(t)).length;
}
function renderScheduleScope(){
  const visible=Boolean(S.user?.admin&&['today','calendar','dayDetail'].includes(UI.view));
  $('#scheduleScope').classList.toggle('hidden',!visible);
  if(!visible)return;
  const members=[...new Set([...S.users.map(u=>u.id),...S.tasks.map(t=>t.assignee)])];
  if(UI.member!=='all'&&!members.includes(UI.member))UI.member='all';
  const select=$('#scheduleMember');
  select.innerHTML='<option value="all">全部成员（含管理员）</option>'+members.map(id=>`<option value="${escapeHTML(id)}">${escapeHTML(id)}</option>`).join('');
  select.value=UI.member;
  const dates=UI.view==='calendar'?week(UI.selectedWeek):[UI.view==='dayDetail'?UI.detailDate:displayDay()];
  const tasks=scheduleTasks().filter(t=>dates.some(d=>taskActiveOn(t,d)));
  $('#scheduleScopeTitle').textContent=UI.member==='all'?'全部成员的安排':`${UI.member} 的安排`;
  $('#scheduleScopeHint').textContent=`${UI.view==='calendar'?'当前周':'当日'} ${tasks.length} 项任务 · ${new Set(tasks.map(t=>t.assignee)).size} 人有安排`;
  select.onchange=()=>{UI.member=select.value;renderStats();switchView(UI.view)};
}
const projectStatus=p=>({active:'进行中',pending:'待审批',pending_completion:'完成待审批',rejected:'已驳回',paused:'已暂停',done:'已完成',archived:'已归档'}[p.status]||'未设置');
const isProjectHidden=(p,today=S.today)=>Boolean(p&&(p.status==='done'||p.status==='archived'||(p.end&&today&&p.end<today)));
const visibleProjects=()=>S.projects.filter(p=>!isProjectHidden(p));
// Finished projects are removed from the normal `projects` snapshot so they
// no longer appear in calendars/timelines.  Superadmin's成果库 is backed by
// the dedicated archive payload and includes its de-duplicated task leaves.
const completedProjects=()=>S.user?.admin?((Array.isArray(S.achievements)&&S.achievements.length?S.achievements:S.projects.filter(p=>['done','archived'].includes(p.status))).slice().sort((a,b)=>String(b.completedAt||b.end||b.createdAt||'').localeCompare(String(a.completedAt||a.end||a.createdAt||'')) )):[];
function achievementLifecycle(project,tasks=[]){
  const doneTasks=tasks.filter(t=>t.status==='done');
  const latestTaskDone=doneTasks.map(t=>t.completedAt||t.approvedAt||t.date).filter(Boolean).sort().at(-1)||'';
  return [
    {key:'created',label:'创建',at:String(project.createdAt||project.start||'').slice(0,10)},
    {key:'started',label:'启动',at:String(project.start||'').slice(0,10)},
    {key:'tasks',label:'子任务完成',at:String(latestTaskDone).slice(0,10),meta:`${doneTasks.length}/${tasks.length}`},
    {key:'submitted',label:'结项申请',at:String(project.completionRequestedAt||'').slice(0,10)},
    {key:'completed',label:'审批完成',at:String(project.completedAt||project.end||'').slice(0,10)}
  ];
}
function renderAchievements(){
  const admin=Boolean(S.user?.admin),grid=$('#achievementGrid'),empty=$('#achievementEmpty'),stats=$('#achievementStats');
  if(!admin){if(grid)grid.innerHTML='';return}
  const projects=completedProjects(), projectTasks=p=>Array.isArray(p.tasks)?p.tasks:S.tasks.filter(t=>t.projectId===p.id);
  if(stats){const totalTasks=projects.reduce((n,p)=>n+projectTasks(p).length,0),doneTasks=projects.reduce((n,p)=>n+projectTasks(p).filter(t=>t.status==='done').length,0);stats.innerHTML=`<div class="achievement-stat"><span>已完成项目</span><strong>${projects.length}</strong></div><div class="achievement-stat"><span>累计完成子任务</span><strong>${doneTasks}</strong><small>共 ${totalTasks} 项</small></div><div class="achievement-stat"><span>最近结项</span><strong>${projects[0]?escapeHTML(String(projects[0].completedAt||projects[0].end||'').slice(0,10)):'—'}</strong>${projects[0]?`<small>${escapeHTML(projects[0].name)}</small>`:''}</div>`}
  if(empty)empty.classList.toggle('hidden',projects.length>0);
  if(!grid)return;
  grid.innerHTML=projects.map(p=>{
    const tasks=sortTasks(projectTasks(p)),done=tasks.filter(t=>t.status==='done').length,stages=achievementLifecycle(p,tasks);
    return `<article class="achievement-card" data-project="${escapeHTML(p.id)}"><div class="achievement-card-head"><div><span class="achievement-kicker">已归档成果</span><h2>${escapeHTML(p.name)}</h2><p>${escapeHTML(p.desc||'暂无项目描述')}</p></div><span class="achievement-status">${projectStatus(p)}</span></div><div class="achievement-meta"><span>Owner · <b>${escapeHTML(p.owner||'—')}</b></span><span>任务完成 · <b>${done}/${tasks.length}</b></span><span>完成于 · <b>${escapeHTML(String(p.completedAt||p.end||'—').slice(0,10))}</b></span></div><div class="achievement-actions"><button class="ghost-btn open-channel-archive" data-project="${escapeHTML(p.id)}" data-name="${escapeHTML(p.name)}">沟通记录</button></div><ol class="achievement-lifecycle">${stages.map((s,i)=>`<li class="${s.at?'is-complete':''}"><i></i><span><b>${escapeHTML(s.label)}</b><small>${escapeHTML(s.at||'未记录')}${s.meta?` · ${escapeHTML(s.meta)}`:''}</small></span>${i<stages.length-1?'<em></em>':''}</li>`).join('')}</ol>${p.completionReport?`<div class="achievement-report"><span>结项报告</span><p>${escapeHTML(p.completionReport)}</p></div>`:''}<div class="achievement-actions"><button class="secondary-btn achievement-open" data-project="${escapeHTML(p.id)}">查看项目详情</button></div></article>`;
  }).join('');
  $$('#achievementGrid .achievement-open').forEach(b=>b.onclick=()=>openWorkLogDetail('',b.dataset.project,'project'));
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
  $('#timelineProjectCount').textContent=`${model.rows.length} 个项目`;
  $('#timelineEmpty').classList.toggle('hidden',model.rows.length>0);
  scroll.classList.toggle('hidden',model.rows.length===0);
  
  grid.style.setProperty('--day-width',`${dayWidth}px`);
  grid.style.setProperty('--track-width',`${model.days*dayWidth}px`);
  const days=Array.from({length:model.days},(_,i)=>{const n=model.start+i,iso=dateFromNumber(n),d=new Date(n*DAY_MS);return {n,iso,day:d.getUTCDate(),dow:d.getUTCDay(),month:iso.slice(0,7)}});
  const months=[];
  for(const d of days){const last=months.at(-1);if(last?.month===d.month)last.count++;else months.push({month:d.month,offset:d.n-model.start,count:1})}
  const todayLine=`<i class="gantt-today-line" style="left:${(model.today-model.start+.5)*dayWidth}px" aria-hidden="true"></i>`;
  grid.innerHTML=`<div class="gantt-header"><div class="gantt-corner"><strong>项目 / Owner</strong></div><div class="gantt-axis"><div class="gantt-months">${months.map(m=>`<span style="left:${m.offset*dayWidth}px;width:${m.count*dayWidth}px"><b>${m.month.replace('-',' 年 ')} 月</b></span>`).join('')}</div><div class="gantt-dates">${days.map(d=>`<div class="gantt-date ${[0,6].includes(d.dow)?'weekend':''} ${d.n===model.today?'is-today':''}" title="${d.iso}"><strong>${d.day}</strong><small>${['日','一','二','三','四','五','六'][d.dow]}</small></div>`).join('')}</div></div></div>${model.rows.map((r,i)=>{
    const p=r.project,palette=['coral','blue','green','purple','gold'][i%5],range=r.invalid?'日期待修正':`${p.start} → ${p.end||'未设截止'}`;
    return `<div class="gantt-row" data-project="${escapeHTML(p.id)}"><div class="gantt-project"><div><i class="project-color ${palette}"></i><strong title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</strong></div><small>${escapeHTML(nameOf(p.owner))} <span>· ${projectStatus(p)}</span></small><span class="gantt-range">${escapeHTML(range)}</span></div><div class="gantt-track">${todayLine}${r.invalid?'<span class="gantt-invalid">请修正项目起止日期</span>':`<div class="gantt-bar ${palette} ${r.openEnded?'open-ended':''} ${['pending','rejected'].includes(p.status)?'awaiting':''}" style="left:${r.offset*dayWidth+3}px;width:${Math.max(26,r.span*dayWidth-6)}px" tabindex="0" aria-label="${escapeHTML(p.name)}，${escapeHTML(range)}，${projectStatus(p)}" title="${escapeHTML(p.name)} · ${escapeHTML(p.owner)}\n${escapeHTML(range)} · ${projectStatus(p)}"><span>${escapeHTML(p.name)}${r.openEnded?' · 未设截止 →':''}</span></div>`}</div></div>`;
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
    pipNote(v.mode==='rest'?'专注结束，休息一下':'休息结束，开始下一轮专注');
  }
  const left=pomoLeft(v);
  doc.querySelector('#pipClock').textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
  doc.querySelector('#pipMode').textContent=v.mode==='focus'?'专注 25 分钟':'休息 5 分钟';
  doc.querySelector('[data-pomo="toggle"]').textContent=v.endsAt?'暂停':'开始';
  doc.querySelector('[data-pomo="switch"]').textContent=v.mode==='focus'?'切到休息':'切到专注';
}
function pipNote(text){const note=pipWindow?.document.querySelector('#pipNote');if(!note)return;note.textContent=text;clearTimeout(note._t);note._t=setTimeout(()=>{note.textContent=''},4000)}
function renderPip(){
  const doc=pipWindow?.document;if(!doc?.querySelector('#pipList')||!S.user)return;
  const open=t=>['todo','doing'].includes(t.status);
  const tasks=sortTasks(scheduleTasks().filter(t=>taskActiveOn(t,S.today)&&!isArchivedTask(t))).sort((a,b)=>open(b)-open(a));
  const tickable=t=>!S.user.admin&&t.assignee===S.user.id&&open(t);
  doc.querySelector('#pipSummary').textContent=`${fmt(S.today)} · 还剩 ${tasks.filter(open).length} 项`;
  doc.querySelector('#pipList').innerHTML=tasks.map(t=>`<li class="${open(t)?'':'closed'}"><label><input type="checkbox" data-id="${escapeHTML(t.id)}" ${open(t)?'':'checked'} ${tickable(t)?'':'disabled'}><span>${escapeHTML(t.name)}</span></label><small>${escapeHTML([t.time,S.user.admin?nameOf(t.assignee):'',projectName(t),open(t)?'':status(t)[1]].filter(Boolean).join(' · '))}</small></li>`).join('')||'<li class="empty">今天没有待办</li>';
  doc.querySelectorAll('#pipList input[data-id]:not([disabled])').forEach(box=>box.onchange=()=>pipComplete(box));
}
async function pipComplete(box){
  const t=S.tasks.find(x=>x.id===box.dataset.id);if(!t)return;
  box.disabled=true;
  try{
    await api('/api/action',{action:'task.complete',data:{id:t.id,summary:'完成任务',actual:Number(t.duration)||30,feeling:'顺利'}});
    await refresh();pipNote(`「${t.name}」已完成`);
  }catch(e){box.checked=false;box.disabled=false;pipNote(e.message)}
}
async function openPip(){
  if(!pipSupported())return;
  if(pipWindow){pipWindow.focus();return}
  try{pipWindow=await documentPictureInPicture.requestWindow({width:320,height:460})}catch(e){toast(`无法打开桌面小组件：${e.message}`);return}
  const doc=pipWindow.document;
  doc.title='今日待办';
  const style=doc.createElement('style');style.textContent=PIP_CSS;doc.head.append(style);
  doc.body.innerHTML='<header><strong>今日待办</strong><small id="pipSummary"></small></header><section class="pomo"><b id="pipClock">25:00</b><span id="pipMode"></span><div><button class="primary" data-pomo="toggle">开始</button><button data-pomo="reset">重置</button><button data-pomo="switch">切到休息</button></div></section><ul id="pipList"></ul><p id="pipNote"></p>';
  doc.querySelectorAll('[data-pomo]').forEach(b=>b.onclick=()=>pomoAction(b.dataset.pomo));
  renderPip();renderPomo();
  // The widget stays current while the main tab sits in the background.
  pipTimers=[setInterval(renderPomo,1000),setInterval(()=>refresh(),60000)];
  pipWindow.addEventListener('pagehide',()=>{pipTimers.forEach(clearInterval);pipTimers=[];pipWindow=null});
}
/* ---------------------------------------------------------------------------
   档案室 · a CSS 3D room: one card-catalogue cabinet per year, one drawer per
   month. Taking a drawer out brings it to the front of the room, its folders
   standing newest-first; hovering or focusing one lifts it out of the drawer
   and a click opens the whole brief. The snapshot only carries index cards;
   the full brief is fetched on open.
   ------------------------------------------------------------------------- */
const WEEKDAY_SHORT=['周日','周一','周二','周三','周四','周五','周六'];
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
function archiveFile(card,index){
  const d=new Date(`${card.date}T12:00:00`),t=card.totals||{};
  return `<button class="archive-file" data-date="${escapeHTML(card.date)}" style="--i:${index};--tab:${index%4}" aria-label="${escapeHTML(card.date)} 团队日报"><span class="file-sheet" aria-hidden="true"><span class="file-tab"><b>${d.getDate()}</b>${WEEKDAY_SHORT[d.getDay()]}</span><span class="file-paper"></span><span class="file-body"><strong>团队日报 · ${d.getMonth()+1}月${d.getDate()}日</strong><span>完成 ${t.completed||0}/${t.tasks||0} 项 · ${hours(t.load)}h</span><span>${t.members||0} 位成员 · ${t.projects||0} 个项目${card.riskCount?` · ${card.riskCount} 条关注`:''}</span></span></span></button>`;
}
function archiveCabinet(year,drawers){
  const slots=Array.from({length:12},(_,i)=>{
    const month=`${year}-${String(i+1).padStart(2,'0')}`,files=drawers.get(month)||[],out=UI.archiveOpen===month;
    return `<button class="cab-drawer${out?' is-out':''}" data-month="${month}"${files.length?'':' disabled'} aria-expanded="${out}" aria-label="${year} 年 ${i+1} 月 · ${files.length} 份"><span class="cab-label"><b>${i+1}月</b>${files.length?`<small>${files.length} 份</small>`:''}</span><span class="cab-pull" aria-hidden="true"></span></button>`;
  }).join('');
  return `<div class="cabinet"><span class="cabinet-top"></span><span class="cabinet-side is-left"></span><span class="cabinet-side is-right"></span><div class="cabinet-front"><span class="cabinet-plaque">${year}</span><div class="cabinet-drawers">${slots}</div></div></div>`;
}
function archiveDrawerStage(month,files){
  const [year,mon]=month.split('-');
  return `<div class="drawer-stage" style="--n:${files.length}"><div class="open-drawer"><span class="od-floor"></span><span class="od-side is-left"></span><span class="od-side is-right"></span><span class="od-back"></span>${files.map(archiveFile).join('')}<button class="od-front" aria-label="把 ${Number(mon)} 月抽屉放回"><span class="od-label"><small>${escapeHTML(year)}</small><b>${Number(mon)} 月</b><small>${files.length} 份</small></span><span class="od-pull" aria-hidden="true"></span></button></div></div><button class="secondary-btn drawer-return">放回抽屉</button>`;
}
const archiveStill=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||!document.body.animate;
function renderArchive(){
  const root=$('#archiveCabinet');if(!root)return;
  const cards=briefCards(),drawers=new Map(archiveDrawers(cards).map(x=>[x.month,x.files]));
  if(UI.archiveOpen&&!drawers.has(UI.archiveOpen))UI.archiveOpen=null;
  const thisYear=Number(String(S.today||'').slice(0,4))||new Date().getFullYear();
  const first=Math.min(thisYear,...cards.map(c=>Number(String(c.date).slice(0,4))).filter(Boolean));
  const years=Array.from({length:thisYear-first+1},(_,i)=>first+i);
  $('#archiveEyebrow').textContent=`团队日报 · ${cards.length} 份`;
  /* Refreshes re-render every view; leave the room alone unless something in it
     changed, so a lifted folder does not drop back mid-hover. */
  const key=JSON.stringify([cards,UI.archiveOpen]);
  if(root.dataset.key===key)return;
  root.dataset.key=key;
  const open=UI.archiveOpen;
  root.innerHTML=`<div class="archive-room${open?' is-open':''}" style="--years:${years.length}"><div class="room-stage"><div class="room-space"><span class="room-wall"></span><span class="room-floor"></span><div class="cabinet-row">${years.map(y=>archiveCabinet(y,drawers)).join('')}</div></div></div><span class="room-lamp" aria-hidden="true"></span><span class="room-dim"></span><div class="drawer-slot">${open?archiveDrawerStage(open,drawers.get(open)):''}</div></div>`;
  $$('#archiveCabinet .cab-drawer').forEach(b=>b.onclick=e=>UI.archiveOpen===b.dataset.month?closeArchiveDrawer():openArchiveDrawer(b.dataset.month,b,e.detail===0));
  bindArchiveDrawer();
}
function bindArchiveDrawer(){
  $$('#archiveCabinet .archive-file').forEach(b=>b.onclick=()=>openBrief(b.dataset.date));
  $$('#archiveCabinet .od-front,#archiveCabinet .drawer-return,#archiveCabinet .room-dim').forEach(b=>b.onclick=closeArchiveDrawer);
}
/* The drawer flies from its slot in the cabinet to the front of the room, and
   back again when it is returned. */
function archiveFlight(slot,stage){
  const a=slot.getBoundingClientRect(),front=stage.querySelector('.od-front').getBoundingClientRect(),box=stage.getBoundingClientRect();
  const ox=front.left+front.width/2-box.left,oy=front.top+front.height/2-box.top;
  stage.style.transformOrigin=`${ox}px ${oy}px`;
  return [{transform:`translate(${a.left+a.width/2-box.left-ox}px,${a.top+a.height/2-box.top-oy}px) scale(${a.width/front.width})`,opacity:.25},{transform:'none',opacity:1}];
}
function openArchiveDrawer(month,slot,byKey=false){
  const root=$('#archiveCabinet'),room=root?.querySelector('.archive-room');if(!room)return;
  const drawers=new Map(archiveDrawers(briefCards()).map(x=>[x.month,x.files]));
  if(!drawers.has(month))return;
  UI.archiveOpen=month;
  root.dataset.key=JSON.stringify([briefCards(),month]);
  root.querySelectorAll('.cab-drawer').forEach(b=>{const out=b.dataset.month===month;b.classList.toggle('is-out',out);b.setAttribute('aria-expanded',String(out))});
  room.classList.add('is-open');
  const holder=room.querySelector('.drawer-slot');
  holder.innerHTML=archiveDrawerStage(month,drawers.get(month));
  bindArchiveDrawer();
  const stage=holder.querySelector('.drawer-stage');
  if(slot&&!archiveStill())stage.animate(archiveFlight(slot,stage),{duration:560,easing:'cubic-bezier(.2,.8,.2,1)'});
  /* Keyboard users land on the front folder; a pointer is already where it wants to be. */
  if(byKey)holder.querySelector('.archive-file')?.focus({preventScroll:true});
}
function closeArchiveDrawer(){
  const root=$('#archiveCabinet'),room=root?.querySelector('.archive-room'),month=UI.archiveOpen;
  if(!room||!month)return;
  const slot=root.querySelector(`.cab-drawer[data-month="${month}"]`),stage=room.querySelector('.drawer-stage');
  UI.archiveOpen=null;
  root.dataset.key=JSON.stringify([briefCards(),null]);
  room.classList.remove('is-open');
  const done=()=>{if(UI.archiveOpen)return;room.querySelector('.drawer-slot').innerHTML='';slot?.classList.remove('is-out');slot?.setAttribute('aria-expanded','false');slot?.focus({preventScroll:true})};
  if(!slot||!stage||archiveStill()){done();return}
  const flight=stage.animate(archiveFlight(slot,stage).reverse(),{duration:420,easing:'cubic-bezier(.5,0,.75,0)',fill:'forwards'});
  flight.onfinish=done;
}
function briefFields(content){
  if(!content)return '';
  if(typeof content!=='object')return `<p class="brief-text">${escapeHTML(content)}</p>`;
  const rows=Object.entries(content).filter(([k,v])=>NOTICE_LABELS[k]&&String(v??'').trim());
  return rows.length?`<dl class="notice-fields">${rows.map(([k,v])=>`<div><dt>${NOTICE_LABELS[k]}</dt><dd>${escapeHTML(v)}</dd></div>`).join('')}</dl>`:'';
}
function briefDocument(brief){
  const c=brief.content||{},t=c.totals||{},d=new Date(`${brief.date}T12:00:00`);
  const entry=(title,meta,body)=>`<div class="brief-entry"><div class="brief-entry-head"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(meta)}</span></div>${body}</div>`;
  return `<article class="brief-doc"><header class="brief-head"><div class="eyebrow">档案室 · 团队日报</div><h2>${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 · ${WEEKDAY_SHORT[d.getDay()]}</h2><div class="brief-stats"><div><b>${t.completed||0}/${t.tasks||0}</b><span>完成任务</span></div><div><b>${hours(t.load)}h</b><span>完成工时</span></div><div><b>${t.members||0}</b><span>位成员</span></div><div><b>${t.projects||0}</b><span>个项目</span></div></div></header>`
    +(c.risks?.length?`<section class="brief-section"><h3>需要关注</h3><ul class="brief-risks">${c.risks.map(r=>`<li>${escapeHTML(r)}</li>`).join('')}</ul></section>`:'')
    +(c.projects?.length?`<section class="brief-section"><h3>项目进展</h3>${c.projects.map(p=>entry(p.name,`Owner · ${p.ownerName||p.owner||''} · ${p.source==='owner'?'Owner 汇报':'系统汇总'} · ${p.completed}/${p.tasks} 完成`,briefFields(p.content))).join('')}</section>`:'')
    +(c.members?.length?`<section class="brief-section"><h3>成员总结</h3>${c.members.map(m=>entry(m.name,`${m.completed}/${m.tasks} 完成 · ${hours(m.load)}h · ${m.source==='diary'?'本人日记':'系统统计'}`,briefFields(m.summary))).join('')}</section>`:'')
    +'</article>';
}
async function openBrief(date){
  let brief;
  try{brief=await api('/api/action',{action:'brief.get',data:{date}})}catch(e){toast(e.message);return}
  openModal(`${briefDocument(brief)}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">关闭</button></div>`);
  $('#modalBackdrop .modal')?.classList.add('is-wide');
  $('#cancelAction').onclick=closeModal;
}
/* Inbox housekeeping: delete a notice from its card, or switch to 管理 to pick
   several. Invitations are answered rather than deleted, so they never take part. */
async function deleteNotices(ids,read=false){
  try{
    const r=await api('/api/action',{action:'inbox.delete',data:read?{read:true}:{ids}});
    (ids||[]).forEach(id=>UI.inboxPicked?.delete(id));
    await refresh();toast(r.deleted?`已删除 ${r.deleted} 条通知`:'没有可删除的通知');
  }catch(e){toast(e.message)}
}
function renderInboxToolbar(){
  const bar=$('#inboxToolbar');if(!bar)return;
  const manage=Boolean(UI.inboxManage),ids=(S.notifications||[]).map(n=>n.id);
  UI.inboxPicked=new Set([...(UI.inboxPicked||[])].filter(id=>ids.includes(id)));
  const picked=UI.inboxPicked.size;
  $('#manageInboxBtn').textContent=manage?'完成':'管理';
  bar.classList.toggle('hidden',!manage);
  if(!manage)return;
  bar.innerHTML=`<label class="inbox-pick-all"><input type="checkbox" id="inboxPickAll" ${ids.length&&picked===ids.length?'checked':''} ${ids.length?'':'disabled'}>全选</label><span class="inbox-picked">已选 ${picked} 条</span><button class="secondary-btn" id="inboxDeletePicked" ${picked?'':'disabled'}>删除所选</button><button class="secondary-btn" id="inboxDeleteRead" ${(S.notifications||[]).some(n=>n.read)?'':'disabled'}>清除已读</button>`;
  $('#inboxPickAll').onchange=e=>{UI.inboxPicked=new Set(e.target.checked?ids:[]);renderInbox()};
  $('#inboxDeletePicked').onclick=()=>deleteNotices([...UI.inboxPicked]);
  $('#inboxDeleteRead').onclick=()=>deleteNotices(null,true);
}
function openSearch(){openModal(`<div class="eyebrow">工作台搜索</div><h2>搜索任务与项目</h2><label class="form-field">关键词<input id="searchQuery" placeholder="搜索"></label><div id="searchResults" class="search-results"><span class="muted">输入关键词开始搜索</span></div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">关闭</button></div>`);$('#cancelAction').onclick=closeModal;const input=$('#searchQuery'),results=$('#searchResults');input.oninput=()=>{const q=input.value.trim().toLowerCase();if(!q){results.innerHTML='<span class="muted">输入关键词开始搜索</span>';return}const ts=(S.user?.admin?S.tasks.filter(t=>!isSuperseded(t)):scheduleTasks()).filter(t=>[t.name,t.assignee,projectName(t)].some(v=>String(v||'').toLowerCase().includes(q)));const ps=S.projects.filter(p=>[p.name,p.owner,p.desc].some(v=>String(v||'').toLowerCase().includes(q)));results.innerHTML=ts.map(t=>`<button class="search-result" data-task="${escapeHTML(t.id)}"><strong>${escapeHTML(t.name)}</strong><small>${escapeHTML(t.assignee)} · ${escapeHTML(projectName(t))}</small></button>`).join('')+ps.map(p=>`<button class="search-result" data-project="${escapeHTML(p.id)}"><strong>${escapeHTML(p.name)}</strong><small>Owner · ${escapeHTML(p.owner)} · ${projectStatus(p)}</small></button>`).join('')||'<span class="muted">没有找到匹配项</span>';$$('.search-result').forEach(b=>b.onclick=()=>{if(b.dataset.task)openDrawer(b.dataset.task);else{closeModal();switchView('projects')}})};input.focus()}
$$('.nav-item').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$('#workspaceSwitcher')?.addEventListener('click',()=>toggleAccountMenu());
$('#workspaceSwitcher')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleAccountMenu()}});
document.addEventListener('click',e=>{
  const menu=$('#accountMenu');if(!menu||menu.classList.contains('hidden'))return;
  if(e.target.closest('#accountMenu')||e.target.closest('#workspaceSwitcher'))return;
  toggleAccountMenu(false);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleAccountMenu(false)});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&UI.view==='archive'&&UI.archiveOpen&&$('#modalBackdrop').classList.contains('hidden'))closeArchiveDrawer()});$$('.filter-link').forEach(b=>b.onclick=()=>{UI.filter=b.dataset.filter;switchView('today')});$$('.quick-tab').forEach(b=>b.onclick=()=>{UI.filter=b.dataset.filter;renderToday()});$('#prevDay').onclick=()=>{UI.dayOffset=(UI.dayOffset||0)-1;renderToday()};$('#nextDay').onclick=()=>{if(displayDay()>=DATE_HORIZON){toast(`日期范围目前只支持到 ${DATE_HORIZON}`);return}UI.dayOffset=(UI.dayOffset||0)+1;renderToday()};$('#inboxBtn').onclick=()=>switchView('inbox');document.querySelector('.icon-btn[title="搜索"]').onclick=openSearch;$('#closeDrawer').onclick=closeDrawer;$('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};$('#taskDrawer').onclick=e=>{if(e.target.id==='taskDrawer')closeDrawer()};$('#backWeekBtn').onclick=()=>switchView('calendar');$('#backTodayBtn').onclick=()=>{if(UI.selectedWeek)UI.weekDir=UI.selectedWeek>0?'prev':'next';UI.selectedWeek=0;UI.dayOffset=0;switchView('calendar');renderCalendar()};$('#prevWeekBtn').onclick=()=>turnWeek(-1);$('#nextWeekBtn').onclick=()=>turnWeek(1);document.addEventListener('keydown',e=>{if(UI.view!=='calendar'||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,[contenteditable]')||!$('#modalBackdrop').classList.contains('hidden')||!$('#taskDrawer').classList.contains('hidden'))return;if(e.key==='ArrowLeft'){e.preventDefault();turnWeek(-1)}else if(e.key==='ArrowRight'){e.preventDefault();turnWeek(1)}});$('#addProjectBtn').onclick=newProject;$('#addProjectTopBtn').onclick=newProject;$('#addTaskBtn').onclick=newTask;$('#emptyAddBtn').onclick=newTask;$('#timelineAddProjectBtn').onclick=newProject;$('#createFixedBtn').onclick=fixedTask;$('#collectionSettingsBtn').onclick=collectionSettings;$('#forceAssignBtn').onclick=()=>switchView('projects');$('#runAutomationBtn').onclick=()=>act('scheduler.run',{});$('#markAllReadBtn').onclick=()=>act('inbox.read',{all:true});$('#manageInboxBtn').onclick=()=>{UI.inboxManage=!UI.inboxManage;UI.inboxPicked=new Set();renderInbox()};$('#generateSummaryBtn').onclick=openTodayDiary;
window.addEventListener('focus',()=>{if(UI.view==='inbox')refreshInboxState()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&UI.view==='inbox')refreshInboxState()});
$('#pipBtn').classList.toggle('hidden',!pipSupported());$('#pipBtn').onclick=openPip;
hydrateIcons();
if(location.protocol==='file:'){showAuth()}else{refresh()}

/* Embedded Agent UI: superadmin-managed OpenAI-compatible endpoint via server proxy. */
const AGENT_CONFIG_KEY='work-calendar-agent-config-v1';
const TRANSCRIBE_ENDPOINT='/api/transcribe';
const OPENCODE_GO_ENDPOINT='https://opencode.ai/zen/go/v1/chat/completions';
const OPENCODE_GO_MODELS=['glm-5.3-flash','glm-5.3','glm-5.2','glm-5.1','kimi-k3','kimi-k2.7-code','kimi-k2.6','longcat-2.0','deepseek-v4.1-flash','deepseek-v4-pro','deepseek-v4-flash','deepseek-v4-flash-vision-exp','mimo-v2.5','mimo-v2.5-pro','hy4-preview','hy3','grok-4.5'];
const agentState={messages:[],busy:false,steps:0,failures:0,mode:null,lastActionKey:'',repeats:0,autoRun:false,stop:false,pendingResolve:null,sessionId:(globalThis.crypto?.randomUUID?.()||`wc-${Date.now()}-${Math.random().toString(36).slice(2)}`)};
let agentServerConfig=null;
let agentServerAsr=null;
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
  e.innerHTML=`<span class="agent-role-chip ${operator?'is-operator':''}">${escapeHTML(operator?'操作员':'只读')}</span>`;
  renderAgentModelChip();
}
/* Which model is answering, at a glance — "not configured" is the state that
   actually needs to be visible, since everything else is self-evident. */
function renderAgentModelChip(){
  const el=$('#agentModelChip');if(!el)return;
  const cfg=agentServerConfig||{};
  const ready=Boolean(cfg.configured);
  el.className='agent-model '+(ready?'ready':'missing');
  el.textContent=ready?(cfg.model||'已接入'):'未接入';
  el.title=ready
    ?('当前模型：'+(cfg.model||'（服务端已配置）')+(cfg.provider?' · '+cfg.provider:''))
    :'还没有配置模型，点右上角的齿轮填写 API';
}

/* Sample prompts on an empty transcript: the panel explains itself better by
   being tried than by being described. */
function agentSamples(context){
  const c=context||agentContext();
  const items=[{text:'今天有哪些任务要交？'},{text:'团队这周的负载怎么样？'}];
  if(c.mode==='operator')items.push({text:'哪些人的任务逾期了？'});
  else items.push({text:'我这个月完成了多少任务？'});
  items.push({text:'下周把季度复盘做完：整理数据、出初稿、找王零零评审',plan:true});
  return items;
}
function agentRenderEmptyState(list){
  const samples=agentSamples();
  list.innerHTML='<div class="agent-samples">'
    +samples.map(s=>`<button type="button" class="agent-sample ${s.plan?'is-plan':''}" data-text="${escapeHTML((s.plan?AGENT_PLAN_MARK+' ':'')+s.text)}">`
      +(s.plan?icon('sparkles'):'')+escapeHTML(s.text)+'</button>').join('')
    +'</div>';
  $$('#agentMessages .agent-sample').forEach(b=>b.onclick=()=>{
    const input=$('#agentInput');if(!input)return;
    input.value=b.dataset.text;
    agentSyncPlanButton();
    input.focus();
  });
}
function agentAppend(role,content,kind='',intent=''){
  agentState.messages.push({role,content});
  const list=$('#agentMessages');if(!list)return;
  const el=document.createElement('div');
  el.className=`agent-message ${role==='user'?'user':'assistant'} ${kind}`.trim();
  const chip=agentIntentChip(intent);
  if(chip)el.appendChild(chip);
  /* The chip carries the intent, so the mark itself would just be noise in the
     bubble — the stored line keeps it, the transcript does not. */
  const shown=intent==='plan'?agentPlanIntent(content).body:content;
  el.appendChild(document.createTextNode(shown));
  list.appendChild(el);list.scrollTop=list.scrollHeight;
  return el;
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
  const summary=document.createElement('summary');summary.textContent=`执行过程 · ${count} 步`;
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
  let trail=[];
  const flush=()=>{agentFoldRun(trail).forEach(n=>box.appendChild(n));trail=[]};
  messages.forEach(m=>{const node=agentMessageNode(m);if(!node)return;if(m.role==='user'){flush();box.appendChild(node)}else trail.push(node)});
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
  chip.innerHTML=icon('sparkles')+escapeHTML(intent==='plan'?'规划任务':'');
  return chip;
}
function agentFormatTime(iso){try{return new Date(iso).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(_){return iso||''}}
function agentMessageNode(m){
  /* A blank line carries nothing, and older transcripts still hold a couple
     from when an empty model reply was recorded. Rendering them is what made
     the room look broken, so every caller gets null instead. */
  if((m.role==='user'||m.role==='assistant')&&!String(m.content||'').trim())return null;
  const node=document.createElement('div');
  if(m.role==='action'){
    const label=AGENT_ACTION_LABELS[m.action]||m.action||'操作';
    node.className='agent-message assistant agent-action-record';
    node.innerHTML=`<div class="agent-action-title">已执行 · ${escapeHTML(label)}</div><pre class="agent-action-payload">${escapeHTML(JSON.stringify(m.data||{},null,2))}</pre><small class="agent-time">${escapeHTML(agentFormatTime(m.createdAt))}</small>`;
    return node;
  }
  node.className=`agent-message ${m.role==='user'?'user':'assistant'}`;
  const intent=m.role==='user'?agentPlanIntent(m.content):{plan:false,body:m.content||''};
  const chip=agentIntentChip(intent.plan?'plan':'');
  if(chip)node.appendChild(chip);
  const text=document.createElement('span');text.textContent=intent.plan?intent.body:(m.content||'');node.appendChild(text);
  const stamp=document.createElement('small');stamp.className='agent-time';stamp.textContent=agentFormatTime(m.createdAt);node.appendChild(stamp);
  return node;
}
async function agentLoadOwnHistory(){
  try{
    const data=await api('/api/action',{action:'agent.history',data:{}});
    const messages=data.messages||[],list=$('#agentMessages');if(!list)return;
    list.innerHTML='';
    /* A card still waiting for a click is not part of the stored transcript,
       so rebuilding the list used to erase it while the run kept waiting on
       it — the run stayed busy forever and every later message was dropped in
       silence. Attach it back rather than losing the run. */
    const restoreCard=()=>{
      const card=agentState.pendingCard;
      if(card&&agentState.pendingResolve&&!card.isConnected)list.appendChild(card);
    };
    if(!messages.length){agentRenderEmptyState(list);restoreCard();list.scrollTop=list.scrollHeight;return}
    /* A blank line is not a turn. One used to be stored whenever the model
       came back empty, and replaying it made the server refuse every later
       request — the transcript must never carry it forward. */
    const turns=messages.filter(m=>(m.role==='user'||m.role==='assistant')&&String(m.content||'').trim());
    agentState.messages=turns.map(m=>({role:m.role,content:m.content}));
    agentRenderTranscript(list,messages);
    restoreCard();
    list.scrollTop=list.scrollHeight;
  }catch(_){}
}
async function agentShowHistory(){
  const admin=Boolean(S.user?.admin);
  openModal(`<div class="eyebrow">WORK AGENT · 工作记录</div><h2>AI 工作记录</h2>${admin?`<label class="form-field">查看账户<select id="agentHistoryUser">${S.users.map(u=>`<option value="${escapeHTML(u.id)}">${escapeHTML(u.id)}</option>`).join('')}</select></label>`:''}<div id="agentHistoryList" class="agent-history-list"></div><div class="modal-footer"><button class="secondary-btn" id="agentHistoryClear">清空记录</button><button class="primary-btn" id="agentHistoryClose">关闭</button></div>`);
  const target=()=>$('#agentHistoryUser')?.value||S.user.id;
  const load=async()=>{const box=$('#agentHistoryList');box.innerHTML='<p class="muted">正在加载…</p>';try{const data=await api('/api/action',{action:'agent.history',data:{userId:target()}});const msgs=data.messages||[];box.innerHTML='';if(!msgs.length){box.innerHTML='<p class="muted">该账户暂无 AI 工作记录。</p>';return}agentRenderTranscript(box,msgs)}catch(e){box.innerHTML=`<p class="muted">加载失败：${escapeHTML(e.message||'')}</p>`}};
  $('#agentHistoryUser')?.addEventListener('change',load);
  $('#agentHistoryClose').onclick=closeModal;
  $('#agentHistoryClear').onclick=async()=>{if(!confirm(`确认清空 ${target()} 的 AI 工作记录？`))return;try{await api('/api/action',{action:'agent.history.clear',data:{userId:target()}});toast('记录已清空');await load()}catch(e){toast(e.message||'清空失败')}};
  await load();
}
function agentSetConfigVisible(show){
  $('#agentConfig')?.classList.toggle('hidden',!show);
  if(show){const c=agentServerConfig||agentConfig();const provider=c.provider||'custom';$('#agentProvider').value=provider;agentRenderModelOptions(c.model||'');$('#agentEndpoint').value=c.baseUrl||c.endpoint||(provider==='opencode-go'?OPENCODE_GO_ENDPOINT:'');$('#agentApiKey').value='';$('#agentCustomModel').value=provider==='custom'?(c.model||''):'';agentSyncProviderUI()}
}
function agentRenderModelOptions(selected=''){
  const select=$('#agentModelSelect');if(!select)return;
  const models=(agentServerConfig?.opencodeGoModels?.length?agentServerConfig.opencodeGoModels:OPENCODE_GO_MODELS);
  select.innerHTML=models.map(m=>`<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
  if(selected&&models.includes(selected))select.value=selected;
}
function agentSyncProviderUI(){const provider=$('#agentProvider')?.value||'custom',custom=provider==='custom';$('#agentEndpoint').placeholder=custom?'https://api.example.com/v1/chat/completions':OPENCODE_GO_ENDPOINT;if(!custom){$('#agentEndpoint').value=OPENCODE_GO_ENDPOINT;$('#agentModelSelect').classList.remove('hidden');$('#agentCustomModel').classList.add('hidden')}else{$('#agentModelSelect').classList.add('hidden');$('#agentCustomModel').classList.remove('hidden')}}
/* The speech-to-text fields mirror the chat fields: superadmin-only, with the
   key never echoed back. Empty endpoint means "not configured". */
function renderAgentAsrConfig(){
  const separator=$('#agentAsrEndpoint')?.closest('.agent-asr-config');
  if(!separator)return;
  separator.classList.toggle('hidden',!S.user?.admin);
  if(!S.user?.admin)return;
  const cfg=agentServerAsr||{};
  if($('#agentAsrEndpoint'))$('#agentAsrEndpoint').value=cfg.baseUrl||'';
  if($('#agentAsrModel'))$('#agentAsrModel').value=cfg.model||'';
  if($('#agentAsrLanguage'))$('#agentAsrLanguage').value=cfg.language||'zh';
  if($('#agentAsrApiKey'))$('#agentAsrApiKey').value='';
  const state=$('#agentAsrModel');
  if(state)state.title=cfg.configured?`当前已启用：${cfg.model||''}`:'当前未启用，语音输入回退到浏览器识别';
}
async function agentLoadServerConfig(){
  try{agentServerConfig=await api('/api/action',{action:'agent.config.get',data:{}})}catch(_){agentServerConfig=null}
  try{agentServerAsr=await api('/api/action',{action:'agent.asr.get',data:{}})}catch(_){agentServerAsr=null}
  renderAgentModelChip();renderAgentAsrConfig();agentInitVoice();
}
function agentExtractText(data){
  const text=data?.choices?.[0]?.message?.content||data?.choices?.[0]?.text||data?.message?.content||data?.message||data?.content||data?.text;
  if(text)return text;
  /* Some gateways deliver the answer under reasoning_content instead. Checked
     last so a normal reply always wins. */
  return data?.choices?.[0]?.message?.reasoning_content||data?.reasoning_content||'';
}
async function agentRequest(messages){
  /* Every role uses the authenticated server proxy. The browser never sends
     an API key or chooses a model, so members cannot bypass superadmin policy
     through localStorage or a direct cross-origin request. */
  const data=await api('/api/agent/chat',{messages,sessionId:agentState.sessionId});
  const text=agentExtractText(data);if(!text)throw new Error('服务端 Agent 未返回文本');return String(text);
}
const AGENT_ACTION_LABELS={
  'task.create':'创建任务','task.update':'调整任务','task.delete':'删除任务','task.complete':'完成任务',
  'task.edit_review':'审批修改申请','project.create':'创建项目',
  'project.review':'审批项目','project.update':'调整项目','project.invite':'邀请协作者',
  'project.complete_review':'审批项目结项','assignment.manual':'强行指派','repeat.create':'创建固定安排',
  'repeat.update':'调整固定安排','repeat.skip':'挖空固定安排','account.create':'创建账户',
  'account.toggle':'停用/启用账户','account.delete':'删除账户','request.manage':'处理协作邀请','report.manage':'管理日报',
  'automation.update':'更新自动化设置','collection.update':'更新补报时间','profile.correct':'修正成员画像',
  'scheduler.run':'运行一次调度检查'
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
  toast(next==='auto'?'助手会一路做完，不再逐步问你':'助手每做一步都会先等你确认');
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
const AGENT_PLAN_ALIASES=[AGENT_PLAN_MARK,'/plan','[规划]'];
function agentPlanIntent(text){
  const raw=String(text||'').replace(/^\s+/,'');
  for(const alias of AGENT_PLAN_ALIASES){
    if(!raw.startsWith(alias))continue;
    return {plan:true,body:raw.slice(alias.length).replace(/^\s+/,'')};
  }
  return {plan:false,body:String(text||'')};
}
function agentTogglePlan(){
  const input=$('#agentInput');if(!input||agentState.busy)return;
  const intent=agentPlanIntent(input.value);
  /* Clicking again takes the mark back off, so the switch is never a trap. */
  if(intent.plan)input.value=intent.body;
  else input.value=AGENT_PLAN_MARK+' '+input.value;
  agentSyncPlanButton();
  input.focus();
}
function agentSyncPlanButton(){
  const input=$('#agentInput');
  const on=Boolean(input)&&agentPlanIntent(input.value).plan;
  const btn=$('#agentPlanBtn');
  if(btn){
    btn.classList.toggle('is-on',on);
    btn.setAttribute('aria-pressed',on?'true':'false');
  }
  $('#agentPlanHint')?.classList.toggle('hidden',!on);
}
function agentSplitPlan(text){
  let plan=[];
  const clean=String(text||'').replace(/<plan>([\s\S]*?)<\/plan>/gi,(_,body)=>{
    try{
      const parsed=JSON.parse(body.trim());
      if(Array.isArray(parsed))plan=parsed.filter(x=>x&&typeof x==='object'&&x.name);
    }catch(_){}
    return '';
  }).trim();
  return {clean,plan};
}

/* Runs are meant to go the distance for a real job, so the ceiling sits far
   above anything a sane task needs. What actually prevents a runaway is the
   refusal budget and the repeat detector below, not the step count. */
const AGENT_MAX_STEPS=200;
const AGENT_MAX_FAILURES=5;    /* repairs a few refusals, then stops */
const AGENT_MAX_REPEATS=2;     /* same action proposed this many extra times */
const AGENT_CONTEXT_LIMIT=24;  /* how many turns we replay back to the model */

function agentContext(){
  return {role:S.agentCapabilities?.role||'member',mode:S.agentCapabilities?.mode||'readonly'};
}
const AGENT_PLAN_RULE='这次是一条任务规划请求：把用户那句话拆成一组标准任务，'
  +'但不要执行任何操作，不要输出 <action> 动作块，也不要声称已经创建。'
  +'先用一两句话说明拆解思路，然后另起一行输出一个 <plan> 块，块里是单行 JSON 数组：'
  +'<plan>[{"name":"任务名","projectId":"项目ID","assignee":"负责人账户","date":"YYYY-MM-DD",'
  +'"deadline":"可选","priority":"P0/P1/P2","duration":分钟数}]</plan>。'
  +'规则：name 只写任务本身，不要带项目名前缀；projectId 与 assignee 必须用数据里真实存在的 id（负责人写账户 id，不是中文名）；'
  +'date 不早于今天、不晚于可排期上限；宁可少拆几个也不要编造不存在的项目或账户；'
  +'确实无法确定负责人时，用当前账户。';
function agentSystemPrompt(context,planning){
  /* The rule lives in the system prompt rather than wrapped around the user's
     words, so the stored transcript stays exactly what was typed. */
  if(planning)return `你是「战略小组台账」工作助手。当前账户角色：${context.role}，权限模式：${context.mode}。${AGENT_PLAN_RULE}`;
  const rule=context.mode==='operator'
    ?'用户要求改动数据时，输出一个 <action>{"action":"…","data":{…}}</action> 动作块，一次只输出一个动作，然后停下来等待系统回执。系统会把结果以【系统回执】或【系统回执·失败】的形式发给你。收到成功回执后，先看回执里的「数据核对」，确认这一步确实产生了预期的变化，再输出下一个动作；核对结果与预期不符就先修正它。如果用户的目标还没完成就继续输出下一个动作，完成了就用一句话总结并明确结束。收到失败回执时先读懂原因：如果是缺了前置步骤（例如负责人还没加入项目、项目还没审批），就输出补救动作把它补上再继续；如果确实做不到，用一句话说明原因并结束。绝对不要在收到回执之前声称操作已经完成，也不要重复提交同一个已经失败的动作。'
    :'你是只读助手，不能创建、指派、修改或审批任何数据。';
  return `你是「战略小组台账」工作助手。当前账户角色：${context.role}，权限模式：${context.mode}。遵守服务端权限边界：${rule}`;
}
function agentRecentMessages(){
  /* Last line of defence: the proxy refuses an empty message, and a blank turn
     carries nothing the model needs anyway. */
  return agentState.messages
    .filter(x=>String(x.content||'').trim())
    .slice(-AGENT_CONTEXT_LIMIT)
    .map(x=>({role:x.role,content:x.content}));
}
async function agentNext(context){
  const answer=await agentRequest([{role:'system',content:agentSystemPrompt(context)},...agentRecentMessages()]);
  const {clean,actions}=agentSplitActions(answer);
  if(clean)agentAppend('assistant',clean);
  return actions;
}
/* A second look at the ledger after every write. The model is told what the
   data actually looks like now, so it cannot treat a return value as proof and
   has to reconcile the two before moving on. */
function agentFingerprint(){
  const of=(list,fields)=>Object.fromEntries((list||[]).map(x=>[x.id,fields.map(f=>String(x[f]==null?'':x[f])).join('|')]));
  return {
    tasks:of(S.tasks,['name','status','assignee','date','deadline','priority']),
    projects:of(S.projects,['name','status','owner']),
    users:of(S.users,['active','role','displayName','nickname']),
    repeats:of(S.repeats,['name','active','every','span']),
  };
}
function agentVerify(before,after){
  const kinds={tasks:['任务',()=>S.tasks],projects:['项目',()=>S.projects],
               users:['账户',()=>S.users],repeats:['固定安排',()=>S.repeats]};
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
    if(added.length)bits.push('新增 '+added.map(nameOf).join('、'));
    if(removed.length)bits.push('移除 '+removed.join('、'));
    if(changed.length)bits.push('更新 '+changed.map(nameOf).join('、'));
    out.push(label+bits.join('，'));
  }
  return out;
}
function agentSummarize(result){
  if(result==null)return '已完成';
  if(typeof result!=='object')return String(result).slice(0,300);
  if(result.deleted)return '已删除';
  if(result.id)return `记录 ${result.id}`;
  try{return JSON.stringify(result).slice(0,300)}catch(_){return '已完成'}
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
  if(send){send.disabled=agentState.busy;send.textContent=agentState.busy?'…':'发送'}
  if(stop){stop.classList.toggle('hidden',!agentState.busy);stop.textContent=agentState.steps?`停止（已执行 ${agentState.steps} 步）`:'停止'}
  const mic=$('#agentMicBtn');
  if(mic){mic.disabled=agentState.busy;mic.setAttribute('aria-disabled',agentState.busy?'true':'false')}
  /* Say on the composer itself what the run is waiting for, so a paused card
     is never mistaken for a composer that ate the message. */
  if(input){
    input.placeholder=agentState.pendingResolve?'等待确认…'
      :agentState.busy?'处理中…'
      :voice.active?'正在聆听…'
      :'问点什么…';
  }
}
function agentHalt(note){
  agentState.stop=true;agentState.autoRun=false;
  const pending=agentState.pendingResolve;
  agentState.pendingResolve=null;
  if(pending)pending({cancelled:true});
  if(note)agentAppend('assistant',note,'');
}
function agentRunOne(proposal){
  /* Renders one action card. The first card of a run also asks how the run
     should proceed; after that the step simply executes. */
  return new Promise(resolve=>{
    const list=$('#agentMessages');
    if(!list){resolve({cancelled:true});return}
    const label=AGENT_ACTION_LABELS[proposal.action]||proposal.action;
    const payload=agentTidyTaskName(proposal.action,(proposal.data&&typeof proposal.data==='object')?proposal.data:{});
    /* The pace comes from the standing switch beside the input, so the card
       only has to show what is about to happen. */
    const card=document.createElement('div');
    card.className='agent-message assistant agent-action';
    card.innerHTML=`<div class="agent-action-title">待确认操作 · ${escapeHTML(label)}</div>`
      +`<pre class="agent-action-payload">${escapeHTML(JSON.stringify(payload,null,2))}</pre>`
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
        buttons.innerHTML='<span class="agent-action-done">已取消</span>';
      resolve(value);
    };
    agentState.pendingResolve=finish;
    agentState.pendingProposal=proposal;
    agentState.pendingCard=card;
    const buttons=card.querySelector('.agent-action-buttons');
    const cancel=()=>{card.remove();agentHalt();finish({cancelled:true})};
    const execute=async()=>{
      buttons.innerHTML='<span class="agent-action-done">执行中…</span>';
      const before=agentFingerprint();
      try{
        const result=await api('/api/action',{action:'agent.execute',data:{action:proposal.action,data:payload,confirmed:true}});
        await refresh();
        /* The ledger is read again here rather than trusting the return value:
           a step that reports success but changed nothing has to be visible to
           the model before it plans the next one. */
        const diff=agentVerify(before,agentFingerprint());
        const summary=agentSummarize(result);
        buttons.innerHTML='<span class="agent-action-done">已执行</span>';
        toast(`已${label}`);
        agentRecordStep(`已${label} · ${summary}`,
          `【系统回执】${label} 执行成功，返回：${summary}。`
          +`数据核对：${diff.length?diff.join('；'):'没有发现任何变化'}。`
          +`先核对这一步有没有达到预期：达到了再输出下一个动作；对不上或没生效，先修正它再继续。`);
        finish({label,result});
      }catch(err){
        const message=err?.message||'执行失败';
        toast(message);
        agentState.failures+=1;
        /* Hand the refusal back to the model instead of ending the run here.
           The failure usually names the step that is missing, so the model can
           supply it and finish what the user actually asked for. */
        buttons.innerHTML='<span class="agent-action-done">未执行</span>';
        agentRecordStep(`执行未通过 · ${label}`,
          `【系统回执·失败】${label} 没有执行。原因：${message}。`
          +`请判断能否再补一步达成用户的目标：能就输出那个补救动作，不能就用一句话说明原因并结束。`
          +`不要重复提交同一个动作。`);
        finish({failed:true});
      }
    };
    buttons.innerHTML='<button class="ghost-btn agent-action-cancel">取消</button>'
      +'<button class="ghost-btn agent-action-handover hidden">后续自动做完</button>'
      +'<button class="primary-btn agent-action-confirm">确认执行</button>';
    /* The composer now reads as busy while this card waits, so refresh it. */
    agentUpdateBusy();
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
      agentAppend('assistant','当前账户为只读权限，无法执行该操作。','error');
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
          agentAppend('assistant',`模型连续几次提出同一个「${AGENT_ACTION_LABELS[proposal.action]||proposal.action}」，看起来是卡住了，先停在这里。可以说一句换个做法。`,'error');
          stalled=true;break;
        }
      }else{
        agentState.lastActionKey=key;agentState.repeats=0;
      }
      const outcome=await agentRunOne(proposal);
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
    agentAppend('assistant',`已连续执行 ${steps} 步，为安全起见先停在这里。你可以继续追问，我会接着往下做。`,'');
  else if(stalled&&agentState.failures>=AGENT_MAX_FAILURES)
    agentAppend('assistant',`连续 ${agentState.failures} 步没有通过校验，先停在这里。可以补充必要信息，或手动处理后让我接着做。`,'error');
  return steps;
}
async function agentSubmit(){
  const input=$('#agentInput'),text=input?.value.trim();if(!text)return;
  /* Dropping this on the floor is what made a stuck run look like it was
     eating messages: the text stayed in the box and nothing happened. */
  if(agentState.busy){
    toast(agentState.pendingResolve?'上一步还在等你确认：点卡片上的按钮，或点「停止」结束这次执行'
                               :'助手还在处理上一条消息，点「停止」可以打断它');
    return;
  }
  const intent=agentPlanIntent(text);
  /* The mark is the request itself — no separate mode to remember. */
  if(intent.plan){input.value='';agentSyncPlanButton();return agentPlanSubmit(intent.body)}
  input.value='';const asked=agentAppend('user',text);
  agentState.autoRun=false;agentState.stop=false;agentState.steps=0;agentState.failures=0;
  agentState.mode=agentPref();agentState.lastActionKey='';agentState.repeats=0;
  agentState.pendingResolve=null;
  agentState.busy=true;agentUpdateBusy();
  try{
    await agentLoop(agentContext());
  }catch(e){
    agentAppend('assistant',e?.message||'暂时无法连接 Agent 服务。','error');
  }
  agentFoldTrail(asked);
  agentState.busy=false;agentState.autoRun=false;agentState.steps=0;
  agentState.pendingResolve=null;
  agentUpdateBusy();
  input.focus();
}
/* Plan a set of tasks from free text. The model returns a <plan> array, the
   user approves a rendered table, and only then does anything get written. */
async function agentPlanSubmit(body){
  const input=$('#agentInput');
  const source=body===undefined?(input?.value||''):body;
  const text=agentPlanIntent(source).body.trim();
  if(!text){toast('先在输入框里写下你的安排');return}
  if(agentState.busy){
    toast(agentState.pendingResolve?'上一步还在等你确认：点卡片上的按钮，或点「停止」结束这次执行'
                               :'助手还在处理上一条消息，点「停止」可以打断它');
    return;
  }
  const shown=AGENT_PLAN_MARK+' '+text;
  input.value='';agentSyncPlanButton();
  agentAppend('user',shown,'','plan');
  agentState.busy=true;agentUpdateBusy();
  agentState.stop=false;agentState.steps=0;agentState.failures=0;agentState.mode=agentPref();
  agentState.lastActionKey='';agentState.repeats=0;agentState.pendingResolve=null;
  try{
    const answer=await agentRequest([{role:'system',content:agentSystemPrompt(agentContext(),true)},...agentRecentMessages()]);
    const {clean,plan}=agentSplitPlan(answer);
    if(clean)agentAppend('assistant',clean);
    if(!plan.length)agentAppend('assistant','没能从这段内容里拆出任务。可以写得更具体一点，比如「下周三给 wang00 安排一次 2 小时的季度复盘」。','error');
    else agentPlanCard(plan.map(item=>agentTidyTaskName('task.create',item)));
  }catch(e){
    agentAppend('assistant',e?.message||'暂时无法连接 Agent 服务。','error');
  }
  agentState.busy=false;agentUpdateBusy();
  input.focus();
}
function agentPlanCard(items){
  const list=$('#agentMessages');if(!list)return;
  const projectName=id=>{const hit=(S.projects||[]).find(x=>x.id===id);return hit?hit.name:(id||'—')};
  /* The panel is about 380px wide; a six-column table ran off the edge and
     needed sideways scrolling, so each task gets a compact two-line block. */
  const rows=items.map(t=>`<div class="agent-plan-item">`
    +`<div class="agent-plan-head"><span class="agent-plan-name">${escapeHTML(t.name||'')}</span>`
    +`<span class="priority ${escapeHTML(t.priority||'P1')}">${escapeHTML(t.priority||'P1')}</span></div>`
    +`<div class="agent-plan-meta">${escapeHTML(projectName(t.projectId))} · ${escapeHTML(nameOf(t.assignee))} · `
    +(t.date?escapeHTML(fmt(t.date)):'待定')+(t.deadline?` → ${escapeHTML(fmt(t.deadline))}`:'')+`</div></div>`).join('');
  const card=document.createElement('div');
  card.className='agent-message assistant agent-plan';
  card.innerHTML=`<div class="agent-action-title">计划 · ${items.length} 个任务</div>`
    +`<div class="agent-plan-list">${rows}</div>`
    +`<div class="agent-action-buttons"><button class="ghost-btn agent-plan-cancel">取消</button>`
    +`<button class="primary-btn agent-plan-create">按此创建 ${items.length} 个任务</button></div>`;
  list.appendChild(card);list.scrollTop=list.scrollHeight;
  const bar=card.querySelector('.agent-action-buttons');
  card.querySelector('.agent-plan-cancel').onclick=()=>{bar.innerHTML='<span class="agent-action-done">已取消，没有创建任何任务</span>'};
  card.querySelector('.agent-plan-create').onclick=async()=>{
    if(agentState.busy)return;
    agentState.busy=true;agentUpdateBusy();
    bar.innerHTML='<span class="agent-action-done">创建中…</span>';
    const done=await agentRunPlan(items);
    bar.innerHTML=`<span class="agent-action-done">已创建 ${done.created} 个${done.failed?` · 失败 ${done.failed}`:''}</span>`;
    agentFoldTrail(card);
    agentState.busy=false;agentUpdateBusy();
  };
}
async function agentRunPlan(items){
  const failures=[];
  let created=0;
  for(const item of items){
    try{
      await api('/api/action',{action:'agent.execute',data:{action:'task.create',data:item,confirmed:true}});
      created+=1;
      agentShowStep(`已创建 · ${item.name||''}`);
    }catch(e){
      failures.push(`「${item.name||''}」${e?.message||'创建失败'}`);
      agentShowStep(`未创建 · ${item.name||''}：${e?.message||'创建失败'}`);
    }
  }
  try{await refresh()}catch(_){}
  agentAppend('assistant',failures.length
    ? `按计划创建了 ${created} 个任务，有 ${failures.length} 个没成功：${failures.join('；')}`
    : `计划里的 ${created} 个任务都已创建。`,'');
  return {created,failed:failures.length};
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
let chatPollTimer=0,chatPresenceTimer=0,chatLastAt='',chatLastDay='';
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
const chatMentionName=id=>id===CHAT_EVERYONE?'所有人':nameOf(id);
function chatDayLabel(iso){
  const d=new Date(iso),today=new Date();
  const key=x=>`${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if(key(d)===key(today))return '今天';
  const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
  if(key(d)===key(yesterday))return '昨天';
  return `${d.getMonth()+1} 月 ${d.getDate()} 日`;
}
function chatClock(iso){
  const d=new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
/* The two standing rooms first, then a channel per live project. A finished
   project drops off this list and its history moves to 成果库. */
function chatChannelList(){
  const items=[{id:'general',name:'沟通'},{id:'lounge',name:'闲聊'}];
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
  if(key(d)===key(yesterday))return '昨天';
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
  if(!meta.body)return '<span class="chat-channel-idle">还没有消息</span>';
  const mine=meta.author===S.user?.id;
  return escapeHTML((mine?'我：':'')+String(meta.body).replace(/\s+/g,' '));
}
function renderChatCurrent(){
  const el=$('#chatCurrent');if(!el)return;
  const item=chatChannelList().find(c=>c.id===chatChannel);
  el.textContent=item?item.name:'沟通';
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
    return `<button type="button" role="tab" aria-selected="${c.id===chatChannel}" class="chat-channel ${c.id===chatChannel?'is-on':''}" data-channel="${escapeHTML(c.id)}">`
      +chatChannelMark(c)
      +`<span class="chat-channel-body"><span class="chat-channel-name">${escapeHTML(c.name)}</span>`
      +`<span class="chat-channel-preview">${chatPreviewText(c.id)}</span></span>`
      +`<span class="chat-channel-side">${time}${badge}</span></button>`;
  }).join('');
  $$('#chatChannels .chat-channel').forEach(b=>b.onclick=()=>{
    /* Switching rooms reads only the room you switched to. */
    if(chatChannel!==b.dataset.channel){
      chatChannel=b.dataset.channel;
      renderChatCurrent();
    }
    renderChatChannels();
    loadChat(true);
  });
  renderChatCurrent();
}
/* Mentions are read back out of the text, so a hand-typed @名字 works exactly
   like one picked from the menu. */
function chatParseMentions(text){
  const found=[];
  if(text.includes('@所有人'))found.push(CHAT_EVERYONE);
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
  let rows=[];
  try{
    const scope={channel:chatChannel};
    const data=await api('/api/action',{action:'chat.list',data:reset?scope:{...scope,since:chatLastAt}});
    rows=data.messages||[];
    if(data.previews)chatPreviews=data.previews;
  }catch(e){
    if(reset)log.innerHTML=`<p class="chat-empty">读不到消息：${escapeHTML(e?.message||'加载失败')}</p>`;
    return;
  }
  if(reset){log.innerHTML='';chatLastAt='';chatLastDay=''}
  if(!rows.length){
    if(reset)log.innerHTML=chatChannel==='general'
      ?'<p class="chat-empty">暂无消息</p>'
      :'<p class="chat-empty">暂无消息</p>';
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
  if(reset||nearBottom)log.scrollTop=log.scrollHeight;
  /* The list carries the newest line of every room, so a poll keeps it fresh. */
  renderChatChannels();
  reportChatRead(chatLastAt);
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
  bar.innerHTML=`<span class="chat-online">${online}/${ids.length} 在线</span>`+shown.map(id=>{
    const state=chatPresence[id];
    const label=state.online?'在线':(state.at?`最后活跃 ${chatClock(state.at)}`:'还没来过');
    return `<span class="chat-presence ${state.online?'is-on':''}" title="${escapeHTML(nameOf(id))} · ${escapeHTML(label)}">${avatarHTML(id)}</span>`;
  }).join('')+(rest>0?`<span class="chat-presence-more" title="还有 ${rest} 位成员">+${rest}</span>`:'');
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
  if(!q||'所有人'.includes(q)||'all'.startsWith(q)||'everyone'.startsWith(q))
    list.unshift({id:CHAT_EVERYONE,name:'所有人',every:true});
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
    +`<small>${escapeHTML(u.every?'通知全体成员':u.id)}</small></button>`).join('');
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
  const input=$('#chatInput'),text=input?.value.trim();
  if(!text)return;
  input.value='';input.style.height='';chatMentionQuery=null;renderChatMentionMenu();
  try{
    await api('/api/action',{action:'chat.send',data:{body:text,channel:chatChannel,mentions:chatParseMentions(text)}});
    await loadChat(false);
    input.focus();
  }catch(e){
    toast(e?.message||'发送失败');
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
  }catch(e){toast(e?.message||'读不到归档消息');return}
  let dayKey='';
  const body=rows.map(m=>{
    const day=(m.createdAt||'').slice(0,10);
    const withDay=Boolean(day)&&day!==dayKey;
    if(day)dayKey=day;
    return chatBubble(m,withDay);
  }).join('');
  openModal(`<div class="eyebrow">归档 · ${escapeHTML(projectName||'')}</div><h2>沟通记录</h2>`
    +`<p>${rows.length?`共 ${rows.length} 条消息`:'暂无沟通记录'}</p>`
    +`<div class="chat-log chat-archive">${body}</div>`
    +`<div class="modal-footer"><button class="secondary-btn" id="cancelAction">关闭</button></div>`);
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
  $('#agentBtn')?.addEventListener('click',async()=>{$('#agentPanel').classList.remove('hidden');renderAgentCapability();await agentLoadOwnHistory();await agentLoadServerConfig();agentSyncPlanButton();agentInitVoice();$('#agentInput').focus()});
  $('#agentHistoryBtn')?.addEventListener('click',()=>agentShowHistory());
  $('#agentCloseBtn')?.addEventListener('click',()=>{agentStopVoice();$('#agentPanel').classList.add('hidden')});
  $('#agentStopBtn')?.addEventListener('click',()=>agentHalt('已停止连续执行。'));
  $('#agentPlanBtn')?.addEventListener('click',()=>agentTogglePlan());
  $$('#agentPanel .agent-mode-opt').forEach(b=>b.addEventListener('click',()=>agentSetPref(b.dataset.mode)));
  agentRenderModeOptions();
  $('#agentConfigBtn')?.addEventListener('click',()=>agentSetConfigVisible(true));
  $('#agentConfigClose')?.addEventListener('click',()=>agentSetConfigVisible(false));
  $('#agentProvider')?.addEventListener('change',()=>agentSyncProviderUI());
  $('#agentConfigSave')?.addEventListener('click',async()=>{const provider=$('#agentProvider').value,endpoint=$('#agentEndpoint').value.trim(),model=provider==='custom'?$('#agentCustomModel').value.trim():$('#agentModelSelect').value,apiKey=$('#agentApiKey').value.trim();if(!endpoint||!model){toast('请填写 API 地址和模型');return}try{const data=await api('/api/action',{action:'agent.config.set',data:{provider,baseUrl:endpoint,model,apiKey}});agentServerConfig=data;saveAgentConfig({provider,endpoint,model});agentSetConfigVisible(false);toast('Agent API 配置已保存（密钥仅保存在服务端）')}catch(e){toast(e.message||'保存失败')}});
  $('#agentConfigReset')?.addEventListener('click',()=>{saveAgentConfig({});agentServerConfig=null;agentSetConfigVisible(false);toast('已清除本机 Agent 配置；如需清除服务端密钥请重新保存')});
  $('#agentAsrSave')?.addEventListener('click',async()=>{
    const baseUrl=$('#agentAsrEndpoint').value.trim();
    if(!baseUrl){toast('请填写语音转写服务地址；如需关闭请用「停用语音转写」');return}
    const payload={baseUrl,model:$('#agentAsrModel').value.trim(),language:$('#agentAsrLanguage').value.trim()||'zh'};
    const apiKey=$('#agentAsrApiKey').value.trim();
    if(apiKey)payload.apiKey=apiKey;
    try{agentServerAsr=await api('/api/action',{action:'agent.asr.set',data:payload});renderAgentAsrConfig();agentInitVoice();toast('语音转写配置已保存')}catch(e){toast(e.message||'保存失败')}
  });
  $('#agentAsrClear')?.addEventListener('click',async()=>{
    try{agentServerAsr=await api('/api/action',{action:'agent.asr.set',data:{baseUrl:''}}).catch(()=>null);}catch(_){}
    try{await api('/api/action',{action:'agent.asr.set',data:{baseUrl:'',apiKey:''}})}catch(_){}
    agentServerAsr=await api('/api/action',{action:'agent.asr.get',data:{}}).catch(()=>null);
    renderAgentAsrConfig();agentInitVoice();toast('已停用语音转写，语音输入回退到浏览器识别');
  });
    $('#agentForm')?.addEventListener('submit',e=>{e.preventDefault();agentSubmit()});
  document.addEventListener('compositionend',()=>{imeUntil=Date.now()+80},true);
  $('#agentInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!imeEnter(e)){e.preventDefault();agentSubmit()}});
  $('#agentInput')?.addEventListener('input',()=>agentSyncPlanButton());
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
const voice={recorder:null,stream:null,chunks:[],recognition:null,engine:null,active:false,base:'',final:'',interim:'',lang:'',startedAt:0};
function agentSpeechRecognition(){
  return window.SpeechRecognition||window.webkitSpeechRecognition||null;
}
function agentCanRecord(){
  return Boolean(navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder==='function');
}
/* Prefer the server engine when it is configured and the browser can record;
   otherwise fall back to whatever recognition the browser itself provides. */
function agentVoiceEngine(){
  if(agentServerAsr?.configured&&agentCanRecord())return 'server';
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
  const input=$('#agentInput');if(!input)return;
  const settled=voice.base+voice.final;
  input.value=settled+(voice.interim?voice.interim:'');
  try{input.setSelectionRange(input.value.length,input.value.length)}catch(_){}
  agentSyncPlanButton();
}
function agentVoiceAppend(text){
  if(!text)return;
  voice.final+=(voice.final?' ':'')+text;
  voice.interim='';agentVoiceRender();
}
function agentVoiceStart(){
  const engine=agentVoiceEngine();
  if(!engine)return;
  agentStopVoice();
  if(engine==='server')agentVoiceStartRecording();
  else agentVoiceStartRecognition();
}
/* ---------- server engine: record with MediaRecorder, transcribe on upload ---------- */
async function agentVoiceStartRecording(){
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(_){
    toast('没有拿到麦克风权限，请在地址栏允许后重试');
    return;
  }
  const mime=typeof MediaRecorder.isTypeSupported==='function'
    ? ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t))||''
    : '';
  let recorder;
  try{recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream)}catch(_){recorder=new MediaRecorder(stream)}
  voice.stream=stream;voice.recorder=recorder;voice.chunks=[];voice.interim='';
  voice.engine='server';voice.active=true;voice.startedAt=Date.now();
  voice.base=$('#agentInput')?.value||'';voice.final='';
  recorder.ondataavailable=event=>{if(event.data&&event.data.size)voice.chunks.push(event.data)};
  recorder.onstop=()=>agentVoiceFinishRecording();
  try{recorder.start()}catch(_){agentStopVoice();return}
  agentVoiceState();
}
async function agentVoiceFinishRecording(){
  const chunks=voice.chunks.slice();voice.chunks=[];
  voice.stream?.getTracks().forEach(track=>{try{track.stop()}catch(_){}});
  voice.stream=null;
  if(!chunks.length){agentVoiceState();return}
  const blob=new Blob(chunks,{type:voice.recorder?.mimeType||'audio/webm'});
  const bar=$('#agentVoiceBar');
  if(bar)bar.textContent='正在转写…';
  try{
    const result=await apiBlob(TRANSCRIBE_ENDPOINT,blob);
    agentVoiceAppend(result?.text||'');
    if(!result?.text)toast('没有识别到内容，再说一次试试');
  }catch(err){
    toast(err?.message||'语音转写失败');
  }finally{
    voice.recorder=null;agentVoiceState();
    const bar=$('#agentVoiceBar');
    if(bar)bar.textContent='正在聆听…说出来吧，说完再点一次麦克风';
  }
}
/* ---------- browser engine: Web Speech API, zero config ---------- */
function agentVoiceStartRecognition(){
  const Engine=agentSpeechRecognition();
  if(!Engine)return;
  const recognition=new Engine();
  recognition.lang=agentVoiceLang();recognition.continuous=true;recognition.interimResults=true;
  voice.recognition=recognition;voice.engine='browser';
  voice.base=$('#agentInput')?.value||'';voice.final='';voice.interim='';
  recognition.onstart=()=>{voice.active=true;agentVoiceState();agentVoiceRender()};
  recognition.onresult=event=>{
    let interim='',final='';
    for(let i=event.resultIndex;i<event.results.length;i+=1){
      const result=event.results[i],text=result[0]?.transcript||'';
      if(result.isFinal)final+=text;else interim+=text;
    }
    if(final)voice.final+=final;
    voice.interim=interim;agentVoiceRender();
  };
  recognition.onerror=event=>{
    const reason=event?.error||'';
    voice.active=false;voice.recognition=null;agentVoiceState();
    if(reason==='not-allowed'||reason==='service-not-allowed')toast('浏览器没有麦克风权限，请在地址栏允许后重试');
    else if(reason==='audio-capture')toast('没有检测到可用的麦克风');
    else if(reason!=='aborted'&&reason!=='no-speech')toast('语音识别中断，请重试');
  };
  recognition.onend=()=>{
    voice.active=false;voice.recognition=null;voice.interim='';agentVoiceRender();agentVoiceState();
  };
  try{recognition.start()}catch(_){voice.recognition=null}
}
function agentStopVoice(){
  const recognition=voice.recognition,recorder=voice.recorder;
  voice.recognition=null;voice.recorder=null;voice.active=false;voice.interim='';
  if(recognition){try{recognition.stop()}catch(_){}}
  if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch(_){}}else{
    voice.stream?.getTracks().forEach(track=>{try{track.stop()}catch(_){}});
    voice.stream=null;agentVoiceState();agentVoiceRender();
  }
  agentVoiceState();
}
function agentToggleVoice(){
  if(!agentVoiceEngine())return;
  if(voice.active)agentStopVoice();else agentVoiceStart();
}
function agentVoiceState(){
  const mic=$('#agentMicBtn');
  if(mic){
    mic.classList.toggle('is-on',voice.active);
    mic.setAttribute('aria-pressed',voice.active?'true':'false');
    mic.title=voice.active?'正在聆听：再点一下结束并转成文字':'语音输入：点一下开始说话，再点一下结束并转成文字';
    const slot=mic.querySelector('.icon-slot');if(slot)slot.dataset.icon=voice.active?'square':'mic';
  }
  const voiceBar=$('#agentVoiceBar');
  if(voiceBar)voiceBar.classList.toggle('hidden',!voice.active);
  agentUpdateBusy();
}
/* Called once when the panel opens (and after the server config arrives): reveal
   the mic only when some engine exists, and say which one is in use. */
function agentInitVoice(){
  const engine=agentVoiceEngine();
  $('#agentMicBtn')?.classList.toggle('hidden',!engine);
  const hint=$('#agentVoiceHint');
  if(hint){
    hint.classList.toggle('hidden',!engine);
    if(engine)hint.textContent=engine==='server'
      ?`语音输入：点一下麦克风开始说话，再点一下结束，音频会送到 ${agentServerAsr?.model||'本地转写服务'} 转成文字，可先改再发。`
      :'语音输入：点一下麦克风开始说话，再点一下结束，识别结果会填进输入框，可先改再发。';
  }
  agentVoiceState();
}


initAgentUI();
initChatUI();
function ensureAccountCreateButton(){
  const owner=Boolean(S.user?.role==='superadmin'),host=$('#accountsView .page-intro');if(!host)return;
  let b=$('#createAccountBtn');
  if(!b){b=document.createElement('button');b.id='createAccountBtn';b.className='secondary-btn';b.innerHTML=icon('plus')+'添加账户';host.appendChild(b)}
  b.onclick=createAccountDialog;b.classList.toggle('hidden',!owner);
}
function createAccountDialog(){
  const groups={superadmin:S.users.filter(u=>roleOf(u)==='superadmin').length,admin:S.users.filter(u=>roleOf(u)==='admin').length};
  openModal(`<div class="eyebrow">账户管理 · 新建账户</div><h2>添加账户</h2><label class="form-field">账户名<input id="newAccountName" autocomplete="off" placeholder="zhangsan"></label><label class="form-field">中文名称（可留空）<input id="newAccountDisplayName" maxlength="12"></label><label class="form-field">初始密码<input id="newAccountPassword" type="password" autocomplete="new-password" placeholder="至少 6 位"></label><label class="form-field">权限组<select id="newAccountRole"><option value="member">普通用户</option><option value="admin">admin（${groups.admin}）</option><option value="superadmin">superadmin（${groups.superadmin}）</option></select></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmCreateAccount">创建账户</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmCreateAccount').onclick=async()=>{
    const username=$('#newAccountName').value.trim(),password=$('#newAccountPassword').value,role=$('#newAccountRole').value,displayName=$('#newAccountDisplayName').value.trim();
    if(!username){toast('请填写账户名');return}
    if(password.length<6){toast('密码至少 6 位');return}
    try{await api('/api/action',{action:'account.create',data:{username,password,role,displayName}});closeModal();await refresh();toast(role==='member'?'已创建普通账户 '+username:'已创建管理账户 '+username)}
    catch(e){toast(e.message||'创建失败')}
  };
}
setInterval(ensureAccountCreateButton,1000);
window.addEventListener('load',()=>setTimeout(ensureAccountCreateButton,200));
