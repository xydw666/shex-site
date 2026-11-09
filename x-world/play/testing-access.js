(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SHEXPlayTestingAccess=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // This grants game testing only. Callers on the server must validate the session first.
  var testers=['shex_bd187c0e-0cfa-4fb2-8dac-a2c89667733a'];
  function isTester(user,platformAdmin){
    var id=typeof user==='string'?user:user&&user.userId;
    return platformAdmin===true||testers.indexOf(String(id||'').trim())>=0;
  }
  return Object.freeze({isTester:isTester});
});
