(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SHEXPlayChoiceFlow=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function create(client,onChange=()=>{}){
  let state={screen:'closed',busy:false,result:null,error:null,revealIndex:0,requiredCost:null},generation=0;
  const update=patch=>{state={...state,...patch};onChange({...state});};
  function ready(){const row=client.progress();return row?.status==='ready'?(row.userPicks?.length===10?'submit':'question'):'cover';}
  async function task(screen,fn,success){if(state.busy)return;const token=generation;update({busy:true,error:null});try{const value=await fn();if(token!==generation)return;success(value);}catch(error){if(token===generation)update({screen,error,requiredCost:error.code==='PLAY_PRICE_CHANGED'?error.requiredCost:null});}finally{if(token===generation)update({busy:false});}}
  async function enter(route){generation++;update({screen:route==='hall'?'hall':'cover',busy:false,result:null,error:null,requiredCost:null});if(route==='hall')return;await task('cover',()=>client.restore(),()=>{const result=client.result();update(result?{screen:'reveal',result,revealIndex:0}:{screen:ready()});});}
  async function start(cost){await task('cover',()=>client.start(cost),()=>{const result=client.result();update(result?{screen:'reveal',result,revealIndex:0}:{screen:ready()});});}
  function pick(value){if(state.busy||state.screen!=='question')return;client.pick(value);update({screen:ready()});}
  async function finish(cost){await task('submit',()=>client.finish(cost),result=>update({screen:'reveal',result,revealIndex:0,requiredCost:null}));}
  function nextReveal(){if(state.screen!=='reveal')return;const next=state.revealIndex+1;update(next>=10?{screen:'result'}:{revealIndex:next});}
  function leave(){generation++;update({screen:'closed',busy:false,result:null,error:null});}
  return{enter,start,pick,finish,nextReveal,leave,current:()=>({...state})};
 }
 return Object.freeze({create});
});
