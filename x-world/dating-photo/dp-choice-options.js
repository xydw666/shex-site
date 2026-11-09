/* Shared, display-only dating copy and local photo mappings. No user data or AI. */
(function(root,factory){'use strict';var api=factory();(root.SHEXDatingPhoto=root.SHEXDatingPhoto||{}).choiceOptions=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var OPTIONS={
 atmosphere:[
 {label:'有点暧昧',expressions:{me:'shy_blush',ta:'smug'},poseIds:['forehead_touch','tiptoe_kiss','shoulder_gaze'],words:['暧昧','心动']},
 {label:'安静一点',expressions:{me:'happy',ta:'shy_blush'},poseIds:['lean_shoulder','sit_together'],words:['安静','静静','陪伴']},
 {label:'甜甜的',expressions:{me:'happy',ta:'shy_blush'},poseIds:['hug','back_hug','koala_hug'],words:['甜','黏','粘人']},
 {label:'轻松活泼',expressions:{me:'laugh',ta:'happy'},poseIds:['twirl_dance','run_hand_in_hand','high_five_jump'],words:['活泼','疯','欢乐','轻松']},
 {label:'有仪式感',expressions:{me:'shy_blush',ta:'happy'},poseIds:['give_flowers','propose_kneel','heart_hands'],words:['仪式','正式']},
 {label:'浪漫一点',expressions:{me:'shy_blush',ta:'happy'},poseIds:['kiss','lean_down_kiss','forehead_touch'],words:['浪漫']}
 ],
 place:[
 {label:'黄昏的海边，一起吹吹海风',backgroundIds:['seaside_boardwalk_dusk']},
 {label:'街角的咖啡馆，坐在靠窗的位置',backgroundIds:['korean_cafe']},
 {label:'秋天的公园，长椅上落满叶子',backgroundIds:['autumn_park_bench']},
 {label:'看完一场电影，散场后的夜晚',backgroundIds:['cinema_entrance']},
 {label:'快打烊的小书店，安安静静的',backgroundIds:['japanese_bookshop']},
 {label:'摩天轮下，等天慢慢黑下来',backgroundIds:['ferris_wheel']},
 {label:'城市的高处，看万家灯火',backgroundIds:['city_observation_deck']},
 {label:'下雪的夜晚，走在亮着灯的街上',backgroundIds:['snowy_night_street']},
 {label:'雨夜的小巷，躲在同一把伞下',backgroundIds:['seoul_rain_alley']},
 {label:'就待在家里，暖暖的灯光下',backgroundIds:['bedroom_warm_night']}
 ],
 activity:[
 {label:'靠在你肩上，看黄昏的光一点点落下',poseIds:['lean_shoulder']},
 {label:'牵着手慢慢走，走到哪算哪',poseIds:['hold_hands']},
 {label:'一人一只耳机，听同一首歌',poseIds:['share_earphones']},
 {label:'拉着你的手，转圈跳一支舞',poseIds:['twirl_dance']},
 {label:'用拍立得，偷偷把你拍下来',poseIds:['polaroid_snap']},
 {label:'挤在一起，拍一张傻傻的合照',poseIds:['selfie_together']},
 {label:'抱一下，抱久一点',poseIds:['hug']},
 {label:'递给你一束花，看你笑',poseIds:['give_flowers']},
 {label:'躺下来，一起数星星',poseIds:['stargazing']},
 {label:'撑一把伞，把你往伞下拉',poseIds:['share_umbrella']}
 ],
 item:[
 {label:'一束花',propIds:['bouquet']},{label:'拍立得',propIds:['polaroid']},
 {label:'一副耳机',propIds:['shared_earphones']},{label:'一把伞',propIds:['umbrella']},
 {label:'一只气球',propIds:['balloon']},{label:'手机',propIds:['phone']},
 {label:'一个小盒子',propIds:['ring_box']},{label:'一把小勺子',propIds:['spoon']},
 {label:'什么都不用带',propIds:[],emptyProps:true}
 ]
};
var EMOTIONS=OPTIONS.atmosphere.concat([
 {label:'慵懒',words:['慵懒','懒洋洋','困困'],expressions:{me:'sleepy',ta:'happy'},poseIds:['lap_pillow','head_on_chest']},
 {label:'逗笑',words:['逗笑','逗你笑','调皮'],expressions:{me:'laugh',ta:'happy'},poseIds:['head_pat','peek_behind']}
]);
var BACKGROUND_WORDS={
 seaside_boardwalk_dusk:['海边','海滩','沙滩','海岸','木栈道','seaside'],
 seaside_tram_crossing:['海边','海滩','沙滩','海岸','电车道口'],
 beach_bonfire_night:['海边','海滩','沙滩','海岸','篝火','海边篝火'],
 korean_cafe:['咖啡馆','咖啡店','咖啡厅','cafe'],christmas_cafe_window:['圣诞咖啡馆','圣诞咖啡厅'],
 autumn_park_bench:['公园','长椅','秋天公园'],cinema_entrance:['电影院','影院','看电影','电影散场'],
 japanese_bookshop:['小书店','书店','书屋','bookshop'],library_reading_hall:['图书馆','阅览室','library'],
 riverside_night:['江边','河边','汉江'],fireworks_riverbank:['烟花河岸','烟花'],
 jiangnan_canal_bridge:['水乡','江南','拱桥'],city_observation_deck:['观景台','城市高处','万家灯火'],
 rooftop_night:['天台','屋顶'],bedroom_warm_night:['家里','在家','卧室','暖灯卧室'],
 bedroom_morning_sun:['清晨卧室','阳光卧室'],bedroom_rain_window:['雨夜卧室'],
 bedroom_christmas:['圣诞卧室'],seoul_rain_alley:['雨夜小巷','韩国小巷','首尔小巷'],
 snowy_night_street:['雪夜','下雪的街道'],rainy_bus_stop:['公交站','公交车站','等公交'],
 subway_platform:['地铁站','地铁站台','末班地铁'],supermarket_aisle:['超市','购物'],
 flower_shop:['花店'],sakura_walkway:['樱花步道','樱花大道'],ferris_wheel:['摩天轮'],
 amusement_carousel:['旋转木马'],christmas_snow_chapel:['圣诞教堂','小教堂'],
 christmas_light_tunnel:['圣诞灯光隧道','灯光隧道'],christmas_amusement_park:['圣诞游乐园']
};
var POSE_WORDS={
 side_by_side:['并肩','side by side'],hold_hands:['牵手','拉手','散步','hold hands','holding hands'],
 face_to_face:['面对面','对视','face to face'],hug:['拥抱','抱抱','抱一下','依偎','hug'],
 back_hug:['背后拥抱','从背后抱','back hug'],shoulder_arm:['搂肩','搭肩','arm over shoulder'],
 propose_kneel:['求婚','单膝','propose','proposal'],share_umbrella:['共伞','同撑伞','撑伞','share umbrella'],
 share_earphones:['共享耳机','共用耳机','戴同一副耳机','一起戴耳机','听歌','一起听音乐','share earphones','shared earphones'],
 sit_together:['坐在一起','并排坐','sit together'],forehead_touch:['贴额头','额头相抵','forehead touch'],
 cheek_kiss:['亲脸','亲脸颊','cheek kiss'],kiss:['亲亲','接吻','kiss'],
 lift_up:['举高高'],head_pat:['摸摸头','摸头'],heart_hands:['比心','一起比心'],
 back_to_back:['背靠背'],tiptoe_kiss:['踮脚亲吻','踮脚偷亲'],lap_pillow:['膝枕','枕在腿上'],
 high_five_jump:['跳起来击掌','击掌'],
 shoulder_ride:['骑肩','骑在肩上'],lean_shoulder:['靠肩','靠在肩上'],run_hand_in_hand:['牵手跑','牵手奔跑'],
 peek_behind:['身后探头','躲在身后'],stargazing:['数星星','看星星'],
 feed_bite:['喂一口','喂你吃'],tie_shoelace:['系鞋带'],hold_balloon:['合拿气球','一起拿气球'],
 watch_phone_together:['一起看手机'],lap_hug:['腿上相拥','坐腿上'],sit_back_embrace:['坐进怀里','背后环抱坐'],
 koala_hug:['考拉抱','树袋熊抱'],lean_down_kiss:['低头轻吻','俯身亲吻'],twirl_dance:['跳舞','转圈跳舞'],
 shoulder_gaze:['搭肩对望'],wave_together:['挥手','一起挥手'],comfort_hug:['安慰','抱头安慰'],
 bed_spoon:['侧躺从背后抱抱','床上依偎'],bed_face_to_face:['侧躺面对面','床上面对面躺'],
 head_on_chest:['头靠胸口','枕在胸口'],bedside_goodnight_kiss:['晚安吻','床边晚安吻'],
 give_flowers:['送花','献花'],selfie_together:['自拍','一起合照','合照自拍'],polaroid_snap:['拍立得互拍','拍立得给你拍照']
};
var PROP_WORDS={phone:['手机','phone'],umbrella:['雨伞','阳伞','伞','umbrella'],polaroid:['拍立得','相机','polaroid'],bouquet:['花束','鲜花','一束花','bouquet'],ring_box:['戒指盒','小盒子','ring box'],shared_earphones:['耳机','一人一只耳机','shared earphones','earphones'],spoon:['勺子','小勺','汤勺','spoon'],balloon:['气球','氦气球','balloon']};
function freeze(value){if(value&&typeof value==='object'){Object.keys(value).forEach(function(k){freeze(value[k]);});Object.freeze(value);}return value;}
return freeze({OPTIONS:OPTIONS,EMOTIONS:EMOTIONS,BACKGROUND_WORDS:BACKGROUND_WORDS,POSE_WORDS:POSE_WORDS,PROP_WORDS:PROP_WORDS});
});

