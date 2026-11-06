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

test('directory drop animation respects reduced motion without skipping completion', async () => {
  const a=app(),durations=[];
  a.context.matchMedia=()=>({matches:true});
  a.context.target={animate:(frames,options)=>{
    durations.push(options.duration);return {finished:Promise.resolve()};
  }};
  await a.run("navAnimate(target,[{opacity:0},{opacity:1}],{duration:300,fill:'forwards'})");
  a.context.matchMedia=()=>({matches:false});
  await a.run("navAnimate(target,[{opacity:0},{opacity:1}],{duration:300})");
  assert.deepEqual(durations,[0,300]);
});

test('navigation preferences reject malformed storage and sanitize untrusted widths', () => {
  const a = app();
  a.context.localStorage = {getItem: () => JSON.stringify({
    main:{width:999,expanded:'250'}, project:{width:-1,expanded:220.4}, chat:{width:'64',expanded:308}
  })};
  assert.deepEqual(a.json('readNavigationLayout()'), {
    main:{width:360,expanded:null}, project:{width:56,expanded:220}, chat:{width:null,expanded:308}
  });
  for (const value of ['{broken', 'null', 'false', '[]']) {
    a.context.localStorage.getItem = () => value;
    assert.deepEqual(a.json('readNavigationLayout()'), {
      main:{width:null,expanded:null}, project:{width:null,expanded:null}, chat:{width:null,expanded:null}
    });
  }
  a.context.localStorage.getItem = () => {throw new Error('Storage denied')};
  assert.equal(a.run('readNavigationLayout().main.width'), null);
});

test('navigation widths preserve content space and restore desired widths after viewport clamps', () => {
  const a = app();
  assert.equal(a.run("navigationWidth('main',1440)"),248);
  assert.equal(a.run("navigationWidth('main',1180)"),216);
  assert.equal(a.run("navigationWidth('chat',1180)"),184);
  a.run('navigationLayout.main.width=350;navigationLayout.project.width=300');
  assert.equal(a.run("navigationWidth('main',800)"),310);
  assert.equal(a.run("navigationWidth('main',1440)"),350);
  assert.equal(a.run("navigationWidth('project',1440,600)"),260);
  assert.equal(a.run("navigationWidth('project',1440,1100)"),300);
  assert.equal(a.run('navigationLayout.project.width'),300);
});

test('project navigation reserves tablet content space and stacks only on phones', () => {
  const a = app();
  a.run('navigationLayout.project.width=280;navigationLayout.chat.width=278');
  assert.equal(a.run("navigationWidth('project',1181,390)"),56);
  assert.equal(a.run("navigationWidth('project',1180,390)"),56);
  assert.equal(a.run("navigationWidth('project',390,340)"),280);
  assert.equal(a.run("navigationWidth('chat',761,390)"),64);
  assert.equal(a.run("navigationWidth('chat',760,340)"),278);
});

test('collapsing restores the last useful expanded width even when browser storage is blocked', () => {
  const a = app();
  a.context.window = {innerWidth:1440};
  a.context.document = {querySelector:()=>null};
  const writes=[];
  a.context.localStorage = {setItem:(key,value)=>writes.push(JSON.parse(value))};
  a.run("setNavigationWidth('main',330);toggleNavigation('main')");
  assert.equal(a.run('navigationLayout.main.width'),72);
  assert.equal(a.run('navigationLayout.main.expanded'),330);
  a.run("toggleNavigation('main');setNavigationWidth('main',140);toggleNavigation('main');toggleNavigation('main')");
  assert.equal(a.run('navigationLayout.main.width'),330);
  assert.ok(writes.length>0);
  a.context.localStorage.setItem = () => {throw new Error('Storage denied')};
  a.run("setNavigationWidth('chat',999);toggleNavigation('chat');toggleNavigation('chat')");
  assert.equal(a.run('navigationLayout.chat.width'),320);
});

test('the first collapse on tablet remembers the responsive default width', () => {
  const a = app();
  a.context.window = {innerWidth:1024};
  a.context.document = {querySelector:()=>null};
  a.context.localStorage = {setItem:()=>{}};
  a.run("toggleNavigation('main');toggleNavigation('main');toggleNavigation('chat');toggleNavigation('chat')");
  assert.equal(a.run('navigationLayout.main.width'),216);
  assert.equal(a.run('navigationLayout.chat.width'),184);
});

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

test('a superseded deferral occurrence leaves the active board but stays in history', () => {
  const a = app();
  a.run(`S.user={id:'superadmin',admin:1};S.projects=[];UI.member='all';S.tasks=[
    {id:'old',assignee:'test002',status:'deferred',superseded:true,supersededBy:'new'},
    {id:'new',assignee:'test002',status:'todo',originId:'old'}];`);
  assert.deepEqual(a.json('scheduleTasks().map(t=>t.id)'), ['new']);
  assert.deepEqual(a.json('scheduleTasks(true).map(t=>t.id)'), ['old','new']);
  assert.equal(a.run('isSuperseded(S.tasks[0])'), true);
  assert.equal(a.run('isSuperseded(S.tasks[1])'), false);
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
  a.context.fetch = async () => ({ok:true,text:async()=>JSON.stringify({user:{id:'superadmin',admin:1}})});
  await a.run('refresh()');
  assert.equal(a.run('UI.member'), 'test003');
  assert.equal(a.run('UI.view'), 'timeline');
  assert.equal(a.run('UI.selectedWeek'), 1);
  a.context.fetch = async () => ({ok:true,text:async()=>JSON.stringify({user:{id:'test001',admin:0}})});
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

test('entry points follow the rule group: new, request, or not offered', () => {
  const a=app();
  a.run(`S.today='2026-11-02';S.user={id:'test002',admin:0};S.users=[];S.projects=[
    {id:'p',name:'甲',owner:'test001',status:'active',members:{test001:'accepted',test002:'accepted'}},
    {id:'q',name:'乙',owner:'test002',status:'active',members:{test002:'accepted'}},
    {id:'r',name:'丙',owner:'test003',status:'active',members:{test003:'accepted',test002:'pending'}}];
    S.creationRules={project:'approval',tempTask:'direct',projectTask:'none'};`);
  assert.equal(a.run('projectMode()'),'approval');
  // Your own project is always direct; a project you only collaborate on follows the group.
  assert.deepEqual(a.json('taskProjects().map(x=>[x.p.id,x.mode])'),[['q','direct']]);
  assert.equal(a.run('taskEntryMode()'),'direct');
  assert.ok(a.run("entryLabel('approval','项目')").endsWith('申请项目'));
  assert.ok(a.run("entryLabel('direct','任务')").endsWith('新任务'));
  a.run(`S.projects=S.projects.filter(p=>p.id!=='q');S.creationRules={project:'none',tempTask:'approval',projectTask:'approval'}`);
  assert.deepEqual(a.json('taskProjects().map(x=>[x.p.id,x.mode])'),[['p','approval']]);
  assert.equal(a.run('taskEntryMode()'),'approval');
  a.run(`S.creationRules={project:'none',tempTask:'none',projectTask:'none'}`);
  assert.equal(a.run('taskEntryMode()'),'none');
  // Requests: the project's Owner or an admin settles a project task, only an admin a one-off.
  a.run(`S.taskRequests=[{id:'a',status:'pending',projectId:'p',requester:'test002'},{id:'b',status:'pending',projectId:null,requester:'test002'},{id:'c',status:'approved',projectId:'p'}];S.user={id:'test001',admin:0}`);
  assert.deepEqual(a.json("['a','b','c'].map(id=>canReviewTaskRequest(taskRequestById(id)))"),[true,false,false]);
  a.run(`S.user={id:'superadmin',admin:1}`);
  assert.deepEqual(a.json("['a','b','c'].map(id=>canReviewTaskRequest(taskRequestById(id)))"),[true,true,false]);
  assert.equal(a.run('projectMode()'),'direct');
  assert.equal(a.run('taskEntryMode()'),'direct');
});

test('rule groups live in 系统设置: a list of groups, each made or changed on a card', () => {
  const list = liftFunction('renderCreationPolicy'), card = liftFunction('editRuleGroup'), item = liftFunction('renderAccountItem');
  assert.ok(/class="rule-row"/.test(list) && /editRuleGroup\(null\)/.test(list), '已有的规则组是列表，新建打开卡片');
  assert.ok(/class="rule-opt/.test(card) && /AGENT_ACCESS_LABELS/.test(card), '卡片上每条规则一键选择，含 AI 助手');
  assert.ok(/class="rule-person/.test(card) && /rulePickAll/.test(card), '成员直接在卡片上点选，可以全选');
  assert.ok(!/<select/.test(list + card), '规则组不用下拉框');
  assert.ok(!/group:/.test(item), '账户行的权限组下拉只剩 superadmin / admin / 普通用户');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(/<h3><span>规则组<\/span>/.test(html), '叫「规则组」，不和权限组混淆');
  const accounts = html.match(/<section id="accountsView"[\s\S]*?<\/section>/)[0], settings = html.match(/<section id="settingsView"[\s\S]*?(?=<section id="\w+View")/)[0];
  assert.ok(!/creationPolicy|automation-card/.test(accounts), '账户管理只留账户本身');
  assert.ok(/creationPolicy/.test(settings) && /collectionSchedule/.test(settings), '规则组和日记自动化都在系统设置');
});

test('every drafted card says what will happen to it before anything is sent', () => {
  const a=app();
  a.run(['PLAN_DAY','planDay','planUser','agentNewConversationId','agentTidyTaskName','planDraft','planTaskPath'].map(liftFunction).join('\n'));
  a.run(`S.today='2026-11-02';S.user={id:'test002',admin:0};S.users=[{id:'superadmin',admin:1,active:1},{id:'test001',active:1,displayName:'林一'},{id:'test002',active:1},{id:'test003',active:1}];
    S.projects=[{id:'p',name:'甲',owner:'test001',status:'active',members:{test001:'accepted',test002:'accepted'}},{id:'w',name:'待批',owner:'test002',status:'pending',members:{test002:'accepted'}}];
    S.creationRules={project:'approval',tempTask:'direct',projectTask:'none'};
    var board=planDraft({projects:[{ref:'P1',name:'复盘',members:['林一','ghost']}],tasks:[
      {name:'甲·整理数据',projectId:'p',assignee:'test003'},{name:'出初稿',projectRef:'P1'},{name:'自己看',assignee:'林一',date:'2020-01-01'},{name:'等审批',projectId:'w'}]});`);
  assert.deepEqual(a.json('board.projects[0].members'), ['test001'], '中文名换成账户，查无此人的丢掉');
  assert.equal(a.run('board.tasks[0].name'), '整理数据', '去掉项目名前缀');
  assert.equal(a.run('board.tasks[2].date'), '2026-11-02', '过去的日期挪到今天');
  assert.deepEqual(a.json('board.tasks.map(t=>planTaskPath(board,t).mode)'), ['none','wait','direct','wait'],
    '只协作的项目不允许、新项目要先审批、临时任务直接建、待批项目里的等着');
  assert.deepEqual(a.json('planTaskPath(board,board.tasks[2]).assignees'), ['test001','test002','test003'], '临时任务可按规则指派给成员');
  a.run(`S.user={id:'superadmin',admin:1};S.creationRules=null;board=planDraft({projects:[{ref:'P1',name:'复盘',owner:'test003',members:['test001']}],tasks:[{name:'出初稿',projectRef:'P1'}]})`);
  assert.equal(a.run('planTaskPath(board,board.tasks[0]).mode'), 'direct');
  assert.deepEqual(a.json('planTaskPath(board,board.tasks[0]).assignees'), ['test003','test001'], '管理员建的项目，Owner 和协作者都能接');
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

test('a project page places task actions under the project and distinguishes admin from owner and collaborator', () => {
  const a=app(); const elements={};
  a.context.document={querySelector:s=>elements[s]||(elements[s]={innerText:'',classList:{toggle(){}}}),querySelectorAll:()=>[]};
  a.run(`S.today='2026-11-04';S.notifications=[];S.projects=[{id:'p',name:'Example project',owner:'test001',status:'active',members:{test001:'accepted',test002:'accepted'}}];S.users=[{id:'test001',active:1},{id:'test002',active:1},{id:'test003',active:1}];S.tasks=[{id:'t',projectId:'p',name:'Child task',assignee:'test002',priority:'P1',status:'todo',date:'2026-09-12'}];`);
  for(const id of ['superadmin','test001','test002']) {
    a.run(`S.user={id:'${id}',admin:${id==='superadmin'?1:0}};UI.space='';renderProjects()`);
    const card=elements['#projectGrid'].innerHTML;
    assert.ok(card.includes('Example project')&&!card.includes('Child task')&&!card.includes('add-project-task'),
      '全部项目只列项目概要，任务和操作在项目页里');
    a.run("UI.space='p';renderProjects()");
    const html=elements['#projectSpace'].innerHTML;
    assert.ok(html.includes('Child task'));
    assert.equal(html.includes('assign-project-task'),id!=='test002');
    assert.equal(elements['#projectActions'].innerHTML.includes('primary-btn add-project-task'),id!=='test002');
    assert.equal(html.includes('添加协作者'),id!=='test002', 'Owner 和管理员都是直接加人，不再发邀请');
  }
});

test('project summaries label collaborator progress as personal instead of project completion',()=>{
  const a=app(),elements={};
  a.context.document={querySelector:s=>elements[s]||(elements[s]={innerHTML:'',classList:{toggle(){}}}),querySelectorAll:()=>[]};
  a.run(`S.today='2026-11-04';S.projects=[{id:'p',name:'项目',owner:'owner',status:'active',members:{owner:'accepted',member:'accepted'}}];
    S.users=[{id:'owner',active:1},{id:'member',active:1}];S.tasks=[
      {id:'done',projectId:'p',assignee:'member',status:'done',date:'2026-11-04'},
      {id:'todo',projectId:'p',assignee:'other',status:'todo',date:'2026-11-04'}];`);
  a.run("S.user={id:'owner',admin:false};renderProjects()");
  assert.match(elements['#projectGrid'].innerHTML,/项目 1\/2 完成/);
  a.run("S.user={id:'member',admin:false};renderProjects()");
  assert.match(elements['#projectGrid'].innerHTML,/我的任务 1\/1 完成/);
  assert.doesNotMatch(elements['#projectGrid'].innerHTML,/项目 1\/1 完成/);
});

test('project content tabs keep the dedicated meetings workspace and keyboard navigation',()=>{
  const a=app();
  const sourceText=source;
  assert.match(sourceText,/const SPACE_TABS=\{[^}]*meetings:'会议'/);
  assert.match(sourceText,/panel\('meetings',projectMeetings\(p/);
  assert.match(sourceText,/function bindProjectContentTabs\(\)/);
  assert.match(sourceText,/archive\?\['files','meetings'\]/,'归档项目只留文件和会议两个标签');
  assert.doesNotMatch(sourceText,/function bindSpaceTabs\(/,'同名 tab binder 不能覆盖会议空间入口');
  const binder=sourceText.match(/function bindProjectContentTabs\(\)\{[\s\S]*?\n\}/)[0];
  assert.match(binder,/ArrowRight/);assert.match(binder,/ArrowLeft/);assert.match(binder,/Home/);assert.match(binder,/End/);
  assert.match(sourceText,/bindProjectSpace\(p\);bindMeetingList\(p\);bindProjectContentTabs\(\)/,'归档会议也要能打开只读详情');
});

test('project lifecycle labels collaborator task progress as personal',()=>{
  const a=app();
  a.run(`S.today='2026-11-04';S.user={id:'member',admin:false};S.tasks=[
    {id:'done',projectId:'p',assignee:'member',status:'done',date:'2026-11-04'},
    {id:'todo',projectId:'p',assignee:'other',status:'todo',date:'2026-11-04'}];`);
  const html=a.run("projectLifecycle({id:'p',owner:'owner',start:'2026-11-01',end:'2026-11-30',status:'active'},false)");
  assert.match(html,/我的任务/);assert.doesNotMatch(html,/>任务<\/span>/);
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

test('legacy approval statuses still read in people\'s words', () => {
  const a=app();
  assert.deepEqual(a.json("status({status:'pending_approval'})"), ['pending-approval','待审批']);
  assert.deepEqual(a.json("status({status:'rejected'})"), ['rejected','已驳回']);
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

test('inbox offers no task approval now that finishing a task needs none', () => {
  const a=app();
  a.run(`S.user={id:'test002',admin:0};S.projects=[{id:'p',name:'项目',owner:'test002',status:'active'}];S.tasks=[{id:'t',projectId:'p',name:'任务',assignee:'test001',status:'pending_approval',date:'2026-09-12'}];S.notifications=[{id:'n',kind:'task_approval',title:'任务完成待审批',body:'请审批',reference:'t',createdAt:'2026-09-12',read:false}];S.requests=[];`);
  const els={}; const el=s=>els[s]||(els[s]={innerHTML:'',textContent:'',classList:{toggle(){}}});
  a.context.document={querySelector:el,querySelectorAll:()=>[]};
  const ownerHtml=a.run("(renderInbox(),document.querySelector('#inboxList').innerHTML)");
  assert.ok(ownerHtml.includes('任务完成待审批'), '旧通知仍然列出');
  assert.ok(!ownerHtml.includes('approve-task-request')&&!ownerHtml.includes('reject-task-request'));
});

test('notices can be deleted from the inbox, invitations cannot', () => {
  const a=app();
  a.run(`S.user={id:'test002',admin:0};S.projects=[{id:'p',name:'项目',owner:'test001',status:'active'}];S.tasks=[];
         S.notifications=[{id:'n1',kind:'task',title:'任务被调整',body:'改期',createdAt:'2026-09-12',read:true},{id:'n2',kind:'brief',title:'团队日报',body:'摘要',reference:'brief:2026-09-11',createdAt:'2026-09-12',read:false}];
         S.requests=[{id:'r1',projectId:'p',status:'pending',read:false,createdAt:'2026-09-12'}];`);
  const els={}; const el=s=>els[s]||(els[s]={innerHTML:'',textContent:'',classList:{toggle(){}}});
  a.context.document={querySelector:el,querySelectorAll:()=>[]};
  const html=a.run("(renderInbox(),document.querySelector('#inboxList').innerHTML)");
  assert.ok(html.includes('data-delete="n1"')&&html.includes('data-delete="n2"'), '每条通知都能删');
  assert.equal((html.match(/data-delete=/g)||[]).length, 2, '协作邀请没有删除按钮');
  // In 管理 mode the cards carry a checkbox instead, and the toolbar counts what is picked.
  const managed=a.run("(UI.inboxManage=true,UI.inboxPicked=new Set(['n2']),renderInbox(),document.querySelector('#inboxList').innerHTML)");
  assert.equal((managed.match(/class="inbox-pick"/g)||[]).length, 2);
  assert.ok(!managed.includes('data-delete='));
  assert.ok(els['#inboxToolbar'].innerHTML.includes('已选 1 条'));
});

test('the archive files briefs into month boxes, newest first', () => {
  const a=app();
  const drawers=a.json(`archiveDrawers([{date:'2026-09-30'},{date:'2026-10-02'},{date:'2026-10-28'},{date:'2026-09-01'}]).map(d=>[d.month,d.files.map(f=>f.date)])`);
  assert.deepEqual(drawers, [['2026-10',['2026-10-28','2026-10-02']],['2026-09',['2026-09-30','2026-09-01']]]);
  const folder=a.run(`archiveFile({date:'2026-10-28',totals:{completed:3,tasks:4,load:90,members:2,projects:1},riskCount:2},5)`);
  assert.ok(folder.includes('--i:5;--tab:1')&&folder.includes('<b>28</b>周三')&&folder.includes('完成 3/4 项 · 1.5h')&&folder.includes('2 条关注'));
  // One box a month: the picked folder is marked, the newest stands at the front.
  const box=a.run(`archiveBox('2026-10',[{date:'2026-10-28'},{date:'2026-10-02'}],'2026-10-02')`);
  assert.ok(box.includes('--n:2')&&box.indexOf('2026-10-28')<box.indexOf('2026-10-02')&&box.includes('<b>10 月</b>'));
  assert.equal((box.match(/is-picked/g)||[]).length,1);
  assert.ok(box.includes('archive-file is-picked" data-date="2026-10-02"'));
  // Ruler ticks sit at their day of the month, so 1st and 31st reach the ends.
  const ruler=a.run(`archiveRuler('2026-10',[{date:'2026-10-31'},{date:'2026-10-16'},{date:'2026-10-01'}],'2026-10-16')`);
  assert.ok(ruler.includes('--at:100.00%')&&ruler.includes('--at:50.00%')&&ruler.includes('--at:0.00%'));
  assert.ok(ruler.includes('aria-valuemax="31"')&&ruler.includes('aria-valuenow="16"')&&ruler.includes('ruler-tick is-picked" data-date="2026-10-16"'));
  // The pointer stands on the picked tick and carries its day.
  assert.ok(ruler.includes('class="ruler-pointer" style="--at:50.00%"><b>16 周五</b>'));
  const doc=a.run(`briefDocument({date:'2026-10-28',content:{totals:{completed:3,tasks:4,load:90,members:2,projects:1},risks:['<b>风险</b>'],projects:[],members:[{name:'王二',completed:3,tasks:4,load:90,source:'diary',summary:{done:'联调',next:'上线'}}]}})`);
  assert.ok(doc.includes('2026年10月28日 · 周三')&&doc.includes('本人日记')&&doc.includes('<dt>完成</dt><dd>联调</dd>'));
  assert.ok(!doc.includes('<b>风险</b>'), '档案内容要转义');
});

test('日记 and 档案室 are one 档案室: members file their own days, admins the team briefs', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(!/data-view="summary"|id="summaryView"/.test(html), '日记栏没有了');
  assert.ok(/<button class="nav-item" data-view="archive">/.test(html), '档案室人人都有');
  const a = app();
  a.run(`S.today='2026-11-02';S.user={id:'test002',admin:0};S.users=[{id:'test002',active:1}];S.projects=[];
    S.tasks=[{id:'a',name:'联调',assignee:'test002',date:'2026-11-02',status:'done',duration:60},{id:'b',name:'写文档',assignee:'test002',date:'2026-11-02',status:'todo',duration:30},{id:'c',name:'上线',assignee:'test002',date:'2026-11-03',status:'todo',duration:30}];
    S.diaries=[{author:'test002',date:'2026-10-30',content:{done:'自己写的'}},{author:'test002',date:'2026-10-31',auto:true,content:{done:'系统'}},{author:'other',date:'2026-10-29',content:{}}];
    S.diaryStats=[];S.reports=[{kind:'brief',date:'2026-11-01'}];`);
  const cards = a.json('archiveCards().map(c=>[c.date,c.kind,c.source])').sort();
  assert.deepEqual(cards, [['2026-10-30','diary','manual'],['2026-10-31','diary','auto'],['2026-11-02','diary','draft']], '只有自己的，今天总在');
  assert.deepEqual(a.json("diaryContent('test002','2026-11-02')"), {done:'✓ 联调', risks:'写文档（未完成）', next:'上线'}, '没写过的一天按当天工作套好模板');
  const page = a.run("diaryDocument('2026-11-02')");
  assert.ok(/<h3>随记<\/h3><div class="doc-edit"[^>]*data-field="note" data-placeholder="[^"]+"><\/div>/.test(page),
    '三块之外还有一块空白随记');
  assert.ok(page.indexOf('随记') > page.indexOf('明日计划') && page.indexOf('随记') < page.indexOf('工作日志'));
  a.run("S.diaries.push({author:'test002',date:'2026-11-01',content:{done:'x',note:'今天想清楚了一件事'}})");
  assert.ok(/data-field="note"[^>]*>今天想清楚了一件事</.test(a.run("diaryDocument('2026-11-01')")), '写过的随记原样回来');
  assert.ok(/今天 · 11月2日/.test(a.run("archiveFile(archiveCards().find(c=>c.date==='2026-11-02'),0)")));
  a.run("S.user={id:'superadmin',admin:1}");
  assert.deepEqual(a.json('archiveCards().map(c=>c.date)'), ['2026-11-01'], '管理员的档案是团队日报');
  const brief = {date:'2026-11-01',content:{totals:{completed:1,tasks:2,load:60,members:1,projects:1},risks:['要定版'],projects:[{id:'p',name:'官网',owner:'test001',source:'auto',completed:1,tasks:2,content:{done:'首页'}}],members:[{id:'test002',name:'王二',completed:1,tasks:2,load:60,source:'auto',summary:{done:'联调'},edited:true}]}};
  const editable = a.run(`briefDocument(${JSON.stringify(brief)},true)`);
  assert.ok(/class="doc-edit" contenteditable="plaintext-only"[^>]*data-scope="risks"/.test(editable), '需要关注可以直接改');
  assert.ok(/data-scope="members" data-id="test002" data-field="done">联调/.test(editable) && /data-scope="projects" data-id="p" data-field="progress">/.test(editable), '每一块都能改，空的也能补');
  assert.ok(/已改/.test(editable));
  assert.ok(!/contenteditable/.test(a.run(`briefDocument(${JSON.stringify(brief)})`)), '导出和只读时是原样');
  const week = a.run(`weekReportDocument({start:'2026-10-31',end:'2026-11-06',briefs:[${JSON.stringify(brief)}],work:{asOf:'2026-11-06',completedProjects:[{name:'官网改版',ownerName:'王二',members:['王二','王三'],completedOn:'2026-11-02',summary:'本周完成官网改版。项目内容：更新首页。完成情况：验收上线'}],unfinishedProjects:[{name:'验收项目',ownerName:'王三',description:'接口验收',status:'active',remaining:[{name:'最终验证',remaining:'补齐验证',reason:'环境未好',scheduledOn:'2026-11-09'}]}]}})`);
  assert.match(week,/这周做了什么/);assert.match(week,/还有什么没做/);
  for(const value of ['官网改版','更新首页','验收上线','验收项目','最终验证','环境未好','王三'])assert.ok(week.includes(value));
  assert.match(week,/data-week="1" disabled/);assert.match(week,/data-date="2026-11-01"/);
  assert.doesNotMatch(week,/大家的反馈|完成实际工时|成员本周|项目本周/);

});

test('inbox renders edit approval action for the request approver, including superadmin', () => {
  const a=app();
  a.run(`S.user={id:'superadmin',admin:1};S.projects=[{id:'p',name:'项目',owner:'test001',status:'active'}];S.tasks=[{id:'t',projectId:'p',name:'任务',assignee:'test001',status:'todo',date:'2026-09-12'}];S.editRequests=[{id:'er',taskId:'t',requester:'test001',approver:'superadmin',status:'pending',reason:'延期',changes:{deadline:'2026-09-15'}}];S.notifications=[{id:'n',kind:'task_edit_approval',title:'任务修改待审批',body:'延期',reference:'er',createdAt:'2026-09-12',read:false}];S.requests=[];`);
  const els={}; const el=s=>els[s]||(els[s]={innerHTML:'',textContent:'',classList:{toggle(){}}});
  a.context.document={querySelector:el,querySelectorAll:()=>[]};
  const html=a.run("(renderInbox(),document.querySelector('#inboxList').innerHTML)");
  assert.ok(html.includes('approve-edit-request'));
});

test('a running project offers 完成项目 to its Owner and the admins, finished or not', () => {
  const a=app(); const elements={};
  const el=s=>elements[s]||(elements[s]={innerHTML:'',textContent:'',innerText:'',classList:{toggle(){}}});
  a.context.document={querySelector:el,querySelectorAll:()=>[]};
  a.run(`S.today='2026-11-04';S.notifications=[];S.user={id:'test001',admin:0};S.users=[];S.projects=[{id:'p',name:'项目',owner:'test001',status:'active',
    members:{test001:'accepted',test002:'accepted'}}];
    S.tasks=[{id:'t1',projectId:'p',name:'已完成',assignee:'test001',status:'done'}];UI.space='p';renderProjects()`);
  assert.ok(elements['#projectActions'].innerHTML.includes('request-project-completion'));
  a.run("S.tasks[0].status='doing';renderProjects()");
  assert.ok(/request-project-completion[^>]*>.*完成项目/.test(elements['#projectActions'].innerHTML), '没做完也能提前完成');
  a.run("S.user={id:'test002',admin:0};renderProjects()");
  assert.ok(!elements['#projectActions'].innerHTML.includes('request-project-completion'), '协作者没有这个按钮');
  a.run("S.user={id:'superadmin',admin:1};renderProjects()");
  assert.ok(elements['#projectActions'].innerHTML.includes('request-project-completion'));
});

test('project completion request opens a required report form before submitting', () => {
  const a=app(); const elements={};
  const el=s=>elements[s]||(elements[s]={innerHTML:'',value:'',classList:{remove(){},add(){},toggle(){},contains(){return true}},addEventListener(){}});
  a.context.document={querySelector:el,querySelectorAll:()=>[]};
  a.run(`S.today='2026-11-02';S.user={id:'test001',admin:0};
    S.projects=[{id:'p',name:'项目',owner:'test001',status:'active',end:'2026-11-30'}];
    S.tasks=[{id:'t',projectId:'p',name:'收尾',status:'done'},{id:'u',projectId:'p',name:'还在做',status:'doing'}];
    requestProjectCompletion('p')`);
  const html=elements['#modalContent'].innerHTML;
  assert.ok(html.includes('projectCompletionReport')&&html.includes('maxlength="10000"')&&html.includes('提交结项审批'));
  assert.ok(html.includes('提前完成项目')&&/还有 1 项任务没完成/.test(html)&&html.includes('还在做'), '提前结项时说清楚剩下什么');
  a.run("S.user={id:'superadmin',admin:1};requestProjectCompletion('p')");
  const adminForm=elements['#modalContent'].innerHTML;
  assert.ok(/>完成项目<\/button>/.test(adminForm)&&adminForm.includes('可留空'), '管理员直接完成');
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

test('identity is only the 权限组, rows keep the dragged order and carry no per-row actions', () => {
  const a = app();
  a.run(`S.projects=[
    {id:'p1',name:'项目甲',owner:'test001',members:{test001:'accepted',test002:'accepted'}}
  ];S.user={id:'superadmin',admin:1,role:'superadmin'};S.users=[
    {id:'superadmin',admin:1,role:'superadmin',active:1},{id:'test001',admin:0,role:'member',active:1},{id:'test002',admin:0,role:'member',active:0},{id:'test003',admin:0,role:'member',active:1}
  ];S.accountOrder=['test003','test001'];`);
  assert.equal(a.run("accountRoleLabel(S.users[0])"), 'superadmin');
  assert.equal(a.run("accountRoleLabel({id:'boss',admin:1,role:'admin',active:1})"), 'admin');
  assert.equal(a.run("accountRoleLabel(S.users[1])"), '普通用户', '做项目 Owner 不是身份');
  assert.deepEqual(a.json("sortedAccounts(S.users.filter(u=>u.role==='member')).map(u=>u.id)"), ['test003', 'test001', 'test002'],
    '按拖出来的顺序，没排过的接在后面');
  const row = a.run("renderAccountItem(S.users[2],true,false)");
  assert.ok(/account-grip/.test(row), 'superadmin 有拖动把手');
  assert.ok(/已停用/.test(row));
  assert.ok(!/Owner|协作者|切换|重置密码|删除/.test(row), '行里不再有项目身份和逐个操作的按钮');
  const picking = a.run("UI.accountPicked=new Set(['test001']);renderAccountItem(S.users[1],true,true)");
  assert.ok(/account-pick/.test(picking) && /checked/.test(picking) && !/account-grip/.test(picking), '管理模式下改成勾选');
  assert.ok(!/account-grip/.test(a.run("renderAccountItem(S.users[1],false,false)")), '不是 superadmin 不能拖');
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
  // Only accounts that signed in on this browser are offered for switching.
  const stored = {'wc-accounts': JSON.stringify(['boss','m1','m2'])};
  a.context.localStorage = {getItem:k=>stored[k]??null, setItem:(k,v)=>{stored[k]=String(v)}};

  a.run("S.user={id:'boss',admin:1,role:'superadmin',active:1};S.users=[{id:'boss',admin:1,role:'superadmin',active:1,displayName:'老板'},{id:'m1',admin:0,role:'member',active:1,displayName:'<img src=x>'},{id:'m2',admin:0,role:'member',active:0,displayName:'已停用'},{id:'m3',admin:0,role:'member',active:1,displayName:'别处登录'}]");
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
  assert.ok(!admin.includes('别处登录'), '没在本浏览器登录过的账户不出现在切换列表');
  assert.ok(admin.includes('登录其他账户'), '可以登录列表外的账户');

  a.run("rememberAccount('m3')");
  assert.deepEqual(JSON.parse(stored['wc-accounts']).slice(0, 2), ['m3', 'boss']);
  a.run('renderAccountMenu()');
  assert.ok(elements['#accountMenu'].innerHTML.includes('别处登录'), '登录过后就能切换回来');

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

/* Built rather than written out, so the tags survive any tooling that strips
   tag-like text from a source file. */
const PLAN = body => '<plan>' + body + '</plan>';

test('planning parses a drafted plan of projects and tasks and keeps it out of the reply text', () => {
  const {clean, projects, tasks} = splitPlan('拆成一个项目、两个任务。\n' + PLAN('{"projects":[{"ref":"P1","name":"复盘"}],"tasks":[{"name":"A","projectRef":"P1","assignee":"wang00"},{"name":"B"}]}'));
  assert.deepEqual(projects.map(p => p.name), ['复盘'], '应解析出起草的项目');
  assert.deepEqual(tasks.map(t => t.name), ['A', 'B'], '应解析出计划里的每个任务');
  assert.ok(!clean.includes(PLAN('').slice(0, 6)), '正文里不应残留计划块');
  assert.equal(clean, '拆成一个项目、两个任务。');
  /* 旧格式（只有任务的数组）照样认得 */
  assert.deepEqual(splitPlan(PLAN('[{"name":"A"},{"name":"B"}]')).tasks.map(t => t.name), ['A', 'B']);
});

test('a malformed plan is ignored rather than half-applied', () => {
  const cards = text => { const d = splitPlan(text); return [...d.projects, ...d.tasks]; };
  assert.deepEqual(cards(PLAN('{"name":"既不是数组也没有 tasks"}')), [], '没有 projects/tasks 的对象应被忽略');
  assert.deepEqual(cards(PLAN('[{坏 JSON')), [], '坏 JSON 应被忽略');
  assert.equal(cards(PLAN('{"tasks":[{"nope":1}],"projects":[{"name":"  "}]}')).length, 2, '不完整卡片保留给用户补齐');
  assert.deepEqual(cards('一段没有计划块的回复'), []);
  assert.deepEqual(splitPlan('```json\n{"tasks":[{"name":"复盘"}]}\n```').tasks.map(t=>t.name), ['复盘'], 'JSON 围栏可恢复成卡片');
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
  /* The list stamps against the real clock, so the two messages are dated
     today and yesterday rather than on fixed days that go stale. */
  const today = new Date(); today.setHours(9, 30, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(18, 0, 0, 0);
  const previews = {
    general: {body: '看这个链接 https://example.com/a', author: 'wang00', createdAt: today.toISOString()},
    lounge: {body: '我说的话', author: 'superadmin', createdAt: yesterday.toISOString()},
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
  assert.ok(/\(p\.members\|\|\{\}\)\[S\.user\?\.id\]==='accepted'/.test(source),
    '退出项目只给已经加入的协作者');
  assert.ok(/class="leave-project"/.test(source), '协作者要有退出入口');
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

test('规划任务 is a switch on the composer: it drafts what is typed, or the next message', () => {
  const toggle = source.match(/function agentTogglePlan\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(!/input\.value=AGENT_PLAN_MARK/.test(toggle), '不再往输入框里塞前缀');
  assert.ok(/agentPlanSubmit\(text\)/.test(toggle), '框里已经有字时，点一下直接起草');
  assert.ok(/agentState\.plan=!agentState\.plan/.test(toggle), '框里没字时，切换成「下一条起草」');
  assert.ok(/input\.value=intent\.body/.test(toggle), '手打的前缀点一下就取下来');

  const submit = source.match(/async function agentSubmit\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/if\(intent\.plan\|\|agentState\.plan\)\{[^}]*return agentPlanSubmit\(intent\.body\)\}/.test(submit),
    '开关打开或带前缀时，发送转到起草');
  assert.ok(/async function agentPlanSubmit\(body\)/.test(source),
    '规划以正文为参数，不再自己去读输入框');
});

/* The draft is created through the ordinary actions, under the user's own
   rules, never through the assistant's agent.execute. */
test('confirmed management cards submit through one route, projects before their tasks',async()=>{
  const a=planningApp(),writes=[];a.context.document={querySelector:()=>null};
  a.context.fetch=async(path,options)=>{const body=JSON.parse(options.body);writes.push(body);return {ok:true,text:async()=>'{"id":"new-project","status":"active"}'}};
  a.run(`refresh=async()=>{S.projects=[{id:'new-project',name:'项目',status:'active',owner:'test001',members:{test001:'accepted'}}]};agentAppend=()=>{};var board={...planDraft({projects:[{ref:'P1',name:'项目',owner:'test001'}],tasks:[{name:'任务',projectRef:'P1',assignee:'test001'}]}),el:{querySelector:()=>null},history:[]};`);
  await a.run('planSubmit(board)');
  assert.deepEqual(writes.map(x=>[x.action,x.data.kind,x.data.operation]),[['work.card.apply','project','create'],['work.card.apply','task','create']]);
  assert.equal(writes[1].data.changes.projectId,'new-project');
  assert.ok(writes.every(x=>x.data.confirmed));
});

test('a planning message is labelled in the transcript and in reopened history', () => {
  const append = source.match(/function agentAppend\(role,content,kind='',intent=''\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/agentIntentChip\(intent\)/.test(append), '发出去的那条要带意图标签');
  assert.ok(!/el\.textContent=content/.test(append), '不能再用 textContent 覆盖整个气泡');

  const node = liftFunction('agentMessageNode');
  assert.ok(/agentPlanIntent\(m\.content\)/.test(node),
    '重新打开历史时同样认得出来，而不是把前缀当正文显示');

  assert.ok(/agentRenderEmptyState/.test(source), '空会话给出可以点的示例');
  assert.ok(/function agentSyncPlanButton\(\)/.test(source), '按钮状态要跟着输入框走');
});

/* One blank line in the transcript is enough to break the whole assistant: the
   proxy refuses an empty message, and the transcript is what gets replayed. */
test('a blank turn is never replayed to the proxy', () => {  const recent = source.match(/function agentRecentMessages\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/\.filter\(x=>String\(x\.content\|\|''\)\.trim\(\)\)/.test(recent),
    '回放前要滤掉空内容');

  const history = source.match(/async function agentLoadOwnHistory\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/String\(m\.content\|\|''\)\.trim\(\)/.test(history),
    '载入历史时就不该把空行放进回放窗口');

  const step = source.match(/function agentRecordStep\([\s\S]*?\n\}/)[0];
  assert.ok(/if\(String\(forModel\|\|''\)\.trim\(\)\)/.test(step),
    '记录步骤回执时也不能推入空内容');
});

/* Voice input must stay invisible where no engine exists, write the recognized
   text into the composer (never straight to the send path), and leave a stable
   prefix so interim guesses cannot stutter over settled text. A configured
   server engine (Qwen3-ASR/Whisper) is preferred so audio stays on
   infrastructure the operator chose, with the browser engine as fallback. */
test('voice input writes into the composer and hides itself when unsupported', () => {
  assert.ok(/window\.SpeechRecognition\|\|window\.webkitSpeechRecognition/.test(source),
    '保留浏览器自带引擎作为零配置兜底');
  const engine = source.match(/function agentVoiceEngine\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/sharedSpeechStatus\?\?agentServerAsr/.test(engine),
    '配了服务端转写且浏览器能录音时优先走服务端');
  const init = source.match(/function agentInitVoice\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/classList\.toggle\('hidden',!agentVoiceEngine\(\)\)/.test(init),
    '没有任何引擎时麦克风按钮应当隐藏，而不是点了报错');
  const render = source.match(/function agentVoiceRender\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/voiceWrite\(input,settled\+\(voice\.interim\?voice\.interim:''\)\)/.test(render),
    '最终文本与临时识别结果分开累积，输入框不会来回抖动');
  const start = source.match(/async function agentVoiceStartRecording\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(!/agentSubmit\(/.test(start), '录音只填进输入框，绝不自动发送');
  const finish = source.match(/async function agentVoiceFinishRecording\([^)]*\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/apiBlob\(TRANSCRIBE_ENDPOINT,blob[,)]/.test(finish),
    '音频以原始 body 上传到 /api/transcribe，而不是当 JSON 塞进对话接口');
  const stop = source.match(/function agentStopVoice\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/recognition\.stop\(\)/.test(stop), '再点一下要能结束浏览器识别');
  assert.ok(/recorder\.stop\(\)/.test(stop), '再点一下要能结束服务端录音');
});

/* Voice input keeps a copy of the composer text while it runs. A stale copy must
   never be written back over text the user has since deleted or typed. */
function voiceApp() {
  const start = source.indexOf('const voice={');
  const section = source.slice(start, source.indexOf('\ninitAgentUI();', start));
  const input = {value: '', setSelectionRange() {}};
  const bar = {textContent: '', classList: {toggle() {}}};
  const context = vm.createContext({
    $: selector => (selector === '#agentInput' ? input : selector === '#agentVoiceBar' ? bar : null),
    agentSyncPlanButton() {}, agentUpdateBusy() {}, toast() {}, agentServerAsr: null,
    TRANSCRIBE_ENDPOINT: '/api/transcribe', apiBlob: async () => ({text: ''}),
    navigator: {languages: ['zh-CN']},
    Blob: class { constructor(parts, options) { this.parts = parts; this.type = options.type; } },
  });
  vm.runInContext(section, context);
  return {context, input, run: code => vm.runInContext(code, context)};
}

function fakeBrowserRecognition(instances) {
  return class {
    constructor() { this.onstart = this.onresult = this.onerror = this.onend = null; instances.push(this); }
    start() {}
    stop() { this.onend && this.onend(); }
  };
}

test('voice input does not bring back text deleted before the next dictation', () => {
  const a = voiceApp(), instances = [];
  a.context.window = {SpeechRecognition: fakeBrowserRecognition(instances)};
  a.run('agentToggleVoice()');
  instances[0].onstart();
  instances[0].onresult({resultIndex: 0, results: [{isFinal: true, 0: {transcript: '明天开会'}}]});
  a.run('agentToggleVoice()');
  assert.equal(a.input.value, '明天开会');
  a.input.value = '';
  a.run('agentToggleVoice()');
  assert.equal(a.input.value, '', '删掉的文字不会因为再点一次麦克风而回来');
});

test('text typed into the box during dictation is the new starting point for recognized words', () => {
  const a = voiceApp(), instances = [];
  a.context.window = {SpeechRecognition: fakeBrowserRecognition(instances)};
  a.run('agentToggleVoice()');
  instances[0].onstart();
  instances[0].onresult({resultIndex: 0, results: [{isFinal: true, 0: {transcript: '明天'}}]});
  assert.equal(a.input.value, '明天');
  a.input.value = '';
  a.run('agentVoiceFollowEdit()');
  instances[0].onresult({resultIndex: 1, results: [
    {isFinal: true, 0: {transcript: '明天'}}, {isFinal: true, 0: {transcript: '开会'}}]});
  assert.equal(a.input.value, '开会', '删掉的词不会在下一次识别结果里回来');
});

test('a server transcript is added after the box content it finds when it arrives', async () => {
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const record = async (a, recorders) => {
    a.context.navigator = {languages: ['zh-CN'], mediaDevices: {getUserMedia: async () => ({getTracks: () => []})}};
    a.context.MediaRecorder = class {
      constructor() { this.state = 'inactive'; recorders.push(this); }
      static isTypeSupported() { return true; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.onstop(); }
    };
    await a.run('agentVoiceStartRecording()');
    recorders[0].ondataavailable({data: {size: 5}});
    a.run('agentStopVoice()');
  };

  const kept = voiceApp(), keptRecorders = [];
  let answer;
  kept.context.apiBlob = () => new Promise(resolve => { answer = resolve; });
  kept.input.value = '会议纪要：';
  await record(kept, keptRecorders);
  answer({text: '明天开会'});
  await tick();
  assert.equal(kept.input.value, '会议纪要：明天开会', '录音前写好的内容保留，转写结果接在后面');

  const deleted = voiceApp(), deletedRecorders = [];
  deleted.context.apiBlob = () => new Promise(resolve => { answer = resolve; });
  deleted.input.value = '会议纪要：';
  await record(deleted, deletedRecorders);
  deleted.input.value = '';
  answer({text: '明天开会'});
  await tick();
  assert.equal(deleted.input.value, '明天开会', '转写时删掉的文字不会被带回来');
});

test('changing conversations cancels late browser and server speech results', async () => {
  const a=voiceApp(),instances=[];
  a.context.window={SpeechRecognition:fakeBrowserRecognition(instances)};
  a.input.value='old conversation';a.run('agentVoiceStartRecognition()');
  const ended=instances[0].onend;
  a.run('agentCancelVoice()');a.input.value='new conversation';ended();
  assert.equal(a.input.value,'new conversation');
  a.run('voice.chunks=[{size:5}]');let answer;
  a.context.apiBlob=()=>new Promise(resolve=>{answer=resolve});
  const pending=a.run('agentVoiceFinishRecording()');
  a.run('agentCancelVoice()');a.input.value='another conversation';answer({text:'old audio'});await pending;
  assert.equal(a.input.value,'another conversation');
});


/* 反馈 #1：抽屉里的「调整任务指派」按钮曾与弹窗里的负责人下拉框同用
   editTaskAssignee 这个 id，保存时取到的是按钮的空值，服务端回「请重新登录」。 */
test('the drawer button and the edit form never share an element id', () => {
  const drawer = source.match(/function openDrawer\(id\)\{[\s\S]*?\n\}/)[0];
  const form = source.match(/function editTaskRequest\(id,direct=false\)\{[\s\S]*?\n\}/)[0];
  const ids = s => new Set([...s.matchAll(/id="([A-Za-z]+)"/g)].map(m => m[1]));
  const shared = [...ids(drawer)].filter(id => ids(form).has(id));
  assert.deepEqual(shared, [], '抽屉与修改弹窗同时在页面上，id 重复时 $() 会取到抽屉里的元素');
});

test('editing keeps the current assignee selectable even when the pool omits them', () => {
  const a = app();
  const elements = {};
  a.context.document = {querySelector: s => elements[s] || (elements[s] = {classList:{add(){},remove(){},contains(){return true}},closest:()=>null}), querySelectorAll: () => []};
  a.run(`S.today='2026-10-28';S.users=[{id:'superadmin',admin:1,active:1},{id:'admin002',admin:1,active:1},{id:'test002',admin:0,active:1}];
    S.projects=[];S.tasks=[{id:'t',name:'个人事项',assignee:'admin002',date:'2026-10-28',duration:30,priority:'P1'}];S.user={id:'superadmin',admin:1};`);
  a.run("editTaskRequest('t',true)");
  const html = elements['#modalContent'].innerHTML;
  assert.match(html, /<option value="admin002" selected>/, '当前负责人必须在下拉框里且被选中，否则保存会悄悄换人');
});

/* 反馈 #3：模型爱给任务名加项目名前缀。The assistant helpers sit past the
   sandbox cut-off, so they are lifted out of the source like agentLoop. */
const lift = name => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0];
test('a project-name prefix is dropped from assistant task names', () => {
  const a = app();
  a.run(lift('agentTidyTaskName'));
  a.run(`S.projects=[{id:'p',name:'客户需求访谈'}];S.tasks=[{id:'t',projectId:'p'}];`);
  for (const raw of ['客户需求访谈·嘉宾提问大纲', '客户需求访谈 - 嘉宾提问大纲', '【客户需求访谈】嘉宾提问大纲', '客户需求访谈：嘉宾提问大纲']) {
    assert.equal(a.json(`agentTidyTaskName('task.create',{name:${JSON.stringify(raw)},projectId:'p'}).name`), '嘉宾提问大纲', raw);
  }
  assert.equal(a.json(`agentTidyTaskName('task.update',{id:'t',name:'客户需求访谈·复盘'}).name`), '复盘', '调整时按任务所在项目判断');
  assert.equal(a.json(`agentTidyTaskName('task.create',{name:'客户需求访谈',projectId:'p'}).name`), '客户需求访谈', '整段就是项目名时保持不动');
  assert.equal(a.json(`agentTidyTaskName('task.delete',{name:'客户需求访谈·x'}).name`), '客户需求访谈·x');
});

test('a run with actions folds under one line and keeps the closing reply in view', () => {
  const a = app();
  a.run(lift('agentFoldRun'));
  a.context.document = {createElement: tag => ({tag, className: '', children: [], textContent: '',
    classList: {contains() { return false; }}, appendChild(n) { this.children.push(n); }})};
  const node = cls => ({classList: {contains: c => cls.split(' ').includes(c)}});
  a.context.nodes = [node('agent-message assistant'), node('agent-message assistant agent-action'), node('agent-step'), node('agent-message assistant')];
  const out = a.run('agentFoldRun(nodes)');
  assert.equal(out.length, 2);
  assert.equal(out[0].tag, 'details');
  assert.equal(out[0].children[0].textContent, '执行过程 · 1 步');
  assert.equal(out[1], a.context.nodes[3], '最后一句结论留在折叠区外');
  a.context.plain = [node('agent-message assistant')];
  assert.equal(a.run('agentFoldRun(plain)').length, 1, '没有执行动作的普通问答不折叠');
  assert.equal(a.run('agentFoldRun(plain)[0]'), a.context.plain[0]);
});

/* 反馈 #4：项目任务排序。 */
test('project tasks sort by priority, start, end, or the saved manual order', () => {
  const a = app();
  a.run(`S.tasks=[
    {id:'a',name:'甲',priority:'P2',date:'2026-10-01',deadline:'2026-10-20'},
    {id:'b',name:'乙',priority:'P0',date:'2026-10-05',deadline:'2026-10-06'},
    {id:'c2',name:'丙',priority:'P1',date:'2026-10-03',originId:'c'},
    {id:'c',name:'丙',priority:'P1',date:'2026-10-02',status:'deferred',supersededBy:'c2'}];
    var p={id:'p',taskOrder:['c','a']};var live=S.tasks.filter(t=>t.id!=='c');`);
  assert.deepEqual(a.json("sortProjectTasks(p,live,'priority').map(t=>t.id)"), ['b','c2','a']);
  assert.deepEqual(a.json("sortProjectTasks(p,live,'start').map(t=>t.id)"), ['a','c2','b']);
  assert.deepEqual(a.json("sortProjectTasks(p,live,'end').map(t=>t.id)"), ['c2','b','a']);
  assert.deepEqual(a.json("sortProjectTasks(p,live,'manual').map(t=>t.id)"), ['c2','a','b'],
    '递延出来的新记录沿用原任务的位置，没排过的放最后');
  assert.equal(a.run('projectSortMode(p)'), 'manual', '项目有手动顺序时默认按它显示');
  assert.equal(a.run("projectSortMode({id:'q'})"), 'priority');
});

/* Finishing a task needs no sign-off. Afterwards its assignee can correct the
   record, and the project Owner or an admin can send it back. */
test('a finished task offers its assignee an edit and its Owner a send-back', () => {
  const a = app();
  const els = {'#drawerContent': {innerHTML: ''}, '#taskDrawer': {classList: {remove() {},contains(){return true}}}};
  a.context.document = {querySelector: s => els[s] || null, querySelectorAll: () => []};
  a.run(`S.today='2026-09-12';S.logs=[];S.editRequests=[];S.users=[];
         S.projects=[{id:'p',name:'项目',owner:'test002',status:'active',members:{test001:'accepted',test002:'accepted'}}];
         S.tasks=[{id:'t',projectId:'p',name:'任务',assignee:'test001',priority:'P1',status:'done',date:'2026-09-12',duration:30,completionSummary:'做完了',completionActual:25}];`);
  const drawer = who => { a.run(`S.user=${JSON.stringify(who)};openDrawer('t')`); return els['#drawerContent'].innerHTML; };
  const mine = drawer({id: 'test001', admin: 0});
  assert.ok(mine.includes('id="editCompletion"') && !mine.includes('id="reopenTask"'), '执行人可以修改完成记录');
  assert.ok(mine.includes('实际 25 分钟'));
  const owner = drawer({id: 'test002', admin: 0});
  assert.ok(owner.includes('id="reopenTask"') && !owner.includes('id="editCompletion"'), 'Owner 可以打回');
  assert.ok(drawer({id: 'superadmin', admin: 1}).includes('id="reopenTask"'), '管理员可以打回');
  for (const html of [mine, owner]) assert.ok(!html.includes('approveTask'), '不再有审批按钮');
  // Open work offers neither; a task that was sent back says why.
  a.run("S.tasks[0].status='todo';S.tasks[0].reopen={by:'test002',reason:'缺验收截图'}");
  const back = drawer({id: 'test001', admin: 0});
  assert.ok(!back.includes('editCompletion') && !back.includes('reopenTask'));
  assert.ok(back.includes('缺验收截图') && back.includes('记录完成'));
  // A closed project freezes the record.
  a.run("S.tasks[0].status='done';S.projects[0].status='done'");
  const closed = drawer({id: 'test002', admin: 0});
  assert.ok(!closed.includes('reopenTask'));
});

test('已递延 lists a task deferred several times once, as the record that carries it now', () => {
  const a=app();
  a.run(`S.user={id:'test002',admin:0};S.projects=[];UI.member='all';S.logs=[];S.tasks=[
    {id:'d1',name:'报告',assignee:'test002',status:'deferred',date:'2026-10-30',superseded:true,supersededBy:'d3'},
    {id:'d2',name:'报告',assignee:'test002',status:'deferred',date:'2026-10-31',originId:'d1',
      superseded:true,supersededBy:'d3'},
    {id:'d3',name:'报告',assignee:'test002',status:'todo',date:'2026-11-01',originId:'d1'},
    {id:'plain',name:'别的',assignee:'test002',status:'todo',date:'2026-11-01'}];`);
  assert.deepEqual(a.json('scheduleTasks().filter(isDeferredTask).map(t=>t.id)'), ['d3']);
  assert.equal(a.run("deferHops(S.tasks.find(t=>t.id==='d3'))"), 2);
});

test('已递延 removes completed work from the list and count, keeps history, and restores reopened work', () => {
  const a=app(),elements={};
  a.context.document={querySelector:s=>elements[s]||(elements[s]={innerHTML:'',textContent:'',style:{},closest:()=>null,
    classList:{add(){},remove(){},toggle(name,on){this[name]=on}}}),querySelectorAll:()=>[]};
  a.run(`S.today='2026-11-03';S.user={id:'test002',admin:0};UI.member='all';UI.filter='deferred';
    S.tasks=[
      {id:'d1',name:'报告',assignee:'test002',status:'deferred',date:'2026-11-01',
        superseded:true,supersededBy:'d3'},
      {id:'d2',name:'报告',assignee:'test002',status:'deferred',date:'2026-11-02',originId:'d1',
        superseded:true,supersededBy:'d3'},
      {id:'d3',name:'报告',assignee:'test002',status:'todo',date:'2026-11-03',originId:'d1',
        priority:'P1',duration:30}];renderToday();`);
  const list=()=>elements['#todayTaskList'].innerHTML;
  const count=()=>elements['#deferredCount'].textContent;
  assert.ok(list().includes('data-id="d3"'));
  assert.ok(!list().includes('data-id="d1"')&&!list().includes('data-id="d2"'));
  assert.equal(count(),1);
  a.run("S.tasks[2].status='done';renderToday()");
  assert.equal(list(),'');
  assert.equal(count(),0);
  assert.equal(elements['#todayEmpty'].classList.hidden,false);
  assert.deepEqual(a.json('scheduleTasks(true).map(t=>t.id)'),['d1','d2','d3']);
  assert.equal(a.run('taskLineageIds(S.tasks[2]).size'),3);
  a.run("UI.filter='done';renderToday()");
  assert.ok(list().includes('data-id="d3"'),'完成记录仍能在已完成页签查看');
  for(const state of ['todo','doing']){
    a.run(`UI.filter='deferred';S.tasks[2].status='${state}';renderToday()`);
    assert.ok(list().includes('data-id="d3"'),'打回后仍待处理的递延任务重新出现');
    assert.equal(count(),1);
  }
  a.run("S.tasks[2].status='skipped';renderToday()");
  assert.equal(list(),'');
  assert.equal(count(),0);
});

test('已递延 includes only open current occurrences, including carried fixed tasks across dates', () => {
  const a=app();
  a.run(`S.today='2026-11-03';S.user={id:'superadmin',admin:1};UI.member='all';
    S.tasks=['todo','doing','done','skipped','deferred','rejected','pending_approval'].map((status,i)=>({
      id:status,assignee:i%2?'test002':'test001',status,originId:'old-'+i,fixed:true,date:'2026-11-02'}));
    S.tasks.push({id:'superseded',assignee:'test001',status:'doing',originId:'old',superseded:true},
      {id:'plain',assignee:'test001',status:'todo'});`);
  assert.deepEqual(a.json('scheduleTasks().filter(isDeferredTask).map(t=>t.id)'),['todo','doing']);
  a.run("UI.member='test002'");
  assert.deepEqual(a.json('scheduleTasks().filter(isDeferredTask).map(t=>t.id)'),['doing']);
  a.run("S.user={id:'test001',admin:0};UI.member='all'");
  assert.deepEqual(a.json('scheduleTasks().filter(isDeferredTask).map(t=>t.id)'),['todo']);
});

test('new work is marked in the project space until it is opened', () => {
  const a=app();
  a.run(`S.user={id:'test002',admin:0};S.projects=[{id:'p',status:'active'}];S.tasks=[
    {id:'t',projectId:'p',assignee:'test002'},{id:'t2',projectId:'p',assignee:'test002',originId:'t'}];S.notifications=[
    {id:'n1',fresh:true,read:false,reference:'p'},{id:'n2',fresh:true,read:false,reference:'t'},
    {id:'n3',fresh:true,read:true,reference:'old'},{id:'n4',read:false,reference:'t'},
    {id:'n5',fresh:true,read:false,reference:'gone'}];`);
  assert.deepEqual(a.json('[...freshRefs()].sort()'), ['p','t'], '读过的、普通通知、已删除的都不算');
  assert.equal(a.run('isFreshTask(S.tasks[1])'), true, '递延后的那条也带着标记');
  a.run('S.notifications[1].read=true');
  assert.equal(a.run('isFreshTask(S.tasks[1])'), false);
});

test('a temp task handed to someone shows for both people in the project space', () => {
  const a=app(); const elements={};
  a.context.document={querySelector:s=>elements[s]||(elements[s]={}),querySelectorAll:()=>[]};
  a.run(`S.today='2026-11-02';S.projects=[];S.notifications=[];
    S.users=[{id:'test001',active:1},{id:'test002',active:1}];S.tasks=[
    {id:'h',name:'核对报价',creator:'test001',assignee:'test002',priority:'P1',status:'todo',date:'2026-11-02'},
    {id:'own',name:'自己的',creator:'test002',assignee:'test002',priority:'P1',status:'todo',date:'2026-11-02'}];`);
  a.run("S.user={id:'test002',admin:0};renderProjects()");
  let html=elements['#projectGrid'].innerHTML;
  assert.ok(/派给我的 <span>1<\/span>/.test(html)&&html.includes('由 test001')&&!html.includes('自己的'));
  a.run("S.user={id:'test001',admin:0};renderProjects()");
  html=elements['#projectGrid'].innerHTML;
  assert.ok(/我派出的 <span>1<\/span>/.test(html)&&html.includes('给 test002'));
  assert.equal(a.run('handedOut(S.tasks[0])'), true);
  a.run("S.users.push({id:'superadmin',admin:1})");
  assert.equal(a.run('editApprover(S.tasks[0])'), 'test001', '接到的人申请修改，由派任务的人批');
  a.run('S.users[0].active=0');
  assert.equal(a.run('editApprover(S.tasks[0])'), 'superadmin', '派任务的人停用后由 superadmin 批');
});

test('weekly report only links filed daily records and does not sum daily snapshots',()=>{
  const a=app();a.run("S.today='2026-11-02'");const html=a.run(`weekReportDocument({start:'2026-10-31',end:'2026-11-06',briefs:[{date:'2026-10-31',filed:true},{date:'2026-11-01'},{date:'2026-11-02',filed:false}],work:{completed:[],unfinished:[]}})`);
  assert.match(html,/data-date="2026-10-31"/);assert.match(html,/data-date="2026-11-01"/);assert.doesNotMatch(html,/data-date="2026-11-02"/);
});

test('a day sits at the same place on the ruler for ticks and the week band', () => {
  const a=app();
  assert.equal(a.run('rulerAt(1,30)'), '0.00');
  assert.equal(a.run('rulerAt(30,30)'), '100.00');
  assert.equal(a.run('rulerAt(0,30)'), a.run('rulerAt(1,30)'), '月初之前的一周从 1 号画起');
  assert.equal(a.run('rulerAt(45,31)'), '100.00');
});

test('the project space lists folders on the left and opens a project with its background, people and files', () => {
  const a=app(); const elements={};
  a.context.document={querySelector:s=>elements[s]||(elements[s]={innerText:'',dataset:{},classList:{toggle(){}}}),querySelectorAll:()=>[]};
  a.run(`S.today='2026-11-03';S.notifications=[];S.folders=[{id:'f1',name:'年度战略'},{id:'f2',name:'空文件夹'}];
    S.users=[{id:'superadmin',admin:1,active:1},{id:'test001',active:1},{id:'test002',active:1}];
    S.projects=[
      {id:'p',name:'入池项目',owner:'test001',status:'active',folderId:'f1',start:'2026-11-01',end:'2026-11-11',createdAt:'2026-10-30T09:00:00+08:00',
       members:{test001:'accepted',test002:'accepted'},background:'为什么做',staffing:{test002:'调研'}},
      {id:'q',name:'散落项目',owner:'test001',status:'active',members:{test001:'accepted'}}];
    S.tasks=[{id:'t',projectId:'p',name:'子任务',assignee:'test002',priority:'P1',status:'done',date:'2026-11-02',duration:90}];
    S.files=[{id:'x',projectId:'p',name:'方案.pdf',size:2048,uploader:'test002',createdAt:'2026-11-02T10:00:00+08:00'},
      {id:'y',projectId:'q',name:'别的.txt',size:1,uploader:'test001',createdAt:'2026-11-02T10:00:00+08:00'}];`);
  a.run("S.user={id:'test002',admin:0};UI.space='';renderProjects()");
  let nav=elements['#projectNav'].innerHTML;
  assert.ok(nav.includes('年度战略')&&!nav.includes('空文件夹'), '成员只看到有自己项目的文件夹');
  assert.ok(nav.indexOf('年度战略')<nav.indexOf('入池项目'), '项目排在自己的文件夹下');
  assert.ok(elements['#projectGrid'].innerHTML.includes('data-project="p"'), '点卡片进入项目空间');
  assert.ok(!nav.includes('data-drag'), '协作者不能拖');
  a.run("S.user={id:'superadmin',admin:1};renderProjects()");
  nav=elements['#projectNav'].innerHTML;
  assert.ok(nav.includes('空文件夹')&&nav.includes('addFolderBtn')&&nav.includes('data-drag'));
  assert.ok(nav.indexOf('空文件夹')<nav.indexOf('年度战略')&&nav.indexOf('年度战略')<nav.indexOf('入池项目')&&nav.indexOf('入池项目')<nav.indexOf('散落项目'),
    '文件夹和散落的项目同在根上，文件夹默认在前');
  assert.ok(/data-id="p" data-level="1" data-parent="f1"/.test(nav)&&/data-id="q" data-level="0"/.test(nav));
  a.run("UI.space='p';renderProjects()");
  let space=elements['#projectSpace'].innerHTML;
  assert.equal(elements['#projectGrid'].innerHTML, '');
  assert.equal(elements['#projectsView h1'].textContent, '入池项目');
  assert.ok(space.includes('id="spaceBackground"')&&space.includes('为什么做'));
  assert.ok(space.includes('value="调研"')&&space.includes('进行中 0 · 已完成 1 · 1.5 小时'));
  assert.ok(space.includes('第 2 / 10 天')&&space.includes('1 / 1 已完成'));
  assert.ok(space.includes('/api/files/x')&&space.includes('2 KB')&&!space.includes('别的.txt'));
  assert.ok(space.includes('id="spaceFolder"')&&space.includes('file-delete')&&!space.includes('open-space'));
  a.run("S.projects[0].members.test003='accepted';S.users.push({id:'test003',active:1});S.user={id:'test003',admin:0};renderProjects()");
  space=elements['#projectSpace'].innerHTML;
  assert.ok(!space.includes('spaceBackground')&&space.includes('为什么做'), '协作者只读');
  assert.ok(!space.includes('file-delete')&&!space.includes('spaceFolder'), '不能删别人的文件');
  assert.ok(!space.includes('进行中 0 · 已完成 1'), '看不到别人的负荷');
  a.run("S.projects[0].status='done';renderProjects()");
  assert.equal(a.run('UI.space'), '', '项目不可见后回到全部项目');
});

function planningApp(){
  const a=app();
  a.run(source.slice(source.indexOf('const AGENT_CONFIG_KEY'),source.indexOf('const CHAT_POLL_MS')));
  a.run(`S.today='2026-11-03';S.user={id:'superadmin',admin:1};S.users=[
    {id:'superadmin',admin:1,active:1},{id:'test001',active:1},{id:'test002',active:1}];
    planRender=()=>{};agentUpdateBusy=()=>{};toast=()=>{};`);
  return a;
}

test('incomplete AI cards preserve unknown people and projects for correction instead of silently reassigning',()=>{
  const a=planningApp();
  a.run(`var board=planDraft({projects:[{name:''}],tasks:[{assignee:'不存在的人',projectId:'ghost'}]});`);
  assert.equal(a.run('board.tasks[0].name'),'');
  assert.equal(a.run('board.tasks[0].assignee'),'');
  assert.equal(a.run('board.tasks[0].project'),'missing:ghost');
  const errors=a.json('planProblems(board,board.tasks[0])');
  assert.ok(errors.name&&errors.assignee&&errors.project);
  a.run('planCardsHTML(board)');
  assert.equal(a.run('board.tasks[0].assignee'),'','渲染不能把未知负责人改派给第一个账户');
  a.run("board.tasks[0].name='复盘';board.tasks[0].assignee='test001';board.tasks[0].project=''");
  assert.deepEqual(a.json('planProblems(board,board.tasks[0])'),{});
  a.run("board.tasks[0].date='2026-11-31';board.tasks[0].time='29:99'");
  assert.ok(a.run('Boolean(planProblems(board,board.tasks[0]).date&&planProblems(board,board.tasks[0]).time)'));
});

test('confirming incomplete cards writes nothing; corrected cards submit once and clear undo history',async()=>{
  const a=planningApp(),writes=[];
  a.context.document={querySelector:()=>null};
  a.context.fetch=async(path,options)=>{writes.push(JSON.parse(options.body));return {ok:true,text:async()=>'{"id":"created"}'}};
  a.run(`refresh=async()=>{};agentAppend=()=>{};
    var board={...planDraft({tasks:[{name:''}]}),el:{querySelector:()=>null},history:[]};`);
  await a.run('planSubmit(board)');
  assert.equal(writes.length,0);
  a.run("planCheckpoint(board);board.tasks[0].name='整理周报';board.tasks[0].assignee='test001'");
  await a.run('planSubmit(board)');
  assert.equal(writes.length,1);
  assert.equal(writes[0].action,'work.card.apply');
  assert.equal(writes[0].data.kind,'task');
  assert.equal(writes[0].data.operation,'create');
  assert.equal(a.run('board.history.length'),0,'已提交的卡片不能通过撤销变回未提交');
  await a.run('planSubmit(board)');
  assert.equal(writes.length,1,'已完成的卡片不重复提交');
});

test('draft undo restores edits and removals without changing server data',()=>{
  const a=planningApp();
  a.run(`var board={...planDraft({tasks:[{name:'原任务',assignee:'test001'}]}),history:[]};
    planCheckpoint(board);board.tasks[0].name='新名字';planCheckpoint(board);board.tasks=[];planUndo(board);`);
  assert.equal(a.run('board.tasks[0].name'),'新名字');
  a.run('planUndo(board)');
  assert.equal(a.run('board.tasks[0].name'),'原任务');
});

test('pause retains pending work until resume, and stop releases the wait without running it',async()=>{
  const a=planningApp();
  a.run('agentState.busy=true;agentTogglePause();var finished=false;var waiting=agentWaitForResume().then(ok=>{finished=ok})');
  await Promise.resolve();
  assert.equal(a.run('finished'),false);
  a.run('agentTogglePause()');await a.run('waiting');
  assert.equal(a.run('finished'),true);
  a.run('agentTogglePause();waiting=agentWaitForResume();agentHalt()');
  assert.equal(await a.run('waiting'),false);
});

test('stopping an in-flight write waits for its receipt instead of allowing a competing run',()=>{
  const a=planningApp();
  a.run('var cancelled=false;agentState.pendingResolve=()=>{cancelled=true};agentState.pendingExecuting=true;agentHalt()');
  assert.equal(a.run('cancelled'),false);
  assert.equal(a.run('agentState.stop'),true);
});

test('ArrowUp recalls the last planning request only into an empty composer',()=>{
  const a=planningApp();let prevented=0;
  a.context.input={value:''};a.context.event={key:'ArrowUp',currentTarget:a.context.input,preventDefault(){prevented++}};
  a.run("imeEnter=()=>false;agentSyncPlanButton=()=>{};agentState.lastInput='✦ 安排下周复盘';agentInputKeydown(event)");
  assert.equal(a.context.input.value,'安排下周复盘');
  assert.equal(a.run('agentState.plan'),true);
  assert.equal(prevented,1);
  a.context.input.value='正在编辑';a.run('agentInputKeydown(event)');
  assert.equal(a.context.input.value,'正在编辑');
});

test('a background save receipt preserves newer edits and allows retry after a failure',async()=>{
  const a=app(),bg={innerText:'原背景'},button={},calls=[];
  let respond;
  a.context.document={querySelector:s=>s==='#spaceBackground'?bg:s==='#saveBackground'?button:null,querySelectorAll:()=>[]};
  a.context.fetch=(path,options)=>{calls.push(JSON.parse(options.body));return new Promise(resolve=>{respond=resolve})};
  a.run("toast=()=>{};var project={id:'p'};bindProjectSpace(project)");
  bg.innerText='版本 A';bg.oninput();const first=button.onclick();
  assert.equal(button.disabled,true);
  bg.innerText='版本 B';bg.oninput();
  await button.onclick();assert.equal(calls.length,1,'保存中不发送并发请求');
  respond({ok:true,text:async()=>'{"ok":true}'});await first;
  assert.equal(a.run('project.background'),'版本 A');
  assert.equal(bg.innerText,'版本 B');
  assert.equal(button.disabled,false,'新编辑仍待保存');assert.equal(button.textContent,'保存');
  const second=button.onclick();respond({ok:true,text:async()=>'{"ok":true}'});await second;
  assert.equal(calls[1].data.background,'版本 B');
  assert.equal(button.disabled,true);assert.equal(button.textContent,'已保存');
  bg.innerText='版本 C';bg.oninput();const failed=button.onclick();
  respond({ok:false,text:async()=>'{"error":"暂时失败"}'});await failed;
  assert.equal(button.disabled,false);assert.equal(button.textContent,'保存');
  assert.equal(a.run('project.background'),'版本 B');
});

test('archived attachments have a read-only navigation and achievements entry without active project actions',()=>{
  const a=app(),elements={};
  a.context.document={querySelector:s=>elements[s]||(elements[s]={dataset:{},classList:{toggle(){}}}),querySelectorAll:()=>[]};
  a.run(`S.today='2026-11-03';S.user={id:'test001',admin:0};UI.view='projects';S.projects=[];
    S.fileArchives=[{id:'old',name:'已交付项目',owner:'test001',status:'done'}];
    S.files=[{id:'f',projectId:'old',name:'交付.pdf',size:20,uploader:'test001',createdAt:'2026-11-03T09:00:00+08:00'}];
    UI.space='old';renderProjects();`);
  assert.ok(elements['#projectNav'].innerHTML.includes('归档文件'));
  const html=elements['#projectSpace'].innerHTML;
  assert.ok(html.includes('/api/files/f')&&html.includes('data-space-tab="meetings"'));
  for(const action of ['spaceFileInput','file-delete','spaceBackground','spaceFolder','request-project-completion'])assert.ok(!html.includes(action),action);
  assert.equal(a.run('visibleProjects().length'),0,'归档项目不回到进行中列表');
  a.run("S.user={id:'superadmin',admin:1};S.achievements=[{id:'old',name:'已交付项目',status:'done',tasks:[]}];renderAchievements()");
  assert.ok(elements['#achievementGrid'].innerHTML.includes('achievement-files'),'管理员可从成果库进入归档附件');
});

test('a folder lists its projects in a chosen order', () => {
  const a=app(); const elements={};
  const store={};a.context.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)}};
  a.context.document={querySelector:s=>elements[s]||(elements[s]={innerText:'',dataset:{},classList:{toggle(){}}}),querySelectorAll:()=>[]};
  a.run(`S.today='2026-11-03';S.notifications=[];S.folders=[{id:'f',name:'战略'}];S.user={id:'superadmin',admin:1};
    S.users=[{id:'superadmin',admin:1,active:1},{id:'test001',active:1}];S.tasks=[];
    const base={owner:'test001',status:'active',folderId:'f',members:{test001:'accepted'}};
    S.projects=[{...base,id:'b',name:'乙',navOrder:2,end:'2026-12-01',createdAt:'2026-10-01T00:00:00+08:00'},
      {...base,id:'a',name:'甲',navOrder:1,end:'2026-12-20',createdAt:'2026-10-05T00:00:00+08:00'},
      {...base,id:'c',name:'丙',navOrder:3,folderId:null,createdAt:'2026-10-09T00:00:00+08:00'}];
    UI.space='';UI.folder='f';renderProjects();`);
  const order=()=>[...elements['#projectGrid'].innerHTML.matchAll(/<article class="project-card[^>]*data-project="(\w)"/g)].map(m=>m[1]).join('');
  assert.equal(elements['#projectsView h1'].textContent,'战略');
  assert.equal(order(),'ab','目录顺序，只含本文件夹');
  assert.ok(elements['#projectToolbar'].innerHTML.includes('按截止日期'));
  a.run("setFolderSortMode('end');renderProjects()");
  assert.equal(order(),'ba');
  a.run("setFolderSortMode('created');renderProjects()");
  assert.equal(order(),'ab');
  a.run("setFolderSortMode('nav');UI.folder='';renderProjects()");
  assert.equal(order(),'abc','全部项目按目录从上到下');
  assert.ok(elements['#projectNav'].innerHTML.includes('全部项目'));
});

test('a drop between directory rows becomes a parent and an order between the new neighbours', () => {
  const a=app();
  a.run(`S.user={id:'superadmin',admin:1};S.folders=[{id:'f',name:'F',navOrder:10},{id:'g',name:'G',navOrder:30}];
    const base={owner:'test001',status:'active',members:{test001:'accepted'}};
    S.projects=[{...base,id:'p1',name:'p1',folderId:'f',navOrder:1},{...base,id:'p2',name:'p2',folderId:'f',navOrder:2},
      {...base,id:'r',name:'r',navOrder:20}];`);
  const plan=t=>a.json(`navPlan(projectTree(),${JSON.stringify(t.kind||'project')},${JSON.stringify(t.id)},${JSON.stringify(t.at)})`);
  assert.deepEqual(a.json('projectTree().map(n=>n.id)'),['f','r','g']);
  assert.equal(plan({id:'r',at:{parent:null,before:'g'}}),null,'放回原处不算移动');
  assert.deepEqual(plan({id:'r',at:{parent:null,before:'f'}}),{kind:'project',id:'r',folderId:null,order:10-1024});
  assert.deepEqual(plan({id:'r',at:{parent:'f',before:'p2'}}),{kind:'project',id:'r',folderId:'f',order:1.5});
  assert.deepEqual(plan({id:'r',at:{into:'g'}}),{kind:'project',id:'r',folderId:'g',order:0},'空文件夹');
  assert.deepEqual(plan({id:'p1',at:{into:'f'}}),{kind:'project',id:'p1',folderId:'f',order:2+1024},'进文件夹排到最后');
  assert.deepEqual(plan({kind:'folder',id:'g',at:{parent:null,before:'r'}}),{kind:'folder',id:'g',folderId:null,order:15});
  // Pointer to place: rows are 32px tall from y=0; the tree starts at x=0.
  a.run(`var rows=[['folder','f',0,''],['project','p1',1,'f'],['project','p2',1,'f'],['project','r',0,''],['folder','g',0,'']]
    .map(([kind,id,level,parent],i)=>({dataset:{kind,id,level:String(level),parent},getBoundingClientRect:()=>({top:i*32,bottom:i*32+30,height:30})}));
    var tree={querySelectorAll:()=>rows,getBoundingClientRect:()=>({left:0,top:0})};`);
  const at=(kind,x,y)=>a.json(`(({row,...t})=>t)(navTarget(tree,'${kind}',${x},${y}))`);
  assert.deepEqual(at('project',10,15),{into:'f'},'悬在文件夹中间就放进去');
  assert.equal(at('folder',10,10).before,'f','文件夹不会进文件夹');
  assert.deepEqual(at('project',10,50),{parent:'f',before:'p2',level:1,y:63,top:63},'文件夹中间只能在里面');
  assert.deepEqual(at('project',10,90),{parent:null,before:'r',level:0,y:95,top:95},'文件夹下方偏左：和文件夹平级');
  assert.deepEqual(at('project',80,90),{parent:'f',before:null,level:1,y:95,top:95},'偏右：归到文件夹里');
  assert.equal(at('folder',80,50).before,'r','文件夹落点跳过别人的子项');
});

test('AI presets include mainstream endpoints and prefer a chat model', () => {
  const a=planningApp();
  for(const provider of ['openai','gemini','deepseek','dashscope'])assert.ok(a.run(`LLM_PRESETS.${provider}.base`));
  assert.equal(a.run('LLM_PRESETS.anthropic.base'),'');assert.ok(a.run('LLM_PRESETS.anthropic.name').includes('兼容网关'));
  assert.equal(a.run("agentPreferredModel(['text-embedding-3-small','gpt-4.1'])"),'gpt-4.1');
});

test('an open-ended project counts people over the two weeks around today only', () => {
  const a = app();
  a.run(`S.today='2026-11-10';S.tasks=[
    {id:'old',assignee:'test002',date:'2026-10-01',duration:60,status:'done'},
    {id:'recent',assignee:'test002',date:'2026-11-05',duration:60,status:'done'},
    {id:'spans',assignee:'test002',date:'2026-10-20',deadline:'2026-11-04',duration:30,status:'doing'},
    {id:'soon',assignee:'test002',date:'2026-11-17',duration:60,status:'todo'},
    {id:'later',assignee:'test002',date:'2026-11-18',duration:60,status:'todo'},
    {id:'skipped',assignee:'test002',date:'2026-11-11',duration:60,status:'skipped'}];`);
  assert.deepEqual(a.json("loadWindow({start:'2026-01-01'})"), ['2026-11-04','2026-11-17']);
  assert.equal(a.run("memberTaskCount('test002',{start:'2026-01-01'})"), 3);
  assert.deepEqual(a.json("memberLoad('test002',loadWindow({start:'2026-01-01'}))"), {count:3,mins:150});
  assert.equal(a.run("memberTaskCount('test002',{start:'2026-09-01',end:'2026-12-31'})"), 5, '有截止日期的按项目周期');
  assert.ok(a.run("loadWindowLabel({start:'2026-01-01'})").startsWith('近两周'));
});

test('the week starts on the day the team picked', () => {
  const a = app();
  a.run("S.today='2026-11-04'");
  assert.equal(a.run('weekStart(S.today)'), '2026-10-31', '默认仍从周六开始');
  a.run('S.weekStart=1');
  assert.equal(a.run('weekStart(S.today)'), '2026-11-02');
  assert.deepEqual(a.json('week(1)').slice(0,2), ['2026-11-09','2026-11-10']);
  a.run('S.weekStart=0');
  assert.equal(a.run("weekStart('2026-11-08')"), '2026-11-08', '当天就是开始日');
  a.run('S.weekStart=9');
  assert.equal(a.run('weekStart(S.today)'), '2026-10-31', '无效值回到周六');
});

test('the assistant keeps conversations in a side list and its message tools are icons', () => {
  const tools = source.match(/function agentMessageTools\([\s\S]*?\n\}/)[0];
  for (const [name, label] of [['copy','复制'],['edit','修改重发'],['undo','回退到这里']])
    assert.ok(tools.includes(`button('${name}','${label}'`), label);
  assert.ok(!/agentShowHistory/.test(source), '不再弹出单独的工作记录卡片');
  assert.ok(/agentHistoryBtn'\)\?\.addEventListener\('click',\(\)=>agentToggleSessions\(\)\)/.test(source));
  const use = source.match(/function agentUseConversation\(id\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/agentState\.sessionId=id==='legacy'\?null:id/.test(use), '早期记录不带会话 ID，服务端照旧归档');
});

test('message action layout preserves the bubble content and copy/edit/rewind actions', async () => {
  const a=planningApp(),copied=[],calls=[];
  class Element {
    constructor(){this.children=[];this.classList={add:()=>{},remove:()=>{}};this.attributes={};}
    get firstChild(){return this.children[0]||null;}
    appendChild(child){if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1);this.children.push(child);child.parent=this;return child;}
    setAttribute(key,value){this.attributes[key]=value;}
  }
  a.context.document={createElement:()=>new Element()};
  a.context.navigator={clipboard:{writeText:async text=>copied.push(text)}};
  a.context.setTimeout=()=>{};a.context.calls=calls;
  a.run('agentEditMessage=i=>calls.push(["edit",i]);agentRewind=i=>calls.push(["rewind",i])');
  const message=new Element(),content=new Element();message.appendChild(content);a.context.message=message;
  a.run('agentMessageTools(message,{role:"user",content:"original message"},3)');
  const [body,tools]=message.children;
  assert.deepEqual(body.children,[content], '文本、意图和时间保留在气泡内');
  assert.equal(tools.children.length,3);
  assert.deepEqual(tools.children.map(x=>x.attributes['aria-label']),['复制','修改重发','回退到这里']);
  await tools.children[0].onclick();tools.children[1].onclick();tools.children[2].onclick();
  assert.deepEqual(copied,['original message']);assert.deepEqual(calls.map(x=>Array.from(x)),[['edit',3],['rewind',3]]);
});

test('a late conversation history response cannot overwrite a newer selection', async () => {
  const a=planningApp(),list={innerHTML:'',scrollTop:0,scrollHeight:0};
  a.context.document={querySelector:s=>s==='#agentMessages'?list:null};
  const pending={};
  a.context.fetch=(url,options)=>new Promise(resolve=>{
    pending[JSON.parse(options.body).data.conversationId]=data=>resolve({ok:true,text:async()=>JSON.stringify(data)});
  });
  a.run("agentRenderTranscript=()=>{};agentRenderEmptyState=()=>{};agentState.conversationId='B'");
  const older=a.run('agentLoadOwnHistory()');
  a.run("agentState.conversationId='A'");
  const newer=a.run('agentLoadOwnHistory()');
  pending.A({messages:[{role:'user',content:'A only'}]});await newer;
  pending.B({messages:[{role:'user',content:'B only'}]});await older;
  assert.deepEqual(a.json('agentState.messages'),[{role:'user',content:'A only'}]);
  assert.equal(a.run('agentState.historyLoading'),false);
});

test('draft cards and unsent input belong to their own conversation', () => {
  const a=planningApp(),input={value:'unsent A'},cards={innerHTML:'',appendChild:()=>{}};
  a.context.document={querySelector:s=>s==='#agentInput'?input:s==='#agentDraftCards'?cards:null};
  a.run("agentSyncDraftLayout=()=>{};agentSyncPlanButton=()=>{};agentState.conversationId='A';var boardA={el:{},tasks:[{name:'A task'}]};agentState.planBoard=boardA;agentState.plan=true;agentUseConversation('B')");
  assert.equal(a.run('agentState.planBoard'),null);assert.equal(input.value,'');
  a.run("var boardB={el:{}};agentState.planBoard=boardB");input.value='unsent B';
  a.run("agentUseConversation('A')");
  assert.equal(a.run('agentState.planBoard===boardA'),true);assert.equal(input.value,'unsent A');
  assert.equal(a.run('agentState.plan'),true);
  a.run("agentUseConversation('B')");assert.equal(a.run('agentState.planBoard===boardB'),true);assert.equal(input.value,'unsent B');
});

test('read-only or loading assistant states cannot submit plans or messages', async () => {
  const a=planningApp(),input={value:'create a task'};
  a.context.document={querySelector:s=>s==='#agentInput'?input:null};
  let writes=0;a.context.fetch=async()=>{writes++;return {ok:true,text:async()=>'{}'}};
  a.run("var board=planDraft({tasks:[{name:'old task',assignee:'test001'}]});agentState.viewing='test001'");
  await a.run('planSubmit(board)');await a.run('agentSubmit()');await a.run("agentPlanSubmit('create')");
  a.run('agentState.viewing=null;agentState.historyLoading=true');
  await a.run('planSubmit(board)');await a.run('agentSubmit()');
  assert.equal(writes,0);assert.equal(input.value,'create a task');
});

test('a late delete receipt cannot clear another account with the same conversation id', async () => {
  const a=planningApp(),list={innerHTML:'other account transcript'};
  a.context.document={querySelector:s=>s==='#agentMessages'?list:null};
  let finish;a.context.fetch=()=>new Promise(resolve=>{finish=()=>resolve({ok:true,text:async()=>'{}'})});
  a.run("agentState.conversationId='own';agentState.viewing='test001';agentState.viewConversation='legacy';agentRenderSessions=()=>{}");
  const deletion=a.run("agentDeleteConversation('legacy','test001')");
  a.run("agentState.viewing='test002';agentState.viewConversation='legacy'");finish();await deletion;
  assert.equal(list.innerHTML,'other account transcript');assert.equal(a.run('agentState.viewConversation'),'legacy');
});

test('every project staffing figure uses the displayed window', () => {
  const a=app();
  a.run("S.today='2026-11-03';S.user={id:'test001'};S.users=[{id:'test001'}];S.tasks=[{id:'far',projectId:'p',assignee:'test001',date:'2026-12-03',duration:60,status:'todo'}]");
  const html=a.run("projectStaffing({id:'p',owner:'test001',status:'active',members:{test001:'accepted'}},true)");
  assert.ok(html.includes('近两周'));assert.ok(html.includes('进行中 0 · 已完成 0'));assert.ok(!html.includes('1 小时'));
});

test('assistant dimensions clamp to the viewport without overwriting desired sizes', () => {
  const a=app();
  a.run('agentPanelSizes.chat={width:600,height:700};agentPanelSizes.plan={width:1100,height:820}');
  assert.deepEqual(a.json("agentPanelDimensions('chat',800,500)"),{width:600,height:452});
  assert.deepEqual(a.json("agentPanelDimensions('chat',1440,1050)"),{width:600,height:700});
  assert.deepEqual(a.json("agentPanelDimensions('plan',390,900)"),{width:366,height:820});
  assert.deepEqual(a.json('agentPanelSizes.plan'),{width:1100,height:820});
  assert.equal(a.run("agentPanelBounds('history-plan',1440,1050).minWidth"),980);
});

test('assistant size storage rejects corrupt or unavailable preferences', () => {
  const a=app();
  for(const value of ['{broken','null',JSON.stringify({chat:{width:'600',height:500},plan:{width:-1,height:600}})]){
    a.context.localStorage={getItem:()=>value};assert.deepEqual(a.json('readAgentPanelSizes()'),{});
  }
  a.context.localStorage={getItem:()=>{throw new Error('denied')}};assert.deepEqual(a.json('readAgentPanelSizes()'),{});
  a.context.localStorage={getItem:()=>JSON.stringify({chat:{width:600,height:700}})};
  assert.deepEqual(a.json('readAgentPanelSizes()'),{chat:{width:600,height:700}});
});

test('resizing height on a narrow screen preserves the desired width', () => {
  const a=app();a.context.window={innerWidth:761,innerHeight:650};a.context.document={};
  a.context.localStorage={setItem:()=>{}};
  a.run("agentPanelSizes.history={width:840,height:730};setAgentPanelSize('history',713,582,true,'n')");
  assert.deepEqual(a.json('agentPanelSizes.history'),{width:840,height:582});
  assert.deepEqual(a.json("agentPanelDimensions('history',1440,1050)"),{width:840,height:582});
});

/* AI 接入与模型: a source is tested against what is saved; only the newest test
   of a source may report, and an edit or an account change voids the one running. */
function aiApp(){
  const a=planningApp(),pending=[];
  a.context.document={querySelector:()=>null};
  a.run("UI.settingsPage='ai';S.user={id:'superadmin',admin:1,role:'superadmin'};renderAiSettingsPage=()=>{};renderSettingsSummaries=()=>{};"
    +"aiSettings={sources:[{id:'main',name:'默认来源',models:['old']}],scenes:{},sceneInfo:[],contextChars:32000}");
  a.context.fetch=(path,options)=>new Promise(resolve=>pending.push({body:JSON.parse(options.body),reply:(data,ok=true)=>resolve({ok,text:async()=>JSON.stringify(data)})}));
  return {...a,pending};
}

test('a source test uses the saved source and reports its outcome', async () => {
  const a=aiApp(),run=a.run("aiTestSource('main')");
  assert.deepEqual(a.pending[0].body,{action:'agent.config.test',data:{sourceId:'main'}});
  assert.equal(a.run("aiTests.main.busy"),true);
  a.pending[0].reply({ok:false,reason:'HTTP 401 · 密钥无效'});await run;
  assert.deepEqual(a.json('aiTests.main'),{run:1,state:'fail',text:'HTTP 401 · 密钥无效'});
});

test('only the newest test of a source may report', async () => {
  const a=aiApp(),first=a.run("aiTestSource('main')"),second=a.run("aiTestSource('main')");
  a.pending[1].reply({ok:false,reason:'新结果'});await second;
  a.pending[0].reply({ok:false,reason:'旧结果'});await first;
  assert.equal(a.run('aiTests.main.text'),'新结果');
});

test('editing a source or switching account voids the test in flight', async () => {
  for(const change of ["aiTests.main={run:aiTests.main.run+1}","S.user={id:'test001'}"]){
    const a=aiApp(),run=a.run("aiTestSource('main')");a.run(change);
    a.pending[0].reply({ok:false,reason:'过期的结果'});await run;
    assert.notEqual(a.run('aiTests.main.text'),'过期的结果',change);
  }
});

test('a scene keeps its model when the new source offers it, else takes a chat model', () => {
  const a=aiApp();
  assert.deepEqual(a.json("aiSceneModels({models:['a','b']},'c')"),['a','b','c'],'正在用的模型留在列表里');
  assert.deepEqual(a.json("aiSceneModels(null,'')"),[]);
  const page=source.match(/function bindAiSettingsPage\(box\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/list\.includes\(current\)\?current:agentPreferredModel\(list\)/.test(page));
  assert.ok(/if\(!id\)\{aiSaveScene\(scene,\{source:''\}\)/.test(page),'规划和纪要可以改回跟随对话助手');
});

test('scene changes are sent in order and only the final selection is rendered', async () => {
  const a=aiApp();a.run('agentLoadServerConfig=()=>{};flashSaved=()=>{};var renders=[];renderAiSettingsPage=()=>renders.push(aiSettings.scenes.chat.model)');
  const settings=a.json('aiSettings');
  const first=a.run("aiSaveScene('chat',{source:'main',model:'first'})");
  const second=a.run("aiSaveScene('chat',{source:'main',model:'second'})");
  await new Promise(setImmediate);
  assert.equal(a.pending.length,1,'only one mutation may be in flight');
  assert.equal(a.pending[0].body.data.model,'first');
  a.pending[0].reply({...settings,scenes:{chat:{source:'main',model:'first'}}});await first;
  await new Promise(setImmediate);
  assert.deepEqual(a.json('renders'),[],'do not redraw an obsolete selection');
  assert.equal(a.pending[1].body.data.model,'second');
  a.pending[1].reply({...settings,scenes:{chat:{source:'main',model:'second'}}});await second;
  assert.deepEqual(a.json('renders'),['second']);
  assert.equal(a.run('aiScenePending'),0);
});

test('a failed scene save does not block the next save or claim success', async () => {
  const a=aiApp();a.run('agentLoadServerConfig=()=>{};var successes=0;flashSaved=()=>successes++');
  const settings=a.json('aiSettings'),first=a.run("aiSaveScene('chat',{source:'main',model:'bad'})");
  await new Promise(setImmediate);a.pending[0].reply({error:'失败'},false);await first;
  assert.equal(a.run('successes'),0);
  const second=a.run("aiSaveScene('chat',{source:'main',model:'good'})");
  await new Promise(setImmediate);a.pending[1].reply({...settings,scenes:{chat:{source:'main',model:'good'}}});await second;
  assert.equal(a.run('successes'),1);
  assert.equal(a.run('aiSettings.scenes.chat.model'),'good');
});

test('account changes discard pending scene responses and unsent changes', async () => {
  const a=aiApp(),before=a.json('aiSettings');
  const first=a.run("aiSaveScene('chat',{source:'main',model:'first'})");
  const second=a.run("aiSaveScene('chat',{source:'main',model:'second'})");
  await new Promise(setImmediate);a.run("S.user={id:'test001'}");
  a.pending[0].reply({...before,scenes:{chat:{model:'first'}}});await Promise.all([first,second]);
  assert.equal(a.pending.length,1);
  assert.deepEqual(a.json('aiSettings'),before);
});

test('a settings read started before a scene change cannot restore the old selection', async () => {
  const a=aiApp();a.run('agentLoadServerConfig=()=>{};flashSaved=()=>{}');
  const before=a.json('aiSettings'),load=a.run('loadAiSettings()');
  const save=a.run("aiSaveScene('chat',{source:'main',model:'new'})");
  await new Promise(setImmediate);
  a.pending[1].reply({...before,scenes:{chat:{source:'main',model:'new'}}});await save;
  a.pending[0].reply(before);await load;
  assert.equal(a.run('aiSettings.scenes.chat.model'),'new');
});

function aiEditorApp(){
  const a=planningApp(),pending=[];
  let form=null,html='';
  const box={querySelectorAll:()=>[],querySelector:s=>s==='.ai-source-editor'?form:null,
    get innerHTML(){return html},set innerHTML(value){
      html=value;const match=value.match(/<form class="ai-source-editor" data-editor="([^"]*)" data-kind="([^"]*)"/);
      if(!match){form=null;return}
      const field=name=>({value:(value.match(new RegExp('name="'+name+'"[^>]*value="([^"]*)"'))||[])[1]||'',focus(){a.context.document.activeElement=this}});
      const elements=Object.fromEntries(['name','baseUrl','apiKey'].map(k=>[k,field(k)])),submit={disabled:false};
      form={dataset:{editor:match[1],kind:match[2]},elements,querySelector:()=>submit,contains:node=>Object.values(elements).includes(node),replaceWith:node=>{form=node}};
    }};
  a.context.document={querySelector:s=>s==='#settingsPage'?box:null,activeElement:null};
  a.context.fetch=(url,options)=>new Promise(resolve=>pending.push({body:JSON.parse(options.body),reply:data=>resolve({ok:true,text:async()=>JSON.stringify(data)})}));
  a.run(`UI.view='settings';UI.settingsPage='ai';renderSettingsSummaries=()=>{};
    aiSettings={sources:[{id:'a',name:'A',kind:'chat',provider:'custom',baseUrl:'http://a.example/v1',models:['a']},
    {id:'b',name:'B',kind:'chat',provider:'custom',baseUrl:'http://b.example/v1',models:[]}],scenes:{},sceneInfo:[],contextChars:32000};`);
  return {...a,pending,box,get form(){return form}};
}

test('a completed source test preserves another editor, its key, focus and submit state', async () => {
  for(const ok of [true,false]){
    const a=aiEditorApp(),settings=a.json('aiSettings'),probe=a.run("aiTestSource('a')");
    a.run("aiEditing={id:'b'};renderAiSettingsPage()");
    const editor=a.form;
    editor.elements.name.value='New B';editor.elements.baseUrl.value='http://draft.example/v1';editor.elements.apiKey.value='unsaved-key';
    editor.elements.apiKey.focus();editor.elements.apiKey.selectionStart=3;editor.querySelector().disabled=true;
    a.pending[0].reply({ok,message:'成功',reason:'失败'});
    if(ok){await new Promise(setImmediate);assert.equal(a.pending[1].body.action,'ai.settings.get');
      a.run('renderAiSettingsPage()');assert.equal(a.form,editor,'refresh while the settings read is pending also keeps the editor');
      a.pending[1].reply(settings)}
    await probe;
    assert.equal(a.form,editor);assert.equal(editor.elements.name.value,'New B');
    assert.equal(editor.elements.baseUrl.value,'http://draft.example/v1');assert.equal(editor.elements.apiKey.value,'unsaved-key');
    assert.equal(a.context.document.activeElement,editor.elements.apiKey);assert.equal(editor.elements.apiKey.selectionStart,3);
    assert.equal(editor.querySelector().disabled,true);
    a.run('aiEditing=null;renderAiSettingsPage()');assert.equal(a.form,null,'cancel discards the editor');
  }
});

test('new source drafts survive refresh but do not leak into a different editor', () => {
  const a=aiEditorApp();a.run("aiEditing={kind:'chat'};renderAiSettingsPage()");
  const draft=a.form;draft.elements.apiKey.value='draft-key';
  a.run('renderAiSettingsPage()');assert.equal(a.form,draft);
  a.run("aiEditing={id:'b'};renderAiSettingsPage()");
  assert.notEqual(a.form,draft);assert.equal(a.form.elements.apiKey.value,'');
});

test('speech settings offer disable and refresh shared dictation status after saving', async () => {
  const a=aiEditorApp();a.run(`aiSettings.sources.push({id:'speech',kind:'speech',name:'ASR',models:['whisper-1']});
    aiSettings.sceneInfo=[{id:'transcribe',name:'语音转写',desc:''}];aiSettings.scenes.transcribe={disabled:true};renderAiSettingsPage()`);
  assert.match(a.box.innerHTML,/<option value="" selected>停用<\/option>/);
  assert.match(a.box.innerHTML,/<input value="" disabled aria-label="模型">/);
  const b=aiApp();b.run('agentLoadServerConfig=()=>{};var refreshes=0;loadSpeechStatus=()=>refreshes++;flashSaved=()=>{}');
  const settings=b.json('aiSettings'),save=b.run("aiSaveScene('transcribe',{source:''})");
  await new Promise(setImmediate);assert.deepEqual(b.pending[0].body.data,{scene:'transcribe',source:''});
  b.pending[0].reply({...settings,scenes:{transcribe:{disabled:true}}});await save;
  assert.equal(b.run('refreshes'),1);
});

test('reasoning controls show the effective setting and inheritance without a speech control', () => {
  const a=aiEditorApp();a.run(`aiSettings.sceneInfo=[{id:'chat',name:'对话',desc:''},{id:'plan',name:'规划',desc:''},{id:'transcribe',name:'语音',desc:''}];
    aiSettings.sources.push({id:'speech',kind:'speech',name:'ASR',models:['whisper-1']});
    aiSettings.scenes={chat:{source:'a',model:'a',reasoningEffort:'high'},plan:{source:'a',model:'a',follows:true,reasoningEffort:'high'},transcribe:{source:'speech',model:'whisper-1'}};
    renderAiSettingsPage()`);
  assert.match(a.box.innerHTML,/<select data-scene-reasoning="chat"[^>]*>[\s\S]*?<option value="high" selected>高<\/option>/);
  assert.match(a.box.innerHTML,/<select data-scene-reasoning="plan"[^>]* disabled>/);
  assert.doesNotMatch(a.box.innerHTML,/data-scene-reasoning="transcribe"/);
  a.run('delete aiSettings.scenes.chat.reasoningEffort;renderAiSettingsPage()');
  assert.match(a.box.innerHTML,/<option value="auto" selected>默认<\/option>/);
});

test('reasoning selection saves only the changed field through the scene queue', async () => {
  const a=aiEditorApp(),input={dataset:{sceneReasoning:'chat'},value:'high'};
  a.box.querySelectorAll=s=>s==='[data-scene-reasoning]'?[input]:[];
  a.run('agentLoadServerConfig=()=>{};flashSaved=()=>{};renderAiSettingsPage()');
  input.onchange();await new Promise(setImmediate);
  assert.deepEqual(a.pending[0].body,{action:'ai.scene.set',data:{scene:'chat',reasoningEffort:'high'}});
  a.pending[0].reply({...a.json('aiSettings'),scenes:{chat:{source:'a',model:'a',reasoningEffort:'high'}}});
  await a.run('aiSceneQueue');assert.equal(a.run('aiSettings.scenes.chat.reasoningEffort'),'high');
});

test('the assistant no longer carries its own connection form; its gear opens settings', () => {
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(!/id="agentConfig"|id="agentAsrEndpoint"/.test(html));
  assert.ok(/data-settings-page="ai"/.test(html)&&/data-settings-page="prompt"/.test(html),'AI 和纪要提示词各自是子页面');
  assert.ok(/agentConfigBtn'\)\?\.addEventListener\('click',\(\)=>openSettingsPage\('ai'\)\)/.test(source));
});

test('retrieval badges show compact outcomes without displaying query text or data',()=>{
  const a=planningApp(),children=[];
  a.context.document={createElement:()=>({})};a.context.node={appendChild:n=>children.push(n)};
  a.run("agentToolSummary(node,[{name:'workspace_schema',ok:true},{name:'workspace_query',ok:false,sql:'private SQL'},{name:'business_action',ok:true}])");
  assert.equal(children.length,1);assert.equal(children[0].textContent,'查询资料 · 2 次 · 1 次未成功');
  assert.ok(!JSON.stringify(children).includes('private SQL'));
});

test('stored tool metadata is never replayed as model conversation data',()=>{
  const a=planningApp();
  a.run("agentState.messages=[{role:'assistant',content:'查到了',tools:[{name:'workspace_query',ok:true,rows:20}]}]");
  assert.deepEqual(a.json('agentRecentMessages()'),[{role:'assistant',content:'查到了'}]);
});

function mutationTask(overrides={}){
  return {operation:'update',id:'existing',revision:'version-1',before:{name:'原任务',desc:'保留说明',assignee:'test001',date:'2026-11-01',deadline:'2026-11-05',time:'10:30',duration:30,priority:'P1',status:'doing',projectId:null,creator:'test001',fixed:false},...overrides};
}
test('editing an existing card preserves past dates and sends only changed fields with the reviewed version',async()=>{
  const a=planningApp(),writes=[];a.context.document={querySelector:()=>null};
  a.context.fetch=async(path,o)=>{writes.push(JSON.parse(o.body));return {ok:true,text:async()=>'{"id":"existing"}'}};
  a.context.raw=mutationTask({name:'拟修改名称'});a.run(`refresh=async()=>{};agentAppend=()=>{};var board={...planDraft({tasks:[raw]}),el:{querySelector:()=>null},history:[]};`);
  assert.equal(a.run('board.tasks[0].date'),'2026-11-01');
  assert.deepEqual(a.json('planChanges(board.tasks[0],"task")'),{name:'拟修改名称'});
  assert.deepEqual(a.json('planProblems(board,board.tasks[0])'),{});
  await a.run('planSubmit(board)');
  assert.equal(writes[0].action,'work.card.apply');assert.equal(writes[0].data.revision,'version-1');
  assert.deepEqual(writes[0].data.changes,{name:'拟修改名称'});
  await a.run('planSubmit(board)');assert.equal(writes.length,1);
});
test('delete cards cannot submit before human confirmation and never use automatic action execution',async()=>{
  const a=planningApp(),writes=[];a.context.document={querySelector:()=>null};
  a.context.fetch=async(path,o)=>{writes.push(JSON.parse(o.body));return {ok:true,text:async()=>'{"deleted":true}'}};
  a.context.raw=mutationTask({operation:'delete'});
  a.run(`refresh=async()=>{};agentAppend=()=>{};agentState.mode='auto';var board={...planDraft({tasks:[raw]}),el:{querySelector:()=>null},history:[]};`);
  await a.run('planSubmit(board)');assert.equal(writes.length,0);
  a.run('board.tasks[0].deleteConfirmed=true');await a.run('planSubmit(board)');
  assert.equal(writes.length,1);assert.equal(writes[0].data.operation,'delete');assert.equal(writes[0].data.confirm,'原任务');
  assert.ok(!a.run('planCardsHTML({...planDraft({tasks:[raw]})})').includes('<pre'));
});
test('project deletion shows impact and requires the full original name, independent of editable titles',()=>{
  const a=planningApp();a.run(`var board=planDraft({projects:[{operation:'delete',id:'p',revision:'r',before:{name:'重要项目',owner:'test001'},impact:{tasks:12,files:3,repeats:2,meetings:4,messages:15}}]});`);
  assert.ok(a.run('planProblems(board,board.projects[0]).confirm'));
  a.run("board.projects[0].confirm='重要';board.projects[0].name='重要'");
  assert.ok(a.run('planProblems(board,board.projects[0]).confirm'));
  a.run("board.projects[0].confirm='重要项目'");assert.deepEqual(a.json('planProblems(board,board.projects[0])'),{});
  const html=a.run('planCardsHTML(board)');assert.ok(html.includes('12 项任务')&&html.includes('3 个附件')&&html.includes('2 条固定安排')&&html.includes('4 场会议')&&html.includes('15 条沟通记录'));
});
test('a member change card follows approval rights and requires a reason instead of rewriting task ownership',()=>{
  const a=planningApp();a.context.raw=mutationTask({name:'申请修改',before:{...mutationTask().before,creator:'test002'}});
  a.run(`S.user={id:'test001',admin:0};var board=planDraft({tasks:[raw]});`);
  assert.equal(a.run('planTaskPath(board,board.tasks[0]).mode'),'approval');
  assert.ok(a.run('planProblems(board,board.tasks[0]).reason'));
  a.run("board.tasks[0].reason='原安排需调整'");assert.deepEqual(a.json('planProblems(board,board.tasks[0])'),{});
});
test('failed card retry does not replay completed cards; duplicate targets are rejected before writes',async()=>{
  const a=planningApp(),writes=[];a.context.document={querySelector:()=>null};
  a.context.fetch=async(path,o)=>{const b=JSON.parse(o.body);writes.push(b);if(b.data.id==='b'&&writes.filter(x=>x.data.id==='b').length===1)return {ok:false,text:async()=>'{"error":"目标已变化"}'};return {ok:true,text:async()=>'{"id":"ok"}'}};
  a.context.raw=mutationTask({name:'改名'});a.run(`refresh=async()=>{};agentAppend=()=>{};var board={...planDraft({tasks:[{...raw,id:'a'},{...raw,id:'b'}]}),el:{querySelector:()=>null},history:[]};`);
  await a.run('planSubmit(board)');assert.equal(a.run('board.tasks[0].state'),'done');assert.equal(a.run('board.tasks[1].state'),'draft');
  await a.run('planSubmit(board)');assert.deepEqual(writes.map(x=>x.data.id),['a','b','b']);
  a.run('board=planDraft({tasks:[raw,{...raw,operation:"delete"}]})');
  assert.ok(a.run('planProblems(board,board.tasks[0]).target'));
});

test('accepting one card ignores unrelated invalid cards and leaves their fields untouched',async()=>{
  const a=planningApp(),writes=[];a.context.document={querySelector:()=>null};
  a.context.fetch=async(path,o)=>{writes.push(JSON.parse(o.body));return {ok:true,text:async()=>'{"id":"accepted"}'}};
  a.run(`refresh=async()=>{};agentAppend=()=>{};var board={...planDraft({tasks:[{name:'接受这一张',assignee:'test001'},{name:'',assignee:''},{name:'保留这一张',assignee:'test002'}]}),el:{querySelector:()=>null},history:[]};var untouched=JSON.stringify(board.tasks.slice(1));`);
  await a.run('planSubmit(board,[board.tasks[0]])');
  assert.equal(writes.length,1);assert.equal(writes[0].data.changes.name,'接受这一张');
  assert.equal(a.run('JSON.stringify(board.tasks.slice(1))'),a.run('untouched'));
  assert.equal(a.run('planOpenCards(board).length'),2);assert.ok(!a.run('board.closed'));
  const html=a.run('planCardsHTML(board)');assert.ok(!html.includes('接受这一张'));assert.ok(html.includes('plan-accept')&&html.includes('plan-reject')&&html.includes('data-plan-select'));
});
test('multiselect accepts only selected cards and keeps a failed selection available for retry',async()=>{
  const a=planningApp(),writes=[];a.context.document={querySelector:()=>null};
  a.context.fetch=async(path,o)=>{const b=JSON.parse(o.body);writes.push(b);if(b.data.changes.name==='B'&&writes.filter(x=>x.data.changes.name==='B').length===1)return {ok:false,text:async()=>'{"error":"暂时失败"}'};return {ok:true,text:async()=>'{"id":"ok"}'}};
  a.run(`refresh=async()=>{};agentAppend=()=>{};var board={...planDraft({tasks:['A','B','C'].map(name=>({name,assignee:'test001'}))}),el:{querySelector:()=>null},history:[]};board.tasks[0].selected=true;board.tasks[1].selected=true;`);
  await a.run('planSubmit(board,planSelectedCards(board))');
  assert.deepEqual(writes.map(x=>x.data.changes.name),['A','B']);
  assert.equal(a.run('planSelectedCards(board)[0].name'),'B');assert.equal(a.run('board.tasks[2].state'),'draft');
  await a.run('planSubmit(board,planSelectedCards(board))');
  assert.deepEqual(writes.map(x=>x.data.changes.name),['A','B','B']);assert.equal(a.run('planOpenCards(board)[0].name'),'C');
});
test('rejecting a project is local, preserves dependent task data and can be undone',async()=>{
  const a=planningApp();let writes=0;a.context.fetch=async()=>{writes++;throw Error('must not write')};
  a.run(`var board={...planDraft({projects:[{ref:'P1',name:'新项目',owner:'test001'}],tasks:[{name:'待处理任务',assignee:'test001',projectRef:'P1'}]}),el:{},history:[]};var beforeTask=JSON.stringify(board.tasks[0]);`);
  await a.run('planReject(board,[board.projects[0]])');
  assert.equal(writes,0);assert.equal(a.run('board.projects[0].state'),'rejected');
  assert.equal(a.run('JSON.stringify(board.tasks[0])'),a.run('beforeTask'));
  assert.equal(a.run('planTaskPath(board,board.tasks[0]).mode'),'none');
  assert.ok(a.run('planCardsHTML(board)').includes('原新项目已拒绝'));
  a.run('planUndo(board)');assert.equal(a.run('board.projects[0].state'),'draft');
});
test('a child accepted alone never implicitly accepts its project; selected dependencies submit in order',async()=>{
  const a=planningApp(),writes=[];a.context.document={querySelector:()=>null};
  a.context.fetch=async(path,o)=>{const b=JSON.parse(o.body);writes.push(b);return {ok:true,text:async()=>'{"id":"project-created","status":"active"}'}};
  a.run(`agentAppend=()=>{};refresh=async()=>{S.projects=[{id:'project-created',name:'新项目',owner:'test001',status:'active',members:{test001:'accepted'}}]};var board={...planDraft({projects:[{ref:'P1',name:'新项目',owner:'test001'}],tasks:[{name:'子任务',assignee:'test001',projectRef:'P1'}]}),el:{},history:[]};`);
  await a.run('planSubmit(board,[board.tasks[0]])');assert.equal(writes.length,0);assert.equal(a.run('board.projects[0].state'),'draft');
  await a.run('planSubmit(board,[board.tasks[0],board.projects[0]])');
  assert.deepEqual(writes.map(x=>x.data.kind),['project','task']);assert.equal(writes[1].data.changes.projectId,'project-created');
});
test('accept-all processes valid cards and retains invalid cards instead of blocking the entire group',async()=>{
  const a=planningApp(),writes=[];a.context.document={querySelector:()=>null};
  a.context.fetch=async(path,o)=>{writes.push(JSON.parse(o.body));return {ok:true,text:async()=>'{"id":"made"}'}};
  a.run(`refresh=async()=>{};agentAppend=()=>{};var board={...planDraft({tasks:[{name:'',assignee:''},{name:'有效卡',assignee:'test001'}]}),el:{},history:[]};`);
  await a.run('planSubmit(board)');assert.equal(writes.length,1);assert.equal(a.run('planOpenCards(board).length'),1);assert.equal(a.run('board.tasks[0].state'),'draft');assert.ok(a.run('planProblems(board,board.tasks[0]).name'));assert.equal(a.run('planConfirmLabel()'),'全部接受');
});
test('a visual exit failure cannot turn an already accepted card back into a retryable card',async()=>{
  const a=planningApp(),writes=[];a.context.document={querySelector:()=>null};
  a.context.fetch=async(path,o)=>{writes.push(JSON.parse(o.body));return {ok:true,text:async()=>'{"id":"made"}'}};
  a.run(`refresh=async()=>{};agentAppend=()=>{};var board={...planDraft({tasks:[{name:'动画不能影响业务',assignee:'test001'}]}),el:{querySelectorAll:()=>[{dataset:{key:'t0'},animate:()=>{throw Error('animation unavailable')}}]},history:[]};`);
  await a.run('planSubmit(board)');assert.equal(a.run('board.tasks[0].state'),'done');await a.run('planSubmit(board)');assert.equal(writes.length,1);
});

/* Assistant audit: durable intent, recovery and visible feedback. */
test('a long execution retains its original goal after more than 24 trail messages',()=>{
  const a=planningApp();a.run(`agentState.runGoal='原始目标：为所有成员调整例行安排';agentState.messages=[{role:'user',content:agentState.runGoal}];for(let i=0;i<18;i++)agentState.messages.push({role:'assistant',content:'提案'+i},{role:'user',content:'【系统回执】步骤'+i});`);
  const recent=a.json('agentRecentMessages()');assert.ok(recent.some(m=>m.content==='原始目标：为所有成员调整例行安排'));assert.ok(recent.length<=25);
});
test('verification detects repeat time, task duration and description edits',()=>{
  const a=planningApp();a.run(`S.repeats=[{id:'r',name:'例行任务',time:'09:00',active:true}];S.tasks=[{id:'t',name:'任务',duration:30,desc:'原文'}];var before=agentFingerprint();S.repeats[0].time='10:00';S.tasks[0].duration=45;S.tasks[0].desc='更正';`);
  assert.equal(a.json('agentVerify(before,agentFingerprint())').length,2);
});
test('recovered card receipts override a stale draft and restore project dependencies',()=>{
  const a=planningApp();a.run(`var board=planDraft({draftId:'draft-identity',projects:[{ref:'P',cardId:'project-identity',name:'项目'}],tasks:[{name:'子任务',cardId:'task-identity',projectRef:'P'}]});board.projects[0].selected=true;planApplyReceipts(board,{'project-identity':{id:'created-project'}});`);
  assert.equal(a.run('board.projects[0].state'),'done');assert.equal(a.run('board.projects[0].selected'),false);assert.equal(a.run('board.tasks[0].project'),'id:created-project');assert.equal(a.run('board.tasks[0].state'),'draft');
});
test('restoring a saved draft keeps edited fields and rejected decisions',async()=>{
  const a=planningApp(),cache=new Map();a.context.localStorage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)};a.context.document={querySelector:()=>null};
  a.context.saved={version:3,board:{projects:[],tasks:[{key:'t0',cardId:'task-identity',name:'用户编辑',state:'rejected'}],next:1},receipts:{}};
  a.context.fetch=async()=>({ok:true,text:async()=>JSON.stringify(a.context.saved)});
  a.run(`agentState.conversationId='thread';agentPlanBoard=raw=>({...planDraft(raw),conversationId:'thread',el:{querySelector:()=>null}});`);
  const board=await a.run(`agentRestoreBoard({draftId:'draft-identity',tasks:[{name:'原名',cardId:'task-identity'}]})`);
  assert.equal(board.tasks[0].name,'用户编辑');assert.equal(board.tasks[0].state,'rejected');assert.equal(board.persistVersion,3);
});
test('draft saving serializes edits against the returned version and keeps stable IDs',async()=>{
  const a=planningApp(),pending=[],cache=new Map();a.context.document={querySelector:()=>null};a.context.clearTimeout=()=>{};a.context.localStorage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)};
  a.context.fetch=(path,o)=>new Promise(resolve=>pending.push({body:JSON.parse(o.body),reply:v=>resolve({ok:true,text:async()=>JSON.stringify(v)})}));
  a.run(`var board={...planDraft({draftId:'draft-identity',tasks:[{cardId:'task-identity',name:'A'}]}),conversationId:'thread',el:{querySelector:()=>null}};`);
  const first=a.run('planFlush(board)');a.run("board.tasks[0].name='B'");const second=a.run('planFlush(board)');
  assert.equal(pending[0].body.data.version,0);pending[0].reply({version:1});await new Promise(r=>setImmediate(r));
  assert.equal(pending[1].body.data.version,1);assert.equal(pending[1].body.data.board.tasks[0].name,'B');pending[1].reply({version:2});await Promise.all([first,second]);assert.equal(a.run('board.persistVersion'),2);assert.equal(a.run('board.tasks[0].cardId'),'task-identity');
});
test('native account confirmation never displays model supplied credentials',()=>{
  const a=planningApp();const html=a.run(`agentActionHTML('account.create',{username:'member001',password:'fixture-never-visible',nested:{apiKey:'fixture-nested-secret'}})`);
  assert.ok(html.includes('member001'));assert.ok(!html.includes('fixture-never-visible'));assert.ok(!html.includes('fixture-nested-secret'));
});
test('an already successful write stays successful if refreshing its view fails',async()=>{
  const a=planningApp(),nodes={},buttonNodes={},steps=[];let writes=0;
  const buttons={innerHTML:'',querySelector:s=>buttonNodes[s]||(buttonNodes[s]={})};const card={innerHTML:'',isConnected:true,querySelector:()=>buttons};
  a.context.document={createElement:()=>card,querySelector:()=>({appendChild(){},scrollHeight:0})};a.context.fetch=async()=>{writes++;return {ok:true,text:async()=>'{"id":"created"}'}};a.context.steps=steps;
  a.run(`agentActionHTML=()=>'';refresh=async()=>{throw Error('render failed')};agentRecordStep=(a,b)=>steps.push(b);var promise=agentRunOne({action:'repeat.create',data:{name:'安排'}});`);
  await buttonNodes['.agent-action-confirm'].onclick();const result=await a.context.promise;
  assert.equal(writes,1);assert.equal(Boolean(result.failed),false);assert.ok(steps[0].includes('执行成功'));assert.ok(steps[0].includes('不要重复提交'));
});
test('recorded MP4 preserves MIME and exposes transcribing state until its own response',async()=>{
  const a=voiceApp(),instances=[];let respond,uploaded;
  a.context.AbortController=AbortController;a.context.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
  a.context.MediaRecorder=class{static isTypeSupported(m){return m==='audio/mp4'}constructor(stream,o){this.mimeType=o.mimeType;this.state='inactive';instances.push(this)}start(){this.state='recording'}stop(){this.state='inactive';this.onstop()}};
  a.context.apiBlob=(path,blob)=>{uploaded=blob;return new Promise(r=>respond=r)};
  await a.run('agentVoiceStartRecording()');instances[0].ondataavailable({data:{size:10,type:'audio/mp4'}});a.run('agentStopVoice()');
  assert.equal(uploaded.type,'audio/mp4');assert.equal(a.run('voice.transcribing'),true);
  await a.run('agentVoiceStartRecording()');assert.equal(instances.length,1,'转写期间不能覆盖同一录音状态');
  respond({text:'识别结果'});await new Promise(r=>setImmediate(r));assert.equal(a.run('voice.transcribing'),false);assert.equal(a.input.value,'识别结果');
});
test('persisting an edit sends the previous stored message as a durable branch anchor',async()=>{
  const a=planningApp(),calls=[];a.context.document={querySelector:()=>null};a.context.fetch=async(path,o)=>{calls.push(JSON.parse(o.body));return {ok:true,text:async()=>'{"rewound":true}'}};
  a.run(`agentState.conversationId='thread';agentState.editing=2;agentState.messages=[{role:'user',id:'first',content:'保留'},{role:'assistant',id:'anchor',content:'保留'},{role:'user',id:'edited',content:'修改这条'}]`);
  assert.equal(await a.run('agentPersistEdit()'),true);assert.equal(calls[0].data.messageId,'anchor');assert.equal(calls[0].data.conversationId,'thread');
});
test('planning failures preserve a modification request instead of manufacturing a create card',async()=>{
  const a=planningApp(),input={value:'',focus(){}},messages={appendChild(){},scrollHeight:0};a.context.document={querySelector:s=>s==='#agentInput'?input:s==='#agentMessages'?messages:null};a.context.AbortController=AbortController;
  a.run(`var boards=0;agentAppend=()=>({remove(){}});agentPlanBoard=()=>boards++;agentRequest=async()=>{throw Error('fixture failure')};agentState.messages=[];`);
  await a.run("agentPlanSubmit('删除昨天那个任务')");assert.equal(a.run('boards'),0);assert.equal(input.value,'删除昨天那个任务');
});
test('recovery keeps newer local edits when the last acknowledged write came from that page',async()=>{
  const a=planningApp();a.context.document={querySelector:()=>null};a.context.localStorage={getItem:()=>JSON.stringify({version:1,writer:'old-page',board:{projects:[],tasks:[{key:'t0',cardId:'task-identity',name:'最后输入尚未回执',state:'draft'}],next:1}}),setItem(){}};
  a.context.fetch=async()=>({ok:true,text:async()=>JSON.stringify({version:2,writer:'old-page',board:{projects:[],tasks:[{key:'t0',cardId:'task-identity',name:'较早输入',state:'draft'}],next:1},receipts:{'task-identity':{id:'already-created'}}})});
  a.run(`agentState.conversationId='thread';agentPlanBoard=raw=>({...planDraft(raw),conversationId:'thread',el:{querySelector:()=>null}})`);
  const board=await a.run(`agentRestoreBoard({draftId:'draft-identity',tasks:[{name:'原始内容'}]})`);
  assert.equal(board.tasks[0].name,'最后输入尚未回执');assert.equal(board.tasks[0].state,'done','回执仍然覆盖本机过期的待处理状态');
});
test('a queued draft from a previous account never writes into the newly signed-in account',async()=>{
  const a=planningApp();let writes=0;a.context.document={querySelector:()=>null};a.context.fetch=async()=>{writes++;return {ok:true,text:async()=>'{"version":1}'}};
  a.run(`var board={...planDraft({tasks:[{name:'旧账户私有安排'}]}),ownerUser:'old-user',conversationId:'old-thread',el:{querySelector:()=>null}};S.user={id:'new-user',admin:0};`);
  await a.run('planFlush(board)');assert.equal(writes,0);
});
test('narrow workspace tabs support arrow navigation and roving keyboard focus',()=>{
  const a=planningApp(),attrs={};let focused='',prevented=false;
  a.context.document={querySelector:s=>({classList:{toggle(){}},setAttribute:(k,v)=>attrs[s+':'+k]=v,focus:()=>focused=s})};
  a.context.event={key:'ArrowRight',preventDefault(){prevented=true}};a.run("agentState.pane='cards';agentState.planBoard={closed:false};agentPaneKeydown(event)");
  assert.equal(a.run('agentState.pane'),'chat');assert.equal(focused,'#agentPaneChat');assert.equal(attrs['#agentPaneChat:tabindex'],'0');assert.equal(prevented,true);
});
test('card retirement skips motion when reduced motion is requested and still commits its state',async()=>{
  for(const reduced of [false,true]){
    const a=planningApp(),calls=[];a.context.matchMedia=()=>({matches:reduced});a.context.calls=calls;
    a.run(`var x={key:'t0',state:'draft',selected:true};var board={el:{querySelectorAll:()=>[{dataset:{key:'t0'},animate:(frames,options)=>{calls.push(options.duration);return {finished:Promise.resolve()}}}]}};`);
    await a.run("planRetire(board,x,'rejected','已拒绝')");assert.equal(a.run('x.state'),'rejected');assert.equal(a.run('x.selected'),false);assert.deepEqual(calls,reduced?[]:[180]);
  }
});
test('a failed state refresh reports a service error and only 401 opens sign-in',async()=>{
  const a=app();a.run('var signIns=0;showAuth=()=>signIns++');
  a.context.fetch=async()=>({ok:false,status:503,text:async()=>'{"error":"temporary service failure"}'});
  await assert.rejects(a.run('refresh()'),/temporary service failure/);assert.equal(a.run('signIns'),0);
  a.context.fetch=async()=>({ok:false,status:401,text:async()=>'{"error":"请登录"}'});
  await a.run('refresh()');assert.equal(a.run('signIns'),1);
});

test('a stacked period is one deferred card while all period histories remain available',()=>{
  const a=app();
  a.run(`S.user={id:'test001',admin:0};S.projects=[];S.logs=[];S.tasks=[
    {id:'old',name:'routine',assignee:'test001',date:'2026-11-02',status:'deferred',superseded:true},
    {id:'carry',name:'routine',assignee:'test001',date:'2026-11-04',status:'doing',originId:'old',superseded:true},
    {id:'today',name:'routine',assignee:'test001',date:'2026-11-04',status:'todo',stackCount:2,stackTaskIds:['carry','today'],stackPeriods:['old','today'],priority:'P1',duration:30}];`);
  assert.deepEqual(a.json('scheduleTasks().map(t=>t.id)'),['today']);
  assert.equal(a.run('isDeferredTask(S.tasks[2])'),true);
  assert.deepEqual(a.json('[...taskLineageIds(S.tasks[2])].sort()'),['carry','old','today']);
  assert.equal(a.run('deferHops(S.tasks[2])'),0,'期次数不应冒充递延跳数');
  a.run("S.tasks[2].stackDates=['2026-11-02','2026-11-04']");assert.deepEqual(a.json('stackPeriodDates(S.tasks[2])'),['2026-11-02','2026-11-04']);
  assert.match(a.run('taskCard(S.tasks[2])'),/合并 2 期">2 期</);
  a.run("S.tasks[2].status='done'");assert.equal(a.run('isDeferredTask(S.tasks[2])'),false);
});

test('only superadmin sees the stacking switch and failed saves restore its state',async()=>{
  const a=app(),input={checked:false,disabled:false},box={innerHTML:'',hidden:null,classList:{toggle:(name,value)=>{box.hidden=value}},querySelector:()=>input};
  a.context.document={querySelector:s=>s==='#repeatStackingCard'?box:null};
  for(const role of ['member','admin']){a.run(`S.user={role:'${role}'};renderRepeatStackingSetting()`);assert.equal(box.hidden,true);assert.equal(box.innerHTML,'');}
  a.run("S.user={role:'superadmin'};S.repeatStacking=false;renderRepeatStackingSetting();act=async()=>{throw new Error('offline')}");
  assert.equal(box.hidden,false);assert.match(box.innerHTML,/type="checkbox" role="switch"/);assert.ok(!box.innerHTML.includes('<p'));
  input.checked=true;await input.onchange();assert.equal(input.checked,false);assert.equal(input.disabled,false);
});

test('project auto-report switch honors roles, defaults on and changes only enabled',async()=>{
  const a=app(),input={id:'projectAutomationEnabled',checked:false,disabled:false},box={innerHTML:'',querySelector:()=>input};
  a.context.document={querySelector:s=>s==='#projectAutomationToggle'?box:null};
  a.run("S.user={id:'member',admin:0};renderProjectAutomationSetting()");assert.equal(box.innerHTML,'');
  a.run("S.user={id:'admin',admin:1};S.automation={mode:'weekly',time:'03:15',weekdays:[1,3]};renderProjectAutomationSetting()");
  assert.match(box.innerHTML,/role="switch" id="projectAutomationEnabled" checked/);
  const calls=[];a.context.save=async(action,data)=>calls.push({action,data:JSON.parse(JSON.stringify(data))});a.run('act=save');
  input.checked=false;await input.onchange();assert.deepEqual(calls,[{action:'automation.update',data:{enabled:false}}]);
  assert.deepEqual(a.json('S.automation'),{mode:'weekly',time:'03:15',weekdays:[1,3]},'开关不覆盖周期、时间或日期');
  a.run("S.automation.enabled=false;renderProjectAutomationSetting();act=async()=>{throw Error('offline')}");
  assert.ok(!box.innerHTML.includes(' checked'));input.checked=true;await input.onchange();
  assert.equal(input.checked,false);assert.equal(input.disabled,false);
});

test('settings switches lock until the save completes and restore focus to the rendered control',async()=>{
  const a=app(),input={id:'toggle',checked:true,disabled:false},replacement={focus(){this.focused=true}};
  let resolve,called=0;const pending=new Promise(done=>{resolve=done});
  a.context.document={querySelector:()=>replacement};a.context.input=input;
  a.context.save=()=>{called++;return pending};a.run("UI.view='settings';bindSettingSwitch(input,save,()=>false)");
  const first=input.onchange();assert.equal(input.disabled,true);await input.onchange();assert.equal(called,1);
  resolve();await first;assert.equal(input.disabled,false);assert.equal(replacement.focused,true);
});

test('stacked history separates original periods and folds one grouped operation without repeating time',()=>{
  const a=app();
  a.run(`S.tasks=[{id:'old',date:'2026-11-02'},{id:'new',date:'2026-11-03'}];S.logs=[
    {taskId:'old',kind:'defer',target:'2026-11-03',reason:'carry',actor:'system'},
    {taskId:'new',kind:'auto_start',actor:'system'},
    {taskId:'old',kind:'defer',target:'2026-11-04',stackBatchId:'batch',stackCount:2,stackDates:['2026-11-02','2026-11-03'],actor:'test001'},
    {taskId:'new',kind:'defer',target:'2026-11-04',stackBatchId:'batch',stackCount:2,stackDates:['2026-11-02','2026-11-03'],actor:'test001'},
    {taskId:'new',kind:'complete',stackCount:2,stackDates:['2026-11-02','2026-11-03'],actual:25,summary:'<script>x</script>',actor:'test001'}];`);
  const html=a.run("taskHistoryHTML({id:'new',stackCount:4},new Set(['old','new']))");
  assert.ok(html.includes('<h4>11月2日</h4>'));assert.ok(html.includes('<h4>11月3日</h4>'));assert.ok(html.includes('<h4>合并操作</h4>'));
  assert.equal((html.match(/合并 2 期递延至/g)||[]).length,1);
  assert.equal((html.match(/完成合并 2 期/g)||[]).length,1);assert.ok(!html.includes('完成合并 4 期'));
  assert.equal((html.match(/实际 25 分钟/g)||[]).length,1);
  assert.ok(html.includes('系统'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});

test('AI confirmation binds and displays the same grouped-period scope as direct completion',()=>{
  const a=planningApp();a.run("S.tasks=[{id:'p1',date:'2026-11-02'},{id:'p2',date:'2026-11-03',name:'巡检',stackCount:2,stackPeriods:['p1','p2']}]");
  assert.deepEqual(a.json("agentTaskScope('task.complete',{id:'p2',summary:'done'})"),{id:'p2',summary:'done',stackPeriods:['p1','p2']});
  const html=a.run("agentActionHTML('task.complete',agentTaskScope('task.complete',{id:'p2',summary:'done'}))");
  assert.ok(html.includes('巡检 · 2 期'));assert.ok(html.includes('11月2日、11月3日'));assert.ok(!html.includes('<pre>'));
});

test('a merged period badge sits beside the clamped week chip name, never inside it', () => {
  const a = app();
  a.run("S.users=[{id:'member',active:1}];S.today='2026-11-04'");
  const chip = a.run(`weekTaskChip({id:'t',name:'${'很长的固定任务名称'.repeat(4)}',assignee:'member',priority:'P1',status:'todo',date:'2026-11-04',stackCount:3},'2026-11-04')`);
  assert.ok(/<span class="week-task-title"><span class="week-task-name">[^<]*<\/span><span class="stack-badge"[^>]*>3 期<\/span><\/span>/.test(chip));
  const plain = a.run(`weekTaskChip({id:'u',name:'普通任务',assignee:'member',priority:'P1',status:'todo',date:'2026-11-04'},'2026-11-04')`);
  assert.ok(!plain.includes('week-task-title') && plain.includes('<span class="week-task-name">普通任务</span>'));
});

test('a past day traces what was carried on and offers no add button; an empty one stays small', () => {
  const a = app();
  a.run("S.users=[{id:'member',active:1}];S.today='2026-11-04';S.user={id:'member'}");
  const past = a.run("weekDayColumn('2026-11-02',[],true,2)");
  assert.ok(past.includes('2 项未完成，已递延') && !past.includes('week-day-add') && !past.includes('is-quiet'));
  const empty = a.run("weekDayColumn('2026-11-01',[],true,0)");
  assert.ok(empty.includes('is-quiet') && !empty.includes('week-day-add'));
  const today = a.run("weekDayColumn('2026-11-04',[],true,3)");
  assert.ok(today.includes('week-day-add') && !today.includes('已递延'), '今天和以后照常可以加任务');
});

test('a project set up after it began shows 立项 no later than 执行', () => {
  const a = app();
  a.run("S.today='2026-11-04';S.tasks=[];S.folders=[]");
  const html = a.run("projectLifecycle({id:'p',start:'2026-10-25',end:'2026-11-29',createdAt:'2026-11-04T09:00:00+08:00',status:'active',owner:'x'},false)");
  const days = [...html.matchAll(/<small>([^<]*)<\/small>/g)].map(m => m[1]);
  assert.deepEqual(days.slice(0, 2), ['10月25日', '10月25日']);
});

test('the shortcut hint opens a real list and single keys stay out of the way while typing', () => {
  const key = source.match(/function shortcutKey\(e\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/closest\?\.\('input,textarea,select,\[contenteditable\]/.test(key), '输入框里打字不触发');
  assert.ok(/e\.ctrlKey\|\|e\.metaKey\|\|e\.altKey/.test(key), '带修饰键时不抢浏览器快捷键');
  for (const k of ["'?':openShortcuts", "'/':()=>UI.view==='settings'", "t:()=>switchView('today')", "w:()=>switchView('calendar')", "p:()=>switchView('projects')", "i:()=>switchView('inbox')"])
    assert.ok(key.includes(k), k);
  assert.ok(/\$\('#shortcutHelp'\)\.onclick=openShortcuts/.test(source));
});

test('the project space card drops what the page already shows', () => {
  const a = app(); const elements = {};
  a.context.document = {querySelector: s => elements[s] || (elements[s] = {innerText: '', dataset:{}, classList: {toggle() {}}}), querySelectorAll: () => []};
  a.run(`S.today='2026-11-04';S.notifications=[];S.folders=[];S.files=[];S.tasks=[];S.repeats=[];
    S.users=[{id:'superadmin',admin:1,active:1},{id:'test001',active:1},{id:'test002',active:1},{id:'test003',active:1}];
    S.projects=[{id:'p',name:'独一无二的名字',desc:'只出现一次的描述',owner:'test001',status:'active',start:'2026-11-01',
      members:{test001:'accepted',test002:'accepted'}}];S.user={id:'test001',admin:0};UI.space='p';renderProjects()`);
  const space = elements['#projectSpace'].innerHTML;
  assert.equal(space.split('只出现一次的描述').length-1,1,'项目简介在空间顶部保留一处');
  assert.ok(space.indexOf('只出现一次的描述')<space.indexOf('项目背景'));
  assert.ok(!a.run('projectCardHTML(S.projects[0],true)').includes('只出现一次的描述'),'任务卡不再重复简介');
  assert.equal(space.split('invite-members').length - 1, 0, '添加协作者只留在项目人力里');
  assert.ok(space.includes('spaceInvite') && elements['#projectActions'].innerHTML.includes('add-project-task'));
  assert.ok(!space.includes('project-members'));
});

test('merged periods read as N 期, stack up in the week, and bump only when a group grows', () => {
  const a = app();
  a.run("S.users=[{id:'member',active:1}];S.today='2026-11-04';UI.stackSeen=undefined");
  const t = "{id:'b',name:'日报',assignee:'member',priority:'P1',status:'todo',date:'2026-11-04',stackCount:3,stackPeriods:['p1','p2','p3']}";
  assert.equal(a.run(`stackBadge(${t})`), '<span class="stack-badge" aria-label="合并 3 期">3 期</span>', '第一次显示不跳');
  a.run("UI.stackSeen=new Map([['p1',2]])");
  assert.ok(a.run(`stackBadge(${t})`).includes('is-bumped'), '同一组多了一期才跳一下');
  a.run("UI.stackSeen=new Map([['p1',3]])");
  assert.ok(!a.run(`stackBadge(${t})`).includes('is-bumped'));
  assert.ok(a.run(`weekTaskChip(${t},'2026-11-04')`).includes(' is-stacked"'));
});

test('the first merge from one to two periods bumps once, using the same root after a carry', () => {
  const a=app();
  a.run(`UI.stackSeen=undefined;S.tasks=[{id:'carry',originId:'p1',stackCount:1}];rememberStackSizes()`);
  assert.deepEqual(a.json('[...UI.stackSeen]'),[['p1',1]]);
  a.run("S.tasks=[{id:'p2',stackCount:2,stackPeriods:['p1','p2']}]");
  assert.ok(a.run('stackBadge(S.tasks[0])').includes('is-bumped'),'已显示过的单期首次合并应跳动');
  a.run('rememberStackSizes()');
  assert.ok(!a.run('stackBadge(S.tasks[0])').includes('is-bumped'),'相同快照重新渲染不重复跳动');
  a.run("UI.stackSeen=undefined");assert.ok(!a.run('stackBadge(S.tasks[0])').includes('is-bumped'),'初次加载合并任务保持安静');
  a.run("S.tasks=[{id:'p1'},{id:'old',originId:'p1',superseded:true}];rememberStackSizes()");
  assert.equal(a.run('UI.stackSeen.get("p1")'),1,'没有 stackCount 的普通单期同样记为一期');
});

test('a revisited view only fades in, and the timeline keeps the accent colour for last', () => {
  const sw = source.match(/function switchView\(view\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/classList\?\.toggle\('is-revisit',seen\.has\(view\)\)/.test(sw));
  assert.ok(/palette=\['blue','green','purple','gold','coral'\]/.test(source), '珊瑚色和「今天」红线同色，排在最后');
});

test('settings speak plainly: neutral "not allowed", one-choice-at-a-time week start, a run that reports what it did', () => {
  const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
  assert.ok(/\.rule-tag\.is-none,\s*\.rule-tag\.is-off \{ color: var\(--muted\)/.test(css), '不允许 / 关闭 不再用警示红');
  assert.ok(/\.rule-tag\.is-read \{ color: var\(--c-blue-ink\)/.test(css), 'AI 查询与审批不再同色');
  const week = source.match(/function renderWeekStartSetting\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(/box\.dataset\.saving/.test(week) && /x\.disabled=true/.test(week), '保存期间不能连点');
  const collect = source.match(/function renderCollectionSchedule\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(collect.includes('data-mode') && collect.includes('data-weekday'), '补报时间就地设置');
  assert.ok(/已完成 · /.test(source) && /action:'scheduler\.run'/.test(source));
});

/* Source-level CSS contract: read the real classes emitted for each action
   row and apply the matching simple selectors in specificity/order. This
   checks the height regression without claiming browser layout acceptance. */
function settingsButtonHeight(classes,container){
  const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  const scopes=new Set(['','#settingsView',`.${container}`,`#settingsView .${container}`]);
  let winner=null;
  for(const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const height=rule[2].match(/(?:^|;)\s*height\s*:\s*(\d+)px\s*(?:;|$)/);if(!height)continue;
    for(const selector of rule[1].split(',').map(s=>s.trim())){
      const normalized=selector.replace(/\s+/g,' '),split=normalized.lastIndexOf(' ');
      const scope=split<0?'':normalized.slice(0,split),target=normalized.slice(split+1);
      if(!scopes.has(scope)||! /^(?:\.[\w-]+)+$/.test(target)||!target.slice(1).split('.').every(c=>classes.includes(c)))continue;
      const specificity=(selector.match(/#/g)||[]).length*100+(selector.match(/\./g)||[]).length*10;
      if(!winner||specificity>=winner.specificity)winner={specificity,height:Number(height[1])};
    }
  }
  assert.ok(winner,`no height found for ${classes.join(' ')}`);return winner.height;
}
function buttonHeights(html,container){
  return [...html.matchAll(/<button\b[^>]*class="([^"]+)"[^>]*>/g)].map(m=>settingsButtonHeight(m[1].split(/\s+/),container));
}
test('settings source editor cancel and submit use the same compact height',()=>{
  const a=planningApp();a.run("aiEditing={kind:'chat'}");
  const html=a.run('aiSourceEditor(null)');
  assert.deepEqual(buttonHeights(html,'ai-editor-actions'),[32,32]);
});
test('settings test edit and destructive confirmation actions have equal heights',()=>{
  const a=aiEditorApp();a.run('renderAiSettingsPage()');
  const actions=[...a.box.innerHTML.matchAll(/<div class="ai-source-actions">([\s\S]*?)<\/div>/g)];
  assert.equal(actions.length,2);
  for(const [,html] of actions){
    assert.deepEqual(buttonHeights(html,'ai-source-actions'),[32,32,32]);
    assert.deepEqual(buttonHeights(html.replace('text-btn is-danger','text-btn is-danger is-armed'),'ai-source-actions'),[32,32,32]);
  }
});
test('settings empty state primary and alternative actions have equal heights',()=>{
  const a=aiEditorApp();a.run('aiSettings.sources=[];renderAiSettingsPage()');
  const html=a.box.innerHTML.match(/<div class="ai-empty-actions">([\s\S]*?)<\/div>/)[1];
  assert.deepEqual(buttonHeights(html,'ai-empty-actions'),[32,32]);
});

test('week history retains deferral events after completion without treating merged or reopened rows as deferrals', () => {
  const a=app();
  a.run(`S.today='2026-11-04';S.user={id:'member'};S.projects=[];UI.member='all';
    S.tasks=[{id:'old',assignee:'member',date:'2026-11-03',status:'deferred',superseded:true},
      {id:'leaf',originId:'old',assignee:'member',date:'2026-11-04',status:'todo'},
      {id:'merged',assignee:'member',date:'2026-11-03',status:'todo',superseded:true},
      {id:'reopened',assignee:'member',date:'2026-11-03',status:'done',superseded:true},
      {id:'other',assignee:'other',date:'2026-11-03',status:'deferred',superseded:true}];
    S.logs=[{taskId:'old',kind:'defer'},{taskId:'old',kind:'defer'},
      {taskId:'reopened',kind:'reopen'},{taskId:'other',kind:'defer'}]`);
  assert.deepEqual(a.json('[...weekDeferralCounts()]'),[['2026-11-03',1]],'按任务去重且遵循成员范围');
  a.run("S.tasks[0].status='done';S.tasks[0].carriedCompletion=true;S.tasks[1].status='done'");
  assert.deepEqual(a.json('[...weekDeferralCounts()]'),[['2026-11-03',1]]);
  const html=a.run("weekDayColumn('2026-11-03',[],true,weekDeferralCounts().get('2026-11-03'))");
  assert.ok(html.includes('1 项未完成，已递延')&&!html.includes('is-quiet'));
  a.run("S.user={id:'admin',admin:1}");assert.deepEqual(a.json('[...weekDeferralCounts()]'),[['2026-11-03',2]]);
  a.run("UI.member='member'");assert.deepEqual(a.json('[...weekDeferralCounts()]'),[['2026-11-03',1]]);
});

test('Escape closes the top task overlay while typing and restores its opener without closing the layer below', () => {
  const a=app(),elements={};let focused='';
  const element=(id,hidden=false)=>elements[id]||(elements[id]={isConnected:true,innerHTML:'',classList:{
    hidden,contains(){return this.hidden},add(){this.hidden=true},remove(){this.hidden=false}},
    closest(){return null},focus(){focused=id}});
  a.context.document={body:{classList:{contains:()=>false}},activeElement:element('task-opener'),querySelector:s=>element(s,true),querySelectorAll:()=>[]};
  a.context.confirm=()=>true;
  const shortcut=source.match(/function shortcutKey\(e\)\{[\s\S]*?\n\}/)[0];
  vm.runInContext(shortcut,a.context);
  a.run("S.user={id:'member'};UI.drawerReturnFocus=document.activeElement");
  element('#taskDrawer').classList.hidden=false;
  a.context.document.activeElement=element('drawer-button');
  a.run("openModal('confirmation')");
  a.context.event={key:'Escape',target:{closest:()=>({tagName:'TEXTAREA'})},preventDefault(){this.defaultPrevented=true}};
  a.run('shortcutKey(event)');
  assert.ok(elements['#modalBackdrop'].classList.hidden);assert.equal(focused,'drawer-button');
  assert.equal(elements['#taskDrawer'].classList.hidden,false);assert.equal(a.context.event.defaultPrevented,true);
  a.context.event.defaultPrevented=false;a.run('shortcutKey(event)');
  assert.ok(elements['#taskDrawer'].classList.hidden);assert.equal(focused,'task-opener');
  a.run("openModal('unsaved');UI.docDirty=true");a.context.confirm=()=>false;
  a.context.event.defaultPrevented=false;a.run('shortcutKey(event)');
  assert.equal(elements['#modalBackdrop'].classList.hidden,false,'保留未保存内容的关闭确认');
  a.context.event={key:'n',target:{closest:()=>({})},preventDefault(){throw Error('typing intercepted')}};
  a.run('shortcutKey(event)');
});

function dictationField(id) {
  return {id, value:'', isConnected:true, disabled:false, readOnly:false, maxLength:-1,
    closest(){return this.hidden ? {} : null}, setSelectionRange(){}, dispatchEvent(){this.edits=(this.edits||0)+1}};
}
test('shared dictation targets the chosen field and cancels late recognition from another field', () => {
  const a=voiceApp(),instances=[];
  a.context.window={SpeechRecognition:fakeBrowserRecognition(instances)};
  a.context.first=dictationField('taskDesc');a.context.second=dictationField('doneText');
  a.run('toggleFieldVoice(first)');instances[0].onstart();
  const stale=instances[0].onresult;
  a.run('toggleFieldVoice(second)');instances[1].onstart();
  stale({resultIndex:0,results:[{isFinal:true,0:{transcript:'旧任务'}}]});
  instances[1].onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'完成总结'}}]});
  assert.equal(a.context.first.value,'');assert.equal(a.context.second.value,'完成总结');assert.equal(a.input.value,'');
});
test('dictation refuses removed, hidden, disabled and readonly targets and account/view/room changes', () => {
  for(const change of ['field.isConnected=false','field.hidden=true','field.disabled=true','field.readOnly=true',
    'S.user.id="other"','UI.view="projects"','chatChannel="other"']){
    const a=voiceApp();a.context.field=dictationField('chatInput');
    a.context.S={user:{id:'member'}};a.context.UI={view:'chat'};a.context.chatChannel='general';
    a.run('voice.target=field;voice.scope=voiceScope()');a.run(change);a.run('agentVoiceAppend("迟到的文字")');
    assert.equal(a.context.field.value,'',change);
  }
});
test('shared dictation respects maxlength and notifies drafts without losing manual edits', () => {
  const a=voiceApp(),instances=[];a.context.Event=class {constructor(type){this.type=type}};
  a.context.window={SpeechRecognition:fakeBrowserRecognition(instances)};
  a.context.field=dictationField('taskDesc');a.context.field.maxLength=5;
  a.run('toggleFieldVoice(field)');instances[0].onstart();
  a.context.field.value='手改';a.run('agentVoiceFollowEdit()');
  instances[0].onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'一二三四五'}}]});
  assert.equal(a.context.field.value,'手改一二三');assert.ok(a.context.field.edits>0);
});
test('switching fields aborts pending server transcription and ignores its late result', async () => {
  const a=voiceApp();let resolve,aborted=false;
  a.context.AbortController=class {constructor(){this.signal={}}abort(){aborted=true}};
  a.context.apiBlob=()=>new Promise(r=>resolve=r);
  a.context.first=dictationField('taskDesc');a.context.second=dictationField('doneText');
  a.run('voice.target=first;voice.scope=voiceScope();voice.recorder={mimeType:"audio/mp4"};voice.chunks=[{type:"audio/mp4"}]');
  const pending=a.run('agentVoiceFinishRecording()');
  a.run('agentCancelVoice();voice.target=second;voice.scope=voiceScope()');resolve({text:'旧内容'});await pending;
  assert.equal(aborted,true);assert.equal(a.context.first.value,'');assert.equal(a.context.second.value,'');
});
test('late microphone permission releases tracks after the target is closed', async () => {
  const a=voiceApp();let resolve,stops=0;
  a.context.field=dictationField('taskDesc');
  a.context.navigator.mediaDevices={getUserMedia:()=>new Promise(r=>resolve=r)};
  a.run('voice.target=field;voice.scope=voiceScope()');const pending=a.run('agentVoiceStartRecording()');
  a.context.field.hidden=true;resolve({getTracks:()=>[{stop(){stops++}}]});await pending;
  assert.equal(stops,1);assert.equal(a.context.field.value,'');assert.equal(a.run('voice.starting'),false);
});
test('shared dictation uses safe service status before the assistant is opened', () => {
  const a=voiceApp();a.context.window={};a.context.navigator.mediaDevices={getUserMedia(){}};a.context.MediaRecorder=class {};
  a.run('sharedSpeechStatus={configured:true}');assert.equal(a.run('agentVoiceEngine()'),'server');
  a.context.agentServerAsr={configured:true};a.run('sharedSpeechStatus={configured:false}');assert.equal(a.run('agentVoiceEngine()'),null);
});

test('unavailable MediaRecorder releases the permission stream and leaves dictation retryable', async () => {
  const a=voiceApp();let stops=0;
  a.context.MediaRecorder=class {constructor(){throw Error('unsupported')}static isTypeSupported(){return false}};
  a.context.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){stops++}}]})};
  await a.run('agentVoiceStartRecording()');
  assert.equal(stops,1);assert.equal(a.run('voice.starting||voice.active||voice.transcribing'),false);
});
test('returning to assistant dictation cannot route its results to a previous form', () => {
  const a=voiceApp(),instances=[];a.context.window={SpeechRecognition:fakeBrowserRecognition(instances)};
  a.context.field=dictationField('doneText');a.run('toggleFieldVoice(field)');instances[0].onstart();
  a.run('agentToggleVoice()');instances[1].onstart();
  instances[1].onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'新问题'}}]});
  assert.equal(a.input.value,'新问题');assert.equal(a.context.field.value,'');
});


function meetingApp(){
  const a=app(),nodes={},calls=[],instances=[];
  for(const id of ['meetingTitle','meetingScheduledAt','meetingParticipants','meetingAgenda','meetingTranscript','saveMeeting','generateMeetingMinutes','meetingLiveBtn','meetingLiveState','cancelAction','meetingMinutes'])nodes['#'+id]={value:'',isConnected:true,addEventListener(){},dispatchEvent(){},replaceChildren(){},dataset:{}};
  a.context.nodes=nodes;a.context.calls=calls;
  a.context.document={querySelector:s=>nodes[s],createTextNode:s=>s};
  a.context.window={SpeechRecognition:class {constructor(){instances.push(this)} start(){} stop(){}}};
  a.context.Event=class {};
  a.context.setTimeout=()=>1;a.context.clearTimeout=()=>{};
  a.run(`toast=()=>{};agentVoiceLang=()=> 'zh-CN';openModal=()=>{};closeModal=()=>{meetingStopLive()};renderProjectSpace=()=>{};canManageProject=()=>true;
    fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);const result=body.action==='meeting.create'?{id:'m1',...body.data}:body.action==='meeting.minutes.generate'?{id:'m1',minutes:'已整理'}:{...body.data};return {ok:true,text:async()=>JSON.stringify(result)}};
    S.meetings=[];openMeetingEditor({id:'p1',name:'项目'});`);
  nodes['#meetingTitle'].value='周会';return {a,nodes,calls,instances};
}
test('project files share one create menu and respect meeting creation permission',()=>{
  const a=app();a.run("S.user={id:'owner',admin:false};S.files=[];S.meetings=[{id:'m1',projectId:'p1',title:'周会'}]");
  const owner=a.run("projectFiles({id:'p1',owner:'owner'})");
  assert.match(owner, /<summary[^>]*>.*新增文件/);assert.match(owner,/id="uploadFileFromMenu"/);assert.match(owner,/id="createMeetingFromFiles"/);
  assert.match(owner,/data-meeting="m1"/);
  const filesOnly=a.run("projectFiles({id:'p1',owner:'owner'},false,false)");
  assert.doesNotMatch(filesOnly,/data-meeting="m1"/);
  a.run("S.user={id:'member',admin:false}");assert.doesNotMatch(a.run("projectFiles({id:'p1',owner:'owner'})"),/id="createMeetingFromFiles"/);
  assert.doesNotMatch(a.run("projectFiles({id:'p1',owner:'owner'},true)"),/fileCreateMenu/);
});
test('meeting editor stores pasted source and generates minutes on first creation',async()=>{
  const {nodes,calls}=meetingApp();nodes['#meetingTranscript'].value='确认周五发布';
  await nodes['#generateMeetingMinutes'].onclick();
  assert.deepEqual(calls.map(x=>x.action),['meeting.create','meeting.minutes.generate']);
  assert.equal(calls[0].data.rawTranscript,'确认周五发布');assert.match(nodes['#meetingMinutes'].innerHTML,/已整理/);
  assert.doesNotMatch(source.slice(source.indexOf('function openMeetingEditor'),source.indexOf('const meetingLive=')),/id="meetingPrompt/);
});
test('live recording followed by save updates the same meeting and ignores stale results',async()=>{
  const {a,nodes,calls,instances}=meetingApp();await nodes['#meetingLiveBtn'].onclick();
  assert.equal(instances.length,1);const stale=instances[0].onresult;
  stale({resultIndex:0,results:[{isFinal:true,0:{transcript:'第一句'}}]});
  stale({resultIndex:0,results:[{isFinal:true,0:{transcript:'第二句'}}]});
  assert.equal(nodes['#meetingTranscript'].value,'第一句\n第二句');
  await nodes['#saveMeeting'].onclick();stale({resultIndex:0,results:[{isFinal:true,0:{transcript:'旧会话'}}]});
  assert.equal(calls.filter(x=>x.action==='meeting.create').length,1);
  assert.equal(calls.at(-1).data.rawTranscript,'第一句\n第二句');
  assert.equal(nodes['#meetingTranscript'].value,'第一句\n第二句');assert.equal(a.run('meetingLive.active'),false);
});
test('browser fallback keeps its last interim words when recording is stopped',async()=>{
  const {nodes,instances,a}=meetingApp();await nodes['#meetingLiveBtn'].onclick();
  instances[0].onresult({resultIndex:0,results:[{isFinal:false,0:{transcript:'尚未定稿的尾句'}}]});
  await a.run('meetingStopLive()');assert.equal(nodes['#meetingTranscript'].value,'尚未定稿的尾句');
});
test('meeting creation is guarded while a request is pending',async()=>{
  const {a,nodes,calls}=meetingApp();let release;a.context.pause=new Promise(r=>release=r);
  a.run("fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);await pause;return {ok:true,text:async()=>JSON.stringify({id:'m1',...body.data})}}");
  const first=nodes['#saveMeeting'].onclick();await nodes['#saveMeeting'].onclick();release();await first;
  assert.equal(calls.length,1);
});
test('meeting edits made during save remain dirty and keep their newer input',async()=>{
  const h=meetingApp(),pane={dataset:{dirty:'true'}};h.nodes['#meetingEditor']=pane;
  let release,submitted;h.a.context.fetch=async(path,options)=>{submitted=JSON.parse(options.body);await new Promise(r=>release=r);return {ok:true,text:async()=>JSON.stringify({id:'m1',revision:1,...submitted.data})}};
  h.nodes['#meetingTranscript'].value='提交版本';const save=h.nodes['#saveMeeting'].onclick();await settle();
  h.nodes['#meetingTitle'].value='保存期间的新标题';h.nodes['#meetingTranscript'].value='继续编辑的原稿';release();await save;
  assert.equal(submitted.data.rawTranscript,'提交版本');assert.equal(h.nodes['#meetingTranscript'].value,'继续编辑的原稿');
  assert.equal(pane.dataset.dirty,'true');assert.equal(pane.dataset.metadataDirty,'true');
});

function meetingServerApp(){
  const a=meetingApp(),audio=[],recorders=[],timers=new Map();let timer=0,stops=0,revision=0;
  a.a.context.Blob=Blob;a.a.context.AbortController=AbortController;
  a.a.context.navigator={mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stops++}}]})}};
  a.a.context.MediaRecorder=class {
    static isTypeSupported(){return true}
    constructor(){this.id=recorders.length;this.mimeType='audio/webm';this.state='inactive';recorders.push(this)}
    start(){this.state='recording'}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob([`header-${this.id}:audio`],{type:this.mimeType})});this.onstop()}
  };
  a.a.context.setTimeout=f=>{timers.set(++timer,f);return timer};a.a.context.clearTimeout=id=>timers.delete(id);
  a.a.context.fetch=async(path,options)=>{
    if(path==='/api/transcribe')return new Promise(resolve=>audio.push({blob:options.body,
      reply:text=>resolve({ok:true,json:async()=>({text})}),fail:()=>resolve({ok:false,json:async()=>({error:'网络失败'})})}));
    const body=JSON.parse(options.body);a.calls.push(body);
    const result=body.action==='speech.status'?{configured:true}:body.action==='meeting.create'?{id:'m1',revision:0,...body.data}:{...body.data,revision:++revision};
    return {ok:true,text:async()=>JSON.stringify(result)};
  };
  return {...a,audio,recorders,timers,get stops(){return stops},tick(){const [id,f]=timers.entries().next().value;timers.delete(id);f()}};
}
const settle=()=>new Promise(setImmediate);
test('meeting server transcription writes and saves complete clips while recording continues',async()=>{
  const h=meetingServerApp();await h.nodes['#meetingLiveBtn'].onclick();
  assert.equal(h.recorders.length,1);h.tick();await settle();
  assert.equal(h.recorders.length,2,'each clip has its own recorder/container');
  assert.equal(await h.audio[0].blob.text(),'header-0:audio');
  h.audio[0].reply('第一段');await settle();
  assert.equal(h.nodes['#meetingTranscript'].value,'第一段');
  assert.equal(h.a.run('meetingLive.active'),true,'result arrives before stop');
  assert.ok(h.calls.some(x=>x.action==='meeting.transcript.update'&&x.data.recording&&x.data.rawTranscript==='第一段'));
  const stop=h.a.run('meetingStopLive()');await settle();
  h.audio[1].reply('尾段');await stop;
  assert.equal(h.nodes['#meetingTranscript'].value,'第一段\n尾段');assert.ok(h.stops>0);
  assert.equal(h.a.run('meetingLive.session'),null);
  assert.equal(h.calls.at(-1).data.recording,false);
});
test('an empty audio segment does not silently stop continuous capture',async()=>{
  const h=meetingServerApp();await h.nodes['#meetingLiveBtn'].onclick();
  h.recorders[0].stop=function(){this.state='inactive';this.onstop()};h.tick();await settle();
  assert.equal(h.recorders.length,2);assert.equal(h.audio.length,0);assert.equal(h.a.run('meetingLive.active'),true);
  const stop=h.a.run('meetingStopLive()');await settle();h.audio[0].reply('有效尾段');await stop;
  assert.equal(h.nodes['#meetingTranscript'].value,'有效尾段');
});
test('failed clips remain retryable and a failed save never appends text twice',async()=>{
  const h=meetingServerApp();await h.nodes['#meetingLiveBtn'].onclick();h.tick();await settle();
  h.audio[0].fail();await settle();
  assert.equal(h.a.run('meetingLive.session.queue.length'),2,'failed clip and final capture are retained');
  assert.equal(h.a.run('meetingLive.active'),false);
  const retry=h.a.run("meetingToggleLive('m1',nodes['#meetingTranscript'])");await settle();
  h.audio[1].reply('恢复第一段');await settle();h.audio[2].reply('恢复尾段');await retry;
  assert.equal(h.nodes['#meetingTranscript'].value,'恢复第一段\n恢复尾段');
});
test('retry after a failed transcript save does not transcribe or append the same clip again',async()=>{
  const h=meetingServerApp();await h.nodes['#meetingLiveBtn'].onclick();
  const fetch=h.a.context.fetch;let fail=true;
  h.a.context.fetch=async(path,options)=>{
    if(path==='/api/action'&&JSON.parse(options.body).action==='meeting.transcript.update'&&fail){fail=false;return {ok:false,text:async()=>JSON.stringify({error:'保存失败'})}}
    return fetch(path,options);
  };
  h.tick();await settle();h.audio[0].reply('只追加一次');await settle();
  assert.equal(h.nodes['#meetingTranscript'].value,'只追加一次');
  const retry=h.a.run("meetingToggleLive('m1',nodes['#meetingTranscript'])");await settle();
  assert.equal(h.audio.length,2,'first clip reuses its existing text; only tail needs ASR');
  h.audio[1].reply('尾段');await retry;
  assert.equal(h.nodes['#meetingTranscript'].value,'只追加一次\n尾段');
});
test('late microphone permission releases tracks if the meeting editor has closed',async()=>{
  const h=meetingServerApp();let release;
  h.a.context.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>release=r);
  const starting=h.nodes['#meetingLiveBtn'].onclick();await settle();h.nodes['#meetingTranscript'].isConnected=false;
  let stops=0;release({getTracks:()=>[{stop(){stops++}}]});await starting;
  assert.equal(stops,1);assert.equal(h.recorders.length,0);assert.equal(h.a.run('meetingLive.session'),null);
});
test('slow transcription bounds the audio queue and pauses the microphone',async()=>{
  const h=meetingServerApp();await h.nodes['#meetingLiveBtn'].onclick();
  h.tick();await settle();h.tick();h.tick();
  assert.equal(h.recorders.length,3);assert.equal(h.a.run('meetingLive.session.queue.length'),3);
  assert.equal(h.a.run('meetingLive.active'),false);assert.ok(h.stops>0);
  const stop=h.a.run('meetingStopLive()');h.audio[0].reply('一');await settle();h.audio[1].reply('二');await settle();h.audio[2].reply('三');await stop;
  assert.equal(h.nodes['#meetingTranscript'].value,'一\n二\n三');
});
test('account cancellation releases the mic and discards late transcription without saving it',async()=>{
  const h=meetingServerApp();await h.nodes['#meetingLiveBtn'].onclick();h.tick();await settle();
  h.a.run("meetingCancelCapture();S.user={id:'another'}");const before=h.calls.length;
  h.audio[0].reply('旧账户音频');await settle();
  assert.equal(h.nodes['#meetingTranscript'].value,'');assert.equal(h.calls.length,before);assert.ok(h.stops>0);
});
test('project resources are grouped by project and escaped, with direct download links',()=>{
  const a=app();a.run(`S.files=[{id:'f/x',projectId:'p',name:'<file>.pdf'},{id:'hidden',projectId:'q',name:'private'}];
    S.meetings=[{id:'m',projectId:'p',title:'<会议>'}];`);
  const html=a.run("projectNavContents({id:'p'})");assert.match(html,/\/api\/files\/f%2Fx/);assert.match(html,/&lt;file&gt;.pdf/);
  assert.match(html,/data-meeting="m"/);assert.match(html,/&lt;会议&gt;/);assert.doesNotMatch(html,/private|\/api\/files\/hidden/);
});
test('meeting workspace separates files and respects creation and archive permissions',()=>{
  const a=app();a.run("S.user={id:'owner',admin:false};S.meetings=[{id:'m',projectId:'p',title:'周会'}]");
  const html=a.run("projectMeetings({id:'p',owner:'owner'})");assert.match(html,/id="meetingEditor"/);assert.match(html,/newProjectMeeting/);
  assert.match(a.run("projectSpaceTabs({id:'p'})"),/任务[\s\S]*会议[\s\S]*文件[\s\S]*成员[\s\S]*概况/);
  assert.doesNotMatch(a.run("projectMeetings({id:'p',owner:'owner'},true)"),/newProjectMeeting/);
  a.run("S.user={id:'member',admin:false}");assert.doesNotMatch(a.run("projectMeetings({id:'p',owner:'owner'})"),/newProjectMeeting/);
});
test('project refresh retains the inline meeting editor and warns before discarding its draft',()=>{
  const h=meetingApp(),pane={innerHTML:'',dataset:{}},box={innerHTML:'',dataset:{}};
  h.nodes['#meetingEditor']=pane;h.nodes['#projectSpace']=box;h.nodes['#projectMeetingList']={innerHTML:''};
  h.nodes['#projectsView h1']={};h.nodes['#projectsView .eyebrow']={};
  h.a.context.document.querySelectorAll=()=>[];h.a.context.confirm=()=>false;
  h.a.run(`S.user={id:'owner'};S.projects=[{id:'p1',name:'项目',owner:'owner'}];S.fileArchives=[];
    S.today='2026-11-04';S.tasks=[];
    S.meetings=[{id:'m1',projectId:'p1',title:'周会',rawTranscript:'',participants:[]}];UI.space='p1';UI.spaceArea='meetings';
    renderProjectSpace=${source.match(/function renderProjectSpace\(id\)\{[\s\S]*?\n\}/)[0]};
    renderProjectSpace('p1');openMeetingEditor(S.projects[0],'m1');`);
  assert.match(pane.innerHTML,/id="meetingTranscript"/);
  const before=pane.innerHTML;h.nodes['#meetingTranscript'].value='尚未保存';pane.dataset.dirty='true';
  h.a.run("renderProjectSpace('p1')");assert.equal(pane.innerHTML,before);assert.equal(h.nodes['#meetingTranscript'].value,'尚未保存');
  h.a.run("projectArea(S.projects[0],'files')");assert.equal(h.a.run('UI.spaceArea'),'meetings');
});

test('system prompt settings save directly, retain edits made during save, and hide for members',async()=>{
  const a=app(),input={value:'全局模板',dataset:{}},save={},box={dataset:{owner:'admin'},classList:{toggle(){}},querySelector:()=>null};
  const nodes={'#meetingPromptSetting':box,'#meetingPromptSettingInput':input,'#saveMeetingPrompt':save};
  a.context.document={querySelector:s=>nodes[s],querySelectorAll:()=>[],activeElement:null};
  let release;const pending=new Promise(r=>release=r);const requests=[];
  a.context.fetch=async(url,options)=>{requests.push(JSON.parse(options.body));await pending;return {ok:true,text:async()=>JSON.stringify({value:'修改后的模板'})}};
  a.run("S.user={id:'admin',admin:true};S.meetingPrompt='全局模板';toast=()=>{};renderMeetingPromptSetting()");
  assert.equal(save.disabled,true);input.value='修改后的模板';input.oninput();assert.equal(save.disabled,false);
  const saving=save.onclick();input.value='保存过程中继续编辑';input.oninput();assert.equal(save.disabled,true);release();await saving;
  assert.equal(a.run('S.meetingPrompt'),'修改后的模板');assert.equal(input.value,'保存过程中继续编辑');assert.equal(save.disabled,false);
  assert.equal(requests[0].action,'meeting.prompt.update');assert.equal(requests[0].data.prompt,'修改后的模板');
  a.run("S.user={id:'member',admin:false};renderMeetingPromptSetting()");assert.equal(box.innerHTML,'');
});

test('settings rows filter by search, mark what differs from the default, and hide what the account may not change', () => {
  const a = app();
  const cls = () => { const set = new Set(); return {add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c), toggle: (c, on) => { (on === undefined ? !set.has(c) : on) ? set.add(c) : set.delete(c); return set.has(c) }} };
  const row = (setting, role, title, keywords) => { const r = {dataset: {setting, role, keywords}, classList: cls(), slot: {innerHTML: ''}};
    r.querySelector = sel => sel === '.setting-text' ? {textContent: title} : sel === '.setting-reset-slot' ? r.slot : null; return r };
  const rows = [row('rules', 'superadmin', '规则组', '权限'), row('week', 'admin', '每周从哪天开始', '周视图'), row('collection', 'admin', '补报时间', '补报 周期')];
  const group = {id: 'g', classList: cls(), dataset: {nav: '设置', navIcon: 'archive'}, querySelector: sel => rows.find(r => !r.classList.contains('is-forbidden') && (!sel.includes('is-filtered') || !r.classList.contains('is-filtered'))) || null};
  const search = {value: ''}, empty = {classList: cls(), textContent: ''};
  a.context.document = {querySelector: s => ({'#settingsSearch': search, '#settingsEmpty': empty})[s] || null,
    querySelectorAll: s => s.includes('.setting-row') ? rows : s.includes('.settings-group') ? [group] : [], getElementById: () => group};
  a.run(`S.user={id:'admin',admin:1,role:'admin'};S.weekStart=1;S.automation={enabled:true,mode:'daily',time:'00:00'};S.meetingPrompt='';
    renderRepeatStackingSetting=renderProjectAutomationSetting=renderCollectionSchedule=renderWeekStartSetting=renderCreationPolicy=renderMeetingPromptSetting=()=>{};renderSettings()`);
  assert.ok(rows[0].classList.contains('is-forbidden'), '规则组只给 superadmin');
  assert.ok(rows[1].classList.contains('is-modified') && rows[1].slot.innerHTML.includes('恢复默认'), '周起始日改过，显示恢复默认');
  assert.ok(!rows[2].classList.contains('is-modified'));
  search.value = '补报'; a.run('applySettingsFilter()');
  assert.ok(rows[1].classList.contains('is-filtered') && !rows[2].classList.contains('is-filtered'));
  assert.ok(empty.classList.contains('hidden'));
  search.value = '不存在的设置'; a.run('applySettingsFilter()');
  assert.ok(!empty.classList.contains('hidden') && empty.textContent.includes('不存在的设置'));
  assert.deepEqual(a.json("SETTING_DEFAULTS.week.reset()"), ['week_start.update', {day: 6}]);
});

function settingsClassList(){
  const set=new Set();return {add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle:(x,on)=>{if(on===undefined)on=!set.has(x);on?set.add(x):set.delete(x)}};
}
function collectionEditorApp(){
  const a=app(),calls=[],dates={value:''},time={value:''},hint={textContent:''},retry={classList:settingsClassList()};
  const controls=(key,values)=>values.map(v=>({dataset:{[key]:String(v)},classList:settingsClassList(),setAttribute(){}}));
  const modes=controls('mode',['daily','weekly','dates']),days=controls('weekday',[0,1,2,3,4,5,6]),parts={weekly:{classList:settingsClassList()},dates:{classList:settingsClassList()}};
  const box={dataset:{},renders:0,contains:()=>false,
    set innerHTML(value){this.html=value;this.renders++;dates.value=value.match(/id="collectionDates"[^>]*value="([^"]*)"/)[1];time.value=value.match(/id="collectionTime"[^>]*value="([^"]*)"/)[1]},get innerHTML(){return this.html},
    querySelector:s=>({'#collectionDates':dates,'#collectionTime':time,'.collection-hint':hint,'#collectionRetry':retry,'[data-part="weekly"]':parts.weekly,'[data-part="dates"]':parts.dates}[s]),
    querySelectorAll:s=>s==='[data-mode]'?modes:s==='[data-weekday]'?days:[]};
  a.context.document={querySelector:s=>s==='#collectionSchedule'?box:null,querySelectorAll:()=>[],activeElement:null};
  a.context.fetch=(url,options)=>new Promise(resolve=>{const body=JSON.parse(options.body);calls.push({body,complete:(ok=true)=>resolve({ok,text:async()=>JSON.stringify(ok?body.data:{error:'测试保存失败'})})})});
  a.run("S.user={id:'admin',admin:true};S.automation={mode:'daily',time:'09:00',weekdays:[],dates:[]};flashSaved=()=>{};renderCollectionSchedule()");
  return {a,calls,box,dates,time,hint,retry,modes,days};
}
const nextMicrotask=()=>new Promise(resolve=>setImmediate(resolve));

test('collection saves serialize rapid changes and keep the last edit through refresh',async()=>{
  const f=collectionEditorApp();f.time.value='10:00';const first=f.time.onchange();f.time.value='11:00';const last=f.time.onchange();await nextMicrotask();
  assert.equal(f.calls.length,1);f.a.run('renderCollectionSchedule()');assert.equal(f.box.renders,1);assert.equal(f.time.value,'11:00');
  f.calls[0].complete();await first;await nextMicrotask();assert.equal(f.calls.length,2);assert.equal(f.calls[1].body.data.time,'11:00');
  assert.equal(f.box.collectionEditor.dirty,true);f.calls[1].complete();await last;
  assert.equal(f.a.run('S.automation.time'),'11:00');assert.equal(f.box.collectionEditor.dirty,false);assert.equal(f.box.collectionEditor.pending,0);
});
test('collection date drafts and failed submissions survive rendering and can retry',async()=>{
  const f=collectionEditorApp();await f.modes[2].onclick();f.dates.value='2026-12-15';f.dates.oninput();f.a.run('renderCollectionSchedule()');
  assert.equal(f.dates.value,'2026-12-15');assert.equal(f.box.renders,1);
  const failed=f.dates.onchange();await nextMicrotask();f.calls[0].complete(false);await failed;f.a.run('renderCollectionSchedule()');
  assert.equal(f.dates.value,'2026-12-15');assert.equal(f.hint.textContent,'测试保存失败');assert.equal(f.retry.classList.contains('hidden'),false);
  const retry=f.retry.onclick();await nextMicrotask();f.calls[1].complete();await retry;
  assert.equal(f.a.run('S.automation.dates[0]'),'2026-12-15');assert.equal(f.box.collectionEditor.dirty,false);
});
test('resetting collection discards incomplete weekly draft and queues behind earlier saves',async()=>{
  const f=collectionEditorApp();f.time.value='10:00';const first=f.time.onchange();await f.modes[1].onclick();assert.equal(f.calls.length,1);
  const reset=f.box.collectionEditor.reset();assert.equal(f.time.value,'00:00');assert.equal(f.modes[0].classList.contains('is-on'),true);
  f.calls[0].complete();await first;await nextMicrotask();assert.equal(f.calls.length,2);assert.equal(f.calls[1].body.data.mode,'daily');assert.deepEqual(f.calls[1].body.data.weekdays,[]);
  f.calls[1].complete();await reset;assert.equal(f.box.collectionEditor.dirty,false);assert.equal(f.a.run('S.automation.time'),'00:00');
});
test('queued collection edits do not execute as another account',async()=>{
  const f=collectionEditorApp();f.time.value='10:00';const first=f.time.onchange();f.time.value='11:00';const second=f.time.onchange();await nextMicrotask();
  f.a.run("S.user={id:'other',admin:true}");f.calls[0].complete();await first;await second;assert.equal(f.calls.length,1);assert.equal(f.a.run('S.automation.time'),'09:00');
});
test('prompt reset replaces dirty editor and its saved baseline without racing an active save',async()=>{
  const a=app(),input={value:'自定义模板',dataset:{}},save={},box={dataset:{owner:'admin'},classList:{toggle(){}},querySelector:()=>null};
  const nodes={'#meetingPromptSetting':box,'#meetingPromptSettingInput':input,'#saveMeetingPrompt':save};
  a.context.document={querySelector:s=>nodes[s],querySelectorAll:()=>[],activeElement:null};const calls=[];
  a.context.fetch=(url,options)=>new Promise(resolve=>{const body=JSON.parse(options.body);calls.push({body,finish:()=>resolve({ok:true,text:async()=>JSON.stringify({value:body.data.prompt})})})});
  a.run("S.user={id:'admin',admin:true};S.meetingPrompt='自定义模板';flashSaved=()=>{};renderMeetingPromptSetting()");
  input.value='未保存的草稿';input.oninput();const reset=box.resetPrompt();assert.equal(input.disabled,true);assert.equal(calls.length,1);
  await save.onclick();assert.equal(calls.length,1);calls[0].finish();await reset;
  assert.equal(input.value,a.run('MEETING_PROMPT_DEFAULT'));assert.equal(input.dataset.saved,input.value);assert.equal(save.disabled,true);assert.equal(input.disabled,false);
});
test('archived meeting opens escaped read-only transcript and minutes without mutation controls',()=>{
  const a=app();a.context.document={querySelector:()=>({})};a.run("openModal=html=>{globalThis.archivedHTML=html};S.fileArchives=[{id:'p1'}];S.meetings=[{id:'m1',projectId:'p1',title:'周会',rawTranscript:'<script>bad</script>',minutes:'结论'}];openMeetingEditor({id:'p1',name:'项目'},'m1')");
  const html=a.context.archivedHTML;assert.match(html,/<textarea readonly/);assert.match(html,/&lt;script&gt;/);assert.match(html,/结论/);assert.doesNotMatch(html,/id="(?:saveMeeting|meetingLiveBtn|generateMeetingMinutes)"/);
});

function lazyMeetingApp(){
  const h=meetingApp(),pending=[],mounts=[],notices=[];
  h.a.context.pending=pending;h.a.context.mounts=mounts;h.a.context.notices=notices;
  h.a.context.fetch=(url,options)=>new Promise(resolve=>pending.push({
    id:JSON.parse(options.body).data.id,
    reply:full=>resolve({ok:true,text:async()=>JSON.stringify(full)}),
    fail:()=>resolve({ok:false,text:async()=>JSON.stringify({error:'加载失败'})})
  }));
  h.a.run(`toast=msg=>notices.push(msg);openModal=html=>{cancelMeetingOpen();mounts.push(html)};
    renderProjects=()=>{};S.user={id:'owner'};UI.view='projects';UI.space='p1';UI.spaceArea='overview';UI.docDirty=false;
    S.projects=[{id:'p1',name:'项目',owner:'owner'},{id:'p2',name:'另一个项目',owner:'owner'}];
    S.meetings=[{id:'a',projectId:'p1',title:'A',revision:0},{id:'b',projectId:'p1',title:'B',revision:0}];`);
  return {...h,pending,mounts,notices,open:id=>h.a.run(`openMeetingEditor(S.projects[0],${JSON.stringify(id)})`),
    full:(id,revision=0)=>({id,projectId:'p1',title:id.toUpperCase(),rawTranscript:'原稿 '+id,minutes:'纪要 '+id,revision})};
}

test('lazy meeting loading keeps the last selection and ignores an earlier reply',async()=>{
  const h=lazyMeetingApp(),first=h.open('a'),last=h.open('b');
  assert.deepEqual(h.pending.map(p=>p.id),['a','b']);assert.equal(h.notices[0],'正在加载会议…');
  h.pending[1].reply(h.full('b'));await last;
  h.pending[0].reply(h.full('a'));await first;
  assert.equal(h.mounts.length,1);assert.match(h.mounts[0],/<h2>B<\/h2>/);
});

test('pending meeting replies cannot reopen after navigation, account changes or cancellation',async()=>{
  for(const transition of ["UI.view='calendar'","S.user={id:'another'}",
    "openProjectSpace('p2');openProjectSpace('p1')","openFolderView('f');openProjectSpace('p1')",
    "projectArea(S.projects[0],'files');projectArea(S.projects[0],'overview')",'cancelMeetingOpen()','meetingCancelCapture()']){
    const h=lazyMeetingApp(),opening=h.open('a');h.a.run(transition);
    h.pending[0].reply(h.full('a'));await opening;
    assert.equal(h.mounts.length,0,transition);
  }
});

test('meeting loads attach to a refreshed list without re-fetching or overwriting a newer revision',async()=>{
  const h=lazyMeetingApp(),opening=h.open('a');
  h.a.run("S.meetings=S.meetings.map(m=>({...m}))");h.pending[0].reply(h.full('a'));await opening;
  assert.equal(h.pending.length,1);assert.equal(h.mounts.length,1);
  assert.equal(h.a.run('S.meetings[0].rawTranscript'),'原稿 a');
  const newer=lazyMeetingApp(),pending=newer.open('a');newer.a.run('S.meetings[0].revision=2');
  newer.pending[0].reply(newer.full('a',1));await pending;
  assert.equal(newer.mounts.length,0);assert.equal(newer.a.run('S.meetings[0].revision'),2);
  assert.equal(newer.notices.at(-1),'会议已更新，请重新打开');
});

test('archived meeting lazy loading also ignores out-of-order and stale errors',async()=>{
  const h=lazyMeetingApp();h.a.run("S.fileArchives=[{id:'p1'}]");
  const first=h.open('a'),last=h.open('b');h.pending[1].reply(h.full('b'));await last;
  h.pending[0].fail();await first;
  assert.equal(h.mounts.length,1);assert.match(h.mounts[0],/归档会议/);assert.match(h.mounts[0],/<h2>B<\/h2>/);
  assert.doesNotMatch(h.mounts[0],/id="saveMeeting"/);assert.ok(!h.notices.includes('加载失败'));
});

test('a failed meeting load is retryable and a dirty modal is not overwritten without consent',async()=>{
  const h=lazyMeetingApp(),failed=h.open('a');h.pending[0].fail();await failed;
  assert.equal(h.mounts.length,0);assert.equal(h.notices.at(-1),'加载失败');
  const retry=h.open('a');h.a.context.confirm=()=>false;h.a.run('UI.docDirty=true');
  h.pending[1].reply(h.full('a'));await retry;assert.equal(h.mounts.length,0);
  h.a.run('UI.docDirty=false');await h.open('a');assert.equal(h.mounts.length,1);
});

test('meeting refresh retains the draft while rebuilding working project header actions',()=>{
  const a=app(),elements={},calls=[];let button;
  const actions={classList:{toggle(){}}};Object.defineProperty(actions,'innerHTML',{set(html){this.html=html;button={dataset:{project:'p'}}},get(){return this.html}});
  a.context.document={querySelector:s=>s==='#projectActions'?actions:elements[s]||(elements[s]={dataset:{},innerHTML:'',classList:{toggle(){}}}),
    querySelectorAll:s=>s==='.add-project-task'?[button]:[]};
  a.context.calls=calls;a.run(`newTask=id=>calls.push(id);S.today='2026-11-05';S.user={id:'owner',admin:false};S.users=[];S.tasks=[];
    S.projects=[{id:'p',name:'项目',owner:'owner',status:'active',members:{owner:'accepted'}}];S.meetings=[];UI.space='p';setSpaceTab('meetings');renderProjectSpace('p')`);
  const pane=elements['#projectSpace'],before=pane.innerHTML;
  elements['#meetingEditor']={dataset:{dirty:'true'},innerHTML:'未保存的原稿'};
  a.run("S.meetings=[{id:'m',projectId:'p',title:'新会议'}];renderProjectSpace('p')");
  assert.equal(pane.innerHTML,before);assert.equal(elements['#meetingEditor'].innerHTML,'未保存的原稿');
  assert.equal(typeof button.onclick,'function');button.onclick();assert.deepEqual(calls,['p']);
  assert.match(elements['#projectMeetingList'].innerHTML,/新会议/);
});

test('unified project tabs preserve a refused dirty draft and invalidate pending meeting loads on accepted leave',()=>{
  const a=app(),panel={hidden:false},editor={dataset:{dirty:'true'}},tabs=['tasks','meetings','files'].map(key=>({dataset:{spaceTab:key},setAttribute(){},focus(){}}));
  a.context.document={querySelector:s=>s==='#meetingEditor'?editor:panel,querySelectorAll:()=>tabs};
  a.context.confirm=()=>false;a.run("S.user={id:'owner'};UI.space='p';setSpaceTab('meetings');bindProjectContentTabs()");
  tabs[0].onclick();assert.equal(a.run('spaceTabNow()'),'meetings');
  const old=a.run('meetingOpenGeneration');a.context.confirm=()=>true;tabs[2].onclick();
  assert.equal(a.run('spaceTabNow()'),'files');assert.ok(a.run('meetingOpenGeneration')>old);
});

test('the directory selection reverses direction and realigns after row resizing',()=>{
  const a=app(),classes=new Set(),values={};let top=50,height=32;
  const row={offsetHeight:32,getBoundingClientRect:()=>({top,bottom:top+height,left:10,width:180})};
  const mark={style:{setProperty:(k,v)=>values[k]=v},classList:{add:c=>classes.add(c),remove:(...cs)=>cs.forEach(c=>classes.delete(c))}};
  const nav={scrollTop:0,querySelector:s=>s==='.nav-indicator'?mark:s==='.project-nav-all.is-on'?row:null,getBoundingClientRect:()=>({top:0,left:0})};
  a.context.document={querySelector:()=>nav};a.context.window={matchMedia:()=>({matches:false})};
  a.run('placeNavIndicator()');top=20;a.run('placeNavIndicator()');assert.ok(classes.has('is-up'));
  top=80;height=64;a.run('placeNavIndicator()');assert.ok(classes.has('is-down'));assert.ok(!classes.has('is-up'));
  assert.equal(values['--nav-y2'],'144px');
});

test('guide follows the current completion and collaborator rules and keyboard navigation',()=>{
  const a=app(),els={},chapter={scrollIntoView(o){this.scroll=o},focus(o){this.focused=o}};
  const link={dataset:{guide:'tasks'},classList:{toggle(){}}};
  a.context.document={querySelector:s=>s==='#guide-tasks'?chapter:els[s]||(els[s]={}),querySelectorAll:()=>[link]};
  a.context.matchMedia=()=>({matches:true});a.run('renderGuide()');link.onclick({preventDefault(){}});
  assert.equal(chapter.scroll.behavior,'auto');assert.equal(chapter.focused.preventScroll,true);
  assert.match(els['#guideContent'].innerHTML,/不需要审批/);assert.match(els['#guideContent'].innerHTML,/无需接受邀请/);
  assert.doesNotMatch(els['#guideContent'].innerHTML,/需要审批的完成|被加为协作者的人会收到邀请/);
});


test('directory meeting navigation reveals the retained editor and synchronizes the unified tabs',()=>{
  const a=app(),els={},tabs=['tasks','meetings','files'].map(key=>({dataset:{spaceTab:key},setAttribute(k,v){this[k]=v}}));
  a.context.document={querySelector:s=>els[s]||(els[s]={dataset:{},classList:{toggle(){}},innerHTML:''}),querySelectorAll:s=>s==='#projectSpace [data-space-tab]'?tabs:[]};
  a.run("S.today='2026-11-05';S.user={id:'owner'};S.users=[];S.tasks=[];S.meetings=[];S.projects=[{id:'p',name:'项目',owner:'owner',status:'active',members:{owner:'accepted'}}];UI.space='p';setSpaceTab('tasks');renderProjectSpace('p')");
  const box=els['#projectSpace'],before=box.innerHTML;els['#meetingEditor']={dataset:{dirty:'false'},innerHTML:'保留的编辑器'};
  a.run("UI.view='projects';renderProjects=()=>renderProjectSpace(UI.space);renderProjectNav=()=>{};projectArea(S.projects[0],'meetings')");
  assert.equal(box.innerHTML,before);assert.equal(els['#spacePanel-meetings'].hidden,false);assert.equal(els['#spacePanel-tasks'].hidden,true);
  assert.equal(tabs[1]['aria-selected'],'true');assert.equal(tabs[1].tabIndex,0);assert.equal(tabs[0]['aria-selected'],'false');
});

test('the account settings row opens once by mouse, Enter or Space and has no nested button',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const markup=html.match(/<div[^>]*data-settings-go="accounts"[\s\S]*?<\/section>/)[0];
  assert.match(markup,/<div(?=[^>]*role="button")(?=[^>]*tabindex="0")[^>]*>/);assert.doesNotMatch(markup,/<button\b/);
  const a=app(),row={dataset:{settingsGo:'accounts'}},views=[];
  a.context.views=views;a.context.document={querySelectorAll:()=>[row]};a.run('switchView=view=>views.push(view)');
  const start=source.indexOf("$$('#settingsView [data-settings-go]')");
  a.run(source.slice(start,source.indexOf("$$('#settingsView [data-settings-page]')",start)));
  row.onclick();let prevented=0;for(const key of ['Enter',' ','ArrowDown'])row.onkeydown({key,preventDefault(){prevented++}});
  assert.deepEqual(views,['accounts','accounts','accounts']);assert.equal(prevented,2);
});

function tourHarness(){
  const a=app(),timers=[],writes=[],elements={},background=[{inert:false},{inert:true}],buttons=[];
  let modal=false,locked=false,focusRestored=false;
  const focus={isConnected:true,getClientRects:()=>[{}],closest:()=>null,focus(){focusRestored=true}};
  const veil={setAttribute(){},remove(){delete elements['#tourVeil']}};
  a.context.window={innerWidth:1280,addEventListener(){},removeEventListener(){}};
  a.context.localStorage={getItem:()=>null,setItem:(k,v)=>writes.push([k,v])};
  a.context.setTimeout=fn=>{timers.push(fn);return timers.length};a.context.clearTimeout=()=>{};
  a.context.document={activeElement:focus,body:{children:background,classList:{contains:()=>locked},appendChild:el=>elements['#tourVeil']=el},
    createElement:()=>veil,addEventListener(){},removeEventListener(){},querySelector:s=>s==='#modalBackdrop'?{classList:{contains:()=>!modal}}:elements[s]||null,
    querySelectorAll:()=>buttons};
  a.run("S.user={id:'owner'};tourShow=()=>{}");
  return {a,timers,writes,background,buttons,setModal:v=>modal=v,setLocked:v=>locked=v,restored:()=>focusRestored};
}
test('automatic tour defers around a task draft and starts only after its dialog closes',()=>{
  const h=tourHarness();h.setModal(true);h.a.run('offerTour();offerTour()');assert.equal(h.timers.length,1);
  h.timers[0]();assert.equal(h.a.run('tour'),null);assert.equal(h.timers.length,2);
  h.setModal(false);h.timers[1]();assert.equal(h.a.run('tour.owner'),'owner');
});
test('tour start refuses dirty edits, live recording and open dialogs',()=>{
  const h=tourHarness();
  h.a.run("UI.docDirty=true;startTour()");assert.equal(h.a.run('tour'),null);
  h.a.run("UI.docDirty=false;meetingLive.active=true;startTour()");assert.equal(h.a.run('tour'),null);
  h.a.run('meetingLive.active=false');h.setModal(true);h.a.run('startTour()');assert.equal(h.a.run('tour'),null);
});
test('pending tour offers cannot start under a different account, auth lock or phone viewport',()=>{
  for(const change of ["S.user={id:'other'}","window.innerWidth=390"]){const h=tourHarness();h.a.run('offerTour()');h.a.run(change);h.timers[0]();assert.equal(h.a.run('tour'),null)}
  const h=tourHarness();h.a.run('offerTour()');h.setLocked(true);h.timers[0]();assert.equal(h.a.run('tour'),null);
});
test('tour isolates the background, restores inert state and focus, and binds completion to its owner',()=>{
  const h=tourHarness();h.a.run('startTour()');assert.ok(h.background.every(e=>e.inert));
  h.a.run("S.user={id:'other'};endTour()");assert.deepEqual(h.background.map(e=>e.inert),[false,true]);assert.equal(h.restored(),true);
  assert.deepEqual(h.writes,[['wc-tour-done:owner','1']]);
  const cancelled=tourHarness();cancelled.a.run('startTour();endTour(false)');assert.equal(cancelled.writes.length,0);
});
test('tour Enter preserves focused button activation while navigation keys and background shortcuts stay isolated',()=>{
  const h=tourHarness(),moves=[];h.a.context.moves=moves;h.a.run('startTour();tourShow=(i,dir)=>moves.push([i,dir])');
  let prevented=0,stopped=0;
  for(const key of ['Enter','n'])h.a.context.event={key,target:{closest:s=>key==='Enter'?{}:null},preventDefault(){prevented++},stopPropagation(){stopped++}},h.a.run('tourKey(event)');
  assert.equal(prevented,0);assert.equal(stopped,2);assert.equal(moves.length,0);
  h.a.context.event={key:'ArrowRight',target:{closest:()=>null},preventDefault(){prevented++},stopPropagation(){}};h.a.run('tourKey(event)');assert.deepEqual(JSON.parse(JSON.stringify(moves)),[[1,1]]);assert.equal(prevented,1);
});
test('tour Tab and Shift-Tab wrap within its buttons',()=>{
  const h=tourHarness(),focused=[];h.buttons.push({focus:()=>focused.push(0)},{focus:()=>focused.push(1)});h.a.run('startTour()');
  for(const [index,shiftKey] of [[1,false],[0,true]]){h.a.context.document.activeElement=h.buttons[index];h.a.context.event={key:'Tab',shiftKey,target:{},preventDefault(){},stopPropagation(){}};h.a.run('tourKey(event)')}
  assert.deepEqual(focused,[0,1]);
});
test('project rail resize is available on tablet and reserves content space down to the phone breakpoint',()=>{
  const a=app();a.context.window={innerWidth:1000};assert.equal(a.run("navigationResizeEnabled('project')"),true);
  a.context.window.innerWidth=760;assert.equal(a.run("navigationResizeEnabled('project')"),false);
  assert.equal(a.run("navigationBounds('project',1000,600).max"),260);
  const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');assert.doesNotMatch(css,/grid-template-columns:\s*208px/);
  assert.match(a.run("TOUR.find(s=>s.ch==='档案').body"),/看团队日报和周报/);
});

test('project weekly report escapes summaries and has honest empty states',()=>{const a=app();a.run("S.today='2026-11-06'");const empty=a.run("weekReportDocument({start:'2026-10-31',end:'2026-11-06',work:{}})");assert.match(empty,/暂无待完成项目/);assert.match(empty,/本周暂无已结项项目/);const html=a.run(`weekReportDocument({start:'2026-10-31',end:'2026-11-06',work:{completedProjects:[{name:'<img>',completedOn:'2026-11-02',summary:'<script>bad</script>'}]}})`);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img>|<script>/)});


test('markdown renders the common marks and never lets markup or scripts through',()=>{
  const a=app();
  const html=a.run(`mdRender(['# 纪要','','**结论**：聚焦 *两条* 主线，见 [方案](https://example.com/a?b=1&c=2)。','',
    '- 资源表','  - 周五前补齐','- [x] 竞品数据','- [ ] 评审','','1. 第一','2. 第二','','> 待确认','','| 人 | 事 |','|---|---|','| 周一 | 资源表 |','',
    '\`\`\`','<b>不渲染</b>','\`\`\`','','---','<script>alert(1)</script> [x](javascript:alert(1)) \`<i>code</i>\`'].join('\\n'))`);
  assert.match(html,/<h2>纪要<\/h2>/);assert.match(html,/<strong>结论<\/strong>/);assert.match(html,/<em>两条<\/em>/);
  assert.match(html,/<a href="https:\/\/example.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">方案<\/a>/);
  assert.match(html,/<ul><li>资源表<ul><li>周五前补齐<\/li><\/ul><\/li>/,'缩进的列表嵌在上一项里');
  assert.match(html,/<li class="md-task"><input type="checkbox" disabled checked> 竞品数据<\/li>/);
  assert.match(html,/<ol><li>第一<\/li><li>第二<\/li><\/ol>/);assert.match(html,/<blockquote><p>待确认<\/p><\/blockquote>/);
  assert.match(html,/<th>人<\/th><th>事<\/th>/);assert.match(html,/<td>周一<\/td><td>资源表<\/td>/);
  assert.match(html,/<pre><code>&lt;b&gt;不渲染&lt;\/b&gt;<\/code><\/pre>/);assert.match(html,/<hr>/);
  assert.doesNotMatch(html,/<script|href="javascript|<i>/,'脚本、危险链接和 HTML 一律转义');
  assert.match(html,/<code>&lt;i&gt;code&lt;\/i&gt;<\/code>/);
});

function chatPagingApp(){
  const a=app(),calls=[],pages=[],log={innerHTML:'',isConnected:true,scrollHeight:100,scrollTop:0,clientHeight:100,querySelector:()=>null,insertAdjacentHTML(){}},button={isConnected:true,insertAdjacentHTML(){},remove(){this.isConnected=false}};
  a.context.document={querySelector:s=>s==='#chatLog'?log:s==='#chatMore'?button:null};
  a.context.fetch=async(url,options)=>{calls.push(JSON.parse(options.body).data);return {ok:true,text:async()=>JSON.stringify(pages.shift())}};
  a.run("let chatChannel='general',chatLastAt='',chatLastDay='',chatFirstAt='',chatFirstCursor=null,chatLastCursor=null,chatLoadGeneration=0,chatPreviews={};S.user={id:'member'};renderChatChannels=()=>{};reportChatRead=()=>{};chatBubble=()=>'<div>message</div>'");
  a.run(source.slice(source.indexOf('async function loadChat(reset)'),source.indexOf('async function reportChatRead(at)')));
  return {a,calls,pages,log,button};
}
test('chat history and live polling retain independent complete cursors',async()=>{
  const {a,calls,pages}=chatPagingApp(),at='2026-11-06T08:00:00+08:00';
  pages.push({messages:[{createdAt:at}],more:true,beforeCursor:{at,rowid:2},sinceCursor:{at,rowid:121}});
  await a.run('loadChat(true)');
  pages.push({messages:[{createdAt:at}],sinceCursor:{at,rowid:122}});await a.run('loadChat(false)');
  assert.deepEqual(calls[1].sinceCursor,{at,rowid:121});
  pages.push({messages:[{createdAt:at}],more:false,beforeCursor:{at,rowid:1}});await a.run('loadEarlierChat()');
  assert.deepEqual(calls[2].beforeCursor,{at,rowid:2});
  assert.equal(a.run('chatLastCursor.rowid'),122);assert.equal(a.run('chatFirstCursor.rowid'),1);
});
test('a late chat page cannot replace cursors after changing account or channel',async()=>{
  for(const change of ["S.user.id='other'","chatChannel='lounge'"]){
    const {a,log}=chatPagingApp();let resolve;a.context.fetch=()=>new Promise(r=>resolve=r);
    log.innerHTML='current account content';const pending=a.run('loadChat(true)');a.run(change);
    resolve({ok:true,text:async()=>JSON.stringify({messages:[{createdAt:'old'}],beforeCursor:{at:'old',rowid:1},sinceCursor:{at:'old',rowid:1}})});await pending;
    assert.equal(log.innerHTML,'current account content');assert.equal(a.run('chatLastCursor'),null);
  }
});

test('new meeting submits manually written minutes on its first save',async()=>{
  const {a,nodes,calls}=meetingApp();nodes['#meetingMinutesInput']={value:'## 手写结论\n- [ ] 跟进评审',addEventListener(){}};
  await nodes['#cancelAction'].onclick();
  assert.equal(calls[0].action,'meeting.create');assert.equal(calls[0].data.minutes,nodes['#meetingMinutesInput'].value);
  assert.equal(a.run('S.meetings[0].minutes'),nodes['#meetingMinutesInput'].value);
});
test('editing minutes while save is pending keeps the draft dirty',async()=>{
  const {a,nodes}=meetingApp();nodes['#meetingMinutesInput']={value:'submitted'};
  let finish,submitted;
  a.context.fetch=async(url,options)=>{submitted=JSON.parse(options.body);return new Promise(r=>finish=r)};
  const pending=nodes['#cancelAction'].onclick();await new Promise(setImmediate);
  nodes['#meetingMinutesInput'].value='new draft while saving';
  finish({ok:true,text:async()=>JSON.stringify({id:'m1',...submitted.data})});await pending;
  assert.equal(a.run('UI.docDirty'),true);assert.equal(a.run('S.meetings[0].minutes'),'submitted');
});
test('markdown formatting preserves link targets and still formats link labels',()=>{
  const a=app();
  for(const url of ['https://example.com/__init__.py','https://example.com/a**b**c','https://example.com/a~~b~~c']){
    a.context.markdown=`[**源码**](${url})`;const html=a.run('mdRender(markdown)');
    assert.ok(html.includes(`href="${url}"`));assert.match(html,/<strong>源码<\/strong>/);
    a.context.markdown=url;assert.ok(a.run('mdRender(markdown)').includes(`href="${url}"`));
  }
  assert.match(a.run('mdRender("[`code`](https://example.com)")'),/<code>code<\/code><\/a>/);
  assert.doesNotMatch(a.run('mdRender("[x](javascript:alert(1)) <script>bad</script>")'),/href="javascript:|<script>/);
});
function markdownFileApp(){
  const a=app(),opened=[],nodes={};a.context.capture=html=>opened.push(html);
  const node={value:'',isConnected:true,dataset:{},classList:{add(){}},addEventListener(){}};
  a.context.document={querySelector:s=>nodes[s]||node};
  a.run("S.user={id:'owner',admin:true};S.files=[{id:'f',projectId:'p',name:'private.md'}];S.fileArchives=[];S.projects=[];UI.view='projects';UI.space='p';openModal=capture;bindMdEditor=()=>{};closeModal=()=>{};toast=()=>{}");
  return {a,opened,nodes};
}
test('Markdown file reads discard obsolete accounts, navigation and closed viewers',async()=>{
  for(const change of ["S.user={id:'other'};S.files=[]","UI.view='today'","UI.space='other'","cancelMeetingOpen()"]){
    const {a,opened}=markdownFileApp();let finish;a.context.fetch=()=>new Promise(r=>finish=r);
    const pending=a.run("openMarkdownFile({id:'p',name:'private project',owner:'owner'},'f')");a.run(change);
    finish({ok:true,text:async()=> 'PRIVATE DOCUMENT'});await pending;assert.equal(opened.length,0,change);
  }
});
test('only the newest Markdown file selection opens when responses arrive out of order',async()=>{
  const {a,opened}=markdownFileApp(),pendingReads=[];a.context.fetch=()=>new Promise(r=>pendingReads.push(r));
  a.run("S.files.push({id:'f2',projectId:'p',name:'new.md'})");
  const old=a.run("openMarkdownFile({id:'p',name:'project',owner:'owner'},'f')");
  const latest=a.run("openMarkdownFile({id:'p',name:'project',owner:'owner'},'f2')");
  pendingReads[1]({ok:true,text:async()=> 'NEW DOCUMENT'});await latest;
  pendingReads[0]({ok:true,text:async()=> 'OLD DOCUMENT'});await old;
  assert.equal(opened.length,1);assert.match(opened[0],/NEW DOCUMENT/);assert.doesNotMatch(opened[0],/OLD DOCUMENT/);
});

function guideDemoHarness(reduced=false){
  const a=app(),timers=[],cleared=[],classes=new Set(),dots=Array.from({length:4},()=>({classList:{toggle(){}},setAttribute(){}}));
  const play={},caption={},fig={dataset:{demo:'task-life'},classList:{toggle(c,on){on?classes.add(c):classes.delete(c)},add(c){classes.add(c)},contains:c=>classes.has(c)},
    querySelector:s=>s==='.demo-play'?play:caption,querySelectorAll:()=>dots};
  a.context.root={querySelectorAll:()=>[fig]};a.context.matchMedia=()=>({matches:reduced});
  a.context.setInterval=fn=>{timers.push(fn);return timers.length};a.context.clearInterval=id=>cleared.push(id);
  a.context.IntersectionObserver=class {observe(){} disconnect(){}};
  a.run("UI.view='guide';bindGuideDemos(root)");return {a,fig,play,caption,dots,timers,cleared,classes};
}
test('tutorial demos advance only while visible and respect pause and leaving the guide',()=>{
  const h=guideDemoHarness();h.timers[0]();assert.equal(h.fig.dataset.step,'0');
  h.classes.add('is-visible');h.timers[0]();assert.equal(h.fig.dataset.step,'1');
  h.play.onclick();h.timers[0]();assert.equal(h.fig.dataset.step,'1');assert.equal(h.play.textContent,'播放');
  h.play.onclick();h.timers[0]();assert.equal(h.fig.dataset.step,'2');
  h.a.run("UI.view='today'");h.timers[0]();assert.ok(h.cleared.includes(1));
});
test('reduced-motion tutorials wait for manual steps and retain the selected caption',()=>{
  const h=guideDemoHarness(true);h.classes.add('is-visible');h.timers[0]();assert.equal(h.fig.dataset.step,'0');
  assert.equal(h.play.textContent,'播放');h.dots[2].onclick();h.timers[0]();assert.equal(h.fig.dataset.step,'2');
  assert.match(h.caption.textContent,/记录完成/);assert.equal(h.fig.dataset.paused,'1');
});

test('lineage lookup follows newly added tasks and replacement snapshots',()=>{
  const a=app();a.run("S.tasks=[{id:'root'},{id:'child',originId:'root'}]");
  assert.deepEqual(a.json('[...taskLineageIds(S.tasks[1])].sort()'),['child','root']);
  a.run("S.tasks.push({id:'redo',reworkOf:'child'})");
  assert.deepEqual(a.json('[...taskLineageIds(S.tasks[2])].sort()'),['child','redo','root']);
  a.run("S.tasks=[{id:'new-root'},{id:'child',originId:'new-root'},{id:'redo',reworkOf:'child'}]");
  assert.deepEqual(a.json('[...taskLineageIds(S.tasks[2])].sort()'),['child','new-root','redo']);
});
test('fresh work follows added and replaced task/project lists while notices change in place',()=>{
  const a=app();a.run("S.projects=[{id:'p'}];S.tasks=[{id:'t'}];S.notifications=[{fresh:true,read:false,reference:'later'},{fresh:true,read:false,reference:'p2'}]");
  assert.deepEqual(a.json('[...freshRefs()]'),[]);
  a.run("S.tasks.push({id:'later'});S.projects.push({id:'p2'})");
  assert.deepEqual(a.json('[...freshRefs()].sort()'),['later','p2']);
  a.run('S.notifications[0].read=true');assert.deepEqual(a.json('[...freshRefs()]'),['p2']);
  a.run("S.projects=[{id:'p'},{id:'replacement'}];S.tasks=[{id:'t'},{id:'other'}]");assert.deepEqual(a.json('[...freshRefs()]'),[]);
});

function contentDeleteApp(){
  const a=app(),calls=[],messages=[],nodes={};let closes=0,stops=0,refreshes=0,confirmed=true;
  a.context.document={querySelector:s=>nodes[s]||null};a.context.confirm=()=>confirmed;a.context.messages=messages;
  a.context.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,text:async()=>'{"deleted":true}'}};
  a.context.onRefresh=async()=>{refreshes++};a.context.onClose=()=>closes++;a.context.onStop=async()=>{stops++;a.run("meetingLive.revisions.set('owner:m',4)")};
  a.run("S.user={id:'owner',admin:false};S.today='2026-11-06';S.fileArchives=[];S.meetings=[{id:'m',projectId:'p',title:'会议',createdBy:'owner',revision:3},{id:'other',projectId:'p',title:'其他会议'}];S.files=[{id:'f',projectId:'p',name:'note.md',uploader:'owner'}];UI.view='projects';UI.space='p';toast=x=>messages.push(x);renderProjects=()=>{};renderProjectNav=()=>{};refresh=onRefresh;closeModal=onClose;meetingStopLive=onStop;var project={id:'p',owner:'owner',status:'active'}");
  return {a,calls,messages,nodes,setConfirm:v=>confirmed=v,closes:()=>closes,stops:()=>stops,refreshes:()=>refreshes};
}
test('meeting and file rows expose deletion only to authorized active-project users',()=>{
  const a=app();a.run("S.today='2026-11-06';S.fileArchives=[];S.user={id:'owner',admin:false};S.files=[{id:'f',projectId:'p',name:'note.md',uploader:'uploader'}];S.meetings=[{id:'m',projectId:'p',title:'周会',createdBy:'creator'}];var p={id:'p',owner:'owner',status:'active'}");
  assert.match(a.run('projectMeetingList(p)'),/data-delete-meeting="m"[^>]*>删除<\/button>/);
  assert.match(a.run('projectFiles(p)'),/aria-label="删除文件 note.md">删除<\/button>/);
  assert.doesNotMatch(a.run('projectMeetingList(p)'),/<button[^>]*class="meeting-row"[^]*?<button[^]*?<\/button><\/button>/);
  a.run("S.user={id:'member'}");assert.doesNotMatch(a.run('projectMeetingList(p)'),/data-delete-meeting/);assert.doesNotMatch(a.run('projectFiles(p)'),/class="text-btn file-delete"/);
  a.run("S.user={id:'creator'}");assert.match(a.run('projectMeetingList(p)'),/data-delete-meeting/);
  a.run("S.user={id:'uploader'}");assert.match(a.run('projectFiles(p)'),/class="text-btn file-delete"/);
  a.run("S.user={id:'admin',admin:true};S.fileArchives=[{id:'p'}]");assert.doesNotMatch(a.run('projectMeetingList(p)'),/data-delete-meeting/);assert.doesNotMatch(a.run('projectFiles(p,true)'),/class="text-btn file-delete"/);
});
test('cancelling content deletion sends no requests and does not stop recording',async()=>{
  const h=contentDeleteApp();h.setConfirm(false);h.a.run("meetingLive.meetingId='m'");
  assert.equal(await h.a.run("deleteProjectMeeting(project,'m')"),false);assert.equal(await h.a.run("deleteProjectFile(project,'f')"),false);
  assert.equal(h.calls.length,0);assert.equal(h.stops(),0);assert.equal(h.a.run('S.meetings.length'),2);assert.equal(h.a.run('S.files.length'),1);
});
test('deleting a recording flushes its final revision and clears only its own editor',async()=>{
  const h=contentDeleteApp();h.nodes['#meetingEditor']={dataset:{meetingId:'m',dirty:'true'},innerHTML:'current editor'};h.a.run("meetingLive.meetingId='m'");
  assert.equal(await h.a.run("deleteProjectMeeting(project,'m')"),true);assert.equal(h.stops(),1);assert.equal(h.calls[0].data.expectedRevision,4);
  assert.equal(h.nodes['#meetingEditor'].dataset.dirty,'false');assert.deepEqual(h.a.json('S.meetings.map(x=>x.id)'),['other']);
  const other=contentDeleteApp();other.nodes['#meetingEditor']={dataset:{meetingId:'other',dirty:'true'},innerHTML:'unsubmitted draft'};
  await other.a.run("deleteProjectMeeting(project,'m')");assert.equal(other.nodes['#meetingEditor'].innerHTML,'unsubmitted draft');assert.equal(other.nodes['#meetingEditor'].dataset.dirty,'true');
});
test('failed deletion keeps the content and draft and can be retried',async()=>{
  const h=contentDeleteApp();h.nodes['#meetingEditor']={dataset:{meetingId:'m',dirty:'true'},innerHTML:'draft'};h.a.context.button={disabled:false};
  h.a.context.fetch=async()=>({ok:false,text:async()=>'{"error":"会议已变化"}'});
  assert.equal(await h.a.run("deleteProjectMeeting(project,'m',button)"),false);assert.equal(h.a.run('S.meetings.length'),2);assert.equal(h.nodes['#meetingEditor'].innerHTML,'draft');assert.equal(h.a.context.button.disabled,false);assert.equal(h.messages.at(-1),'会议已变化');assert.equal(h.refreshes(),1);
  h.a.context.fetch=async()=>({ok:true,text:async()=>'{"deleted":true}'});assert.equal(await h.a.run("deleteProjectMeeting(project,'m',button)"),true);
});
test('repeated delete clicks share one pending action and late results leave a switched account alone',async()=>{
  const h=contentDeleteApp();let finish;h.a.context.fetch=async(url,options)=>{h.calls.push(JSON.parse(options.body));return new Promise(r=>finish=r)};
  const pending=h.a.run("deleteProjectMeeting(project,'m')");assert.equal(await h.a.run("deleteProjectMeeting(project,'m')"),false);assert.equal(h.calls.length,1);
  h.a.run("S.user={id:'new-account'};S.meetings=[{id:'new-account-meeting'}]");finish({ok:true,text:async()=>'{"deleted":true}'});await pending;
  assert.deepEqual(h.a.json('S.meetings.map(x=>x.id)'),['new-account-meeting']);assert.equal(h.closes(),0);
});
test('file deletion closes its own viewer once and keeps another open draft',async()=>{
  const h=contentDeleteApp();h.nodes['#mdFileEditor']={dataset:{fileId:'f'}};h.a.run('UI.docDirty=true');
  assert.equal(await h.a.run("deleteProjectFile(project,'f')"),true);assert.equal(h.closes(),1);assert.equal(h.a.run('UI.docDirty'),false);assert.equal(h.a.run('S.files.length'),0);
  const other=contentDeleteApp();other.nodes['#mdFileEditor']={dataset:{fileId:'another-file'}};other.a.run('UI.docDirty=true');
  await other.a.run("deleteProjectFile(project,'f')");assert.equal(other.closes(),0);assert.equal(other.a.run('UI.docDirty'),true);
});
test('a Markdown response cannot reopen a file removed while its read was pending',async()=>{
  const {a,opened}=markdownFileApp();let finish;a.context.fetch=()=>new Promise(r=>finish=r);
  const pending=a.run("openMarkdownFile({id:'p',name:'project',owner:'owner'},'f')");a.run('S.files=[]');
  finish({ok:true,text:async()=> 'DELETED FILE'});await pending;assert.equal(opened.length,0);
});
test('the first meeting save reveals deletion without reopening the editor',async()=>{
  const {a,nodes}=meetingApp();let hidden;
  nodes['#deleteMeeting']={classList:{toggle:(name,on)=>{if(name==='hidden')hidden=on}}};
  a.run("S.user={id:'owner'};openMeetingEditor({id:'p1',name:'项目',owner:'owner',status:'active'})");nodes['#meetingTitle'].value='新会议';
  assert.equal(hidden,true);await nodes['#saveMeeting'].onclick();assert.equal(hidden,false);assert.equal(nodes['#saveMeeting'].textContent,'保存会议');
});

test('a recording flush failure prevents deletion and preserves the meeting',async()=>{
  const h=contentDeleteApp();h.a.run("meetingLive.meetingId='m';meetingStopLive=async()=>{throw Error('原稿保存失败')}");
  assert.equal(await h.a.run("deleteProjectMeeting(project,'m')"),false);assert.equal(h.calls.length,0);assert.equal(h.a.run('S.meetings.length'),2);assert.equal(h.messages.at(-1),'原稿保存失败');
});
test('a denied file deletion preserves the open unsaved file',async()=>{
  const h=contentDeleteApp();h.nodes['#mdFileEditor']={dataset:{fileId:'f'}};h.a.run('UI.docDirty=true');h.a.context.button={disabled:false};
  h.a.context.fetch=async()=>({ok:false,text:async()=>'{"error":"无权删除"}'});
  assert.equal(await h.a.run("deleteProjectFile(project,'f',button)"),false);assert.equal(h.a.run('S.files.length'),1);assert.equal(h.closes(),0);assert.equal(h.a.run('UI.docDirty'),true);assert.equal(h.a.context.button.disabled,false);
});
