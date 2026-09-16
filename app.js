const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const UI={view:'calendar',member:'all',filter:'all',selectedWeek:0,detailDate:null,timelineScroll:null,dayOffset:0};
let weekObserver=null;
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
  'chat':'<path d="M20 13.5a2 2 0 0 1-2 2H8.5L4 19V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/>'
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
const api=(path,body)=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Work-Calendar':'1'},credentials:'same-origin',body:JSON.stringify(body)}).then(async r=>{const x=await r.json();if(!r.ok)throw new Error(x.error||'操作未完成');return x});
const getState=()=>fetch('/api/state',{credentials:'same-origin'}).then(async r=>{const x=await r.json();if(!r.ok)throw new Error(x.error||'请登录');return x});
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
function showAuth(){document.body.classList.add('auth-locked');let e=$('#authScreen');if(!e){e=document.createElement('section');e.id='authScreen';document.body.prepend(e)}const local=location.protocol==='file:';e.innerHTML=`<div class="auth-card"><div class="brand"><span class="brand-mark">战</span><span>战略小组<br><strong>台账</strong></span></div><h1>登录工作台</h1><p>使用核验账户进入你的任务、项目和收件箱。</p><form id="loginForm"><label>账户<input id="loginUser" autocomplete="username" value="superadmin" required></label><label>密码<input id="loginPass" type="password" autocomplete="current-password" required></label><button class="primary-btn" type="submit" ${local?'disabled':''}>${local?'请先启动本地服务':'进入工作台'}</button><div id="loginError" class="login-error">${local?'请在工作区运行 ./run.sh，然后访问 http://127.0.0.1:4173/':''}</div></form><small>首次启动后，密码写入 data/initial-accounts.txt（仅本机保存）。</small></div>`;$('#loginForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/login',{username:$('#loginUser').value,password:$('#loginPass').value});document.body.classList.remove('auth-locked');e.target.closest('#authScreen').remove();await refresh();switchView('calendar')}catch(err){$('#loginError').textContent=err.message}}}
async function refresh(){
  let next;
  try{next=await getState()}catch(e){showAuth();return}
  if(S.user?.id!==next.user.id){Object.assign(UI,{view:'calendar',member:'all',filter:'all',selectedWeek:0,detailDate:null,timelineScroll:null,dayOffset:0})}
  /* updateChatDot is defined further down the file than the unit-test sandbox
     loads, so guard the call rather than assume it is in scope. */
  S=next;renderAll();if(typeof updateChatDot==='function')updateChatDot();
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
  if(view==='achievements'&&!S.user?.admin){view='calendar'}
  const changed=UI.view!==view;
  hideFloat(true);UI.view=view;
  /* Returning to the week rail should show the current week, not whichever
     panel the rail happened to be parked on last. */
  if(view==='calendar'&&changed)UI.selectedWeek=0;
  if(view!=='calendar'){weekObserver?.disconnect();weekObserver=null}
  $$('.view').forEach(v=>v.classList.toggle('active-view',v.id===`${view}View`));
  $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
  const labels={today:'今日任务',calendar:'周视图',summary:'日记',projects:'项目空间',timeline:'项目时间轴',achievements:'成果库',inbox:'收件箱',accounts:'账户管理',dayDetail:'日期详情',chat:'沟通区'};
  $('#crumbCurrent').textContent=`/ ${labels[view]||view}`;
  renderScheduleScope();
  if(view==='calendar')renderCalendar();
  if(view==='today')renderToday();
  if(view==='dayDetail')renderDayContent();
  if(view==='summary')renderSummary();
  if(view==='projects')renderProjects();
  if(view==='timeline')renderTimeline();
  if(view==='achievements')renderAchievements();
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
function renderStats(day=displayDay()){const d=scheduleTasks().filter(t=>taskActiveOn(t,day)),current=d.filter(t=>!isArchivedTask(t)),done=current.filter(t=>t.status==='done').length;$('#todayCount').textContent=current.filter(t=>t.status!=='done').length;$('#p0Count').textContent=current.filter(t=>t.priority==='P0'&&t.status!=='done').length;$('#doingCount').textContent=scheduleTasks().filter(t=>t.status==='doing').length;$('#deferredCount').textContent=scheduleTasks().filter(t=>t.status==='deferred').length;$('#allTabCount').textContent=d.length;$('#openTabCount').textContent=current.length-done;$('#doneTabCount').textContent=done;$('#progressText').textContent=`${done} / ${current.length} 已完成`;const pct=current.length?done/current.length*100:0;$('#dayProgress').style.width=`${pct}%`;$('#progressPercent').textContent=`${Math.round(pct)}%`;$('#focusTime').textContent=`${String(Math.floor(current.reduce((n,t)=>n+t.duration,0)/60)).padStart(2,'0')}:${String(current.reduce((n,t)=>n+t.duration,0)%60).padStart(2,'0')}`;$('#focusProgress').style.width=`${pct}%`}
function taskCard(t){
  const [c,l]=status(t),deferLog=t.status==='deferred'?S.logs.find(x=>x.taskId===t.id&&x.kind==='defer'):null;
  return `<article class="task-card" data-id="${escapeHTML(t.id)}" tabindex="0"><div class="task-stripe ${escapeHTML(t.priority)}"></div><div class="task-main"><div class="task-topline"><span class="priority ${escapeHTML(t.priority)}">${escapeHTML(t.priority)}</span><span class="task-name">${escapeHTML(t.name)}</span>${t.fixed?`<span class="fixed-badge">${icon('repeat')} 固定</span>`:''}${isMultiDay(t)?`<span class="span-badge">${spanDays(t)} 天</span>`:''}</div><div class="task-desc">${escapeHTML(t.desc||'暂无描述')}</div><div class="task-meta"><span class="assignee-tag" title="${escapeHTML(t.assignee)}">${escapeHTML(nameOf(t.assignee))}</span><span class="project-tag">${escapeHTML(projectName(t))}</span><span>${icon('clock')} ${escapeHTML(t.time||'09:00')} · ${t.duration} 分钟</span>${ddlBadge(t)}${deferLog?.target?`<span class="defer-target">${icon('arrow-right')} ${escapeHTML(deferLog.target)}</span>`:''}</div></div><div class="task-status"><i class="status-dot ${c}"></i>${l}<span class="task-arrow">${icon('chevron-right')}</span></div></article>`;
}
function dailyTaskGroups(tasks){
  const groups=new Map();
  for(const task of sortTasks(tasks)){
    const project=S.projects.find(p=>p.id===task.projectId),key=project?.id||'__unattached__';
    if(!groups.has(key))groups.set(key,{project,tasks:[]});
    groups.get(key).tasks.push(task);
  }
  return [...groups.values()].map(({project,tasks})=>{
    const unattached=!project, title=project?.name||(tasks.every(t=>t.fixed)?'固定安排':'其他安排'), sub=project?`Owner · ${project.owner} · ${projectStatus(project)}`:tasks.every(t=>t.fixed)?'按周期自动生成':'历史记录', done=tasks.filter(t=>t.status==='done').length;
    return `<section class="daily-project-card ${unattached?'unattached-project':''}" data-project="${escapeHTML(project?.id||'')}"><div class="daily-project-heading"><div><span class="daily-project-kicker">${unattached?'安排':'项目'}</span><h3>${escapeHTML(title)}</h3></div><span class="daily-project-meta">${escapeHTML(sub)} · ${done}/${tasks.length} 已完成</span></div><div class="daily-project-tasks">${tasks.map(taskCard).join('')}</div></section>`;
  }).join('');
}
function bindTaskCards(root){$$(root+' .task-card').forEach(e=>{e.onclick=()=>openDrawer(e.dataset.id);e.onkeydown=x=>{if(x.key==='Enter')openDrawer(e.dataset.id)}})}
function renderToday(){const day=displayDay(),deferredView=UI.filter==='deferred';renderStats(day);$('#todayLabel').textContent=deferredView?'递延任务':`${wd(day)} · ${fmt(day)}`;$('#dateChip').textContent=deferredView?'全部日期':fmt(day);$$('.quick-tab').forEach(b=>b.classList.toggle('active',b.dataset.filter===UI.filter));let ts=(deferredView?scheduleTasks():scheduleTasks().filter(t=>taskActiveOn(t,day)));if(UI.filter==='open')ts=ts.filter(t=>!isArchivedTask(t)&&t.status!=='done');if(UI.filter==='done')ts=ts.filter(t=>t.status==='done');if(UI.filter==='P0')ts=ts.filter(t=>t.priority==='P0');if(UI.filter==='inprogress')ts=ts.filter(t=>t.status==='doing');if(deferredView)ts=ts.filter(t=>t.status==='deferred');const emptyCopy=UI.filter==='inprogress'?['暂无进行中的任务','打开待处理任务并点击“开始任务”，任务就会出现在这里。']:deferredView?['暂无递延记录','未完成的任务递延后，会在这里保留历史记录。']:['今天没有待处理任务','把下一件重要的事放进日程吧。'];$('#todayEmptyTitle').textContent=emptyCopy[0];$('#todayEmptyHint').textContent=emptyCopy[1];$('#todayTaskList').innerHTML=dailyTaskGroups(ts);$('#todayEmpty').classList.toggle('hidden',ts.length>0);bindTaskCards('#todayTaskList')}
/* ---------------------------------------------------------------------------
   One day card unfolds on demand. The panel is placed in viewport space rather
   than inside the rail: the rail clips its own overflow, so a card that grew in
   place would be cut off exactly when it finally had something to say.
   Hovering previews it; clicking pins it so the tasks inside can be used.
   ------------------------------------------------------------------------- */
let floatHideTimer=null,floatCard=null,floatSource=null,floatPinned=false,floatOutside=null;
function removeFloat(){
  if(floatHideTimer){clearTimeout(floatHideTimer);floatHideTimer=null}
  if(floatOutside){document.removeEventListener('click',floatOutside);floatOutside=null}
  floatCard?.remove();
  floatCard=null;floatSource=null;floatPinned=false;
  $$('#weekCarousel .axis-day.pinned').forEach(d=>d.classList.remove('pinned'));
}
/* Sit under the card, or above it when the card is too close to the bottom.
   The panel is capped to whatever room that side actually has, so a short
   window scrolls the task list instead of letting the panel cover the card
   it belongs to. */
function placeFloat(el,f){
  const r=el.getBoundingClientRect(),w=f.offsetWidth,gap=10;
  const roomBelow=innerHeight-r.bottom-gap-14,roomAbove=r.top-gap-14;
  const flip=roomBelow<Math.min(f.scrollHeight,300)&&roomAbove>roomBelow;
  f.classList.toggle('flip',flip);
  f.style.maxHeight=`${Math.round(Math.min(520,Math.max(190,flip?roomAbove:roomBelow)))}px`;
  const h=f.offsetHeight;
  f.style.top=`${Math.round(flip?Math.max(14,r.top-gap-h):Math.min(innerHeight-h-14,r.bottom+gap))}px`;
  f.style.left=`${Math.round(Math.min(Math.max(14,r.left+r.width/2-w/2),innerWidth-w-14))}px`;
}
function dayPeekHTML(iso){
  const ts=sortTasks(scheduleTasks().filter(t=>taskActiveOn(t,iso)));
  const done=ts.filter(t=>t.status==='done').length;
  const canAdd=Boolean(S.user?.admin);
  return `<div class="peek-head"><span>${wd(iso)}</span><strong>${fmt(iso)}</strong>${iso===S.today?'<em>今天</em>':''}</div>`
    +`<div class="peek-meta">${ts.length?`${ts.length} 项任务 · 完成 ${done}`:'这一天还没有安排'}</div>`
    +`<div class="peek-tasks">${ts.length?ts.map(t=>`<button class="peek-task ${escapeHTML(t.priority)}" data-task="${escapeHTML(t.id)}" type="button"><span class="priority ${escapeHTML(t.priority)}">${escapeHTML(t.priority)}</span><b>${escapeHTML(t.name)}</b><small>${escapeHTML(nameOf(t.assignee))} · ${t.duration} 分钟 · ${status(t)[1]}${isMultiDay(t)?` · ${spanDays(t)} 天`:''}</small></button>`).join(''):'<div class="peek-empty">这一天还是空的</div>'}</div>`
    +`<div class="peek-actions">${canAdd?`<button class="peek-add" data-date="${iso}" type="button">${icon('plus')}添加任务</button>`:''}<button class="peek-detail" data-date="${iso}" type="button">查看详情${icon('arrow-right')}</button></div>`;
}
/* Clicking anywhere else drops a pinned panel. */
function bindFloatOutside(el,f){
  floatOutside=e=>{
    if(f.isConnected&&!f.contains(e.target)&&!el.contains(e.target))removeFloat();
  };
  setTimeout(()=>{if(floatCard===f)document.addEventListener('click',floatOutside)},0);
}
function showFloat(el,pin=false){
  if(floatHideTimer){clearTimeout(floatHideTimer);floatHideTimer=null}
  /* Already open on this card: just pin or unpin, without rebuilding it. */
  if(floatSource===el&&floatCard?.isConnected){
    if(pin===floatPinned)return;
    floatPinned=pin;
    el.classList.toggle('pinned',pin);
    if(pin)bindFloatOutside(el,floatCard);
    return;
  }
  removeFloat();
  const iso=el.dataset.date,f=document.createElement('section');
  floatSource=el;floatCard=f;floatPinned=pin;
  f.className='day-peek';
  f.dataset.date=iso;
  f.innerHTML=dayPeekHTML(iso);
  document.body.appendChild(f);
  el.classList.toggle('pinned',pin);
  placeFloat(el,f);
  f.addEventListener('mouseenter',()=>{if(floatHideTimer){clearTimeout(floatHideTimer);floatHideTimer=null}});
  f.addEventListener('mouseleave',()=>{if(!floatPinned)hideFloat()});
  $$('.day-peek [data-task]').forEach(b=>b.onclick=e=>{e.stopPropagation();removeFloat();openDrawer(b.dataset.task)});
  $('.day-peek .peek-add')?.addEventListener('click',e=>{e.stopPropagation();const d=e.currentTarget.dataset.date;removeFloat();newTask(null,d)});
  $('.day-peek .peek-detail')?.addEventListener('click',e=>{e.stopPropagation();const d=e.currentTarget.dataset.date;removeFloat();renderDayDetail(d)});
  if(pin)bindFloatOutside(el,f);
  requestAnimationFrame(()=>{if(floatCard===f)f.classList.add('show')});
}
function hideFloat(immediate=false){
  if(floatHideTimer){clearTimeout(floatHideTimer);floatHideTimer=null}
  if(floatPinned&&!immediate)return;
  if(immediate){removeFloat();return}
  /* Give the pointer time to travel from the card into the panel. */
  floatHideTimer=setTimeout(removeFloat,240);
}
/* Scrolling the rail is never intercepted — a wheel or a trackpad behaves
   exactly as the OS intends. What gives it the feel of a dial is that the rail
   settles onto a whole week once the gesture ends, and that the week nearest
   the centre is the one that reads as current. */
let weekMetrics=null,weekWheelFrame=0,weekWheelBound=false,weekSettleTimer=0,weekSettleLock=false,weekScrollIdle=0;
function measureWeekPanels(){
  const car=$('#weekCarousel');
  if(!car){weekMetrics=null;return}
  weekMetrics=[...car.querySelectorAll('.week-panel')].map(p=>({el:p,top:p.offsetTop,h:p.offsetHeight}));
}
function focusWeek(n){
  if(n===UI.selectedWeek)return;
  const prev=UI.selectedWeek;
  UI.selectedWeek=n;
  renderScheduleScope();
  /* Only the two panels whose state actually changed are touched, rather than
     walking all 31 on every crossing. */
  [prev,n].forEach(w=>{
    const p=document.querySelector(`#weekCarousel .week-panel[data-week="${w}"]`);
    if(!p)return;
    const on=Number(p.dataset.week)===n;
    p.classList.toggle('focus-week',on);
    p.classList.toggle('compact-week',!on);
    const k=p.querySelector('.week-kicker');
    if(k)k.textContent=on?'正在查看':'滚动查看';
  });
}
/* Park the chosen week in the middle of the rail. The rail used to lean on
   scrollIntoView, which a just-revealed panel (height 0) cannot honour — the
   view landed three weeks away from today. */
function alignWeekRail(){
  const car=$('#weekCarousel');
  if(!car||!car.clientHeight)return;
  measureWeekPanels();
  const m=(weekMetrics||[]).find(x=>Number(x.el.dataset.week)===UI.selectedWeek);
  if(!m)return;
  const max=Math.max(0,car.scrollHeight-car.clientHeight);
  const target=Math.min(Math.max(0,m.top+m.h/2-car.clientHeight/2),max);
  if(Math.abs(target-car.scrollTop)<2)return;
  car.scrollTop=target;
}
function updateWeekFocus(){
  weekWheelFrame=0;
  /* Glue an open panel to its card while the rail turns — the settle glide
     fires scroll events of its own, and dropping the panel on those would pull
     it out from under the pointer that just opened it. */
  if(floatCard&&floatSource){
    const r=floatSource.getBoundingClientRect();
    if(r.bottom<8||r.top>innerHeight-8)removeFloat();else placeFloat(floatSource,floatCard);
  }
  const car=$('#weekCarousel');
  if(!car||!weekMetrics||!weekMetrics.length)return;
  /* One cheap read tells us whether anything has shifted the panels since they
     were measured — a web font landing, a panel's height settling. If it has,
     re-measure before using stale positions. */
  if(Math.abs(weekMetrics[0].el.offsetTop-weekMetrics[0].top)>2)measureWeekPanels();
  const mid=car.scrollTop+car.clientHeight/2;
  /* The week nearest the centre is the one the eye reads as current. An
     intersection ratio cannot tell them apart here: the rail shows close to a
     whole panel at a time, so more than one of them scores 1.0 and the pick
     comes out arbitrary. */
  let nearest=null,nearestDist=Infinity;
  for(const m of weekMetrics){
    const d=Math.abs((m.top+m.h/2)-mid);
    if(d<nearestDist){nearestDist=d;nearest=Number(m.el.dataset.week)}
  }
  if(nearest!==null)focusWeek(nearest);
}
/* Let the rail come to rest on a whole week rather than between two. This runs
   after the gesture stops, never during it, so the scroll itself stays free. */
function settleWeekRail(){
  const car=$('#weekCarousel');
  /* A hidden view has no height to measure against. */
  if(!car||!car.clientHeight||weekSettleLock)return;
  if(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const el=car.querySelector(`.week-panel[data-week="${UI.selectedWeek}"]`);
  if(!el)return;
  const offset=(el.offsetTop+el.offsetHeight/2)-(car.scrollTop+car.clientHeight/2);
  /* A rail that stopped roughly on a week should be left alone. Only a real
     halfway stop is worth correcting, otherwise the glide steals the gesture. */
  if(Math.abs(offset)<el.offsetHeight*0.2)return;
  /* The glide below fires scroll events of its own; the lock keeps the settle
     from re-scheduling itself until it has finished. */
  weekSettleLock=true;
  car.scrollTo({top:Math.max(0,car.scrollTop+offset),behavior:'smooth'});
  /* Once the glide is done, look again in case the gesture resumed and stopped
     inside the locked window — that last stop would have missed its settle.
     A rail already centred returns immediately, so this cannot loop. */
  setTimeout(()=>{weekSettleLock=false;settleWeekRail()},340);
}
function scheduleWeekWheel(){
  const car=$('#weekCarousel');
  /* Light the scrollbar while the rail is turning, so the track reads as the
     thing being moved. It fades back on its own once the rail is still. */
  if(car){
    car.classList.add('scrolling');
    clearTimeout(weekScrollIdle);
    weekScrollIdle=setTimeout(()=>car.classList.remove('scrolling'),420);
  }
  if(!weekWheelFrame)weekWheelFrame=requestAnimationFrame(updateWeekFocus);
  /* A short quiet period stands in for "the gesture ended" — it restarts on
     every scroll event, so it only fires once the rail has stopped moving. */
  clearTimeout(weekSettleTimer);
  weekSettleTimer=setTimeout(settleWeekRail,150);
}
function renderCalendar(){
  weekObserver?.disconnect();
  const horizonOffset=weekOffsetFor(DATE_HORIZON);
  const focus=Math.min(Math.max(UI.selectedWeek||0,-2),horizonOffset);
  UI.selectedWeek=focus;
  const minOffset=Math.min(-2,focus-2),maxOffset=Math.max(2,horizonOffset);
  const offsets=Array.from({length:maxOffset-minOffset+1},(_,i)=>minOffset+i);
  $('#weekCarousel').innerHTML=offsets.map(off=>{
    const ds=week(off).filter(d=>d<=DATE_HORIZON),ts=scheduleTasks().filter(t=>ds.some(d=>taskActiveOn(t,d))),is=off===focus;
    if(!ds.length)return '';
    return `<section class="week-panel ${is?'focus-week':'compact-week'}" data-week="${off}">`
      +`<div class="week-panel-header"><div><span class="week-kicker">${is?'正在查看':'滚动查看'}</span><h2>${fmt(ds[0])} — ${fmt(ds.at(-1))}</h2></div>`
      +`<div class="week-totals"><strong>${ts.length}</strong><span>项任务 · 完成 ${ts.filter(t=>t.status==='done').length}</span></div></div>`
      +`<div class="week-days"><div class="week-days-track">${ds.map(iso=>{
        const a=sortTasks(scheduleTasks().filter(t=>taskActiveOn(t,iso)));
        const today=iso===S.today;
        return `<article class="axis-day${today?' today-day':''}" data-date="${iso}" tabindex="0" role="button" aria-expanded="false">`
          +`<div class="axis-day-head"><span>${wd(iso)}</span><strong>${new Date(`${iso}T12:00:00`).getDate()}</strong>${today?'<em>今天</em>':''}</div>`
          +`<div class="axis-day-count">${a.length?`${a.length} 项 · 完成 ${a.filter(t=>t.status==='done').length}`:'暂无安排'}</div>`
          +`${scheduleMemberLabels(a)}</article>`}).join('')}</div></div></section>`}).join('');
  measureWeekPanels();
  /* Park the current week before anything reads a position, then again once the
     web font has settled the real panel heights. */
  alignWeekRail();
  requestAnimationFrame(()=>{measureWeekPanels();alignWeekRail()});
  setTimeout(alignWeekRail,150);
  if(!weekWheelBound){weekWheelBound=true;window.addEventListener('resize',()=>{measureWeekPanels();scheduleWeekWheel()},{passive:true})}
  $('#weekCarousel').onscroll=scheduleWeekWheel;
  scheduleWeekWheel();
  $$('#weekCarousel .axis-day').forEach(d=>{
    d.onmouseenter=()=>showFloat(d);
    d.onmouseleave=()=>hideFloat();
    d.onfocus=()=>showFloat(d);
    d.onblur=()=>hideFloat();
    d.onclick=()=>showFloat(d,!floatPinned||floatSource!==d);
    d.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();showFloat(d,true)}else if(e.key==='Escape'){removeFloat()}};
  });
}
function renderDayDetail(iso){UI.detailDate=iso;switchView('dayDetail')}
function renderDayContent(){
  const iso=UI.detailDate||displayDay();
  $('#dayDetailKicker').textContent=`${wd(iso)} · ${fmt(iso)}`;
  const tasks=scheduleTasks().filter(t=>taskActiveOn(t,iso));
  const add=S.user?.admin?`<button class="secondary-btn calendar-add-task" data-date="${iso}">${icon('plus')}在此日期新增任务</button>`:'';
  $('#dayDetailContent').innerHTML=add+(dailyTaskGroups(tasks)||'<div class="empty-state"><div class="empty-icon">—</div><h3>这一天还没有安排</h3><p>当前查看范围内没有任务。</p></div>');
  bindTaskCards('#dayDetailContent');
  $('#dayDetailContent .calendar-add-task')?.addEventListener('click',()=>newTask(null,iso));
}
function openDrawer(id){
  const t=S.tasks.find(x=>x.id===id);if(!t)return;
  const [c,l]=status(t),p=S.projects.find(p=>p.id===t.projectId),archived=['done','deferred','skipped'].includes(t.status),pendingApproval=['pending_approval','awaiting_approval','submitted'].includes(t.status),rejected=['rejected','returned'].includes(t.status);
  const manage=canManageProject(p)&&p.status==='active'&&!archived&&!pendingApproval&&!rejected,perform=!S.user.admin&&!archived&&t.assignee===S.user.id;
  const editPending=taskEditPending(t),editRequest=taskEditRequest(t),canRequestEdit=perform&&!S.user.admin&&!editPending&&!['done','deferred','skipped','pending_approval','awaiting_approval','submitted'].includes(t.status)&&(!p||p.status==='active');
  const reviewer=canReviewTask(t),editReviewer=editRequest?.approver===S.user.id, reviewActions=pendingApproval&&reviewer?`<div class="drawer-actions approval-actions"><button class="primary-btn" id="approveTask">${icon('check')}审批通过</button><button class="secondary-btn" id="rejectTask">驳回并给建议</button></div>`:'';
  const editReviewActions=editPending&&editReviewer?`<div class="drawer-actions approval-actions"><button class="primary-btn" id="approveEditRequest">${icon('check')}同意修改</button><button class="secondary-btn" id="rejectEditRequest">驳回修改申请</button></div>`:'';
  const completionLogs=S.logs.filter(x=>x.taskId===t.id&&['complete','complete_pending'].includes(x.kind)),latestCompletion=completionLogs[completionLogs.length-1],completionSummary=t.completionSummary||latestCompletion?.summary||t.approval?.summary;
  const rejection=t.rejection||t.approval?.reason;
  const actionCopy=pendingApproval?`<p class="muted approval-pending-note">完成总结已提交，等待项目 Owner 审批；审批前任务会顺延到下一日。${completionSummary?`<br>完成总结：${escapeHTML(completionSummary)}`:''}</p>`:editPending?`<p class="muted approval-pending-note">修改申请已提交，等待 ${escapeHTML(t.assignee===p?.owner?'superadmin':p?.owner||'superadmin')} 审批；审批前请暂缓完成或递延任务。</p>`:rejected?`<p class="rejection-note">任务已驳回${rejection?`：${escapeHTML(rejection)}`:'，请根据建议重新完成。'}</p>`:archived?`<p class="muted">${l} · 本次任务已归档</p>`:perform?`<div class="drawer-actions">${t.status==='todo'?`<button class="secondary-btn" id="startTask">${icon('play')}开始任务</button>`:''}<button class="primary-btn complete-btn" id="completeTask">${icon('check')}提交完成审批</button><button class="defer-btn" id="deferTask">${icon('arrow-up-right')}未完成，递延</button></div>`:'<p class="muted">由任务负责人记录完成或递延。</p>';
  const editSummary=editPending?renderEditRequestSummary(t):'';
  const canDelete=S.user.admin&&!t.fixed&&!t.repeatId&&!pendingApproval&&!rejected;
  $('#drawerContent').innerHTML=`<div class="drawer-kicker">${escapeHTML(projectName(t))} · ${escapeHTML(t.priority)}</div><h2 class="drawer-title">${escapeHTML(t.name)}</h2><p class="drawer-description">${escapeHTML(t.desc||'暂无描述')}</p>${completionSummary?`<div class="completion-summary"><span>最新完成总结</span><p>${escapeHTML(completionSummary)}${latestCompletion?.actual?` · 实际 ${latestCompletion.actual} 分钟`:''}</p></div>`:''}${editSummary}<div class="detail-grid"><div><span>状态</span><strong><i class="status-dot ${c}"></i>${l}</strong></div><div><span>预计时长</span><strong>${t.duration} 分钟</strong></div><div><span>${isMultiDay(t)?`任务周期 · ${spanDays(t)} 天`:'安排日期'}</span><strong>${escapeHTML(t.date)}${isMultiDay(t)?` → ${escapeHTML(taskEnd(t))}`:''}</strong></div><div><span>DDL</span><strong class="${t.status==='done'?'':daysCount(S.today,taskEnd(t))<0?'overdue-text':''}">${escapeHTML(ddlText(t))}</strong></div><div><span>负责人</span><strong>${escapeHTML(t.assignee)}</strong></div></div>${canRequestEdit?'<button class="secondary-btn edit-task-request-btn" id="requestTaskEdit">申请修改任务</button>':''}${S.user.admin&&!editPending&&!['done','deferred','skipped','pending_approval','awaiting_approval','submitted','rejected'].includes(t.status)&&(!p||p.status==='active')?'<button class="secondary-btn edit-task-request-btn" id="directTaskEdit">直接调整任务</button>':''}${manage?'<button class="secondary-btn" id="editTaskAssignee">调整任务指派</button>':''}${canDelete?'<button class="secondary-btn danger-btn" id="deleteTask">删除此任务</button>':''}<div class="history"><h3>任务记录</h3>${S.logs.filter(x=>x.taskId===t.id).map(x=>`<div class="history-item"><i></i><span>${escapeHTML(x.kind==='adjust'?`指派调整：${x.before.assignee} → ${x.after.assignee}`:`${x.kind} · ${x.summary||x.reason||x.remaining||''}`)}</span></div>`).join('')||'<div class="history-item"><i></i><span>暂无记录</span></div>'}</div>${actionCopy}${reviewActions}${editReviewActions}`;
  $('#taskDrawer').classList.remove('hidden');$('#startTask')?.addEventListener('click',()=>act('task.start',{id:t.id}).then(()=>closeDrawer()).catch(()=>{}));$('#completeTask')?.addEventListener('click',()=>complete(t));$('#deferTask')?.addEventListener('click',()=>defer(t));$('#requestTaskEdit')?.addEventListener('click',()=>editTaskRequest(id));$('#directTaskEdit')?.addEventListener('click',()=>editTaskRequest(id,true));$('#editTaskAssignee')?.addEventListener('click',()=>editTaskAssignment(id));$('#deleteTask')?.addEventListener('click',async()=>{if(!confirm(`确认删除「${t.name}」？删除后将从日历移除。`))return;try{await act('task.delete',{id:t.id});closeDrawer()}catch(e){}});$('#approveTask')?.addEventListener('click',()=>reviewTask(t.id,true));$('#rejectTask')?.addEventListener('click',()=>reviewTask(t.id,false));$('#approveEditRequest')?.addEventListener('click',()=>reviewTaskEdit(t.id,true));$('#rejectEditRequest')?.addEventListener('click',()=>reviewTaskEdit(t.id,false));
}
function taskEditRequest(t){
  if(!t)return null;
  const embedded=t.editRequest||t.edit_request||t.changeRequest;
  if(embedded)return embedded;
  return (S.editRequests||[]).filter(r=>r.taskId===t.id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).find(Boolean)||null;
}
function taskEditPending(t){const r=taskEditRequest(t);return Boolean(r&&(r.status==='pending'||r.state==='pending'))}
function renderEditRequestSummary(t){const r=taskEditRequest(t);if(!r)return '';const c=r.changes||r.requested||{};const labels={name:'名称',desc:'描述',date:'日期',deadline:'期限',duration:'时长',priority:'优先级',assignee:'负责人'};const rows=Object.entries(labels).filter(([k])=>c[k]!==undefined&&String(c[k])!==String(t[k]??'')).map(([k,label])=>`<li><b>${label}</b><span>${escapeHTML(String(c[k]))}</span></li>`).join('');const state=r.status==='approved'?'修改已通过':r.status==='rejected'?'修改申请已驳回':'待审批的修改申请';return `<div class="edit-request-summary"><strong>${state}</strong><small>申请人：${escapeHTML(r.requester||r.requestedBy||t.assignee)}${r.reason?` · 理由：${escapeHTML(r.reason)}`:''}${r.rejection?` · 驳回建议：${escapeHTML(r.rejection)}`:''}</small>${rows?`<ul>${rows}</ul>`:''}</div>`}
function canReviewTask(t){
  if(!t||!S.user||t.assignee==='superadmin')return false;
  const p=t.projectId&&S.projects.find(x=>x.id===t.projectId);
  if(!p)return Boolean(S.user.admin);
  return p.owner===S.user.id;
}
function complete(t){openModal(`<div class="eyebrow">完成记录 · ${escapeHTML(t.name)}</div><h2>提交完成审批</h2><p class="notification-detail">提交后任务会顺延到下一日并标记为待审批，由项目 Owner 审批通过后才会结束。</p><label class="form-field">完成总结<textarea id="doneText" placeholder="请说明完成结果、交付物或验证方式"></textarea></label><label class="form-field">实际耗时（分钟）<input id="actualMins" type="number" value="${t.duration}"></label><label class="form-field">工作感受<select id="feeling"><option>顺利</option><option>一般</option><option>困难</option><option>阻塞</option></select></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmComplete">提交审批</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmComplete').onclick=async()=>{try{await api('/api/action',{action:'task.complete',data:{id:t.id,summary:$('#doneText').value||'完成任务',actual:Number($('#actualMins').value),feeling:$('#feeling').value}});closeModal();closeDrawer();await refresh();toast('完成总结已提交，等待审批')}catch(e){toast(e.message)}}}
function editTaskRequest(id,direct=false){
  const t=S.tasks.find(x=>x.id===id),p=S.projects.find(x=>x.id===t?.projectId);if(!t)return;
  const users=p?projectAssignees(p):S.users.filter(u=>u.active&&!u.admin);
  const minDate=p?.start||S.today,maxDate=p?.end? (p.end<DATE_HORIZON?p.end:DATE_HORIZON):DATE_HORIZON;
  openModal(`<div class="eyebrow">${escapeHTML(projectName(t))} · 任务修改</div><h2>${direct?'直接调整任务':'申请修改任务'}</h2><p>${direct?'Super Admin 直接调整后立即生效。':`提交后由 ${escapeHTML(p?.owner||'superadmin')} 审批。请填写修改理由，审批通过后才会更新任务。`}</p><label class="form-field">任务名称<input id="editTaskName" maxlength="120" value="${escapeHTML(t.name)}"></label><label class="form-field">任务描述<textarea id="editTaskDesc">${escapeHTML(t.desc||'')}</textarea></label><div class="task-form-grid"><label class="form-field">安排日期<input id="editTaskDate" type="date" min="${escapeHTML(minDate)}" ${maxDate?`max="${escapeHTML(maxDate)}"`:''} value="${escapeHTML(t.date||S.today)}"></label><label class="form-field">截止时间<input id="editTaskDeadline" type="date" min="${escapeHTML(minDate)}" ${maxDate?`max="${escapeHTML(maxDate)}"`:''} value="${escapeHTML(t.deadline||t.date||'')}"></label><label class="form-field">预计时长<input id="editTaskDuration" type="number" min="1" max="1440" value="${Number(t.duration)||30}"></label><label class="form-field">优先级<select id="editTaskPriority"><option ${t.priority==='P0'?'selected':''}>P0</option><option ${t.priority==='P1'?'selected':''}>P1</option><option ${t.priority==='P2'?'selected':''}>P2</option></select></label></div><label class="form-field">协作人 / 负责人<select id="editTaskAssignee">${users.map(u=>`<option value="${escapeHTML(u.id)}" ${u.id===t.assignee?'selected':''}>${escapeHTML(u.id)}${p&&u.id===p.owner?' · Owner':''}</option>`).join('')}</select></label><label class="form-field">修改理由<textarea id="editTaskReason" required placeholder="例如：需求范围扩大，需要延长交付期限并调整负责人"></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmTaskEdit">${direct?'保存调整':'提交修改申请'}</button></div>`);
  if(direct)$('#editTaskReason')?.closest('label')?.remove();
  $('#cancelAction').onclick=closeModal;
  $('#confirmTaskEdit').onclick=async()=>{const reason=$('#editTaskReason')?.value.trim()||'',name=$('#editTaskName').value.trim(),date=$('#editTaskDate').value,deadline=$('#editTaskDeadline').value;if(!name){toast('请填写任务名称');return}if(!direct&&!reason){toast('请填写修改理由');return}if(deadline&&date&&deadline<date){toast('截止时间不能早于安排日期');return}const changes={name,desc:$('#editTaskDesc').value,date,deadline,duration:Number($('#editTaskDuration').value),priority:$('#editTaskPriority').value,assignee:$('#editTaskAssignee').value};try{if(direct){await act('task.update',{id,...changes});closeModal();closeDrawer();toast('任务已直接调整')}else{await act('task.edit_request',{id,changes,reason});closeModal();closeDrawer();toast('修改申请已发送，等待审批')}}catch(e){}};
}
function reviewTaskEdit(id,accept,notificationId){
  const r=(S.editRequests||[]).find(x=>x.id===id)||S.editRequests?.find(x=>x.taskId===id&&x.status==='pending'),t=S.tasks.find(x=>x.id===r?.taskId);if(!t||!r)return;
  if(accept){(async()=>{try{await act('task.edit_review',{id:r.id,accept:true});if(notificationId)await act('inbox.read',{id:notificationId});closeModal();closeDrawer();toast('任务修改已批准')}catch(e){}})();return}
  openModal(`<div class="eyebrow">任务修改审批 · 驳回</div><h2>驳回修改申请</h2><p>申请理由：${escapeHTML(r.reason||'未填写')}</p><label class="form-field">驳回建议<textarea id="editRejectReason" placeholder="请说明需要如何调整"></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmEditReject">驳回并通知</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmEditReject').onclick=async()=>{const reason=$('#editRejectReason').value.trim();if(!reason){toast('请填写驳回建议');return}try{await act('task.edit_review',{id:r.id,accept:false,reason});if(notificationId)await act('inbox.read',{id:notificationId});closeModal();closeDrawer()}catch(e){}};
}
function reviewTask(id,accept,notificationId){if(accept){act('task.review',{id,accept:true}).then(async()=>{if(notificationId)await act('inbox.read',{id:notificationId});closeDrawer();toast('任务已审批通过')}).catch(()=>{});return}openModal(`<div class="eyebrow">任务审批 · 驳回</div><h2>退回任务并给出建议</h2><label class="form-field">驳回建议<textarea id="taskRejectReason" placeholder="请说明需要补充或修改的内容"></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmTaskReject">驳回并通知成员</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmTaskReject').onclick=async()=>{const reason=$('#taskRejectReason').value.trim();if(!reason){toast('请填写驳回建议');return}try{await act('task.review',{id,accept:false,reason});if(notificationId)await act('inbox.read',{id:notificationId});closeModal();closeDrawer()}catch(e){}}}
function defer(t){openModal(`<div class="eyebrow">未完成 · 递延预览</div><h2>先说说卡在哪里</h2><label class="form-field">原因<select id="deferReason"><option>时间不足</option><option>等待他人</option><option>需求变化</option><option>遇到阻塞</option><option>其他</option></select></label><label class="form-field">剩余工作<textarea id="remainText"></textarea></label><label class="form-field">递延到<input id="deferDate" type="date" max="${DATE_HORIZON}" value="${add(t.date,1)}"></label><label class="form-field">剩余时长<input id="remainMins" type="number" value="${Math.max(15,Math.round(t.duration/2))}"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">返回修改</button><button class="primary-btn" id="confirmDefer">确认递延</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmDefer').onclick=async()=>{try{await api('/api/action',{action:'task.defer',data:{id:t.id,reason:$('#deferReason').value,remaining:$('#remainText').value||'继续完成原任务',date:$('#deferDate').value,duration:Number($('#remainMins').value)}});closeModal();closeDrawer();await refresh();toast('任务已递延')}catch(e){toast(e.message)}}}
function diaryReport(author,day){
  return (S.diaries||[]).find(r=>r.author===author&&r.date===day)||(S.reports||[]).filter(r=>r.author===author&&r.date===day).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
}
function diaryWeekDays(){return week(UI.diaryWeek||0)}
function diaryDayStats(author,day){
  const saved=(S.diaryStats||[]).find(r=>r.userId===author&&r.date===day);if(saved)return saved;
  const tasks=S.tasks.filter(t=>t.assignee===author&&taskActiveOn(t,day)&&t.status!=='skipped'),done=tasks.filter(t=>t.status==='done');
  return {completed:done.length,total:tasks.length,load:done.reduce((n,t)=>n+(Number(t.duration)||0),0),loadRatio:tasks.length?done.length/tasks.length:0};
}
function diaryContent(author,day){
  const draft=UI.diaryDrafts?.[`${author}:${day}`];if(draft)return draft;
  const r=diaryReport(author,day);if(r)return typeof r.content==='string'?{done:r.content,risks:'',next:''}:r.content||{};
  const tasks=S.tasks.filter(t=>t.assignee===author&&taskActiveOn(t,day)&&t.status!=='skipped');
  return {done:tasks.filter(t=>t.status==='done').map(t=>'✓ '+t.name).join('\n'),risks:'',next:''};
}
function diaryDayCard(day,author){
  const r=diaryReport(author,day),c=diaryContent(author,day),stats=diaryDayStats(author,day),draft=UI.diaryDrafts?.[`${author}:${day}`];
  return `<button class="diary-day-card ${day===S.today?'today':''}" data-diary-date="${day}"><span class="diary-day-top"><b>${wd(day)}</b><strong>${fmt(day)}</strong></span><span class="diary-day-status">${draft?'有未保存编辑':r?(r.auto?'系统已统计':'已记录'):'待记录'} · ${stats.completed}/${stats.total} 项完成</span><span class="diary-day-preview">${escapeHTML(c.done??'')||'点击打开这一天的笔记本'}</span></button>`;
}
function diaryNotebook(author,day,admin=false){
  const r=diaryReport(author,day),c=diaryContent(author,day),stats=diaryDayStats(author,day),draft=UI.diaryDrafts?.[`${author}:${day}`],readonly=admin?' readonly':'';
  return `<div class="diary-notebook"><div class="notebook-toolbar"><button class="secondary-btn diary-back">← 返回${admin?'成员日记':''}周视图</button><div><span class="eyebrow">${escapeHTML(author)} · 日记本${admin?' · 只读':''}</span><h2>${wd(day)} · ${fmt(day)}</h2></div><span class="notebook-state">${draft?'未保存':r?(r.auto?'系统统计 · 可编辑':'已保存'):'未记录'}</span></div><div class="diary-date-nav"><button class="secondary-btn diary-prev-date">← 前一天</button><span>${escapeHTML(day)}</span><button class="secondary-btn diary-next-date">后一天 →</button></div><div class="notebook-paper"><div class="notebook-date">${fmt(day)}　${wd(day)}</div><label>今日完成<textarea id="diaryDone"${readonly} placeholder="${admin?'这一天尚未记录':'今天完成了什么？'}">${escapeHTML(c.done??'')}</textarea></label><label>未完成与阻塞<textarea id="diaryRisks"${readonly} placeholder="${admin?'暂无记录':'哪些事情被递延？原因是什么？'}">${escapeHTML(c.risks??'')}</textarea></label><label>明日计划<textarea id="diaryNext"${readonly} placeholder="${admin?'暂无记录':'明天最重要的工作'}">${escapeHTML(c.next??'')}</textarea></label><div class="notebook-footer"><span class="muted">${stats.completed}/${stats.total} 项任务完成 · 已完成任务预计 ${(stats.load/60).toFixed(1)}h</span>${admin?'<span class="muted">成员日记，仅供查阅</span>':'<button class="primary-btn" id="saveDiaryBtn">保存日记</button>'}</div></div></div>`;
}
function renderDiaryAdmin(){
  const members=S.users.filter(u=>u.active&&!u.admin),day=UI.diaryLogDate||S.today;
  const logs=Array.isArray(S.workCompletions)?S.workCompletions.filter(l=>String(l.completedAt||'').slice(0,10)===day).map(l=>({label:`${l.kind==='project'?'项目':'任务'}完成 · ${l.name}`,user:l.assignee||l.owner,at:l.completedAt,project:l.projectName,taskId:l.taskId,projectId:l.projectId,kind:l.kind})):S.tasks.filter(t=>t.status==='done'&&String(t.completedAt||t.date||'').slice(0,10)===day).map(t=>({label:`任务完成 · ${t.name}`,user:t.assignee,at:t.completedAt||t.date,project:projectName(t),taskId:t.id,projectId:t.projectId,kind:'task'}));
  const rows=members.map(u=>{const stats=diaryDayStats(u.id,day),pct=stats.total?Math.round(stats.completed/stats.total*100):0;return `<div class="diary-load-row"><strong>${escapeHTML(u.id)}</strong><span>${stats.completed}/${stats.total} 项完成</span><div class="progress"><i style="width:${pct}%"></i></div><b>${pct}%</b></div>`}).join('');
  const projectRows=visibleProjects().filter(p=>p.status==='active').map(p=>{const ts=S.tasks.filter(t=>t.projectId===p.id&&t.status!=='skipped'),done=ts.filter(t=>t.status==='done').length,pct=ts.length?Math.round(done/ts.length*100):0;return `<div class="diary-project-progress"><strong>${escapeHTML(p.name)}</strong><span>${done}/${ts.length} 完成 · ${pct}%</span></div>`}).join('');
  $('#diaryWorkspace').innerHTML=`<div class="diary-admin"><div class="notebook-shelf-heading"><div><span class="eyebrow">SUPERADMIN · 成员笔记本</span><h2>笔记本展示柜</h2></div><span class="muted">左右滑动选择成员，点击进入个人日记周视图</span></div><div class="notebook-shelf">${members.map(u=>{const r=diaryReport(u.id,S.today);return `<button class="member-notebook" data-member="${escapeHTML(u.id)}"><span class="notebook-cover">▤</span><strong>${escapeHTML(u.id)}</strong><small>${r?(r.auto?'今日系统已统计':'今日已记录'):'等待今日记录'}</small></button>`}).join('')||'<p class="muted">暂无成员笔记本。</p>'}</div><div class="diary-log-toolbar"><label>查看工作日期<input id="diaryLogDate" type="date" max="${DATE_HORIZON}" value="${escapeHTML(day)}"></label><button class="secondary-btn" id="diaryLogToday">返回今天</button></div><div class="diary-admin-grid"><div class="diary-log-panel"><div class="panel-heading"><div><h2>工作日志 · ${fmt(day)}</h2><span class="muted">仅记录审批通过后完成的任务与项目 · 点击查看详情</span></div></div><div class="diary-log-list">${logs.length?logs.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).map(l=>`<button class="diary-log-item diary-log-button" data-task-id="${escapeHTML(l.taskId||'')}" data-project-id="${escapeHTML(l.projectId||'')}" data-log-kind="${escapeHTML(l.kind||'')}"><i></i><span>${escapeHTML(l.label)}${l.project?`<small class="diary-log-project">${escapeHTML(l.project)}</small>`:''}</span><small>${escapeHTML(l.user||'')}　${icon('chevron-right')}</small></button>`).join(''):'<p class="muted">当日暂无已完成任务或项目。</p>'}</div><div class="diary-projects"><h3>项目当前进度</h3>${projectRows||'<p class="muted">暂无进行中的项目。</p>'}</div></div><div class="diary-load-panel"><div class="panel-heading"><div><h2>成员负载</h2><span class="muted">当日完成任务占比</span></div></div>${rows||'<p class="muted">暂无成员数据。</p>'}</div></div></div>`;
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
  $('#diaryWorkspace').innerHTML=`<div class="diary-week">${me.admin?'<div><button class="secondary-btn diary-shelf-back">← 返回笔记本展示柜</button></div>':''}<div class="diary-week-toolbar"><div><span class="eyebrow">${escapeHTML(author)} · ${fmt(days[0])} — ${fmt(days.at(-1))}</span><h2>${me.admin?escapeHTML(author)+' 的日记':'我的日记'}周视图</h2></div><div class="diary-week-actions"><button class="secondary-btn diary-prev-week">← 上周</button><button class="secondary-btn diary-current-week">返回本周</button><button class="secondary-btn diary-next-week">下周 →</button></div></div><span class="muted">点击任意日期打开笔记本${me.admin?' · 成员日记仅供查阅':' · 编辑内容可随时保存'}</span><div class="diary-week-track">${days.map(d=>diaryDayCard(d,author)).join('')}</div><div class="diary-stat-strip"><span>今日完成 <b>${stats.completed}/${stats.total}</b></span><span>已完成任务预计时长 <b>${(stats.load/60).toFixed(1)}h</b></span><span>今日完成比例 <b>${Math.round((stats.loadRatio||0)*100)}%</b></span></div></div>`;
  $('.diary-prev-week').onclick=()=>{UI.diaryWeek=(UI.diaryWeek||0)-1;renderSummary()};$('.diary-next-week').onclick=()=>{if((UI.diaryWeek||0)>=weekOffsetFor(DATE_HORIZON)){toast(`日期范围目前只支持到 ${DATE_HORIZON}`);return}UI.diaryWeek=(UI.diaryWeek||0)+1;renderSummary()};$('.diary-current-week').onclick=()=>{UI.diaryWeek=0;renderSummary()};
  if(me.admin)$('.diary-shelf-back').onclick=()=>{UI.diaryAuthor=null;UI.diaryDate=null;renderSummary()};
  $$('.diary-day-card').forEach(b=>b.onclick=()=>{UI.diaryDate=b.dataset.diaryDate;renderSummary()});
}
function canManageProject(p){return Boolean(p&&(S.user?.admin||p.owner===S.user?.id))}
function projectAssignees(p){return S.users.filter(u=>u.active&&p?.members?.[u.id]==='accepted')}
function manageableProjects(){return S.projects.filter(p=>p.status==='active'&&canManageProject(p))}
function projectTasksComplete(p){
  if(!p||p.status!=='active')return false;
  const tasks=S.tasks.filter(t=>t.projectId===p.id);
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
  openModal(`<div class="eyebrow">${escapeHTML(p.name)} · 项目结项</div><h2>申请项目结项</h2><p class="notification-detail">所有子任务已完成。填写结项报告后，将提交给 superadmin 审批。</p><label class="form-field">结项报告<textarea id="projectCompletionReport" required maxlength="10000" placeholder="请总结项目成果、交付物、风险收尾和后续建议"></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmProjectCompletion">提交结项审批</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmProjectCompletion').onclick=async()=>{const report=$('#projectCompletionReport').value.trim();if(!report){toast('请填写结项报告');return}try{await act('project.complete_request',{id,report});closeModal()}catch(e){}};
}
function renderProjects(){
  const admin=Boolean(S.user?.admin);
  const projects=visibleProjects();
  $('#projectsView .eyebrow').textContent=`${admin?'团队项目管理':'我的项目'} · ${projects.length} 个项目`;
  $('#projectsView h1').textContent=admin?'项目与任务管理':'我的项目与任务';
  $('#projectsView .page-intro p').textContent=admin?'直接指定 Owner、添加协作者，并在项目下分配任务。':S.projects.some(p=>p.owner===S.user.id)?'在负责的项目下分配和调整任务，邀请协作者加入。':'查看分配给你的项目任务，记录完成情况和每日进度。';
  $('#projectGrid').innerHTML=projects.map(p=>{
    const tasks=sortTasks(S.tasks.filter(t=>t.projectId===p.id)),done=tasks.filter(t=>t.status==='done').length;
    const accepted=Object.entries(p.members||{}).filter(([,v])=>v==='accepted').map(([id])=>id),pending=Object.entries(p.members||{}).filter(([,v])=>v==='pending').map(([id])=>id);
    const manage=canManageProject(p)&&p.status==='active',hasSlot=S.users.some(u=>u.active&&!u.admin&&u.id!==p.owner&&!accepted.includes(u.id)&&(admin||!pending.includes(u.id)));
    return `<article class="project-card project-node"><div class="project-node-heading"><div><div class="project-title"><h3>${escapeHTML(p.name)}</h3><span class="project-status">${projectStatus(p)}</span></div><p>${escapeHTML(p.desc||'暂无描述')}</p></div><div class="project-node-actions">${manage?`<button class="primary-btn add-project-task" data-project="${escapeHTML(p.id)}">${icon('plus')}新建并指派任务</button>`:''}${manage&&hasSlot?`<button class="secondary-btn invite-members" data-id="${escapeHTML(p.id)}">${admin?'直接添加协作者':'邀请协作者'}</button>`:''}${p.status==='active'&&!manage&&(p.members||{})[S.user.id]==='accepted'?`<button class="ghost-btn leave-project" data-id="${escapeHTML(p.id)}">退出项目</button>`:''}${p.status==='pending'&&admin?`<button class="secondary-btn approve-project" data-id="${escapeHTML(p.id)}">审批项目</button>`:''}${p.status==='active'&&manage&&!admin&&projectTasksComplete(p)?`<button class="secondary-btn request-project-completion" data-id="${escapeHTML(p.id)}">申请项目结项</button>`:''}${p.status==='active'&&manage&&!admin&&!projectTasksComplete(p)?`<span class="muted project-completion-hint">${tasks.length?'完成全部子任务后可结项':'创建子任务后可结项'}</span>`:''}${p.status==='pending_completion'&&admin?`<button class="secondary-btn approve-project-completion" data-id="${escapeHTML(p.id)}">审批项目完成</button>`:''}${canManageProject(p)?`<button class="ghost-btn delete-project" data-id="${escapeHTML(p.id)}">删除项目</button>`:''}</div></div><div class="project-members"><span>Owner · ${escapeHTML(p.owner)}　协作者：${accepted.filter(id=>id!==p.owner).map(escapeHTML).join('、')||'暂无'}${pending.length?`　待确认：${pending.map(escapeHTML).join('、')}`:''}</span><span>${canManageProject(p)?'项目':'我的任务'} ${done}/${tasks.length} 已完成 · 截止 ${escapeHTML(p.end||'未设置')}</span></div><div class="project-task-tree"><div class="project-tree-label">${canManageProject(p)?'项目任务':'分配给我的任务'} <span>${tasks.length}</span></div>${tasks.map(t=>`<div class="project-child-row"><button class="project-task-open" data-id="${escapeHTML(t.id)}"><span class="priority ${escapeHTML(t.priority)}">${escapeHTML(t.priority)}</span><strong>${escapeHTML(t.name)}</strong><span class="child-assignee">${escapeHTML(t.assignee)}</span><span class="child-date">${escapeHTML(t.date)}</span><span>${status(t)[1]}</span><span aria-hidden="true">${icon('chevron-right')}</span></button>${manage&&['todo','doing'].includes(t.status)?`<button class="ghost-btn assign-project-task" data-id="${escapeHTML(t.id)}">调整指派</button>`:''}</div>`).join('')||`<p class="project-task-empty">${manage?'还没有任务，从这里安排第一项工作。':p.status==='pending'?'项目审批通过后，Owner 可创建和指派任务。':'暂无分配给你的任务。'}</p>`}</div></article>`;
  }).join('')||'<div class="empty-state">暂无项目，可先申请创建项目。</div>';
  $$('.add-project-task').forEach(b=>b.onclick=()=>newTask(b.dataset.project));
  $$('.project-task-open').forEach(b=>b.onclick=()=>openDrawer(b.dataset.id));
  $$('.assign-project-task').forEach(b=>b.onclick=()=>editTaskAssignment(b.dataset.id));
  $$('.approve-project').forEach(b=>b.onclick=()=>{const n=S.notifications.find(n=>n.kind==='approval'&&n.reference===b.dataset.id);if(n)openNotification(n.id)});
  $$('.request-project-completion').forEach(b=>b.onclick=()=>requestProjectCompletion(b.dataset.id));
  $$('.approve-project-completion').forEach(b=>b.onclick=()=>{const n=S.notifications.find(n=>n.kind==='project_completion'&&n.reference===b.dataset.id);if(n)openNotification(n.id)});
  $$('.invite-members').forEach(b=>b.onclick=()=>inviteCollaborators(b.dataset.id));
  $$('.leave-project').forEach(b=>b.onclick=()=>leaveProject(b.dataset.id));
  $$('.delete-project').forEach(b=>b.onclick=()=>deleteProject(b.dataset.id));
}
function deleteProject(projectId){
  const p=S.projects.find(x=>x.id===projectId);
  if(!p)return;
  if(!canManageProject(p)){toast('只有项目 Owner 或 superadmin 可删除项目');return}
  const tasks=S.tasks.filter(t=>t.projectId===p.id),done=tasks.filter(t=>t.status==='done').length;
  const members=Object.entries(p.members||{}).filter(([,v])=>v==='accepted').map(([id])=>id);
  openModal(`<div class="eyebrow danger-eyebrow">危险操作 · 不可撤销</div><h2>删除项目「${escapeHTML(p.name)}」</h2><div class="danger-panel"><p>此操作将永久删除该项目及其全部子任务，并清除相关修改申请、报告与通知记录。删除后无法恢复。</p><ul class="danger-impact"><li>子任务 <strong>${tasks.length}</strong> 项（已完成 ${done} 项）</li><li>参与成员 <strong>${members.length}</strong> 人</li><li>相关报告、申请与通知将一并清除</li></ul></div><label class="danger-check"><input type="checkbox" id="deleteAck"> 我已了解该项目及全部子任务将被永久删除，且无法恢复</label><label class="danger-confirm">请输入项目名称 <code>${escapeHTML(p.name)}</code> 以继续<input id="deleteConfirmText" autocomplete="off" spellcheck="false" placeholder="${escapeHTML(p.name)}"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="danger-btn" id="confirmDeleteProject" disabled>永久删除项目</button></div>`);
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
    +`<p>退出后你不再是这个项目的协作者，它的工作区（沟通频道）会从你的沟通区里消失，也不会再有未读。`
    +`已经指派给你的任务不会被删除，需要 Owner 重新安排。</p>`
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
  openModal(`<div class="eyebrow">${escapeHTML(p.name)} · ${admin?'管理员直接指派':'Owner 协作邀请'}</div><h2>${admin?'直接添加协作者':'邀请协作者'}</h2><p>${admin?'添加后立即加入项目，无需成员确认。系统会通知协作者和 Owner。':'成员在收件箱接受邀请后加入项目，随后可为其指派任务。以下只显示项目时间范围内的任务总数。'}</p><fieldset class="member-checkboxes" id="currentMembers"><legend>当前协作者（${current.length}）</legend>${current.map(id=>`<div class="member-row"><strong>${escapeHTML(nameOf(id))}</strong><small>${escapeHTML(id)} · 时间范围内 <b>${memberTaskCount(id,p)}</b> 项任务</small><button type="button" class="ghost-btn remove-member" data-member="${escapeHTML(id)}">移出</button></div>`).join('')||'<p class="muted">还没有协作者</p>'}</fieldset><div class="member-checkboxes">${candidates.map(u=>`<label><input type="checkbox" name="inviteMember" value="${escapeHTML(u.id)}"> <strong>${escapeHTML(u.id)}</strong><small>${existing[u.id]==='pending'?'当前待确认 · 可直接加入':'成员'} · 时间范围内 <b data-member-load="${escapeHTML(u.id)}">${memberTaskCount(u.id,p)}</b> 项任务</small></label>`).join('')||'<p class="muted">暂无可添加成员</p>'}</div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmInvite" ${candidates.length?'':'disabled'}>${admin?'直接添加并通知':'发送邀请'}</button></div>`);
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
function renderInbox(){
  const notifications=S.notifications||[],requests=(S.requests||[]).filter(r=>r.status==='pending');
  const approvalInfo=x=>{const chatMention=x.kind==='chat_mention';const p=S.projects.find(p=>p.id===x.reference);const editReq=(S.editRequests||[]).find(r=>r.id===x.reference);const task=S.tasks.find(t=>t.id===x.reference||t.id===editReq?.taskId);const projectPending=Boolean(S.user?.admin&&x.kind==='approval'&&x.title==='项目审批申请'&&p?.status==='pending');const projectCompletionPending=Boolean(S.user?.admin&&x.kind==='project_completion'&&p?.status==='pending_completion');const taskPending=Boolean(x.kind==='task_approval'&&task&&canReviewTask(task)&&['pending_approval','awaiting_approval','submitted'].includes(task.status));const editPending=Boolean(x.kind==='task_edit_approval'&&editReq&&editReq.status==='pending'&&editReq.approver===S.user?.id&&task);return {project:p,task,editReq,projectPending,projectCompletionPending,taskPending,editPending,chatMention,pending:projectPending||projectCompletionPending||taskPending||editPending}};
  const unreadRequests=requests.filter(r=>!r.read).length;
  const unreadNotifications=notifications.filter(x=>!x.read).length;
  const unreadCount=unreadRequests+unreadNotifications;$('#inboxCount').textContent=unreadCount;$('.notification-dot').classList.toggle('hidden',unreadCount===0);$('#inboxView .eyebrow').textContent=`通知中心 · ${unreadCount} 条未读`;
  const cards=[...requests.map(r=>{const p=S.projects.find(x=>x.id===r.projectId);const unread=!r.read;return {priority:2,time:r.createdAt,html:`<article class="inbox-item request-inbox-item ${unread?'unread':''}" data-request="${escapeHTML(r.id)}"><div class="inbox-icon">${icon('folder')}</div><div class="inbox-copy"><strong>项目协作邀请</strong>${unread?'<i class="unread-dot"></i>':''}<p>邀请你加入「${escapeHTML(p?.name||'项目')}」。接受后项目任务才会进入你的日程。</p><small>${escapeHTML(r.createdAt)}</small><div class="inbox-actions"><button class="primary-btn accept-request" data-id="${escapeHTML(r.id)}">接受</button><button class="secondary-btn reject-request" data-id="${escapeHTML(r.id)}">拒绝</button></div></div></article>`}}),...notifications.map(x=>{const {project,task,projectPending,projectCompletionPending,taskPending,editPending,chatMention,pending}=approvalInfo(x);const unread=!x.read||pending;const actions=chatMention?`<div class="inbox-actions"><button class="primary-btn open-chat-from-mention" data-channel="${escapeHTML(x.channel||'')}">去沟通区</button></div>`:projectPending?`<div class="inbox-actions"><button class="primary-btn approve-project-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">同意创建</button><button class="secondary-btn reject-project-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回申请</button></div>`:projectCompletionPending?`<div class="inbox-actions"><button class="primary-btn approve-project-completion-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">同意完成</button><button class="secondary-btn reject-project-completion-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回申请</button></div>`:taskPending?`<div class="inbox-actions"><button class="primary-btn approve-task-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">审批通过</button><button class="secondary-btn reject-task-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回并建议</button></div>`:editPending?`<div class="inbox-actions"><button class="primary-btn approve-edit-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">同意修改</button><button class="secondary-btn reject-edit-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回申请</button></div>`:'';return {priority:pending?2:unread?1:0,time:x.createdAt,html:`<article class="inbox-item ${unread?'unread':''} ${pending?'approval-pending':''}" data-id="${escapeHTML(x.id)}"><div class="inbox-icon">${editPending?icon('edit'):projectCompletionPending?icon('diamond'):taskPending?icon('check'):x.kind==='report'?icon('clock'):x.kind==='approval'?icon('folder'):x.kind==='request'?icon('mail'):icon('trend')}</div><div class="inbox-copy"><strong>${escapeHTML(x.title)}</strong>${unread?'<i class="unread-dot"></i>':''}<p>${escapeHTML(x.body)}</p><small>${escapeHTML(x.createdAt)}</small>${actions}</div><span class="task-arrow">${icon('chevron-right')}</span></article>`}})].sort((a,b)=>(b.priority-a.priority)||String(b.time).localeCompare(String(a.time)));
  $('#inboxList').innerHTML=cards.map(x=>x.html).join('')||'<div class="empty-state">收件箱很安静</div>';
  $$('#inboxList .inbox-item').forEach(e=>{e.tabIndex=0;e.onkeydown=ev=>{if(ev.key==='Enter'&&!ev.target.closest('.inbox-actions')){if(e.dataset.id)openNotification(e.dataset.id);else openRequest(e.dataset.request)}}});
  $$('#inboxList .inbox-item[data-id]').forEach(e=>e.onclick=ev=>{if(ev.target.closest('.inbox-actions'))return;openNotification(e.dataset.id)});
  $$('#inboxList .inbox-item[data-request]').forEach(e=>e.onclick=ev=>{if(ev.target.closest('.inbox-actions'))return;openRequest(e.dataset.request)});
  $$('.accept-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();act('request.respond',{id:b.dataset.id,accept:true})});$$('.reject-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();act('request.respond',{id:b.dataset.id,accept:false})});
  $$('.approve-project-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewProject(b.dataset.id,true,b.dataset.notification)});$$('.reject-project-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewProject(b.dataset.id,false,b.dataset.notification)});
  $$('.approve-task-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewTask(b.dataset.id,true,b.dataset.notification)});
  $$('.approve-project-completion-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewProjectCompletion(b.dataset.id,true,b.dataset.notification)});$$('.reject-project-completion-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewProjectCompletion(b.dataset.id,false,b.dataset.notification)});$$('.reject-task-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewTask(b.dataset.id,false,b.dataset.notification)});
  $$('.approve-edit-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewTaskEdit(b.dataset.id,true,b.dataset.notification)});$$('.reject-edit-request').forEach(b=>b.onclick=ev=>{ev.stopPropagation();reviewTaskEdit(b.dataset.id,false,b.dataset.notification)});
}
function openRequest(id){const r=S.requests.find(x=>x.id===id);if(!r)return;const p=S.projects.find(x=>x.id===r.projectId);openModal(`<div class="eyebrow">收件箱详情 · 项目邀请</div><h2>加入「${escapeHTML(p?.name||'项目')}」</h2><p class="notification-detail">项目 Owner 邀请你加入协作。接受后，你将看到该项目中分配给你的任务。</p><div class="detail-grid"><div><span>Owner</span><strong>${escapeHTML(p?.owner||'—')}</strong></div><div><span>项目状态</span><strong>${p?projectStatus(p):'—'}</strong></div></div><div class="modal-footer"><button class="secondary-btn" id="detailRejectRequest">拒绝</button><button class="primary-btn" id="detailAcceptRequest">接受邀请</button></div>`);$('#detailAcceptRequest').onclick=()=>{closeModal();act('request.respond',{id,accept:true})};$('#detailRejectRequest').onclick=()=>{closeModal();act('request.respond',{id,accept:false})};api('/api/action',{action:'request.read',data:{id}}).then(refresh).catch(()=>{})}
function openNotification(id){
  const n=S.notifications.find(x=>x.id===id); if(!n)return;
  const editReq=(S.editRequests||[]).find(r=>r.id===n.reference),p=n.reference&&S.projects.find(x=>x.id===n.reference),t=n.reference&&S.tasks.find(x=>x.id===n.reference)||S.tasks.find(x=>x.id===editReq?.taskId),projectPending=Boolean(S.user?.admin&&n.kind==='approval'&&p?.status==='pending'),projectCompletionPending=Boolean(S.user?.admin&&n.kind==='project_completion'&&p?.status==='pending_completion'),taskPending=Boolean(n.kind==='task_approval'&&t&&canReviewTask(t)&&['pending_approval','awaiting_approval','submitted'].includes(t.status)),editPending=Boolean(n.kind==='task_edit_approval'&&editReq&&editReq.status==='pending'&&editReq.approver===S.user?.id&&t);
  const action=projectPending?`<div class="modal-footer"><button class="secondary-btn" id="detailRejectProject">驳回申请</button><button class="primary-btn" id="detailApproveProject">同意创建</button></div>`:projectCompletionPending?`<div class="modal-footer"><button class="secondary-btn" id="detailRejectProjectCompletion">驳回申请</button><button class="primary-btn" id="detailApproveProjectCompletion">同意完成</button></div>`:taskPending?`<div class="modal-footer"><button class="secondary-btn" id="detailRejectTask">驳回并给建议</button><button class="primary-btn" id="detailApproveTask">审批通过</button></div>`:editPending?`<div class="modal-footer"><button class="secondary-btn" id="detailRejectEdit">驳回申请</button><button class="primary-btn" id="detailApproveEdit">同意修改</button></div>`:'<div class="modal-footer"><button class="secondary-btn" id="cancelAction">关闭</button></div>';
  openModal(`<div class="eyebrow">收件箱详情 · ${escapeHTML(n.kind||'通知')}</div><h2>${escapeHTML(n.title)}</h2><p class="notification-detail">${escapeHTML(n.body)}</p>${t?`<div class="detail-grid"><div><span>任务</span><strong>${escapeHTML(t.name)}</strong></div><div><span>负责人</span><strong>${escapeHTML(t.assignee)}</strong></div><div><span>状态</span><strong>${status(t)[1]}</strong></div><div><span>项目</span><strong>${escapeHTML(projectName(t))}</strong></div></div>${t.completionSummary?`<div class="completion-summary"><span>提交的完成总结</span><p>${escapeHTML(t.completionSummary)}</p></div>`:''}${editReq?renderEditRequestSummary(t):''}`:p?`<div class="detail-grid"><div><span>关联项目</span><strong>${escapeHTML(p.name)}</strong></div><div><span>项目 Owner</span><strong>${escapeHTML(p.owner)}</strong></div><div><span>项目状态</span><strong>${projectStatus(p)}</strong></div></div>${p.completionReport?`<div class="completion-summary"><span>结项报告</span><p>${escapeHTML(p.completionReport)}</p></div>`:''}`:''}<div class="detail-grid"><div><span>通知时间</span><strong>${escapeHTML(n.createdAt)}</strong></div></div>${action}`);
  $('#cancelAction')?.addEventListener('click',closeModal);
  $('#detailApproveProject')?.addEventListener('click',()=>reviewProject(p.id,true,n.id));
  $('#detailRejectProject')?.addEventListener('click',()=>reviewProject(p.id,false,n.id));
  $('#detailApproveProjectCompletion')?.addEventListener('click',()=>reviewProjectCompletion(p.id,true,n.id));$('#detailRejectProjectCompletion')?.addEventListener('click',()=>reviewProjectCompletion(p.id,false,n.id));
  $('#detailApproveTask')?.addEventListener('click',()=>reviewTask(t.id,true,n.id));
  $('#detailRejectTask')?.addEventListener('click',()=>reviewTask(t.id,false,n.id));
  $('#detailApproveEdit')?.addEventListener('click',()=>reviewTaskEdit(editReq.id,true,n.id));
  $('#detailRejectEdit')?.addEventListener('click',()=>reviewTaskEdit(editReq.id,false,n.id));
  if(!n.read)api('/api/action',{action:'inbox.read',data:{id}}).then(refresh).catch(()=>{});
}
async function reviewProjectCompletion(id,accept,notificationId){if(accept){try{closeModal();await act('project.complete_review',{id,accept:true});if(notificationId)await act('inbox.read',{id:notificationId})}catch(e){}}else{openModal(`<div class="eyebrow">项目完成审批</div><h2>驳回项目完成申请</h2><label class="form-field">驳回原因<textarea id="projectCompletionRejectReason" placeholder="请说明需要补充的项目收尾内容"></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmProjectCompletionReject">确认驳回</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmProjectCompletionReject').onclick=async()=>{const reason=$('#projectCompletionRejectReason').value.trim();if(!reason){toast('请填写驳回原因');return}try{await act('project.complete_review',{id,accept:false,reason});if(notificationId)await act('inbox.read',{id:notificationId});closeModal()}catch(e){}}}}
async function reviewProject(id,accept,notificationId){
  if(accept){try{closeModal();await act('project.review',{id,accept:true});if(notificationId)await act('inbox.read',{id:notificationId})}catch(e){}}
  else{openModal(`<div class="eyebrow">项目审批</div><h2>驳回项目申请</h2><label class="form-field">驳回原因<textarea id="projectRejectReason" placeholder="请说明需要补充或调整的内容"></textarea></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmReject">确认驳回</button></div>`);$('#cancelAction').onclick=closeModal;$('#confirmReject').onclick=async()=>{try{await act('project.review',{id,accept:false,reason:$('#projectRejectReason').value||'申请信息需要补充'});if(notificationId)await act('inbox.read',{id:notificationId});closeModal()}catch(e){}}}
}
function renderRepeats(){
  const list=$('#repeatList');if(!list)return;const repeats=S.repeats||[];
  const dayNames=['周一','周二','周三','周四','周五','周六','周日'];
  const weekdayName=iso=>dayNames[(new Date(`${iso}T12:00:00`).getDay()+6)%7];
  const patternOf=r=>{
    const days=(r.weekdays||[]).map(i=>dayNames[i]).join('、');
    const every=Math.max(1,Number(r.every||1));
    if(r.frequency==='daily')return '每天';
    if(r.frequency==='workdays')return '工作日';
    if(r.frequency==='monthly')return `每月 ${Math.min(31,Math.max(1,Number(r.monthDay||1)))} 号`;
    if(r.frequency==='dates'||r.frequency==='specific')return '指定日期';
    const base=days||(r.start?`同起始日（${weekdayName(r.start)}）`:'每周');
    return every>1?`每 ${every} 周 · ${base}`:`每周 · ${base}`;
  };
  list.innerHTML=repeats.map(r=>{
    const span=Math.max(1,Number(r.span||1));
    const state=r.active===false?'已暂停':'启用中';
    const spanText=span>1?` · 持续 ${span} 天`:'';
    const untilText=r.end?` · 至 ${escapeHTML(r.end)}`:'';
    return `<article class="repeat-admin-item"><div><strong>${escapeHTML(r.name)}</strong><span>${escapeHTML(patternOf(r))} · ${escapeHTML(r.time||'09:00')} · ${escapeHTML((r.assignees||[]).join('、'))}</span><small>${state}${spanText}${untilText}${r.skipDates?.length?` · 已挖空 ${r.skipDates.length} 天`:''}</small></div><button class="ghost-btn skip-repeat" data-id="${escapeHTML(r.id)}">挖空本次</button></article>`}).join('')||'<p class="muted">还没有固定任务规则。</p>';
  $$('.skip-repeat').forEach(b=>b.onclick=()=>{const date=prompt('请输入本次不执行的日期（YYYY-MM-DD）',S.today);if(!date)return;act('repeat.skip',{id:b.dataset.id,date,skip:true}).catch(()=>{})});
}
function accountProjectRoles(id){const owned=S.projects.filter(p=>p.owner===id).map(p=>p.name),joined=S.projects.filter(p=>p.owner!==id&&(p.members||{})[id]==='accepted').map(p=>p.name);return {owned,joined}}
function accountRoleLabel(x){
  const role=roleOf(x);
  if(role==='superadmin')return '全部项目、成员、审批、AI 配置与账户管理';
  if(role==='admin')return '全部项目、成员、审批与 AI 配置（账户管理除外）';
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
  const nameField=canName?`<label class="form-field">中文名称<input id="profileDisplayName" maxlength="12" value="${escapeHTML(target.displayName||'')}" placeholder="台账里显示的正式名字"><small class="muted">由 superadmin 设置，会出现在任务、项目和成员列表里</small></label>`:'';
  const selfFields=self?`<label class="form-field">昵称<input id="profileNickname" maxlength="12" value="${escapeHTML(target.nickname||'')}" placeholder="自己想被叫的名字"><small class="muted">只有你能改，显示在账户和侧栏上</small></label>
    <div class="form-field">头像<div class="avatar-editor"><span class="avatar large" id="profileAvatarPreview">${escapeHTML(avatarSeed(id))}</span><input type="file" id="profileAvatarFile" accept="image/*" class="hidden"><button type="button" class="secondary-btn" id="profileAvatarPick">选择图片</button><button type="button" class="ghost-btn" id="profileAvatarClear">移除</button></div><small class="muted">会压缩成 128×128 保存，留空则用名字首字</small></div>`:'';
  openModal(`<div class="eyebrow">账户资料 · ${escapeHTML(target.id)}</div><h2>${escapeHTML(target.displayName||target.id)}</h2><p>${self?'昵称和头像属于你自己，随时可以改。':'你可以为本账户设置中文名称。'}</p>${nameField}${selfFields}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmProfile">保存</button></div>`);
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
  return `<article class="account-item ${self?'current-account':''}">${avatarHTML(x.id)}<div class="account-copy"><div class="account-name"><strong>${escapeHTML(x.displayName||x.id)}</strong>${nickTag}${codeTag}</div><span>${escapeHTML(roleText(x))}</span><small>${escapeHTML(accountRoleLabel(x))}</small></div>${actions}${tail}</article>`;
}
function renderAccounts(){
  const u=S.users,admin=Boolean(S.user?.admin),owner=S.user?.role==='superadmin';
  const ownerProjects=S.projects.filter(p=>p.owner===S.user.id);
  $('#currentRoleLabel').textContent=owner?'Super Admin':admin?'Admin':ownerProjects.length?'项目 Owner':'协作者';
  const me=userById(S.user.id)||{};
  applyAvatar($('.account-banner .avatar'),S.user.id);
  $('.account-banner strong').innerHTML=escapeHTML(me.displayName||S.user.id)+(me.nickname?` <span class="name-tag nick">${escapeHTML(me.nickname)}</span>`:'');
  $('.account-banner span').textContent=owner?'Super Admin · 全部项目、成员与账户管理':admin?'Admin · 全部项目与成员':'';
  $('.account-banner .permission-pill').textContent=owner?'可管理账户 / 角色 / 密码':admin?'可强行指派 / 调整':'可查看已加入项目';
  $('#forceAssignBtn').classList.toggle('hidden',!admin);
  $('#runAutomationBtn').classList.toggle('hidden',!admin);
  $('#accountsView .automation-card').classList.toggle('hidden',!admin);
  $('#accountsView .page-intro p').textContent=owner?'Super Admin 可强行指派或调整任务，并管理账户、权限组与密码。':admin?'Admin 可强行指派或调整任务；账户与密码管理由 superadmin 负责。':'你可以切换核验账户；项目 Owner 可邀请协作者，成员可在收件箱接受项目邀请。';
  const superadmins=u.filter(x=>roleOf(x)==='superadmin'),admins=u.filter(x=>roleOf(x)==='admin'),members=u.filter(x=>roleOf(x)==='member');
  const section=(title,hint,list)=>`<div class="account-group"><div class="account-group-heading"><strong>${title}</strong><span>${list.length}</span><small>${hint}</small></div>${list.map(x=>renderAccountItem(x,owner,admin)).join('')||'<p class="muted">暂无账户。</p>'}</div>`;
  $('#accountList').innerHTML=section('superadmin 权限组','全部权限，含账户、角色与密码管理',superadmins)+section('admin 权限组','全部业务与 AI 权限，账户管理除外',admins)+section('普通用户','按项目归属以 Owner 或协作者身份参与',members);
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
  const others=(S.users||[]).filter(u=>u.id!==S.user.id&&u.active);
  const head=`<div class="account-menu-head">${avatarHTML(S.user.id,'large')}<div class="account-menu-identity"><strong>${escapeHTML(me.displayName||S.user.id)}</strong>${me.nickname?`<span class="name-tag nick">${escapeHTML(me.nickname)}</span>`:''}<small>${escapeHTML(accountRoleLabel(S.user))}</small></div></div>`;
  const row=(action,label,hint)=>`<button class="account-menu-item" data-action="${action}" role="menuitem">${escapeHTML(label)}${hint?`<small>${escapeHTML(hint)}</small>`:''}</button>`;
  const mine=`<div class="account-menu-group">${row('profile','我的资料','昵称 / 头像')}${row('password','修改密码')}${S.user?.admin?row('accounts','账户管理'):''}</div>`;
  const switchGroup=others.length?`<div class="account-menu-group"><span class="account-menu-label">切换账户</span>${others.slice(0,8).map(u=>`<button class="account-menu-item switch" data-user="${escapeHTML(u.id)}" role="menuitem">${avatarHTML(u.id)}<span>${escapeHTML(u.displayName||u.id)}${u.nickname?`<small>${escapeHTML(u.nickname)}</small>`:''}</span></button>`).join('')}</div>`:'';
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
  openModal(`<div class="eyebrow danger-eyebrow">危险操作 · 不可撤销</div><h2>删除账户「${escapeHTML(x.id)}」</h2><div class="danger-panel"><p>此操作将永久删除该账户，并清除它的登录会话、AI 工作记录、日记、通知与项目邀请，删除后无法恢复。</p><ul class="danger-impact"><li>权限组：<strong>${roleLabel}</strong></li><li>若该账户仍负责进行中的项目或有未完成任务，删除会被拒绝，请先转交职责</li><li>历史审计记录会保留</li></ul></div><label class="danger-check"><input type="checkbox" id="deleteAccountAck"> 我已了解该账户及其个人数据将被永久删除，且无法恢复</label><label class="danger-confirm">请输入账户名 <code>${escapeHTML(x.id)}</code> 以继续<input id="deleteAccountConfirm" autocomplete="off" spellcheck="false" placeholder="${escapeHTML(x.id)}"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="danger-btn" id="confirmDeleteAccount" disabled>永久删除账户</button></div>`);
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
function openModal(html){$('#modalContent').innerHTML=html;$('#modalBackdrop').classList.remove('hidden')};function closeModal(){$('#modalBackdrop').classList.add('hidden')};function closeDrawer(){$('#taskDrawer').classList.add('hidden')}
function newTask(projectId,initialDate){
  const projects=manageableProjects().filter(p=>!isProjectHidden(p)),locked=typeof projectId==='string',initial=projects.find(p=>p.id===projectId)?.id||projects[0]?.id;
  if(!projects.length){toast('请先创建项目并等待审批，项目 Owner 或管理员可分配任务');switchView('projects');return}
  openModal(`<div class="eyebrow">${S.user.admin?'管理员':'项目 Owner'} · ${S.user.admin?'项目任务 / 固定任务':'项目子任务'}</div><h2>新建并指派任务</h2>${S.user.admin?'<div class="task-kind-switch"><button type="button" class="task-kind-btn active">项目任务</button><button type="button" class="task-kind-btn" id="kindFixedTask">固定任务</button></div>':''}<label class="form-field">所属项目<select id="taskProject" ${locked?'disabled':''}>${projects.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('')}</select></label><label class="form-field">任务名称<input id="taskName" maxlength="120"></label><label class="form-field">任务描述<textarea id="taskDesc"></textarea></label><label class="form-field">指派给<select id="taskAssignee"></select><div id="taskAssigneeLoad" class="assignee-load-hint"></div></label><div class="task-form-grid"><label class="form-field">安排日期<input id="taskDate" type="date" max="${DATE_HORIZON}" value="${initialDate||(UI.view==='dayDetail'?UI.detailDate:displayDay())}"></label><label class="form-field">结束日期（留空＝当天完成）<input id="taskDeadline" type="date" max="${DATE_HORIZON}"></label><label class="form-field">时间<input id="taskTime" type="time" value="09:00"></label><label class="form-field">预计时长<input id="taskDuration" type="number" min="1" max="1440" value="30"></label><label class="form-field">优先级<select id="taskPriority"><option>P0</option><option selected>P1</option><option>P2</option></select></label></div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmTask">创建并指派</button></div>`);
  const updateUsers=()=>{const p=projects.find(p=>p.id===$('#taskProject').value),users=projectAssignees(p),start=p?.start||S.today,end=p?.end||'9999-12-31';$('#taskAssignee').innerHTML=users.map(u=>{const ts=S.tasks.filter(t=>t.assignee===u.id&&t.date>=start&&t.date<=end&&t.status!=='skipped'),done=ts.filter(t=>t.status==='done').length,mins=ts.reduce((n,t)=>n+Number(t.duration||0),0);return `<option value="${escapeHTML(u.id)}">${escapeHTML(u.id)}${u.id===p.owner?' · Owner':''} · ${ts.length} 项 / ${Math.round(mins/60*10)/10}h</option>`}).join('');$('#taskAssigneeLoad').innerHTML=users.length?`项目周期 ${escapeHTML(start)} 至 ${p?.end?escapeHTML(p.end):'未设截止'} · 显示每位成员该周期任务总数与预计负载；已完成 ${users.map(u=>{const ts=S.tasks.filter(t=>t.assignee===u.id&&t.date>=start&&t.date<=end&&t.status!=='skipped');return `${u.id} ${ts.filter(t=>t.status==='done').length}/${ts.length}`}).join('、')}`:'项目暂无已接受成员，请先添加协作者';$('#confirmTask').disabled=!users.length};
  $('#kindFixedTask')?.addEventListener('click',fixedTask);
  $('#taskProject').value=initial;$('#taskProject').onchange=updateUsers;updateUsers();const _sd=$('#taskDate'),_dl=$('#taskDeadline');const _syncDl=()=>{_dl.min=_sd.value||S.today;if(_dl.value&&_dl.value<_dl.min)_dl.value=''};_sd.onchange=_syncDl;_syncDl();$('#cancelAction').onclick=closeModal;
  $('#confirmTask').onclick=async()=>{if(!$('#taskName').value.trim()){toast('请填写任务名称');return}const _start=$('#taskDate').value,_end=$('#taskDeadline').value;if(_end&&_end<_start){toast('结束日期不能早于安排日期');return}const data={name:$('#taskName').value,desc:$('#taskDesc').value,projectId:$('#taskProject').value,assignee:$('#taskAssignee').value,date:$('#taskDate').value,deadline:$('#taskDeadline').value||null,time:$('#taskTime').value,duration:Number($('#taskDuration').value),priority:$('#taskPriority').value};try{await act('task.create',data);closeModal()}catch(e){}};
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
  openModal(`<div class="eyebrow">项目空间 · ${admin?'superadmin 创建':'成员申请'}</div><h2>${admin?'创建项目':'申请创建项目'}</h2><p>${admin?'直接指定 Owner 和协作者，立即生效并发送通知。':'审批通过后，你会自动成为该项目 Owner。'}</p><label class="form-field">项目名称<input id="projectName" maxlength="120"></label><label class="form-field">项目描述<textarea id="projectDesc"></textarea></label>${owner}<div class="project-date-fields"><label class="form-field">开始日期<input id="projectStart" type="date" max="${DATE_HORIZON}" value="${S.today}"></label><label class="form-field">截止日期（可留空）<input id="projectEnd" type="date" min="${S.today}" max="${DATE_HORIZON}"></label></div>${collaborators}<div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmProject">${admin?'创建项目':'提交审批'}</button></div>`);
  $('#cancelAction').onclick=closeModal;$('#projectStart').onchange=()=>$('#projectEnd').min=$('#projectStart').value;
  $('#confirmProject').onclick=async()=>{const start=$('#projectStart').value,end=$('#projectEnd').value;if(!$('#projectName').value.trim()||!start){toast('请填写项目名称和开始日期');return}if(end&&end<start){toast('截止日期不能早于开始日期');return}const data={name:$('#projectName').value,desc:$('#projectDesc').value,start,end,cycle:end?'range':'infinite'};if(admin){data.owner=$('#projectOwner').value;data.members=$$('input[name="projectMember"]:checked').map(x=>x.value)}try{await act('project.create',data);closeModal()}catch(e){}};
}
function fixedTask(){
  const users=S.users.filter(u=>u.active&&!u.admin),days=['周一','周二','周三','周四','周五','周六','周日'];
  const monthOptions=Array.from({length:31},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===1?'selected':''}>${n} 号</option>`).join('');
  openModal(`<div class="eyebrow">Super Admin · 固定任务</div><h2>发布固定安排</h2>
    <label class="form-field">任务名称<input id="repeatName" maxlength="120" required></label>
    <fieldset class="member-checkboxes" id="repeatUsers"><legend>安排给（可多选）</legend>${users.map(u=>`<label><input type="checkbox" name="repeatUser" value="${escapeHTML(u.id)}"> ${escapeHTML(u.id)}</label>`).join('')}</fieldset>
    <label class="form-field">周期<select id="repeatFreq"><option value="daily">每天</option><option value="weekly" selected>每周</option><option value="monthly">每月</option><option value="workdays">工作日</option><option value="dates">指定日期</option></select></label>
    <label class="form-field" id="repeatEveryField">间隔<select id="repeatEvery"><option value="1">每 1 周</option><option value="2">每 2 周（双周）</option><option value="3">每 3 周</option><option value="4">每 4 周</option></select></label>
    <fieldset class="member-checkboxes" id="repeatWeekdayFields"><legend>每周几执行</legend>${days.map((d,i)=>`<label><input type="checkbox" name="repeatWeekday" value="${i}" ${i<5?'checked':''}> ${d}</label>`).join('')}</fieldset>
    <label class="form-field hidden" id="repeatMonthField">每月执行日<select id="repeatMonthDay">${monthOptions}</select><small class="muted">选 31 号时，天数不足的月份自动落在当月最后一天</small></label>
    <label class="form-field hidden" id="repeatDatesField">指定日期（逗号分隔）<input id="repeatDates" placeholder="2026-09-20, 2026-10-01"></label>
    <label class="form-field">持续天数<input id="repeatSpan" type="number" min="1" max="30" value="1"><small class="muted">大于 1 天时，每次生成的任务会跨天并带 DDL 倒计时</small></label>
    <label class="form-field">开始日期<input id="repeatStart" type="date" max="${DATE_HORIZON}" value="${S.today}"></label>
    <label class="form-field">结束日期（可留空）<input id="repeatEnd" type="date" max="${DATE_HORIZON}"></label>
    <label class="form-field">开始时间<input id="repeatTime" type="time" value="09:00"></label>
    <label class="form-field">每次时长<input id="repeatDuration" type="number" min="1" max="1440" value="30"></label>
    <label class="form-field">本次挖空日期（可留空）<input id="repeatSkipDates" placeholder="例如：2026-10-01, 2026-10-02"></label>
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
      duration:Number($('#repeatDuration').value),priority:'P1',skipDates});closeModal()}catch(e){}};
}
function collectionSettings(){
  const cfg=S.automation||{},mode=cfg.mode||'daily',days=['周一','周二','周三','周四','周五','周六','周日'],selected=cfg.weekdays||[0,1,2,3,4];
  openModal(`<div class="eyebrow">Super Admin · 自动收集</div><h2>设置总结收集时间</h2><p class="muted">只在选定的星期或日期、按设定时间执行自动补报；成员主动提交的总结仍会即时发送。</p><label class="form-field">收集周期<select id="collectionMode"><option value="daily">每天</option><option value="weekly">每周指定星期</option><option value="dates">指定日期</option></select></label><label class="form-field">收集时间<input id="collectionTime" type="time" value="${escapeHTML(cfg.time||'00:00')}"></label><fieldset class="member-checkboxes" id="collectionWeekdayFields"><legend>每周几收集</legend>${days.map((d,i)=>`<label><input type="checkbox" name="collectionWeekday" value="${i}" ${selected.includes(i)?'checked':''}> ${d}</label>`).join('')}</fieldset><label class="form-field hidden" id="collectionDatesField">指定日期（逗号分隔）<input id="collectionDates" value="${escapeHTML((cfg.dates||[]).join(', '))}" placeholder="2026-09-20, 2026-10-01"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="saveCollection">保存收集规则</button></div>`);
  $('#collectionMode').value=mode;
  const sync=()=>{const m=$('#collectionMode').value;$('#collectionWeekdayFields').classList.toggle('hidden',m!=='weekly');$('#collectionDatesField').classList.toggle('hidden',m!=='dates')};
  $('#collectionMode').onchange=sync;sync();$('#cancelAction').onclick=closeModal;
  $('#saveCollection').onclick=async()=>{const m=$('#collectionMode').value,weekdays=$$('input[name="collectionWeekday"]:checked').map(x=>Number(x.value)),dates=$('#collectionDates').value.split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean);if(m==='weekly'&&!weekdays.length){toast('请选择每周收集日');return}if(m==='dates'&&!dates.length){toast('请填写指定收集日期');return}try{await act('automation.update',{mode:m,time:$('#collectionTime').value,weekdays,dates});closeModal()}catch(e){}};
}
function renderAll(){
  $('[data-view="achievements"]')?.classList.toggle('hidden',!S.user?.admin);
  const projectLabel=(S.user.admin?'创建项目':'申请项目');
  ['#addProjectBtn','#addProjectTopBtn','#timelineAddProjectBtn'].forEach(id=>$(id).innerHTML=icon('plus')+projectLabel);
  const canAssign=Boolean(S.user.admin||manageableProjects().length);
  $('#addTaskBtn').innerHTML=icon('plus')+'指派项目任务';$('#addTaskBtn').classList.toggle('hidden',!canAssign);
  $('#emptyAddBtn').classList.toggle('hidden',!canAssign);
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

function scheduleTasks(){
  const visible=S.tasks.filter(t=>!t.projectId||!isProjectHidden(S.projects.find(p=>p.id===t.projectId)));
  if(!S.user)return [];
  if(!S.user?.admin)return visible.filter(t=>t.assignee===S.user.id);
  return UI.member!=='all'?visible.filter(t=>t.assignee===UI.member):visible;
}
function memberTaskCount(userId,project){
  if(!project)return 0;
  const start=project.start||'0000-01-01',end=project.end||'9999-12-31';
  return S.tasks.filter(t=>t.assignee===userId&&t.date>=start&&t.date<=end).length;
}
function scheduleMemberLabels(tasks){
  if(!S.user?.admin||!tasks.length)return '';
  const members=[...new Set(tasks.map(t=>t.assignee))];
  return `<div class="axis-members" title="${escapeHTML(members.map(id=>nameOf(id)).join('、'))}">${members.slice(0,4).map(id=>`<i>${escapeHTML(avatarSeed(id))}</i>`).join('')}${members.length>4?`<small>+${members.length-4}</small>`:''}</div>`;
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
  select.onchange=()=>{UI.member=select.value;hideFloat(true);renderStats();switchView(UI.view)};
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
  if(stats){const totalTasks=projects.reduce((n,p)=>n+projectTasks(p).length,0),doneTasks=projects.reduce((n,p)=>n+projectTasks(p).filter(t=>t.status==='done').length,0);stats.innerHTML=`<div class="achievement-stat"><span>已完成项目</span><strong>${projects.length}</strong><small>通过结项审批</small></div><div class="achievement-stat"><span>累计完成子任务</span><strong>${doneTasks}</strong><small>共 ${totalTasks} 项</small></div><div class="achievement-stat"><span>最近结项</span><strong>${projects[0]?escapeHTML(String(projects[0].completedAt||projects[0].end||'').slice(0,10)):'—'}</strong><small>${projects[0]?escapeHTML(projects[0].name):'等待第一个成果'}</small></div>`}
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
  $('.timeline-legend').classList.toggle('hidden',model.rows.length===0);
  grid.style.setProperty('--day-width',`${dayWidth}px`);
  grid.style.setProperty('--track-width',`${model.days*dayWidth}px`);
  const days=Array.from({length:model.days},(_,i)=>{const n=model.start+i,iso=dateFromNumber(n),d=new Date(n*DAY_MS);return {n,iso,day:d.getUTCDate(),dow:d.getUTCDay(),month:iso.slice(0,7)}});
  const months=[];
  for(const d of days){const last=months.at(-1);if(last?.month===d.month)last.count++;else months.push({month:d.month,offset:d.n-model.start,count:1})}
  const todayLine=`<i class="gantt-today-line" style="left:${(model.today-model.start+.5)*dayWidth}px" aria-hidden="true"></i>`;
  grid.innerHTML=`<div class="gantt-header"><div class="gantt-corner"><strong>项目 / Owner</strong><small>每行一个项目</small></div><div class="gantt-axis"><div class="gantt-months">${months.map(m=>`<span style="left:${m.offset*dayWidth}px;width:${m.count*dayWidth}px"><b>${m.month.replace('-',' 年 ')} 月</b></span>`).join('')}</div><div class="gantt-dates">${days.map(d=>`<div class="gantt-date ${[0,6].includes(d.dow)?'weekend':''} ${d.n===model.today?'is-today':''}" title="${d.iso}"><strong>${d.day}</strong><small>${['日','一','二','三','四','五','六'][d.dow]}</small></div>`).join('')}</div></div></div>${model.rows.map((r,i)=>{
    const p=r.project,palette=['coral','blue','green','purple','gold'][i%5],range=r.invalid?'日期待修正':`${p.start} → ${p.end||'未设截止'}`;
    return `<div class="gantt-row" data-project="${escapeHTML(p.id)}"><div class="gantt-project"><div><i class="project-color ${palette}"></i><strong title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</strong></div><small>${escapeHTML(p.owner)} <span>· ${projectStatus(p)}</span></small><span class="gantt-range">${escapeHTML(range)}</span></div><div class="gantt-track">${todayLine}${r.invalid?'<span class="gantt-invalid">请修正项目起止日期</span>':`<div class="gantt-bar ${palette} ${r.openEnded?'open-ended':''} ${['pending','rejected'].includes(p.status)?'awaiting':''}" style="left:${r.offset*dayWidth+3}px;width:${Math.max(26,r.span*dayWidth-6)}px" tabindex="0" aria-label="${escapeHTML(p.name)}，${escapeHTML(range)}，${projectStatus(p)}" title="${escapeHTML(p.name)} · ${escapeHTML(p.owner)}\n${escapeHTML(range)} · ${projectStatus(p)}"><span>${escapeHTML(p.name)}${r.openEnded?' · 未设截止 →':''}</span></div>`}</div></div>`;
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

function openSearch(){openModal(`<div class="eyebrow">工作台搜索</div><h2>搜索任务与项目</h2><label class="form-field">关键词<input id="searchQuery" placeholder="输入名称、负责人或项目"></label><div id="searchResults" class="search-results"><span class="muted">输入关键词开始搜索</span></div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">关闭</button></div>`);$('#cancelAction').onclick=closeModal;const input=$('#searchQuery'),results=$('#searchResults');input.oninput=()=>{const q=input.value.trim().toLowerCase();if(!q){results.innerHTML='<span class="muted">输入关键词开始搜索</span>';return}const ts=(S.user?.admin?S.tasks:scheduleTasks()).filter(t=>[t.name,t.assignee,projectName(t)].some(v=>String(v||'').toLowerCase().includes(q)));const ps=S.projects.filter(p=>[p.name,p.owner,p.desc].some(v=>String(v||'').toLowerCase().includes(q)));results.innerHTML=ts.map(t=>`<button class="search-result" data-task="${escapeHTML(t.id)}"><strong>${escapeHTML(t.name)}</strong><small>${escapeHTML(t.assignee)} · ${escapeHTML(projectName(t))}</small></button>`).join('')+ps.map(p=>`<button class="search-result" data-project="${escapeHTML(p.id)}"><strong>${escapeHTML(p.name)}</strong><small>Owner · ${escapeHTML(p.owner)} · ${projectStatus(p)}</small></button>`).join('')||'<span class="muted">没有找到匹配项</span>';$$('.search-result').forEach(b=>b.onclick=()=>{if(b.dataset.task)openDrawer(b.dataset.task);else{closeModal();switchView('projects')}})};input.focus()}
$$('.nav-item').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$('#workspaceSwitcher')?.addEventListener('click',()=>toggleAccountMenu());
$('#workspaceSwitcher')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleAccountMenu()}});
document.addEventListener('click',e=>{
  const menu=$('#accountMenu');if(!menu||menu.classList.contains('hidden'))return;
  if(e.target.closest('#accountMenu')||e.target.closest('#workspaceSwitcher'))return;
  toggleAccountMenu(false);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleAccountMenu(false)});$$('.filter-link').forEach(b=>b.onclick=()=>{UI.filter=b.dataset.filter;switchView('today')});$$('.quick-tab').forEach(b=>b.onclick=()=>{UI.filter=b.dataset.filter;renderToday()});$('#prevDay').onclick=()=>{UI.dayOffset=(UI.dayOffset||0)-1;renderToday()};$('#nextDay').onclick=()=>{if(displayDay()>=DATE_HORIZON){toast(`日期范围目前只支持到 ${DATE_HORIZON}`);return}UI.dayOffset=(UI.dayOffset||0)+1;renderToday()};$('#inboxBtn').onclick=()=>switchView('inbox');document.querySelector('.icon-btn[title="搜索"]').onclick=openSearch;$('#closeDrawer').onclick=closeDrawer;$('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};$('#taskDrawer').onclick=e=>{if(e.target.id==='taskDrawer')closeDrawer()};$('#backWeekBtn').onclick=()=>switchView('calendar');$('#backTodayBtn').onclick=()=>{UI.selectedWeek=0;UI.dayOffset=0;switchView('calendar')};$('#addProjectBtn').onclick=newProject;$('#addProjectTopBtn').onclick=newProject;$('#addTaskBtn').onclick=newTask;$('#emptyAddBtn').onclick=newTask;$('#timelineAddProjectBtn').onclick=newProject;$('#createFixedBtn').onclick=fixedTask;$('#collectionSettingsBtn').onclick=collectionSettings;$('#forceAssignBtn').onclick=()=>switchView('projects');$('#runAutomationBtn').onclick=()=>act('scheduler.run',{});$('#markAllReadBtn').onclick=()=>act('inbox.read',{all:true});$('#generateSummaryBtn').onclick=openTodayDiary;
window.addEventListener('focus',()=>{if(UI.view==='inbox')refreshInboxState()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&UI.view==='inbox')refreshInboxState()});
hydrateIcons();
if(location.protocol==='file:'){showAuth()}else{refresh()}

/* Embedded Agent UI: superadmin-managed OpenAI-compatible endpoint via server proxy. */
const AGENT_CONFIG_KEY='work-calendar-agent-config-v1';
const OPENCODE_GO_ENDPOINT='https://opencode.ai/zen/go/v1/chat/completions';
const OPENCODE_GO_MODELS=['glm-5.3-flash','glm-5.3','glm-5.2','glm-5.1','kimi-k3','kimi-k2.7-code','kimi-k2.6','longcat-2.0','deepseek-v4.1-flash','deepseek-v4-pro','deepseek-v4-flash','deepseek-v4-flash-vision-exp','mimo-v2.5','mimo-v2.5-pro','hy4-preview','hy3','grok-4.5'];
const agentState={messages:[],busy:false,steps:0,failures:0,mode:null,lastActionKey:'',repeats:0,autoRun:false,stop:false,pendingResolve:null,sessionId:(globalThis.crypto?.randomUUID?.()||`wc-${Date.now()}-${Math.random().toString(36).slice(2)}`)};
let agentServerConfig=null;
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
  e.innerHTML=`<span class="agent-role-chip ${operator?'is-operator':''}">${escapeHTML(operator?'操作员':'只读')}</span>`
    +`<span>${operator?'可查询全局并执行管理操作，写入与审批都要你确认。':'只能查询你有权看到的信息，不能改动数据。'}</span>`;
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
  list.innerHTML='<div class="agent-message assistant"><span>你好。我可以查询工作台信息，也可以把一句话拆成一组任务。配置自定义 API 后还能接入你自己的模型。</span></div>'
    +'<div class="agent-samples">'
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
    messages.forEach(m=>{const node=agentMessageNode(m);if(node)list.appendChild(node)});
    restoreCard();
    list.scrollTop=list.scrollHeight;
  }catch(_){}
}
async function agentShowHistory(){
  const admin=Boolean(S.user?.admin);
  openModal(`<div class="eyebrow">WORK AGENT · 工作记录</div><h2>AI 工作记录</h2><p class="muted">记录保留每个账户与助手的对话及已执行操作，仅本人与 superadmin 可见。</p>${admin?`<label class="form-field">查看账户<select id="agentHistoryUser">${S.users.map(u=>`<option value="${escapeHTML(u.id)}">${escapeHTML(u.id)}</option>`).join('')}</select></label>`:''}<div id="agentHistoryList" class="agent-history-list"></div><div class="modal-footer"><button class="secondary-btn" id="agentHistoryClear">清空记录</button><button class="primary-btn" id="agentHistoryClose">关闭</button></div>`);
  const target=()=>$('#agentHistoryUser')?.value||S.user.id;
  const load=async()=>{const box=$('#agentHistoryList');box.innerHTML='<p class="muted">正在加载…</p>';try{const data=await api('/api/action',{action:'agent.history',data:{userId:target()}});const msgs=data.messages||[];box.innerHTML='';if(!msgs.length){box.innerHTML='<p class="muted">该账户暂无 AI 工作记录。</p>';return}msgs.forEach(m=>{const node=agentMessageNode(m);if(node)box.appendChild(node)})}catch(e){box.innerHTML=`<p class="muted">加载失败：${escapeHTML(e.message||'')}</p>`}};
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
async function agentLoadServerConfig(){try{agentServerConfig=await api('/api/action',{action:'agent.config.get',data:{}})}catch(_){agentServerConfig=null}renderAgentModelChip()}
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
  'task.review':'审批任务','task.edit_review':'审批修改申请','project.create':'创建项目',
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
  +'规则：projectId 与 assignee 必须用数据里真实存在的 id（负责人写账户 id，不是中文名）；'
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
  /* Say on the composer itself what the run is waiting for, so a paused card
     is never mistaken for a composer that ate the message. */
  if(input){
    input.placeholder=agentState.pendingResolve?'上一步在等你确认：点卡片上的按钮，或点「停止」'
      :agentState.busy?'助手正在处理上一条…（点「停止」可以打断）'
      :'问我任务、项目、负载或收件箱…';
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
    const payload=(proposal.data&&typeof proposal.data==='object')?proposal.data:{};
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
  input.value='';agentAppend('user',text);
  agentState.autoRun=false;agentState.stop=false;agentState.steps=0;agentState.failures=0;
  agentState.mode=agentPref();agentState.lastActionKey='';agentState.repeats=0;
  agentState.pendingResolve=null;
  agentState.busy=true;agentUpdateBusy();
  try{
    await agentLoop(agentContext());
  }catch(e){
    agentAppend('assistant',e?.message||'暂时无法连接 Agent 服务。','error');
  }
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
    else agentPlanCard(plan);
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
      ?'<p class="chat-empty">还没有人说话，发第一条吧。</p>'
      :'<p class="chat-empty">这个频道还没有消息，说点什么吧。</p>';
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
    +`<p>${rows.length?`共 ${rows.length} 条消息，随项目一起归档，仅供查阅。`:'这个项目没有留下沟通记录。'}</p>`
    +`<div class="chat-log chat-archive">${body}</div>`
    +`<div class="modal-footer"><button class="secondary-btn" id="cancelAction">关闭</button></div>`);
  $('#cancelAction').onclick=closeModal;
}
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
      if((e.key==='Enter'||e.key==='Tab')&&list.length){e.preventDefault();chatApplyMention(list[chatMentionIndex].id);return}
      if(e.key==='Escape'){e.preventDefault();chatMentionQuery=null;renderChatMentionMenu();return}
    }
    /* isComposing keeps the Enter that confirms a Chinese IME candidate from
       sending a half-finished message. */
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();chatSend()}
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
  $('#agentBtn')?.addEventListener('click',async()=>{$('#agentPanel').classList.remove('hidden');renderAgentCapability();await agentLoadOwnHistory();await agentLoadServerConfig();agentSyncPlanButton();$('#agentInput').focus()});
  $('#agentHistoryBtn')?.addEventListener('click',()=>agentShowHistory());
  $('#agentCloseBtn')?.addEventListener('click',()=>$('#agentPanel').classList.add('hidden'));
  $('#agentStopBtn')?.addEventListener('click',()=>agentHalt('已停止连续执行。'));
  $('#agentPlanBtn')?.addEventListener('click',()=>agentTogglePlan());
  $$('#agentPanel .agent-mode-opt').forEach(b=>b.addEventListener('click',()=>agentSetPref(b.dataset.mode)));
  agentRenderModeOptions();
  $('#agentConfigBtn')?.addEventListener('click',()=>agentSetConfigVisible(true));
  $('#agentConfigClose')?.addEventListener('click',()=>agentSetConfigVisible(false));
  $('#agentProvider')?.addEventListener('change',()=>agentSyncProviderUI());
  $('#agentConfigSave')?.addEventListener('click',async()=>{const provider=$('#agentProvider').value,endpoint=$('#agentEndpoint').value.trim(),model=provider==='custom'?$('#agentCustomModel').value.trim():$('#agentModelSelect').value,apiKey=$('#agentApiKey').value.trim();if(!endpoint||!model){toast('请填写 API 地址和模型');return}try{const data=await api('/api/action',{action:'agent.config.set',data:{provider,baseUrl:endpoint,model,apiKey}});agentServerConfig=data;saveAgentConfig({provider,endpoint,model});agentSetConfigVisible(false);toast('Agent API 配置已保存（密钥仅保存在服务端）')}catch(e){toast(e.message||'保存失败')}});
  $('#agentConfigReset')?.addEventListener('click',()=>{saveAgentConfig({});agentServerConfig=null;agentSetConfigVisible(false);toast('已清除本机 Agent 配置；如需清除服务端密钥请重新保存')});
  $('#agentForm')?.addEventListener('submit',e=>{e.preventDefault();agentSubmit()});
  $('#agentInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();agentSubmit()}});
  $('#agentInput')?.addEventListener('input',()=>agentSyncPlanButton());
  renderAgentCapability();
  agentSyncPlanButton();
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
  openModal(`<div class="eyebrow">账户管理 · 新建账户</div><h2>添加账户</h2><p class="muted">账户名 3–30 位字母数字，密码至少 6 位。所有角色都保留在账户列表，密码重置不会删除任何数据。</p><label class="form-field">账户名<input id="newAccountName" autocomplete="off" placeholder="例如 zhangsan"></label><label class="form-field">中文名称（可留空）<input id="newAccountDisplayName" maxlength="12" placeholder="台账里显示的正式名字"></label><label class="form-field">初始密码<input id="newAccountPassword" type="password" autocomplete="new-password" placeholder="至少 6 位"></label><label class="form-field">权限组<select id="newAccountRole"><option value="member">普通用户</option><option value="admin">admin · 全部业务与 AI 权限（账户管理除外，当前 ${groups.admin} 个）</option><option value="superadmin">superadmin · 全部权限（当前 ${groups.superadmin} 个）</option></select></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmCreateAccount">创建账户</button></div>`);
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
