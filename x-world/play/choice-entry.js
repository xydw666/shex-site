(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SHEXPlayChoiceEntry=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const glyph='<svg viewBox="0 0 20 20" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 4h10v2h3v10h-5v-2H7v2H2V6h3ZM5 8v2H3v2h2v2h2v-2h2v-2H7V8ZM13 9h2v2h-2ZM15 12h2v2h-2Z" fill-rule="evenodd"/></svg>';
 // Entry visibility is separate from the account-scoped beta gate in the hall.
 function canEnter(value={}){return Boolean(value.userId&&value.dreamId)&&['single','private_single','gallery_single','dream'].includes(value.kind);}
 // A leftward finger movement opens the next tools page; rightward returns.
 function swipePage(page,x,y,count=2){const last=Math.max(0,count-1);return Math.abs(x)>=36&&Math.abs(x)>Math.abs(y)*1.4?Math.max(0,Math.min(last,page+(x<0?1:-1))):page;}
 function installShortcut(panel,allowed,onOpen){
  if(!panel)return;
  let viewport=panel.querySelector('.play-tools-viewport');
  if(!viewport){
   const original=panel.querySelector('.x-clean-tool-grid');if(!original)return;
   const doc=panel.ownerDocument;viewport=doc.createElement('div');viewport.className='play-tools-viewport';
   viewport.tabIndex=0;viewport.setAttribute('aria-label','聊天工具');
   original.before(viewport);
   viewport.append(original);
   const shortcut=doc.createElement('button');shortcut.className='x-clean-tool play-shortcut';shortcut.type='button';shortcut.dataset.xTool='play-choice';shortcut.innerHTML='<span>二选一</span>';original.append(shortcut);
   const nav=doc.createElement('div');nav.className='play-tools-pager';nav.innerHTML='<span>左滑查看其他</span>';viewport.append(nav);
   let start=null,suppressClick=false;
   viewport.addEventListener('pointerdown',e=>{
    if(e.isPrimary===false||e.button>0)return;
    suppressClick=false;start={x:e.clientX,y:e.clientY,id:e.pointerId,dragging:false};
   });
   viewport.addEventListener('pointermove',e=>{
    if(!start||start.id!==e.pointerId||Number(viewport.dataset.pageCount||1)<2)return;
    const dx=e.clientX-start.x,dy=e.clientY-start.y;
    if(Math.abs(dx)>=36&&Math.abs(dx)>Math.abs(dy)*1.4){
     start.dragging=true;
     // Keep the release even when a horizontal drag ends outside the tool panel.
     try{viewport.setPointerCapture?.(e.pointerId);}catch(_){}
     if(e.cancelable)e.preventDefault();
    }
   });
   viewport.addEventListener('pointerup',e=>{
    if(!start||start.id!==e.pointerId)return;
    const gesture=start;start=null;
    if(Number(viewport.dataset.pageCount||1)<2)return;
    const current=Number(viewport.dataset.playPage||0),dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    suppressClick=gesture.dragging||(Math.abs(dx)>=36&&Math.abs(dx)>Math.abs(dy)*1.4);
    const next=swipePage(current,dx,dy,Number(viewport.dataset.pageCount||1));if(next!==current)show(next);
   });
   viewport.addEventListener('pointercancel',()=>{start=null;suppressClick=false;});
   viewport.addEventListener('click',e=>{if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
   viewport.addEventListener('keydown',e=>{
    if(e.target!==viewport||Number(viewport.dataset.pageCount||1)<2||!['ArrowRight','ArrowLeft'].includes(e.key))return;
    e.preventDefault();show(Number(viewport.dataset.playPage||0)+(e.key==='ArrowRight'?1:-1));
   });
   viewport.querySelector('[data-x-tool="play-choice"]').addEventListener('click',e=>{e.stopPropagation();if(viewport.dataset.playAllowed==='true')viewport.__playOpen?.();});
  }
  function show(page){
   const count=Number(viewport.dataset.pageCount||1);page=Math.max(0,Math.min(count-1,page));viewport.dataset.playPage=String(page);
   viewport.querySelectorAll('[data-play-tool-page]').forEach(el=>el.hidden=Number(el.dataset.playToolPage)!==page);
   const hint=viewport.querySelector('.play-tools-pager span');if(hint)hint.textContent=page===count-1?'右滑返回':page?'左滑查看其他 / 右滑返回':'左滑查看其他';
  }
  viewport.__playOpen=onOpen;viewport.dataset.playAllowed=String(allowed);
  viewport.querySelector('[data-x-tool="play-choice"]').hidden=!allowed;
  const found=Array.from(viewport.querySelectorAll('.x-clean-tool[data-x-tool]'));
  const prior=(viewport.__toolOrder||[]).filter(button=>found.includes(button));
  found.forEach(button=>{if(!prior.includes(button))prior.push(button);});
  const ordered=prior.filter(button=>button.dataset.xTool!=='dating-photo').concat(prior.filter(button=>button.dataset.xTool==='dating-photo'));viewport.__toolOrder=ordered;
  const visible=ordered.filter(button=>!button.hidden),hidden=ordered.filter(button=>button.hidden),count=Math.max(1,Math.ceil(visible.length/8)),doc=panel.ownerDocument;
  const gridClass=viewport.querySelector('.x-clean-tool-grid')?.className||'x-clean-tool-grid';
  const parked=doc.createDocumentFragment();ordered.forEach(button=>parked.append(button));
  viewport.querySelectorAll('[data-play-tool-page],.x-clean-tool-grid').forEach(node=>node.remove());
  const nav=viewport.querySelector('.play-tools-pager');nav.hidden=count===1;viewport.dataset.pageCount=String(count);viewport.setAttribute('aria-label',count>1?'聊天工具，左滑查看其他，右滑返回':'聊天工具');
  for(let index=0;index<count;index++){const page=doc.createElement('div'),grid=doc.createElement('div');page.dataset.playToolPage=String(index);grid.className=gridClass;visible.slice(index*8,index*8+8).forEach(button=>grid.append(button));if(index===0)hidden.forEach(button=>grid.append(button));page.append(grid);nav.before(page);}
  show(Number(viewport.dataset.playPage||0));
 }
 return Object.freeze({canEnter,swipePage,installShortcut,glyph});
});
