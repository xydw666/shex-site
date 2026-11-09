(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SHEXPlayRequest=api;})(typeof window!=='undefined'?window:globalThis,function(root){
 'use strict';
 function createClock(now=Date.now){let offset=0;return Object.freeze({now:()=>now()+offset,adopt:serverNow=>{if(Number.isFinite(serverNow))offset=serverNow-now();}});}
 async function call(request,caller){if(caller)return caller(request);const bridge=root.SHEXCloudBaseClient;if(!bridge?.run)throw Object.assign(new Error('连接尚未就绪，请稍后重试'),{code:'PLAY_CONNECTION'});return bridge.run(api=>api.app.callFunction(request),{retryAuthOnce:false});}
 return Object.freeze({createClock,call});
});
