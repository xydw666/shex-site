((root, factory) => {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXXLettersReplyFlow = api;
})(typeof window !== 'undefined' ? window : globalThis, root => {
  'use strict';
  function createReplyFlow(options = {}) {
    const api=options.api, currentOwner=options.currentOwner, mode=options.mode||(()=> 'card');
    const delay=options.setTimeout||root.setTimeout.bind(root), clear=options.clearTimeout||root.clearTimeout.bind(root), now=options.now||Date.now;
    let epoch=0, disposed=false, busy=false, timer=null, pending=null, checkedDue=null, dueQueued=false;
    let view={status:'idle',busy:false,label:'',sourcePaperId:null};
    const same=owner=>!disposed&&currentOwner()?.userId===owner?.userId&&currentOwner()?.dreamId===owner?.dreamId;
    const emit=patch=>{view={...view,...patch};options.onChange?.({...view});};
    const cancelTimer=()=>{if(timer!==null)clear(timer);timer=null;};
    // 这三个状态说明云端任务停在半路。常见原因是云函数在等 AI 写信时超时被中断，任务就一直停在“生成中”。
    // 只读取状态不会让它继续，所以停留超过 40 秒就调用恢复接口把同一个任务接着跑完（扣费按请求号防重复，不会多扣）。
    const STALLED=new Set(['claimed','billed','generating']), RESUME_AFTER_MS=40000;
    const safeCode=code=>/^[A-Z][A-Z0-9_]{0,79}$/.test(code||'')?code:'REPLY_UNAVAILABLE';
    function finish(owner,token) {
      if(token!==epoch)return;
      busy=false;if(same(owner))emit({busy:false});
      const queued=dueQueued;dueQueued=false;
      if(queued&&same(owner)&&view.status!=='completed')void check().catch(()=>{});
    }
    async function accept(result,owner,token) {
      if(token!==epoch||!same(owner))return;
      const status=result.status||'retryable_failed';
      if(result.operationId)pending.operationId=result.operationId;
      emit({operationId:pending.operationId||null,recoverable:typeof result.recoverable==='boolean'?result.recoverable:null,
        outputReason:/^[A-Z_]{1,40}$/.test(result.outputReason||'')?result.outputReason:null,
        outputPath:/^(\$|blocks(?:\[\d{1,2}\])?(?:\.(?:blockId|type|text|questionId|options|value))?)$/.test(result.outputPath||'')?result.outputPath:null,
        modelAttempts:Number.isInteger(result.modelAttempts)?result.modelAttempts:null,outputRecovery:null});
      if(status==='completed'&&result.resultPaperId){
        cancelTimer();emit({status,busy:false,label:'回复已送达',mode:result.mode||mode(),resultPaperId:result.resultPaperId});
        await options.onComplete?.({...result,sourcePaperId:pending.payload.sourcePaperId,owner});return;
      }
      if(status==='waiting_delivery'&&Number.isFinite(result.deliverAt)){
        emit({status,busy:false,label:'信已寄出，回复将在24小时内送达',deliverAt:result.deliverAt});
        cancelTimer();
        const dueKey=JSON.stringify([pending.operationId,result.deliverAt]);
        if(checkedDue!==dueKey)timer=delay(()=>{
          timer=null;if(!same(owner)||!pending||pending.operationId!==result.operationId)return;
          checkedDue=dueKey;
          if(busy)dueQueued=true;else void check().catch(()=>{});
        },Math.max(0,result.deliverAt-now()));
        return;
      }
      emit({status,busy:false,label:status==='retryable_failed'
        ?`信已寄出，回复未完成（${safeCode(result.errorCode)}）`:'信已寄出，回复处理中',errorCode:safeCode(result.errorCode)});
      // 回复还在处理中（已认领 / 已扣费 / 生成中）：不用等用户点“查看”，每隔一会儿自己去看一次。
      if(STALLED.has(status)){
        cancelTimer();
        timer=delay(()=>{timer=null;if(!same(owner)||!pending)return;if(busy)dueQueued=true;else void check().catch(()=>{});},12000);
      }
    }
    async function request(source,settings={}) {
      if(disposed)return;
      if(busy)return;
      if(source?.state!=='sent'||source.authorType!=='user'||source.legacySource||source.hiddenAt)throw new Error('请先真实寄出这封信');
      const owner=currentOwner();if(!owner?.userId||!owner?.dreamId||source.dreamId!==owner.dreamId||source.userId&&source.userId!==owner.userId)throw new Error('账号或梦角已切换');
      const deliveryMode=settings.deliveryMode||'immediate';
      if(!['immediate','within_24h'].includes(deliveryMode))throw new Error('回复时间无效');
      if(mode()==='ai'&&deliveryMode!=='immediate')throw new Error('AI模式仅支持立即回复');
      if(pending&&pending.payload.sourcePaperId===source.paperId&&same(pending.owner)) {
        if(view.recoverable===false)return {...view};
        if(view.status==='completed'||view.status==='waiting_delivery')return view;
        if(deliveryMode!==pending.payload.deliveryMode)throw new Error('已有回复任务，不能更改投递时间');
      } else { checkedDue=null; pending={owner:{...owner},payload:{dreamId:owner.dreamId,sourcePaperId:source.paperId,
        deliveryMode,requestId:`letter-reply:${source.paperId}`}}; }
      pending.startedAt=now();
      const correcting=view.sourcePaperId===source.paperId&&view.errorCode==='AI_UPSTREAM_X_LETTER_OUTPUT_INVALID';
      const token=++epoch;busy=true;cancelTimer();emit({busy:true,status:'generating',sourcePaperId:source.paperId,
        recoverable:null,outputRecovery:correcting?'correcting':null,label:correcting?'正在整理回信格式…':'信已寄出，正在准备回复…'});
      try {await accept(await api.requestDreamReply({...pending.payload}),owner,token);}
      catch(error){if(token===epoch&&same(owner))emit({status:'retryable_failed',busy:false,label:`信已寄出，回复未完成（${safeCode(error.code)}）`,errorCode:safeCode(error.code)});}
      finally {finish(owner,token);}
      return {...view};
    }
    async function check() {
      if(disposed||busy||!pending?.operationId||!same(pending.owner))return;
      const token=++epoch,owner=pending.owner;busy=true;emit({busy:true});
      try {
        const late=view.errorCode==='AI_UPSTREAM_X_LETTER_MODEL_UNCERTAIN'&&view.recoverable===false;
        let result=late&&typeof api.resumeOperation==='function'
          ?await api.resumeOperation({dreamId:owner.dreamId,operationId:pending.operationId,requestId:`letter-cache:${pending.operationId}`})
          :await api.getOperation({dreamId:owner.dreamId,operationId:pending.operationId});
        if(STALLED.has(result?.status)&&typeof api.call==='function'&&now()-(pending.startedAt||0)>=RESUME_AFTER_MS){
          pending.startedAt=now();
          // 用原来的回信请求（同一个请求号）重新发给云端：云端认出是同一个任务，会从停住的那一步接着做。
          // skipOperationLookup 让这次请求真的到达云端，而不是只在本地读一下状态就返回。
          result=await api.call('requestDreamReply',{...pending.payload,requestId:pending.payload.requestId||pending.requestId},{skipOperationLookup:true});
        }
        await accept(result,owner,token);
      }
      catch(error){if(token===epoch&&same(owner))emit({status:'retryable_failed',busy:false,label:`回复读取失败（${safeCode(error.code)}）`});}
      finally {finish(owner,token);}
    }
    async function recover(sourcePaperId) {
      if(disposed||busy)return;
      const owner=currentOwner();if(!owner)return;
      const record=api.pendingFor?.(owner.dreamId)?.find(item=>item.action==='requestDreamReply'&&item.payload?.sourcePaperId===sourcePaperId);
      if(!record)return;
      if(pending?.payload.sourcePaperId!==sourcePaperId){cancelTimer();checkedDue=null;dueQueued=false;}
      pending={owner:{...owner},payload:{...record.payload},operationId:record.operationId,requestId:record.requestId};
      emit({sourcePaperId,status:'retryable_failed',label:'信已寄出，回复待恢复'});
      if(pending.operationId)await check();
    }
    const retry=()=>pending?request({paperId:pending.payload.sourcePaperId,state:'sent',authorType:'user',dreamId:pending.owner.dreamId,userId:pending.owner.userId},pending.payload):Promise.resolve();
    function reset(){epoch++;cancelTimer();busy=false;pending=null;checkedDue=null;dueQueued=false;emit({status:'idle',busy:false,label:'',sourcePaperId:null,
      operationId:null,recoverable:null,outputReason:null,outputPath:null,modelAttempts:null,outputRecovery:null,errorCode:null});}
    return Object.freeze({state:()=>({...view}),request,retry,recover,check,reset,dispose(){disposed=true;epoch++;cancelTimer();pending=null;busy=false;dueQueued=false;}});
  }
  return Object.freeze({createReplyFlow});
});
