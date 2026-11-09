(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SHEXPetRoomChat=api.createUI(root);
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // Fixed pixel portraits remain presentation only; identity comes from the current account scope.
  const PORTRAITS={
    dream:'<svg viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path fill="#ead5b4" d="M0 0h24v24H0z"/><path fill="#6c5544" d="M7 3h10v2h3v11H5V6h2z"/><path fill="#f0cdaa" d="M7 8h10v9H7zM9 17h6v3H9z"/><path fill="#80614b" d="M7 7h10v3h-4V8H7z"/><path fill="#584635" d="M8 11h2v2H8zM14 11h2v2h-2z"/><path fill="#bc876c" d="M11 15h3v1h-3z"/><path fill="#9aa58b" d="M6 20h12v4H6z"/><path fill="#fbefd7" d="M10 20h4v4h-4z"/></svg>',
    me:'<svg viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path fill="#e8d1b7" d="M0 0h24v24H0z"/><path fill="#8a644c" d="M7 3h10v2h2v15H5V6h2z"/><path fill="#f2d1ae" d="M7 8h10v9H7zM9 17h6v3H9z"/><path fill="#8a644c" d="M7 7h10v3h-3V8H7z"/><path fill="#624b3c" d="M8 11h2v2H8zM14 11h2v2h-2z"/><path fill="#c48c75" d="M10 15h4v1h-4z"/><path fill="#c79881" d="M6 20h12v4H6z"/><path fill="#fbefd7" d="M10 20h4v2h-4z"/></svg>'
  };
  // 手机键盘弹起时可视高度变小：小宠页面里任何输入框（起名、聊天）获得焦点时，锁住面板原来的高度，
  // 小屋的尺寸也按这个高度算（--pet-locked-height），键盘直接从底部盖上来，页面不上移也不缩小。
  let keyboardLockInstalled=false;
  function unlockKeyboard(panel){panel?.classList?.remove?.('pet-keyboard-lock');panel?.style?.removeProperty?.('--pet-locked-height');}
  function installKeyboardLock(env){
    const doc=env?.document;if(keyboardLockInstalled||!doc?.addEventListener)return;keyboardLockInstalled=true;
    const isField=node=>!!node?.matches?.('input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]');
    const panelOf=node=>node?.closest?.('#xPetPanel');
    let namingPress=null;
    const press=event=>{const form=event.target?.closest?.('[data-pet-name-form]');namingPress=form&&!isField(event.target)?{form,panel:panelOf(event.target)}:null;};
    // Touch browsers can blur an input without focusing the pressed button.
    // Track the actual press; relatedTarget alone cannot guarantee a stable click.
    doc.addEventListener('pointerdown',press,true);doc.addEventListener('touchstart',press,true);
    doc.addEventListener('click',()=>{const pressed=namingPress;namingPress=null;if(pressed&&!isField(doc.activeElement))unlockKeyboard(pressed.panel);});
    const cancel=()=>{const pressed=namingPress;namingPress=null;if(pressed&&!isField(doc.activeElement))unlockKeyboard(pressed.panel);};
    doc.addEventListener('pointercancel',cancel);doc.addEventListener('touchcancel',cancel);
    doc.addEventListener('focusin',event=>{
      const panel=panelOf(event.target);if(!panel||!isField(event.target)||panel.classList.contains('pet-keyboard-lock'))return;
      const height=Math.round(panel.getBoundingClientRect().height||0);if(height<=0)return;
      panel.style.setProperty('--pet-locked-height',height+'px');panel.classList.add('pet-keyboard-lock');
    });
    doc.addEventListener('focusout',event=>{
      const panel=panelOf(event.target);if(!panel)return;
      if(namingPress?.panel===panel)return;
      if(panelOf(event.relatedTarget)===panel){
        const form=event.target?.closest?.('[data-pet-name-form]');
        if(isField(event.relatedTarget)||form&&event.relatedTarget?.closest?.('[data-pet-name-form]')===form)return;
      }
      unlockKeyboard(panel);
    });
  }
  function createUI(env){
    env=env||(typeof window!=='undefined'?window:globalThis);
    installKeyboardLock(env);
    const controller=env.SHEXPetChat?.createController?.(env);
    let root=null,active=false,composerOpen=false,removers=[],context={};
    let lastSnapshot={messages:[],pending:false,error:'',canRetry:false};
    let shownMessage=null,presentationKey='',entrance=null;
    // 气泡生命周期：进房间时不显示任何气泡；谁在说话就只显示谁的；
    // 回复结束后最后一句停留片刻自动消失，不长期挂在房间里。
    let baselineKey=null,expiredKey='',lingerKey='',lingerTimer=null,holding=false;
    const LINGER_MS=2000,LINGER_PER_CHAR_MS=70,LINGER_MAX_MS=12000;
    const keyOf=message=>message?message.speaker+':'+(message.id||'')+':'+message.text:'';
    function clearLinger(){if(lingerTimer!==null)(env.clearTimeout||clearTimeout)(lingerTimer);lingerTimer=null;lingerKey='';}
    function scheduleLinger(key,text){
      if(lingerKey===key)return;
      clearLinger();lingerKey=key;
      // 约 2 秒；长回复按字数多留一会儿，保证来得及读完。
      const extra=Math.max(0,Array.from(String(text||'')).length-12)*LINGER_PER_CHAR_MS;
      const expire=()=>{
        lingerTimer=null;
        // 正在翻看长回复（按住或聚焦气泡）时先不收起。
        if(holding&&active){lingerTimer=(env.setTimeout||setTimeout)(expire,600);return;}
        expiredKey=key;lingerKey='';render();
      };
      lingerTimer=(env.setTimeout||setTimeout)(expire,Math.min(LINGER_MAX_MS,LINGER_MS+extra));
    }
    const find=selector=>root?.querySelector(selector);
    function listen(node,type,handler){if(!node)return;node.addEventListener(type,handler);removers.push(()=>node.removeEventListener(type,handler));}
    function render(){
      if(!active||!root)return;
      const state=controller?.snapshot?.()||lastSnapshot||{};
      lastSnapshot=state;
      const messages=Array.isArray(state.messages)?state.messages:[];
      // A task may persist its final delivery before the task is cleared. Keep
      // the user's message until completion, never present intermediate items.
      const latest=state.pendingKind==='pet_event'?null:state.pending
        ? [...messages].reverse().find(item=>item?.speaker==='me')
        : messages.at(-1);
      const latestKey=keyOf(latest);
      // 进房间那一刻已经存在的最后一句属于之前的对话，不在这里重新亮出来。
      if(baselineKey===null)baselineKey=state.pending?'':latestKey;
      const current=latest&&latestKey!==baselineKey&&latestKey!==expiredKey?latest:null;
      if(current&&!state.pending)scheduleLinger(latestKey,current.text);
      else if(!current||state.pending)clearLinger();
      shownMessage=current||null;
      const nextKey=keyOf(current);
      for(const speaker of ['dream','me']){
        const message=current?.speaker===speaker?current:null;
        const slot=find('[data-pet-speaker="'+speaker+'"]');
        const card=find('[data-pet-dialogue="'+speaker+'"]');
        const text=find('[data-pet-chat-message="'+speaker+'"]');
        // 两个人的头像自始至终都在；只有气泡跟着说话出现和消失。
        if(slot)slot.hidden=false;
        if(card)card.hidden=!message;
        if(text&&text.textContent!==(message?.text||''))text.textContent=message?.text||'';
      }
      if(nextKey!==presentationKey){
        entrance?.cancel?.();entrance=null;presentationKey=nextKey;
        const card=current&&find('[data-pet-dialogue="'+current.speaker+'"]');
        if(card&&!env.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){
          entrance=card.animate?.([{opacity:0,transform:'translateY(2px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'ease-out'})||null;
        }
        if(card)card.scrollTop=0;
      }
      const pending=find('[data-pet-chat-pending]');
      if(pending){pending.hidden=!state.pending;pending.textContent=state.pending?'TA 正在回复…':'';}
      const error=find('[data-pet-chat-error]');if(error)error.textContent=state.error||'';
      const retry=find('[data-pet-chat-retry]');if(retry)retry.hidden=state.canRetry!==true;
    }
    function renderPeople(){
      const identity=context.identity||{};
      for(const speaker of ['dream','me']){
        const name=identity[speaker==='dream'?'dreamName':'userName']||(speaker==='dream'?'TA':'我');
        const label=find('[data-pet-person-name="'+speaker+'"]');if(label)label.textContent=name;
        const holders=root?.querySelectorAll?.('[data-pet-person-avatar="'+speaker+'"]')||[];
        for(const holder of holders){
          if(holder.dataset?.petPixelPortrait===speaker)continue;
          if(holder.dataset)holder.dataset.petPixelPortrait=speaker;
          holder.innerHTML=PORTRAITS[speaker];
        }
      }
    }
    function setContext(next){
      const changed=context.identity?.userId!==next?.identity?.userId||context.identity?.dreamId!==next?.identity?.dreamId;
      if(active&&changed){const input=find('[data-pet-chat-input]');if(input)input.value='';setComposer(false);clearLinger();baselineKey=null;expiredKey='';}
      context=next||{};
      controller?.setContext?.({identity:context.identity,adopted:!!context.adopted});
      renderPeople();render();
    }
    function setComposer(open){
      composerOpen=open;
      const form=find('[data-pet-chat-form]'),input=find('[data-pet-chat-input]'),toggle=find('[data-pet-chat-toggle]');
      if(form)form.hidden=!open;
      if(root?.dataset)root.dataset.petComposerOpen=String(open);
      toggle?.setAttribute('aria-expanded',String(open));
      toggle?.setAttribute('aria-label',open?'发送消息':'打开对话输入框');
      if(open)input?.focus?.();else{input?.blur?.();unlockKeyboard(root);}
    }
    function submit(){
      const input=find('[data-pet-chat-input]');
      const value=String(input?.value??'');
      if(!value.trim()){
        setComposer(false);find('[data-pet-chat-toggle]')?.focus?.();return;
      }
      const result=controller?.send?.(value)||{ok:false,error:'暂时无法发送，请稍后重试'};
      if(result.ok){try{env.SHEXPetApp?.chatSent?.();}catch(_){}if(input)input.value='';setComposer(false);render();find('[data-pet-chat-toggle]')?.focus?.();}
      else {
        const error=find('[data-pet-chat-error]');if(error)error.textContent=result.error||'暂时无法发送，请稍后重试';
        setComposer(true);
      }
    }
    function enter(panel,next={}){
      if(active||!panel)return;
      root=panel;context=next||{};active=true;baselineKey=null;expiredKey='';holding=false;renderPeople();
      for(const speaker of ['dream','me']){
        const card=find('[data-pet-dialogue="'+speaker+'"]');
        for(const type of ['pointerdown','focusin'])listen(card,type,()=>{holding=true;});
        for(const type of ['pointerup','pointercancel','pointerleave','focusout'])listen(card,type,()=>{holding=false;});
      }
      listen(find('[data-pet-chat-toggle]'),'click',()=>{if(composerOpen)submit();else setComposer(true);});
      listen(find('[data-pet-chat-input]'),'input',()=>{});
      listen(find('[data-pet-chat-form]'),'submit',event=>{event.preventDefault();submit();});
      listen(find('[data-pet-chat-retry]'),'click',()=>{
        const result=controller?.retry?.();
        render();
        if(result&&!result.ok){const error=find('[data-pet-chat-error]');if(error)error.textContent=result.error||'暂时无法重试，请稍后再试';}
      });
      listen(root,'keydown',event=>{if(event.key==='Escape'&&composerOpen){event.preventDefault();setComposer(false);find('[data-pet-chat-toggle]')?.focus?.();}});
      setComposer(false);
      const identity=next?.identity,adopted=!!next?.adopted;
      controller?.enter?.({identity,adopted},snapshot=>{
        if(!active||root!==panel)return;
        lastSnapshot=snapshot||{messages:[],pending:false,error:'',canRetry:false};render();
      });
      render();
    }
    function leave(){
      if(!active)return;
      const input=find('[data-pet-chat-input]');if(input)input.value='';
      setComposer(false);removers.forEach(remove=>remove());removers=[];
      entrance?.cancel?.();entrance=null;shownMessage=null;presentationKey='';
      clearLinger();baselineKey=null;expiredKey='';holding=false;
      active=false;controller?.leave?.();root=null;context={};lastSnapshot={messages:[],pending:false,error:'',canRetry:false};
    }
    function status(){
      const state=controller?.snapshot?.()||lastSnapshot;
      return {active,listeners:removers.length,messageCount:shownMessage?1:0,mode:shownMessage?.speaker||'',presentationKey,composerOpen};
    }
    return Object.freeze({enter,leave,status,setContext,unlockKeyboard});
  }
  return Object.freeze({createUI,unlockKeyboard});
});
