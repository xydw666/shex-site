(function(root){
 'use strict';
 const doc=root.document;if(!doc)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const shapes={heart:'M3 5h2V3h4v2h2V3h4v2h2v6h-2v2h-2v2h-2v2H9v-2H7v-2H5v-2H3Z',sun:'M9 1h2v3H9ZM9 16h2v3H9ZM1 9h3v2H1ZM16 9h3v2h-3ZM4 4h2v2H4ZM14 4h2v2h-2ZM4 14h2v2H4ZM14 14h2v2h-2ZM7 6h6v1h1v6h-1v1H7v-1H6V7h1Z',leaf:'M14 2h4v6h-2v4h-2v2h-4v2H6v2H4v-4H2V8h2V6h4V4h6ZM6 12v2h2v-2h2v-2h2V8h2V6h-2v2h-2v2H8v2Z',moon:'M10 2h4v2h-4v6h2v2h6v-2h2v4h-2v2h-2v2H6v-2H4v-2H2V6h2V4h2V2Z',cup:'M3 4h12v2h3v8h-3v2H5v-2H3ZM15 8v4h1V8ZM3 18h14v2H3Z',star:'M9 1h2v5h2v2h6v2h-4v2h-2v6h-2v-3H9v3H7v-6H5v-2H1V8h6V6h2Z',book:'M2 3h6v2h4V3h6v14h-6v2H8v-2H2ZM8 7v8h4V7Z',game:'M5 4h10v2h3v10h-5v-2H7v2H2V6h3ZM5 8v2H3v2h2v2h2v-2h2v-2H7V8ZM13 9h2v2h-2ZM15 12h2v2h-2Z',music:'M10 2h8v3h-6v10h-2v3H4v-2H2v-4h2v-2h6Z'};
 Object.assign(shapes,{flower:'M8 1h4v4h4v3h3v4h-4v4h-3v3H8v-4H4v-3H1V8h4V4h3ZM8 8h4v4H8Z',letter:'M1 4h18v12H1ZM3 6v2h2v2h3v2h4v-2h3V8h2V6h-2v2h-3v2H8V8H5V6Z',phone:'M5 1h10v18H5ZM7 4v11h6V4ZM9 16h2v1H9Z',rain:'M5 3h9v2h3v3h2v4H1V8h2V5h2ZM4 14h2v4H4ZM9 15h2v4H9ZM14 14h2v4h-2Z',snow:'M9 1h2v5l3-3 2 2-3 3h6v2h-6l3 3-2 2-3-3v7H9v-7l-3 3-2-2 3-3H1V8h6L4 5l2-2 3 3Z'});
 // Pointed cat ears and long floppy dog ears remain distinct at option-card size.
 const animalArt={
  cat:'<path fill="currentColor" d="M2 2h4v2h8V2h4v13h-2v2H4v-2H2Z"/><path fill="var(--play-card)" d="M4 6h12v8h-2v1H6v-1H4Z"/><path fill="var(--play-pink)" d="M3 3h2v2H3ZM15 3h2v2h-2ZM9 10h2v2H9Z"/><path fill="var(--play-ink)" d="M5 8h2v2H5ZM13 8h2v2h-2ZM9 12h2v1H9ZM7 13h2v1H7ZM11 13h2v1h-2Z"/>',
  dog:'<path fill="currentColor" d="M6 2h8v2h3v2h2v10h-3v-4h-1v4h-2v2H7v-2H5v-4H4v4H1V6h2V4h3Z"/><path fill="var(--play-card)" d="M6 5h8v2h1v6h-2v3H7v-3H5V7h1Z"/><path fill="var(--play-ink)" d="M6 8h2v2H6ZM12 8h2v2h-2ZM8 11h4v2H8ZM9 13h2v1H9Z"/><path fill="var(--play-pink)" d="M9 14h2v3H9Z"/>'
 };
 function icon(name='heart',fallback='A'){if(!shapes[name]&&!animalArt[name])return`<span class="play-icon-literal" aria-hidden="true">${esc(fallback.toUpperCase())}</span>`;return`<svg class="play-pixel-icon" data-play-icon="${esc(name)}" viewBox="0 0 20 20" aria-hidden="true">${animalArt[name]||`<path fill-rule="evenodd" fill="currentColor" d="${shapes[name]}"/>`}</svg>`;}
 let host=null,config={},client=null,flow=null,identity=null,origin='world',panel=null,returnPoint=null,shareUrl=null;
 const reduced=()=>root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 let renderedView=null;
 function currentIdentity(){return config.preview?config.identity:host?.current?.(origin);}
 // Game-only audio assets are loaded when the game panel is entered, never by chat.
 const gameAudioScript=doc.currentScript?.src;
 let gameAudioReady=null,gameAudioUI=null,soundRoundId=null;const soundedReveals=new Set();
 function prepareGameAudio(){if(gameAudioReady)return gameAudioReady;if(!doc.head?.append||typeof root.URL!=='function')return Promise.resolve();const gameAudioBase=new root.URL('./ludo/',gameAudioScript||new root.URL('./x-world/play/play.js',root.location.href));const load=(name,key,manual)=>root[key]?Promise.resolve():new Promise(resolve=>{const script=doc.createElement('script');script.src=new URL(name,gameAudioBase).href;script.async=false;if(manual)script.dataset.audioManual='';script.onload=resolve;script.onerror=resolve;doc.head.append(script);});gameAudioReady=load('ludo-audio.js?v=20261030-001746-x103-front-20','SHEXLudoAudio').then(()=>load('ludo-audio-ui.js?v=20261030-001746-x103-front-20','SHEXLudoAudioUI',true)).then(()=>{gameAudioUI=root.SHEXLudoAudioUI?.mount({host:panel});gameAudioUI?.refresh();});return gameAudioReady;}
 function ensure(){panel=doc.getElementById('xPlayPanel');if(!panel){panel=doc.createElement('section');panel.id='xPlayPanel';panel.className='x-panel x-subpage-panel play-panel';panel.setAttribute('aria-label','一起玩');(doc.getElementById('xWorldHome')?.parentElement||doc.body).appendChild(panel);}panel.onclick=onClick;void prepareGameAudio();return panel;}
 function valid(){const now=currentIdentity();return Boolean(now?.userId&&now.dreamId&&now.userId===identity?.userId&&now.dreamId===identity?.dreamId&&now.kind!=='world_run'&&now.kind!=='group');}
 function avatar(name,url,label){const cloud=/^cloud:\/\//i.test(url||''),safe=/^(https?:|data:image\/|blob:|\.\/|\/)/i.test(url||'');const instance=url===identity?.dreamAvatar?identity?.avatarInstanceId:'';return`<span class="play-avatar"${url?'':' data-placeholder'}>${cloud||safe?`<img ${cloud?`data-avatar-cloud-src="${esc(url)}"${instance?` data-public-character-instance-id="${esc(instance)}"`:''}`:`src="${esc(url)}"`} alt="${esc(label)}" crossorigin="anonymous" loading="eager">`:''}<b aria-hidden="true">${esc(String(name||'我').slice(0,1))}</b></span>`;}
 function pair(){return`<div class="play-pair"><div>${avatar(identity?.userName,identity?.userAvatar,'你的头像')}<span>${esc(identity?.userName||'我')}</span></div><span class="play-pair-heart">${icon('heart')}<small>YOU & TA</small></span><div>${avatar(identity?.dreamName,identity?.dreamAvatar,'梦角头像')}<span>${esc(identity?.dreamName||'TA')}</span></div></div>`;}
 function button(action,label,primary=false,disabled=false){return`<button class="play-button${primary?' is-primary':''}" data-play-action="${action}" type="button"${disabled?' disabled':''}>${label}</button>`;}
 function priceLabel(value){return Number.isSafeInteger(value)&&value>0?value+' 能量':'价格待确认';}
 function priceDescription(state){return state?.aiPrice===state?.cardPrice&&Number.isSafeInteger(state?.aiPrice)&&state.aiPrice>0?`AI 和字卡统一每局 ${priceLabel(state.aiPrice)}；每个梦角每天共享免费 1 局。`:`AI 梦角 ${priceLabel(state?.aiPrice)} / 字卡梦角 ${priceLabel(state?.cardPrice)}；每个梦角每天共享免费 1 局。`;}
 function errorText(error){if(!error)return'';if(error.code==='PLAY_AI_TIMEOUT')return'梦角这次思考超时了，本局还没有扣费。点「开始新的一局」再试一次。';if(error.code==='PLAY_EXPIRED')return'这一局已超过 30 分钟，没有扣费。可以开始新的一局。';if(error.code==='PLAY_PRICE_CHANGED')return`今天的免费机会已在另一台设备用完。本局现在需要 ${Number(error.requiredCost)} 能量，确认后才会结算。`;return error.message||'连接暂时中断，进度已保留。请重试本局。';}
 function render(state){
  if(!panel)return;
  if(state.screen==='closed'){gameAudioUI?.refresh();return;}
  const row=client.progress(),cloud=client.state(),data=client.summary(),busy=state.busy;
  const viewKey=state.screen==='question'?`question:${row?.userPicks?.length||0}`:state.screen==='reveal'?`reveal:${state.revealIndex}`:state.screen;
  const changedView=renderedView!==viewKey;
  let content='';
  if(state.screen==='hall'){
   content=`<section class="play-hall"><h1>一起玩</h1><p class="play-intro">把一点小默契，收进今天。</p><button class="play-game-entry" data-play-action="choice" type="button"><span class="play-game-art">${icon('game')}<span class="play-art-heart">${icon('heart')}</span><i></i><i></i><i></i></span><span class="play-game-copy"><strong>二选一</strong><span>十个选择，看看你们多合拍</span><small>和 ${esc(identity?.dreamName||'TA')} 开始</small></span><span class="play-entry-arrow" aria-hidden="true">→</span></button>${`<button class="play-game-entry is-ludo" data-play-action="ludo" type="button"><span class="play-game-art">${icon('star')}<span class="play-art-heart">${icon('heart')}</span><i></i><i></i><i></i></span><span class="play-game-copy"><strong>恋爱飞行棋</strong><span>沿着约会地图，把心动走成故事</span><small>与 ${esc(identity?.dreamName||'TA')} 开始旅程</small></span><span class="play-entry-arrow" aria-hidden="true">→</span></button>`}<div class="play-coming-cards"><div class="play-coming-card" aria-disabled="true">${icon("star")}<strong>敬请期待</strong><small>下一份小惊喜</small></div><div class="play-coming-card" aria-disabled="true">${icon("heart")}<strong>敬请期待</strong><small>更多一起玩的时光</small></div></div><div class="play-coming"><span class="play-coming-line"></span>${icon('star')}<span>更多小游戏，慢慢见面</span><span class="play-coming-line"></span></div></section>`;
  }else if(state.screen==='cover'){
   const price=cloud?.price??null,mode=cloud?.sourceMode;
   content=`<section class="play-cover"><div class="play-wood-sign"><i></i><h1>二选一</h1><i></i><span>默契大考验</span></div>${pair()}<div class="play-cover-rules"><span>${icon('book')}10 道小题</span></div>${mode?`<p class="play-source"><strong>当前：${mode==='ai'?'AI':'字卡'}模式</strong><small>跟随 X传讯；仅可在 X传讯中更改</small><span>${price===null?'价格待确认':price===0?'本局免费':'完成一局 '+price+' 能量'}</span></p>`:''}${button(['PLAY_AI_TIMEOUT','PLAY_ALREADY_COMPLETED'].includes(state.error?.code)?'new-round':'start',busy?'梦角正在准备题目…':['PLAY_AI_TIMEOUT','PLAY_ALREADY_COMPLETED'].includes(state.error?.code)?'开始新的一局':row?.status==='starting'||row?.status==='generating'||row?.status==='timed_out'?'重试本局':price===null?'价格待确认':'开始默契挑战',true,busy||!cloud&&!state.error||price===null)}<p class="play-cost-note">${priceDescription(cloud)}</p></section>`;
  }else if(state.screen==='question'){
   const at=row?.userPicks?.length||0,q=row?.questions?.[at];
   content=`<section class="play-question${q?.prompt?' has-prompt':''}"><div class="play-question-top"><span class="play-ta-badge">TA 已作答 ✓</span><strong>${at+1}<small> / 10</small></strong></div>${progress(at)}<h1>${esc(q?.prompt||'这次，你会选？')}</h1><p class="play-question-hint">不用猜 TA，凭第一感觉就好。</p><div class="play-options">${option(q,'a',false,busy)}<span class="play-or">OR</span>${option(q,'b',false,busy)}</div><div class="play-waiting">${avatar(identity?.dreamName,identity?.dreamAvatar,'梦角头像')}<span>${esc(identity?.dreamName||'TA')} 的答案，答完再揭晓。</span></div></section>`;
  }else if(state.screen==='submit'){
   const cost=state.requiredCost??row?.maxCost??0,pending=state.error?.code==='PLAY_PRICE_UNCONFIRMED';
   content=`<section class="play-submit">${pair()}${progress(10)}<h1>十个选择，已经收好。</h1><p>把你们的答案放在一起，<br>看看心里的小小默契。</p>${button('finish',busy?'正在核对答案…':pending?'价格待确认 · 重试结算':state.requiredCost!==null?`确认 ${Number(cost)} 能量并揭晓`:`一起揭晓${cost?' · '+cost+' 能量':' · 免费'}`,true,busy)}<p class="play-cost-note">${pending?'本模式价格待确认，答案已保留。':cost?'点击后完成本局并结算 '+cost+' 能量。':'本局免费。'}同一局重试不会重复扣费。</p></section>`;
  }else if(state.screen==='reveal'){
   const i=state.revealIndex,q=row?.questions?.[i],result=state.result,user=result.userPicks?.[i],ta=result.taPicks?.[i],match=user===ta;
   let reason=!match&&result.sourceMode==='ai'&&!result.fallback?(Array.isArray(result.reasons)?result.reasons[i]:result.reasons?.[q?.id]):'';
   if(reason&&typeof reason==='object')reason=reason.reason||reason.text||'';
   content=`<section class="play-reveal ${match?'is-match':'is-different'}"><div class="play-question-top"><span>答案揭晓</span><strong>${i+1}<small> / 10</small></strong></div>${progress(i+1)}<h1>${match?'这题，想到一起了！':'不同的选择，也很可爱。'}</h1>${q?.prompt?`<p class="play-reveal-prompt">${esc(q.prompt)}</p>`:''}<div class="play-reveal-symbol">${icon(match?'heart':'leaf')}${match?Array.from({length:8},(_,n)=>'<i style="--particle:'+n+'"></i>').join(''):''}</div><div class="play-answer-pair"><div><span>${esc(identity?.userName||'我')} 选了</span><strong>${esc(q?.[user]||user?.toUpperCase())}</strong></div><div><span>${esc(identity?.dreamName||'TA')} 选了</span><strong>${esc(q?.[ta]||ta?.toUpperCase())}</strong></div></div>${reason?`<div class="play-reason-message">${avatar(identity?.dreamName,identity?.dreamAvatar,'梦角头像')}<div class="play-reason-content"><span class="play-reason-name">${esc(identity?.dreamName||'TA')}</span><blockquote class="play-reason">${esc(reason)}</blockquote></div></div>`:`<p class="play-reveal-note">${match?'同一个小念头，刚好被你们接住。':'不必每次相同，才算彼此合拍。'}</p>`}${button('next',i===9?'查看我们的默契成绩':'下一题揭晓',true)}</section>`;
  }else if(state.screen==='result'){
   const r=state.result;
   const sameCount=Array.from({length:10},(_,i)=>r.userPicks?.[i]===r.taPicks?.[i]).filter(Boolean).length;
   content=`<section class="play-result${r.score>=80?' is-celebrate':''}">
    ${r.score>=80?'<div class="play-confetti" aria-hidden="true">'+Array.from({length:16},(_,i)=>`<i style="--i:${i}"></i>`).join('')+'</div>':''}
    <div class="play-result-postcard">
     <div class="play-result-ribbon"><span aria-hidden="true">✦</span> 二选一 · 默契成绩单 <span aria-hidden="true">✦</span></div>
     <header class="play-result-head"><span>OUR LITTLE CHOICES</span><h1>我们的默契</h1><p>十道小题，拼成今天的我们</p></header>
     <div class="play-result-pair">${pair()}</div>
     <div class="play-result-score-card">
      <i class="play-result-spark play-result-spark-left" aria-hidden="true">${icon('star')}</i><i class="play-result-spark play-result-spark-right" aria-hidden="true">${icon('star')}</i>
      <span class="play-result-score-label">默契度</span>
      <div class="play-score" aria-label="默契值 ${Number(r.score)}%"><strong data-play-score>${reduced()?Number(r.score):'0'}</strong><span>%</span></div>
      <h2 class="play-result-title">${esc(r.title)}</h2>
     </div>
     <div class="play-result-track"><div class="play-result-track-head"><span>十个选择的足迹</span><strong>${sameCount}<small> / 10 同心</small></strong></div>${resultStrip(r)}<div class="play-result-legend"><span><i class="is-match">${icon('heart')}</i>同心 ${sameCount}</span><span><i class="is-different">${icon('heart')}</i>各有所爱 ${10-sameCount}</span></div></div>
     <div class="play-result-note"><span class="play-result-note-label">${icon('letter')} 写给你们的一句话</span><p class="play-summary">“${esc(r.summary||'每个小小选择，都是靠近彼此的一步。')}”</p></div>
     ${r.fallback?'<p class="play-fallback-note">梦角这次没能及时作答，已用随机字卡陪你完成。本局免费，不占今日免费机会。</p>':''}
     <div class="play-settlement"><span>${r.amount?'本局已结算 '+Number(r.amount)+' 能量':'本局免费'}</span><span>历史最高 ${Number(data?.bestScore||r.score)}%</span></div>
    </div>
    <div class="play-result-actions">${button('share','保存默契卡片',true)}${button('replay','再玩一次')}</div>${button('hall','回到游戏厅')}<p class="play-result-foot">默契是今天的惊喜，不是爱意的考试。</p>
   </section>`;
  }
  const previousFocus=doc.activeElement?.dataset?.playAction;
  panel.innerHTML=`<div class="play-shell"><header class="play-topbar">${button('back',`<span aria-hidden="true">←</span> ${origin==='chat'?'返回聊天':state.screen==='hall'?'X世界':'游戏厅'}`)}<span>一起玩</span><span class="play-top-heart">${icon('heart')}</span></header><div class="play-body" data-play-screen="${state.screen}" aria-busy="${busy}">${content}${state.error?`<div class="play-error" role="alert">${esc(errorText(state.error))}${['PLAY_EXPIRED','PLAY_AI_TIMEOUT','PLAY_ALREADY_COMPLETED'].includes(state.error.code)?button('new-round','开始新的一局'):state.screen==='cover'?button('retry','重试本局',false,busy||cloud?.price===null):''}</div>`:''}${busy?(cloud?.sourceMode==='ai'&&state.screen==='cover'?'<p class="play-loading play-ai-thinking" role="status">TA 在认真想<span>.</span><span>.</span><span>.</span></p>':'<p class="play-loading" role="status">正在连接，请稍等…</p>'):''}</div><div class="play-toast" role="status" aria-live="polite" hidden></div></div>`;
  renderedView=viewKey;if(changedView)panel.scrollTop=0;
  panel.querySelectorAll('.play-avatar img').forEach(img=>{img.onerror=()=>{const parent=img.parentElement;img.remove();parent?.setAttribute('data-placeholder','');};img.onload=()=>img.parentElement?.classList.add('has-image');});
  host?.resolveAvatarImages?.(panel);
  const reason=panel.querySelector(".play-reason");if(reason&&!reduced()){const full=reason.textContent;const began=root.performance.now();reason.textContent="";function type(time){if(!reason.isConnected)return;const n=Math.min([...full].length,Math.floor((time-began)/30));reason.textContent=[...full].slice(0,n).join("");if(n<[...full].length)root.requestAnimationFrame(type);}root.requestAnimationFrame(type); }
  if(previousFocus)panel.querySelector(`[data-play-action="${previousFocus}"]`)?.focus({preventScroll:true});
  if(state.screen==='result'&&!busy)animateScore(state.result.score);
  gameAudioUI?.refresh();
 }
 function resultStrip(result){return `<div class="play-result-strip" aria-label="十题默契结果">${Array.from({length:10},(_,i)=>{const same=result.userPicks[i]===result.taPicks[i];return `<span class="${same?"is-match":"is-different"}" aria-label="第${i+1}题：${same?"相同":"不同"}" title="第${i+1}题：${same?"相同":"不同"}"><small aria-hidden="true">${String(i+1).padStart(2,'0')}</small>${icon("heart")}</span>`;}).join("")}</div>`;}
 function progress(count){return`<div class="play-progress" role="progressbar" aria-label="答题进度" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${count}">${Array.from({length:10},(_,i)=>`<i${i<count?' class="is-done"':''}></i>`).join('')}</div>`;}
 function option(q,key,reveal,disabled){return`<button class="play-option play-option-${key}" data-play-pick="${key}" type="button"${disabled?' disabled':''}><span class="play-option-letter">${key.toUpperCase()}</span><span class="play-option-symbol">${icon(q?.[key==='a'?'iconA':'iconB'],key)}</span><strong>${esc(q?.[key]||'正在准备')}</strong><span class="play-option-check" aria-hidden="true"></span></button>`;}
 function sound(match){const roundId=client?.progress()?.roundId,index=flow?.current()?.revealIndex;if(!roundId||!Number.isInteger(index))return;if(soundRoundId!==roundId){soundRoundId=roundId;soundedReveals.clear();}if(soundedReveals.has(index))return;soundedReveals.add(index);root.SHEXLudoAudio?.playEffect(match?'match':'different','choice');}
 async function onClick(event){
  const action=event.target.closest('[data-play-action]')?.dataset.playAction,pick=event.target.closest('[data-play-pick]')?.dataset.playPick;
  if(!action&&!pick)return;
  if(!valid()){flow.leave();client.accountChanged();host?.leave?.('world');return;}
  if(pick){flow.pick(pick);return;}
  if(action==='choice')return open('choice',{origin:'world',dreamId:identity.dreamId});
  if(action==='ludo')return open('ludo',{origin:'world',dreamId:identity.dreamId});
  if(action==='start'||action==='retry')return flow.start(client.state()?.price??null);
  if(action==='finish'){await flow.finish(flow.current().requiredCost??undefined);const s=flow.current();if(s.screen==='reveal')sound(s.result.userPicks[0]===s.result.taPicks[0]);return;}
  if(action==='next'){flow.nextReveal();const s=flow.current();if(s.screen==='reveal')sound(s.result.userPicks[s.revealIndex]===s.result.taPicks[s.revealIndex]);return;}
  if(action==='new-round'){client.reset();return flow.start(client.state()?.price??null);}
  if(action==='replay'){client.reset();return flow.enter('choice');}
  if(action==='hall')return open('hall',{origin:'world',dreamId:identity.dreamId});
  if(action==='back'){if(origin==='chat'){flow.leave();host?.leave?.('chat',returnPoint);return;}if(flow.current().screen==='hall'){flow.leave();host?.leave?.('world');return;}return open('hall',{origin:'world',dreamId:identity.dreamId});}
  if(action==='share')return showShare();
 }
 function animateScore(score){const node=panel.querySelector('[data-play-score]');if(!node||reduced())return;const begin=root.performance.now();function frame(time){if(!node.isConnected)return;const t=Math.min(1,(time-begin)/1200);node.textContent=String(Math.round(Number(score)*(1-(1-t)**3)));if(t<1)root.requestAnimationFrame(frame);}root.requestAnimationFrame(frame);}
 function toast(text){const el=panel.querySelector('.play-toast');if(el){el.hidden=false;el.textContent=text;root.setTimeout(()=>{if(el.isConnected)el.hidden=true;},3000);}}
 async function shareCanvas(){const state=flow.current();if(!state.result)throw new Error('请先完成这一局');const people=panel.querySelectorAll('.play-pair>div'),left=people[0]?.querySelector('img'),right=people[1]?.querySelector('img');const shareIdentity={...identity,userAvatar:left?.currentSrc||left?.src||identity.userAvatar,dreamAvatar:right?.currentSrc||right?.src||identity.dreamAvatar};return root.SHEXPlayChoiceShare.create({document:doc,result:state.result,identity:shareIdentity,questions:client.progress()?.questions||[]});}
 async function showShare(){const control=panel.querySelector('[data-play-action="share"]');control.disabled=true;try{const blob=await shareCanvas();if(!valid())return;if(shareUrl)root.URL.revokeObjectURL(shareUrl);shareUrl=root.URL.createObjectURL(blob);const dialog=doc.createElement('dialog');dialog.className='play-share-dialog';dialog.innerHTML=`<form method="dialog"><button class="play-button" aria-label="关闭卡片预览">关闭</button></form><img src="${shareUrl}" alt="你和梦角的默契成绩分享卡"><a class="play-button is-primary" href="${shareUrl}" download="我们的默契.png">下载图片</a><p>手机也可以长按图片保存。</p>`;dialog.addEventListener('close',()=>{dialog.remove();if(shareUrl){root.URL.revokeObjectURL(shareUrl);shareUrl=null;}control?.focus();});doc.body.append(dialog);dialog.showModal();}catch(error){toast(error.message||'卡片制作失败，请重试');}finally{if(control.isConnected)control.disabled=false;}}
 function configure(options={}){if(options.preview){if(doc.body.dataset.playPreview!=='true')throw new Error('预览注入只在独立预览页面开放');config=options;}else host=options;}
 async function enter(route='hall',options={}){
  origin=options.origin||origin||'world';identity=currentIdentity();ensure();renderedView=null;
  if(!identity?.dreamId||!identity?.userId||!['single','private_single','gallery_single','dream'].includes(identity.kind)){panel.innerHTML='<div class="play-shell"><h1>请选择一位单人梦角</h1><p>登录后与梦角一起玩。</p><button class="play-button" type="button" data-play-action="back">返回 X世界</button></div>';return;}
  if(options.dreamId&&options.dreamId!==identity.dreamId)return;
  if(route==='ludo'){
    flow?.leave();
    const inviteQuery=/^\d{1,2}-[1-6]$/.test(options.levelId||'')?'?inviteLevel='+encodeURIComponent(options.levelId):'';
    panel.innerHTML=`<iframe class="play-ludo-frame" title="恋爱飞行棋" src="./x-world/play/ludo/chapter.html${inviteQuery}" allow="clipboard-write"></iframe>`;
    return;
  }
  if(!client||client.ownerId!==identity.userId||client.dreamId!==identity.dreamId){flow?.leave();client=root.SHEXPlayChoiceClient.createSession({currentUser:config.preview?()=>({userId:identity.userId,sessionToken:'local-preview-only'}):()=>root.SHEXAuth?.current?.(),dreamId:()=>identity.dreamId,accessCode:()=>currentIdentity()?.playAccessCode||'',callFunction:config.preview?config.callFunction:undefined});client.ownerId=identity.userId;client.dreamId=identity.dreamId;flow=root.SHEXPlayChoiceFlow.create(client,render);}
  return flow.enter(route);
 }
 function open(route='hall',options={}){if(options.origin==='chat'&&(origin!=='chat'||flow?.current().screen==='closed'))returnPoint=host?.captureChat?.();origin=options.origin||'world';if(config.preview){if(route==='ludo'){root.location.href=new URL('ludo/index.html',root.location.href).href;return;}ensure().style.display='block';doc.body.dataset.xPage='play';root.history.replaceState(null,'',route==='choice'?'#x-play/choice':'#x-play');return enter(route,options);}host?.show?.(route,options);}
 doc.addEventListener('shex:auth-change',()=>{client?.accountChanged();flow?.leave();identity=null;if(doc.body.dataset.xPage==='play')host?.leave?.('world');});
 root.SHEXPlay=Object.freeze({configure,open,enter,current:()=>({...(flow?.current()||{screen:'closed'}),progress:client?.progress()||null,identity:identity?{...identity}:null}),ludoContext:()=>({identity:currentIdentity(),auth:root.SHEXAuth?.current?.()}),resolveAvatarImages:scope=>host?.resolveAvatarImages?.(scope),leave:()=>flow?.leave(),shareCanvas});
})(typeof window!=='undefined'?window:globalThis);
