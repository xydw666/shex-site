(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SHEXPetCare=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // 梦角只对重要变化主动开口；用户日常的摸摸、喂饭、陪玩不再逐次点评，
  // 否则聊天记录里全是宠物解说，后面的对话也会被带着反复描述触感。
  const probabilities=Object.freeze({pet:0,feed:.1,play:.1,sleep:.08,wake:.08,adopt:1,level_up:.6,hungry:.4,tired:.4,low_mood:.45});
  // 字卡模式不调用 AI、不花能量，也不会把模型带偏，宠物相关字卡可以出现得更勤。
  const cardProbabilities=Object.freeze({pet:.3,feed:.4,play:.4,sleep:.35,wake:.3,adopt:1,level_up:.75,hungry:.6,tired:.6,low_mood:.65});
  // 梦角自己动手照顾的机会：每次有宠物动静时抽一次。
  const DREAM_CARE_CHANCE=.3,DREAM_CARE_WINDOW_MS=180000,DREAM_CARE_MAX_PER_WINDOW=3;
  // 字卡模式：用户每说一句话有 40% 的机会；上限是 1 分钟 2 次。
  const CARD_CHAT_CARE_CHANCE=.4,CARD_CARE_WINDOW_MS=60000,CARD_CARE_MAX_PER_WINDOW=2;
  const CHAT_EVENT_WINDOW_MS=5*60*1000,DREAM_EVENT_WINDOW_MS=30*60*1000;
  const thresholds={satiety:{limit:30,type:'hungry'},energy:{limit:20,type:'tired'},mood:{limit:30,type:'low_mood'}};
  // 换场景也记进近况（不触发主动回复），这样梦角知道是谁、什么时候把它带出门或带回家的。
  const SCENE_NAMES=Object.freeze(['home','outdoor','beach','market','spring','summer','autumn','winter']);
  const kinds=new Set([...Object.keys(probabilities),...SCENE_NAMES]);
  const stamp=x=>Number.isFinite(Number(x))?Math.max(0,Math.floor(Number(x))):0;
  const label=x=>Array.from(String(x||'').trim()).slice(0,40).join('');
  const identifier=x=>String(x||'').trim().slice(0,160);
  const hasDreamName=name=>!!String(name||'').trim()&&!['TA','对方','他','她','梦角'].includes(String(name).trim());
  const cleanEvents=events=>(Array.isArray(events)?events:[]).filter(e=>e&&e.id&&kinds.has(e.type)&&['user','dream'].includes(e.actor)).slice(-20).map(e=>({id:identifier(e.id),type:e.type,actor:e.actor,timestamp:stamp(e.timestamp),dreamId:identifier(e.dreamId),dreamName:label(e.dreamName),petName:label(e.petName)}));
  function normalize(value,state={},now=0){
    const v=value&&typeof value==='object'?value:{};
    const pending=cleanEvents(v.pendingImportant?.events).slice(-3);
    return {version:1,sequence:stamp(v.sequence),events:cleanEvents(v.events),
      commandIds:(Array.isArray(v.commandIds)?v.commandIds:[]).filter(x=>typeof x==='string'&&x.length>0&&x.length<=160).slice(-20),
      lastActions:Object.fromEntries(['pet','feed','play','sleep','wake'].map(k=>[k,stamp(v.lastActions?.[k])])),
      lastDreamCareAt:stamp(v.lastDreamCareAt),sleepStartedAt:stamp(v.sleepStartedAt)||(state.isSleeping?stamp(now):0),
      scene:SCENE_NAMES.includes(v.scene)?v.scene:'home',sceneChangedAt:stamp(v.sceneChangedAt),
      observedLevel:stamp(v.observedLevel)||state.level||1,handledSequence:stamp(v.handledSequence),pendingImportant:pending.length?{events:pending,sequence:stamp(v.pendingImportant.sequence)}:null};
  }
  function observe(value,before,after,details={}){
    const now=stamp(details.timestamp),care=normalize(value,before,now),events=[];
    function add(type){if(!kinds.has(type))return;care.sequence++;const e={id:'pet_'+now+'_'+care.sequence,type,actor:details.actor==='dream'?'dream':'user',timestamp:now,dreamId:identifier(details.dreamId),dreamName:label(details.dreamName),petName:label(after.petName)};care.events.push(e);events.push(e);}
    if(details.type)add(details.type);
    if(['pet','feed','play','sleep','wake'].includes(details.type))care.lastActions[details.type]=now;
    if(details.actor==='dream'&&events.length)care.lastDreamCareAt=now;
    if(!before.isSleeping&&after.isSleeping)care.sleepStartedAt=now;
    if(before.isSleeping&&!after.isSleeping)care.sleepStartedAt=0;
    if(after.level>care.observedLevel)add('level_up');
    care.observedLevel=after.level;
    for(const [key,{limit,type}] of Object.entries(thresholds))if(before[key]>=limit&&after[key]<limit)add(type);
    care.events=care.events.slice(-20);return {care,events};
  }
  function probability(events,mode){const table=mode==='card'?cardProbabilities:probabilities;return Math.max(0,...events.map(e=>table[e.type]||0));}
  function candidates(state,care,now,mode){
    care=normalize(care,state,now);now=stamp(now);
    // 每只宠物各自计数：梦角自己动手照顾，AI 模式任意 3 分钟内最多 3 次；字卡模式放宽为任意 1 分钟内最多 2 次。
    const windowMs=mode==='card'?CARD_CARE_WINDOW_MS:DREAM_CARE_WINDOW_MS,maxPerWindow=mode==='card'?CARD_CARE_MAX_PER_WINDOW:DREAM_CARE_MAX_PER_WINDOW;
    const recentDreamCare=care.events.filter(e=>e.actor==='dream'&&['pet','feed','play','sleep','wake'].includes(e.type)&&e.timestamp<=now&&now-e.timestamp<windowMs).length;
    if(recentDreamCare>=maxPerWindow)return [];
    const allowed=k=>!care.lastActions[k]||now-care.lastActions[k]>=60000;
    const inverseSafe=k=>!care.lastActions[k]||now-care.lastActions[k]>=300000;
    if(state.isSleeping)return state.energy>=70&&now-care.sleepStartedAt>=300000&&inverseSafe('sleep')&&allowed('wake')?['wake']:[];
    const list=[];
    if(state.energy<35&&allowed('sleep')&&inverseSafe('wake'))list.push('sleep');
    if(state.satiety<70&&allowed('feed'))list.push('feed');
    if(state.energy>=25&&allowed('play'))list.push('play');
    if(allowed('pet'))list.push('pet');return list;
  }
  function choose(state,care,now,random=Math.random,options={}){const list=candidates(state,care,now,options.mode);if(!list.length||random()>=(options.chat===true&&options.mode==='card'?CARD_CHAT_CARE_CHANCE:DREAM_CARE_CHANCE))return null;if(list.includes('sleep'))return 'sleep';if(state.satiety<40&&list.includes('feed'))return 'feed';return list[Math.min(list.length-1,Math.floor(random()*list.length))];}
  // 梦角自己做过的事要记得更久（半小时），并且保证最近一次一定带上：
  // 它刚喂过饭，下一句被问到时不能一脸茫然。用户的操作仍只带几分钟内的。
  function chatEvents(all,now){
    const fresh=all.filter(e=>e.timestamp<=now&&(e.actor==='dream'?now-e.timestamp<=DREAM_EVENT_WINDOW_MS
      :now-e.timestamp<=CHAT_EVENT_WINDOW_MS&&e.type!=='pet'));
    const picked=fresh.slice(-3),lastOwn=fresh.filter(e=>e.actor==='dream').at(-1);
    if(lastOwn&&!picked.includes(lastOwn))picked.splice(0,1,lastOwn);
    return picked.sort((a,b)=>a.timestamp-b.timestamp);
  }
  function context(identity,state,care,events=[],now=Date.now(),species=''){
    if(!identity?.userId||!identity?.dreamId||!state)return null;
    // 事件触发时只带触发它的事件。普通聊天只带几分钟内的近况，且不带用户自己的摸摸：
    // 宠物是背景，不让很久以前的一次摸摸一直挂在每一轮对话里。
    const recent=events.length?events.slice(-3)
      :chatEvents(normalize(care,state).events,stamp(now));
    const kind=Array.from(String(species||'').trim()).slice(0,8).join('');
    const place=care&&SCENE_NAMES.includes(care.scene)?care.scene:'home';
    const out={version:1,userId:String(identity.userId),dreamId:String(identity.dreamId),petName:label(state.petName),...(kind?{species:kind}:{}),...(place!=='home'?{scene:place}:{}),...(care&&care.outdoorLocked===true&&place==='home'?{outdoorLocked:true}:{}),...(care&&Array.isArray(care.places)?{places:SCENE_NAMES.filter(name=>name!=='home'&&care.places.includes(name))}:{}),level:state.level,satiety:Math.round(state.satiety),mood:Math.round(state.mood),intimacy:Math.round(state.intimacy),energy:Math.round(state.energy),isSleeping:!!state.isSleeping,events:recent.map(e=>({id:label(e.id),type:e.type,actor:e.actor,timestamp:stamp(e.timestamp),dreamId:identity.dreamId,dreamName:label(e.dreamName),petName:label(e.petName)}))};
    const bytes=()=>typeof TextEncoder==='function'?new TextEncoder().encode(JSON.stringify(out)).length:unescape(encodeURIComponent(JSON.stringify(out))).length;
    while(bytes()>2048&&out.events.length)out.events.shift();
    return bytes()<=2048?out:null;
  }
  function toast(type,dreamName,petName){if(!hasDreamName(dreamName)||!petName?.trim())return '';const verbs={pet:'摸了摸',feed:'给',play:'陪',sleep:'让',wake:'把'};const tails={pet:'。',feed:'喂饭了。',play:'玩了一会儿。',sleep:'睡觉了。',wake:'叫醒了。'};return verbs[type]?dreamName+verbs[type]+petName+tails[type]:'';}
  // 换场景的提示：梦角带它出门用真实名字；用户自己带它出门用“你”。泛称的梦角名不出提示。
  function sceneToast(actor,dreamName,petName,scene){
    if(!petName||!String(petName).trim())return '';
    const who=actor==='dream'?(hasDreamName(dreamName)?dreamName:''):'你';if(!who)return '';
    const places={outdoor:'带到了户外',beach:'带到了海边',market:'带去了市集',spring:'带到了樱花河堤',summer:'带到了夏天的荷塘边',autumn:'带到了秋天的红叶林',winter:'带到了雪地里的小木屋前'};
    return places[scene]?who+'把'+petName+places[scene]+'。':who+'带'+petName+'回家了。';
  }
  // 梦角偶尔会带宠物换个地方：宠物醒着、距离上次换场景满 5 分钟时，每次有动静抽一次。
  const SCENE_CHANGE_CHANCE=.08,SCENE_CHANGE_GAP_MS=300000;
  function chooseScene(state,care,now,random=Math.random,places=['outdoor']){
    care=normalize(care,state,now);now=stamp(now);
    if(!state||state.isSleeping||(care.sceneChangedAt&&now-care.sceneChangedAt<SCENE_CHANGE_GAP_MS))return null;
    if(random()>=SCENE_CHANGE_CHANCE)return null;
    if(care.scene!=='home')return 'home';
    // 在家时从已解锁的去处里挑一个；只有一个可去时不再多抽一次。
    const list=(Array.isArray(places)?places:[]).filter(name=>name!=='home'&&SCENE_NAMES.includes(name));
    return list.length?list[list.length>1?Math.min(list.length-1,Math.floor(random()*list.length)):0]:null;
  }
  const terms={pet:/摸|乖|黏|亲近|陪着/,feed:/吃|饿|饭|饱|食/,play:/玩|开心|活泼|跑/,sleep:/睡|休息|困|累|晚安/,wake:/醒|早安|精神/,adopt:/一起|照顾|欢迎|陪伴|名字/,level_up:/长大|成长|厉害|进步/,hungry:/饿|吃|饭|食/,tired:/累|困|休息|睡/,low_mood:/安慰|陪|难过|开心|抱/};
  function cardCandidates(cards,ctx={}){const pool=(Array.isArray(cards)?cards:[]).filter(s=>typeof s==='string'&&s.trim());const keys=(ctx.events||[]).map(e=>e.type);if(ctx.isSleeping)keys.push('sleep');if(ctx.energy<20)keys.push('tired');if(ctx.satiety<30)keys.push('hungry');if(ctx.mood<30)keys.push('low_mood');const matches=pool.filter(s=>keys.some(k=>terms[k]?.test(s)));return matches.length?matches:pool;}
  return Object.freeze({probabilities,cardProbabilities,normalize,observe,probability,SCENE_NAMES,candidates,choose,chooseScene,sceneToast,context,toast,cardCandidates,hasDreamName});
});
