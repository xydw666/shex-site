(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SHEXLightChatCore=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const key=scope=>scope?.userId&&scope?.dreamId?'single:'+scope.dreamId:'';
  const same=(a,b)=>!!key(a)&&a.userId===b?.userId&&a.dreamId===b?.dreamId&&!b.pending;
  const empty=()=>({messages:[],pending:false,error:'',canRetry:false});
  const failed=new Set(['energy-failed','send-failed','failed','final-failed']);
  const running=new Set(['pending','paid-generating','ready','delivering','generating']);
  function ownAction(value,identity={}){
    const text=String(value||'').replace(/^[（(]+|[）)]+$/g,'').trim();
    // Structured action means the character is the implicit actor. Explicit
    // user, collective or NPC subjects must not become that character's action.
    const names=[identity.userName].filter(n=>n&&n!=='我');
    const subjects=['你','您','用户','你们','我们','两人','双方','大家','他','她','他们','她们','店员','路人','陌生人','小狗','宠物',...names];
    for(const subject of subjects){
      const escaped=subject.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(new RegExp('(?:^|[，,。；;\\n])\\s*'+escaped+'(?:们|一起|也|正|已经|轻轻|慢慢|抱|走|坐|看|说|笑|伸|抬|低|点|转|摸|喂|靠|把|接|拿|站|躺|趴|跑|跳|将|会|决定|同意|答应|推|拉|闭|睁)').test(text))return '';
    }
    // Unknown named subjects have no actor metadata in the existing protocol.
    // Keep only implicit character verbs/body expressions; ambiguous actions
    // stay in X传讯 history, but do not get attributed to TA in a light UI.
    const implicit=/^(?:(?:轻轻|微微|缓缓|慢慢|稍稍|悄悄|默默|安静地|不由得|又|随后|然后|并|有些|略微| gently | slowly )\s*)*(?:低|抬|蹲|俯|伸|摸|看|抱|把|将|拿|递|放|坐|站|走|侧|转|弯|点|摇|笑|眯|皱|垂|靠|闭|睁|揉|挠|拨|吻|捏|拍|扶|蹭|叹|停|沉默|沉吟|呼|望|收|迈|挽|手|指尖|视线|眼|掌心|眉|唇|嘴|脸|look|smil|nod|reach|pat|sit|lean)/i;
    const clauses=text.split(/[，,。；;\n]/).map(part=>part.trim()).filter(Boolean);
    return clauses.length&&clauses.every(part=>implicit.test(part))?text:'';
  }
  function messageText(message={},identity={},getSegments=m=>m.segments||[]){
    if(message.type==='notice')return '';
    if(message.role==='user')return String(message.text||'');
    if(message.localSaveFailed||message.isPreview||message.isPartial||['preview','partial','streaming'].includes(message.type))return '';
    const ai=message.sourceType==='ai'||message.sourceRoute==='character_ai'||message.sourceMode==='ai';
    if(!ai)return message.image?'[图片]':message.sticker?'[表情包]':String(message.text||'');
    const segments=getSegments(message)||[];
    // An existing scene-only message must stay empty, never fall back to text.
    if(segments.length||Array.isArray(message.segments)&&message.segments.length){
      return segments.flatMap(segment=>{
        if(segment.type==='dialogue')return[String(segment.text||'').replace(/[（(]([^）)]*)[）)]/g,(_,value)=>{
          const action=ownAction(value,identity);return action?'（'+action+'）':'';
        }).trim()];
        if(segment.type==='action'){const action=ownAction(segment.text,identity);return action?['（'+action+'）']:[];}
        return[];
      }).filter(Boolean).join('\n');
    }
    // Existing dialogue-only contracts have no display segments. Do not try
    // to parse legacy markup or narrative into invented dialogue/actions.
    const text=String(message.text||'').trim();
    return /[<](?:\/?scene|\/?action|\/?dialogue)|[（(]/i.test(text)?'':text;
  }
  function createBridge(deps){
    function valid(scope){try{return same(scope,deps.identity());}catch(_){return false;}}
    // 与 X陪伴 一致：只对本入口自己刚发出的那一句报告失败。会话里更早的失败任务（X传讯 里的旧失败、
    // 宠物事件的失败）会保留多日，不属于这次对话，不能在这里反复提示。
    const ownSent=new Map();
    function tasks(scope){return(deps.tasks?.()||[]).filter(t=>t.ownerUserId===scope.userId&&t.conversationKey===key(scope)&&t.dreamId===scope.dreamId);}
    function snapshot(scope){
      if(!valid(scope))return empty();
      const identity=deps.identity(),history=deps.messages(scope)||[],latest={};
      const seen=new Set();
      for(let i=history.length-1;i>=0;i--){
        const m=history[i];if(!m||(m.id&&seen.has(m.id))||!['user','ta'].includes(m.role))continue;
        if(m.id)seen.add(m.id);const speaker=m.role==='user'?'me':'dream';if(latest[speaker])continue;
        const text=messageText(m,identity,deps.segments);if(text.trim())latest[speaker]={speaker,text,id:m.id,index:i};
        if(latest.me&&latest.dream)break;
      }
      const task=tasks(scope).sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0))[0];
      const pending=deps.pending?.(scope)===true||tasks(scope).some(t=>running.has(t.replyStatus));
      const ownId=ownSent.get(scope.userId+'\u0000'+key(scope));
      const own=ownId?tasks(scope).find(t=>t.messageId===ownId&&t.sourceKind!=='pet_event'):null;
      const failedOwn=!pending&&own&&failed.has(own.replyStatus)?own:null;
      const error=failedOwn
        ?failedOwn.replyStatus==='final-failed'?'这次回复没有送达，请到 X传讯查看':'刚刚没有收到回复，再试一次吧':'';
      const shown=failedOwn||task;
      return{messages:Object.values(latest).sort((a,b)=>a.index-b.index).map(({index,...m})=>m),pending,error,
        ...(pending&&task?.sourceKind==='pet_event'?{pendingKind:'pet_event'}:{}),
        canRetry:!!error&&['energy-failed','send-failed'].includes(failedOwn.replyStatus),
        ...(shown?{messageId:shown.messageId,requestId:shown.requestId}:{})};
    }
    function send(scope,value){
      if(!valid(scope))return{ok:false,error:'TA 已切换，请重新打开输入框'};
      const text=String(value||'');if(!text.trim())return{ok:false,error:'先写一句想和 TA 说的话吧'};
      if(snapshot(scope).pending)return{ok:false,error:'TA 正在回复，稍等一下'};
      try{const result=deps.send({...scope},text);if(result?.messageId)ownSent.set(scope.userId+'\u0000'+key(scope),result.messageId);return result?{ok:true,...result}:{ok:false,error:'这句话还没有发送，请检查提示后重试'};}
      catch(_){return{ok:false,error:'这句话还没有发送，请稍后重试'};}
    }
    function retry(scope){
      const state=snapshot(scope);
      if(!valid(scope)||!state.canRetry)return{ok:false,error:'请到 X传讯查看这条消息'};
      return deps.retry?.({...scope},state.messageId)?{ok:true}:{ok:false,error:'回复暂时无法重试，请到 X传讯查看'};
    }
    function sendEvent(scope,context){
      if(!valid(scope)||snapshot(scope).pending)return {ok:false};
      try{const result=deps.sendEvent?.({...scope},context);return result?{ok:true,...result}:{ok:false};}catch(_){return {ok:false};}
    }
    function subscribe(scope,callback){
      const captured={...scope};let active=true,signature='';
      const update=()=>{
        if(!active||deps.events?.visibilityState==='hidden')return;
        const state=snapshot(captured),next=JSON.stringify(state);if(next===signature)return;
        signature=next;callback(state);
      };
      const events=['shex:light-chat-change','shex:chat-sync-changes','shex:user-data-restored','shex:user-data-merged','shex:chat-local-store-ready','shex:auth-change','visibilitychange'];
      events.forEach(name=>deps.events?.addEventListener(name,update));update();
      return()=>{active=false;events.forEach(name=>deps.events?.removeEventListener(name,update));};
    }
    // 当前梦角用的是 AI 还是字卡回复；只读，供入口调整自己的展示节奏。
    function mode(scope){try{return valid(scope)&&deps.mode?.({...scope})==='ai'?'ai':'card';}catch(_){return 'card';}}
    return Object.freeze({snapshot,send,sendEvent,retry,subscribe,mode});
  }
  return Object.freeze({messageText,createBridge});
});
