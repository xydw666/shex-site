(function(root,factory){'use strict';var api=factory(root);root.SHEXDatingCardUI=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 var sourceUrl=root.document&&root.document.currentScript&&root.document.currentScript.src,manifestPromise;
 function createURLRegistry(URLType){var values=new Map();function release(node){var url=values.get(node);if(url)URLType.revokeObjectURL(url);values.delete(node);}return {set:function(node,url){release(node);if(url)values.set(node,url);},prune:function(){values.forEach(function(_,node){if(!node.isConnected)release(node);});},dispose:function(){Array.from(values.keys()).forEach(release);}};}
 function createResolver(options){
  var groups=new Map(),cache=new Map();
  function key(ctx,ref){return ctx.userId+'|'+ctx.dreamId+'|'+ref.kind+'|'+ref.id;}
  async function flush(group){
   groups.delete(group.key);var rows=Array.from(group.rows.values());
   for(var start=0;start<rows.length;start+=20){var batch=rows.slice(start,start+20),results=[];
    try{var result=await options.call(group.ctx,batch.map(function(v){return v.ref;}));results=result.results||[];}catch(_){}
    batch.forEach(function(row){var value=results.find(function(r){return r.kind===row.ref.kind&&r.id===row.ref.id;})||Object.assign({status:'unavailable'},row.ref);cache.set(key(group.ctx,row.ref),{value:value,until:Date.now()+(value.status==='ready'?180000:15000)});row.resolve(value);});
   }
   while(cache.size>120)cache.delete(cache.keys().next().value);
  }
  return {get:function(ctx,ref,refresh){var cacheKey=key(ctx,ref),hit=cache.get(cacheKey);if(!refresh&&hit&&hit.until>Date.now())return Promise.resolve(hit.value);
   var groupKey=ctx.userId+'|'+ctx.dreamId,group=groups.get(groupKey);if(!group){group={key:groupKey,ctx:ctx,rows:new Map()};groups.set(groupKey,group);setTimeout(function(){flush(group);},0);}
   if(!group.rows.has(cacheKey)){var row={ref:ref};row.promise=new Promise(function(resolve){row.resolve=resolve;});group.rows.set(cacheKey,row);}return group.rows.get(cacheKey).promise;
  }};
 }
 function createController(bridge){
  var C=root.SHEXDatingCards,doc=root.document,services=new Map(),observer,visible=new WeakMap(),renderQueue=Promise.resolve(),disposed=false,urls=createURLRegistry(root.URL);
  var removals=typeof root.MutationObserver==='function'?new root.MutationObserver(function(){urls.prune();}):null;if(removals)removals.observe(doc.body,{childList:true,subtree:true});
  var resolver=createResolver({call:function(ctx,refs){return bridge.call(ctx,{action:'datingChatMediaResolve',refs:refs});}});
  function live(ctx,message){return bridge.isLive(ctx,message);}
  async function engine(profile){var D=root.SHEXDatingPhoto;if(!D||typeof D.load!=='function')throw Object.assign(Error('照片资源尚未就绪'),{code:'RESOURCE_NOT_READY'});await D.load({profile:profile||'book'});return D;}
  async function metadataEngine(){var D=await engine('book');if(!D.BG_MANIFEST&&sourceUrl){if(!manifestPromise)manifestPromise=new Promise(function(resolve,reject){var script=doc.createElement('script');script.src=new URL('../dating-photo/dp-bg-manifest.js',sourceUrl).href;script.onload=resolve;script.onerror=function(){manifestPromise=null;reject(Error('背景资料暂不可用'));};doc.head.appendChild(script);});await manifestPromise;}return D;}
  async function service(ctx){var D=await engine('book'),key=ctx.userId+'|'+ctx.dreamId;if(!services.has(key))services.set(key,D.createService({dreamId:ctx.dreamId,api:{call:function(fields){return bridge.call(ctx,fields);},getUserId:function(){return bridge.userId();}}}));return services.get(key);}
  async function render(shot,D){
   // Serialize temporary stages so scrolling through several cards cannot hold
   // multiple WebGL renderers. This container must have a measurable size.
   var job=renderQueue.catch(function(){}).then(async function(){var host=doc.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;width:360px;height:480px;pointer-events:none';doc.body.appendChild(host);var stage;
    try{stage=D.createStage(host,{labelsEnabled:false});await stage.setShot(shot);var blob=await stage.exportJPEG();return {blob:blob,propSnapshot:stage.getPhotoShot?stage.getPhotoShot().propSnapshot:undefined};}finally{if(stage)stage.dispose();host.remove();}});renderQueue=job;return job;
  }
  var worker=C.createPhotoWorker({
   captureContext:function(card){return bridge.contextFor(card.dreamId);},
   isLive:function(card,ctx){return !disposed&&bridge.isLive(ctx)&&bridge.isCardLive(card);},
   getSettings:async function(card,ctx){return (await service(ctx)).getSettings();},
   loadEngine:function(){return engine('studio');},render:render,
   savePhoto:async function(input,card,ctx){return (await service(ctx)).savePhoto(input);},
   resumePhoto:async function(input,card,ctx){var result=await bridge.call(ctx,{action:'datingPhotoSave',fileID:input.fileID,width:960,height:1280,shot:input.shot});if(!result.photo||result.photo.fileID!==input.fileID||result.photo.dreamId!==ctx.dreamId||!root.SHEXDatingPhotoContract.validatePhotoMeta(result.photo).ok)throw Object.assign(Error('照片保存结果无效'),{code:'INVALID_RESPONSE'});return result.photo;},
   commitPhoto:async function(card,photo,ctx){return bridge.commitPhoto(card,photo,ctx);}
  });
  function el(tag,cls,text){var node=doc.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
  function button(text,action,cls){var b=el('button',cls||'xdc-button',text);b.type='button';b.addEventListener('click',function(){Promise.resolve(action()).catch(function(e){bridge.toast(e.message||'暂时无法完成');});});return b;}
  function modal(title,options){options=options||{};var mask=el('div','xdc-mask'),panel=el('section','xdc-sheet'),header=el('header','xdc-header'),closed=false;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title);header.append(el('strong','',title),button('关闭',close,'xdc-close'));panel.appendChild(header);mask.appendChild(panel);doc.body.appendChild(mask);var last=doc.activeElement;function close(selected){if(closed||(selected!==true&&options.canClose&& !options.canClose()))return;closed=true;mask.remove();if(last&&last.focus)last.focus();if(options.onClose)options.onClose(selected===true);}mask.addEventListener('click',function(e){if(e.target===mask)close();});mask.addEventListener('keydown',function(e){if(e.key==='Escape')close();});header.lastChild.focus();return {mask:mask,panel:panel,close:close};}
  function showImage(url,title){var view=modal(title||'你们的合影'),img=el('img','xdc-full');img.alt=title||'你们的合影';img.src=url;view.panel.appendChild(img);}
  function onVisible(node,fn){visible.set(node,fn);if(typeof root.IntersectionObserver!=='function'){setTimeout(fn,0);return;}if(!observer)observer=new root.IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){observer.unobserve(entry.target);var run=visible.get(entry.target);visible.delete(entry.target);if(run)run();}});},{rootMargin:'0px'});observer.observe(node);}
  function mount(content,message,handlers){
   var card=message.linkCard,ctx=handlers.datingContext||bridge.contextFor(card.dreamId);if(!C.validateCard(card).ok)return false;
   var photoMessage=C.isImageMessage(message),componentMessage=card.kind==='dating_component',title=card.kind==='dating_invite'?'一起去约会':card.kind==='dating_component'?'约会成品':'约会合影';
   var box=el(photoMessage?'figure':'article',photoMessage?'xdc-photo-message':'xdc-card'),head=el('div','xdc-card-head',title);content.textContent='';if(componentMessage)box.classList.add('xdc-component-message');if(!photoMessage)box.appendChild(head);content.appendChild(box);
   if(card.kind==='dating_invite'){
    box.classList.add('xdc-invite');box.append(el('h3','',card.data.place),el('p','',card.data.activity));if(card.data.note)box.appendChild(el('p','xdc-note',card.data.note));
    var actions=el('div','xdc-actions');
    // 用户发出的邀请由 TA 回应：用户这边不出现按钮，只显示 TA 的选择；TA 答应后可随时点「去约会」。
    if(message.role==='user'){box.classList.add('is-from-user');head.textContent='我发出的约会邀请';
     if(card.status==='accepted'){actions.appendChild(el('span','xdc-status is-yes','TA 答应啦'));actions.appendChild(button('去约会',function(){return handlers.onAction('go');},'xdc-button xdc-primary'));}
     else actions.appendChild(el('span','xdc-status',card.status==='declined'?'TA 说这次先不去了':card.status==='later'?'TA 说晚一点再出发':'等 TA 回应…'));
     box.appendChild(actions);return true;}
    if(['pending','failed'].includes(card.status)){
     [['一起去','accept'],['晚一点','later'],['这次不了','decline']].forEach(function(pair){actions.appendChild(button(pair[0],async function(){if(!live(ctx,message))return;Array.from(actions.querySelectorAll('button')).forEach(function(b){b.disabled=true;});try{await handlers.onAction(pair[1]);}finally{Array.from(actions.querySelectorAll('button')).forEach(function(b){b.disabled=false;});}},pair[1]==='accept'?'xdc-button xdc-primary':'xdc-button'));});
    }else actions.appendChild(el('span','xdc-status',card.status==='declined'?'这次先不去了':card.status==='accepted'?'已经答应这次邀约':'晚一点再出发'));box.appendChild(actions);return true;
   }
   var media=button('正在加载…',function(){if(media.dataset.url)showImage(media.dataset.url,title);},photoMessage?'xdc-photo-media':'xdc-media'),status=el(photoMessage?'span':'p',photoMessage?'xdc-photo-status':'xdc-status'),retry=button(photoMessage?'重试':'点此重试',function(){return load(true);},photoMessage?'xdc-photo-retry':'xdc-retry');retry.hidden=true;
   status.setAttribute('role','status');
   box.append(media,status,retry);
   function notify(text,canRetry){status.textContent=text||'';status.title=text||'';status.hidden=!text;retry.hidden=!canRetry;}
   function unavailable(text,canRetry){media.textContent=photoMessage?'':text;media.setAttribute('aria-label',text);delete media.dataset.url;delete box.dataset.hasImage;notify(photoMessage?text:'',canRetry);}
   var objectURL='';function image(url){media.textContent='';media.setAttribute('aria-label',title);var img=el('img');img.alt=title;img.src=url;img.onerror=function(){unavailable('暂时无法加载',true);};media.appendChild(img);media.dataset.url=url;box.dataset.hasImage='true';}
   async function resolvePhoto(photoId,refresh){var ref={kind:card.kind==='dating_component'?'component':'photo',id:photoId},result=await resolver.get(ctx,ref,refresh);if(!live(ctx,message)||!box.isConnected)return;
    if(result.status==='ready'){image(result.url);notify('',false);}else unavailable(result.status==='deleted'?(ref.kind==='component'?'成品已删除':'照片已删除'):'暂时无法加载',result.status!=='deleted');}
   async function load(refresh){
    if(!live(ctx,message)||!box.isConnected)return;retry.hidden=true;var photoId=card.data.photoId||card.data.componentId;
    if(photoId)return resolvePhoto(photoId,refresh);
    if(!media.dataset.url)media.textContent='正在拍…';notify(refresh&&media.dataset.url?'正在保存…':'',false);
    try{var result=await worker.ensure(ctx.userId,card,{retry:refresh});if(!live(ctx,message)||!box.isConnected)return;
     if(result.photoId){urls.set(box,null);return resolvePhoto(result.photoId,true);}
     if(result.blob){objectURL=root.URL.createObjectURL(result.blob);urls.set(box,objectURL);image(objectURL);}
     notify(result.state==='full'?'相册已满，未保存':photoMessage?'保存失败':'保存失败，点此重试',true);
    }catch(e){if(e.code==='STALE_CONTEXT'){if(live(ctx,message)&&box.isConnected)return load(refresh);return;}unavailable(e.code==='SETTINGS_REQUIRED'?'请先设置双方身高':/^(POSE_|HEIGHT_|EXPRESSION_|INVALID_SETTINGS)/.test(e.code||'')?e.message:'暂时无法拍摄',true);}
   }
   onVisible(box,function(){load(false);});return true;
  }
  async function prepare(ctx,request){var catalog=bridge.catalog();if(!catalog)throw Error('约会建议暂未准备好');var options=Object.assign({},request,{dreamId:ctx.dreamId,meName:ctx.meName,catalog:catalog});
   if(request.kind==='dating_invite')return C.buildInvite(options);
   var D=await engine('studio'),settings=await(await service(ctx)).getSettings();if(!live(ctx))throw Error('聊天对象已变化');return C.buildTaPhoto(Object.assign(options,{photo:D,settings:settings}));
  }
  async function reference(ctx,input,known){
   function check(){if(!(bridge.isSourceLive?bridge.isSourceLive(ctx):live(ctx)))throw Object.assign(Error('原页面或账号已变化'),{code:'STALE_CONTEXT'});}
   check();var D=await metadataEngine(),kind=input.photoId?'photo':'component',id=input.photoId||input.componentId,record=known;
   if(!record){var result=await resolver.get(ctx,{kind:kind,id:id},true);check();if(result.status==='deleted')throw Object.assign(Error(kind==='photo'?'照片已删除':'成品已删除'),{code:'MEDIA_NOT_FOUND'});record=result.record;if(!record)throw Object.assign(Error('暂时无法读取，请稍后重试'),{code:'MEDIA_UNAVAILABLE'});}
   var photos;
   if(kind==='component'){
    var ids=Array.from(new Set(((record.recipe||{}).slots||[]).slice(0,(record.recipe||{}).templateId==='frame_plain_grid9'?9:6).map(function(slot){return slot.photoId;}).filter(Boolean)));
    var resolved=await Promise.all(ids.map(function(photoId){return resolver.get(ctx,{kind:'photo',id:photoId});}));check();
    if(resolved.some(function(row){return row.status==='deleted';}))throw Object.assign(Error('成品中的照片已删除'),{code:'MEDIA_NOT_FOUND'});
    if(resolved.some(function(row){return !row.record;}))throw Object.assign(Error('暂时无法读取成品照片，请重试'),{code:'MEDIA_UNAVAILABLE'});
    photos=resolved.map(function(row){return row.record;});
   }
   check();return C.buildReference(kind==='photo'?'dating_photo':'dating_component',record,{cardId:bridge.newId(),dreamId:ctx.dreamId,meName:ctx.meName,caption:input.caption,photo:D,photos:photos});
  }
  async function openPicker(ctx,options){
   options=options||{};var selectOnly=typeof options.onSelect==='function',ticket=0,kind='photo',busy=false,closed=false;
   function pickerLive(){return !closed&&(selectOnly?(options.isLive?options.isLive():(bridge.isSourceLive?bridge.isSourceLive(ctx):live(ctx))):live(ctx));}
   var view=modal(selectOnly?(options.title||'选择约会图片'):'发约会照片',{canClose:function(){return !selectOnly||!busy;},onClose:function(selected){closed=true;ticket++;if(selectOnly&&!selected&&options.onClose)options.onClose();}}),tabs=el('nav','xdc-tabs'),body=el('div','xdc-picker-body'),caption=el('input','xdc-caption'),captionLabel=el('label','xdc-caption-label','附一句话（选填）');if(selectOnly&&options.stageWorkbench)view.mask.classList.add('xdc-mask--stage-workbench');caption.placeholder='把这一刻说给 TA 听';caption.maxLength=80;captionLabel.appendChild(caption);view.panel.appendChild(tabs);if(!selectOnly)view.panel.appendChild(captionLabel);view.panel.appendChild(body);
   async function select(ref,record){if(busy||!pickerLive())return;busy=true;try{var resolved=await resolver.get(ctx,ref);if(!pickerLive())return;if(resolved.status!=='ready'||!resolved.url)throw Error(resolved.status==='deleted'?'图片已删除':'图片暂时无法读取，请稍后重试');await options.onSelect({url:resolved.url,fileID:ref.kind==='photo'?record.fileID:record.thumbFileID,kind:ref.kind,id:ref.id,name:ref.kind==='photo'?'约会照片.jpg':'约会成品.jpg'});if(pickerLive())view.close(true);}finally{busy=false;}}
   async function send(card,captionText){if(busy||!live(ctx))return;busy=true;try{await bridge.send(ctx,card,{caption:captionText});view.close();}finally{busy=false;}}
   async function show(next){kind=next;var current=++ticket;body.textContent='正在读取…';Array.from(tabs.children).forEach(function(b){b.setAttribute('aria-selected',String(b.dataset.kind===kind));});
    if(kind==='invite'){body.textContent='';var catalog=bridge.catalog();if(!catalog){body.textContent='约会建议暂未准备好，请稍后重试';return;}
     var place=el('select','xdc-select'),activity=el('select','xdc-select');function options(select,rows){rows.forEach(function(row){var text=typeof row==='string'?row:row.text;var option=el('option','',text);option.value=text;select.appendChild(option);});}options(place,catalog.places||[]);options(activity,catalog.activities||[]);
     var placeLabel=el('label','xdc-field','想去哪里'),activityLabel=el('label','xdc-field','一起做什么');placeLabel.appendChild(place);activityLabel.appendChild(activity);body.append(placeLabel,activityLabel,el('p','xdc-status','这只是建议，出发前还可以重新选择。'),button('发送邀请',function(){return send(C.buildInvite({cardId:bridge.newId(),dreamId:ctx.dreamId,seed:bridge.newId(),meName:ctx.meName,sender:'user',caption:caption.value,catalog:{places:[place.value],activities:[activity.value]}}));},'xdc-button xdc-primary'));return;
    }
    try{var D=await metadataEngine(),s=await service(ctx);if(!pickerLive()||current!==ticket)return;body.textContent='';var grid=el('div','xdc-picker-grid');body.appendChild(grid);var cursor=null;
     async function page(){if(!pickerLive()||current!==ticket)return;var result=await(kind==='photo'?s.listPhotos:s.listComponents)({limit:20,cursor:cursor});if(!pickerLive()||current!==ticket)return;var rows=result.items||[];for(const record of rows){const ref={kind:kind,id:kind==='photo'?record.photoId:record.componentId};var tile=button(kind==='photo'?'选择合影':'选择成品',async function(){if(selectOnly)return select(ref,record);var words=caption.value;return send(await reference(ctx,{photoId:ref.kind==='photo'?ref.id:undefined,componentId:ref.kind==='component'?ref.id:undefined,caption:words},record),words);},'xdc-picker-tile');grid.appendChild(tile);(function(node,r){onVisible(node,async function(){var resolved=await resolver.get(ctx,r);if(!node.isConnected||!pickerLive())return;if(resolved.status==='ready'){var img=el('img');img.src=resolved.url;img.alt=r.kind==='photo'?'约会合影':'约会成品';node.prepend(img);}else node.textContent=resolved.status==='deleted'?'已删除':'暂时无法加载';});})(tile,ref);}
      cursor=result.nextCursor||null;more.hidden=!cursor;if(!grid.children.length)grid.appendChild(el('p','xdc-status',kind==='photo'?'相册里还没有合影，先去拍一张吧。':'还没有成品，先在相册里制作一份吧。'));}
     var more=button('再看一些',async function(){more.disabled=true;try{await page();}finally{more.disabled=false;}});body.appendChild(more);await page();
    }catch(e){if(current===ticket)body.textContent=e.message||'暂时无法读取相册';}
   }
   (selectOnly?[['photo','合影'],['component','成品']]:[['photo','合影'],['component','成品'],['invite','约会邀请']]).forEach(function(pair){var b=button(pair[1],function(){if(!busy)return show(pair[0]);},'xdc-tab');b.dataset.kind=pair[0];b.setAttribute('role','tab');tabs.appendChild(b);});await show('photo');return view;
  }
  return {prepare:prepare,reference:reference,mount:mount,openPicker:openPicker,resolver:resolver,dispose:function(){disposed=true;if(observer)observer.disconnect();if(removals)removals.disconnect();urls.dispose();services.clear();}};
 }
 return {createResolver:createResolver,createController:createController,createURLRegistry:createURLRegistry};
});
