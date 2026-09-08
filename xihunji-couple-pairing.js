/* XiHunJi Couple Pairing — separate logins, one shared wedding */
(()=>{'use strict';
const CFG={url:'https://ztpxjwqjnrosdagsasjk.supabase.co',key:'sb_publishable_8AJOnIeY04M0J8l72D9xIg_3n4yyo5k'};
let pairSB=null,pairUser=null,pairStatus=null,syncTimer=null,pulling=false;

async function pairInit(){
  if(pairSB)return pairSB;
  if(!window.supabase?.createClient)return null;
  pairSB=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data}=await pairSB.auth.getSession();
  pairUser=data.session?.user||null;
  pairSB.auth.onAuthStateChange(async(_e,s)=>{
    pairUser=s?.user||null;
    if(pairUser)await refreshPairContext(false);
    else pairStatus=null;
    if(currentView==='settings')renderSettings();
  });
  return pairSB;
}

async function resolveInvitationId(){
  await pairInit();
  if(!pairUser)return null;
  if(state.cloud?.invitationId){
    const q=await pairSB.from('invitations').select('id,owner_id,partner_user_id').eq('id',state.cloud.invitationId).maybeSingle();
    if(q.data)return q.data.id;
  }
  const q=await pairSB.from('invitations').select('id,owner_id,partner_user_id,updated_at').order('updated_at',{ascending:false}).limit(1);
  if(q.error)throw q.error;
  const id=q.data?.[0]?.id||null;
  if(id){state.cloud=Object.assign({},state.cloud||{},{invitationId:id});saveLocalOnly();}
  return id;
}

function saveLocalOnly(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));const el=document.getElementById('saveState');if(el)el.textContent='已保存';}catch(e){console.warn(e)}
}

function sharedSnapshot(){
  const copy=JSON.parse(JSON.stringify(state));
  // cloud session metadata stays device-local; wedding id is restored separately.
  delete copy.cloud;
  return copy;
}

async function pushSharedState(show=false){
  if(pulling)return;
  try{
    await pairInit();
    if(!pairUser)return;
    const invitationId=await resolveInvitationId();
    if(!invitationId)return;
    const q=await pairSB.from('wedding_shared_state').upsert({
      invitation_id:invitationId,
      planning_state:sharedSnapshot(),
      updated_by:pairUser.id,
      updated_at:new Date().toISOString()
    },{onConflict:'invitation_id'});
    if(q.error)throw q.error;
    if(show)toast('双人资料已同步');
  }catch(e){
    console.warn('[XiHunJi shared push]',e);
    if(show)toast('双人同步失败：'+e.message);
  }
}

async function pullSharedState(show=false){
  try{
    await pairInit();
    if(!pairUser)return false;
    const invitationId=await resolveInvitationId();
    if(!invitationId)return false;
    const q=await pairSB.from('wedding_shared_state').select('planning_state,updated_at').eq('invitation_id',invitationId).maybeSingle();
    if(q.error)throw q.error;
    if(!q.data?.planning_state)return false;
    pulling=true;
    const cloud=Object.assign({},state.cloud||{},{invitationId});
    state=Object.assign(clone(DEFAULT),q.data.planning_state,{cloud});
    state.profile=Object.assign({},DEFAULT.profile,state.profile||{});
    state.invite=Object.assign({},DEFAULT.invite,state.invite||{});
    state.guests=(state.guests||[]).map(normalizeGuest);
    ensureInviteDefaults();
    reallocateAllSeats();
    saveLocalOnly();
    renderCurrent();
    if(show)toast('已读取另一半的最新资料');
    return true;
  }catch(e){
    console.warn('[XiHunJi shared pull]',e);
    if(show)toast('读取双人资料失败：'+e.message);
    return false;
  }finally{pulling=false}
}

async function refreshPairContext(pull=true){
  await pairInit();
  if(!pairUser){pairStatus=null;return}
  let invitationId=await resolveInvitationId();
  if(!invitationId){pairStatus=null;return}
  const q=await pairSB.rpc('get_wedding_pair_status',{p_invitation_id:invitationId});
  if(q.error){console.warn(q.error);pairStatus=null;return}
  pairStatus=q.data||null;
  if(pull&&pairStatus?.paired)await pullSharedState(false);
}

async function ensureWeddingForPairing(){
  await pairInit();
  if(!pairUser)throw Error('请先登录');
  let invitationId=await resolveInvitationId();
  if(invitationId)return invitationId;
  if(typeof window.xhjPushInvite==='function'){
    const ok=await window.xhjPushInvite();
    if(!ok)throw Error('无法建立婚礼资料');
    invitationId=await resolveInvitationId();
  }
  if(!invitationId)throw Error('请先上传婚礼资料');
  return invitationId;
}

async function generatePairCode(){
  try{
    const invitationId=await ensureWeddingForPairing();
    await pushSharedState(false);
    const q=await pairSB.rpc('create_wedding_pair_code',{p_invitation_id:invitationId});
    if(q.error)throw q.error;
    pairStatus=q.data;
    renderSettings();
    if(pairStatus?.paired)toast('你们已经完成配对');
    else toast('新的 8 位配对号码已生成');
  }catch(e){toast('生成配对号码失败：'+e.message)}
}

async function joinByCode(){
  const input=document.getElementById('weddingPairCode');
  const code=(input?.value||'').replace(/\D/g,'');
  if(code.length!==8)return toast('请输入完整 8 位配对号码');
  try{
    await pairInit();
    if(!pairUser)return toast('请先登录自己的账号');
    const q=await pairSB.rpc('join_wedding_by_code',{p_code:code});
    if(q.error)throw q.error;
    const invitationId=q.data;
    state.cloud=Object.assign({},state.cloud||{},{invitationId});
    saveLocalOnly();
    await refreshPairContext(false);
    await pullSharedState(false);
    renderSettings();
    toast('配对成功 · 你们现在共用同一场婚礼');
  }catch(e){toast('配对失败：'+e.message)}
}

function pairingCard(){
  if(!pairUser)return `<div class="card setting-card xhj-pair-card"><h3>♡ 双人账号</h3><p class="muted" style="font-size:12px;line-height:1.8">先用自己的 Email 和密码注册 / 登录。登录后可以生成或输入 8 位婚礼配对号码。</p></div>`;
  if(pairStatus?.paired)return `<div class="card setting-card xhj-pair-card"><div class="xhj-pair-head"><div><h3>♡ 双人账号</h3><p class="muted">已连接到同一场婚礼</p></div><span class="pill green">已配对</span></div><p class="muted" style="font-size:12px;line-height:1.8">你和另一半保留各自的登录账号，但共同使用同一份婚礼资料。</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-secondary btn-small" onclick="xhjPairPull()">读取最新资料</button><button class="btn btn-secondary btn-small" onclick="xhjPairPush()">立即同步</button></div></div>`;
  if(pairStatus?.is_owner)return `<div class="card setting-card xhj-pair-card"><h3>♡ 邀请另一半</h3><p class="muted" style="font-size:12px;line-height:1.8">生成一个一次性 8 位配对号码，发给另一半。号码 24 小时后失效，成功配对后也会立即失效。</p>${pairStatus.pair_code?`<div class="xhj-pair-code">${pairStatus.pair_code}</div><button class="btn btn-secondary btn-small" onclick="copyText('${pairStatus.pair_code}','配对号码已复制')">复制号码</button> <button class="btn btn-ghost btn-small" onclick="xhjPairGenerate()">重新生成</button>`:`<button class="btn btn-primary btn-small" onclick="xhjPairGenerate()">生成配对号码</button>`}</div>`;
  return `<div class="card setting-card xhj-pair-card"><h3>♡ 配对另一半的婚礼</h3><p class="muted" style="font-size:12px;line-height:1.8">输入另一半发给你的 8 位号码。配对后你们会看到同一份婚礼资料。</p><div class="xhj-pair-join"><input class="field" id="weddingPairCode" inputmode="numeric" maxlength="8" autocomplete="one-time-code" placeholder="例如 4827 1935"><button class="btn btn-primary btn-small" onclick="xhjPairJoin()">配对</button></div></div>`;
}

function fixAuthFields(){
  const email=document.getElementById('cloudEmail');
  const pass=document.getElementById('cloudPassword');
  if(email){email.type='email';email.autocomplete='email';email.placeholder='Email，例如 name@email.com';}
  if(pass){pass.type='password';pass.autocomplete='new-password';pass.placeholder='密码（至少 6 位，不是手机号）';if(/^\+?60\d+/.test(pass.value||''))pass.value='';}
  if(pass&&!pass.previousElementSibling?.classList?.contains('xhj-pass-label')){
    const note=document.createElement('div');note.className='xhj-pass-label';note.style.cssText='font-size:10px;color:var(--muted);margin:-3px 0 7px';note.textContent='Password · 自己设定至少 6 位密码，不需要 +60';pass.parentNode?.insertBefore(note,pass);
  }
}

const originalRenderSettings=renderSettings;
renderSettings=function(){
  originalRenderSettings();
  fixAuthFields();
  const grid=document.querySelector('#view-settings .settings-grid');
  if(grid&&!grid.querySelector('.xhj-pair-card'))grid.insertAdjacentHTML('beforeend',pairingCard());
};

// Save locally immediately, then sync the shared wedding in the background.
const originalSaveState=saveState;
saveState=function(...args){
  const r=originalSaveState.apply(this,args);
  if(!pulling){clearTimeout(syncTimer);syncTimer=setTimeout(()=>pushSharedState(false),1200)}
  return r;
};

window.xhjPairGenerate=generatePairCode;
window.xhjPairJoin=joinByCode;
window.xhjPairPull=()=>pullSharedState(true);
window.xhjPairPush=()=>pushSharedState(true);

(async()=>{
  await pairInit();
  if(pairUser)await refreshPairContext(true);
  if(currentView==='settings')renderSettings();
})();
})();
