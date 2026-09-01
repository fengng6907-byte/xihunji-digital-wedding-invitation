/* XiHunJi Design v2 — copy and hierarchy polish */
(()=>{'use strict';
const eyebrowMap={
  'Wedding cockpit':'婚礼概览',
  'Plan together':'共同筹备',
  'Wedding day':'婚礼当天',
  'Spend intentionally':'预算管理',
  'Guest intelligence':'宾客管理',
  'Digital invitation':'电子请柬',
  'Vendor hub':'供应商',
  'Planning assistant':'婚礼助手',
  'Preferences':'设置'
};

if(typeof pageHead==='function'){
  const originalPageHead=pageHead;
  pageHead=function(eyebrow,title,desc,action=''){
    return originalPageHead(eyebrowMap[eyebrow]||eyebrow,title,desc,action);
  };
}

if(typeof updateShell==='function'){
  const originalUpdateShell=updateShell;
  updateShell=function(){
    originalUpdateShell();
    const e=document.getElementById('topEyebrow');
    if(!e)return;
    const map={Overview:'概览',Tasks:'待办',Runsheet:'流程',Budget:'预算',Guests:'宾客',Invitation:'请柬',Vendors:'供应商',Assistant:'助手',XiHunJi:'喜婚记'};
    e.textContent=map[e.textContent]||e.textContent;
  };
}

function polishVisibleCopy(){
  const replacements=new Map([
    ['Ready to share','可分享'],
    ['Responses','已回复'],
    ['Attending','出席人数'],
    ['Unassigned','待安排'],
    ['UNASSIGNED GUESTS / 待安排坐席','待安排宾客'],
    ['PAX','人数'],
    ['DAYS TO GO','天'],
    ['Auto-save','自动保存']
  ]);
  document.querySelectorAll('small,span,strong,div').forEach(el=>{
    if(el.children.length===0){
      const t=el.textContent.trim();
      if(replacements.has(t))el.textContent=replacements.get(t);
    }
  });
}

const renderers=['renderOverview','renderTasks','renderTimeline','renderBudget','renderGuests','renderInvite','renderVendors','renderAI','renderSettings'];
renderers.forEach(name=>{
  const fn=window[name];
  if(typeof fn!=='function')return;
  window[name]=function(...args){const r=fn.apply(this,args);queueMicrotask(polishVisibleCopy);return r};
});

if(typeof renderCurrent==='function'){
  try{renderCurrent();}catch(e){console.warn('[XiHunJi design refresh]',e)}
}
queueMicrotask(polishVisibleCopy);
})();
