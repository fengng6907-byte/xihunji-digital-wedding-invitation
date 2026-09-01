/* XiHunJi share-link publishing guard */
(()=>{'use strict';
async function publishBeforeShare(){
  if(typeof window.xhjPushInvite!=='function'){
    toast('云端模块尚未完成载入，请刷新后再试');
    return false;
  }
  const ok=await window.xhjPushInvite();
  if(!ok){
    toast('请先到「设置与云端」登录新人账号，再发布电子请柬');
    return false;
  }
  return true;
}

copyInviteLink=async function(){
  if(!(await publishBeforeShare()))return;
  copyText(buildInviteShareUrl(),'请柬已发布，邀请链接已复制');
};

copyWhatsAppInvite=async function(){
  if(!(await publishBeforeShare()))return;
  const p=state.profile;
  const text=`💌 ${p.groom||'新郎'} & ${p.bride||'新娘'} 邀请您参加我们的婚礼\n\n${invitationDateText()}\n${p.venue||''}\n\n${state.invite.message}\n\n查看电子请柬 & RSVP：\n${buildInviteShareUrl()}`;
  copyText(text,'请柬已发布，WhatsApp 邀请文案已复制');
};

regenerateInviteToken=async function(){
  if(!confirm('重新生成后，旧的分享链接将失效。确定继续吗？'))return;
  state.invite.token='xhj-'+uid('').slice(-10);
  saveState(true);
  const ok=await publishBeforeShare();
  renderInvite();
  toast(ok?'新邀请链接已生成并发布':'新链接已生成，但尚未发布；请先登录云端');
};

const baseRenderInvite=renderInvite;
renderInvite=function(){
  baseRenderInvite();
  const view=document.getElementById('view-invite');
  if(!view||view.querySelector('.xhj-publish-note'))return;
  const head=view.querySelector('.page-head');
  if(!head)return;
  const note=document.createElement('div');
  note.className='xhj-publish-note card';
  note.style.cssText='margin:-8px 0 16px;padding:12px 14px;border:1px solid #eadfd6;background:#fffaf5;font-size:11px;line-height:1.7;color:#756d67';
  note.innerHTML='☁ <b>分享链接会先发布到 Supabase</b>。请先在「设置与云端」登录新人账号。之后点击「复制邀请链接」时，系统会自动同步请柬，再复制可用链接。';
  head.insertAdjacentElement('afterend',note);
};
})();
