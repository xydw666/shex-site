(function(root,factory){
  var api=factory(root||{});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SHEXLetterCard=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  var Stationery=root.SHEXXLettersStationery||(typeof require==='function'?require('../x-letters/x-letter-stationery'):null);
  function known(items,id){return items.filter(function(item){return item.id===id;})[0];}
  function validPreview(value){return !!(value&&value.v===1&&known(Stationery.envelopes,value.envelope)&&known(Stationery.seals,value.seal));}
  function same(a,b){return !!(a&&b&&a.userId===b.userId&&a.dreamId===b.dreamId);}
  function createResolver(options){
    var pending=new Map(),completed=new Map(),directories=new Map(),revision=0;
    function current(selected,epoch){return epoch===revision&&same(selected,options.currentOwner());}
    async function resolve(card){
      var selected=options.currentOwner(),epoch=revision;
      if(!selected||!selected.userId||!selected.dreamId||!card||card.kind!=='letter'||card.dreamId!==selected.dreamId||!card.data||!card.data.paperId)return null;
      var id=String(card.data.paperId),key=JSON.stringify([selected.userId,selected.dreamId,id]);
      if(validPreview(card.data.letterPreview))return card.data.letterPreview;
      if(completed.has(key))return completed.get(key);
      if(pending.has(key))return pending.get(key);
      var work=(async function(){
        var state=options.getState&&options.getState(),api=null,paper=null;
        if(state&&same(state.owner,selected)&&state.monthlyReady){
          paper=state.paper&&state.paper.paperId===id?state.paper:(state.papers||[]).filter(function(p){return p.paperId===id;})[0];
        }else{
          api=options.getApi(selected);
          var directoryKey=JSON.stringify([selected.userId,selected.dreamId]),entry=directories.get(directoryKey);
          if(!entry||Date.now()-entry.at>30000){
            entry={at:Date.now(),promise:Promise.resolve().then(function(){return api.openMonthlyBooks({dreamId:selected.dreamId,includeDrafts:false});})};
            directories.set(directoryKey,entry);
            if(directories.size>80)directories.delete(directories.keys().next().value);
          }
          var result=await entry.promise;
          if(!current(selected,epoch)||!result||!result.capabilities||result.capabilities.monthlyBooks!==1)return null;
          state={owner:selected,monthlyReady:true,stationeryUnlock:result.stationeryUnlock};
          paper=((result.firstPage&&result.firstPage.items)||[]).filter(function(p){return p.paperId===id;})[0];
        }
        if(!paper){api=api||options.getApi(selected);paper=await api.getPaper({dreamId:selected.dreamId,paperId:id});}
        if(!current(selected,epoch)||!paper||paper.paperId!==id||paper.authorType!=='dream'||paper.state!=='sent'||paper.hiddenAt||paper.dreamId&&paper.dreamId!==selected.dreamId||paper.userId&&paper.userId!==selected.userId)return null;
        var look=Stationery.receivedLook(paper,state);
        var value={v:1,envelope:look.envelope,seal:look.seal,sentAt:Number(paper.sentAt||paper.visibilityAt||paper.createdAt)||0,fromName:String(selected.dreamName||'TA').slice(0,60)};
        completed.set(key,value);
        if(completed.size>80)completed.delete(completed.keys().next().value);
        return value;
      })().finally(function(){if(pending.get(key)===work)pending.delete(key);});
      pending.set(key,work);return work;
    }
    return {resolve:resolve,clear:function(){revision++;pending.clear();completed.clear();directories.clear();}};
  }
  var CSS='.x-link-card[data-kind=letter]{min-width:0;width:260px;max-width:100%;border:0;padding:0}' +
    '.x-link-card[data-kind=letter] .x-link-card-icon{display:none}' +
    '.x-link-card[data-kind=letter] .x-link-card-head{padding:2px 0 0}' +
    '.x-link-card[data-kind=letter] .x-link-card-body{margin-top:12px}' +
    '.x-link-letter-envelope{display:block;position:relative;width:100%;max-width:100%;padding:0;margin:0;border:0;border-radius:2px;background:transparent;color:inherit;cursor:pointer;box-shadow:none;font:inherit;text-align:left;touch-action:manipulation}' +
    '.x-link-letter-envelope:focus-visible{outline:2px solid currentColor;outline-offset:5px}' +
    '.x-link-letter-envelope:disabled{cursor:wait;opacity:.65}' +
    '.x-link-letter-frame{display:block;position:relative;width:100%;height:0;overflow:hidden;filter:drop-shadow(0 3px 5px #22352c20)}' +
    '.x-link-letter-art,.x-link-letter-crop{position:absolute;inset:0;display:block;overflow:hidden}' +
    '.x-link-letter-crop img{position:absolute;display:block;max-width:none!important;max-height:none!important;margin:0!important;border-radius:0!important}' +
    '.x-link-letter-flat{position:absolute;inset:0;background:var(--link-envelope-paper,#f6f1e4);color:#29352c}' +
    '.x-link-letter-flat:before{content:"";position:absolute;inset:0 0 auto;height:48%;background:var(--link-envelope-flap,#e9e4d7);clip-path:polygon(0 0,100% 0,50% 100%)}' +
    '.x-link-letter-sprig{position:absolute;right:4%;bottom:3%;width:12%;height:40%;opacity:.3}' +
    '.x-link-letter-address small{display:block}' +
    '.x-link-letter-address{position:absolute;display:block;left:var(--link-address-left,7%);right:var(--link-address-right,7%);top:var(--link-address-top,66%);font:11px/1.4 "Noto Serif SC","Songti SC",serif;color:#34463d;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;pointer-events:none}' +
    '.x-link-letter-seal{position:absolute;display:block;left:var(--link-stamp-left,50%);top:var(--link-stamp-top,48%);width:14%;height:0;padding-bottom:14%;transform:translate(-50%,-50%);pointer-events:none;color:#556d59}' +
    '.x-link-letter-seal>img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}' +
    '.x-link-letter-seal>img.x-link-letter-botanical{inset:18%;width:64%;height:64%}' +
    '.x-link-letter-seal>span.x-link-letter-seal-label{position:absolute;left:0;right:0;top:41%;font:5px/1 serif;text-align:center}' +
    '.x-link-letter-hint{display:block;margin-top:10px;font-size:12px;line-height:1.6;color:inherit;text-align:right}' +
    '.x-link-card[data-kind=letter] .x-link-card-voice{margin-top:10px;font-size:14px}' +
    '.x-link-card[data-kind=letter] .x-link-card-actions{margin-top:10px}';
  function element(doc,tag,cls,text){var e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function image(doc,src,cls){var e=element(doc,'img',cls);e.src=src;e.alt='';e.draggable=false;e.decoding='async';return e;}
  function crop(doc,art){
    var rect=art.crop||[0,0,art.width,art.height],x=rect[0],y=rect[1],w=rect[2],h=rect[3];
    var e=element(doc,'span','x-link-letter-crop'),img=image(doc,Stationery.url(art));
    img.style.cssText='width:'+art.width/w*100+'%;height:'+art.height/h*100+'%;left:'+(-x/w*100)+'%;top:'+(-y/h*100)+'%';e.appendChild(img);return e;
  }
  function render(container,preview,options){
    if(!validPreview(preview))return false;
    options=options||{};var doc=container.ownerDocument||root.document;
    if(!doc.getElementById('shexLetterCardStyle')){var style=element(doc,'style');style.id='shexLetterCardStyle';style.textContent=CSS;(doc.head||doc.documentElement).appendChild(style);}
    var env=known(Stationery.envelopes,preview.envelope),seal=known(Stationery.seals,preview.seal);
    var button=element(doc,'button','x-link-letter-envelope');button.type='button';button.setAttribute('aria-label','打开'+String(preview.fromName||'TA')+'寄来的信');button.setAttribute('data-envelope-id',env.id);button.setAttribute('data-seal-id',seal.id);
    var frame=element(doc,'span','x-link-letter-frame'),ratio=1.55,art=env.art;
    if(art){var rect=art.crop||[0,0,art.width,art.height];ratio=env.turn?rect[3]/rect[2]:rect[2]/rect[3];}
    if(env.id==='letter-blue')ratio=1200/668;
    frame.style.paddingBottom=(100/ratio)+'%';
    if(art){
      var layer=element(doc,'span','x-link-letter-art');
      if(env.turn)layer.style.cssText='inset:auto;left:50%;top:50%;width:'+(100/ratio)+'%;height:'+(100*ratio)+'%;transform:translate(-50%,-50%) rotate('+env.turn+'deg)';
      layer.appendChild(crop(doc,art));frame.appendChild(layer);
      frame.style.setProperty('--link-address-left',env.address[0]+'%');frame.style.setProperty('--link-address-right',env.address[1]+'%');frame.style.setProperty('--link-address-top',env.address[2]+'%');frame.style.setProperty('--link-stamp-left',env.stamp[0]+'%');frame.style.setProperty('--link-stamp-top',env.stamp[1]+'%');
    }else if(env.id==='letter-blue'){
      var blue=image(doc,'./x-world/x-letters/envelope-letter-blue.webp','x-link-letter-art');blue.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain';frame.appendChild(blue);
      frame.style.setProperty('--link-address-left','42%');frame.style.setProperty('--link-address-right','34%');frame.style.setProperty('--link-address-top','74%');
    }else{
      var flat=element(doc,'span','x-link-letter-flat'),colors={moss:['#c6d0bb','#b8c4ac'],apricot:['#ead7c4','#dfcbb5'],rose:['#dfced0','#d2bfc1']};
      if(colors[env.id]){flat.style.setProperty('--link-envelope-paper',colors[env.id][0]);flat.style.setProperty('--link-envelope-flap',colors[env.id][1]);}
      flat.appendChild(image(doc,'./x-world/x-letters/botanical-sprig.svg','x-link-letter-sprig'));frame.appendChild(flat);
    }
    var address=element(doc,'span','x-link-letter-address','来自：'+String(preview.fromName||'TA'));
    if(preview.sentAt>0)address.appendChild(element(doc,'small','',new Date(preview.sentAt).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})));
    frame.appendChild(address);
    var stamp=element(doc,'span','x-link-letter-seal');
    if(seal.art){
      var rect=seal.art.crop||[0,0,seal.art.width,seal.art.height],r=rect[2]/rect[3],fit=element(doc,'span');
      fit.style.cssText='position:absolute;left:50%;top:50%;width:'+Math.min(100,r*100)+'%;height:'+Math.min(100,100/r)+'%;transform:translate(-50%,-50%)';fit.appendChild(crop(doc,seal.art));stamp.appendChild(fit);
    }else if(seal.image){stamp.appendChild(image(doc,seal.image));if(seal.id==='good-letters')stamp.style.transform='translate(-50%,-50%) scale(1.9)';}
    else{
      stamp.appendChild(image(doc,'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" fill="none"><g stroke="#556d59"><circle cx="30" cy="30" r="28"/><circle cx="30" cy="30" r="25"/></g></svg>')));
      if(seal.id==='botanical-round')stamp.appendChild(image(doc,'./x-world/x-letters/botanical-sprig.svg','x-link-letter-botanical'));
      stamp.appendChild(element(doc,'span','x-link-letter-seal-label','已寄出'));
    }
    frame.appendChild(stamp);button.appendChild(frame);button.appendChild(element(doc,'span','x-link-letter-hint',options.read?'已读 · 再读一遍':'轻点信封，读这封信'));
    button.addEventListener('click',function(event){event.stopPropagation();if(button.disabled)return;button.disabled=true;var task;try{task=options.onOpen&&options.onOpen();}catch(error){button.disabled=false;return;}Promise.resolve(task).then(function(){button.disabled=false;},function(){button.disabled=false;});});
    container.appendChild(button);return true;
  }
  return {validPreview:validPreview,createResolver:createResolver,render:render};
});
