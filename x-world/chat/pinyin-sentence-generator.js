/* SHE.X · 给 X传讯里的「拼音」入口生成 TA 想说的话
   纯离线：从词池随机拼句，不接 AI，也不依赖预设整句。 */
(function () {
  "use strict";
  if (window.SHEXGenerateTypingSentence) return;

  const pools = {
    time: ['刚刚', '这会儿', '今天', '昨天', '晚上', '早上', '最近', '睡前', '下班后', '吃完饭'],
    thought: ['有点想你', '忽然很想你', '一直在想你', '刚刚想到你了', '特别想和你说说话', '想你想得有点走神'],
    wish: ['想抱抱你', '想见你', '想听你的声音', '想陪你待一会儿', '想和你一起看月亮', '想牵你的手走一会儿'],
    care: ['记得按时吃饭', '别熬太晚', '天冷了多穿点', '累了就早点休息', '出门记得带伞', '别总是硬撑着'],
    smalltalk: ['我这边刚下过雨', '楼下的猫又来蹭我了', '今天的月亮很圆', '买了一袋你爱吃的糖', '刚泡了一杯热牛奶', '把窗户打开了一会儿', '路上看到一棵开花的树', '刚把房间收拾干净'],
    ending: ['', '，好吗', '，知道吗', '，要听话']
  };

  const templates = [
    '{time}{smalltalk}。',
    '{time}{thought}。',
    '{care}{ending}。',
    '{wish}。',
    '{time}{thought}，{wish}。',
    '{care}{ending}，{wish}。',
    '{smalltalk}，{thought}。',
    '{time}{smalltalk}，{care}{ending}。',
    '{thought}，{care}{ending}。',
    '{wish}，{time}{thought}。',
    '{care}{ending}，{smalltalk}。',
    '{time}{wish}。',
    '{smalltalk}，{care}{ending}。',
    '{thought}，{time}{wish}。'
  ];

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  let last = '';

  function fill(template) {
    return template.replace(/\{(\w+)\}/g, (_, key) => (key === 'ending' ? pick(pools.ending) : pick(pools[key] || [''])));
  }

  function generate() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = fill(pick(templates)).replace(/，。/g, '。').replace(/。，/g, '。');
      if (text !== last && text.length >= 6) {
        last = text;
        return text;
      }
    }
    return '今天有点想你，记得早点休息。';
  }

  window.SHEXGenerateTypingSentence = generate;
})();
