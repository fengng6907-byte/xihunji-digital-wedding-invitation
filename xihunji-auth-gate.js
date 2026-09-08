/* XiHunJi mandatory authentication + onboarding gate */
(()=>{'use strict';
const CFG={url:'https://ztpxjwqjnrosdagsasjk.supabase.co',key:'sb_publishable_8AJOnIeY04M0J8l72D9xIg_3n4yyo5k'};
let authSB=null,authUser=null,mode='signup',existingInvitationId=null;
const publicRoute=()=>{const u=new URL(location.href);return (u.searchParams.get('view')==='guest'&&u.searchParams.get('invite'))||u.searchParams.get('party')};
const escAuth=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function authInit(){
  if(authSB)return authSB;
  if(!window.supabase?.createClient)return null;
  authSB=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data}=await authSB.auth.getSession();
  authUser=data.session?.user||null;
  authSB.auth.onAuthStateChange(async(_event,session)=>{
    authUser=session?.user||null;
    if(publicRoute())return;
    if(!authUser){existingInvitationId=null;showGate('auth');}
    else{await discoverWedding();showGate('welcome')}
  });
  return authSB;
}

function ensureGate(){
  let root=document.getElementById('xhjAuthGate');
  if(root)return root;
  root=document.createElement('div');root.id='xhjAuthGate';root.className='xhj-auth-gate';document.body.appendChild(root);return root;
}
function brand(){return `<section class="xhj-auth-brand"><div><div class="xhj-auth-logo">囍 · 喜婚记</div><h1>两个人，<br>一起把婚礼准备好。</h1><p>你们各自拥有自己的账号，却共同管理同一场婚礼。待办、宾客、预算、流程和团队，都留在同一个地方。</p></div><div class="xhj-auth-foot">XIHUNJI · WEDDING PLANNER</div></section>`}
function shell(content){return `<div class="xhj-auth-shell">${brand()}<section class="xhj-auth-main">${content}</section></div>`}
function message(text,ok=false){const el=document.getElementById('xhjAuthMsg');if(!el)return;el.className='xhj-auth-msg show'+(ok?' ok':'');el.textContent=text}
function clearMessage(){const el=document.getElementById('xhjAuthMsg');if(el){el.className='xhj-auth-msg';el.textContent=''}}

function authCard(){return `<div class="xhj-auth-card"><div class="xhj-auth-eyebrow">ACCOUNT</div><h2>${mode==='signup'?'建立你的喜婚记账号':'欢迎回来'}</h2><p class="xhj-auth-copy">${mode==='signup'?'先注册账号，再开始筹备。之后可以邀请另一半用配对号码加入同一场婚礼。':'登录后继续你们的婚礼筹备。'}</p><div class="xhj-auth-tabs"><button class="xhj-auth-tab ${mode==='signup'?'active':''}" onclick="xhjAuthMode('signup')">注册</button><button class="xhj-auth-tab ${mode==='login'?'active':''}" onclick="xhjAuthMode('login')">登录</button></div><div class="xhj-auth-fields"><div><label>Email</label><input class="field" id="xhjAuthEmail" type="email" inputmode="email" autocomplete="email" placeholder="name@email.com"></div><div><label>Password</label><input class="field" id="xhjAuthPassword" type="password" autocomplete="${mode==='signup'?'new-password':'current-password'}" minlength="6" placeholder="至少 6 位密码"></div>${mode==='signup'?`<div><label>再次输入密码</label><input class="field" id="xhjAuthPassword2" type="password" autocomplete="new-password" minlength="6" placeholder="再次输入密码"></div>`:''}<button class="btn btn-primary xhj-auth-btn" id="xhjAuthSubmit" onclick="xhjAuthSubmit()">${mode==='signup'?'注册并继续':'登录'}</button></div><div id="xhjAuthMsg" class="xhj-auth-msg"></div><div class="xhj-auth-note">密码是你自己设定的登录密码，不是手机号，也不需要 +60。宾客 RSVP 与伴郎伴娘专属任务链接不需要注册。</div></div>`}

function welcomeCard(){const email=authUser?.email||'';return `<div class="xhj-auth-card"><div class="xhj-auth-eyebrow">WELCOME</div><h2>${existingInvitationId?'继续你们的婚礼':'开始喜婚记'}</h2><div class="xhj-auth-user">已登录 · ${escAuth(email)}</div><div class="xhj-auth-welcome">${existingInvitationId?`<button class="xhj-auth-choice" onclick="xhjAuthContinue()"><strong>继续我的婚礼 →</strong><p>读取已经建立或已经配对的婚礼资料。</p></button>`:`<button class="xhj-auth-choice" onclick="xhjAuthCreateWedding()"><strong>建立一场新婚礼 →</strong><p>先填写新人、婚期与场地，再开始筹备。</p></button>`}<div class="xhj-auth-choice" style="cursor:default"><strong>我有另一半的配对号码</strong><p>输入 8 位号码，加入同一场婚礼。每个人仍然使用自己的 Email 和密码。</p><div class="xhj-auth-code"><input class="field" id="xhjAuthPairCode" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="one-time-code" placeholder="00000000"><button class="btn btn-primary" onclick="xhjAuthJoinPair()">配对</button></div></div><button class="btn btn-ghost btn-small" onclick="xhjAuthLogout()">退出这个账号</button></div><div id="xhjAuthMsg" class="xhj-auth-msg"></div></div>`}

function showGate(stage='auth'){
  if(publicRoute())return;
  const root=ensureGate();root.classList.remove('hidden');root.innerHTML=shell(stage==='welcome'&&authUser?welcomeCard():authCard());
  document.getElementById('landing')?.classList.add('hidden');
  document.getElementById('planner')?.classList.add('hidden');
}
function hideGate(){const root=ensureGate();root.classList.add('hidden')}

function friendlyError(e){
  const raw=String(e?.message||e||'').trim();const s=raw.toLowerCase();
  if(s.includes('already registered')||s.includes('already been registered')||s.includes('user already'))return '这个 Email 已经注册过了，请切换到「登录」。';
  if(s.includes('invalid login credentials'))return 'Email 或密码不正确。';
  if(s.includes('password')&&s.includes('characters'))return '密码太短，请至少输入 6 位。';
  if(s.includes('invalid email'))return 'Email 格式不正确，请检查后再试。';
  if(s.includes('email rate limit'))return '注册邮件发送太频繁，请稍后再试。';
  if(s.includes('signup')&&s.includes('disabled'))return 'Supabase 目前关闭了 Email 注册，需要在 Authentication 设置开启 Email Signups。';
  if(s.includes('email not confirmed'))return '这个账号还没完成 Email 验证，请先打开验证邮件。';
  return raw||'操作失败，请稍后再试。';
}

async function discoverWedding(){
  existingInvitationId=null;if(!authUser||!authSB)return null;
  try{const q=await authSB.from('invitations').select('id,updated_at').order('updated_at',{ascending:false}).limit(1);if(q.error)throw q.error;existingInvitationId=q.data?.[0]?.id||null;if(existingInvitationId){state.cloud=Object.assign({},state.cloud||{},{invitationId:existingInvitationId});try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}}return existingInvitationId}catch(e){console.warn('[XiHunJi auth discover wedding]',e);return null}
}

async function submitAuth(){
  clearMessage();await authInit();const email=document.getElementById('xhjAuthEmail')?.value.trim();const password=document.getElementById('xhjAuthPassword')?.value||'';const password2=document.getElementById('xhjAuthPassword2')?.value||'';const btn=document.getElementById('xhjAuthSubmit');
  if(!email)return message('请输入 Email。');if(password.length<6)return message('密码至少需要 6 位。');if(mode==='signup'&&password!==password2)return message('两次输入的密码不一致。');
  if(btn){btn.disabled=true;btn.textContent=mode==='signup'?'正在注册…':'正在登录…'}
  try{
    if(mode==='signup'){
      const r=await authSB.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(r.error)throw r.error;
      if(!r.data.session){message('账号已经建立。请打开 Email 验证邮件，验证后回到这里登录。',true);mode='login';setTimeout(()=>{if(!authUser)showGate('auth')},2600);return}
      authUser=r.data.session.user;await discoverWedding();showGate('welcome');
    }else{
      const r=await authSB.auth.signInWithPassword({email,password});if(r.error)throw r.error;authUser=r.data.user||r.data.session?.user;await discoverWedding();showGate('welcome');
    }
  }catch(e){console.error('[XiHunJi auth]',e);message((mode==='signup'?'注册失败：':'登录失败：')+friendlyError(e))}
  finally{if(btn){btn.disabled=false;btn.textContent=mode==='signup'?'注册并继续':'登录'}}
}

async function continueWedding(){
  if(!authUser)return showGate('auth');if(existingInvitationId)state.cloud=Object.assign({},state.cloud||{},{invitationId:existingInvitationId});
  if(typeof window.xhjPairPull==='function')try{await window.xhjPairPull()}catch{}
  hideGate();document.getElementById('landing')?.classList.add('hidden');document.getElementById('planner')?.classList.remove('hidden');renderNav();renderCurrent();
}
async function createWedding(){
  if(!authUser)return showGate('auth');hideGate();document.getElementById('landing')?.classList.add('hidden');document.getElementById('planner')?.classList.remove('hidden');renderNav();renderCurrent();openSetup();
}
async function joinPair(){
  clearMessage();await authInit();const code=(document.getElementById('xhjAuthPairCode')?.value||'').replace(/\D/g,'');if(code.length!==8)return message('请输入完整的 8 位配对号码。');
  try{const q=await authSB.rpc('join_wedding_by_code',{p_code:code});if(q.error)throw q.error;existingInvitationId=q.data;state.cloud=Object.assign({},state.cloud||{},{invitationId:existingInvitationId});try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{};if(typeof window.xhjPairPull==='function')await window.xhjPairPull();message('配对成功，正在进入你们共同的婚礼。',true);setTimeout(continueWedding,500)}catch(e){console.error(e);message('配对失败：'+friendlyError(e))}
}
async function logout(){await authInit();await authSB.auth.signOut();authUser=null;existingInvitationId=null;showGate('auth')}

const originalEnterPlanner=window.enterPlanner;
if(typeof originalEnterPlanner==='function')window.enterPlanner=function(){if(!authUser){showGate('auth');return}return originalEnterPlanner.apply(this,arguments)};
const originalEnterDemo=window.enterDemo;
if(typeof originalEnterDemo==='function')window.enterDemo=function(){if(!authUser){showGate('auth');return}return originalEnterDemo.apply(this,arguments)};

window.xhjAuthMode=function(next){mode=next==='login'?'login':'signup';showGate('auth')};
window.xhjAuthSubmit=submitAuth;window.xhjAuthContinue=continueWedding;window.xhjAuthCreateWedding=createWedding;window.xhjAuthJoinPair=joinPair;window.xhjAuthLogout=logout;

(async()=>{if(publicRoute())return;await authInit();if(authUser){await discoverWedding();showGate('welcome')}else showGate('auth')})();
})();
