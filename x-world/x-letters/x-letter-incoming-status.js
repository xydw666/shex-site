((root,factory)=>{const api=factory(root||{});if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SHEXXLettersIncomingStatus=api;})(typeof window!=='undefined'?window:globalThis,root=>{
 'use strict';
 const day=time=>new Date(time+8*3600000).toISOString().slice(0,10);
 const ownerKey=owner=>JSON.stringify([owner?.userId,owner?.dreamId]);
 function createStore({api,now=()=>Date.now()}={}){
  const records=new Map(),pending=new Map(),updated=new Map(),acknowledged=new Map(),listeners=new Set();let epoch=0;
  const key=owner=>JSON.stringify([owner.userId,owner.dreamId,day(now())]);
  const empty=()=>({available:false,confirmed:false,dailyAvailable:false,hasUnread:false,processing:false,dailyOperation:null,capabilities:{},error:''});
  function snapshot(owner){return owner?.userId&&owner?.dreamId?records.get(key(owner))||empty():empty();}
  function emit(owner){for(const fn of listeners)fn(owner,snapshot(owner));}
  function refresh(owner,{force=false,afterMutation=false}={}){
   if(!owner?.userId||!owner?.dreamId)return Promise.resolve(empty());
   const k=key(owner);if(pending.has(k)){
    const started=epoch;return afterMutation?pending.get(k).then(()=>started===epoch?refresh(owner,{force:true}):empty()):pending.get(k);
   }if(!force&&records.has(k)&&now()-updated.get(k)<30000)return Promise.resolve(records.get(k));
   const started=epoch;
   const work=Promise.resolve().then(()=>api.getIncomingStatus({dreamId:owner.dreamId})).then(result=>{
    const supported=result?.dreamId===owner.dreamId&&/^\d{4}-\d{2}-\d{2}$/.test(result.dateKey)&&result.capabilities?.incomingStatus===1&&result.capabilities?.dailyCardClaim===1&&result.capabilities?.incomingReadAck===1&&result.capabilities?.cardBilling===2;
    if(!supported)throw Object.assign(Error('每日收信需要更新后台 shexXLetters'),{code:'UNKNOWN_ACTION'});
    if(started!==epoch||k!==key(owner))return empty();
    const value={...result,available:true,confirmed:true,error:''};
    if(acknowledged.get(k)?.has(value.unreadPaperId))value.unreadPaperId=null;
    records.set(k,value);updated.set(k,now());emit(owner);return value;
   }).catch(error=>{
    if(started!==epoch||k!==key(owner))return empty();
    const value={...snapshot(owner),available:false,error:error.code==='UNKNOWN_ACTION'?'每日收信需要更新后台 shexXLetters':'来信状态暂时无法读取，请重试'};
    records.set(k,value);updated.set(k,now());emit(owner);return value;
   }).finally(()=>{if(pending.get(k)===work)pending.delete(k);});pending.set(k,work);return work;
  }
  function acknowledge(owner,paperId){
   if(!owner?.userId||!owner?.dreamId||!paperId)return;
   const k=key(owner),ids=acknowledged.get(k)||new Set();ids.add(paperId);acknowledged.set(k,ids);
   const status=records.get(k);if(status?.unreadPaperId===paperId){records.set(k,{...status,unreadPaperId:null});emit(owner);}
  }
  return Object.freeze({snapshot,refresh,acknowledge,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},clear(){epoch++;records.clear();pending.clear();updated.clear();acknowledged.clear();},day:()=>day(now())});
 }
 function createHomeBridge({store,currentOwner,enabled,active=()=>true,render,now=()=>Date.now(),setTimer=root.setTimeout?.bind(root),clearTimer=root.clearTimeout?.bind(root),document=root.document,eventTarget=root}={}){
  let timer=null,disposed=false,selected='',sequence=0;
  const visible=()=>!document||document.visibilityState!=='hidden';
  function cancel(){if(timer!==null)clearTimer?.(timer);timer=null;}
  function paint(){const status=store.snapshot(currentOwner()),op=status.dailyOperation;
   const reservedCard=op?.mode==='card'&&(op.status==='retryable_failed'||status.processing);
   render(Boolean(enabled()&&active()&&(status.available||status.confirmed)&&(status.dailyAvailable||status.hasUnread||reservedCard)));}
  function wake(){if(disposed)return;cancel();const owner=currentOwner(),key=ownerKey(owner);if(selected!==key){selected=key;sequence++;render(false);}
   if(!enabled()||!active()||!visible()||!owner?.userId||!owner?.dreamId){sequence++;render(false);return Promise.resolve();}
   const token=sequence;paint();const delay=86400000-((now()+8*3600000)%86400000)+20;
   timer=setTimer?.(()=>{timer=null;void wake();},delay);timer?.unref?.();
   return store.refresh(owner).then(()=>{if(!disposed&&token===sequence&&ownerKey(currentOwner())===key&&enabled()&&active())paint();});
  }
  const unsubscribe=store.subscribe(owner=>{if(ownerKey(owner)===ownerKey(currentOwner())&&!disposed)paint();});
  document?.addEventListener?.('visibilitychange',wake);eventTarget?.addEventListener?.('focus',wake);
  return Object.freeze({wake,dispose(){disposed=true;sequence++;cancel();unsubscribe();document?.removeEventListener?.('visibilitychange',wake);eventTarget?.removeEventListener?.('focus',wake);render(false);}});
 }
 return Object.freeze({createStore,createHomeBridge});
});
