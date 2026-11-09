// X小宠里的小音乐播放器：左上角一个小音符，点开是顶部中间的一条播放条（和右上角小飞机的输入框对称）。
// 它只是 X陪伴 / X传讯 那个共用播放器的又一个遥控面板：歌单、当前歌曲、进度、单曲/连续全是同一份，
// 这里不保存任何状态，全部通过 window.SHEXSharedMusic 读写。
(function(root,factory){
  'use strict';const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SHEXPetMusic=api;
})(typeof window!=='undefined'?window:globalThis,function(env){
  'use strict';
  const ICONS={
    play:'<path d="M8 5.5v13l11-6.5z"/>',pause:'<path d="M7 5.5h3.4v13H7zM13.6 5.5H17v13h-3.4z"/>',
    previous:'<path d="M17.5 6.5 9.5 12l8 5.5zM6.5 6.5v11h1.6v-11z"/>',next:'<path d="m6.5 6.5 8 5.5-8 5.5zM15.9 6.5v11h1.6v-11z"/>'
  };
  const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">'+ICONS[name]+'</svg>';
  function create(doc=env.document,options={}){
    const music=()=>options.music||env.SHEXSharedMusic||null;
    let open=false,timer=null,panel=null;
    const find=selector=>panel?.querySelector?.(selector)||null;
    function view(){
      const status=music()?.status?.()||{};
      return {title:status.title||'暂未选择音乐',artist:status.artist||'',playing:status.playing===true,loaded:status.loaded===true,
        progress:Math.max(0,Math.min(100,Number(status.progress)||0)),mode:status.mode==='single'?'single':'sequence'};
    }
    function render(){
      if(!panel)return;
      const toggle=find('[data-pet-music-toggle]'),box=find('[data-pet-music-panel]');
      const now=view();
      if(panel.dataset)panel.dataset.petMusicOpen=String(open);
      if(panel.dataset)panel.dataset.petMusicPlaying=String(now.playing);
      if(box)box.hidden=!open;
      toggle?.setAttribute('aria-expanded',String(open));
      toggle?.setAttribute('aria-label',open?'收起音乐播放器':'打开音乐播放器');
      if(!open)return;
      const play=find('[data-pet-music-act="toggle"]'),title=find('[data-pet-music-title]'),bar=find('[data-pet-music-bar]'),mode=find('[data-pet-music-act="mode"]');
      const label=now.title+(now.artist?' · '+now.artist:'');
      if(title&&title.textContent!==label)title.textContent=label;
      if(play&&play.dataset.playing!==String(now.playing)){play.dataset.playing=String(now.playing);play.innerHTML=icon(now.playing?'pause':'play');play.setAttribute('aria-label',now.playing?'暂停':'播放');}
      if(bar?.style)bar.style.width=now.progress+'%';
      const modeText=now.mode==='single'?'单曲':'连续';
      if(mode&&mode.textContent!==modeText){mode.textContent=modeText;mode.setAttribute('aria-label',modeText==='单曲'?'单曲循环，点击切换为连续播放':'连续播放，点击切换为单曲循环');}
    }
    function setOpen(next){
      if(next&&panel?.dataset?.petComposerOpen==='true'){
        // 输入框和播放条用的是同一个位置：打开播放条前先把输入框收起来。
        try{panel.dispatchEvent(new env.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}catch(_){}
      }
      open=!!next;render();
    }
    async function act(name){
      const api=music();if(!api?.act)return;
      try{await api.act(name);}catch(_){}
      render();
    }
    function mount(){
      panel=doc.querySelector('#xPetPanel');if(!panel||panel.dataset?.petMusicBound==='true')return false;
      if(panel.dataset)panel.dataset.petMusicBound='true';
      for(const name of ['previous','next'])find('[data-pet-music-act="'+name+'"]')?.insertAdjacentHTML?.('afterbegin',icon(name));
      find('[data-pet-music-toggle]')?.addEventListener('click',event=>{event.stopPropagation?.();setOpen(!open);});
      find('[data-pet-music-panel]')?.addEventListener('click',event=>{
        event.stopPropagation?.();
        const name=event.target?.closest?.('[data-pet-music-act]')?.dataset?.petMusicAct;if(name)void act(name);
      });
      // 点小飞机打开输入框时，把播放条让出来。
      find('[data-pet-chat-toggle]')?.addEventListener('click',()=>{if(open)setOpen(false);},true);
      timer=env.setInterval(()=>{if(panel&&(open||panel.dataset?.petMusicPlaying==='true'||panel.offsetParent!==null))render();},500);
      render();return true;
    }
    // 音乐“在场”：播放条开着，或者已经有歌载入（在放或暂停）。梦角只有这时才会感知和控制音乐。
    function active(){return open||view().loaded;}
    return {mount,render,setOpen,isOpen:()=>open,active,act,stop(){if(timer!==null)env.clearInterval(timer);timer=null;}};
  }
  const api={create};
  if(env.document&&typeof env.document.addEventListener==='function'){
    const instance=create();
    const start=()=>instance.mount();
    if(env.document.readyState==='loading')env.document.addEventListener('DOMContentLoaded',start);else start();
    Object.assign(api,{active:instance.active,setOpen:instance.setOpen,isOpen:instance.isOpen,render:instance.render});
  }
  return api;
});
