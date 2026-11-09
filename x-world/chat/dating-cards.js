(function(root,factory){'use strict';var api=factory(root);root.SHEXDatingCards=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  var POLICY=Object.freeze({globalCooldownMs:20*60000,attemptProbability:.15,datingWeight:.30,photoProbability:.70,datingCooldownMs:3600000,declinedInviteCooldownMs:4*3600000,maxSummary:160,maxCardBytes:2048,maxResolve:20,sendDedupeMs:2000});
  var KINDS=['dating_photo','dating_component','dating_invite','dating_ta_photo'];
  var EXPRESSIONS=Object.freeze({dots:'静静地看着镜头',happy:'笑了起来',laugh:'笑得很开心',star_eyes:'眼睛亮晶晶的',heart_eyes:'满眼都是喜欢',shy_blush:'有点害羞',sleepy:'有点困了',smug:'有点小得意',surprised:'有些惊喜',cry:'眼里带着泪光',pout:'嘟着嘴',wink:'眨了眨眼',angry:'有点生气',dizzy:'晕乎乎的',kiss:'轻轻嘟起嘴',side_eye:'悄悄看着旁边',thinking:'若有所思',just_awake:'像是刚睡醒',wronged:'有点委屈'});
  function copy(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
  function fail(code,message){return Object.assign(new Error(message),{code:code});}
  function clip(v,n){return Array.from(String(v==null?'':v).trim()).slice(0,n||POLICY.maxSummary).join('');}
  function bytes(v){var text=JSON.stringify(v);return typeof TextEncoder==='function'?new TextEncoder().encode(text).length:unescape(encodeURIComponent(text)).length;}
  function id(v){return typeof v==='string'&&/^[a-z][a-z0-9_]{1,63}$/.test(v);}
  function hash(v){var h=2166136261;for(var c of String(v)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
  function randomSeed(seed){var n=parseInt(hash(seed),36)||1;return function(){n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296;};}
  function pick(rows,r){return rows&&rows.length?rows[Math.min(rows.length-1,Math.floor(r()*rows.length))]:null;}
  function row(rows,key){return (rows||[]).find(function(v){return v.id===key;});}
  function name(rows,key,fallback){return (row(rows,key)||{}).name||fallback||'';}
  function expressionText(value){return EXPRESSIONS[value]||'静静地看着镜头';}
  function isImageMessage(message){var kind=message&&message.linkCard&&message.linkCard.kind;return kind==='dating_photo'||kind==='dating_ta_photo'||kind==='dating_component';}
  function photoCaption(card){var data=card&&card.data||{},frame=data.frame;if(frame)return [frame.place,frame.activity].filter(Boolean).join(' · ');var text=String(data.summary||''),match=text.match(/^(?:你刚刚给[^，。]*发了一张合影[：:])?[^，。；]*和你在([^，。]+)[，,]([^；。]+)/)||text.match(/合影[：:]([^，。]+)[，,]([^，。]+)/);return match?match[1]+' · '+match[2]:'';}
  function catalogue(value){return value&&value.presets||value||{};}
  function suggestions(catalog,key){var rows=catalog&&(catalog[key]||catalog[key.replace(/s$/,'')]);return (Array.isArray(rows)?rows:[]).map(function(v){return typeof v==='string'?{text:v}:Object.assign({},v,{text:v.text||v.label});}).filter(function(v){return v&&v.text;});}
  function catalogFromOptions(options){return {places:suggestions(options,'place'),activities:suggestions(options,'activity'),atmospheres:suggestions(options,'atmosphere'),items:suggestions(options,'item')};}
  function base(options,kind,data){var card={v:1,cardId:String(options.cardId||('dc_'+hash(options.seed||Date.now()))),kind:kind,status:kind==='dating_invite'?'pending':'ready',createdAt:Number(options.now||Date.now()),dreamId:String(options.dreamId||''),data:data};var check=validateCard(card);if(!check.ok)throw fail('INVALID_DATING_CARD',check.errors.join('；'));return card;}
  function validateCard(card){
    var errors=[],data=card&&card.data;
    if(!card||card.v!==1||KINDS.indexOf(card.kind)<0||!card.cardId||!card.dreamId||!data||typeof data!=='object'||Array.isArray(data))return {ok:false,errors:['约会内容无效']};
    if(Array.from(String(data.summary||'')).length>POLICY.maxSummary)errors.push('摘要过长');
    var allowed=card.kind==='dating_photo'?['photoId','summary']:card.kind==='dating_component'?['componentId','summary']:card.kind==='dating_invite'?['place','activity','note','summary']:['jobId','seed','frame','summary','photoId'];
    Object.keys(data).forEach(function(k){if(allowed.indexOf(k)<0)errors.push('不支持的字段 '+k);});
    if(card.kind==='dating_photo'&&!id(data.photoId))errors.push('照片编号无效');
    if(card.kind==='dating_component'&&!id(data.componentId))errors.push('成品编号无效');
    if(card.kind==='dating_ta_photo'){
      if(!id(data.jobId)||typeof data.seed!=='string'||data.seed.length>120||!data.frame)errors.push('拍摄参数无效');
      if(data.photoId!==undefined&&!id(data.photoId))errors.push('照片编号无效');
      if(/"(?:heightsCm|appearance|bodyColor|accessories|color)"\s*:/.test(JSON.stringify(data.frame||{})))errors.push('画面参数不能保存用户外观');
    }
    if(card.kind==='dating_invite'&&(!data.place||!data.activity))errors.push('邀请建议无效');
    try{if(bytes(card)>POLICY.maxCardBytes)errors.push('约会内容超过2KiB');}catch(_){errors.push('约会内容不可序列化');}
    return {ok:!errors.length,value:card,errors:errors};
  }
  function mediaSummary(options){
    var shared=root.SHEXDatingMediaSummary;
    if(!shared&&typeof module==='object'&&module.exports){
      try{shared=require('../dating-photo/dp-media-summary');}
      catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;shared=require('./dp-media-summary');}
    }
    if(!shared||typeof shared.buildSummary!=='function')throw fail('SUMMARY_NOT_READY','照片摘要暂未准备好');
    return shared.buildSummary(options);
  }
  function buildReference(kind,record,options){
    options=options||{};record=record||{};var p=catalogue(options.photo),data={};
    if(kind==='dating_photo')data.photoId=record.photoId;else if(kind==='dating_component')data.componentId=record.componentId;else throw fail('INVALID_DATING_CARD','不支持的约会内容');
    data.summary=mediaSummary({kind:kind==='dating_photo'?'photo':'component',record:record,photos:options.photos||[record],meName:options.meName||'你',taName:options.taName,mode:'chat',presets:p,sender:'user',caption:options.caption});
    return base(options,kind,data);
  }
  function buildInvite(options){
    options=options||{};var random=randomSeed(options.seed||options.cardId),place=pick(suggestions(options.catalog,'places'),random),activity=pick(suggestions(options.catalog,'activities'),random);
    if(!place||!activity)throw fail('PRESETS_NOT_READY','约会建议暂未准备好');var who=clip(options.meName||'你',20),prefix=options.sender==='user'?who+'邀请你去':'你刚刚邀请'+who+'去';
    return base(options,'dating_invite',{place:clip(place.text,50),activity:clip(activity.text,50),note:clip(options.caption||'',50),summary:clip(prefix+place.text+'，想一起'+activity.text+'。'+(options.caption?clip(options.caption,50):''))});
  }
  function buildTaPhoto(options){
    options=options||{};var p=catalogue(options.photo),engine=options.photo||{},settings=options.settings||{};
    if(!settings.heightsCm)throw fail('SETTINGS_REQUIRED','请先设置双方身高');
    if(!engine.rules||typeof engine.rules.pickAutoShot!=='function')throw fail('PRESETS_NOT_READY','约会规则暂未准备好');
    var generated=engine.rules.pickAutoShot({recordId:String(options.seed||options.cardId||'')},settings,0);
    if(!generated)throw fail('NO_AVAILABLE_POSE','当前身高没有适用的约会姿势');
    var frame={backgroundId:(generated.bg||{}).presetId||'',bgView:copy((generated.bg||{}).view),poseId:generated.poseId,props:copy(generated.props||[]),meExpression:(generated.me||{}).expression,taExpression:(generated.ta||{}).expression,cameraId:generated.cameraId,framing:generated.shot,zoom:generated.zoom,orbitDeg:generated.orbitDeg,tiltDeg:generated.tiltDeg,panX:generated.panX,panY:generated.panY,facingDeg:generated.facingDeg,holder:generated.holder,meSide:generated.meSide,swapRoles:generated.swapRoles,atmosphere:copy(generated.atmosphere),place:name(p.BACKGROUNDS,(generated.bg||{}).presetId,'你们一起待着的地方'),activity:name(p.ALL_POSES||p.POSES,generated.poseId,'一起留下了纪念'),items:(generated.props||[]).map(function(prop){return name(p.PROPS,prop.id);}).filter(Boolean).join('、')};
    var data={jobId:'job_'+hash(String(options.dreamId)+'|'+String(options.cardId)),seed:String(options.seed||''),frame:frame};
    data.summary=mediaSummary({kind:'photo',record:{shot:generated},meName:options.meName||'你',taName:options.taName,mode:'chat',presets:p,sender:'ta',caption:options.caption});
    return base(options,'dating_ta_photo',data);
  }
  function toShot(card,settings,engine){
    if(!settings||!settings.heightsCm||!(settings.heightsCm.me>=10&&settings.heightsCm.me<=10000&&settings.heightsCm.ta>=10&&settings.heightsCm.ta<=10000))throw fail('SETTINGS_REQUIRED','请先设置双方身高');
    var f=card.data.frame,p=catalogue(engine),appearance=settings.appearance||{};
    if(!p.DEFAULT_APPEARANCE)throw fail('RESOURCE_NOT_READY','人物资源尚未就绪');
    if(p.isPoseActive&&!p.isPoseActive(f.poseId))throw fail('POSE_UNAVAILABLE','这个姿势已暂时收起，请换一个姿势');
    if(p.isExpressionActive&&[f.meExpression||'happy',f.taExpression||'happy'].some(function(id){return !p.isExpressionActive(id);}))throw fail('EXPRESSION_UNAVAILABLE','这个表情已暂时收起，请换一个表情');
    if(f.backgroundId&&!row(p.BACKGROUNDS,f.backgroundId))throw fail('RESOURCE_NOT_READY','背景资源尚未就绪');
    function person(key,defaultColor,expression){var a=appearance[key]||{};return {bodyColor:a.bodyColor||defaultColor,accessories:copy(a.accessories||[]),expression:expression||'happy'};}
    var background=row(p.BACKGROUNDS,f.backgroundId),view=copy(f.bgView||{cx:.5,cy:.5,scale:1}),shot={v:2,poseId:f.poseId,cameraId:f.cameraId||'free',shot:f.framing||'full',zoom:f.zoom===undefined?1:f.zoom,orbitDeg:f.orbitDeg===undefined?0:f.orbitDeg,tiltDeg:f.tiltDeg===undefined?0:f.tiltDeg,panX:f.panX===undefined?0:f.panX,panY:f.panY===undefined?0:f.panY,facingDeg:f.facingDeg===undefined?0:f.facingDeg,holder:f.holder||'ta',meSide:f.meSide||'left',swapRoles:f.swapRoles===true,heightsCm:copy(settings.heightsCm),me:person('me',p.DEFAULT_APPEARANCE.me.bodyColor,f.meExpression),ta:person('ta',p.DEFAULT_APPEARANCE.ta.bodyColor,f.taExpression),props:copy(f.props||[]),bg:background?{source:'preset',presetId:background.id,view:view}:{source:'none',view:view},atmosphere:f.atmosphere===undefined?copy(background&&background.defaultAtmosphere||'none'):copy(f.atmosphere)};
    if(engine&&engine.rules&&typeof engine.rules.applyUserSettings==='function')shot=engine.rules.applyUserSettings(shot,settings);
    if(f.tiltDeg===undefined&&engine&&typeof engine.getPoseCameraDefaults==='function'&&shot.cameraId==='free'){var defaults=engine.getPoseCameraDefaults(shot);if(defaults)shot.tiltDeg=defaults.tiltDeg||0;}
    if(engine&&typeof engine.getPoseAvailability==='function'&&engine.getPoseAvailability(shot,shot.poseId).available===false)throw fail('POSE_UNAVAILABLE','这次姿势暂不适合当前身高');
    return shot;
  }
  function aiNote(card){return clip(card.data.summary)+(card.kind==='dating_invite'?' 请顺着这次邀约自然接一句话。':' 请顺着这张合影自然接一句话，不要重复描述全部细节。');}
  function isSourceSuspended(node){return !!(node&&typeof node.closest==='function'&&node.closest('[data-dating-chat-suspended]'));}
  function createChatSender(bridge){
    var pending=new Map(),recent=new Map(),now=bridge.now||Date.now;
    return function(input){
      var ctx,key,fields;try{
        if(!input||typeof input!=='object'||typeof input.dreamId!=='string'||!input.dreamId.trim()||input.dreamId.length>200||!!input.photoId===!!input.componentId||(input.photoId&&!id(input.photoId))||(input.componentId&&!id(input.componentId))||(input.caption!==undefined&&typeof input.caption!=='string'))throw fail('INVALID_PARAMS','请提供梦角和一个已保存的照片或成品编号');
        fields={dreamId:input.dreamId.trim(),caption:clip(input.caption||'',80)};if(input.photoId)fields.photoId=input.photoId;else fields.componentId=input.componentId;
        ctx=bridge.contextFor(fields.dreamId);if(!ctx||!ctx.userId)throw fail('CHAT_NOT_READY','请先登录并选择梦角');
        key=ctx.userId+'|'+fields.dreamId+'|'+(fields.photoId?'photo:':'component:')+(fields.photoId||fields.componentId);
      }catch(error){return Promise.reject(error);}
      if(pending.has(key))return pending.get(key);var previous=recent.get(key);if(previous&&now()-previous.at<POLICY.sendDedupeMs)return Promise.resolve(Object.assign({},previous.result,{deduplicated:true}));
      var task=Promise.resolve().then(async function(){
        function check(){if(!bridge.isSourceLive(ctx))throw fail('STALE_CONTEXT','原页面或账号已变化，请重新发送');}
        check();var card=await bridge.reference(ctx,fields);check();var chat=await bridge.openChat(ctx);var result=await bridge.send(chat,card,{caption:fields.caption});if(!result)throw fail('SEND_FAILED','消息没有保存成功');
        if(bridge.afterSend)await bridge.afterSend(chat,result);var value=Object.assign({},typeof result==='object'?result:{},{ok:true,kind:card.kind,deduplicated:false});if(fields.photoId)value.photoId=fields.photoId;else value.componentId=fields.componentId;
        recent.set(key,{at:now(),result:value});while(recent.size>64)recent.delete(recent.keys().next().value);return value;
      }).finally(function(){pending.delete(key);});pending.set(key,task);return task;
    };
  }
  var chatSender;
  function setChatBridge(bridge){chatSender=createChatSender(bridge);}
  function sendToChat(input){return chatSender?chatSender(input):Promise.reject(fail('CHAT_NOT_READY','请在主应用中发送给TA'));}
  function createCache(){
    var memory=new Map(),pending;
    function database(){if(!root.indexedDB)return Promise.resolve(null);if(!pending)pending=new Promise(function(resolve,reject){var request=root.indexedDB.open('shex_dating_chat_renders_v1',1);request.onupgradeneeded=function(){request.result.createObjectStore('renders');};request.onsuccess=function(){resolve(request.result);};request.onerror=function(){reject(request.error);};});return pending;}
    async function run(key,value,write){var db=await database();if(!db)return write?(memory.set(key,value),value):memory.get(key);return new Promise(function(resolve,reject){var tx=db.transaction('renders',write?'readwrite':'readonly'),store=tx.objectStore('renders'),request=write?store.put(value,key):store.get(key);request.onsuccess=function(){resolve(write?value:request.result);};request.onerror=function(){reject(request.error);};});}
    return {get:function(k){return run(k);},put:function(k,v){return run(k,v,true);}};
  }
  var sharedCache,photoRenderQueue=Promise.resolve();
  function recoverablePhotoError(error){
    var code=error&&error.code||'';
    if(/^(?:INVALID_|STALE_|SESSION_|POSE_|HEIGHT_|EXPRESSION_|CAMERA_|SETTINGS_|PHOTO_LIMIT|PHOTO_CONFLICT|PHOTO_NOT_FOUND|FILE_UNAVAILABLE|STORY_NOT_FOUND|UNAUTHORIZED|FORBIDDEN)/.test(code))return false;
    return /^(?:RESOURCE_NOT_READY|RESOURCE_LOAD_FAILED|MEDIA_UNAVAILABLE|NETWORK_ERROR|NETWORK_TIMEOUT|TIMEOUT|ETIMEDOUT|ECONNRESET|FETCH_FAILED|WEBGL_CONTEXT_LOST|CONTEXT_LOST|WEBGL_INITIALIZATION_FAILED|IMAGE_LOAD_FAILED)$/.test(code)||/无法加载拍照组件资源|照片功能暂时无法载入|网络|超时|图片加载失败|3D 画面暂时中断|Error creating WebGL context|context lost|failed to fetch|network|offline|timed? ?out/i.test(error&&error.message||'');
  }
  function createPhotoWorker(options){
    var tasks=new Map(),results=new Map(),cache=options.cache||(sharedCache||(sharedCache=createCache()));
    function live(card,context){if(options.isLive&&options.isLive(card,context)===false)throw fail('STALE_CONTEXT','聊天对象已变化');}
    async function perform(owner,card,key,retry,context,prepared){
      function check(){live(card,context);}
      check();var saved=prepared.saved||await cache.get(key).catch(function(){return null;});check();prepared.saved=saved;
      if(saved&&saved.photoId)return {state:'ready',photoId:saved.photoId};
      if(saved&&saved.failure&&!retry)return {state:saved.failure.state,blob:saved.blob,error:fail(saved.failure.code,saved.failure.message)};
      if(saved)delete saved.failure;
      if(!saved||!saved.blob){var settings=prepared.settings||(prepared.settings=await options.getSettings(card,context));check();var engine=prepared.engine||(prepared.engine=await options.loadEngine());check();var shot=toShot(card,settings,engine),job=photoRenderQueue.catch(function(){}).then(function(){check();return options.render(shot,engine,context);});photoRenderQueue=job.catch(function(){});var rendered=await job;saved={blob:rendered.blob,shot:Object.assign({},shot,rendered.propSnapshot?{propSnapshot:rendered.propSnapshot}:{})};prepared.saved=saved;await cache.put(key,saved).catch(function(){});check();}
      try{
        if(!saved.uploadedPhoto){
          try{saved.uploadedPhoto=saved.uploadedFileID&&options.resumePhoto?await options.resumePhoto({fileID:saved.uploadedFileID,shot:saved.shot},card,context):await options.savePhoto({blob:saved.blob,shot:saved.shot},card,context);}
          catch(error){
            // Ambiguous registration failures must retry the same cloud file;
            // IndexedDB clones Blobs, so the service's WeakMap is insufficient.
            var file=(error.uploadedFiles||[]).find(function(f){return f.kind==='dating-photo'&&f.fileID;});
            var terminal=/^INVALID_/.test(error.code||'')&&error.code!=='INVALID_RESPONSE'||['PHOTO_LIMIT','PHOTO_CONFLICT','PHOTO_NOT_FOUND','STORY_NOT_FOUND','FILE_UNAVAILABLE'].indexOf(error.code)>=0;
            if(file&&!terminal)saved.uploadedFileID=file.fileID;else if(terminal&&(file||error.code!=='PHOTO_LIMIT'))delete saved.uploadedFileID;
            await cache.put(key,saved).catch(function(){});throw error;
          }
          // Store success under the original owner/job even if navigation or
          // account identity changed while the request was in flight.
          delete saved.uploadedFileID;await cache.put(key,saved).catch(function(){});check();
        }
        check();var committed=await options.commitPhoto(card,saved.uploadedPhoto,context);var photoId=committed.photoId||committed.photo&&committed.photo.photoId;if(!id(photoId))throw fail('INVALID_RESPONSE','照片保存结果无效');saved={photoId:photoId};await cache.put(key,saved).catch(function(){});check();return {state:'ready',photoId:photoId,committed:committed};
      }catch(error){if(error.code==='STALE_CONTEXT'||error.code==='SESSION_CHANGED')throw fail('STALE_CONTEXT','聊天对象已变化');check();var state=error.code==='PHOTO_LIMIT'?'full':'save_failed';saved.failure={state:state,code:error.code||'SAVE_FAILED',message:error.message||'保存失败'};await cache.put(key,saved).catch(function(){});return {state:state,blob:saved.blob,error:error};}
    }
    function ensure(owner,card,flags){
      if(card.data.photoId)return Promise.resolve({state:'ready',photoId:card.data.photoId});
      var key=owner+'|'+card.dreamId+'|'+card.data.jobId;if(tasks.has(key))return tasks.get(key);if(!(flags&&flags.retry)&&results.has(key))return Promise.resolve(results.get(key));
      var context;try{context=options.captureContext?options.captureContext(card,owner):null;}catch(error){return Promise.reject(error);}
      async function run(){var prepared={},delays=options.retryDelays===undefined?[1000,3000,8000]:options.retryDelays.slice(0,3);for(var attempt=0;;attempt++){live(card,context);var value=null,error=null;try{value=await perform(owner,card,key,attempt>0||flags&&flags.retry,context,prepared);error=value&&value.error;if(!error)return value;}catch(cause){error=cause;}if(!recoverablePhotoError(error)||attempt>=delays.length){if(value)return value;throw error;}prepared.engine=null;live(card,context);if(options.onProgress)options.onProgress({state:'retrying',attempt:attempt+1,delayMs:delays[attempt],code:error.code||'RESOURCE_UNAVAILABLE'},card,context);await(options.sleep?options.sleep(delays[attempt]):new Promise(function(resolve){root.setTimeout(resolve,delays[attempt]);}));live(card,context);}}
      var task=run().then(function(value){results.set(key,value);while(results.size>40)results.delete(results.keys().next().value);return value;}).finally(function(){tasks.delete(key);});tasks.set(key,task);return task;
    }
    return {ensure:ensure};
  }
  return {POLICY:POLICY,KINDS:KINDS,clip:clip,bytes:bytes,validateCard:validateCard,expressionText:expressionText,isImageMessage:isImageMessage,photoCaption:photoCaption,catalogFromOptions:catalogFromOptions,buildReference:buildReference,buildInvite:buildInvite,buildTaPhoto:buildTaPhoto,toShot:toShot,aiNote:aiNote,randomSeed:randomSeed,createPhotoWorker:createPhotoWorker,createChatSender:createChatSender,setChatBridge:setChatBridge,sendToChat:sendToChat,isSourceSuspended:isSourceSuspended};
});
