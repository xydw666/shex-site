(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SHEXGameInvites=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function create(options){
    var cached=null,pending=null,owner='',revision=0;
    var now=options.now||Date.now;
    function current(){var value=options.current();return value&&value.userId&&value.dreamId&&value.sessionToken&&['single','private_single','gallery_single','dream'].indexOf(value.kind)>=0?value:null;}
    function scope(value){return JSON.stringify([value.userId,value.dreamId,value.sessionToken]);}
    function alive(value){var live=current();return !!live&&scope(live)===scope(value);}
    async function resolve(force){
      var who=current();if(!who)return null;
      var key=scope(who);
      if(owner!==key){owner=key;cached=null;pending=null;revision++;}
      if(!force&&cached&&now()-cached.at<300000)return cached.value;
      if(pending&&!force)return pending;
      var version=++revision;
      var work=(async function(){
        var timer;
        try{
          var response=await Promise.race([
            options.request({name:'shexCharacterAI',data:{action:'play.ludo.v3.state',userId:who.userId,dreamId:who.dreamId,sessionToken:who.sessionToken}}),
            new Promise(function(_,reject){timer=setTimeout(function(){reject(new Error('游戏状态读取超时'));},3500);})
          ]);
          if(!alive(who)||owner!==key||revision!==version)return null;
          var value=response&&response.result||response;
          if(!value||!value.ok||String(value.dreamId)!==String(who.dreamId))return null;
          var levels=value.active?[]:(Array.isArray(value.levels)?value.levels:[]).filter(function(item){return item&&/^\d{1,2}-[1-6]$/.test(item.id)&&['open','cleared'].indexOf(item.status)>=0;}).map(function(item){return {id:item.id,title:String(item.title||('第 '+item.id+' 关')).slice(0,60),status:item.status};});
          var result={choice:true,levels:levels};cached={at:now(),value:result};return result;
        }finally{clearTimeout(timer);}
      })();
      pending=work;
      try{return await work;}finally{if(pending===work)pending=null;}
    }
    async function accept(data,stillValid){
      var valid=typeof stillValid==='function'?stillValid:function(){return true;};
      var who=current();if(!who||!data||!valid())return false;
      if(data.game==='choice')return options.open('choice',{origin:'chat',dreamId:String(who.dreamId)})!==false;
      if(data.game!=='ludo'||!/^\d{1,2}-[1-6]$/.test(data.levelId||''))return false;
      try{
        var games=await resolve(true);
        if(!alive(who)||!valid()||!games||!games.levels.some(function(level){return level.id===data.levelId;}))return false;
        return options.open('ludo',{origin:'chat',dreamId:String(who.dreamId),levelId:data.levelId})!==false;
      }catch(_){return false;}
    }
    return Object.freeze({resolve:resolve,accept:accept});
  }
  return Object.freeze({create:create});
});
