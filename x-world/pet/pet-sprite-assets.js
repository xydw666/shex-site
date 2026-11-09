(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SHEXPetSpriteAssets=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  // 已审核的项圈小狗：1254 原图。bounds 包含吊牌，anchor 单独标记睡觉时的爪子落点。
  const FRAMES=Object.freeze({
  "idle": {
    "file": "pet_dog_idle.png",
    "state": "idle",
    "width": 1254,
    "height": 1254,
    "bounds": {
      "x": 266,
      "y": 253,
      "width": 722,
      "height": 822
    }
  },
  "happy": {
    "file": "pet_dog_happy.png",
    "state": "happy",
    "width": 1254,
    "height": 1254,
    "bounds": {
      "x": 248,
      "y": 252,
      "width": 732,
      "height": 824
    }
  },
  "pet": {
    "file": "pet_dog_petting.png",
    "state": "petting",
    "width": 1254,
    "height": 1254,
    "bounds": {
      "x": 288,
      "y": 269,
      "width": 703,
      "height": 813
    }
  },
  "feed": {
    "file": "pet_dog_eating.png",
    "scale": 0.875,
    "state": "eating",
    "width": 1254,
    "height": 1254,
    "bounds": {
      "x": 172,
      "y": 469,
      "width": 937,
      "height": 538
    }
  },
  "play": {
    "file": "pet_dog_playing.png",
    "state": "playing",
    "scale": 0.973,
    "width": 1254,
    "height": 1254,
    "bounds": {
      "x": 248,
      "y": 208,
      "width": 734,
      "height": 871
    }
  },
  "sleeping": {
    "file": "pet_dog_sleeping.png",
    "state": "sleeping",
    "scale": 0.84,
    "anchor": {"x": 651, "y": 1022},
    "width": 1254,
    "height": 1254,
    "bounds": {
      "x": 159,
      "y": 507,
      "width": 984,
      "height": 524
    }
  },
  "hungry": {
    "file": "pet_dog_hungry.png",
    "state": "hungry",
    "width": 1254,
    "height": 1254,
    "bounds": {
      "x": 264,
      "y": 253,
      "width": 726,
      "height": 822
    }
  },
  "sad": {
    "file": "pet_dog_low_mood.png",
    "state": "low_mood",
    "width": 1254,
    "height": 1254,
    "bounds": {
      "x": 267,
      "y": 302,
      "width": 739,
      "height": 776
    }
  }
});
  // 可以切换的小宠形象。level 是解锁等级（管理员不受限制）；scale 让不同动物在房间里大小协调；
  // 特色配件资源为 627×627 透明 PNG。每只的 idle 大小不变；分动作 scale 校正吃饭、睡觉等横向姿势，避免突然变大。
  // bounds 保留审核占位，用来对齐脚底和点击区域；不参与跨宠物体型拉齐。
  const SPECIES_LIST=Object.freeze({
    dog:{key:'dog',label:'小狗',name:'小狗',level:0,folder:'xiaonuo-v3-collar/',scale:1,frames:FRAMES},
    cat:{key:'cat',label:'布偶猫',name:'布偶猫',level:5,folder:'cat-v2-signature/',scale:1.0,frames:{
      "idle":{file:"pet_cat_idle.png",state:"idle",width:627,height:627,bounds:{x:124,y:133,width:402,height:402}},
      "happy":{file:"pet_cat_happy.png",state:"happy",width:627,height:627,bounds:{x:127,y:131,width:403,height:415}},
      "pet":{file:"pet_cat_petting.png",state:"petting",width:627,height:627,bounds:{x:152,y:141,width:374,height:408}},
      "feed":{file:"pet_cat_eating.png",state:"eating",scale:0.84375,width:627,height:627,bounds:{x:98,y:241,width:494,height:279}},
      "play":{file:"pet_cat_playing.png",state:"playing",width:627,height:627,bounds:{x:154,y:144,width:343,height:415}},
      "sleeping":{file:"pet_cat_sleeping.png",state:"sleeping",scale:0.75,width:627,height:627,bounds:{x:54,y:237,width:543,height:263}},
      "hungry":{file:"pet_cat_hungry.png",state:"hungry",width:627,height:627,bounds:{x:136,y:122,width:395,height:419}},
      "sad":{file:"pet_cat_low_mood.png",state:"low_mood",width:627,height:627,bounds:{x:147,y:165,width:378,height:373}}
    }},
    rabbit:{key:'rabbit',label:'小兔子',name:'小兔子',level:10,folder:'rabbit-v2-signature/',scale:0.92,frames:{
      "idle":{file:"pet_rabbit_idle.png",state:"idle",width:627,height:627,bounds:{x:82,y:94,width:464,height:463}},
      "happy":{file:"pet_rabbit_happy.png",state:"happy",width:627,height:627,bounds:{x:73,y:108,width:489,height:451}},
      "pet":{file:"pet_rabbit_petting.png",state:"petting",width:627,height:627,bounds:{x:92,y:122,width:437,height:431}},
      "feed":{file:"pet_rabbit_eating.png",state:"eating",width:627,height:627,bounds:{x:88,y:243,width:453,height:222}},
      "play":{file:"pet_rabbit_playing.png",state:"playing",width:627,height:627,bounds:{x:86,y:109,width:458,height:456}},
      "sleeping":{file:"pet_rabbit_sleeping.png",state:"sleeping",scale:0.78125,width:627,height:627,bounds:{x:40,y:254,width:545,height:230}},
      "hungry":{file:"pet_rabbit_hungry.png",state:"hungry",width:627,height:627,bounds:{x:83,y:100,width:454,height:458}},
      "sad":{file:"pet_rabbit_low_mood.png",state:"low_mood",width:627,height:627,bounds:{x:84,y:118,width:459,height:442}}
    }},
    capybara:{key:'capybara',label:'卡皮巴拉',name:'卡皮巴拉',level:20,folder:'capybara-v2-signature/',scale:0.95,frames:{
      "idle":{file:"pet_capybara_idle.png",state:"idle",scale:1.15,width:627,height:627,bounds:{x:120,y:195,width:398,height:308}},
      "happy":{file:"pet_capybara_happy.png",state:"happy",scale:1.15,width:627,height:627,bounds:{x:120,y:195,width:398,height:308}},
      "pet":{file:"pet_capybara_petting.png",state:"petting",scale:1.15,width:627,height:627,bounds:{x:110,y:198,width:422,height:321}},
      "feed":{file:"pet_capybara_eating.png",state:"eating",width:627,height:627,bounds:{x:78,y:212,width:492,height:298}},
      "play":{file:"pet_capybara_playing.png",state:"playing",scale:1.03125,width:627,height:627,bounds:{x:103,y:155,width:443,height:383}},
      "sleeping":{file:"pet_capybara_sleeping.png",state:"sleeping",scale:0.9,width:627,height:627,bounds:{x:66,y:281,width:512,height:215}},
      "hungry":{file:"pet_capybara_hungry.png",state:"hungry",scale:1.15,width:627,height:627,bounds:{x:131,y:272,width:378,height:303}},
      "sad":{file:"pet_capybara_low_mood.png",state:"low_mood",scale:1.15,width:627,height:627,bounds:{x:133,y:280,width:376,height:280}}
    }},
    hamster:{key:'hamster',label:'小仓鼠',name:'小仓鼠',level:30,folder:'hamster-v2-signature/',scale:0.8,frames:{
      "idle":{file:"pet_hamster_idle.png",state:"idle",width:627,height:627,bounds:{x:114,y:110,width:394,height:439}},
      "happy":{file:"pet_hamster_happy.png",state:"happy",width:627,height:627,bounds:{x:117,y:121,width:378,height:426}},
      "pet":{file:"pet_hamster_petting.png",state:"petting",width:627,height:627,bounds:{x:140,y:122,width:339,height:421}},
      "feed":{file:"pet_hamster_eating.png",state:"eating",scale:0.734375,width:627,height:627,bounds:{x:88,y:227,width:475,height:277}},
      "play":{file:"pet_hamster_playing.png",state:"playing",scale:0.890625,width:627,height:627,bounds:{x:150,y:134,width:304,height:390}},
      "sleeping":{file:"pet_hamster_sleeping.png",state:"sleeping",scale:0.6875,width:627,height:627,bounds:{x:70,y:262,width:501,height:255}},
      "hungry":{file:"pet_hamster_hungry.png",state:"hungry",width:627,height:627,bounds:{x:114,y:106,width:384,height:447}},
      "sad":{file:"pet_hamster_low_mood.png",state:"low_mood",width:627,height:627,bounds:{x:113,y:123,width:385,height:425}}
    }},
    crow:{key:'crow',label:'小乌鸦',name:'小乌鸦',level:40,folder:'crow-v2-signature/',scale:0.9,frames:{
      "idle":{file:"pet_crow_idle.png",state:"idle",width:627,height:627,bounds:{x:152,y:149,width:321,height:400}},
      "happy":{file:"pet_crow_happy.png",state:"happy",width:627,height:627,bounds:{x:155,y:138,width:314,height:411}},
      "pet":{file:"pet_crow_petting.png",state:"petting",width:627,height:627,bounds:{x:151,y:162,width:325,height:388}},
      "feed":{file:"pet_crow_eating.png",state:"eating",width:627,height:627,bounds:{x:113,y:333,width:402,height:227}},
      "play":{file:"pet_crow_playing.png",state:"playing",width:627,height:627,bounds:{x:142,y:132,width:372,height:373}},
      "sleeping":{file:"pet_crow_sleeping.png",state:"sleeping",width:627,height:627,bounds:{x:115,y:258,width:393,height:256}},
      "hungry":{file:"pet_crow_hungry.png",state:"hungry",width:627,height:627,bounds:{x:151,y:161,width:325,height:387}},
      "sad":{file:"pet_crow_low_mood.png",state:"low_mood",width:627,height:627,bounds:{x:166,y:159,width:311,height:406}}
    }}
  });
  const SPECIES_KEYS=Object.freeze(Object.keys(SPECIES_LIST));
  function createStore(env,base,frames=FRAMES,options={}){
    const entries=new Map(),total=Object.keys(frames).length,scale=Number(options.scale)||1;let started=false,loaded=0,failed=0;
    function load(){
      if(started||!env?.Image)return;
      started=true;
      for(const [mode,frame] of Object.entries(frames)){
        const image=new env.Image(),entry={...frame,image,loaded:false,finished:false};
        entries.set(mode,entry);
        const finish=ok=>{
          if(entry.finished)return;
          entry.finished=true;entry.loaded=ok;
          image.onload=null;image.onerror=null;
          if(ok)loaded++;else failed++;
        };
        image.onload=()=>finish(image.naturalWidth===frame.width&&image.naturalHeight===frame.height);
        image.onerror=()=>finish(false);
        image.src=base+frame.file;
      }
    }
    function get(mode){
      load();
      const wanted=entries.get(mode)||entries.get('idle'),fallback=entries.get('idle');
      const entry=wanted?.loaded?wanted:fallback?.loaded?fallback:null;
      return entry?{image:entry.image,state:entry.state,bounds:entry.bounds,anchor:entry.anchor,width:entry.width,height:entry.height,
        scale:Number(entry.scale)>0?Number(entry.scale):scale}:null;
    }
    function status(){return{ready:loaded===total,loaded,failed,total};}
    return Object.freeze({load,get,status});
  }

  function createLayer(canvas){
    const host=canvas.parentElement,doc=canvas.ownerDocument;
    const layer=doc.createElement('div');
    layer.className='pet-art-layer';layer.hidden=true;
    layer.setAttribute('aria-hidden','true');host.appendChild(layer);
    let current=null;
    return Object.freeze({
      show(frame){
        if(current!==frame.image){
          current=frame.image;current.setAttribute('data-pet-art',frame.state);
          current.alt='';current.draggable=false;layer.replaceChildren(current);
        }
        layer.style.left=frame.x/192*100+'%';layer.style.top=frame.y/320*100+'%';
        layer.style.width=frame.width/192*100+'%';layer.style.height=frame.height/320*100+'%';
        layer.hidden=false;
      },
      hide(){layer.hidden=true;}
    });
  }
  const script=root.document?.currentScript?.src;
  const assetsBase=script?new URL('./assets/',script).href:'./x-world/pet/assets/';
  const stores=new Map();
  function normalizeSpecies(key){return Object.prototype.hasOwnProperty.call(SPECIES_LIST,key)?key:'dog';}
  function storeFor(key){
    const species=SPECIES_LIST[normalizeSpecies(key)];
    if(!stores.has(species.key))stores.set(species.key,createStore(root,assetsBase+species.folder,species.frames,{scale:species.scale}));
    return stores.get(species.key);
  }
  function idleUrl(key){const species=SPECIES_LIST[normalizeSpecies(key)];return assetsBase+species.folder+species.frames.idle.file;}
  // 房间里正在画的是哪一只：每只宠物的存档里记着自己的形象，进房间时由 pet-app 设置。
  let active='dog';
  function setSpecies(key){active=normalizeSpecies(key);storeFor(active).load();return active;}
  const store=Object.freeze({load:()=>storeFor(active).load(),get:mode=>storeFor(active).get(mode),status:()=>storeFor(active).status()});
  // AI 读到的品类名称跟着当前形象变化。
  function speciesName(key=active){return SPECIES_LIST[normalizeSpecies(key)].name;}
  return Object.freeze({FRAMES,SPECIES_LIST,SPECIES_KEYS,get SPECIES(){return speciesName();},speciesName,normalizeSpecies,setSpecies,
    activeSpecies:()=>active,idleUrl,createStore,createLayer,store,status:store.status});
});
