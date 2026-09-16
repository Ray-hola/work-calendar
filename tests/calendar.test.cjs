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
  assert.ok(html.includes('assignee-tag" title="test001">test001'));
  assert.ok(!html.includes('<img'));
  // The account id also lands inside a title attribute, so a quote must not be
  // able to break out of the attribute and add its own handler.
  const evil = a.run(`taskCard({id:'b',name:'x',assignee:'te" onmouseover="alert(1)',priority:'P1',status:'todo',duration:30,date:'2026-09-12'})`);
  assert.ok(evil.includes('title="te&quot; onmouseover=&quot;alert(1)"'), '引号必须被转义，属性不得被闭合');
  assert.ok(!evil.includes('<img'));
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

test('workspace account menu lists the right entries per role and escapes names', () => {
  const a = app();
  const elements = {};
  const stub = () => ({innerHTML:'', classList:{contains:()=>false, toggle(){}}, setAttribute(){}, querySelectorAll:()=>[], addEventListener(){}});
  a.context.document = {querySelector:s=>elements[s]||(elements[s]=stub()), querySelectorAll:()=>[]};

  a.run("S.user={id:'boss',admin:1,role:'superadmin',active:1};S.users=[{id:'boss',admin:1,role:'superadmin',active:1,displayName:'老板'},{id:'m1',admin:0,role:'member',active:1,displayName:'<img src=x>'},{id:'m2',admin:0,role:'member',active:0,displayName:'已停用'}]");
  a.run('renderAccountMenu()');
  const admin = elements['#accountMenu'].innerHTML;
  assert.ok(admin.includes('账户管理'), 'superadmin 应看到账户管理入口');
  assert.ok(admin.includes('我的资料'), '应包含我的资料');
  assert.ok(admin.includes('修改密码'), '应包含修改密码');
  assert.ok(admin.includes('退出登录'), '应包含退出登录');
  assert.ok(admin.includes('切换账户'), '应列出其他账户');
  assert.ok(admin.includes('&lt;img src=x&gt;'), '中文名称必须被转义');
  assert.ok(!admin.includes('<img'), '不得注入标签');
  assert.ok(!admin.includes('已停用'), '停用账户不出现在切换列表');

  a.run("S.user={id:'m1',admin:0,role:'member',active:1};renderAccountMenu()");
  const member = elements['#accountMenu'].innerHTML;
  assert.ok(!member.includes('账户管理'), '普通成员不应看到账户管理');
  assert.ok(member.includes('我的资料'), '成员仍可编辑自己的资料');
});

/* The assistant used to end its whole run the moment one action was refused,
   so a model that proposed 给 wang00 建任务 before adding him to the project
   could never take the one step that would have fixed it.

   agentLoop sits past the sandbox cut-off, so it is lifted straight out of the
   source and given its collaborators as arguments. */
const AGENT_LOOP_SOURCE = source.match(/async function agentLoop\(context\)\{[\s\S]*?\n\}/)[0];
const AGENT_MAX_STEPS = Number(source.match(/const AGENT_MAX_STEPS=(\d+)/)[1]);
const AGENT_MAX_FAILURES = Number(source.match(/const AGENT_MAX_FAILURES=(\d+)/)[1]);
const AGENT_MAX_REPEATS = Number(source.match(/const AGENT_MAX_REPEATS=(\d+)/)[1]);
/* The pace is a standing switch beside the composer, remembered per browser,
   rather than a question the first card asks on every run. */
const STANDING_MODE_SWITCH = /const AGENT_MODE_KEY=/.test(source)
  && /function agentPref\(\)/.test(source)
  && /localStorage\.setItem\(AGENT_MODE_KEY/.test(source)
  && /agentState\.mode=agentPref\(\);/.test(source)
  && !/const chooses=agentState\.mode===null/.test(source);
const SPLIT_PLAN_SOURCE = source.match(/function agentSplitPlan\(text\)\{[\s\S]*?\n\}/)[0];
const splitPlan = new Function(SPLIT_PLAN_SOURCE + '\nreturn agentSplitPlan;')();

function agentHarness(queue, verdicts) {
  const trace = [];
  const state = {messages: [], steps: 0, failures: 0, autoRun: false, stop: false, pendingResolve: null};
  const append = (who, text) => trace.push(['say', String(text)]);
  const busy = () => {};
  const record = (display, forModel) => trace.push(['step', display, String(forModel)]);
  const next = async () => (queue.length ? queue.shift() : []);
  const runOne = async (proposal) => {
    const verdict = verdicts.shift() || 'ok';
    /* autoRun is deliberately left false throughout: the loop must keep going
       in step-by-step mode, where the user confirms every single card. */
    if (verdict === 'fail') { state.failures += 1; return {failed: true}; }
    if (verdict === 'cancel') { return {cancelled: true}; }
    trace.push(['ran', proposal.action]);
    return {label: proposal.action};
  };
  const loop = new Function(
    'agentState', 'agentAppend', 'agentUpdateBusy', 'agentNext', 'agentRunOne',
    'AGENT_MAX_STEPS', 'AGENT_MAX_FAILURES', 'AGENT_MAX_REPEATS', 'AGENT_ACTION_LABELS',
    AGENT_LOOP_SOURCE + '\nreturn agentLoop;'
  )(state, append, busy, next, runOne, AGENT_MAX_STEPS, AGENT_MAX_FAILURES, AGENT_MAX_REPEATS, {});
  return {
    loop,
    ran: () => trace.filter(x => x[0] === 'ran').map(x => x[1]),
    said: () => trace.filter(x => x[0] === 'say').map(x => x[1]),
    stepText: () => trace.filter(x => x[0] === 'step').map(x => x[2]).join('\n'),
  };
}

test('a refused action is fed back to the model, which can repair it and finish', async () => {
  const h = agentHarness(
    [[{action: 'task.create'}], [{action: 'project.invite'}], [{action: 'task.create'}], []],
    ['fail', 'ok', 'ok']);
  const steps = await h.loop({mode: 'operator'});
  assert.equal(steps, 3, '被拒也算一步，之后补救并重做，共三步');
  assert.deepEqual(h.ran(), ['project.invite', 'task.create'], '补救动作之后原动作应被重做');
});

test('a refusal is written into the transcript as a failed receipt for the model', () => {
  /* The receipt is composed in agentRunOne, not in the loop — pin the contract
     so a future edit cannot quietly turn a refusal back into a dead end. */
  const refusal = source.match(/catch\(err\)\{[\s\S]*?finish\(\{failed:true\}\);/);
  assert.ok(refusal, 'agentRunOne 的失败分支必须把结果交回循环而不是终结整轮');
  assert.ok(refusal[0].includes('【系统回执·失败】'), '失败必须作为回执发给模型');
  assert.ok(refusal[0].includes('不要重复提交同一个动作'), '回执要阻止模型原地重试');
});

test('a run survives a refusal but gives up once the failure budget is spent', async () => {
  const one = agentHarness([[{action: 'task.create'}], []], ['fail']);
  assert.equal(await one.loop({mode: 'operator'}), 1);
  assert.equal(one.said().some(t => t.includes('连续')), false, '单次被拒不该宣告放弃');

  /* Each proposal differs, otherwise the repeat detector would stop the run
     before the failure budget is spent. */
  const many = agentHarness(
    Array.from({length: 40}, (_, i) => [{action: 'task.create', data: {name: 't' + i}}]),
    Array(AGENT_MAX_FAILURES).fill('fail'));
  assert.equal(await many.loop({mode: 'operator'}), AGENT_MAX_FAILURES, '用尽失败额度后停手');
  assert.equal(many.said().some(t => t.includes(`连续 ${AGENT_MAX_FAILURES} 步`)), true,
    '应明确告知用户已停下');
});

test('cancelling the first card still stops the run outright', async () => {
  const h = agentHarness([[{action: 'task.create'}], [{action: 'project.create'}]], ['cancel']);
  assert.equal(await h.loop({mode: 'operator'}), 0);
  assert.deepEqual(h.ran(), []);
});

test('the run pace is a standing switch instead of a per-run question', () => {
  assert.ok(STANDING_MODE_SWITCH,
    '执行方式应做成常驻开关并记住，卡片不应每轮再问一次');
  assert.ok(AGENT_MAX_STEPS >= 100, '步数上限应远高于原来的 12');
});

test('planning parses a <plan> array and keeps it out of the reply text', () => {
  const {clean, plan} = splitPlan('我把它拆成两个任务。\n<plan>[{"name":"A","assignee":"wang00"},{"name":"B"}]</plan>');
  assert.deepEqual(plan.map(t => t.name), ['A', 'B'], '应解析出计划里的每一项');
  assert.ok(!clean.includes('<plan>'), '正文里不应残留计划块');
  assert.equal(clean, '我把它拆成两个任务。');
});

test('a malformed or non-array plan is ignored rather than half-applied', () => {
  assert.deepEqual(splitPlan('<plan>{"name":"不是数组"}</plan>').plan, [], '非数组应被忽略');
  assert.deepEqual(splitPlan('<plan>[{坏 JSON</plan>').plan, [], '坏 JSON 应被忽略');
  assert.deepEqual(splitPlan('<plan>[{"nope":1}]</plan>').plan, [], '没有任务名的条目应被丢掉');
  assert.deepEqual(splitPlan('一段没有计划块的回复').plan, []);
});

test('a long run is no longer cut short by the old step ceiling', async () => {
  const queue = Array.from({length: 40}, (_, i) => [{action: 'task.create', data: {name: 't' + i}}]);
  const h = agentHarness(queue, []);
  assert.equal(await h.loop({mode: 'operator'}), 40, '每一步都不同，应一直跑到模型不再提议');
});

test('a model stuck on the same action is stopped by the repeat detector', async () => {
  const h = agentHarness(Array.from({length: 40}, () => [{action: 'task.create'}]), []);
  const steps = await h.loop({mode: 'operator'});
  assert.equal(steps, AGENT_MAX_REPEATS + 1, '同一个动作只执行到重复上限');
  assert.ok(h.said().some(t => t.includes('卡住')), '应告诉用户模型卡住了');
});

test('the success receipt carries a data check the model must reconcile', () => {
  const receipt = source.match(/【系统回执】[\s\S]{0,400}?数据核对/);
  assert.ok(receipt, '成功回执必须附上数据核对');
  assert.ok(/先核对这一步有没有达到预期/.test(source), '回执应要求模型先核对再继续');
});

/* The room's body renderer sits past the sandbox cut-off, so it is lifted out
   of the source and given the handful of collaborators it needs. */
function liftFunction(name) {
  const fn = source.match(new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));
  if (fn) return fn[0];
  const single = source.match(new RegExp('const ' + name + '=[^\\n]*;'));
  if (single) return single[0];
  /* A const can also be built across several lines, e.g. a long prompt. */
  const multi = source.match(new RegExp('const ' + name + '=[\\s\\S]*?;\\n'));
  assert.ok(multi, '找不到 ' + name + '，测试切点需要更新');
  return multi[0];
}
const CHAT_EVERYONE = source.match(/const CHAT_EVERYONE='([^']*)'/)[1];
/* CHAT_URL_RE is a module-level const rather than a function parameter, so it
   has to travel with the functions that close over it. */
const CHAT_BODY_SOURCE = ['CHAT_URL_RE', 'chatMentionName', 'chatParseMentions', 'chatMentionsHTML',
                          'chatTrimUrl', 'chatSplitLinks', 'chatBodyHTML']
  .map(liftFunction).join('\n');

function chatRoom(users) {
  const a = app();
  a.run(`S.user={id:'superadmin',admin:1};S.users=${JSON.stringify(users)}`);
  const built = new Function('escapeHTML', 'nameOf', 'S', 'CHAT_EVERYONE',
    CHAT_BODY_SOURCE + '\nreturn {chatBodyHTML, chatParseMentions};')(
      a.run('escapeHTML'), a.run('nameOf'), a.run('S'), CHAT_EVERYONE);
  return {render: built.chatBodyHTML, mentions: built.chatParseMentions};
}

const PEOPLE = [{id: 'wang00', displayName: '王零零', active: 1},
                {id: 'superadmin', displayName: '管理员', active: 1}];

test('a pasted link becomes a link, and trailing punctuation stays outside it', () => {
  const room = chatRoom(PEOPLE);
  const html = room.render('详见 https://example.com/a/b?x=1&y=2，明天前给我');
  assert.ok(html.includes('<a class="chat-link" href="https://example.com/a/b?x=1&amp;y=2"'),
    '链接要成为 a 标签，& 要转义成实体：' + html);
  assert.ok(html.includes('rel="noopener noreferrer nofollow"'), '外链要有 rel 保护');
  assert.ok(html.includes('>https://example.com/a/b?x=1&amp;y=2</a>，明天前给我'),
    '中文句号应落在链接之外：' + html);
});

test('a bare www address is linkified over https, and a balanced bracket is kept', () => {
  const room = chatRoom(PEOPLE);
  const bare = room.render('看 www.example.com/x。');
  assert.ok(bare.includes('href="https://www.example.com/x"'), 'www 开头要补上协议：' + bare);

  const paren = room.render('参考 https://example.com/wiki/Foo_(bar)');
  assert.ok(paren.includes('href="https://example.com/wiki/Foo_(bar)"'),
    '成对的括号属于地址本身：' + paren);

  const wrap = room.render('（见 https://example.com/a）');
  assert.ok(wrap.includes('>https://example.com/a</a>）'), '不成对的括号应留在外面：' + wrap);
});

test('only http and www are linkified, so no other scheme slips through', () => {
  const room = chatRoom(PEOPLE);
  const html = room.render('javascript:alert(1) 和 ftp://example.com/x 都不是链接');
  assert.ok(!html.includes('<a'), '只有 http(s) 与 www 才该成为链接：' + html);
});

test('link text is escaped, so a URL cannot carry markup', () => {
  const room = chatRoom(PEOPLE);
  const html = room.render('https://example.com/<img src=x>');
  assert.ok(!html.includes('<img'), '链接里不得注入标签：' + html);
  assert.ok(html.includes('&lt;img'), '应当被转义：' + html);
});

test('mentions still highlight when they sit next to a link', () => {
  const room = chatRoom(PEOPLE);
  const html = room.render('@王零零 看 https://example.com/a');
  assert.ok(html.includes('chat-mention">@王零零</em>'), '提及要高亮：' + html);
  assert.ok(html.includes('class="chat-link"'), '链接要保留：' + html);
});

test('@所有人 is a broadcast sentinel rather than an account id', () => {
  const room = chatRoom(PEOPLE);
  assert.deepEqual(room.mentions('@所有人 下午三点评审'), [CHAT_EVERYONE]);
  const html = room.render('@所有人 注意');
  assert.ok(html.includes('chat-mention chat-mention-all">@所有人</em>'),
    '广播要有自己的样式：' + html);
  assert.ok(room.mentions('@王零零 看一下').includes('wang00'), '普通提及不受影响');
});

/* The conversation list sits past the sandbox cut-off, so its renderer is
   lifted out of the source and run inside the sandbox — that way it uses the
   real icon(), escapeHTML() and chatChannelList() rather than stubs. */
const CHAT_SIDE_SOURCE = ['chatChannelList', 'chatChannelUnread', 'chatClock', 'chatListTime',
                          'chatChannelMark', 'chatPreviewText', 'renderChatCurrent',
                          'renderChatChannels']
  .map(liftFunction).join('\n');

function chatSidebar(projects, unread, previews, channel) {
  const a = app();
  const elements = {};
  a.context.document = {
    querySelector: s => elements[s] || (elements[s] = {}),
    querySelectorAll: () => [],
  };
  a.run(`S.user={id:'superadmin',admin:1};S.projects=${JSON.stringify(projects)};
         S.users=[{id:'superadmin',displayName:'管理员',active:1},{id:'wang00',displayName:'王零零',active:1}];
         S.chat={byChannel:${JSON.stringify(unread)}};`);
  a.run(`var chatChannel=${JSON.stringify(channel)};var chatPreviews=${JSON.stringify(previews)};`);
  a.run(CHAT_SIDE_SOURCE);
  a.run('renderChatChannels()');
  return elements;
}

const SIDE_PROJECTS = [{id: 'live1', name: '市场周报', status: 'active'}];

test('the conversation list shows one row per room, with the unread on its own', () => {
  const el = chatSidebar(SIDE_PROJECTS, {lounge: 4, live1: 2}, {}, 'general');
  const html = el['#chatChannels'].innerHTML;
  assert.equal((html.match(/class="chat-channel /g) || []).length, 3, '两个固定频道 + 一个进行中项目');
  assert.ok(html.includes('>沟通<'), '沟通在列表里');
  assert.ok(html.includes('>闲聊<'), '闲聊在列表里');
  assert.ok(html.includes('>市场周报<'), '项目频道在列表里');
  /* The count belongs to the row that owns it, not to the whole room. */
  const rows = html.split('<button').slice(1);
  const general = rows.find(r => r.includes('>沟通<'));
  const lounge = rows.find(r => r.includes('>闲聊<'));
  const project = rows.find(r => r.includes('>市场周报<'));
  assert.ok(!general.includes('chat-channel-badge'), '没有未读的房间不显示数字');
  assert.ok(lounge.includes('chat-channel-badge">4<'), '闲聊显示自己的未读 4');
  assert.ok(project.includes('chat-channel-badge">2<'), '项目频道显示自己的未读 2');
});

test('the selected conversation is the only one marked active', () => {
  const el = chatSidebar(SIDE_PROJECTS, {}, {}, 'lounge');
  const html = el['#chatChannels'].innerHTML;
  const rows = html.split('<button').slice(1);
  const on = rows.filter(r => r.includes('is-on'));
  assert.equal(on.length, 1, '同时只能有一个选中的会话');
  assert.ok(on[0].includes('>闲聊<'), '选中的是闲聊');
  assert.equal(el['#chatCurrent'].textContent, '闲聊', '右侧标题跟着走');
});

test('each row previews its newest line, and flags your own words', () => {
  const previews = {
    general: {body: '看这个链接 https://example.com/a', author: 'wang00', createdAt: '2026-09-16T09:30:00+08:00'},
    lounge: {body: '我说的话', author: 'superadmin', createdAt: '2026-09-15T18:00:00+08:00'},
  };
  const el = chatSidebar(SIDE_PROJECTS, {}, previews, 'general');
  const html = el['#chatChannels'].innerHTML;
  assert.ok(html.includes('看这个链接'), '显示摘要');
  assert.ok(html.includes('我：我说的话'), '自己发的加「我：」前缀');
  assert.ok(html.includes('09:30'), '今天的消息显示时间');
  assert.ok(html.includes('昨天'), '昨天的消息显示「昨天」');
  assert.ok(html.includes('还没有消息'), '没有消息的房间给出提示而不是空白');
});

test('a preview cannot carry markup into the list', () => {
  const el = chatSidebar(SIDE_PROJECTS, {},
    {general: {body: '<img src=x onerror=alert(1)>', author: 'wang00', createdAt: '2026-09-16T09:30:00+08:00'}},
    'general');
  const html = el['#chatChannels'].innerHTML;
  assert.ok(!html.includes('<img'), '摘要里的标签要被转义：' + html);
  assert.ok(html.includes('&lt;img'), '应当以文本形式出现');
});

/* The badge is hidden while you are inside the room, so leaving it has to
   re-evaluate the count — otherwise it stays blank until the next poll. */
test('leaving the room refreshes the unread badge', () => {
  const body = source.match(/function switchView\(view\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/typeof updateChatDot==='function'/.test(body),
    'switchView 必须在切换视图时刷新未读徽标');
});

test('only one room is marked read at a time', () => {
  /* The read report names the room it is about; without a channel the server
     would fall back to the hall and clear the wrong conversation. */
  const read = source.match(/async function reportChatRead\(at\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/action:'chat\.read',data:\{at:at\|\|'',channel\}/.test(read),
    '已读上报必须带上当前房间');
  assert.ok(/delete byChannel\[channel\]/.test(read),
    '本地只清掉刚读过的那个房间');
});

/* renderChatMembers sits past the sandbox cut-off too, so it is lifted and run
   in the sandbox with a fake element sink. */
const CHAT_PRESENCE_SOURCE = ['CHAT_PRESENCE_SHOWN', 'chatClock', 'renderChatMembers']
  .map(liftFunction).join('\n');

function presenceStrip(presence) {
  const a = app();
  const elements = {};
  a.context.document = {
    querySelector: s => elements[s] || (elements[s] = {}),
    querySelectorAll: () => [],
  };
  a.run(`S.user={id:'superadmin',admin:1};S.users=[
    {id:'superadmin',displayName:'管理员',active:1},
    {id:'wang00',displayName:'王零零',active:1},
    {id:'linyujie',displayName:'林雨杰',active:1}];`);
  a.run(`var chatPresence=${JSON.stringify(presence)};`);
  a.run(CHAT_PRESENCE_SOURCE);
  a.run('renderChatMembers()');
  return elements['#chatMembers'].innerHTML;
}

test('the presence strip shows who is away, not only who is here', () => {
  const html = presenceStrip({
    superadmin: {at: '2026-09-16T19:00:00+08:00', online: true},
    wang00: {at: '', online: false},
    linyujie: {at: '2026-09-16T12:00:00+08:00', online: false},
  });
  assert.ok(html.includes('1/3 在线'), '应显示在线比例：' + html);
  assert.equal((html.match(/class="chat-presence /g) || []).length, 3, '三个人都要出现');
  assert.equal((html.match(/chat-presence is-on/g) || []).length, 1, '只有一个人是在线态');
  assert.ok(html.includes('还没来过'), '从没露过面的人要有说明');
  assert.ok(html.includes('最后活跃 12:00'), '离线的人显示最后活跃时间');
});

test('the online ones come first, however many there are', () => {
  const presence = {};
  for (let i = 0; i < 6; i++) {
    presence['m' + i] = {at: '2026-09-16T1' + i + ':00:00+08:00', online: i > 3};
  }
  presence.superadmin = {at: '2026-09-16T20:00:00+08:00', online: true};
  const html = presenceStrip(presence);
  /* i=4,5 are online in the fixture, plus superadmin. */
  assert.ok(html.startsWith('<span class="chat-online">3/7 在线</span>'), '先说清楚几个在线：' + html.slice(0, 90));
  const firstTwo = html.split('<span class="chat-presence ').slice(1, 3).join('');
  assert.equal((firstTwo.match(/is-on/g) || []).length, 2, '在线的排在最前');
});

test('leaving a project is offered to a collaborator, and is leaving the workspace', () => {
  assert.ok(/\(p\.members\|\|\{\}\)\[S\.user\.id\]==='accepted'/.test(source),
    '退出项目只给已经加入的协作者');
  assert.ok(/class="ghost-btn leave-project"/.test(source), '协作者要有退出入口');
  const fn = source.match(/function leaveProject\(projectId\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/project\.member\.remove/.test(fn), '退出走 project.member.remove');
  assert.ok(/chatChannel===projectId/.test(fn), '退出后要离开它在沟通区里的工作区');
});

test('the invite dialog also manages who is already on the project', () => {
  assert.ok(/id="currentMembers"/.test(source), '要列出当前协作者');
  assert.ok(/class="ghost-btn remove-member"/.test(source), '每位协作者旁要有移出按钮');
  assert.ok(/再点一次确认/.test(source), '移除是不可逆的，需要二次确认');
});

/* Planning is asked for with a mark at the head of the message. The parser and
   the system prompt sit past the sandbox cut-off, so they are lifted. */
const AGENT_PLAN_SOURCE = ['AGENT_PLAN_MARK', 'AGENT_PLAN_ALIASES', 'agentPlanIntent']
  .map(liftFunction).join('\n');

test('a mark at the head of a message is what makes it a planning request', () => {
  const a = app();
  a.run(AGENT_PLAN_SOURCE);
  const mark = a.run('AGENT_PLAN_MARK');

  assert.deepEqual(a.json(`agentPlanIntent(${JSON.stringify(mark + ' 下周把复盘做完')})`),
    {plan: true, body: '下周把复盘做完'});
  assert.deepEqual(a.json("agentPlanIntent('下周把复盘做完')"),
    {plan: false, body: '下周把复盘做完'}, '普通消息不受影响');

  /* 手打的别名一样认得出 */
  assert.equal(a.json("agentPlanIntent('/plan 排个计划')").plan, true);
  assert.deepEqual(a.json("agentPlanIntent('/plan 排个计划')").body, '排个计划');
  assert.equal(a.json("agentPlanIntent('[规划] 排个计划')").plan, true);

  /* 只点了按钮还没写内容 */
  const bare = a.json(`agentPlanIntent(${JSON.stringify(mark)})`);
  assert.equal(bare.plan, true, '光有标记也算进入了规划');
  assert.equal(bare.body, '', '正文为空');

  /* 标记出现在句子中间不算 */
  assert.equal(a.json(`agentPlanIntent('把 ${mark} 加进去')`).plan, false,
    '只有开头才算，句子中间的不算');
});

test('the planning rule rides in the system prompt, not around the message', () => {
  const a = app();
  a.run(['AGENT_PLAN_RULE', 'agentSystemPrompt'].map(liftFunction).join('\n'));

  const planning = a.run("agentSystemPrompt({role:'superadmin',mode:'operator'},true)");
  assert.ok(planning.includes('<plan>'), '规划时要求输出 <plan> 块');
  assert.ok(planning.includes('不要执行任何操作'), '明确说了这一步不动手');
  assert.ok(planning.includes('<action>'), '并点名禁止 <action>');

  const normal = a.run("agentSystemPrompt({role:'superadmin',mode:'operator'},false)");
  assert.ok(!normal.includes('<plan>'), '普通对话不该带上规划规则');
  assert.ok(normal.includes('<action>'), '普通对话仍然允许动作块');

  assert.ok(!/AGENT_PLAN_PROMPT/.test(source),
    '旧的「把提示词包在用户消息外面」的写法应已移除，否则记录里存的就是提示词而不是原话');
});

test('the composer toggle marks the message instead of sending it', () => {
  const toggle = source.match(/function agentTogglePlan\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/input\.value=AGENT_PLAN_MARK\+' '\+input\.value/.test(toggle),
    '点一下给输入框加上前缀');
  assert.ok(/input\.value=intent\.body/.test(toggle), '再点一下把前缀取下来');

  const submit = source.match(/async function agentSubmit\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/if\(intent\.plan\)\{input\.value='';agentSyncPlanButton\(\);return agentPlanSubmit\(intent\.body\)\}/.test(submit),
    '发送时读回前缀并转到规划');
  assert.ok(/async function agentPlanSubmit\(body\)/.test(source),
    '规划以正文为参数，不再自己去读输入框');
});

test('a planning message is labelled in the transcript and in reopened history', () => {
  const append = source.match(/function agentAppend\(role,content,kind='',intent=''\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/agentIntentChip\(intent\)/.test(append), '发出去的那条要带意图标签');
  assert.ok(!/el\.textContent=content/.test(append), '不能再用 textContent 覆盖整个气泡');

  const node = source.match(/function agentMessageNode\(m\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/agentPlanIntent\(m\.content\)/.test(node),
    '重新打开历史时同样认得出来，而不是把前缀当正文显示');

  assert.ok(/agentRenderEmptyState/.test(source), '空会话给出可以点的示例');
  assert.ok(/function agentSyncPlanButton\(\)/.test(source), '按钮状态要跟着输入框走');
});

/* One blank line in the transcript is enough to break the whole assistant: the
   proxy refuses an empty message, and the transcript is what gets replayed. */
test('a blank turn is never replayed to the proxy', () => {
  const recent = source.match(/function agentRecentMessages\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/\.filter\(x=>String\(x\.content\|\|''\)\.trim\(\)\)/.test(recent),
    '回放前要滤掉空内容');

  const history = source.match(/async function agentLoadOwnHistory\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/String\(m\.content\|\|''\)\.trim\(\)/.test(history),
    '载入历史时就不该把空行放进回放窗口');

  const step = source.match(/function agentRecordStep\([\s\S]*?\n\}/)[0];
  assert.ok(/if\(String\(forModel\|\|''\)\.trim\(\)\)/.test(step),
    '记录步骤回执时也不能推入空内容');
});
