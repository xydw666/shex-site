((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXXLettersStationery = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';
  const art = (file, width, height, crop) => Object.freeze({file, width, height, ...(crop ? {crop:Object.freeze(crop)} : {})});
  // Viewport crops retain the supplied collage pixels; no generated/redrawn artwork.
  const blueCat = (crop) => art('blue-cat-set.webp',1536,1024,crop);
  const blueCoast = (crop) => art('blue-coast-set.webp',1536,1024,crop);
  const blueChair = (crop) => art('blue-chair-set.webp',1536,1024,crop);
  const papers = [
    {id:'paper-default-1',name:'植物书信'},
    {id:'paper-cream',name:'米白信笺',art:art('paper-cream.webp',1122,1402),thumb:art('paper-cream-thumb.webp',180,225)},
    {id:'paper-default-2',name:'月夜星笺',retired:true,artwork:'moon',image:'./x-world/x-letters/paper-moon.webp'},
    {id:'paper-default-3',name:'蔷薇旧笺',retired:true,artwork:'rose',image:'./x-world/x-letters/paper-rose.webp'},
    {id:'paper-default-4',name:'蓝色来信',artwork:'letter-blue',image:'./x-world/x-letters/stationery/paper-letter-blue-v2.webp',art:art('paper-letter-blue-v2.webp',1122,1402),thumb:art('paper-letter-blue-v2-thumb.webp',180,225)},
    {id:'paper-green-hand',name:'青草手写',family:'green',art:art('paper-green-hand.webp',1055,1491)},
    {id:'paper-blue-hand',name:'蓝色手绘',family:'blue',art:art('paper-blue-hand.webp',1040,1513)},
    {id:'paper-minimal',name:'黑白极简',family:'minimal',art:art('paper-minimal.webp',1055,1491)},
    {id:'paper-landscape',name:'山河可期',family:'loose',art:art('paper-landscape.webp',1055,1491)},
    {id:'paper-pear',name:'梨花慢日',family:'loose',art:art('paper-pear.webp',1122,1402)}
  ].map(item => Object.freeze(item.art ? {...item,artwork:item.id,image:`./x-world/x-letters/stationery/${item.art.file}`} : item));
  const defaultCoverArt = art('cover-green-gingham.webp',1115,1410,[130,103,859,1221]);
  const covers = [
    // Keep the saved default ID: existing default books and new books use the same supplied binding.
    {id:'cover-default-1',name:'格纹书册',color:'#294332',art:defaultCoverArt},
    // Historical records may use the second botanical ID. It is now an alias,
    // not another selectable cover; no historical data rewrite is necessary.
    {id:'cover-default-2',retired:true,replacementId:'cover-default-1',color:'#294332',art:defaultCoverArt},
    // Replace the old LETTER BOOK art under its saved ID; no migration or duplicate choice.
    {id:'cover-default-3',binding:'linen',color:'#263e50',art:art('cover-navy-collage.webp',1024,1536,[18,15,987,1507])},
    {id:'cover-linen-blue',binding:'linen',color:'#476782',art:art('cover-linen-blue.webp',1024,1536,[27,48,967,1435])},
    // Temporarily hidden bindings remain available to render historical selections.
    {id:'cover-green-hand',retired:true,name:'青草手写',family:'green',color:'#bec8b6',art:art('cover-green-hand.webp',1024,1536)},
    {id:'cover-blue-cat',retired:true,name:'蓝色手绘 · 猫与书',family:'blue',color:'#d9e1e8',art:blueCat([12,72,506,902])},
    {id:'cover-blue-coast',retired:true,name:'蓝色手绘 · 海岸',family:'blue',color:'#d9e1e8',art:blueCoast([14,20,596,974])},
    {id:'cover-blue-chair',name:'蓝色手绘 · 午后',retired:true,family:'blue',color:'#d9e1e8',art:blueChair([16,96,478,858])},
    {id:'cover-minimal',name:'黑白极简',family:'minimal',color:'#d9d8d3',art:art('cover-minimal.webp',1024,1536,[50,98,922,1360])},
    // Supplied linen bindings: crop the studio background in the viewport, preserving original pixels.
    // Binding-only additions deliberately have no stationery style set or visible style names.
    {id:'cover-linen-teal',binding:'linen',color:'#214d50',art:art('cover-linen-teal.webp',1024,1536,[43,94,939,1342])},
    {id:'cover-linen-mauve',binding:'linen',color:'#76515e',art:art('cover-linen-mauve.webp',1024,1536,[44,79,939,1371])},
    {id:'cover-linen-gold',binding:'linen',color:'#aa7b21',art:art('cover-linen-gold.webp',1024,1536,[36,13,952,1508])},
    {id:'cover-linen-rose',binding:'linen',color:'#7d2e29',art:art('cover-linen-rose.webp',1122,1402,[43,9,1039,1378])},
    {id:'cover-linen-navy',binding:'linen',color:'#203448',art:art('cover-linen-navy.webp',1024,1536,[27,47,967,1440])}
  ].map(Object.freeze);
  const seals = [
    {id:'botanical-round',name:'植物圆章'}, {id:'plain-round',name:'简洁圆章'},
    {id:'good-letters',name:'蓝色邮戳',image:'./x-world/x-letters/seal-good-letters.webp'},
    {id:'green-tulip-paper',name:'青草 · 郁金香',family:'green',art:art('seal-green-paper.webp',1304,1206)},
    {id:'green-tulip-ink',name:'郁金香邮戳',family:'loose',art:art('seal-green-ink.webp',1269,1240)},
    {id:'green-flower',name:'白花邮戳',family:'loose',art:art('seal-green-flower.webp',1308,1203)},
    {id:'blue-dove',name:'蓝绘 · 信鸽',family:'blue',art:blueCat([1178,258,340,509])},
    {id:'blue-moon',name:'蓝绘 · 月夜',family:'blue',art:blueCoast([1198,292,309,440])},
    {id:'blue-daisy',name:'蓝绘 · 雏菊',family:'blue',art:blueChair([1166,320,345,408])},
    {id:'minimal-postage',name:'极简 · 飞燕',family:'minimal',art:art('seal-minimal.webp',1263,1246)}
  ].map(Object.freeze);
  const envelopes = [
    {id:'ivory',name:'米白'}, {id:'moss',name:'苔绿'}, {id:'apricot',name:'淡杏'}, {id:'rose',name:'灰粉'}, {id:'letter-blue',name:'蓝色来信'},
    {id:'green-hand',name:'青草手写',family:'green',art:art('envelope-green-hand.webp',1774,887,[12,2,1750,873]),address:[45,25,74],stamp:[50,54]},
    {id:'blue-cat',name:'蓝色手绘 · 猫与书',family:'blue',art:blueCat([556,318,579,403]),address:[28,20,74],stamp:[50,62]},
    {id:'blue-coast',name:'蓝色手绘 · 海岸',family:'blue',art:blueCoast([658,42,480,916]),turn:-90,address:[28,24,78],stamp:[46,56]},
    {id:'blue-chair',name:'蓝色手绘 · 午后',family:'blue',art:blueChair([524,338,602,386]),address:[28,24,65],stamp:[50,62]},
    {id:'minimal',name:'黑白极简',family:'minimal',art:art('envelope-minimal.webp',1563,1006,[36,100,1490,827]),address:[39,25,77],stamp:[50,59]}
  ].map(Object.freeze);
  const styleSets = Object.freeze({
    'cover-default-3':{paper:'paper-default-4',seal:'good-letters',envelope:'letter-blue'},
    // green-hand, blue-cat and blue-coast envelopes now stand alone, without cover presets.
    'cover-blue-chair':{paper:'paper-blue-hand',seal:'blue-daisy',envelope:'blue-chair'},
    'cover-minimal':{paper:'paper-minimal',seal:'minimal-postage',envelope:'minimal'}
  });
  const url = value => `./x-world/x-letters/stationery/${value.file}`;
  function background(value) {
    const [x,y,w,h] = value.crop || [0,0,value.width,value.height];
    const crop = Boolean(value.crop);
    // A var() URL resolves against x-letter.css, unlike an <img> URL at index.html.
    return `--stationery-image:url('./stationery/${value.file}');--stationery-size:${crop ? `${value.width/w*100}% ${value.height/h*100}%` : 'contain'};--stationery-position:${crop ? `${value.width===w?50:x/(value.width-w)*100}% ${value.height===h?50:y/(value.height-h)*100}%` : 'center'}`;
  }
  function envelopeStyle(id) {
    const item = envelopes.find(item=>item.id===id);
    if (!item?.art) return '';
    const [, , w,h] = item.art.crop || [0,0,item.art.width,item.art.height];
    return `${background(item.art)};--envelope-ratio:${item.turn ? h/w : w/h};--address-left:${item.address[0]}%;--address-right:${item.address[1]}%;--address-top:${item.address[2]}%;--stamp-left:${item.stamp[0]}%;--stamp-top:${item.stamp[1]}%`;
  }
  const firstBook=Object.freeze({
    covers:Object.freeze(['cover-default-1','cover-default-3','cover-linen-blue']),
    papers:Object.freeze(['paper-default-1','paper-cream','paper-default-4','paper-green-hand','paper-blue-hand']),
    seals:Object.freeze(seals.slice(0,6).map(item=>item.id)),
    envelopes:Object.freeze(envelopes.slice(0,6).map(item=>item.id))
  });
  const KINDS=Object.freeze(['papers','seals','envelopes','covers']);
  const catalog={papers,seals,envelopes,covers};
  const canonicalId=(kind,id)=>kind==='covers'?(covers.find(item=>item.id===id)?.replacementId||id):id;
  // Selectable items in picker order; everything after the first book unlocks one by one.
  const choices=Object.freeze(Object.fromEntries(KINDS.map(kind=>[kind,Object.freeze(catalog[kind].filter(item=>!item.retired).map(item=>item.id))])));
  const lockable=Object.freeze(Object.fromEntries(KINDS.map(kind=>[kind,Object.freeze(choices[kind].filter(id=>!firstBook[kind].includes(id)))])));
  const MONTH_OFFSET=8*60*60*1000;
  const monthKey=time=>{const d=new Date(time+MONTH_OFFSET);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;};
  // Number of lockable items unlocked for a kind, now or (for received letters) at a past moment.
  // Natural unlock: one per kind for each month the user actually came back; plus each paid early unlock.
  // 管理员和指定账号：信纸、邮章、信封、书皮全部直接可用，不走按月解锁，也不需要 X能量。其他账号照常。
  const FULL_UNLOCK_USER_IDS=Object.freeze(['shex_bd187c0e-0cfa-4fb2-8dac-a2c89667733a']);
  function fullUnlock(){
    try{const auth=globalThis.SHEXAuth;if(auth?.isAdmin?.()===true)return true;return FULL_UNLOCK_USER_IDS.includes(String(auth?.current?.()?.userId||''));}catch(_){return false;}
  }
  function unlockedCount(kind,state,at){
    if(fullUnlock())return Infinity;
    const unlock=state?.stationeryUnlock;
    if(!state?.monthlyReady||unlock?.stage===2)return Infinity;
    if(unlock?.version!==2)return 0;
    // 自然解锁：只有真正来过的月份各领一次（由后台记录），没来的月份不会累积。
    const past=Number.isFinite(at)&&at>0;
    const natural=(Array.isArray(unlock.natural)?unlock.natural:[]).filter(item=>!past||item?.at<=at).length;
    const early=(unlock.early||[]).filter(item=>item?.kind===kind&&(!(Number.isFinite(at)&&at>0)||item.at<=at)).length;
    return natural+early;
  }
  function unlocked(kind,id,state,at){
    const canonical=canonicalId(kind,id);
    if(firstBook[kind]?.includes(canonical))return true;
    const index=lockable[kind]?.indexOf(canonical)??-1,count=unlockedCount(kind,state,at);
    return index<0?count===Infinity:index<count;
  }
  // '' when usable; 'next' for the first locked item of a kind (下个月解锁, can be bought early); otherwise 'pending' (待解锁).
  function lockState(kind,id,state){
    if(unlocked(kind,id,state))return '';
    const unlock=state?.stationeryUnlock,count=unlockedCount(kind,state);
    return unlock?.version===2&&lockable[kind]?.indexOf(canonicalId(kind,id))===count?'next':'pending';
  }
  const hash=value=>{let h=2166136261;for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;};
  // A received letter keeps one stable look: random per letter, drawn only from items unlocked when it arrived.
  function receivedLook(paper,state){
    const at=paper?.sentAt||paper?.visibilityAt||paper?.createdAt;
    const pick=kind=>{const pool=choices[kind].filter(id=>unlocked(kind,id,state,at));return pool[hash(`${paper?.paperId||''}:${kind}`)%pool.length]||choices[kind][0];};
    return Object.freeze({paper:pick('papers'),seal:pick('seals'),envelope:pick('envelopes')});
  }
  return Object.freeze({papers:Object.freeze(papers),covers:Object.freeze(covers),seals:Object.freeze(seals),envelopes:Object.freeze(envelopes),styleSets,firstBook,choices,lockable,FULL_UNLOCK_USER_IDS,unlocked,unlockedCount,lockState,receivedLook,monthKey,url,background,envelopeStyle});
});
