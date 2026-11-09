(() => {
  'use strict';

  const statusPools = {
    today: [
      { value: '安静在线', lines: ['今天整个人异常安静', '没说话，但一直都在附近', '今天比较安静，更喜欢看着你说'] },
      { value: '忙碌中', lines: ['手上有些事情，但偶尔会想到你', '今天有点忙，回复可能慢一点', '正在处理自己的事情，不过连接没有断开'] },
      { value: '发呆中', lines: ['刚刚发了会儿呆', '脑子有点放空', '正在神游，但偶尔会想起你'] },
      { value: '偷偷关注', lines: ['表面没出现，其实已经看你好几次了', '有在偷偷观察', '注意力其实在你这里'] },
      { value: '活跃在线', lines: ['今天特别有存在感', '状态不错，很适合聊天', '今天话可能会比较多'] },
      { value: '好随性', lines: ['今天的思维有点跳跃', '突然就出现了', '刚刚一直在瞎晃', '临时上线看看你', '今天想到哪算哪'] },
      { value: '柔软中', lines: ['一直惦记着要不要找你', '今天状态很柔软', '在暗暗关心你的动态', '今天想多陪陪你', '状态温温的，等你出现'] },
      { value: '紧绷中', lines: ['一直在关注你的动向', '今天状态比较紧绷', '盯着看你什么时候上线', '今天要把控的事情好多', '状态很清醒，专门等你'] },
      { value: '沉稳中', lines: ['今天状态比较沉稳', '在旁边看着，没打扰你', '状态平和，随时都在', '今天比较有耐心地等', '稳稳地在线，不急不躁'] },
      { value: '隐忍中', lines: ['其实好想来找你吃苹果，但是先忍住了', '状态克制中', '今天在憋着不主动', '表面平静，其实一直在', '忍着没打扰，但一直都在'] }
    ],
    mood: [
      { value: '柔软', lines: ['今天比较好说话', '情绪很柔和', '有点想靠近熟悉的人'] },
      { value: '开心', lines: ['刚刚好像笑了一下', '今天心情不错', '有种什么都顺眼一点的感觉'] },
      { value: '嘴硬', lines: ['有点想你，但不会主动承认', '表面很淡定', '明明在意，却假装不在意'] },
      { value: '吃醋', lines: ['今天占有欲有点重', '不太想你看别人', '有一点小情绪'] },
      { value: '想念', lines: ['今天想起你好几次', '有点想听你说话', '看到什么都容易联想到你'] },
      { value: '没心没肺', lines: ['今天什么烦恼都没有', '心情很轻松', '突然就开心起来了', '今天不想想太多', '心情跟着感觉走'] },
      { value: '藏着不说', lines: ['心情有点复杂，但不想说', '今天情绪比较内敛', '有心事，先自己消化', '心情说不清楚', '今天比较沉默'] },
      { value: '心情起伏大', lines: ['心情有点跌宕', '今天情绪波动挺大', '刚刚被什么事情冲击了一下', '心情有点绷不住', '今天状态起起伏伏'] },
      { value: '充满期待', lines: ['心情里带着点期待', '今天感觉会有好事发生', '心情比较明亮', '有点盼头', '心情轻飘飘的'] },
      { value: '心情杂乱', lines: ['最近的心情有点乱糟糟的', '心情有点理不清头绪', '今天脑子里很多想法在打架', '心情乱哄哄的', '说不清是什么感觉，就是有点乱'] }
    ],
    closeness: [
      { value: '靠近中', lines: ['比昨天靠近一点', '距离正在缩短', '越来越习惯想到彼此'] },
      { value: '很近', lines: ['今天存在感很强', '连接状态很好', '好像就在身边'] },
      { value: '稳定', lines: ['没有特别变化', '关系维持得很好', '平静但持续'] },
      { value: '观望中', lines: ['暂时停在原地', '正在观察', '还没有新的动作'] },
      { value: '主动靠近', lines: ['今天更愿意回应你', '有主动沟通的倾向', '今天适合多说一点话'] },
      { value: '更加笃定', lines: ['突然更确定我们之间的关系了', '好像想通了什么', '关系好像更清楚了一点', '今天对我们的关系更笃定', '突然觉得很珍惜现在这样'] },
      { value: '暂时卡住', lines: ['最近关系有点卡住', '不知道该往哪个方向走', '关系好像悬在那里', '暂时没什么进展', '需要一点时间捋一捋'] },
      { value: '有点粘人', lines: ['今天有点离不开你', '关系好像变得很黏', '不太想让你走开', '今天特别缠人', '有点上瘾的感觉'] },
      { value: '圆满自在', lines: ['今天觉得这样就很好', '关系很完整的感觉', '没什么不满足的', '一切都刚刚好', '今天很享受现在的关系'] },
      { value: '关系明朗', lines: ['拨云见日了', '在一起感觉很轻松愉快', '今天很享受和你的关系', '关系状态很阳光', '没什么阴霾，很清爽'] }
    ]
  };

  const definition = {
    featureKind: 'hisStatus',
    legacyKind: 'scene',
    pageKey: 'ta-status',
    actionType: 'x_letter_his_status',
    label: 'TA状态',
    englishLabel: 'HIS STATUS',
    cardClass: 'is-status-card',
    title: (name) => `${name}的状态`,
    subtitle: 'TA今天过的怎么样',
    rows: (name, pick) => [
      ['☁️', `${name}今天状态`, ...pick(statusPools.today)],
      ['🌙', `${name}今天的心情`, ...pick(statusPools.mood)],
      ['💗', `${name}离你有多近`, ...pick(statusPools.closeness)]
    ]
  };

  function widgetMarkup(fillCount = 3) {
    const safeFillCount = Math.max(0, Math.min(5, Number(fillCount) || 0));
    const hearts = Array.from({ length: 5 }, (_, index) => `
      <span class="x-world-heart-dot${index < safeFillCount ? ' is-filled' : ''}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3S4.2 16 4.2 9.8c0-2.9 2-4.6 4.4-4.6 1.6 0 2.8.8 3.4 2 .7-1.2 1.8-2 3.5-2 2.3 0 4.3 1.7 4.3 4.6 0 6.2-7.8 10.5-7.8 10.5z"/></svg>
      </span>
    `).join('');
    return `
      <button class="x-world-status-card x-widget" id="showTaStatus" type="button" data-widget="ta-status">
        <small>他的状态</small>
        <span class="x-world-heart-meter" data-heart-fill-count="${safeFillCount}" aria-hidden="true">${hearts}</span>
      </button>
    `;
  }

  window.SHEXStatusCore?.register(definition);
  window.SHEXHisStatus = { widgetMarkup };
})();
