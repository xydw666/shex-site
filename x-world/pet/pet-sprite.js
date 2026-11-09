(function(root,factory){
  'use strict';
  const assets=typeof module==='object'&&module.exports?require('./pet-sprite-assets.js'):root.SHEXPetSpriteAssets;
  const api=factory(assets);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SHEXPetSprite=api;
})(typeof window!=='undefined'?window:globalThis,function(assets){
  'use strict';
  const WIDTH=1254,HEIGHT=1254,DISPLAY_SIZE=64;
  function createIdle(random = Math.random) {
    const between = (min, max) => min + random() * (max - min);
    let nextBlink = between(3000, 7000), blinkStart = -Infinity;
    let nextGesture = between(9000, 18000), gestureStart = 0, gestureUntil = 0, gestureKind = '';
    return {
      sample(elapsed, mode = 'idle') {
        if (elapsed >= nextBlink) {
          blinkStart = elapsed;
          nextBlink = elapsed + 180 + (mode === 'sad' ? between(4500, 9000) : between(3000, 7000));
        }
        if (elapsed >= nextGesture) {
          gestureKind = random() < 0.4 ? 'ear' : 'tail';
          gestureStart = elapsed; gestureUntil = elapsed + 650;
          nextGesture = gestureUntil + (mode === 'happy' ? between(2500, 6000)
            : mode === 'sad' ? between(16000, 24000) : between(9000, 18000));
        }
        const age = elapsed - blinkStart;
        const blink = age >= 0 && age < 180 ? age < 40 || age >= 140 ? 1 : 2 : 0;
        const gesture = elapsed < gestureUntil ? gestureKind : '';
        const frame = Math.floor((elapsed - gestureStart) / 170) % 4;
        return {rise: Math.sin(elapsed * Math.PI / 2800) > 0.72 ? 1 : 0,
          blink, closed: blink === 2, gesture, tail: gesture === 'tail' ? [0, 1, 0, -1][frame] : 0};
      }
    };
  }


  // Approved single-frame PNG poses. The idle clock is retained for light motion;
  // blink/ear keyframes can be added later without altering the state system.
  function createPainter(store){
    return function draw(ctx,centerX,feetY,pose={}){
      const requested=pose.mode||'idle',frame=store.get(requested);
      const actual=frame?.state||'idle',sleeping=actual==='sleeping';
      const rise=Math.round(pose.rise||0),nod=requested==='feed'?Math.round(pose.nod||0):0;
      const size=Math.round(DISPLAY_SIZE*(frame?.scale||1)),b=frame?.bounds||{x:0,y:0,width:1254,height:1254},scale=size/(frame?.width||WIDTH);
      const anchor=frame?.anchor||{x:b.x+b.width/2,y:b.y+b.height};
      const x=Math.round(centerX-anchor.x*scale),y=Math.round(feetY-anchor.y*scale)-rise+nod;
      const ground=Math.round(pose.groundY??feetY),shadowWidth=sleeping?46:30;
      ctx.fillStyle='#c49c89';
      ctx.fillRect(Math.round(centerX)-shadowWidth/2,ground-2,shadowWidth,1);
      ctx.fillRect(Math.round(centerX)-shadowWidth/2+2,ground-1,shadowWidth-4,1);
      ctx.imageSmoothingEnabled=false;
      if(!frame){
        ctx.petSpriteLayer?.hide();
        ctx.fillStyle='#6a5346';ctx.font='9px system-ui';ctx.textAlign='center';
        ctx.fillText?.(store.status().failed?(pose.petName||'小宠')+'图片暂未加载':(pose.petName||'小宠')+'正在来…',Math.round(centerX),Math.round(feetY)-12);
        return{x:Math.round(centerX)-18,y:Math.round(feetY)-38,width:36,height:38};
      }
      ctx.petSpriteLayer?.show({image:frame.image,state:frame.state,x,y,width:size,height:size});
      const left=Math.floor(b.x*scale),top=Math.floor(b.y*scale);
      return{x:x+left,y:y+top,width:Math.ceil((b.x+b.width)*scale)-left,height:Math.ceil((b.y+b.height)*scale)-top};
    };
  }
  return Object.freeze({WIDTH,HEIGHT,DISPLAY_SIZE,createIdle,createPainter,createLayer:assets.createLayer,draw:createPainter(assets.store)});
});
