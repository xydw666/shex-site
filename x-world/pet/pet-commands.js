(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SHEXPetCommands=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const actions=Object.freeze({'摸摸':'pet','喂饭':'feed','陪玩':'play','睡觉':'sleep','叫醒':'wake','出门':'outdoor','去海边':'beach','去市集':'market','去看樱花':'spring','去荷塘':'summer','去看红叶':'autumn','去看雪':'winter','回家':'home'});
  // Execution accepts a finite, standalone control line in completed dialogue.
  // Cleanup is broader: unsupported controls must not leak into visible text.
  const marker=/[〔【]\s*小宠\s*[:：][^〕】\n]*[〕】]/g;
  // 标记拿掉后，只剩标点的行（例如标记后面跟的句号）一并去掉，不给用户留下孤零零的符号。
  function clean(value){return String(value||'').replace(marker,'').split('\n').filter(line=>!/^[\s。．.！!～~，,、；;：:]+$/.test(line)).join('\n').replace(/\n{3,}/g,'\n\n').trim();}
  function cleanEntry(entry){
    if(!entry||entry.role!=='ta')return entry;
    return {...entry,text:clean(entry.text),...(Array.isArray(entry.segments)?{
      segments:entry.segments.map(s=>({...s,text:clean(s.text)})).filter(s=>s.text)
    }:{})};
  }
  function lastAction(text){
    let action=null;
    for(const line of String(text||'').split(/\r?\n/)){
      // 模型常把标记接在台词同一行末尾、在冒号后加空格或在标记后补标点；这些都算有效。
      // 标记必须收在行尾，且不能被引号包住（引用、转述不算决定照顾）。
      const match=/^(.*?)[〔【]\s*小宠\s*[:：]\s*(摸摸|喂饭|陪玩|睡觉|叫醒|出门|去海边|去市集|去看樱花|去荷塘|去看红叶|去看雪|回家)\s*[〕】][\s。．.！!～~]*$/.exec(line);
      if(match&&!/[“"「『‘'《（(]\s*$/.test(match[1]))action=actions[match[2]];
    }
    return action;
  }
  function trusted(task){
    const ctx=task?.petRuntimeContext,scope=task?.petCommandScope;
    return task?.replyMode==='ai'&&task.sourceKind!=='pet_event'&&!!task.requestId
      &&!!scope?.userId&&!!scope.dreamId&&typeof scope.roomToken==='string'&&scope.roomToken.length>0&&scope.roomToken.length<=160
      &&scope.userId===task.ownerUserId&&scope.dreamId===task.dreamId
      &&ctx?.userId===scope.userId&&ctx.dreamId===scope.dreamId
      &&task.conversationKey==='single:'+scope.dreamId;
  }
  function isMarkerCommand(command){
    // Frontend-only provenance discards pending commands authorized by the old
    // sentence fallback. This does not change any model or Server protocol.
    return command?.origin==='ai_marker'&&Object.values(actions).includes(command.action);
  }
  function isSceneCommand(command){
    return isMarkerCommand(command)&&['home','outdoor','beach','market','spring','summer','autumn','winter'].includes(command.action);
  }
  function prepare(source,task,options={}){
    let action=null;
    // The host supplies its existing shared-music cleanup. This module never
    // guesses user intent or introduces a second music-control parser.
    const controlText=text=>typeof options.normalizeControlText==='function'
      ?options.normalizeControlText(text):String(text||'');
    const containsMarker=text=>{marker.lastIndex=0;return marker.test(String(text||''));};
    const descriptors=(Array.isArray(source)?source:[]).map(descriptor=>{
      const original=descriptor.payload||{};
      if(trusted(task)&&original.role==='ta'){
        const segments=Array.isArray(original.segments)?original.segments:null;
        const carriers=segments?.length?segments.filter(s=>s.type==='dialogue').map(s=>s.text):[original.text];
        let ownAction=null;
        for(const text of carriers)ownAction=lastAction(controlText(text))||ownAction;
        // Some completed replies carry trailing controls only in top-level
        // text. Never use that fallback to promote a scene/action or quote.
        if(!ownAction&&segments?.some(s=>s.type==='dialogue'&&clean(controlText(s.text)))
          &&!segments.some(s=>containsMarker(s.text)))ownAction=lastAction(controlText(original.text));
        action=ownAction||action;
      }
      return {...descriptor,payload:cleanEntry(original)};
    });
    const readable=descriptors.some(d=>d.payload.role==='ta'&&controlText(d.payload.text).trim());
    const command=readable&&action?{...task.petCommandScope,requestId:task.requestId,action,origin:'ai_marker'}:null;
    return {descriptors,command};
  }
  return Object.freeze({prepare,cleanEntry,isMarkerCommand,isSceneCommand});
});

