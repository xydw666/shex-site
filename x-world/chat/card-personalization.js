(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SHEXCardPersonalization=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  // Only add the configured address and punctuation; this module never supplies card prose.
  function apply(text,options={}){
    const line=String(text||'').trim(),name=String(options.name||'').trim().slice(0,40);
    if(!line||!name||name==='你'||line.includes(name)||/(老婆|老公|宝宝|宝贝|亲爱的|小朋友|小呆瓜|乖乖|小祖宗)/.test(line))return line;
    const recent=(Array.isArray(options.recent)?options.recent:[]).filter(m=>m?.role==='ta').slice(-3);
    if(recent.some(m=>String(m.text||m.content||'').includes(name)))return line;
    const random=typeof options.random==='function'?options.random:Math.random;
    const rate=Number.isFinite(options.rate)?Math.max(0,Math.min(1,options.rate)):.2;
    if(random()>=rate)return line;
    const ending=line.match(/[。！？!?]+$/)?.[0]||'';
    const choices=[name+'，'+line,(ending?line.slice(0,-ending.length):line)+'，'+name+ending];
    const boundary=line.search(/[，,。；;！!？?]/);
    if(boundary>0&&boundary<line.length-1)choices.push(line.slice(0,boundary+1)+name+'，'+line.slice(boundary+1));
    return choices[Math.min(choices.length-1,Math.max(0,Math.floor(random()*choices.length)))];
  }
  return Object.freeze({apply});
});
