const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const definitions = source.slice(0, source.indexOf("$$('.nav-item').forEach(b=>b.onclick="));

function app() {
  const context = vm.createContext({});
  vm.runInContext(definitions, context);
  return {context, run: code => vm.runInContext(code, context), json: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context))};
}

test('admin scope includes all assignees and fixed/personal/project tasks; selecting a member narrows it', () => {
  const a = app();
  a.run(`S.user={id:'superadmin',admin:1};S.tasks=[
    {id:'a',assignee:'test001',projectId:'p'},
    {id:'b',assignee:'test002',fixed:true},
    {id:'c',assignee:'test003',projectId:null},
    {id:'d',assignee:'superadmin'}];`);
  assert.deepEqual(a.json('scheduleTasks().map(t=>t.id)'), ['a','b','c','d']);
  a.run("UI.member='test002'");
  assert.deepEqual(a.json('scheduleTasks().map(t=>t.id)'), ['b']);
  a.run("UI.member='all'");
  assert.equal(a.run('scheduleTasks().length'), 4);
});

test('ordinary member schedule only contains their own arrangements; admin retains team scope', () => {
  const a = app();
  a.run(`S.today='2026-09-12';S.projects=[{id:'p',status:'active',start:'2026-09-01',end:'2026-09-30'}];S.tasks=[
    {id:'own-project',assignee:'test001',projectId:'p',date:'2026-09-12'},
    {id:'other-project',assignee:'test002',projectId:'p',date:'2026-09-12'},
    {id:'other-personal',assignee:'test002',projectId:null,date:'2026-09-12'}
  ];S.user={id:'test001',admin:0};UI.member='all';`);
  assert.deepEqual(a.json('scheduleTasks().map(t=>t.id)'), ['own-project']);
  a.run("S.user={id:'superadmin',admin:1};UI.member='all'");
  assert.deepEqual(a.json('scheduleTasks().map(t=>t.id)'), ['own-project','other-project','other-personal']);
  a.run("UI.member='test002'");
  assert.deepEqual(a.json('scheduleTasks().map(t=>t.id)'), ['other-project','other-personal']);
});

test('invitation workload count is aggregate and limited to the project period', () => {
  const a = app();
  a.run(`S.tasks=[
    {id:'inside',assignee:'test002',date:'2026-09-12'},
    {id:'inside2',assignee:'test002',date:'2026-09-30'},
    {id:'outside',assignee:'test002',date:'2026-10-01'},
    {id:'other',assignee:'test003',date:'2026-09-15'}
  ];`);
  assert.equal(a.run("memberTaskCount('test002',{start:'2026-09-01',end:'2026-09-30'})"),2);
  assert.equal(a.run("memberTaskCount('test003',{start:'2026-09-01',end:'2026-09-30'})"),1);
});

test('API refresh preserves same-user scope; switching accounts resets it', async () => {
  const a = app();
  a.run("S.user={id:'superadmin',admin:1};UI.member='test003';UI.view='timeline';UI.selectedWeek=1;renderAll=()=>{};");
  a.context.fetch = async () => ({ok:true,json:async()=>({user:{id:'superadmin',admin:1}})});
  await a.run('refresh()');
  assert.equal(a.run('UI.member'), 'test003');
  assert.equal(a.run('UI.view'), 'timeline');
  assert.equal(a.run('UI.selectedWeek'), 1);
  a.context.fetch = async () => ({ok:true,json:async()=>({user:{id:'test001',admin:0}})});
  await a.run('refresh()');
  assert.equal(a.run('UI.member'), 'all');
  assert.equal(a.run('UI.view'), 'calendar');
});

test('one project produces one range; inclusive dates align across month/year/leap-day boundaries', () => {
  const a = app();
  const rows = a.json(`timelineModel([
    {id:'year',name:'year',start:'2025-12-31',end:'2026-01-02'},
    {id:'one',name:'one',start:'2026-01-02',end:'2026-01-02'}
  ],'2026-01-01').rows`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].span, 3);
  assert.equal(rows[1].span, 1);
  assert.equal(rows[1].offset-rows[0].offset, 2);
  assert.equal(a.run("timelineModel([{name:'leap',start:'2024-02-28',end:'2024-03-01'}],'2024-02-29').rows[0].span"), 3);
});

test('long projects extend the shared axis; open projects retain no actual end', () => {
  const a = app();
  const model = a.json(`timelineModel([
    {name:'long',start:'2025-01-01',end:'2027-12-31'},
    {name:'open',start:'2026-09-12',end:null}
  ],'2026-09-12')`);
  assert.equal(a.run(`dateFromNumber(${model.start})`), '2025-01-01');
  assert.equal(a.run(`dateFromNumber(${model.end})`), '2028-01-14');
  assert.equal(model.rows[1].end, null);
  assert.equal(model.rows[1].openEnded, true);
  assert.equal(model.rows[1].offset+model.rows[1].span, model.days);
});

test('finished, archived, and expired projects are removed from timeline rows', () => {
  const a = app();
  const model = a.json(`timelineModel([
    {id:'done',name:'已完成',status:'done',start:'2026-08-01',end:'2026-08-20'},
    {id:'archived',name:'已归档',status:'archived',start:'2026-07-01',end:'2026-07-05'},
    {id:'expired',name:'已过期',status:'active',start:'2026-08-01',end:'2026-08-05'}
  ],'2026-09-12')`);
  assert.deepEqual(model.rows, []);
});

test('bad/reversed/missing dates have no misleading bar; empty state has a valid horizon', () => {
  const a = app();
  const model = a.json(`timelineModel([
    {name:'invalid',start:'2026-02-30',end:'2026-03-10'},
    {name:'reversed',start:'2026-03-10',end:'2026-03-01'},
    {name:'missing',end:null}
  ],'2026-09-12')`);
  assert.ok(model.rows.every(r=>r.invalid&&r.span===0));
  assert.equal(a.run("timelineModel([],'2026-09-12').days"), 98);
});

test('assignee and project markup escapes user-provided text', () => {
  const a = app();
  a.run("S.user={admin:1};S.projects=[]");
  const html = a.run(`taskCard({id:'a',name:'<img src=x>',assignee:'test001',priority:'P1',status:'todo',duration:30,date:'2026-09-12'})`);
  assert.ok(html.includes('&lt;img src=x&gt;'));
  assert.ok(html.includes('assignee-tag">test001'));
  assert.ok(!html.includes('<img'));
});

test('project operations are available to admin and project owner; assignees must be active confirmed members', () => {
  const a=app();
  a.run(`S.projects=[{id:'p',owner:'test001',status:'active',members:{test001:'accepted',test002:'accepted',test003:'pending',disabled:'accepted'}}];S.users=[{id:'test001',active:1},{id:'test002',active:1},{id:'test003',active:1},{id:'disabled',active:0}];`);
  for(const id of ['superadmin','test001','test002','test003']) {
    a.run(`S.user={id:'${id}',admin:${id==='superadmin'?1:0}}`);
    assert.equal(a.run('manageableProjects().length'), ['superadmin','test001'].includes(id)?1:0);
  }
  assert.deepEqual(a.json('projectAssignees(S.projects[0]).map(u=>u.id)'),['test001','test002']);
});

test('project tree places task actions under the parent and distinguishes admin from owner and collaborator', () => {
  const a=app(); const elements={};
  a.context.document={querySelector:s=>elements[s]||(elements[s]={}),querySelectorAll:()=>[]};
  a.run(`S.projects=[{id:'p',name:'Example project',owner:'test001',status:'active',members:{test001:'accepted',test002:'accepted'}}];S.users=[{id:'test001',active:1},{id:'test002',active:1},{id:'test003',active:1}];S.tasks=[{id:'t',projectId:'p',name:'Child task',assignee:'test002',priority:'P1',status:'todo',date:'2026-09-12'}];`);
  for(const id of ['superadmin','test001','test002']) {
    a.run(`S.user={id:'${id}',admin:${id==='superadmin'?1:0}};renderProjects()`);
    const html=elements['#projectGrid'].innerHTML;
    assert.ok(html.indexOf('Example project')<html.indexOf('Child task'));
    assert.equal(html.includes('assign-project-task'),id!=='test002');
    assert.equal(html.includes('add-project-task'),id!=='test002');
    assert.equal(html.includes('直接添加协作者'),id==='superadmin');
    assert.equal(html.includes('邀请协作者'),id==='test001');
  }
});

test('daily work renders one parent card per project with nested clickable task cards', () => {
  const a=app();
  a.run(`S.today='2026-09-12';S.user={id:'test001',admin:0};S.projects=[
    {id:'p1',name:'项目一',owner:'test001',status:'active',members:{test001:'accepted'}},
    {id:'old',name:'已结束',owner:'test001',status:'done',members:{test001:'accepted'}}
  ];S.tasks=[
    {id:'p1b',projectId:'p1',name:'普通子任务',assignee:'test001',priority:'P1',status:'todo',date:'2026-09-12',duration:20},
    {id:'p1a',projectId:'p1',name:'重要子任务',assignee:'test001',priority:'P0',status:'todo',date:'2026-09-12',duration:20},
    {id:'oldtask',projectId:'old',name:'已结束任务',assignee:'test001',priority:'P1',status:'todo',date:'2026-09-12',duration:20},
    {id:'fixed',projectId:null,name:'固定安排',assignee:'test001',priority:'P2',status:'todo',fixed:true,date:'2026-09-12',duration:20}
  ];`);
  const html=a.run('dailyTaskGroups(scheduleTasks().filter(t=>t.date===S.today))');
  assert.equal((html.match(/daily-project-card/g)||[]).length,2);
  assert.ok(html.includes('项目一')&&html.includes('固定安排'));
  assert.ok(!html.includes('已结束任务'));
  assert.ok(html.indexOf('重要子任务')<html.indexOf('普通子任务'));
  assert.ok(html.includes('data-id="p1a"'));
});

test('task approval statuses and reviewer controls are represented', () => {
  const a=app();
  assert.deepEqual(a.json("status({status:'pending_approval'})"), ['pending-approval','待审批']);
  assert.deepEqual(a.json("status({status:'rejected'})"), ['rejected','已驳回']);
  a.run(`S.user={id:'test001',admin:0};S.projects=[{id:'p',owner:'test002',status:'active'}];`);
  assert.equal(a.run("canReviewTask({id:'t',projectId:'p',assignee:'test001',status:'pending_approval'})"),false);
  a.run("S.user={id:'test002',admin:0}");
  assert.equal(a.run("canReviewTask({id:'t',projectId:'p',assignee:'test001',status:'pending_approval'})"),true);
  assert.equal(a.run("canReviewTask({id:'t',projectId:'p',assignee:'test002',status:'pending_approval'})"),true);
  a.run("S.user={id:'superadmin',admin:1}");
  assert.equal(a.run("canReviewTask({id:'t',projectId:'p',assignee:'test001',status:'pending_approval'})"),false);
});

test('task edit requests render for assignees and pending approval details resolve by request id', () => {
  const a=app();
  a.run(`S.today='2026-09-12';S.user={id:'test001',admin:0};S.projects=[{id:'p',name:'项目',owner:'test002',status:'active',start:'2026-09-01',end:'2026-09-30',members:{test001:'accepted',test002:'accepted'}}];S.tasks=[{id:'t',projectId:'p',name:'原任务',desc:'原描述',assignee:'test001',priority:'P1',status:'todo',date:'2026-09-12',deadline:'2026-09-12',duration:30}];S.editRequests=[];`);
  assert.equal(a.run('taskEditPending(S.tasks[0])'),false);
  a.run(`S.editRequests=[{id:'r1',taskId:'t',requester:'test001',approver:'test002',status:'pending',reason:'需求变化',changes:{date:'2026-09-15',assignee:'test002',duration:60}}];`);
  assert.equal(a.run('taskEditPending(S.tasks[0])'),true);
  const summary=a.run('renderEditRequestSummary(S.tasks[0])');
  assert.ok(summary.includes('待审批的修改申请')&&summary.includes('需求变化')&&summary.includes('2026-09-15'));
  a.run("S.user={id:'test001',admin:0};S.editRequests=[]");
  assert.equal(a.run('taskEditPending(S.tasks[0])'),false);
});

test('inbox renders task completion approvals only for the project owner', () => {
  const a=app();
  a.run(`S.user={id:'test002',admin:0};S.projects=[{id:'p',name:'项目',owner:'test002',status:'active'}];S.tasks=[{id:'t',projectId:'p',name:'任务',assignee:'test001',status:'pending_approval',date:'2026-09-12'}];S.notifications=[{id:'n',kind:'task_approval',title:'任务完成待审批',body:'请审批',reference:'t',createdAt:'2026-09-12',read:false}];S.requests=[];`);
  const els={}; const el=s=>els[s]||(els[s]={innerHTML:'',textContent:'',classList:{toggle(){}}});
  a.context.document={querySelector:el,querySelectorAll:()=>[]};
  const ownerHtml=a.run("(renderInbox(),document.querySelector('#inboxList').innerHTML)");
  assert.ok(ownerHtml.includes('approve-task-request'));
  a.run("S.user={id:'superadmin',admin:1}");
  const adminHtml=a.run("(renderInbox(),document.querySelector('#inboxList').innerHTML)");
  assert.ok(!adminHtml.includes('approve-task-request'));
});

test('inbox renders edit approval action for the request approver, including superadmin', () => {
  const a=app();
  a.run(`S.user={id:'superadmin',admin:1};S.projects=[{id:'p',name:'项目',owner:'test001',status:'active'}];S.tasks=[{id:'t',projectId:'p',name:'任务',assignee:'test001',status:'todo',date:'2026-09-12'}];S.editRequests=[{id:'er',taskId:'t',requester:'test001',approver:'superadmin',status:'pending',reason:'延期',changes:{deadline:'2026-09-15'}}];S.notifications=[{id:'n',kind:'task_edit_approval',title:'任务修改待审批',body:'延期',reference:'er',createdAt:'2026-09-12',read:false}];S.requests=[];`);
  const els={}; const el=s=>els[s]||(els[s]={innerHTML:'',textContent:'',classList:{toggle(){}}});
  a.context.document={querySelector:el,querySelectorAll:()=>[]};
  const html=a.run("(renderInbox(),document.querySelector('#inboxList').innerHTML)");
  assert.ok(html.includes('approve-edit-request'));
});

test('project completion is available to owner only after every child task is done', () => {
  const a=app();
  a.run(`S.user={id:'test001',admin:0};S.users=[];S.projects=[{id:'p',name:'项目',owner:'test001',status:'active',members:{test001:'accepted'}}];S.tasks=[{id:'t1',projectId:'p',name:'已完成',assignee:'test001',status:'done'}];`);
  assert.equal(a.run('projectTasksComplete(S.projects[0])'),true);
  a.run("S.tasks[0].status='todo'");
  assert.equal(a.run('projectTasksComplete(S.projects[0])'),false);
  a.run("S.tasks=[]");
  assert.equal(a.run('projectTasksComplete(S.projects[0])'),false);
});

test('project completion ignores deferred history when the carried task is done', () => {
  const a=app();
  a.run(`S.user={id:'test001',admin:0};S.projects=[{id:'p',name:'项目',owner:'test001',status:'active'}];S.tasks=[
    {id:'t1',projectId:'p',name:'递延前',assignee:'test002',status:'deferred',date:'2026-09-12'},
    {id:'t2',projectId:'p',name:'递延后',assignee:'test002',status:'done',date:'2026-09-13',originId:'t1'}];`);
  assert.equal(a.run('projectTasksComplete(S.projects[0])'),true);
  a.run("S.tasks[1].status='doing'");
  assert.equal(a.run('projectTasksComplete(S.projects[0])'),false);
});

test('project completion uses the latest occurrence when automatic carries share one origin', () => {
  const a=app();
  a.run(`S.user={id:'test001',admin:0};S.projects=[{id:'p',name:'项目',owner:'test001',status:'active'}];S.tasks=[
    {id:'t1',projectId:'p',status:'deferred',date:'2026-09-11'},
    {id:'t2',projectId:'p',status:'deferred',date:'2026-09-12',originId:'t1'},
    {id:'t3',projectId:'p',status:'done',date:'2026-09-13',originId:'t1'}];`);
  assert.equal(a.run('projectTasksComplete(S.projects[0])'),true);
});

test('owner project card exposes a report based completion request only when ready', () => {
  const a=app(); const elements={};
  const el=s=>elements[s]||(elements[s]={innerHTML:'',textContent:'',classList:{toggle(){}}});
  a.context.document={querySelector:el,querySelectorAll:()=>[]};
  a.run(`S.user={id:'test001',admin:0};S.users=[];S.projects=[{id:'p',name:'项目',owner:'test001',status:'active',members:{test001:'accepted'}}];S.tasks=[{id:'t1',projectId:'p',name:'已完成',assignee:'test001',status:'done'}];renderProjects()`);
  assert.ok(elements['#projectGrid'].innerHTML.includes('request-project-completion'));
  a.run("S.tasks[0].status='doing';renderProjects()");
  assert.ok(!elements['#projectGrid'].innerHTML.includes('request-project-completion'));
  assert.ok(elements['#projectGrid'].innerHTML.includes('完成全部子任务后可结项'));
});

test('project completion request opens a required report form before submitting', () => {
  const a=app(); const elements={};
  const el=s=>elements[s]||(elements[s]={innerHTML:'',value:'',classList:{remove(){},add(){},toggle(){}},addEventListener(){}});
  a.context.document={querySelector:el,querySelectorAll:()=>[]};
  a.run(`S.user={id:'test001',admin:0};S.projects=[{id:'p',name:'项目',owner:'test001',status:'active'}];S.tasks=[{id:'t',projectId:'p',status:'done'}];requestProjectCompletion('p')`);
  const html=elements['#modalContent'].innerHTML;
  assert.ok(html.includes('projectCompletionReport')&&html.includes('maxlength="10000"')&&html.includes('提交结项审批'));
});

test('achievement lifecycle includes completed project milestones and task ratio', () => {
  const a = app();
  const lifecycle = a.json(`achievementLifecycle({createdAt:'2026-08-01T09:00:00+08:00',start:'2026-08-02',completionRequestedAt:'2026-08-20T12:00:00+08:00',completedAt:'2026-08-21T10:00:00+08:00'},[
    {status:'done',date:'2026-08-19',completedAt:'2026-08-19T18:00:00+08:00'},
    {status:'done',date:'2026-08-20'},
    {status:'deferred',date:'2026-08-18'}
  ])`);
  assert.deepEqual(lifecycle.map(x=>x.label), ['创建','启动','子任务完成','结项申请','审批完成']);
  assert.equal(lifecycle[0].at, '2026-08-01');
  assert.equal(lifecycle[2].meta, '2/3');
  assert.equal(lifecycle[4].at, '2026-08-21');
});

test('achievement archive is superadmin-only and sorts latest completed first', () => {
  const a = app();
  a.run(`S.projects=[
    {id:'old',status:'done',completedAt:'2026-08-01T10:00:00+08:00'},
    {id:'new',status:'archived',completedAt:'2026-09-01T10:00:00+08:00'},
    {id:'active',status:'active',completedAt:'2026-09-02T10:00:00+08:00'}
  ]; S.user={id:'superadmin',admin:1};`);
  assert.deepEqual(a.json(`completedProjects().map(p=>p.id)`), ['new','old']);
  a.run(`S.user={id:'test001',admin:0}`);
  assert.deepEqual(a.json(`completedProjects()`), []);
});

test('account management groups superadmins and labels members by project role', () => {
  const a = app();
  a.run(`S.projects=[
    {id:'p1',name:'项目甲',owner:'test001',members:{test001:'accepted',test002:'accepted'}},
    {id:'p2',name:'项目乙',owner:'test003',members:{test003:'accepted'}}
  ];S.user={id:'superadmin',admin:1};S.users=[
    {id:'superadmin',admin:1,active:1},{id:'test001',admin:0,active:1},{id:'test002',admin:0,active:1}
  ];`);
  assert.equal(a.run("accountRoleLabel({id:'superadmin',admin:1,role:'superadmin',active:1})"), '全部项目、成员、审批、AI 配置与账户管理');
  assert.equal(a.run("accountRoleLabel({id:'boss',admin:1,role:'admin',active:1})"), '全部项目、成员、审批与 AI 配置（账户管理除外）');
  assert.equal(a.run("accountRoleLabel({id:'test001',admin:0,active:1})"), 'Owner：项目甲');
  assert.equal(a.run("accountRoleLabel({id:'test002',admin:0,active:1})"), '协作者：项目甲');
  assert.equal(a.run("accountRoleLabel({id:'promoted',admin:0,active:1})"), '暂无项目归属');
});

test('agent action envelopes are parsed and removed from the reply text', () => {
  const a = app();
  // The agent helpers live after the DOM-binding block, so load just the pure
  // parser slice to keep this a unit test.
  a.run(source.slice(source.indexOf('const AGENT_ACTION_LABELS'), source.indexOf('function agentRunOne')));
  const reply = a.json(`(()=>{
    const r=agentSplitActions('我准备创建任务。\\n<action>{"action":"task.create","data":{"name":"整理周报","assignee":"test001"}}</action>');
    return {clean:r.clean,action:r.actions[0]&&r.actions[0].action,name:r.actions[0]&&r.actions[0].data.name};
  })()`);
  assert.equal(reply.clean, '我准备创建任务。');
  assert.equal(reply.action, 'task.create');
  assert.equal(reply.name, '整理周报');
  const malformed = a.json(`(()=>{const r=agentSplitActions('无效动作 <action>not json</action>');return {clean:r.clean,count:r.actions.length}})()`);
  assert.equal(malformed.count, 0);
  assert.equal(malformed.clean, '无效动作');
  assert.equal(a.run("AGENT_ACTION_LABELS['task.create']"), '创建任务');
});
