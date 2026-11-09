(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SHEXPetChat=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const empty=()=>({messages:[],pending:false,error:'',canRetry:false});
  function createController(env){
    let active=false,context={},callback=null,unsubscribe=null,generation=0,state=empty();
    const scope=()=>context.identity||{};
    function valid(){
      try{const current=env.SHEXPetIdentity?.current?.(),s=scope();return active&&context.adopted===true&&!!s.userId&&!!s.dreamId&&s.userId===current?.userId&&s.dreamId===current?.dreamId&&!current.pending;}catch(_){return false;}
    }
    function publish(next){state=next;callback?.(state);}
    function connect(){
      generation++;unsubscribe?.();unsubscribe=null;state=empty();
      if(!valid()){publish(state);return;}
      const bridge=env.SHEXLightChat,token=generation;
      if(!bridge){publish({...state,error:'对话还没有准备好，请稍后再试'});return;}
      publish(bridge.snapshot(scope()));
      unsubscribe=bridge.subscribe({...scope()},next=>{if(active&&generation===token&&valid())publish(next);});
    }
    function setContext(next={}){
      const changed=context.identity?.userId!==next.identity?.userId||context.identity?.dreamId!==next.identity?.dreamId||context.adopted!==next.adopted;
      context=next;if(active&&changed)connect();
    }
    function enter(next,onSnapshot){if(active)return;active=true;context=next||{};callback=onSnapshot;connect();}
    function leave(){active=false;generation++;unsubscribe?.();unsubscribe=null;callback=null;context={};state=empty();}
    function send(text){
      if(!valid())return{ok:false,error:'TA 已切换，请重新打开输入框'};
      const result=env.SHEXLightChat?.send(scope(),text)||{ok:false,error:'对话还没有准备好，请稍后再试'};
      if(result.ok&&valid())publish(env.SHEXLightChat.snapshot(scope()));
      return result;
    }
    function retry(){
      if(!valid())return{ok:false,error:'TA 已切换，请重新打开输入框'};
      const result=env.SHEXLightChat?.retry(scope())||{ok:false,error:'回复暂时无法重试'};
      if(result.ok&&valid())publish(env.SHEXLightChat.snapshot(scope()));return result;
    }
    return Object.freeze({enter,setContext,leave,send,retry,snapshot:()=>state});
  }
  return Object.freeze({createController});
});
