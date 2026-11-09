(function initCharacterProfileOptions(root, factory) {
  const options = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = options;
  if (root) root.SHEXCharacterProfileOptions = options;
})(typeof window !== 'undefined' ? window : globalThis, function createCharacterProfileOptions() {
  'use strict';

  return Object.freeze({
    MBTI_TYPES: Object.freeze(['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP']),
    ZODIACS: Object.freeze(['白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座']),
    WORLD_TYPES: Object.freeze([
      '现代现实', '都市架空', '校园', '娱乐圈', '商业豪门', '古代', '宫廷', '武侠',
      '仙侠修仙', '东方玄幻', '西方奇幻', '魔法世界', '星际科幻', '末日', '游戏世界', '原作世界'
    ]),
    IDENTITY_TAGS: Object.freeze([
      '学生', '教师', '医生', '律师', '演员', '歌手', '艺术家', '作家', '摄影师', '设计师',
      '程序员', '企业管理者', '店主', '侦探', '军人', '贵族', '皇族', '将军', '修士', '魔法师', '神明', '非人类'
    ]),
    PERSONALITY_GROUPS: Object.freeze([
      Object.freeze({ label: '外在表现', values: Object.freeze(['高冷', '温柔', '活泼', '安静', '强势', '随和', '成熟', '慵懒', '疏离', '开朗', '严肃', '神秘']) }),
      Object.freeze({ label: '内在性格', values: Object.freeze(['嘴硬心软', '敏感', '理性', '克制', '缺乏安全感', '自信', '自卑', '慢热', '忠诚', '护短', '固执', '责任感强', '情绪稳定', '占有欲强']) })
    ]),
    DAILY_LIFE_TAGS: Object.freeze([
      '工作繁忙', '学业为主', '生活规律', '经常出差', '社交较少', '朋友很多', '重视家庭',
      '喜欢独处', '热爱运动', '喜欢创作', '有长期事业目标', '正在完成某项长期任务'
    ]),
    SPEECH_AMOUNTS: Object.freeze(['惜字如金', '话比较少', '适中', '话比较多', '很健谈']),
    SPEECH_TONES: Object.freeze(['高冷', '温柔', '活泼', '直接', '委婉', '毒舌', '傲娇', '理性', '克制', '强势', '幽默', '慵懒', '正式', '随性']),
    SPEECH_HABITS: Object.freeze([
      '喜欢主动提问', '很少主动提问', '用行动表达关心', '直接表达感情', '不擅长表达感情',
      '真话藏在玩笑里', '喜欢使用昵称', '偶尔使用语气词', '偶尔发表情', '生气时话更少', '情绪激动时话变多'
    ]),
    LANGUAGE_TAGS: Object.freeze(['普通话', '粤语', '英语', '日语', '韩语', '中英混合', '古风表达']),
    PREFERENCE_TAGS: Object.freeze(['喜欢安静', '喜欢热闹', '喜欢运动', '喜欢阅读', '喜欢音乐', '喜欢做饭', '喜欢甜食', '作息规律', '有洁癖', '容易失眠', '喜欢收藏']),
    DIALOGUE_SCENES: Object.freeze(['普通聊天', '关心用户', '生气或吃醋', '拒绝用户', '关系亲密时']),
    USER_PERSONALITY_TAGS: Object.freeze([
      '内向', '社恐', '直球', '慢热', '嘴硬心软', '爱操心', '高冷', '话痨', '佛系',
      '完美主义', '容易感动', '喜欢独处', '黏人', '理性派', '感性派', '喜欢新鲜感', '恋家',
      '害羞', '口嫌体正直', '直接', '独立', '敏感', '坚韧', '幽默', '呆', '懒散'
    ]),
    USER_CAREERS: Object.freeze(['学生', '上班族', '自由职业', '创作者', '画师', '技术/产品', '教育/咨询', '服务行业', '暂时休息']),
    USER_HOBBIES: Object.freeze(['听歌', '看电影', '阅读', '打游戏', '拍照', '做饭', '探店', '旅行', '散步', '手作', '宅家', '塔罗/占星']),
    RELATIONSHIP_IDENTITIES: Object.freeze(['初次认识', '普通朋友', '好朋友', '青梅竹马', '同学', '同事', '上下级', '师生／师徒', '暧昧对象', '单向暗恋', '双向暗恋', '恋人', '长期伴侣', '夫妻', '前任', '宿敌', '合作伙伴', '契约关系']),
    RELATIONSHIP_DYNAMICS: Object.freeze(['互相照顾', '欢喜冤家', '嘴硬心软', '一方主动、一方克制', '互相试探', '彼此依赖', '日常陪伴', '并肩作战', '暗中保护', '强强对抗', '共同成长', '慢慢建立信任']),
    RELATIONSHIP_DEVELOPMENT: Object.freeze(['保持当前关系', '允许根据聊天自然发展']),
    RELATIONSHIP_SPEEDS: Object.freeze(['慢热', '自然发展', '容易产生好感', '已是稳定关系，无需重新攻略']),
    INTERACTION_PREFERENCES: Object.freeze(['多主动联系我', '不要连续追问', '难过时先陪伴', '难过时帮我分析', '不喜欢说教', '可以适度吃醋', '不喜欢强烈占有欲', '喜欢日常聊天', '喜欢剧情互动', '喜欢恋爱氛围', '喜欢被鼓励', '尊重我的独处'])
  });
});
