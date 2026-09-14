const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const UI={view:'calendar',member:'all',filter:'all',selectedWeek:0,detailDate:null,timelineScroll:null,dayOffset:0};
let weekObserver=null;
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let S={user:null,users:[],tasks:[],projects:[],achievements:[],logs:[],reports:[],diaries:[],diaryStats:[],notifications:[],requests:[],editRequests:[],suggestions:[],profiles:[],today:''};
const api=(path,body)=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Work-Calendar':'1'},credentials:'same-origin',body:JSON.stringify(body)}).then(async r=>{const x=await r.json();if(!r.ok)throw new Error(x.error||'操作未完成');return x});
const getState=()=>fetch('/api/state',{credentials:'same-origin'}).then(async r=>{const x=await r.json();if(!r.ok)throw new Error(x.error||'请登录');return x});
const fmt=iso=>{const d=new Date(`${iso}T12:00:00`);return `${d.getMonth()+1}月${d.getDate()}日`};
const wd=iso=>['周日','周一','周二','周三','周四','周五','周六'][new Date(`${iso}T12:00:00`).getDay()];
const add=(iso,n)=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const weekStart=iso=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()-(d.getDay()+1)%7);return d.toISOString().slice(0,10)};
const DATE_HORIZON='2027-04-01';
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
function showAuth(){document.body.classList.add('auth-locked');let e=$('#authScreen');if(!e){e=document.createElement('section');e.id='authScreen';document.body.prepend(e)}const local=location.protocol==='file:';e.innerHTML=`<div class="auth-card"><div class="brand"><span class="brand-mark">W</span><span>work<br><strong>calendar</strong></span></div><h1>登录工作台</h1><p>使用核验账户进入你的任务、项目和收件箱。</p><form id="loginForm"><label>账户<input id="loginUser" autocomplete="username" value="superadmin" required></label><label>密码<input id="loginPass" type="password" autocomplete="current-password" required></label><button class="primary-btn" type="submit" ${local?'disabled':''}>${local?'请先启动本地服务':'进入工作台'}</button><div id="loginError" class="login-error">${local?'请在工作区运行 ./run.sh，然后访问 http://127.0.0.1:4173/':''}</div></form><small>首次启动后，密码写入 data/initial-accounts.txt（仅本机保存）。</small></div>`;$('#loginForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/login',{username:$('#loginUser').value,password:$('#loginPass').value});document.body.classList.remove('auth-locked');e.target.closest('#authScreen').remove();await refresh();switchView('calendar')}catch(err){$('#loginError').textContent=err.message}}}
async function refresh(){
  let next;
  try{next=await getState()}catch(e){showAuth();return}
  if(S.user?.id!==next.user.id){Object.assign(UI,{view:'calendar',member:'all',filter:'all',selectedWeek:0,detailDate:null,timelineScroll:null,dayOffset:0})}
  S=next;renderAll();
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
  if(view!=='calendar'){weekObserver?.disconnect();weekObserver=null}
  $$('.view').forEach(v=>v.classList.toggle('active-view',v.id===`${view}View`));
  $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
  const labels={today:'今日任务',calendar:'周视图',summary:'日记',projects:'项目空间',timeline:'项目时间轴',achievements:'成果库',inbox:'收件箱',accounts:'账户管理',dayDetail:'日期详情'};
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
  if(changed)window.scrollTo({top:0,left:0,behavior:'instant'});
}
const isArchivedTask=t=>['deferred','skipped','rejected'].includes(t.status);
function renderStats(day=displayDay()){const d=scheduleTasks().filter(t=>t.date===day),current=d.filter(t=>!isArchivedTask(t)),done=current.filter(t=>t.status==='done').length;$('#todayCount').textContent=current.filter(t=>t.status!=='done').length;$('#p0Count').textContent=current.filter(t=>t.priority==='P0'&&t.status!=='done').length;$('#doingCount').textContent=scheduleTasks().filter(t=>t.status==='doing').length;$('#deferredCount').textContent=scheduleTasks().filter(t=>t.status==='deferred').length;$('#allTabCount').textContent=d.length;$('#openTabCount').textContent=current.length-done;$('#doneTabCount').textContent=done;$('#progressText').textContent=`${done} / ${current.length} 已完成`;const pct=current.length?done/current.length*100:0;$('#dayProgress').style.width=`${pct}%`;$('#progressPercent').textContent=`${Math.round(pct)}%`;$('#focusTime').textContent=`${String(Math.floor(current.reduce((n,t)=>n+t.duration,0)/60)).padStart(2,'0')}:${String(current.reduce((n,t)=>n+t.duration,0)%60).padStart(2,'0')}`;$('#focusProgress').style.width=`${pct}%`}
function taskCard(t){
  const [c,l]=status(t),deferLog=t.status==='deferred'?S.logs.find(x=>x.taskId===t.id&&x.kind==='defer'):null;
  return `<article class="task-card" data-id="${escapeHTML(t.id)}" tabindex="0"><div class="task-stripe ${escapeHTML(t.priority)}"></div><div class="task-main"><div class="task-topline"><span class="priority ${escapeHTML(t.priority)}">${escapeHTML(t.priority)}</span><span class="task-name">${escapeHTML(t.name)}</span>${t.fixed?'<span class="fixed-badge">↻ 固定</span>':''}</div><div class="task-desc">${escapeHTML(t.desc||'暂无描述')}</div><div class="task-meta"><span class="assignee-tag">${escapeHTML(t.assignee)}</span><span class="project-tag">${escapeHTML(projectName(t))}</span><span>◷ ${escapeHTML(t.time||'09:00')} · ${t.duration} 分钟</span><span>${escapeHTML(t.deadline||t.date)}</span>${deferLog?.target?`<span class="defer-target">→ ${escapeHTML(deferLog.target)}</span>`:''}</div></div><div class="task-status"><i class="status-dot ${c}"></i>${l}<span class="task-arrow">›</span></div></article>`;
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
function renderToday(){const day=displayDay(),deferredView=UI.filter==='deferred';renderStats(day);$('#todayLabel').textContent=deferredView?'递延任务':`${wd(day)} · ${fmt(day)}`;$('#dateChip').textContent=deferredView?'全部日期':fmt(day);$$('.quick-tab').forEach(b=>b.classList.toggle('active',b.dataset.filter===UI.filter));let ts=(deferredView?scheduleTasks():scheduleTasks().filter(t=>t.date===day));if(UI.filter==='open')ts=ts.filter(t=>!isArchivedTask(t)&&t.status!=='done');if(UI.filter==='done')ts=ts.filter(t=>t.status==='done');if(UI.filter==='P0')ts=ts.filter(t=>t.priority==='P0');if(UI.filter==='inprogress')ts=ts.filter(t=>t.status==='doing');if(deferredView)ts=ts.filter(t=>t.status==='deferred');const emptyCopy=UI.filter==='inprogress'?['暂无进行中的任务','打开待处理任务并点击“开始任务”，任务就会出现在这里。']:deferredView?['暂无递延记录','未完成的任务递延后，会在这里保留历史记录。']:['今天没有待处理任务','把下一件重要的事放进日程吧。'];$('#todayEmptyTitle').textContent=emptyCopy[0];$('#todayEmptyHint').textContent=emptyCopy[1];$('#todayTaskList').innerHTML=dailyTaskGroups(ts);$('#todayEmpty').classList.toggle('hidden',ts.length>0);bindTaskCards('#todayTaskList')}
let floatHideTimer=null,floatCard=null,floatSource=null;
function removeFloat(){
  if(floatHideTimer){clearTimeout(floatHideTimer);floatHideTimer=null}
  floatCard?.remove();
  floatCard=null;
  floatSource=null;
}
function showFloat(el){
  if(floatHideTimer){clearTimeout(floatHideTimer);floatHideTimer=null}
  // Keep one preview instance per source card; repeated mouseenter events must
  // not remove and recreate it while the pointer crosses child content.
  if(floatSource===el&&floatCard?.isConnected)return;
  removeFloat();
  const iso=el.dataset.date,ts=sortTasks(scheduleTasks().filter(t=>t.date===iso)),r=el.getBoundingClientRect(),f=document.createElement('div');
  floatSource=el;floatCard=f;
  const canAdd=Boolean(S.user?.admin);
  f.className=`floating-day-card${canAdd?' has-add':''}`;
  f.innerHTML=`${canAdd?`<button class="floating-add-task" data-date="${iso}" type="button">＋ 添加任务</button>`:''}<div class="floating-head"><span>${wd(iso)}</span><strong>${fmt(iso)}</strong></div><div class="floating-meta">${ts.length?`${ts.length} 项任务 · 完成 ${ts.filter(t=>t.status==='done').length}`:'暂无安排'}</div>${ts.slice(0,4).map(t=>`<div class="floating-task ${t.priority}"><b>${t.priority}</b> ${escapeHTML(t.name)}<small class="floating-assignee">${escapeHTML(t.assignee)}</small></div>`).join('')}`;
  document.body.appendChild(f);
  f.style.left=`${Math.min(Math.max(12,r.left+r.width/2-135),innerWidth-282)}px`;
  f.style.top=`${Math.max(12,Math.min(r.top-16,innerHeight-220))}px`;
  f.addEventListener('mouseenter',()=>{if(floatHideTimer){clearTimeout(floatHideTimer);floatHideTimer=null}});
  f.addEventListener('mouseleave',()=>hideFloat());
  f.querySelector('.floating-add-task')?.addEventListener('click',e=>{e.stopPropagation();hideFloat(true);newTask(null,iso)});
  requestAnimationFrame(()=>f.classList.add('show'));
}
function hideFloat(immediate=false){
  if(floatHideTimer){clearTimeout(floatHideTimer);floatHideTimer=null}
  if(immediate){removeFloat();return}
  // Give the pointer time to travel from the source to the fixed preview.
  floatHideTimer=setTimeout(removeFloat,260);
}
function renderCalendar(){weekObserver?.disconnect();const horizonOffset=weekOffsetFor(DATE_HORIZON);const focus=Math.min(Math.max(UI.selectedWeek||0,-2),horizonOffset);UI.selectedWeek=focus;const minOffset=Math.min(-2,focus-2),maxOffset=Math.max(2,horizonOffset);const offsets=Array.from({length:maxOffset-minOffset+1},(_,i)=>minOffset+i);$('#weekCarousel').innerHTML=offsets.map(off=>{const ds=week(off).filter(d=>d<=DATE_HORIZON),ts=scheduleTasks().filter(t=>ds.includes(t.date)),is=off===focus;if(!ds.length)return '';return `<section class="week-panel ${is?'focus-week':'compact-week'}" data-week="${off}"><div class="week-panel-header"><div><span class="week-kicker">${is?'正在查看':'滚动查看'}</span><h2>${fmt(ds[0])} — ${fmt(ds.at(-1))}</h2></div><div class="week-totals"><strong>${ts.length}</strong><span>项任务 · 完成 ${ts.filter(t=>t.status==='done').length}</span></div></div><div class="week-days"><div class="week-days-track">${ds.map(iso=>{const a=sortTasks(scheduleTasks().filter(t=>t.date===iso));return `<article class="axis-day ${iso===S.today?'today-day':''}" data-date="${iso}" tabindex="0"><div class="axis-day-head"><span>${wd(iso)}</span><strong>${new Date(`${iso}T12:00:00`).getDate()}</strong>${iso===S.today?'<em>今天</em>':''}</div><div class="axis-day-count">${a.length?`${a.length} 项 · 完成 ${a.filter(t=>t.status==='done').length}`:'暂无安排'}</div>${scheduleMemberLabels(a)}<div class="hover-peek">${a[0]?`<span class="priority ${a[0].priority}">${a[0].priority}</span><strong>${a[0].name}</strong>`:'<strong>暂无安排</strong>'}<small>悬停预览 · 点击进入详情</small></div><div class="axis-task-list">${a.length?a.map(t=>`<button class="axis-task ${t.priority}" data-task="${t.id}"><span class="priority ${t.priority}">${t.priority}</span><span>${escapeHTML(t.name)}</span><small>${escapeHTML(t.assignee)} · ${t.duration} 分钟 · ${status(t)[1]}</small></button>`).join(''):'<div class="axis-empty">这一天还没有安排</div>'}</div>${S.user?.admin?`<button class="axis-day-add" data-date="${iso}">＋ 添加任务</button>`:''}</article>`}).join('')}</div></div></section>`}).join('');const focusEl=$('#weekCarousel .focus-week');if(focusEl)requestAnimationFrame(()=>focusEl.scrollIntoView({block:'center'}));weekObserver=new IntersectionObserver(es=>{const v=es.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!v)return;const n=Math.min(Math.max(Number(v.target.dataset.week),-2),horizonOffset);if(n!==UI.selectedWeek){UI.selectedWeek=n;renderScheduleScope();$$('#weekCarousel .week-panel').forEach(p=>{const a=Number(p.dataset.week)===n;p.classList.toggle('focus-week',a);p.classList.toggle('compact-week',!a);p.querySelector('.week-kicker').textContent=a?'正在查看':'滚动查看'})}}, {root:$('#weekCarousel'),threshold:.6});$$('#weekCarousel .week-panel').forEach(p=>weekObserver.observe(p));$$('#weekCarousel .axis-day').forEach(d=>{d.onmouseenter=()=>showFloat(d);d.onmouseleave=()=>hideFloat();d.onclick=e=>{if(!e.target.closest('[data-task],.axis-day-add'))renderDayDetail(d.dataset.date)};d.onkeydown=e=>{if(e.key==='Enter')renderDayDetail(d.dataset.date)}});$$('#weekCarousel .axis-day-add').forEach(b=>b.onclick=e=>{e.stopPropagation();newTask(null,b.dataset.date)});$$('#weekCarousel [data-task]').forEach(b=>b.onclick=()=>openDrawer(b.dataset.task))}
function renderDayDetail(iso){UI.detailDate=iso;switchView('dayDetail')}
function renderDayContent(){
  const iso=UI.detailDate||displayDay();
  $('#dayDetailKicker').textContent=`${wd(iso)} · ${fmt(iso)}`;
  const tasks=scheduleTasks().filter(t=>t.date===iso);
  const add=S.user?.admin?`<button class="secondary-btn calendar-add-task" data-date="${iso}">＋ 在此日期新增任务</button>`:'';
  $('#dayDetailContent').innerHTML=add+(dailyTaskGroups(tasks)||'<div class="empty-state"><div class="empty-icon">—</div><h3>这一天还没有安排</h3><p>当前查看范围内没有任务。</p></div>');
  bindTaskCards('#dayDetailContent');
  $('#dayDetailContent .calendar-add-task')?.addEventListener('click',()=>newTask(null,iso));
}
function openDrawer(id){
  const t=S.tasks.find(x=>x.id===id);if(!t)return;
  const [c,l]=status(t),p=S.projects.find(p=>p.id===t.projectId),archived=['done','deferred','skipped'].includes(t.status),pendingApproval=['pending_approval','awaiting_approval','submitted'].includes(t.status),rejected=['rejected','returned'].includes(t.status);
  const manage=canManageProject(p)&&p.status==='active'&&!archived&&!pendingApproval&&!rejected,perform=!S.user.admin&&!archived&&t.assignee===S.user.id;
  const editPending=taskEditPending(t),editRequest=taskEditRequest(t),canRequestEdit=perform&&!S.user.admin&&!editPending&&!['done','deferred','skipped','pending_approval','awaiting_approval','submitted'].includes(t.status)&&(!p||p.status==='active');
  const reviewer=canReviewTask(t),editReviewer=editRequest?.approver===S.user.id, reviewActions=pendingApproval&&reviewer?'<div class="drawer-actions approval-actions"><button class="primary-btn" id="approveTask">✓ 审批通过</button><button class="secondary-btn" id="rejectTask">驳回并给建议</button></div>':'';
  const editReviewActions=editPending&&editReviewer?'<div class="drawer-actions approval-actions"><button class="primary-btn" id="approveEditRequest">✓ 同意修改</button><button class="secondary-btn" id="rejectEditRequest">驳回修改申请</button></div>':'';
  const completionLogs=S.logs.filter(x=>x.taskId===t.id&&['complete','complete_pending'].includes(x.kind)),latestCompletion=completionLogs[completionLogs.length-1],completionSummary=t.completionSummary||latestCompletion?.summary||t.approval?.summary;
  const rejection=t.rejection||t.approval?.reason;
  const actionCopy=pendingApproval?`<p class="muted approval-pending-note">完成总结已提交，等待项目 Owner 审批；审批前任务会顺延到下一日。${completionSummary?`<br>完成总结：${escapeHTML(completionSummary)}`:''}</p>`:editPending?`<p class="muted approval-pending-note">修改申请已提交，等待 ${escapeHTML(t.assignee===p?.owner?'superadmin':p?.owner||'superadmin')} 审批；审批前请暂缓完成或递延任务。</p>`:rejected?`<p class="rejection-note">任务已驳回${rejection?`：${escapeHTML(rejection)}`:'，请根据建议重新完成。'}</p>`:archived?`<p class="muted">${l} · 本次任务已归档</p>`:perform?`<div class="drawer-actions">${t.status==='todo'?'<button class="secondary-btn" id="startTask">▶ 开始任务</button>':''}<button class="primary-btn complete-btn" id="completeTask">✓ 提交完成审批</button><button class="defer-btn" id="deferTask">↗ 未完成，递延</button></div>`:'<p class="muted">由任务负责人记录完成或递延。</p>';
  const editSummary=editPending?renderEditRequestSummary(t):'';
  const canDelete=S.user.admin&&!t.fixed&&!t.repeatId&&!pendingApproval&&!rejected;
  $('#drawerContent').innerHTML=`<div class="drawer-kicker">${escapeHTML(projectName(t))} · ${escapeHTML(t.priority)}</div><h2 class="drawer-title">${escapeHTML(t.name)}</h2><p class="drawer-description">${escapeHTML(t.desc||'暂无描述')}</p>${completionSummary?`<div class="completion-summary"><span>最新完成总结</span><p>${escapeHTML(completionSummary)}${latestCompletion?.actual?` · 实际 ${latestCompletion.actual} 分钟`:''}</p></div>`:''}${editSummary}<div class="detail-grid"><div><span>状态</span><strong><i class="status-dot ${c}"></i>${l}</strong></div><div><span>预计时长</span><strong>${t.duration} 分钟</strong></div><div><span>截止时间</span><strong>${escapeHTML(t.deadline||t.date)}</strong></div><div><span>负责人</span><strong>${escapeHTML(t.assignee)}</strong></div></div>${canRequestEdit?'<button class="secondary-btn edit-task-request-btn" id="requestTaskEdit">申请修改任务</button>':''}${S.user.admin&&!editPending&&!['done','deferred','skipped','pending_approval','awaiting_approval','submitted','rejected'].includes(t.status)&&(!p||p.status==='active')?'<button class="secondary-btn edit-task-request-btn" id="directTaskEdit">直接调整任务</button>':''}${manage?'<button class="secondary-btn" id="editTaskAssignee">调整任务指派</button>':''}${canDelete?'<button class="secondary-btn danger-btn" id="deleteTask">删除此任务</button>':''}<div class="history"><h3>任务记录</h3>${S.logs.filter(x=>x.taskId===t.id).map(x=>`<div class="history-item"><i></i><span>${escapeHTML(x.kind==='adjust'?`指派调整：${x.before.assignee} → ${x.after.assignee}`:`${x.kind} · ${x.summary||x.reason||x.remaining||''}`)}</span></div>`).join('')||'<div class="history-item"><i></i><span>暂无记录</span></div>'}</div>${actionCopy}${reviewActions}${editReviewActions}`;
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
  const tasks=S.tasks.filter(t=>t.assignee===author&&t.date===day&&t.status!=='skipped'),done=tasks.filter(t=>t.status==='done');
  return {completed:done.length,total:tasks.length,load:done.reduce((n,t)=>n+(Number(t.duration)||0),0),loadRatio:tasks.length?done.length/tasks.length:0};
}
function diaryContent(author,day){
  const draft=UI.diaryDrafts?.[`${author}:${day}`];if(draft)return draft;
  const r=diaryReport(author,day);if(r)return typeof r.content==='string'?{done:r.content,risks:'',next:''}:r.content||{};
  const tasks=S.tasks.filter(t=>t.assignee===author&&t.date===day&&t.status!=='skipped');
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
  $('#diaryWorkspace').innerHTML=`<div class="diary-admin"><div class="notebook-shelf-heading"><div><span class="eyebrow">SUPERADMIN · 成员笔记本</span><h2>笔记本展示柜</h2></div><span class="muted">左右滑动选择成员，点击进入个人日记周视图</span></div><div class="notebook-shelf">${members.map(u=>{const r=diaryReport(u.id,S.today);return `<button class="member-notebook" data-member="${escapeHTML(u.id)}"><span class="notebook-cover">▤</span><strong>${escapeHTML(u.id)}</strong><small>${r?(r.auto?'今日系统已统计':'今日已记录'):'等待今日记录'}</small></button>`}).join('')||'<p class="muted">暂无成员笔记本。</p>'}</div><div class="diary-log-toolbar"><label>查看工作日期<input id="diaryLogDate" type="date" max="${DATE_HORIZON}" value="${escapeHTML(day)}"></label><button class="secondary-btn" id="diaryLogToday">返回今天</button></div><div class="diary-admin-grid"><div class="diary-log-panel"><div class="panel-heading"><div><h2>工作日志 · ${fmt(day)}</h2><span class="muted">仅记录审批通过后完成的任务与项目 · 点击查看详情</span></div></div><div class="diary-log-list">${logs.length?logs.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).map(l=>`<button class="diary-log-item diary-log-button" data-task-id="${escapeHTML(l.taskId||'')}" data-project-id="${escapeHTML(l.projectId||'')}" data-log-kind="${escapeHTML(l.kind||'')}"><i></i><span>${escapeHTML(l.label)}${l.project?`<small class="diary-log-project">${escapeHTML(l.project)}</small>`:''}</span><small>${escapeHTML(l.user||'')}　›</small></button>`).join(''):'<p class="muted">当日暂无已完成任务或项目。</p>'}</div><div class="diary-projects"><h3>项目当前进度</h3>${projectRows||'<p class="muted">暂无进行中的项目。</p>'}</div></div><div class="diary-load-panel"><div class="panel-heading"><div><h2>成员负载</h2><span class="muted">当日完成任务占比</span></div></div>${rows||'<p class="muted">暂无成员数据。</p>'}</div></div></div>`;
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
    return `<article class="project-card project-node"><div class="project-node-heading"><div><div class="project-title"><h3>${escapeHTML(p.name)}</h3><span class="project-status">${projectStatus(p)}</span></div><p>${escapeHTML(p.desc||'暂无描述')}</p></div><div class="project-node-actions">${manage?`<button class="primary-btn add-project-task" data-project="${escapeHTML(p.id)}">＋ 新建并指派任务</button>`:''}${manage&&hasSlot?`<button class="secondary-btn invite-members" data-id="${escapeHTML(p.id)}">${admin?'直接添加协作者':'邀请协作者'}</button>`:''}${p.status==='pending'&&admin?`<button class="secondary-btn approve-project" data-id="${escapeHTML(p.id)}">审批项目</button>`:''}${p.status==='active'&&manage&&!admin&&projectTasksComplete(p)?`<button class="secondary-btn request-project-completion" data-id="${escapeHTML(p.id)}">申请项目结项</button>`:''}${p.status==='active'&&manage&&!admin&&!projectTasksComplete(p)?`<span class="muted project-completion-hint">${tasks.length?'完成全部子任务后可结项':'创建子任务后可结项'}</span>`:''}${p.status==='pending_completion'&&admin?`<button class="secondary-btn approve-project-completion" data-id="${escapeHTML(p.id)}">审批项目完成</button>`:''}${canManageProject(p)?`<button class="ghost-btn delete-project" data-id="${escapeHTML(p.id)}">删除项目</button>`:''}</div></div><div class="project-members"><span>Owner · ${escapeHTML(p.owner)}　协作者：${accepted.filter(id=>id!==p.owner).map(escapeHTML).join('、')||'暂无'}${pending.length?`　待确认：${pending.map(escapeHTML).join('、')}`:''}</span><span>${canManageProject(p)?'项目':'我的任务'} ${done}/${tasks.length} 已完成 · 截止 ${escapeHTML(p.end||'未设置')}</span></div><div class="project-task-tree"><div class="project-tree-label">${canManageProject(p)?'项目任务':'分配给我的任务'} <span>${tasks.length}</span></div>${tasks.map(t=>`<div class="project-child-row"><button class="project-task-open" data-id="${escapeHTML(t.id)}"><span class="priority ${escapeHTML(t.priority)}">${escapeHTML(t.priority)}</span><strong>${escapeHTML(t.name)}</strong><span class="child-assignee">${escapeHTML(t.assignee)}</span><span class="child-date">${escapeHTML(t.date)}</span><span>${status(t)[1]}</span><span aria-hidden="true">›</span></button>${manage&&['todo','doing'].includes(t.status)?`<button class="ghost-btn assign-project-task" data-id="${escapeHTML(t.id)}">调整指派</button>`:''}</div>`).join('')||`<p class="project-task-empty">${manage?'还没有任务，从这里安排第一项工作。':p.status==='pending'?'项目审批通过后，Owner 可创建和指派任务。':'暂无分配给你的任务。'}</p>`}</div></article>`;
  }).join('')||'<div class="empty-state">暂无项目，可先申请创建项目。</div>';
  $$('.add-project-task').forEach(b=>b.onclick=()=>newTask(b.dataset.project));
  $$('.project-task-open').forEach(b=>b.onclick=()=>openDrawer(b.dataset.id));
  $$('.assign-project-task').forEach(b=>b.onclick=()=>editTaskAssignment(b.dataset.id));
  $$('.approve-project').forEach(b=>b.onclick=()=>{const n=S.notifications.find(n=>n.kind==='approval'&&n.reference===b.dataset.id);if(n)openNotification(n.id)});
  $$('.request-project-completion').forEach(b=>b.onclick=()=>requestProjectCompletion(b.dataset.id));
  $$('.approve-project-completion').forEach(b=>b.onclick=()=>{const n=S.notifications.find(n=>n.kind==='project_completion'&&n.reference===b.dataset.id);if(n)openNotification(n.id)});
  $$('.invite-members').forEach(b=>b.onclick=()=>inviteCollaborators(b.dataset.id));
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
function inviteCollaborators(projectId){
  const p=S.projects.find(x=>x.id===projectId),admin=Boolean(S.user?.admin),existing=p?.members||{};
  if(!canManageProject(p)||p.status!=='active'){toast('只有项目 Owner 或 superadmin 可管理进行中的项目');return}
  const candidates=S.users.filter(u=>u.active&&!u.admin&&u.id!==p.owner&&existing[u.id]!=='accepted'&&(admin||existing[u.id]!=='pending'));
  openModal(`<div class="eyebrow">${escapeHTML(p.name)} · ${admin?'管理员直接指派':'Owner 协作邀请'}</div><h2>${admin?'直接添加协作者':'邀请协作者'}</h2><p>${admin?'添加后立即加入项目，无需成员确认。系统会通知协作者和 Owner。':'成员在收件箱接受邀请后加入项目，随后可为其指派任务。以下只显示项目时间范围内的任务总数。'}</p><div class="member-checkboxes">${candidates.map(u=>`<label><input type="checkbox" name="inviteMember" value="${escapeHTML(u.id)}"> <strong>${escapeHTML(u.id)}</strong><small>${existing[u.id]==='pending'?'当前待确认 · 可直接加入':'成员'} · 时间范围内 <b data-member-load="${escapeHTML(u.id)}">${memberTaskCount(u.id,p)}</b> 项任务</small></label>`).join('')||'<p class="muted">暂无可添加成员</p>'}</div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmInvite" ${candidates.length?'':'disabled'}>${admin?'直接添加并通知':'发送邀请'}</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmInvite').onclick=async()=>{const members=$$('input[name="inviteMember"]:checked').map(x=>x.value);if(!members.length){toast('至少选择一位协作者');return}try{await act('project.invite',{id:projectId,members});closeModal()}catch(e){}};
  api('/api/action',{action:'project.member_loads',data:{id:projectId}}).then(result=>{
    if($('#modalBackdrop')?.classList.contains('hidden'))return;
    for(const [id,total] of Object.entries(result.counts||{})){const el=$$('[data-member-load]').find(node=>node.dataset.memberLoad===id);if(el)el.textContent=total}
  }).catch(()=>{});
}
function renderInbox(){
  const notifications=S.notifications||[],requests=(S.requests||[]).filter(r=>r.status==='pending');
  const approvalInfo=x=>{const p=S.projects.find(p=>p.id===x.reference);const editReq=(S.editRequests||[]).find(r=>r.id===x.reference);const task=S.tasks.find(t=>t.id===x.reference||t.id===editReq?.taskId);const projectPending=Boolean(S.user?.admin&&x.kind==='approval'&&x.title==='项目审批申请'&&p?.status==='pending');const projectCompletionPending=Boolean(S.user?.admin&&x.kind==='project_completion'&&p?.status==='pending_completion');const taskPending=Boolean(x.kind==='task_approval'&&task&&canReviewTask(task)&&['pending_approval','awaiting_approval','submitted'].includes(task.status));const editPending=Boolean(x.kind==='task_edit_approval'&&editReq&&editReq.status==='pending'&&editReq.approver===S.user?.id&&task);return {project:p,task,editReq,projectPending,projectCompletionPending,taskPending,editPending,pending:projectPending||projectCompletionPending||taskPending||editPending}};
  const unreadRequests=requests.filter(r=>!r.read).length;
  const unreadNotifications=notifications.filter(x=>!x.read).length;
  const unreadCount=unreadRequests+unreadNotifications;$('#inboxCount').textContent=unreadCount;$('.notification-dot').classList.toggle('hidden',unreadCount===0);$('#inboxView .eyebrow').textContent=`通知中心 · ${unreadCount} 条未读`;
  const cards=[...requests.map(r=>{const p=S.projects.find(x=>x.id===r.projectId);const unread=!r.read;return {priority:2,time:r.createdAt,html:`<article class="inbox-item request-inbox-item ${unread?'unread':''}" data-request="${escapeHTML(r.id)}"><div class="inbox-icon">◇</div><div class="inbox-copy"><strong>项目协作邀请</strong>${unread?'<i class="unread-dot"></i>':''}<p>邀请你加入「${escapeHTML(p?.name||'项目')}」。接受后项目任务才会进入你的日程。</p><small>${escapeHTML(r.createdAt)}</small><div class="inbox-actions"><button class="primary-btn accept-request" data-id="${escapeHTML(r.id)}">接受</button><button class="secondary-btn reject-request" data-id="${escapeHTML(r.id)}">拒绝</button></div></div></article>`}}),...notifications.map(x=>{const {project,task,projectPending,projectCompletionPending,taskPending,editPending,pending}=approvalInfo(x);const unread=!x.read||pending;const actions=projectPending?`<div class="inbox-actions"><button class="primary-btn approve-project-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">同意创建</button><button class="secondary-btn reject-project-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回申请</button></div>`:projectCompletionPending?`<div class="inbox-actions"><button class="primary-btn approve-project-completion-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">同意完成</button><button class="secondary-btn reject-project-completion-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回申请</button></div>`:taskPending?`<div class="inbox-actions"><button class="primary-btn approve-task-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">审批通过</button><button class="secondary-btn reject-task-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回并建议</button></div>`:editPending?`<div class="inbox-actions"><button class="primary-btn approve-edit-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">同意修改</button><button class="secondary-btn reject-edit-request" data-id="${escapeHTML(x.reference)}" data-notification="${escapeHTML(x.id)}">驳回申请</button></div>`:'';return {priority:pending?2:unread?1:0,time:x.createdAt,html:`<article class="inbox-item ${unread?'unread':''} ${pending?'approval-pending':''}" data-id="${escapeHTML(x.id)}"><div class="inbox-icon">${editPending?'✎':projectCompletionPending?'◆':taskPending?'✓':x.kind==='report'?'◷':x.kind==='approval'?'◇':x.kind==='request'?'♧':'↗'}</div><div class="inbox-copy"><strong>${escapeHTML(x.title)}</strong>${unread?'<i class="unread-dot"></i>':''}<p>${escapeHTML(x.body)}</p><small>${escapeHTML(x.createdAt)}</small>${actions}</div><span class="task-arrow">›</span></article>`}})].sort((a,b)=>(b.priority-a.priority)||String(b.time).localeCompare(String(a.time)));
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
  list.innerHTML=repeats.map(r=>{const days=(r.weekdays||[]).map(i=>dayNames[i]).join('、');const pattern=r.frequency==='daily'?'每天':r.frequency==='workdays'?'工作日':r.frequency==='dates'?'指定日期':days||'每周';const state=r.active===false?'已暂停':'启用中';return `<article class="repeat-admin-item"><div><strong>${escapeHTML(r.name)}</strong><span>${escapeHTML(pattern)} · ${escapeHTML(r.time||'09:00')} · ${escapeHTML((r.assignees||[]).join('、'))}</span><small>${state}${r.skipDates?.length?` · 已挖空 ${r.skipDates.length} 天`:''}</small></div><button class="ghost-btn skip-repeat" data-id="${escapeHTML(r.id)}">挖空本次</button></article>`}).join('')||'<p class="muted">还没有固定任务规则。</p>';
  $$('.skip-repeat').forEach(b=>b.onclick=()=>{const date=prompt('请输入本次不执行的日期（YYYY-MM-DD）',S.today);if(!date)return;act('repeat.skip',{id:b.dataset.id,date,skip:true}).catch(()=>{})});
}
function accountProjectRoles(id){const owned=S.projects.filter(p=>p.owner===id).map(p=>p.name),joined=S.projects.filter(p=>p.owner!==id&&(p.members||{})[id]==='accepted').map(p=>p.name);return {owned,joined}}
function accountRoleLabel(x){
  if(x.admin)return '全部项目、成员、审批与 AI 配置';
  const {owned,joined}=accountProjectRoles(x.id);const parts=[];
  if(owned.length)parts.push('Owner：'+owned.join('、'));
  if(joined.length)parts.push('协作者：'+joined.join('、'));
  if(!x.active)parts.push('账户已停用');
  return parts.join('　')||'暂无项目归属';
}
function renderAccountItem(x,admin){
  const self=x.id===S.user.id,roles=accountProjectRoles(x.id);
  const shortRole=x.admin?'Super Admin':(roles.owned.length?'项目 Owner':'普通用户');
  const actions=self?`<span class="permission-pill">当前身份</span> <button class="ghost-btn change-password" data-user="${x.id}">修改密码</button>`:(admin?`<button class="ghost-btn toggle-admin" data-user="${x.id}" data-admin="${x.admin?1:0}">${x.admin?'撤销 superadmin':'设为 superadmin'}</button> <button class="ghost-btn reset-password" data-user="${x.id}">重置密码</button> <button class="ghost-btn toggle-account" data-user="${x.id}" data-active="${x.active?1:0}">${x.active?'停用':'启用'}</button> `:'' );
  const tail=self?'':(x.active?`<button class="ghost-btn switch-login" data-user="${x.id}">切换</button>`:'<span class="muted">不可用</span>');
  return `<article class="account-item ${self?'current-account':''}"><div class="avatar">${x.id.slice(0,1).toUpperCase()}</div><div class="account-copy"><strong>${escapeHTML(x.id)}</strong><span>${escapeHTML(shortRole)}</span><small>${escapeHTML(accountRoleLabel(x))}</small></div>${actions}${tail}</article>`;
}
function renderAccounts(){
  const u=S.users,admin=Boolean(S.user?.admin);
  $('#accountsView .repeat-admin-panel')?.classList.toggle('hidden',!admin);renderRepeats();
  $('#currentRoleLabel').textContent=admin?'Super Admin':S.projects.some(p=>p.owner===S.user.id)?'项目 Owner':'协作者';
  $('.account-banner .avatar').textContent=S.user.id[0].toUpperCase();
  $('.account-banner strong').textContent=S.user.id;
  $('.account-banner span').textContent=admin?'Super Admin · 全部项目与成员':`${S.user.id} · ${S.projects.some(p=>p.owner===S.user.id)?'项目 Owner':'项目协作者'}`;
  $('.account-banner .permission-pill').textContent=admin?'可强行指派 / 调整':'可查看已加入项目';
  $('#createFixedBtn').classList.toggle('hidden',!admin);
  $('#forceAssignBtn').classList.toggle('hidden',!admin);
  $('#runAutomationBtn').classList.toggle('hidden',!admin);
  $('#accountsView .automation-card').classList.toggle('hidden',!admin);
  $('#accountsView .page-intro p').textContent=admin?'Super Admin 可制定固定任务、强行指派或调整任务，系统会向相关成员发送通知。':'你可以切换核验账户；项目 Owner 可邀请协作者，成员可在收件箱接受项目邀请。';
  const admins=u.filter(x=>x.admin),members=u.filter(x=>!x.admin);
  const section=(title,hint,list)=>`<div class="account-group"><div class="account-group-heading"><strong>${title}</strong><span>${list.length}</span><small>${hint}</small></div>${list.map(x=>renderAccountItem(x,admin)).join('')||'<p class="muted">暂无账户。</p>'}</div>`;
  $('#accountList').innerHTML=section('superadmin 权限组','可管理全部项目、成员、审批与 AI 配置',admins)+section('普通用户','按项目归属以 Owner 或协作者身份参与',members);
  $$('.switch-login').forEach(b=>b.onclick=async()=>{try{await api('/api/logout',{});showAuth();$('#loginUser').value=b.dataset.user;$('#loginPass').focus()}catch(e){toast(e.message)}});
  $$('.toggle-account').forEach(b=>b.onclick=async()=>{try{await act('account.toggle',{id:b.dataset.user,active:b.dataset.active==='0'});toast(b.dataset.active==='0'?'账户已启用':'账户已停用')}catch(e){}});
  $$('.toggle-admin').forEach(b=>b.onclick=async()=>{const grant=b.dataset.admin==='0';try{await api('/api/action',{action:'account.admin',data:{id:b.dataset.user,admin:grant}});await refresh();toast(grant?`${b.dataset.user} 已加入 superadmin 权限组`:`${b.dataset.user} 已移出 superadmin 权限组`)}catch(e){toast(e.message||'操作失败')}});
  $$('.change-password').forEach(b=>b.onclick=async()=>{const current=prompt('请输入当前密码');if(current===null)return;const pw=prompt('请输入新密码（至少6位）');if(!pw)return;try{await api('/api/password',{id:b.dataset.user,current,password:pw});toast('密码已更新')}catch(e){toast(e.message)}});
  $$('.reset-password').forEach(b=>b.onclick=async()=>{const pw=prompt(`为 ${b.dataset.user} 设置新密码（至少6位）`);if(!pw)return;try{await api('/api/password',{id:b.dataset.user,password:pw});toast('密码已重置，该账户需重新登录')}catch(e){toast(e.message)}});
}
async function act(action,data){try{await api('/api/action',{action,data});await refresh();toast('操作已完成')}catch(e){toast(e.message);throw e}}
function openModal(html){$('#modalContent').innerHTML=html;$('#modalBackdrop').classList.remove('hidden')};function closeModal(){$('#modalBackdrop').classList.add('hidden')};function closeDrawer(){$('#taskDrawer').classList.add('hidden')}
function newTask(projectId,initialDate){
  const projects=manageableProjects().filter(p=>!isProjectHidden(p)),locked=typeof projectId==='string',initial=projects.find(p=>p.id===projectId)?.id||projects[0]?.id;
  if(!projects.length){toast('请先创建项目并等待审批，项目 Owner 或管理员可分配任务');switchView('projects');return}
  openModal(`<div class="eyebrow">${S.user.admin?'管理员':'项目 Owner'} · 项目子任务</div><h2>新建并指派任务</h2><label class="form-field">所属项目<select id="taskProject" ${locked?'disabled':''}>${projects.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('')}</select></label><label class="form-field">任务名称<input id="taskName" maxlength="120"></label><label class="form-field">任务描述<textarea id="taskDesc"></textarea></label><label class="form-field">指派给<select id="taskAssignee"></select><div id="taskAssigneeLoad" class="assignee-load-hint"></div></label><div class="task-form-grid"><label class="form-field">安排日期<input id="taskDate" type="date" max="${DATE_HORIZON}" value="${initialDate||(UI.view==='dayDetail'?UI.detailDate:displayDay())}"></label><label class="form-field">时间<input id="taskTime" type="time" value="09:00"></label><label class="form-field">预计时长<input id="taskDuration" type="number" min="1" max="1440" value="30"></label><label class="form-field">优先级<select id="taskPriority"><option>P0</option><option selected>P1</option><option>P2</option></select></label></div><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmTask">创建并指派</button></div>`);
  const updateUsers=()=>{const p=projects.find(p=>p.id===$('#taskProject').value),users=projectAssignees(p),start=p?.start||S.today,end=p?.end||'9999-12-31';$('#taskAssignee').innerHTML=users.map(u=>{const ts=S.tasks.filter(t=>t.assignee===u.id&&t.date>=start&&t.date<=end&&t.status!=='skipped'),done=ts.filter(t=>t.status==='done').length,mins=ts.reduce((n,t)=>n+Number(t.duration||0),0);return `<option value="${escapeHTML(u.id)}">${escapeHTML(u.id)}${u.id===p.owner?' · Owner':''} · ${ts.length} 项 / ${Math.round(mins/60*10)/10}h</option>`}).join('');$('#taskAssigneeLoad').innerHTML=users.length?`项目周期 ${escapeHTML(start)} 至 ${p?.end?escapeHTML(p.end):'未设截止'} · 显示每位成员该周期任务总数与预计负载；已完成 ${users.map(u=>{const ts=S.tasks.filter(t=>t.assignee===u.id&&t.date>=start&&t.date<=end&&t.status!=='skipped');return `${u.id} ${ts.filter(t=>t.status==='done').length}/${ts.length}`}).join('、')}`:'项目暂无已接受成员，请先添加协作者';$('#confirmTask').disabled=!users.length};
  $('#taskProject').value=initial;$('#taskProject').onchange=updateUsers;updateUsers();$('#cancelAction').onclick=closeModal;
  $('#confirmTask').onclick=async()=>{if(!$('#taskName').value.trim()){toast('请填写任务名称');return}const data={name:$('#taskName').value,desc:$('#taskDesc').value,projectId:$('#taskProject').value,assignee:$('#taskAssignee').value,date:$('#taskDate').value,time:$('#taskTime').value,duration:Number($('#taskDuration').value),priority:$('#taskPriority').value};try{await act('task.create',data);closeModal()}catch(e){}};
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
  openModal(`<div class="eyebrow">Super Admin · 固定任务</div><h2>发布固定安排</h2><label class="form-field">任务名称<input id="repeatName" maxlength="120" required></label><fieldset class="member-checkboxes" id="repeatUsers"><legend>安排给（可多选）</legend>${users.map(u=>`<label><input type="checkbox" name="repeatUser" value="${escapeHTML(u.id)}"> ${escapeHTML(u.id)}</label>`).join('')}</fieldset><label class="form-field">周期<select id="repeatFreq"><option value="daily">每天</option><option value="weekly" selected>每周指定星期</option><option value="workdays">工作日</option><option value="dates">指定日期</option></select></label><fieldset class="member-checkboxes" id="repeatWeekdayFields"><legend>每周几执行</legend>${days.map((d,i)=>`<label><input type="checkbox" name="repeatWeekday" value="${i}" ${i<5?'checked':''}> ${d}</label>`).join('')}</fieldset><label class="form-field hidden" id="repeatDatesField">指定日期（逗号分隔）<input id="repeatDates" placeholder="2026-09-20, 2026-10-01"></label><label class="form-field">开始日期<input id="repeatStart" type="date" max="${DATE_HORIZON}" value="${S.today}"></label><label class="form-field">结束日期（可留空）<input id="repeatEnd" type="date" max="${DATE_HORIZON}"></label><label class="form-field">开始时间<input id="repeatTime" type="time" value="09:00"></label><label class="form-field">时长<input id="repeatDuration" type="number" min="1" max="1440" value="30"></label><label class="form-field">本次挖空日期（可留空）<input id="repeatSkipDates" placeholder="例如：2026-10-01, 2026-10-02"></label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmRepeat">保存固定任务</button></div>`);
  const sync=()=>{const freq=$('#repeatFreq').value;$('#repeatWeekdayFields').classList.toggle('hidden',!['weekly'].includes(freq));$('#repeatDatesField').classList.toggle('hidden',freq!=='dates')};
  $('#repeatFreq').onchange=sync;sync();$('#cancelAction').onclick=closeModal;
  $('#confirmRepeat').onclick=async()=>{const dates=$('#repeatDates').value.split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean),skipDates=$('#repeatSkipDates').value.split(/[,，\s]+/).map(x=>x.trim()).filter(Boolean),assignees=$$('input[name="repeatUser"]:checked').map(x=>x.value),weekdays=$$('input[name="repeatWeekday"]:checked').map(x=>Number(x.value));if(!$('#repeatName').value.trim()||!assignees.length){toast('请填写任务名称并选择成员');return}if($('#repeatFreq').value==='weekly'&&!weekdays.length){toast('请选择每周执行日');return}if($('#repeatFreq').value==='dates'&&!dates.length){toast('请填写至少一个指定日期');return}try{await act('repeat.create',{name:$('#repeatName').value,assignees,frequency:$('#repeatFreq').value,weekdays,dates,start:$('#repeatStart').value,end:$('#repeatEnd').value,time:$('#repeatTime').value,duration:Number($('#repeatDuration').value),priority:'P1',skipDates});closeModal()}catch(e){}};
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
  const projectLabel=S.user.admin?'＋ 创建项目':'＋ 申请项目';
  ['#addProjectBtn','#addProjectTopBtn','#timelineAddProjectBtn'].forEach(id=>$(id).textContent=projectLabel);
  const canAssign=Boolean(S.user.admin||manageableProjects().length);
  $('#addTaskBtn').textContent='＋ 指派项目任务';$('#addTaskBtn').classList.toggle('hidden',!canAssign);
  $('#emptyAddBtn').classList.toggle('hidden',!canAssign);
  $('#forceAssignBtn').textContent='管理项目与任务';
  $('[data-view="today"]').removeAttribute('disabled');
  $('.workspace-switcher .avatar').textContent=S.user.id[0].toUpperCase();
  $('.workspace-switcher small').textContent=S.user.admin?'团队工作区':'成员工作区';
  $('.workspace-switcher strong').textContent=S.user.id;
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
  return `<div class="axis-members">${members.slice(0,2).map(id=>`<span>${escapeHTML(id)}</span>`).join('')}${members.length>2?`<small>+${members.length-2} 人</small>`:''}</div>`;
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
  const tasks=scheduleTasks().filter(t=>dates.includes(t.date));
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
    return `<article class="achievement-card" data-project="${escapeHTML(p.id)}"><div class="achievement-card-head"><div><span class="achievement-kicker">已归档成果</span><h2>${escapeHTML(p.name)}</h2><p>${escapeHTML(p.desc||'暂无项目描述')}</p></div><span class="achievement-status">${projectStatus(p)}</span></div><div class="achievement-meta"><span>Owner · <b>${escapeHTML(p.owner||'—')}</b></span><span>任务完成 · <b>${done}/${tasks.length}</b></span><span>完成于 · <b>${escapeHTML(String(p.completedAt||p.end||'—').slice(0,10))}</b></span></div><ol class="achievement-lifecycle">${stages.map((s,i)=>`<li class="${s.at?'is-complete':''}"><i></i><span><b>${escapeHTML(s.label)}</b><small>${escapeHTML(s.at||'未记录')}${s.meta?` · ${escapeHTML(s.meta)}`:''}</small></span>${i<stages.length-1?'<em></em>':''}</li>`).join('')}</ol>${p.completionReport?`<div class="achievement-report"><span>结项报告</span><p>${escapeHTML(p.completionReport)}</p></div>`:''}<div class="achievement-actions"><button class="secondary-btn achievement-open" data-project="${escapeHTML(p.id)}">查看项目详情</button></div></article>`;
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
$$('.nav-item').forEach(b=>b.onclick=()=>switchView(b.dataset.view));$$('.filter-link').forEach(b=>b.onclick=()=>{UI.filter=b.dataset.filter;switchView('today')});$$('.quick-tab').forEach(b=>b.onclick=()=>{UI.filter=b.dataset.filter;renderToday()});$('#prevDay').onclick=()=>{UI.dayOffset=(UI.dayOffset||0)-1;renderToday()};$('#nextDay').onclick=()=>{if(displayDay()>=DATE_HORIZON){toast(`日期范围目前只支持到 ${DATE_HORIZON}`);return}UI.dayOffset=(UI.dayOffset||0)+1;renderToday()};$('#inboxBtn').onclick=()=>switchView('inbox');document.querySelector('.icon-btn[title="搜索"]').onclick=openSearch;$('#closeDrawer').onclick=closeDrawer;$('#closeModal').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};$('#taskDrawer').onclick=e=>{if(e.target.id==='taskDrawer')closeDrawer()};$('#backWeekBtn').onclick=()=>switchView('calendar');$('#backTodayBtn').onclick=()=>{UI.selectedWeek=0;UI.dayOffset=0;switchView('calendar')};$('#addProjectBtn').onclick=newProject;$('#addProjectTopBtn').onclick=newProject;$('#addTaskBtn').onclick=newTask;$('#emptyAddBtn').onclick=newTask;$('#timelineAddProjectBtn').onclick=newProject;$('#createFixedBtn').onclick=fixedTask;$('#collectionSettingsBtn').onclick=collectionSettings;$('#forceAssignBtn').onclick=()=>switchView('projects');$('#runAutomationBtn').onclick=()=>act('scheduler.run',{});$('#markAllReadBtn').onclick=()=>act('inbox.read',{all:true});$('#generateSummaryBtn').onclick=openTodayDiary;
window.addEventListener('focus',()=>{if(UI.view==='inbox')refreshInboxState()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&UI.view==='inbox')refreshInboxState()});
if(location.protocol==='file:'){showAuth()}else{refresh()}

/* Embedded Agent UI: superadmin-managed OpenAI-compatible endpoint via server proxy. */
const AGENT_CONFIG_KEY='work-calendar-agent-config-v1';
const OPENCODE_GO_ENDPOINT='https://opencode.ai/zen/go/v1/chat/completions';
const OPENCODE_GO_MODELS=['glm-5.3-flash','glm-5.3','glm-5.2','glm-5.1','kimi-k3','kimi-k2.7-code','kimi-k2.6','longcat-2.0','deepseek-v4.1-flash','deepseek-v4-pro','deepseek-v4-flash','deepseek-v4-flash-vision-exp','mimo-v2.5','mimo-v2.5-pro','hy4-preview','hy3','grok-4.5'];
const agentState={messages:[],busy:false,sessionId:(globalThis.crypto?.randomUUID?.()||`wc-${Date.now()}-${Math.random().toString(36).slice(2)}`)};
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
  const role=c.role==='superadmin'?'superadmin':'普通成员';
  e.innerHTML=c.mode==='operator'?'<strong>superadmin Agent · 全局操作员</strong><br>可查询全局信息并执行管理操作；写入与审批动作需要确认。':'<strong>普通成员 Agent · 只读查询</strong><br>仅可查询你有权看到的工作信息，不能创建、指派、修改或审批。';
}
function agentAppend(role,content,kind=''){
  agentState.messages.push({role,content});
  const list=$('#agentMessages');if(!list)return;
  const el=document.createElement('div');el.className=`agent-message ${role==='user'?'user':'assistant'} ${kind}`;el.textContent=content;list.appendChild(el);list.scrollTop=list.scrollHeight;
}
function agentFormatTime(iso){try{return new Date(iso).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(_){return iso||''}}
function agentMessageNode(m){
  const node=document.createElement('div');
  if(m.role==='action'){
    const label=AGENT_ACTION_LABELS[m.action]||m.action||'操作';
    node.className='agent-message assistant agent-action-record';
    node.innerHTML=`<div class="agent-action-title">已执行 · ${escapeHTML(label)}</div><pre class="agent-action-payload">${escapeHTML(JSON.stringify(m.data||{},null,2))}</pre><small class="agent-time">${escapeHTML(agentFormatTime(m.createdAt))}</small>`;
    return node;
  }
  node.className=`agent-message ${m.role==='user'?'user':'assistant'}`;
  const text=document.createElement('span');text.textContent=m.content||'';node.appendChild(text);
  const stamp=document.createElement('small');stamp.className='agent-time';stamp.textContent=agentFormatTime(m.createdAt);node.appendChild(stamp);
  return node;
}
async function agentLoadOwnHistory(){
  try{
    const data=await api('/api/action',{action:'agent.history',data:{}});
    const messages=data.messages||[],list=$('#agentMessages');if(!list)return;
    list.innerHTML='';
    if(!messages.length){list.innerHTML='<div class="agent-message assistant"><span>你好，我可以帮你查询工作台信息。配置自定义 API 后，也可以接入你的模型。</span></div>';return}
    agentState.messages=messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role,content:m.content}));
    messages.forEach(m=>list.appendChild(agentMessageNode(m)));
    list.scrollTop=list.scrollHeight;
  }catch(_){}
}
async function agentShowHistory(){
  const admin=Boolean(S.user?.admin);
  openModal(`<div class="eyebrow">WORK AGENT · 工作记录</div><h2>AI 工作记录</h2><p class="muted">记录保留每个账户与助手的对话及已执行操作，仅本人与 superadmin 可见。</p>${admin?`<label class="form-field">查看账户<select id="agentHistoryUser">${S.users.map(u=>`<option value="${escapeHTML(u.id)}">${escapeHTML(u.id)}</option>`).join('')}</select></label>`:''}<div id="agentHistoryList" class="agent-history-list"></div><div class="modal-footer"><button class="secondary-btn" id="agentHistoryClear">清空记录</button><button class="primary-btn" id="agentHistoryClose">关闭</button></div>`);
  const target=()=>$('#agentHistoryUser')?.value||S.user.id;
  const load=async()=>{const box=$('#agentHistoryList');box.innerHTML='<p class="muted">正在加载…</p>';try{const data=await api('/api/action',{action:'agent.history',data:{userId:target()}});const msgs=data.messages||[];box.innerHTML='';if(!msgs.length){box.innerHTML='<p class="muted">该账户暂无 AI 工作记录。</p>';return}msgs.forEach(m=>box.appendChild(agentMessageNode(m)))}catch(e){box.innerHTML=`<p class="muted">加载失败：${escapeHTML(e.message||'')}</p>`}};
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
async function agentLoadServerConfig(){try{agentServerConfig=await api('/api/action',{action:'agent.config.get',data:{}})}catch(_){agentServerConfig=null}}
function agentExtractText(data){
  return data?.choices?.[0]?.message?.content||data?.choices?.[0]?.text||data?.message?.content||data?.message||data?.content||data?.text||'';
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
  'account.toggle':'停用/启用账户','request.manage':'处理协作邀请','report.manage':'管理日报',
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
function agentRenderAction(proposal){
  const list=$('#agentMessages');if(!list)return;
  const label=AGENT_ACTION_LABELS[proposal.action]||proposal.action;
  const payload=(proposal.data&&typeof proposal.data==='object')?proposal.data:{};
  const card=document.createElement('div');card.className='agent-message assistant agent-action';
  card.innerHTML=`<div class="agent-action-title">待确认操作 · ${escapeHTML(label)}</div><pre class="agent-action-payload">${escapeHTML(JSON.stringify(payload,null,2))}</pre><div class="agent-action-buttons"><button class="ghost-btn agent-action-cancel">取消</button><button class="primary-btn agent-action-confirm">确认执行</button></div>`;
  list.appendChild(card);list.scrollTop=list.scrollHeight;
  card.querySelector('.agent-action-cancel').onclick=()=>{card.remove()};
  card.querySelector('.agent-action-confirm').onclick=async e=>{
    const btn=e.currentTarget;btn.disabled=true;btn.textContent='执行中…';
    try{
      await api('/api/action',{action:'agent.execute',data:{action:proposal.action,data:payload,confirmed:true}});
      card.querySelector('.agent-action-buttons').innerHTML='<span class="agent-action-done">已执行</span>';
      await refresh();toast(`已${label}`);
      agentAppend('assistant',`已执行：${label}。`);
    }catch(err){btn.disabled=false;btn.textContent='确认执行';toast(err.message||'执行失败')}
  };
}
async function agentSubmit(){
  const input=$('#agentInput'),text=input?.value.trim();if(!text||agentState.busy)return;
  input.value='';agentAppend('user',text);agentState.busy=true;$('#agentSendBtn').disabled=true;$('#agentSendBtn').textContent='…';
  try{
    const context={role:S.agentCapabilities?.role||'member',mode:S.agentCapabilities?.mode||'readonly'};
    const rule=context.mode==='operator'?'用户要求改动数据时，按服务端约定输出单个 <action> 动作块，等待用户确认；不要声称已经执行完成。':'你是只读助手，不能创建、指派、修改或审批任何数据。';
    const answer=await agentRequest([{role:'system',content:`你是 Work Calendar 工作助手。当前账户角色：${context.role}，权限模式：${context.mode}。遵守服务端权限边界：${rule}`},...agentState.messages.map(x=>({role:x.role,content:x.content}))]);
    // Remove the pending user turn already echoed by agentAppend before parsing.
    const {clean,actions}=agentSplitActions(answer);
    if(clean)agentAppend('assistant',clean);
    if(actions.length){
      if(context.mode==='operator')actions.forEach(agentRenderAction);
      else agentAppend('assistant','当前账户为只读权限，无法执行该操作。','error');
    }else if(!clean){
      agentAppend('assistant','Agent 未返回可执行内容。','error');
    }
  }catch(e){agentAppend('assistant',e.message||'暂时无法连接 Agent 服务。','error')}
  finally{agentState.busy=false;$('#agentSendBtn').disabled=false;$('#agentSendBtn').textContent='发送';input.focus()}
}
function initAgentUI(){
  $('#agentBtn')?.addEventListener('click',async()=>{$('#agentPanel').classList.remove('hidden');renderAgentCapability();await agentLoadOwnHistory();await agentLoadServerConfig();$('#agentInput').focus()});
  $('#agentHistoryBtn')?.addEventListener('click',()=>agentShowHistory());
  $('#agentCloseBtn')?.addEventListener('click',()=>$('#agentPanel').classList.add('hidden'));
  $('#agentConfigBtn')?.addEventListener('click',()=>agentSetConfigVisible(true));
  $('#agentConfigClose')?.addEventListener('click',()=>agentSetConfigVisible(false));
  $('#agentProvider')?.addEventListener('change',()=>agentSyncProviderUI());
  $('#agentConfigSave')?.addEventListener('click',async()=>{const provider=$('#agentProvider').value,endpoint=$('#agentEndpoint').value.trim(),model=provider==='custom'?$('#agentCustomModel').value.trim():$('#agentModelSelect').value,apiKey=$('#agentApiKey').value.trim();if(!endpoint||!model){toast('请填写 API 地址和模型');return}try{const data=await api('/api/action',{action:'agent.config.set',data:{provider,baseUrl:endpoint,model,apiKey}});agentServerConfig=data;saveAgentConfig({provider,endpoint,model});agentSetConfigVisible(false);toast('Agent API 配置已保存（密钥仅保存在服务端）')}catch(e){toast(e.message||'保存失败')}});
  $('#agentConfigReset')?.addEventListener('click',()=>{saveAgentConfig({});agentServerConfig=null;agentSetConfigVisible(false);toast('已清除本机 Agent 配置；如需清除服务端密钥请重新保存')});
  $('#agentForm')?.addEventListener('submit',e=>{e.preventDefault();agentSubmit()});
  $('#agentInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();agentSubmit()}});
  renderAgentCapability();
}
initAgentUI();
function ensureAccountCreateButton(){const admin=Boolean(S.user?.admin),host=$('#accountsView .page-intro');if(!host)return;let b=$('#createAccountBtn');if(!b){b=document.createElement('button');b.id='createAccountBtn';b.className='secondary-btn';b.textContent='＋ 添加账户';host.appendChild(b)}b.onclick=createAccountDialog;b.classList.toggle('hidden',!admin)}
function createAccountDialog(){
  const adminCount=S.users.filter(u=>u.admin&&u.active).length;
  openModal(`<div class="eyebrow">账户管理 · 新建账户</div><h2>添加账户</h2><p class="muted">账户名 3–30 位字母数字，密码至少 6 位。可将新账户加入 superadmin 权限组。</p><label class="form-field">账户名<input id="newAccountName" autocomplete="off" placeholder="例如 zhangsan"></label><label class="form-field">初始密码<input id="newAccountPassword" type="password" autocomplete="new-password" placeholder="至少 6 位"></label><label class="danger-check" style="margin-top:12px"><input type="checkbox" id="newAccountAdmin"> 加入 superadmin 权限组（当前 ${adminCount} 个）——可管理全部项目、成员、审批与 AI 配置</label><div class="modal-footer"><button class="secondary-btn" id="cancelAction">取消</button><button class="primary-btn" id="confirmCreateAccount">创建账户</button></div>`);
  $('#cancelAction').onclick=closeModal;
  $('#confirmCreateAccount').onclick=async()=>{
    const username=$('#newAccountName').value.trim(),password=$('#newAccountPassword').value,isAdmin=$('#newAccountAdmin').checked;
    if(!username){toast('请填写账户名');return}
    if(password.length<6){toast('密码至少 6 位');return}
    try{await api('/api/action',{action:'account.create',data:{username,password,admin:isAdmin}});closeModal();await refresh();toast(isAdmin?`已创建 superadmin 账户 ${username}`:`已创建账户 ${username}`)}
    catch(e){toast(e.message||'创建失败')}
  };
}
setInterval(ensureAccountCreateButton,1000);
window.addEventListener('load',()=>setTimeout(ensureAccountCreateButton,200));
