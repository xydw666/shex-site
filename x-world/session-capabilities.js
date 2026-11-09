(function initCreatorSessionCapabilities(global,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global)global.SHEXCreatorSessionCapabilities=api;
})(typeof window!=='undefined'?window:globalThis,function createCreatorSessionCapabilities(){
  'use strict';

  const WORLD_ENTRY_ALLOWLIST=Object.freeze(['message','energy','settings','character-gallery']);

  function deriveCreatorExperience(input={}){
    const sessionKind=String(input.sessionKind||'private_single');
    const capabilityState=String(input.capabilityState||'pending');
    const protectedSession=sessionKind==='gallery_single'||sessionKind==='world_run';
    const creatorLocked=protectedSession&&(capabilityState!=='ready'||input.creatorBeautified===true);
    const isWorldRun=sessionKind==='world_run';
    const allowedWorldEntries=isWorldRun?[...WORLD_ENTRY_ALLOWLIST]:null;
    return Object.freeze({
      sessionKind,
      capabilityState,
      creatorBeautified:input.creatorBeautified===true,
      showPersona:sessionKind==='private_single',
      // X103：作品用了创作者美化（X传讯美化或X世界美化）时，用户不能再自定义美化，入口全部隐藏。
      showAdvancedBeautify:!(protectedSession&&input.creatorBeautified===true),
      showXWorldBeautify:!(protectedSession&&input.creatorBeautified===true),
      allowTaAvatarEdit:!(sessionKind==='gallery_single'&&creatorLocked),
      allowUserAvatarEdit:true,
      showChatBackground:isWorldRun?false:!(sessionKind==='gallery_single'&&creatorLocked),
      allowedWorldEntries,
      allowsWorldEntry:(entry)=>!isWorldRun||WORLD_ENTRY_ALLOWLIST.includes(String(entry||'')),
    });
  }

  function createCreatorCapabilityStore({load,onChange=()=>{}}={}){
    if(typeof load!=='function')throw new Error('creator capability loader is required');
    let generation=0;
    let state={identity:null,capabilityState:'ready',creatorBeautified:false};
    const publish=(next)=>{
      state={...next};
      const snapshot={...state,...deriveCreatorExperience(state)};
      onChange(snapshot);
      return snapshot;
    };
    return Object.freeze({
      snapshot:()=>({...state,...deriveCreatorExperience(state)}),
      select:async(identityValue={})=>{
        const identity={...identityValue};
        const requestGeneration=++generation;
        publish({identity,sessionKind:String(identity.sessionKind||'private_single'),capabilityState:'pending',creatorBeautified:false});
        try{
          const result=await load(identity);
          if(result?.ok===false)throw Object.assign(new Error(result.message||'creator capability unavailable'),{code:result.code});
          if(requestGeneration!==generation||String(state.identity?.key||'')!==String(identity.key||''))return state;
          return publish({identity,sessionKind:String(identity.sessionKind||'private_single'),capabilityState:'ready',creatorBeautified:result?.creatorBeautified===true,appearanceVersionId:String(result?.appearanceVersionId||'')});
        }catch(error){
          if(requestGeneration!==generation||String(state.identity?.key||'')!==String(identity.key||''))return state;
          return publish({identity,sessionKind:String(identity.sessionKind||'private_single'),capabilityState:'error',creatorBeautified:false,errorCode:String(error?.code||'CREATOR_CAPABILITY_UNAVAILABLE')});
        }
      },
      clear:()=>{generation+=1;return publish({identity:null,sessionKind:'private_single',capabilityState:'ready',creatorBeautified:false});},
    });
  }

  return Object.freeze({WORLD_ENTRY_ALLOWLIST,deriveCreatorExperience,createCreatorCapabilityStore});
});
