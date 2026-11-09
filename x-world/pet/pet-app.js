(function (root, factory) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? {
    state: require('./pet-state.js'), actions: require('./pet-actions.js'), storage: require('./pet-owned-storage.js'), care: require('./pet-care.js'), scene: require('./pet-scene.js')
  } : null);
  if (common) module.exports = api;
  else root.SHEXPetApp = api.createApp(root);
})(typeof window !== 'undefined' ? window : globalThis, function (dependencies) {
  'use strict';
  let nextInstance = 0;
  function createApp(env) {
    const doc = env.document;
    const State = env.SHEXPetState || dependencies?.state;
    const Actions = env.SHEXPetActions || dependencies?.actions;
    const Storage = env.SHEXPetOwnedStorage || dependencies?.storage;
    const Care = env.SHEXPetCare || dependencies?.care;
    const wallNow = () => (env.Date || Date).now();
    const motionNow = () => env.performance.now();
    const visitId=(env.crypto||globalThis.crypto)?.randomUUID?.()||wallNow()+':'+Math.random().toString(36)+':'+(++nextInstance);
    let local = null;
    try {local = env.localStorage;} catch (_) { /* In-memory care still works in restricted browsers. */ }
    const store = Storage.createStorage(local, State);
    const actionsByScope = new Map();
    let actions = Actions.createActions(), identity = null, identitySignature = '', nameMode = 'adopt';
    let activeSpecies = 'dog', adoptionTarget = null, highestLevel = 0;
    let state = null, saveState = 'unavailable', transient = null, feedback = null;
    let care = null, pendingCare = null, pendingScene = null, placeOpen = false, roomToken = 0;
    let arrivalPending = null;
    const random = () => (env.Math || Math).random();
    let root = null, renderer = null, active = false, raf = null, timer = null, frames = 0;
    let elapsed = 0, lastFrame = null, lastPaint = -Infinity, pageHidden = false;
    let media = null, removers = [], infoOpen = false;
    const visible = () => active && !pageHidden && doc.visibilityState !== 'hidden';
    const ready = () => visible() && !!state && !arrivalPending;
    const reduced = () => media?.matches === true;
    const find = selector => root?.querySelector(selector);
    const naming = () => nameMode === 'rename' || adoptionTarget !== null;
    const interaction = () => transient && motionNow() < transient.until ? transient.kind : null;
    function text(selector, value) {const node = find(selector); if (node) node.textContent = String(value);}
    function showFeedback(message, detail = '', duration = 3200) {
      feedback = {message, detail, until: motionNow() + duration};
    }
    function persist() {
      if (!state || !identity?.userId || !identity?.dreamId) return;
      const result = store.save(identity, state, wallNow(), care, activeSpecies);
      state = result.state; saveState = result.ok ? 'saved' : 'unavailable';
      highestLevel = store.maxLevel(identity);
    }
    function observe(before, type, actor='user') {
      const result=Care.observe(care,before,state,{type,actor,...identity,timestamp:wallNow()});
      // The shared chat dedupes event IDs within a dream, not within each pet.
      for(const event of result.events)if(activeSpecies!=='dog')event.id=activeSpecies+':'+event.id;
      care=result.care;env.SHEXPetJournal?.record?.(identity,result.events,activeSpecies);return result.events;
    }
    function settle(notify=true) {if(state&&!arrivalPending){const before=state;state=State.advance(state,wallNow());const events=observe(before);if(events.length){if(notify&&visible())respond(events);else persist();}return events;}return [];}
    function chatBusy(){return env.SHEXLightChat?.snapshot?.(identity)?.pending===true;}
    // Each unlocked species is a new adoption with its own local progress.
    let speciesOpen=false,speciesBuilt=false;
    const Assets=()=>env.SHEXPetSpriteAssets||null;
    function speciesKey(){return activeSpecies;}
    function species(){const assets=Assets();return String(assets?.speciesName?.(speciesKey())||assets?.SPECIES||'');}
    function speciesInfo(key){const list=Assets()?.SPECIES_LIST;return list&&Object.prototype.hasOwnProperty.call(list,key)?list[key]:null;}
    function speciesUnlocked(key){const info=speciesInfo(key);return !!info&&(isAdmin()||highestLevel>=(info.level||0));}
    function useActions(){
      const key=Storage.keyFor(identity,activeSpecies);
      if(key&&!actionsByScope.has(key))actionsByScope.set(key,Actions.createActions());
      actions=actionsByScope.get(key)||Actions.createActions();
    }
    // Read persisted return IDs before settling a visit; a cold IndexedDB read
    // must not allow care or a second offline settlement to race restoration.
    function restoreArrival(restored,key){
      const journal=env.SHEXPetJournal,archive=env.SHEXPetJournalStore;
      if(!state||!restored.before||!journal?.arrive)return null;
      const owner={...identity},daily=archive?.enabled(owner),before=daily?(archive.pendingArrival?.(owner,key)||restored.before):restored.before;
      const options={identity:owner,species:key,before,now:wallNow(),Actions,State,places:Object.keys(SCENES).filter(name=>name!=='home'&&unlocked(name)).map(name=>SCENES[name])};
      restored.before=before;
      if(archive?.enabled(owner)&&!archive.hydrated(owner,key)&&archive.whenHydrated){
        archive.rememberArrival?.(owner,key,before);
        const pending={token:roomToken};arrivalPending=pending;
        Promise.resolve(archive.whenHydrated(owner,key)).then(()=>{
          if(arrivalPending!==pending)return;
          arrivalPending=null;
          const live=currentIdentity();
          if(!active||activeSpecies!==key||live.userId!==owner.userId||live.dreamId!==owner.dreamId)return;
          const away=journal.arrive(options);if(away)state=away;
          const events=observe(restored.before);if(events.length||away)persist();archive.clearArrival?.(owner,key,before.lastSavedAt);
          updateUI();paint();resume();if(events.length)respond(events,false);
        }).catch(()=>{if(arrivalPending===pending){arrivalPending=null;showFeedback('日记暂时没有读到','养宠进度仍保留，稍后重新进入可重试');updateUI();resume();}});
        return null;
      }
      const away=journal.arrive(options);if(daily)archive.clearArrival?.(owner,key,before.lastSavedAt);return away;
    }
    function restorePet(key){
      roomToken++;arrivalPending=null;pendingCare=null;pendingScene=null;transient=null;previewUntil=0;placeOpen=false;
      speciesOpen=false;adoptionTarget=null;nameMode='adopt';infoOpen=false;stop();
      activeSpecies=key;useActions();
      const restored=store.loadPet(identity,key,wallNow());state=restored.state;saveState=restored.status;
      env.SHEXPetJournal?.setContext?.(identity,key);
      env.SHEXPetLetters?.setContext?.();
      const away=restoreArrival(restored,key);if(away)state=away;
      highestLevel=store.maxLevel(identity);
      care=state?Care.normalize(restored.care,restored.before||state,wallNow()):null;
      const events=state&&restored.before&&!arrivalPending?observe(restored.before):[];
      if(events.length||away)persist();
      Assets()?.setSpecies?.(key);lastPaint=-Infinity;
      env.SHEXPetRoomChat?.setContext?.({identity,petName:state?.petName||'',adopted:!!state});
      updateUI();paint();resume();if(events.length)respond(events,false);
      return restored;
    }
    function cancelNaming(){
      nameMode='adopt';adoptionTarget=null;text('[data-pet-name-error]','');
      find('[data-pet-name-input]')?.blur?.();updateUI();resume();find('[data-pet-info]')?.focus();
      env.SHEXPetRoomChat?.unlockKeyboard?.(root);
    }
    function chooseSpecies(key){
      if(!syncForOperation()||!ready()||naming())return {ok:false};
      const info=speciesInfo(key);if(!info)return {ok:false};
      if(key===activeSpecies){showFeedback('正在陪着'+state.petName);updateUI();return {ok:false,current:true};}
      const owned=store.listPets(identity).some(pet=>pet.species===key);
      if(!owned&&!speciesUnlocked(key)){showFeedback(info.label+' · 暂未解锁','最高等级到 '+info.level+' 级就能领养',PREVIEW_MS);updateUI();return {ok:false,locked:true};}
      settle(false);persist();
      if(saveState!=='saved'){showFeedback('暂时无法保存，先等一下再切换小宠吧');updateUI();return {ok:false};}
      if(!owned){
        roomToken++;pendingCare=null;pendingScene=null;transient=null;previewUntil=0;
        speciesOpen=false;infoOpen=false;adoptionTarget=key;nameMode='adopt';
        const input=find('[data-pet-name-input]');if(input)input.value='';text('[data-pet-name-error]','');
        updateUI();input?.focus();return {ok:true,adopting:true};
      }
      const selected=store.setActive(identity,key);
      if(!selected.ok){showFeedback(selected.error||'切换没有保存，请再试一次');updateUI();return {ok:false};}
      restorePet(key);showFeedback('切换到了 '+state.petName);updateUI();return {ok:true};
    }
    function renderSpecies(){
      const track=find('[data-pet-species-track]'),list=Assets()?.SPECIES_LIST;
      if(!track||!list)return;
      if(!speciesBuilt&&typeof doc.createElement==='function'&&typeof track.appendChild==='function'){
        speciesBuilt=true;
        for(const key of Object.keys(list)){
          const card=doc.createElement('button');card.type='button';card.className='pet-species-card';card.dataset.petSpecies=key;
          const img=doc.createElement('img');img.alt='';img.draggable=false;img.loading='lazy';img.src=Assets().idleUrl(key);
          const name=doc.createElement('strong');name.textContent=list[key].label;
          const note=doc.createElement('small');note.dataset.petSpeciesNote='';
          card.append(img,name,note);track.appendChild(card);
        }
      }
      const current=speciesKey(),pets=new Map(store.listPets(identity).map(pet=>[pet.species,pet.state]));
      const nextLockedSpecies=Object.keys(list).filter(key=>!pets.has(key)&&!speciesUnlocked(key)).sort((a,b)=>(list[a].level||0)-(list[b].level||0))[0]||null;
      for(const card of Array.from(track.children||[])){
        const key=card.dataset?.petSpecies,info=list[key];if(!info)continue;
        const pet=pets.get(key),locked=!pet&&!speciesUnlocked(key),here=key===current;
        card.dataset.petLocked=String(locked);card.dataset.petCurrent=String(here);
        // 未解锁小宠：只有下一个待解锁的显示灰色半透明形象，其余一律纯黑剪影。
        card.dataset.petPreview=!locked?'':key===nextLockedSpecies?'next':'silhouette';
        card.dataset.petOwned=String(!!pet);
        const title=card.querySelector?.('strong');if(title)title.textContent=pet?pet.petName:info.label;
        const note=card.querySelector?.('[data-pet-species-note]');
        if(note)note.textContent=pet?'Lv.'+pet.level+(here?' · 当前':''):locked?'Lv.'+info.level+' 解锁':'可领养';
        card.setAttribute?.('aria-label',info.label+(pet?'，'+pet.petName+'，Lv.'+pet.level+(here?'，当前':'，点击切换'):locked?'，'+info.level+' 级解锁':'，可领养'));
      }
    }
    function replyMode(){try{return env.SHEXLightChat?.mode?.(identity)==='ai'?'ai':'card';}catch(_){return 'ai';}}
    function respond(events, allowCare=true) {
      if(!ready()||naming()||!events.length)return;
      if(saveState!=='saved'){persist();return;}
      const important=events.some(e=>!['pet','feed','play','sleep','wake'].includes(e.type));
      const sequence=care.sequence;care.handledSequence=sequence;
      // Only one lottery per observed group. Persist its result before starting
      // a paid task; refreshing cannot draw the same event again.
      const hit=random()<Care.probability(events,replyMode());
      if(hit&&chatBusy()&&important){
        if(!care.pendingImportant||events.some(e=>e.type==='adopt'))care.pendingImportant={events:events.slice(-3),sequence};
      }
      const action=allowCare&&Care.hasDreamName(identity?.dreamName)?Care.choose(state,care,wallNow(),random,{mode:replyMode()}):null;
      if(action&&!pendingCare)pendingCare={action,userId:identity.userId,dreamId:identity.dreamId};
      else if(!action&&allowCare)planScene();
      persist();
      if(hit&&!chatBusy()&&saveState==='saved')env.SHEXLightChat?.sendEvent?.({...identity},Care.context(identity,state,sceneCare(),events,wallNow(),species()));
    }
    // ---- 场景：家 / 户外。只换背景，宠物的状态、动作和点击位置完全共用。 ----
    const SCENES={home:'家',outdoor:'户外',beach:'海边',market:'市集',spring:'春',summer:'夏',autumn:'秋',winter:'冬'};
    // 家以外的场景按宠物等级逐个解锁；管理员账号不受限制。未解锁时可以点开看一眼预览。
    const SCENE_LEVELS={outdoor:5,beach:10,market:20,spring:30,summer:40,autumn:50,winter:60},PREVIEW_MS=3000;
    const needLevel=target=>SCENE_LEVELS[target]||0;
    let previewUntil=0,previewScene='outdoor';
    // 管理员和指定账号：场景、品种全部直接解锁，不看等级。其他账号照常按等级解锁。
    const FULL_UNLOCK_USER_IDS=['shex_bd187c0e-0cfa-4fb2-8dac-a2c89667733a'];
    function isAdmin(){try{return env.SHEXAuth?.isAdmin?.()===true||FULL_UNLOCK_USER_IDS.includes(String(env.SHEXAuth?.current?.()?.userId||''));}catch(_){return false;}}
    function unlocked(target){return target==='home'||isAdmin()||highestLevel>=needLevel(target);}
    function scene(){return care?.scene&&care.scene!=='home'&&Object.prototype.hasOwnProperty.call(SCENES,care.scene)&&unlocked(care.scene)?care.scene:'home';}
    function sceneCare(){return care?{...care,scene:scene(),outdoorLocked:!unlocked('outdoor'),places:Object.keys(SCENES).filter(name=>name!=='home'&&unlocked(name))}:care;}
    // 底部左右箭头和左右滑动：按菜单里的顺序换到上一个/下一个场景，首尾相接。
    // 没解锁的场景只预览并提示“暂未解锁”；预览期间继续翻，会从正在看的那一张接着走。
    function stepScene(direction){
      if(!syncForOperation()||!ready()||!care||naming())return {ok:false};
      const next=nextLockedScene(),order=Object.keys(SCENES).filter(name=>unlocked(name)||name===next),at=Math.max(0,order.indexOf(shownScene()));
      const result=setScene(order[(at+(direction<0?-1:1)+order.length)%order.length],'user');
      if(result.message)showFeedback(result.message);
      updateUI();return result;
    }
    function previewing(){return previewUntil>0&&motionNow()<previewUntil;}
    // 只有“下一个待解锁”的场景可以灰色预览；更后面的未解锁场景不展示画面。
    function nextLockedScene(){return Object.keys(SCENES).find(name=>name!=='home'&&!unlocked(name))||null;}
    function shownScene(){return previewing()?previewScene:scene();}
    function setScene(target,actor='user'){
      if(!ready()||naming()||!care||!Object.prototype.hasOwnProperty.call(SCENES,target))return {ok:false};
      placeOpen=false;
      if(!unlocked(target)){
        if(actor!=='user'){updateUI();return {ok:false,locked:true};}
        if(target!==nextLockedScene()){
          showFeedback(SCENES[target]+' · 暂未解锁','先解锁前面的场景，才能看到这里',PREVIEW_MS);updateUI();
          return {ok:false,locked:true};
        }
        previewUntil=motionNow()+PREVIEW_MS;previewScene=target;
        showFeedback(SCENES[target]+' · 暂未解锁','小宠再长大一点，长到 '+needLevel(target)+' 级就可以来了',PREVIEW_MS);
        lastPaint=-Infinity;updateUI();paint();
        return {ok:false,locked:true};
      }
      previewUntil=0;
      if(scene()===target){updateUI();return {ok:false,message:state.petName+(target==='home'?'已经在家啦':'已经在这里啦')};}
      observe(state,target,actor==='dream'?'dream':'user');
      care.scene=target;care.sceneChangedAt=wallNow();
      persist();
      showFeedback(Care.sceneToast(actor,identity?.dreamName,state.petName,target));
      lastPaint=-Infinity;updateUI();paint();
      return {ok:true};
    }
    function planScene(){
      if(pendingScene||pendingCare||!Care.hasDreamName(identity?.dreamName))return;
      const target=Care.chooseScene(state,{...care,scene:scene()},wallNow(),random,Object.keys(SCENES).filter(name=>name!=='home'&&unlocked(name)));
      if(target&&unlocked(target))pendingScene={target,userId:identity.userId,dreamId:identity.dreamId};
    }
    function runScene(){
      if(!pendingScene||!ready()||interaction()||naming())return;
      const planned=pendingScene;pendingScene=null;
      const current=currentIdentity();
      if(current.userId!==planned.userId||current.dreamId!==planned.dreamId||identity.userId!==planned.userId||identity.dreamId!==planned.dreamId)return;
      if(state.isSleeping||!Care.hasDreamName(identity.dreamName))return;
      setScene(planned.target,'dream');
    }
    // ---- 场景里的小物件：点一下有一句小反应，用的就是宠物心情那条提示栏。 ----
    // {pet} 会换成宠物的真实名字；同一个物件有几句话时轮流出现。
    const PROP_LINES={
      desk:['{pet}不想学习','{pet}趴在桌边看了一眼作业，转身走开了'],
      stool:['{pet}够不着小凳子','{pet}想跳上去，试了一下又放弃了'],
      frame:['相框里有两颗小爱心','一颗是你，一颗是{pet}'],
      shelf:['{pet}看不懂书，但喜欢书的味道','架子上的小花今天也开着'],
      cabinet:['抽屉里藏着{pet}的小零食','{pet}盯着第二层抽屉看了很久'],
      plant:['{pet}闻了闻叶子','绿植又长出了一片新叶'],
      throw:['叠好的小毯子，软软的','{pet}最喜欢把脸埋进毯子里'],
      toycar:['{pet}的小木车','{pet}用鼻子把小木车顶出去一点点'],
      basket:['篮子里是{pet}的玩具','{pet}的宝贝都收在这里'],
      books:['地上有两本没看完的书','{pet}把书当成了枕头'],
      sun:['今天的太阳暖暖的','{pet}眯起了眼睛'],
      cloud:['云慢慢地飘','那朵云有点像{pet}'],
      sky:['天很蓝，风很轻','{pet}抬头看了看天'],
      tree:['{pet}想在树下乘凉','树上开了几朵小花','树荫下最适合打盹'],
      bench:['{pet}想让你坐下来陪它','长椅被太阳晒得暖暖的'],
      pot:['盆栽开花了','{pet}凑过去闻了闻'],
      garden:['后面的花园开花了','{pet}朝花园那边摇了摇尾巴'],
      fence:['栅栏外面有小鸟在叫','{pet}从栅栏缝里往外看'],
      flowerbed:['小花开得正好','{pet}小心地绕开了花'],
      wateringcan:['给小花浇了点水','水壶里还有半壶水','{pet}被水珠溅到，抖了抖毛'],
      sea:['海浪一下一下地拍上来','{pet}被浪花吓得往后跳了一步','海风咸咸的'],
      sailboat:['远处有一只小帆船','{pet}盯着小帆船看了很久'],
      island:['那座小岛上会有什么呢','{pet}也想去岛上看看'],
      palm:['椰子树的影子刚好够{pet}躲太阳','树上挂着两颗椰子'],
      parasol:['遮阳伞下很凉快','{pet}钻到了伞的影子里'],
      deckchair:['躺椅留给你，{pet}趴在旁边','躺椅被晒得暖暖的'],
      sandcastle:['{pet}差点把沙堡踩塌','沙堡上插着一面小红旗'],
      bucket:['小桶里装着刚捡的贝壳','{pet}把鼻子伸进小桶里闻了闻'],
      beachball:['{pet}用鼻子顶了一下沙滩球','沙滩球滚出去一点点'],
      cooler:['冰箱里有冰好的西瓜','{pet}守着小冰箱不肯走'],
      drink:['这是你的冰饮','{pet}对着吸管歪了歪头'],
      fruitstall:['今天的橘子很甜','{pet}闻了闻苹果，打了个喷嚏','老板说可以给{pet}尝一小块'],
      flowerstall:['花车上的花开得正好','{pet}鼻尖沾到了一点花粉','给{pet}挑一朵吧'],
      bunting:['彩旗在风里晃','灯串到了晚上会亮起来'],
      rooftops:['老街的屋顶一层叠着一层','有人在窗边晾了衣服'],
      lamppost:['{pet}绕着路灯转了一圈','路灯还没到点亮的时候'],
      barrel:['木桶上种了一棵小花','{pet}想跳上木桶，没成功'],
      bread:['刚出炉的面包，{pet}闻到了','{pet}眼巴巴地看着面包'],
      shopbasket:['篮子里是今天买的东西','{pet}想把法棍叼走'],
      signboard:['小黑板上写着今日推荐','{pet}看不懂字，但看得很认真'],
      hamper:['野餐篮里有三明治，{pet}闻到了','{pet}守着野餐篮不肯走'],
      thermos:['保温杯里是热茶','{pet}对茶不感兴趣'],
      // 春：樱花河堤
      cherry:['樱花开满了一整棵树','一片花瓣落在了{pet}的鼻尖上','{pet}想在樱花树下睡午觉'],
      farblossom:['对岸的樱花连成了一片粉色的云','{pet}望着对岸看了很久'],
      bridge:['小木桥下面漂着花瓣','{pet}想去桥上看看'],
      river:['河水慢慢地流，带着花瓣','{pet}看见水里有自己的影子'],
      tulips:['郁金香排成了一排','{pet}凑过去闻了闻郁金香'],
      lunchbox:['便当用布包得好好的','{pet}闻到便当的味道了'],
      pinwheel:['小风车转了起来','{pet}盯着风车，脑袋跟着转'],
      dango:['篮子里有三色团子','{pet}眼巴巴地看着团子'],
      teaflask:['水壶里是樱花茶','{pet}对茶不感兴趣'],
      // 夏：荷塘木栈台
      willow:['柳条垂下来，被风吹得轻轻晃','{pet}伸爪子去够柳条','柳树下面最凉快'],
      pond:['荷花开了好几朵','一只小青蛙跳进了水里','{pet}盯着荷叶上的水珠'],
      reeds:['对岸的芦苇沙沙地响','{pet}竖起耳朵听了一会儿'],
      rail:['{pet}把下巴搁在栏杆上看水','绳子栏杆被太阳晒得暖暖的'],
      lotuspot:['盆里养着一片荷叶','{pet}用鼻子碰了碰荷叶'],
      watermelon:['半个西瓜，勺子已经插好了','{pet}舔了一口西瓜，眯起了眼睛'],
      fan:['给{pet}扇了扇风','蒲扇摇一摇，凉快多了'],
      icetub:['木桶里冰着两瓶汽水','{pet}把爪子搭在冰桶边上乘凉'],
      icedtea:['这是你的冰茶','杯子外面全是小水珠'],
      // 秋：枫叶银杏林
      maple:['枫叶红得像一团火','一片枫叶落在了{pet}背上','{pet}抬头看了很久红叶'],
      ginkgo:['银杏叶金灿灿的','{pet}叼起了一片小扇子一样的叶子'],
      forest:['林子里一棵红一棵黄','风一吹，叶子哗啦啦地落'],
      persimmons:['绳子上晒着一串柿子','{pet}够不着柿子，只能看着'],
      stonelantern:['石灯笼安安静静地立着','{pet}绕着石灯笼转了一圈'],
      leafpile:['落叶堆得高高的','{pet}一头扎进了落叶堆里','落叶堆里沙沙响'],
      acorns:['地上有三颗橡果','{pet}用鼻子把橡果拱到了一起'],
      persimmonbasket:['篮子里的柿子熟透了','{pet}闻了闻柿子'],
      pumpkin:['一个圆滚滚的小南瓜','{pet}把爪子搭在了南瓜上'],
      // 冬：雪中小木屋
      moon:['月亮出来了','{pet}对着月亮看了一会儿'],
      pine:['松树上积了厚厚的雪','一小团雪从树上掉下来，{pet}吓了一跳'],
      smallpines:['远处的小松树也白了头','雪地里静悄悄的'],
      chimney:['烟囱在冒烟，屋里一定很暖和','{pet}闻到了烤东西的味道'],
      cabinwindow:['窗户里亮着暖暖的灯','{pet}想进屋烤火'],
      cabindoor:['门上挂着一个小花环','{pet}在门口蹭了蹭雪'],
      cabin:['小木屋的屋顶盖满了雪','屋檐下很暖和'],
      snowman:['小雪人戴着帽子和红围巾','{pet}和小雪人对看了一会儿','{pet}偷偷舔了一口雪人'],
      plum:['红梅开了','{pet}闻了闻梅花，打了个喷嚏'],
      sled:['小雪橇，下次拉着{pet}滑','{pet}坐上雪橇不肯下来'],
      campinglantern:['提灯亮着，暖暖的','{pet}往提灯边上靠了靠'],
      firewood:['柴火码得整整齐齐','{pet}叼走了一根小树枝'],
      cocoa:['这是你的热可可','{pet}凑过来闻了闻，热气扑了一脸'],
      path:['小路上铺满了落叶','{pet}踩得落叶沙沙响']
    };
    const propTurns=Object.create(null);
    let lampOn=false;
    function propLine(id){
      const lines=PROP_LINES[id];if(!lines)return '';
      const turn=propTurns[id]||0;propTurns[id]=turn+1;
      return lines[turn%lines.length].replace(/\{pet\}/g,state.petName);
    }
    function touchProp(id){
      if(!id||!ready()||naming()||previewing())return false;
      if(placeOpen){placeOpen=false;updateUI();}
      if(id==='window'){
        // 窗外就是小院：解锁后点窗户直接出门，没解锁只提示。
        if(!unlocked('outdoor')){showFeedback('户外场景尚未解锁','小宠再长大一点，长到 '+needLevel('outdoor')+' 级就可以来了');updateUI();return true;}
        if(!syncForOperation())return false;
        setScene('outdoor','user');return true;
      }
      if(id==='gate'){if(!syncForOperation())return false;setScene('home','user');return true;}
      if(id==='lamp'){
        lampOn=!lampOn;showFeedback(lampOn?'台灯亮起来了':'台灯关掉了',lampOn?state.petName+'往暖暖的光里靠了靠':'');
        lastPaint=-Infinity;updateUI();paint();return true;
      }
      const line=propLine(id);if(!line)return false;
      showFeedback(line);updateUI();return true;
    }
    function onCanvasClick(event,canvas){
      const box=canvas.getBoundingClientRect?.();if(!box||!box.width||!box.height)return;
      const x=(event.clientX-box.left)/box.width*192,y=(event.clientY-box.top)/box.height*320;
      touchProp(env.SHEXPetScene?.propAt?.(shownScene(),x,y));
    }
    // 字卡模式下用户在房间里每说一句话，梦角有同样的机会顺手照顾一下宠物。
    // 不看用户说了什么；AI 模式由模型在回复里自己决定，不走这里。
    function chatSent(){
      if(!ready()||naming()||saveState!=='saved'||replyMode()!=='card'||pendingCare||!Care.hasDreamName(identity?.dreamName))return false;
      const action=Care.choose(state,care,wallNow(),random,{mode:'card',chat:true});
      if(!action){planScene();return false;}
      pendingCare={action,userId:identity.userId,dreamId:identity.dreamId};return true;
    }
    function runCare() {
      if(!pendingCare||!ready()||interaction()||naming())return;
      const planned=pendingCare;pendingCare=null;
      const current=currentIdentity();
      if(current.userId!==planned.userId||current.dreamId!==planned.dreamId||identity.userId!==planned.userId||identity.dreamId!==planned.dreamId)return;
      const kind=planned.action;if(!Care.candidates(state,care,wallNow(),replyMode()).includes(kind)||!Care.hasDreamName(identity.dreamName))return;
      const before=state,result=actions.perform(kind==='wake'?'sleep':kind,state,motionNow(),{actor:'dream'});
      if(!result.ok)return;
      state=result.state;const dreamEvents=observe(before,kind,'dream');
      transient=result.duration?{kind:result.kind,start:motionNow(),until:motionNow()+result.duration,duration:result.duration}:null;
      persist();showFeedback(Care.toast(kind,identity.dreamName,state.petName));updateUI();paint();
      const important=dreamEvents.filter(e=>!['pet','feed','play','sleep','wake'].includes(e.type));if(important.length)respond(important,false);
    }
    function flushImportant(){
      if(!ready()||naming()||!care?.pendingImportant||chatBusy()||saveState!=='saved')return;
      const pending=care.pendingImportant;care.pendingImportant=null;persist();
      if(saveState==='saved')env.SHEXLightChat?.sendEvent?.({...identity},Care.context(identity,state,sceneCare(),pending.events,wallNow(),species()));
    }
    function updateUI() {
      if (!root) return;
      const owned = !!state, valid = !!(identity?.userId && identity?.dreamId);
      root.dataset.petAdopted = String(owned);
      const here=owned?scene():'home';root.dataset.petScene=here;root.dataset.petScenePreview=String(owned&&previewing());
      root.dataset.petPlaceOpen=String(placeOpen&&owned);
      if(owned)Assets()?.setSpecies?.(speciesKey());
      root.dataset.petSpeciesOpen=String(speciesOpen&&owned);
      const speciesSheetNode=find('[data-pet-species-sheet]');if(speciesSheetNode)speciesSheetNode.hidden=!(speciesOpen&&owned);
      find('[data-pet-species-toggle]')?.setAttribute('aria-expanded',String(speciesOpen&&owned));
      if(speciesOpen&&owned)renderSpecies();
      for(const key of Object.keys(SCENES)){
        if(key==='home')continue;const locked=owned&&!unlocked(key);
        text('[data-pet-scene-label="'+key+'"]',locked?SCENES[key]+' · Lv.'+needLevel(key)+' 解锁':SCENES[key]);
        const option=find('[data-pet-scene="'+key+'"]');if(option)option.dataset.petLocked=String(locked);
      }
      text('[data-pet-place-name]',SCENES[here]);
      const place=find('[data-pet-place]');
      if(place){place.disabled=!owned||naming();place.setAttribute('aria-expanded',String(placeOpen&&owned));place.setAttribute('aria-label','当前在'+SCENES[here]+'，点击切换场景');}
      const menu=find('[data-pet-place-menu]');if(menu)menu.hidden=!(placeOpen&&owned);
      for(const key of Object.keys(SCENES)){const option=find('[data-pet-scene="'+key+'"]');if(option){option.setAttribute('aria-checked',String(key===here));option.dataset.petCurrent=String(key===here);}}
      for (const selector of ['[data-pet-foot]', '[data-pet-chat-dock]']) {const node=find(selector);if(node)node.hidden=!owned;}
      const empty=find('[data-pet-empty]');if(empty)empty.hidden=valid;
      text('[data-pet-empty-text]', identity?.pending ? '正在读取你的梦角资料，请稍候…' : identity?.userId ? '先选择一个想一起养小宠的 TA' : '先登录，再和 TA 一起养小宠');
      const adoption=find('[data-pet-adopt]');if(adoption)adoption.hidden=!valid || (owned && !naming());
      const target=adoptionTarget||activeSpecies,kind=speciesInfo(target)?.label||'小狗';
      const image=find('[data-pet-adopt-image]');if(image){const src=Assets()?.idleUrl?.(target);if(src)image.src=src;image.alt='等待起名字的'+kind;}
      find('[data-pet-adopt-family]')?.setAttribute('aria-label','等待起名字的'+kind);
      text('[data-pet-adopt-title]',nameMode==='rename'?'修改宠物名字':adoptionTarget?'领养一只'+kind:'一起领养一个小家伙吧');
      text('[data-pet-adopt-description]',nameMode==='rename'?'给它一个新的名字，日常与成长都会保留。':adoptionTarget?'和'+(identity?.dreamName||'TA')+'一起，给这个小家伙取个名字。从 Lv.1 开始慢慢养大。':'这是你和'+(identity?.dreamName||'TA')+'共同养的第一只小宠。');
      text('[data-pet-name-submit]',nameMode==='rename'?'保存名字':'领养');
      const cancel=find('[data-pet-name-cancel]');if(cancel)cancel.hidden=!owned||!naming();
      const legacy=find('[data-pet-legacy-notice]');if(legacy)legacy.hidden=owned || !store.legacyAvailable();
      for(const kind of ['pet','feed','play','sleep']) {const button=find('[data-pet-target="'+kind+'"]');if(button)button.disabled=!owned || naming() || (kind==='pet' && state.isSleeping);}
      const info=find('[data-pet-info]');if(info)info.disabled=!owned;
      if (!owned) {
        root.dataset.petState='unadopted';
        const sheet=find('[data-pet-details]');if(sheet)sheet.hidden=true;
        const toast=find('[data-pet-feedback]');if(toast)toast.hidden=true;
        return;
      }
      const status = State.deriveStatus(state, interaction());
      root.dataset.petState = status;
      const descriptions = State.describe(state);
      for (const key of ['level', 'satiety', 'mood', 'intimacy', 'energy']) {
        text('[data-pet-stat="' + key + '"]', key === 'level' ? state[key] : Math.round(state[key]));
      }
      text('[data-pet-stat="exp"]', state.exp + ' / ' + State.requiredExp(state.level));
      text('[data-pet-name]', state.petName);
      text('[data-pet-details-title]', state.petName+'的日常');
      find('[data-pet-details]')?.setAttribute('aria-label',state.petName+'的状态');
      find('[data-pet-canvas]')?.setAttribute('aria-label',state.petName+(scene()==='home'?'的温暖像素房间':'所在的像素场景：'+SCENES[scene()]));
      find('[data-pet-target="pet"]')?.setAttribute('aria-label','点击'+state.petName+'，轻轻摸摸它');
      find('[data-pet-target="feed"]')?.setAttribute('aria-label','点击食盆，给'+state.petName+'喂饭');
      const toyLabel=(env.SHEXPetScene?.toyName||dependencies?.scene?.toyName)?.(activeSpecies)||'小玩具';
      find('[data-pet-target="play"]')?.setAttribute('aria-label','点击'+toyLabel+'，和'+state.petName+'陪玩');
      text('[data-pet-level]', 'Lv.' + state.level);
      text('[data-pet-intimacy]', Math.round(state.intimacy));
      for (const key of ['satiety', 'mood', 'intimacy', 'energy']) text('[data-pet-description="' + key + '"]', descriptions[key]);
      const labels = {sleeping: '正在做一个软软的梦', pet: '喜欢这样轻轻摸摸', feed: '正在认真吃饭',
        play: '和你玩得特别开心', hungry: '肚子有点空空的', sad: '想和你安静待一会儿', happy: '今天特别开心', idle: '在自己的小世界里，慢慢发呆'};
      text('[data-pet-status]', labels[status]);
      text('[data-pet-save-status]', saveState === 'saved' ? '已保存' : '暂时无法保存');
      find('[data-pet-save-status]')?.setAttribute('data-save-state', saveState);
      text('[data-pet-hint]', saveState === 'saved' ? '点点'+state.petName+'、食盆、'+toyLabel+'或'+(scene()==='home'?'小床':'小窝') : '暂时无法保存 · 进度仅留在当前页面');
      find('[data-pet-hint]')?.setAttribute('data-save-state', saveState);
      find('[data-pet-target="sleep"]')?.setAttribute('aria-label', (scene()==='home'?'点击小床，':'点击小窝，')+(state.isSleeping ? '叫醒'+state.petName : '让'+state.petName+'睡觉'));
      find('[data-pet-info]')?.setAttribute('aria-expanded', String(infoOpen));
      const sheet = find('[data-pet-details]'); if (sheet) sheet.hidden = !infoOpen;
      const toast = find('[data-pet-feedback]');
      const showing = feedback && motionNow() < feedback.until;
      if (toast) toast.hidden = !showing;
      text('[data-pet-feedback-message]', showing ? feedback.message : '');
      text('[data-pet-feedback-detail]', showing ? feedback.detail : '');
    }
    function paint() {
      const kind = interaction();
      const result = renderer.draw(elapsed, reduced(), {
        // 预览未解锁场景时不把小宠放进去，画面上再盖一层灰色半透明（见 pet.css）。
        state, species:activeSpecies, scene: shownScene(), lampOn, noPet:!state||previewing(), status: state ? State.deriveStatus(state, kind) : 'idle',
        interaction: kind ? {kind, progress: Math.min(1, (motionNow() - transient.start) / transient.duration)} : null
      });
      const target = find('[data-pet-target="pet"]');
      if (target && result?.petBounds) {
        const box = result.petBounds;
        target.style.left = box.x / 192 * 100 + '%'; target.style.top = box.y / 320 * 100 + '%';
        target.style.width = box.width / 192 * 100 + '%'; target.style.height = box.height / 320 * 100 + '%';
      }
      frames++;
    }
    function stop() {
      if (raf !== null) env.cancelAnimationFrame(raf);
      if (timer !== null) env.clearInterval(timer);
      raf = null; timer = null; lastFrame = null;
    }
    function frame(now) {
      raf = null;
      if (!ready() || reduced()) return;
      if (lastFrame !== null) elapsed += Math.min(Math.max(now - lastFrame, 0), 100);
      lastFrame = now;
      if (now - lastPaint >= 1000 / 24) {paint(); lastPaint = now;}
      raf = env.requestAnimationFrame(frame);
    }
    function clockTick() {
      if (!visible()) return;
      if (!state) return;
      settle();
      runCare();runScene();flushImportant();
      if(previewUntil&&!previewing()){previewUntil=0;lastPaint=-Infinity;paint();}
      if (wallNow() - state.lastSavedAt >= 15000) persist();
      updateUI();
      if (reduced()) paint();
    }
    function resume() {
      if (!ready()) {stop(); return;}
      if (timer === null) timer = env.setInterval(clockTick, 1000);
      if (reduced()) {
        if (raf !== null) env.cancelAnimationFrame(raf);
        raf = null; lastFrame = null; paint();
      } else if (raf === null) {lastFrame = null; raf = env.requestAnimationFrame(frame);}
    }
    function pause() {roomToken++;pendingCare=null;pendingScene=null;if (active) {settle(false); persist(); updateUI();} stop();}
    function onVisibility() {
      if (doc.visibilityState === 'hidden') pause();
      else {refreshIdentity(); settle(); persist(); updateUI(); resume();}
    }
    function listen(target, type, handler) {
      target.addEventListener(type, handler);
      removers.push(() => target.removeEventListener(type, handler));
    }
    function perform(kind) {
      if (!syncForOperation() || !ready() || naming()) return;
      const settledEvents=settle(false);
      const before=state;
      const result = actions.perform(kind, state, motionNow());
      state = result.state;
      if (result.ok) {
        transient = result.duration ? {kind: result.kind, start: motionNow(), until: motionNow() + result.duration, duration: result.duration} : null;
        const events=[...settledEvents,...observe(before,kind==='sleep'?(state.isSleeping?'sleep':'wake'):kind)];
        env.SHEXPetSound?.play?.(activeSpecies,kind==='sleep'?(state.isSleeping?'sleep':'wake'):kind); // 小宠叫声（目前只有小狗）
        respond(events);
      } else if(settledEvents.length)respond(settledEvents,false);
      const promotion = result.leveledUp ? ' · 升到 Lv.' + state.level + ' 啦' : '';
      showFeedback(result.message, (result.detail || '') + promotion);
      updateUI(); paint();
    }
    function setInfo(open) {
      if (!state) return;
      infoOpen = open; if (open) feedback = null; updateUI();
      (open ? find('[data-pet-close]') : find('[data-pet-info]'))?.focus();
    }
    function currentIdentity() {
      try {return env.SHEXPetIdentity?.current?.() || {userId:'',dreamId:''};}
      catch (_) {return {userId:'',dreamId:'',pending:true};}
    }
    function syncForOperation() {
      const before=Storage.keyFor(identity);refreshIdentity();
      return !!before && before===Storage.keyFor(identity);
    }
    // 云端存档同步进来以后：身份没变时，若云端带来了更新的进度 / 领养名单，就直接换成云端那份（不先把旧进度写回去）。
    function reloadFromCloud(event) {
      if (!active) return;
      const next=currentIdentity();
      if (!identity || next.userId!==identity.userId || next.dreamId!==identity.dreamId) return refreshIdentity();
      const detail=event?.detail;
      if(detail&&(detail.userId!==identity.userId||detail.dreamId!==identity.dreamId))return;
      store.forget?.(identity);
      const roster=store.getRoster(identity), cloudAt=store.savedAt?.(identity,roster.active)||0;
      const replaced=detail?.replacedKeys||[];
      const newer=replaced.includes(Storage.keyFor(identity,activeSpecies))||replaced.includes(Storage.rosterKeyFor(identity))||roster.active!==activeSpecies || (!state ? cloudAt>0 : cloudAt>state.lastSavedAt);
      if (newer) refreshIdentity(true,{fromCloud:true});
      else {highestLevel=store.maxLevel(identity);updateUI();}
      if(detail?.conflict){showFeedback('另一台设备已有更新，已同步最新进度','本机不同的进度已保留，未覆盖云端');updateUI();}
      else if(detail?.unsupported){showFeedback('进度仍保存在本机','云端存档服务需要更新后才能安全上传');updateUI();}
    }
    // 云端存档还没拉回来之前不允许新领养，避免换设备后误把已有宠物当成“未领养”重新领一只。
    function cloudReady() { return !env.SHEXPetCloud || env.SHEXPetCloud.ready(identity); }
    function refreshIdentity(force = false, options = {}) {
      if (!active) return;
      const next=currentIdentity(), signature=JSON.stringify(next);
      if (!force && signature===identitySignature) return;
      const changed=next.userId!==identity?.userId || next.dreamId!==identity?.dreamId;
      if (changed || force) {
        roomToken++;
        arrivalPending=null;
        pendingCare=null;pendingScene=null;placeOpen=false;previewUntil=0;if(!options.fromCloud){settle(false);persist();}stop();
        transient=null;feedback=null;infoOpen=false;nameMode='adopt';adoptionTarget=null;speciesOpen=false;elapsed=0;lastPaint=-Infinity;
        const input=find('[data-pet-name-input]');if(input){input.value='';input.blur?.();}
        text('[data-pet-name-error]','');
        identity={...next};identitySignature=signature;
        if(!options.fromCloud)env.SHEXPetCloud?.prepare?.(identity);
        activeSpecies=store.getRoster(identity).active;useActions();
        const restored=store.loadPet(identity,activeSpecies,wallNow());state=restored.state;saveState=restored.status;
        env.SHEXPetJournal?.setContext?.(identity,activeSpecies);
        env.SHEXPetLetters?.setContext?.();
        // 离开 ≥1 小时回来：补上梦角来照顾小宠的记录（爸爸来过），并弹回家卡片。
        const away=restoreArrival(restored,activeSpecies);if(away)state=away;
        highestLevel=store.maxLevel(identity);Assets()?.setSpecies?.(activeSpecies);
        care=state?Care.normalize(restored.care,restored.before||state,wallNow()):null;
        const offlineEvents=state&&restored.before&&!arrivalPending?observe(restored.before):[];
        if(offlineEvents.length||away)persist();
        if (restored.notice) text('[data-pet-name-error]',restored.notice);
        env.SHEXPetRoomChat?.leave();
        env.SHEXPetRoomChat?.enter(root,{identity,petName:state?.petName||'',adopted:!!state});
        if(offlineEvents.length)respond(offlineEvents,false);
      } else {
        identity={...next};identitySignature=signature;
        env.SHEXPetJournal?.setContext?.(identity,activeSpecies);
        env.SHEXPetLetters?.setContext?.();
        env.SHEXPetRoomChat?.setContext?.({identity,petName:state?.petName||'',adopted:!!state});
      }
      updateUI();if (!state || !reduced()) paint();resume();
    }
    function adopt(name) {
      if (!syncForOperation()) return {ok:false,error:'TA 已切换，请为当前 TA 重新确认名字'};
      if (!active || !identity?.userId || !identity?.dreamId) return {ok:false,error:'先选择想一起养宠的 TA'};
      if (state && !adoptionTarget) return {ok:false,error:'你们已经领养过这只小宠啦'};
      if (!cloudReady()) return {ok:false,error:'正在同步云端存档，请稍候再领养'};
      const target=adoptionTarget||'dog';
      if(adoptionTarget&&!speciesUnlocked(target))return {ok:false,error:'这只小宠尚未解锁'};
      if(state){settle(false);persist();if(saveState!=='saved')return {ok:false,error:'暂时无法保存，先等一下再领养吧'};}
      const result=store.adoptPet(identity,target,name,wallNow());
      if(!result.ok)return result;
      roomToken++;pendingCare=null;pendingScene=null;transient=null;previewUntil=0;
      activeSpecies=target;adoptionTarget=null;useActions();Assets()?.setSpecies?.(target);
      state=result.state;saveState='saved';nameMode='adopt';highestLevel=store.maxLevel(identity);
      env.SHEXPetJournal?.setContext?.(identity,activeSpecies);env.SHEXPetLetters?.setContext?.();
      care=Care.normalize(result.care||null,state,wallNow());const events=result.recovered?[]:observe(state,'adopt');
      env.SHEXPetRoomChat?.setContext?.({identity,petName:state.petName,adopted:true});
      updateUI();env.SHEXPetRoomChat?.unlockKeyboard?.(root);paint();resume();respond(events,false);return {...result,ok:true};
    }
    function rename(name) {
      if (!syncForOperation()) return {ok:false,error:'TA 已切换，请重新打开改名'};
      if (arrivalPending) return {ok:false,error:'正在恢复小宠的日记，请稍候再改名'};
      if (!active || !state) return {ok:false,error:'先领养一只小宠吧'};
      const result=store.rename(identity,state,name,wallNow(),activeSpecies);
      if (!result.state) return result;
      state=result.state;saveState=result.ok?'saved':'unavailable';nameMode='adopt';
      env.SHEXPetRoomChat?.setContext?.({identity,petName:state.petName,adopted:true});
      updateUI();env.SHEXPetRoomChat?.unlockKeyboard?.(root);paint();return {...result,ok:true};
    }
    function enter() {
      if (active) return;
      root = doc.querySelector('#xPetPanel');
      const canvas = doc.querySelector('#xPetPanel [data-pet-canvas]');
      if (!root || !canvas) return;
      if (!renderer) renderer = env.SHEXPetScene.createRenderer(canvas, {sprite: env.SHEXPetSprite});
      media = env.matchMedia('(prefers-reduced-motion: reduce)');
      active = true; pageHidden = false; infoOpen = false; lastFrame = null; lastPaint = -Infinity;
      refreshIdentity(true);
      listen(env,'shex:dream-changed',()=>refreshIdentity());
      for(const event of ['shex:auth-change','shex:data-load-status','shex:stage-dom-lifecycle']) listen(doc,event,()=>refreshIdentity());
      for(const event of ['shex:pet-cloud-loaded']) listen(doc,event,reloadFromCloud);
      listen(doc, 'visibilitychange', onVisibility);
      listen(env, 'pagehide', () => {pageHidden = true; pause();});
      listen(env, 'pageshow', () => {pageHidden = false; refreshIdentity(); settle(); persist(); updateUI(); resume();});
      listen(media, 'change', resume);
      for (const kind of ['pet', 'feed', 'play', 'sleep']) {
        const button = find('[data-pet-target="' + kind + '"]');
        if (button) listen(button, 'click', () => perform(kind));
      }
      if(typeof canvas.addEventListener==='function')listen(canvas,'click',event=>onCanvasClick(event,canvas));
      const placeButton=find('[data-pet-place]');
      if(placeButton)listen(placeButton,'click',event=>{event.stopPropagation?.();if(!state)return;placeOpen=!placeOpen;updateUI();});
      for(const key of Object.keys(SCENES)){
        const option=find('[data-pet-scene="'+key+'"]');
        if(option)listen(option,'click',event=>{
          event.stopPropagation?.();if(!syncForOperation()||!ready()||naming())return;
          const result=setScene(key,'user');if(result.message)showFeedback(result.message);if(result.locked)return;
          updateUI();find('[data-pet-place]')?.focus?.();
        });
      }
      listen(root,'click',()=>{if(placeOpen||speciesOpen){placeOpen=false;speciesOpen=false;updateUI();}});
      const speciesToggle=find('[data-pet-species-toggle]');
      if(speciesToggle)listen(speciesToggle,'click',event=>{event.stopPropagation?.();if(!state||naming())return;placeOpen=false;speciesOpen=!speciesOpen;updateUI();});
      const speciesSheet=find('[data-pet-species-sheet]');
      if(speciesSheet)listen(speciesSheet,'click',event=>{
        event.stopPropagation?.();
        if(event.target?.closest?.('[data-pet-species-close]')){speciesOpen=false;updateUI();return;}
        const key=event.target?.closest?.('[data-pet-species]')?.dataset?.petSpecies;if(key)chooseSpecies(key);
      });
      for(const direction of [-1,1]){
        const arrow=find('[data-pet-step="'+direction+'"]');
        if(arrow)listen(arrow,'click',event=>{event.stopPropagation?.();stepScene(direction);});
      }
      // 在画面上左右滑动也能换场景：横向划过 40 像素以上、并且明显比纵向多才算，
      // 普通的点一下（摸摸、点物件）不受影响；划动之后紧跟着的那一下 click 会被吃掉。
      const room=find('[data-pet-room]')||canvas.parentNode;
      if(room&&typeof room.addEventListener==='function'){
        let start=null,swallowUntil=0;
        const point=event=>{const t=event.changedTouches?.[0]||event;return {x:Number(t.clientX)||0,y:Number(t.clientY)||0};};
        const down=event=>{
          const tag=String(event.target?.tagName||'').toLowerCase();
          start=(tag==='input'||tag==='textarea'||speciesOpen||event.target?.closest?.('.pet-conversation,.pet-place-menu,.pet-room-composer,.pet-species-sheet,.pet-species-toggle'))?null:point(event);
        };
        const up=event=>{
          if(!start)return;const end=point(event),dx=end.x-start.x,dy=end.y-start.y;start=null;
          if(Math.abs(dx)<40||Math.abs(dx)<Math.abs(dy)*1.5)return;
          swallowUntil=motionNow()+400;stepScene(dx<0?1:-1);
        };
        const touch=typeof env.PointerEvent!=='function';
        listen(room,touch?'touchstart':'pointerdown',down);listen(room,touch?'touchend':'pointerup',up);
        listen(room,touch?'touchcancel':'pointercancel',()=>{start=null;});
        const swallow=event=>{if(motionNow()<swallowUntil){swallowUntil=0;event.stopPropagation?.();event.preventDefault?.();}};
        room.addEventListener('click',swallow,true);removers.push(()=>room.removeEventListener('click',swallow,true));
      }
      const info = find('[data-pet-info]'), close = find('[data-pet-close]');
      if (info) listen(info, 'click', () => setInfo(!infoOpen));
      if (close) listen(close, 'click', () => setInfo(false));
      const renameButton=find('[data-pet-rename]');if(renameButton)listen(renameButton,'click',()=>{
        refreshIdentity();if(!state||naming()||arrivalPending)return;nameMode='rename';infoOpen=false;
        find('[data-pet-name-input]').value=state.petName;text('[data-pet-name-error]','');updateUI();find('[data-pet-name-input]')?.focus();
      });
      const form=find('[data-pet-name-form]');if(form)listen(form,'submit',event=>{
        event.preventDefault();const mode=nameMode;
        const result=mode==='rename'?rename(find('[data-pet-name-input]')?.value):adopt(find('[data-pet-name-input]')?.value);
        text('[data-pet-name-error]',result.ok?'':result.error||result.message||'名字没有保存，请再试一次');
        if(result.ok){find('[data-pet-name-input]')?.blur();find('[data-pet-info]')?.focus();}
        else find('[data-pet-name-input]')?.focus();
      });
      const cancel=find('[data-pet-name-cancel]');if(cancel)listen(cancel,'click',cancelNaming);
      listen(root, 'keydown', event => {if(event.key==='Escape'&&naming()){cancelNaming();}else if (event.key === 'Escape' && placeOpen) {placeOpen=false;updateUI();find('[data-pet-place]')?.focus?.();}else if (event.key === 'Escape' && infoOpen) setInfo(false);});
      updateUI();
    }
    function leave() {
      roomToken++;
      arrivalPending=null;
      env.SHEXPetLetters?.leave?.();env.SHEXPetJournal?.leave?.();
      env.SHEXPetRoomChat?.leave();
      pendingCare=null;pendingScene=null;placeOpen=false;previewUntil=0;if (active) {settle(false); persist();}
      active = false; stop(); transient = null; feedback = null; infoOpen = false;
      removers.forEach(remove => remove()); removers = []; media = null;
      state=null;care=null;identity=null;identitySignature='';nameMode='adopt';adoptionTarget=null;activeSpecies='dog';highestLevel=0;
    }
    function status() {
      return {mounted: !!renderer, running: raf !== null, loopCount: raf === null ? 0 : 1,
        frames, listeners: removers.length, visible: visible(), timerCount: timer === null ? 0 : 1,
        timeoutCount: 0, saving: saveState, adopted:!!state, scope:identity?{userId:identity.userId,dreamId:identity.dreamId}:null};
    }
    function snapshot() {return state ? {...state} : null;}
    function runtimeSnapshot(scope){const current=currentIdentity();return ready()&&!naming()&&scope?.userId===identity?.userId&&scope.dreamId===identity.dreamId&&current.userId===identity.userId&&current.dreamId===identity.dreamId&&!current.pending?Care.context(identity,state,sceneCare(),[],wallNow(),species()):null;}
    function commandScope(scope){return runtimeSnapshot(scope)?{userId:identity.userId,dreamId:identity.dreamId,roomToken:visitId+':'+roomToken}:null;}
    function executeDreamCommand(command){
      const current=currentIdentity();
      if(!ready()||naming()||current.pending||command?.roomToken!==visitId+':'+roomToken
        ||command.userId!==identity?.userId||command.dreamId!==identity?.dreamId
        ||current.userId!==identity.userId||current.dreamId!==identity.dreamId
        ||!Care.hasDreamName(identity.dreamName)||!(['pet','feed','play','sleep','wake'].includes(command.action)||Object.prototype.hasOwnProperty.call(SCENES,command.action))
        ||typeof command.requestId!=='string'||!command.requestId||command.requestId.length>160)return {ok:false,code:'STALE_PET_COMMAND'};
      if(care.commandIds.includes(command.requestId))return {ok:false,code:'DUPLICATE_PET_COMMAND'};
      try{if(store.hasCommand(identity,command.requestId))return {ok:false,code:'DUPLICATE_PET_COMMAND'};}
      catch(_){showFeedback('暂时无法确认之前的照顾记录，请稍后再试');updateUI();return {ok:false,code:'PET_COMMAND_STORAGE_UNAVAILABLE'};}
      if(saveState!=='saved'){const message='暂时无法保存，先等等再照顾'+state.petName+'吧';showFeedback(message);updateUI();return {ok:false,message};}
      // One local envelope stores both the reward and the handled request ID.
      // Explicit requests bypass only the autonomous lottery/long cooldown,
      // never the existing action needs or short action cooldown checks.
      settle(false);pendingCare=null;pendingScene=null;
      care.commandIds=[...care.commandIds,command.requestId].slice(-20);
      if(Object.prototype.hasOwnProperty.call(SCENES,command.action)){
        // 梦角在回复里决定带它换个地方；睡着时不挪动它。
        if(state.isSleeping){persist();showFeedback(state.petName+'正在睡觉，先不挪动它啦');updateUI();return {ok:false};}
        const moved=setScene(command.action,'dream');
        if(moved.locked){persist();return {ok:false,code:'SCENE_LOCKED'};}
        if(!moved.ok){persist();if(moved.message)showFeedback(moved.message);updateUI();}
        return moved;
      }
      const kind=command.action,before=state;
      const alreadyTarget=kind==='sleep'&&state.isSleeping||kind==='wake'&&!state.isSleeping;
      const result=alreadyTarget?{ok:false,message:state.petName+(kind==='sleep'?'已经在睡觉啦':'已经醒着啦')}
        :actions.perform(kind==='wake'?'sleep':kind,state,motionNow(),{actor:'dream'});
      if(result.ok){
        state=result.state;observe(before,kind,'dream');
        transient=result.duration?{kind:result.kind,start:motionNow(),until:motionNow()+result.duration,duration:result.duration}:null;
      }
      persist();
      showFeedback(result.ok?Care.toast(kind,identity.dreamName,state.petName):result.message,result.ok?result.detail||'':'');
      updateUI();paint();return {ok:result.ok,message:result.ok?Care.toast(kind,identity.dreamName,state.petName):result.message};
    }
    // 小宠信件用：当前状态 + 已解锁场景 + 所在场景（只读）。
    function letterContext(){return state?{satiety:Math.round(state.satiety),mood:Math.round(state.mood),intimacy:Math.round(state.intimacy),energy:Math.round(state.energy),isSleeping:!!state.isSleeping,scene:SCENES[scene()],places:Object.keys(SCENES).filter(name=>unlocked(name)).map(name=>SCENES[name])}:null;}
    return Object.freeze({enter, leave, status, snapshot, letterContext, adopt, rename, refreshIdentity, runtimeSnapshot,commandScope,executeDreamCommand,chatSent,setScene:(target)=>setScene(target,'user'),stepScene,chooseSpecies,speciesKey,scene,shownScene,touchProp});
  }
  return Object.freeze({createApp});
});
