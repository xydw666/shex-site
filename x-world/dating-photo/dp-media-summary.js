(function(root,factory){var api=factory();root.SHEXDatingMediaSummary=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
  })(globalThis,function(){'use strict';
  var EXPRESSIONS={dots:'静静地看着镜头',happy:'笑了起来',laugh:'笑得很开心',star_eyes:'眼睛亮晶晶的',heart_eyes:'满眼都是喜欢',shy_blush:'有点害羞',sleepy:'有点困了',smug:'有点小得意',surprised:'有些惊喜',cry:'眼里带着泪光',pout:'嘟着嘴',wink:'眨了眨眼',angry:'有点生气',dizzy:'晕乎乎的',kiss:'轻轻嘟起嘴',side_eye:'悄悄看着旁边',thinking:'若有所思',just_awake:'像是刚睡醒',wronged:'有点委屈'};
  var clip=(s,n)=>Array.from(String(s||'').trim()).slice(0,n).join('');
  var SUMMARY_VERSION='dating-media-summary-v2';
  function utf8Size(s){var n=0;for(var c of s){var p=c.codePointAt(0);n+=p<=127?1:p<=2047?2:p<=65535?3:4;}return n;}
  function jsonBytes(s){return utf8Size(JSON.stringify(s))-2;}
  function clipBytes(s,limit){var out='',n=0;for(var c of s){var cost=jsonBytes(c);if(n+cost>limit)break;out+=c;n+=cost;}return out;}
  // One source for renderer labels and AI text. Values are centimetres and use
  // the saved height snapshot, never current profile/settings or image guessing.
  var BUILTIN_LENGTH_FACTORS=Object.freeze({hand:.108,foot:.15});
  function builtinLengthCm(type,heightCm){
    if(!Object.prototype.hasOwnProperty.call(BUILTIN_LENGTH_FACTORS,type)||typeof heightCm!=='number'||!Number.isFinite(heightCm)||heightCm<10||heightCm>10000)return null;
    return heightCm*BUILTIN_LENGTH_FACTORS[type];
  }
  function photoIds(r){return [...new Set(((r.recipe||{}).slots||[]).slice(0,(r.recipe||{}).templateId==='frame_plain_grid9'?9:6).map(s=>s.photoId).filter(Boolean))];}
  // Plain grids draw only photographs: caption metadata and even stored deco
  // are hidden by frameRender.render(), so they cannot be reported as printed.
  function printedWords(recipe){
    var c=recipe.caption||{},d=recipe.deco||{},id=String(recipe.templateId||'');
    if(/^frame_plain_grid(?:4|9)$/.test(id))return [];
    if(id.indexOf('frame_')===0){
      id=id.slice(6);var words=[d.frameCaption,(d.bubble||{}).text];
      if(['film_strip','cardstock','music','strip_four','classic','aged','negative_duo','social'].includes(id))words.push(c.date);
      if(id!=='none'&&(['cardstock','music','strip_four','social'].includes(id)||!d.frameCaption))words.push(c.meName,c.taName);
      return words.filter(v=>typeof v==='string'&&v.trim());
    }
    return [typeof c==='string'?c:c.title,d.frameCaption,(d.bubble||{}).text,c.date,c.meName,c.taName].filter(v=>typeof v==='string'&&v.trim());
  }
  function heldWords(s,p,me,ta){
    var snapshot=s.propSnapshot,actual=snapshot&&snapshot.v===1&&Array.isArray(snapshot.items)&&snapshot.items.every(v=>v&&['me','ta'].includes(v.holder)&&typeof v.id==='string');
    var rows=actual?snapshot.items:(s.props||[]),byId=new Map();
    rows.forEach(function(item){var name=((p.PROPS||[]).find(v=>v.id===item.id)||{}).name;if(!name)return;if(!byId.has(item.id))byId.set(item.id,{name:name,holders:new Set()});byId.get(item.id).holders.add(item.holder);});
    return Array.from(byId).map(function(entry){var id=entry[0],value=entry[1];
      // The render-time snapshot is already in identity coordinates. Never
      // swap it again or infer an old image's owner from conflicting requests.
      if(actual&&value.holders.size===1)return(Array.from(value.holders)[0]==='ta'?ta:me)+'拿着'+value.name;
      return id==='umbrella'?'共撑一把伞':id==='balloon'?'一起拿着气球':'画面中有'+value.name;
    });
  }
  function slotNumber(slot,index){return /^s[1-9]$/.test(slot.slotId||'')?Number(slot.slotId.slice(1)):index+1;}
  function buildSummary(o){o=o||{};
  var p=o.presets||{},r=o.record||{},me=clip(o.meName||'照片主人',20),ta=clip(o.taName||'同行的人',20);
  var lookup=(rows,id,f)=>((rows||[]).find(v=>v.id===id)||{}).name||f;
  var photos=o.kind==='component'?(o.photos||[]):[r];
  if(o.kind==='component'){var slots=((r.recipe||{}).slots||[]).slice().sort((a,b)=>slotNumber(a,0)-slotNumber(b,0)),sources=photos;photos=slots.length?slots.map(function(slot,i){return sources.find(v=>v.photoId===slot.photoId)||(!sources.some(v=>v.photoId)?sources[i]:null);}).filter(Boolean):sources;
    var seen=new Set();photos=photos.slice(0,9).filter(function(v){if(!v.photoId)return true;if(seen.has(v.photoId))return false;seen.add(v.photoId);return true;});}
  var descriptions=photos.map(v=>{var s=v.shot||{};
  if(v.builtinType==='hand'||v.builtinType==='foot'){
    var part=v.builtinType==='hand'?'手':'脚',h=s.heightsCm||{},a=builtinLengthCm(v.builtinType,h.me),b=builtinLengthCm(v.builtinType,h.ta);
    var title=o.mode==='chat'?(o.sender==='ta'?'你给'+me+'发了一张你们俩的':me+'给你发了一张你们俩的')+part+'印对比':me+'和'+ta+'的'+part+'印对比';
    return title+(a===null||b===null?'。':'：'+me+'的'+part+'长 '+a.toFixed(1)+'cm，'+(o.mode==='chat'?'你':ta)+'的'+part+'长 '+b.toFixed(1)+'cm。');
  }
  var action=lookup(p.ALL_POSES||p.POSES,s.poseId,'一起留下了纪念'),held=heldWords(s,p,me,ta).filter(v=>v!==action);
  return clip(me+'和'+ta+'在'+lookup(p.BACKGROUNDS,(s.bg||{}).presetId,'一起待着的地方')+'，'+action+'；'+(held.length?held.join('，')+'。':'')+me+(EXPRESSIONS[(s.me||{}).expression]||'静静地看着镜头')+'，'+ta+(EXPRESSIONS[(s.ta||{}).expression]||'静静地看着镜头')+'。',160);
  });
  var text=descriptions.join(' '),recipe=r.recipe||{},large=o.kind==='component'&&((recipe.slots||[]).length>4||recipe.templateId==='frame_plain_grid9');
  if(large){
    var label=recipe.templateId==='frame_plain_grid9'?'九宫格':'成品',count=(recipe.slots||[]).length||photos.length,size=s=>Array.from(s).length;
    if(o.mode==='chat'){
      var mixed=photos.some(v=>v.builtinType==='hand'||v.builtinType==='foot');
      var head=(o.sender==='ta'?'你刚刚给'+me:me+'给你')+'发了一张'+label+'，共'+count+'张'+(mixed?'照片（含手脚印）':'合影')+'。';
      var take=Math.min(2,descriptions.length),covered=new Set(),labels=photos.slice(0,take).map(function(photo,index){var nums=[];(recipe.slots||[]).forEach(function(slot,i){if(photo.photoId&&slot.photoId===photo.photoId)nums.push(slotNumber(slot,i));});if(!nums.length)nums=[index+1];nums.sort((a,b)=>a-b);nums.forEach(n=>covered.add(n));return '第'+nums.join('、')+'格：';});
      var remaining=Math.max(0,count-covered.size),tail=remaining?'其余'+remaining+'格未提供细节，不描述、不编格号。':'',room=Math.max(0,160-size(head)-size(tail)-size(labels.join(''))-take);
      text=head+descriptions.slice(0,take).map(function(d,i){var prefix=me+'和'+ta+'在';if(d.startsWith(prefix))d=d.slice(prefix.length);return labels[i]+clip(d,Math.floor(room/Math.max(1,take)));}).join(' ')+tail;
    }else{
      var head=me+'和'+ta+'的'+label+'，共'+count+'张照片，'+photos.length+'张不同照片。';
      var each=Math.max(1,Math.floor((1200-size(head)-10*photos.length)/Math.max(1,photos.length)));
      // Reserve space for all sources before optional printed words; the media
      // envelope also has a 4KiB UTF-8 limit, independently of the character cap.
      var eachBytes=Math.max(1,Math.floor((2800-jsonBytes(head)-24*photos.length)/Math.max(1,photos.length)));
      text=head+descriptions.map((d,i)=>{
        var photo=photos[i],type=photo.builtinType;
        if(type==='hand'||type==='foot'){
          var part=type==='hand'?'手':'脚',h=(photo.shot||{}).heightsCm||{},a=builtinLengthCm(type,h.me),b=builtinLengthCm(type,h.ta);
          // Names are already paired in the component heading; avoid repeating
          // that heading inside each built-in and preserve both measurements.
          d=part+'印对比'+(a===null||b===null?'。':'：'+me+'的'+part+'长 '+a.toFixed(1)+'cm，'+ta+'的'+part+'长 '+b.toFixed(1)+'cm。');
        }
        var nums=[];(recipe.slots||[]).forEach(function(slot,index){if(photo.photoId&&slot.photoId===photo.photoId)nums.push(slotNumber(slot,index));});nums.sort((a,b)=>a-b);
        return '第'+(nums.length?nums:[i+1]).join('、')+'格：'+clipBytes(clip(d,each),eachBytes);
      }).join(' ');
    }
  }
  var words=printedWords(r.recipe||{});
  if(words.length)text+='上面写着：'+[...new Set(words)].map(v=>clip(v,80)).join('；')+'。';
  if(o.caption)text+='配文：'+clip(o.caption,80);
  if(!large&&o.mode==='chat'&&photos.some(v=>v.builtinType!=='hand'&&v.builtinType!=='foot'))text=(o.sender==='ta'?'你刚刚给'+me:me+'给你')+'发了一'+(o.kind==='component'?'份照片成品':'张合影')+'：'+text;
  if(o.mode==='chat')text=text.split(me+'和'+ta).join(me+'和你').split(ta).join('你');
  text=clip(text,o.mode==='chat'?160:1200);return large&&o.mode!=='chat'?clipBytes(text,3000):text;}return {SUMMARY_VERSION:SUMMARY_VERSION,buildSummary:buildSummary,photoIds:photoIds,BUILTIN_LENGTH_FACTORS:BUILTIN_LENGTH_FACTORS,builtinLengthCm:builtinLengthCm};
  });
