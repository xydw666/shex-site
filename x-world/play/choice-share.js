(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SHEXPlayChoiceShare=api;})(typeof window!=='undefined'?window:globalThis,function(root){
 'use strict';
 const SITE_URL='https://shex.dushe.site/index.html#x-world';
 function loadImage(url){if(root.SHEXPlayCanvas?.loadImage)return root.SHEXPlayCanvas.loadImage(url);return new Promise(resolve=>{if(!url)return resolve(null);const img=new root.Image();let done=false;const end=value=>{if(done)return;done=true;root.clearTimeout(timer);resolve(value);};const timer=root.setTimeout(()=>end(null),3000);img.crossOrigin='anonymous';img.onload=()=>end(img);img.onerror=()=>end(null);img.src=url;});}
 function fit(ctx,text,size,width){ctx.font=`${size}px "Fusion Pixel", "Microsoft YaHei", sans-serif`;while(ctx.measureText(text).width>width&&size>18){size-=2;ctx.font=`${size}px "Fusion Pixel", "Microsoft YaHei", sans-serif`;}return size;}
 function wrap(ctx,text,x,y,width,lineHeight,limit){const chars=[...text];let line='',row=0;for(let i=0;i<chars.length;i++){if(ctx.measureText(line+chars[i]).width>width){ctx.fillText(line,x,y);y+=lineHeight;line='';if(++row===limit-1){const rest=chars.slice(i).join('');line=rest;while(ctx.measureText(line+'…').width>width)line=line.slice(0,-1);if(line!==rest)line+='…';break;}}line+=chars[i];}ctx.fillText(line,x,y);}
 function heart(ctx,x,y,pixel,color){if(root.SHEXPlayCanvas?.pixelHeart)return root.SHEXPlayCanvas.pixelHeart(ctx,x,y,pixel,color,['011101110','111111111','111111111','011111110','001111100','000111000','000010000']);ctx.fillStyle=color;['011101110','111111111','111111111','011111110','001111100','000111000','000010000'].forEach((row,r)=>{[...row].forEach((cell,c)=>{if(cell==='1')ctx.fillRect(x+c*pixel,y+r*pixel,pixel,pixel);});});}
 function drawSiteQr(ctx,doc,QRCodeFactory){
  if(root.SHEXPlayCanvas?.qr)return root.SHEXPlayCanvas.qr(ctx,doc,QRCodeFactory,SITE_URL,{x:825,y:1268,side:123,bg:'#fffaf0',fg:'#352b25'});
  if(typeof QRCodeFactory!=='function')throw new Error('站点二维码暂时无法生成');
  const host=doc.createElement('div');
  const code=new QRCodeFactory(host,{text:SITE_URL,width:123,height:123,correctLevel:QRCodeFactory.CorrectLevel.M});
  const matrix=code._oQRCode;
  if(!matrix||typeof matrix.getModuleCount!=='function'||typeof matrix.isDark!=='function')throw new Error('站点二维码暂时无法生成');
  const count=matrix.getModuleCount(),pixel=Math.floor(123/(count+8));
  if(pixel<2)throw new Error('站点二维码容量不足');
  const side=(count+8)*pixel,x=825+(123-side)/2,y=1268+(123-side)/2;
  ctx.fillStyle='#fffaf0';ctx.fillRect(825,1268,123,123);
  ctx.fillStyle='#352b25';
  for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(matrix.isDark(row,col))ctx.fillRect(x+(col+4)*pixel,y+(row+4)*pixel,pixel,pixel);
 }
 async function create({document:doc=root.document,result,identity,questions=[],loadImage:loader=loadImage,qrFactory=root.QRCode}){
  const canvas=doc.createElement('canvas'),[left,right]=await Promise.all([loader(identity.userAvatar),loader(identity.dreamAvatar)]);await doc.fonts?.ready;
  function paint(useImages){canvas.width=1080;canvas.height=1440;const ctx=canvas.getContext('2d');ctx.textAlign='center';ctx.fillStyle='#faedce';ctx.fillRect(0,0,1080,1440);ctx.fillStyle='#71523c';ctx.fillRect(40,40,1000,1360);ctx.fillStyle='#fff5dc';ctx.fillRect(46,46,988,1348);ctx.fillStyle='#b9885b';ctx.fillRect(196,85,688,110);ctx.fillStyle='#71523c';ctx.fillRect(202,188,688,12);ctx.fillStyle='#fff6df';ctx.font='50px "Fusion Pixel", "Microsoft YaHei", sans-serif';ctx.fillText('二选一 · 默契大考验',540,160);
   function portrait(image,x,name){ctx.fillStyle='#71523c';ctx.fillRect(x-69,229,138,138);ctx.fillStyle='#ead3a8';ctx.fillRect(x-64,234,128,128);if(useImages&&image){ctx.save();ctx.beginPath();ctx.rect(x-60,238,120,120);ctx.clip();const side=Math.min(image.width,image.height);ctx.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,x-60,238,120,120);ctx.restore();}else{ctx.fillStyle='#71523c';ctx.font='54px "Fusion Pixel", sans-serif';ctx.fillText(String(name||'我').slice(0,1),x,322);}ctx.fillStyle='#71523c';fit(ctx,String(name||'我'),28,280);ctx.fillText(String(name||'我').slice(0,18),x,408);}
   portrait(left,310,identity.userName);portrait(right,770,identity.dreamName);heart(ctx,504,272,8,'#e38c95');ctx.fillStyle='#71523c';ctx.font='114px "Fusion Pixel", sans-serif';ctx.fillText(result.score+'%',540,530);
   for(let i=0;i<10;i++)heart(ctx,252+i*60,552,4,result.userPicks?.[i]===result.taPicks?.[i]?'#e38c95':'#aaa79f');
   ctx.fillStyle='#71523c';fit(ctx,String(result.title||'默契时刻'),38,850);ctx.fillText(String(result.title||'默契时刻'),540,637);ctx.font='26px "Fusion Pixel", "Microsoft YaHei", sans-serif';wrap(ctx,String(result.summary||'每个小小选择，都是靠近彼此的一步。'),540,681,864,38,2);
   ctx.fillStyle='#b9885b';ctx.fillRect(100,751,880,3);ctx.fillStyle='#71523c';ctx.font='24px "Fusion Pixel", "Microsoft YaHei", sans-serif';ctx.fillText('我的选择',353,795);ctx.fillText('TA 的选择',727,795);
   for(let i=0;i<10;i++){const y=846+i*40,q=questions[i]||{},same=result.userPicks?.[i]===result.taPicks?.[i];ctx.fillStyle=i%2?'#f7eacf':'#f1e0bf';ctx.fillRect(100,y-29,880,39);ctx.textAlign='left';ctx.fillStyle='#71523c';ctx.font='21px "Fusion Pixel", sans-serif';ctx.fillText(String(i+1).padStart(2,'0'),119,y);ctx.textAlign='center';fit(ctx,String(q[result.userPicks?.[i]]||result.userPicks?.[i]||''),24,320);ctx.fillText(String(q[result.userPicks?.[i]]||result.userPicks?.[i]||''),353,y);fit(ctx,String(q[result.taPicks?.[i]]||result.taPicks?.[i]||''),24,320);ctx.fillText(String(q[result.taPicks?.[i]]||result.taPicks?.[i]||''),727,y);ctx.fillStyle=same?'#61724f':'#9c665c';ctx.font='19px "Fusion Pixel", sans-serif';ctx.fillText(same?'相同':'不同',916,y);}
   ctx.fillStyle='#b9885b';ctx.fillRect(100,1256,880,3);ctx.fillStyle='#71523c';ctx.font='42px "Fusion Pixel", sans-serif';ctx.fillText('SHE.X',400,1320);fit(ctx,SITE_URL,23,690);ctx.fillText(SITE_URL,400,1367);
   drawSiteQr(ctx,doc,qrFactory);
  }
  const blob=()=>new Promise((resolve,reject)=>{try{canvas.toBlob(value=>value?resolve(value):reject(new Error('分享卡制作失败，请重试')),'image/png');}catch(error){reject(error);}});
  paint(true);try{return await blob();}catch(_){paint(false);return blob();}
 }
 return Object.freeze({create,SITE_URL});
});
