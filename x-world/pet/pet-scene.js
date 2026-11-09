(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SHEXPetScene = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const WIDTH = 192, HEIGHT = 320;
  const C = Object.freeze({
    edge: '#8e715b', wall: '#f4e5c9', wallLight: '#fbefd7', wallShade: '#e7d3af',
    wood: '#c49c72', woodDark: '#aa805e', woodLight: '#d9b588', floor: '#e4c397',
    floorLight: '#efd2a6', floorDark: '#d4b183', cream: '#fff3d9', creamShade: '#e1cca9',
    green: '#8aab85', greenDark: '#607f64', greenLight: '#b9c898',
    pink: '#dba69b', pinkDark: '#ba8d89', pinkLight: '#efc7b3',
    mauve: '#b6a5b5', mauveDark: '#908495', sky: '#b6d3cf', blue: '#8db5b6'
  });
  // Small, integer-pixel toys share the original bone's floor position and hit
  // target. Draw them after the cached backdrop so a pet switch never needs to
  // rebuild a scene, and use the same drawing for its playing animation.
  const TOYS = Object.freeze({
    dog:Object.freeze({name:'小骨头'}),cat:Object.freeze({name:'羽毛逗猫棒'}),
    rabbit:Object.freeze({name:'胡萝卜玩具'}),capybara:Object.freeze({name:'小黄鸭玩具'}),
    hamster:Object.freeze({name:'小跑轮'}),crow:Object.freeze({name:'小铃铛'})
  });
  function toyFor(species) {return Object.prototype.hasOwnProperty.call(TOYS,species)?TOYS[species]:TOYS.dog;}
  function toyName(species) {return toyFor(species).name;}
  function paintToy(ctx,species='dog',x=78,y=276) {
    x=Math.round(x);y=Math.round(y);
    const toy=toyFor(species);
    const r=(dx,dy,w,h,color)=>{ctx.fillStyle=C[color]||color;ctx.fillRect(x+dx,y+dy,w,h);};
    // A little more canvas space lets each object have a readable silhouette;
    // the original dog bone keeps its exact floor coordinates and appearance.
    if(toy===TOYS.dog){
      r(4,7,5,9,'woodDark');r(16,7,5,9,'woodDark');r(8,9,9,5,'woodDark');
      r(5,8,3,7,'cream');r(17,8,3,7,'cream');r(8,10,9,3,'cream');
      r(5,11,2,1,'creamShade');r(18,11,2,1,'creamShade');
      return;
    }
    r(5,19,17,1,'#c49c89');
    if(toy===TOYS.cat){
      // Diagonal wooden handle, two broad feathers and a short tied cord.
      for(let i=0;i<8;i++){r(3+i*2,17-i*2,2,2,'#88694f');r(3+i*2,17-i*2,1,1,'#d9b588');}
      r(20,1,3,1,'#638b8c');r(18,2,6,2,'#638b8c');r(17,4,7,2,'#638b8c');
      r(16,6,6,2,'#638b8c');r(15,8,4,2,'#638b8c');
      r(20,2,3,2,'#96c0b6');r(18,4,5,2,'#8db5b6');r(17,6,4,2,'#8db5b6');
      r(20,3,2,1,'#e1e6c0');r(19,4,1,2,'#d0ddbd');r(18,6,1,2,'#d0ddbd');
      r(20,7,3,2,'#ab7774');r(21,9,4,2,'#ab7774');r(22,11,3,2,'#ab7774');
      r(20,8,2,1,'#efb5a2');r(22,9,2,2,'#dba69b');r(23,11,1,1,'#efc7b3');
      r(15,8,3,1,'#c59e71');r(14,9,1,3,'#c59e71');r(12,12,2,1,'#c59e71');
    }else if(toy===TOYS.rabbit){
      // An orange taper and leafy green top stay readable without fine texture.
      r(18,2,2,5,'#607f64');r(21,1,2,5,'#607f64');r(22,4,3,2,'#607f64');
      r(19,2,1,3,'#b9c898');r(22,2,1,3,'#a5be8b');r(21,5,3,1,'#8aab85');
      r(14,6,6,2,'#a46e46');r(12,8,8,2,'#a46e46');r(10,10,8,3,'#a46e46');
      r(8,13,8,2,'#a46e46');r(7,15,6,2,'#a46e46');r(6,17,3,1,'#a46e46');
      r(15,7,4,1,'#efb16e');r(13,8,6,2,'#e99a5c');r(11,10,6,2,'#e99a5c');
      r(9,12,6,2,'#e99a5c');r(8,14,4,2,'#e99a5c');r(7,16,2,1,'#e99a5c');
      r(14,8,2,1,'#f6ce8e');r(12,10,2,1,'#f6ce8e');r(10,12,1,2,'#f6ce8e');
      r(16,9,3,1,'#c77d4c');r(13,12,3,1,'#c77d4c');r(10,15,2,1,'#c77d4c');
    }else if(toy===TOYS.capybara){
      // A yellow duck: raised head, dark eye, orange beak and curled-up tail.
      r(16,2,5,1,'#b58d50');r(14,3,8,2,'#b58d50');r(13,5,10,6,'#b58d50');
      r(15,3,6,2,'#f4d78b');r(14,5,8,5,'#efce78');r(16,4,3,1,'#fff0bd');
      r(19,6,1,2,'#6a5346');r(22,7,3,3,'#bd8351');r(22,8,3,1,'#e9a569');
      r(3,9,4,4,'#b58d50');r(4,10,3,3,'#f4d78b');
      r(6,10,14,7,'#b58d50');r(4,12,18,3,'#b58d50');r(7,17,12,1,'#b58d50');
      r(7,11,12,5,'#efd080');r(5,12,16,2,'#efd080');r(8,16,10,1,'#e7bb67');
      r(10,12,7,1,'#d2a55f');r(9,13,8,2,'#d2a55f');r(10,13,6,1,'#f5db96');
      r(7,11,4,1,'#fff0bd');
    }else if(toy===TOYS.hamster){
      // A hollow wooden running drum in side view, not a fan with blades.
      r(16,2,5,2,'#98734f');r(19,4,4,9,'#98734f');r(16,13,5,2,'#98734f');
      r(17,3,4,1,'#e5c490');r(18,4,4,8,'#c49c72');
      r(19,5,3,1,'#ebce9f');r(19,8,3,1,'#ebce9f');r(19,11,3,1,'#ebce9f');
      r(14,7,6,2,'#aa805e');r(13,6,3,3,'#b88f62');
      for(let dy=1;dy<15;dy++)for(let dx=3;dx<19;dx++){
        const outer=((dx-10.5)/7.5)**2+((dy-7.5)/6.5)**2;
        const inner=((dx-10.5)/5)**2+((dy-7.5)/4.3)**2;
        if(outer<=1&&inner>=1){
          const edge=((dx-10.5)/6.5)**2+((dy-7.5)/5.5)**2;
          r(dx,dy,1,1,edge>1?'#98734f':dx<10?'#f0d5a5':'#d9b588');
        }
      }
      r(17,14,2,3,'#aa805e');r(9,17,14,2,'#aa805e');r(10,17,12,1,'#dfb989');
    }else{
      // Bell loop, domed body, wide rim and a visible little clapper.
      r(12,1,4,1,'#a58253');r(11,2,1,3,'#a58253');r(16,2,1,3,'#a58253');r(12,4,4,1,'#a58253');
      r(8,3,3,2,'#7ca5a1');r(17,3,3,2,'#7ca5a1');r(12,3,4,1,'#b3d0c5');
      r(10,5,8,2,'#a58253');r(9,7,10,2,'#a58253');r(8,9,12,4,'#a58253');
      r(7,12,16,2,'#a58253');r(5,14,20,2,'#a58253');
      r(11,6,6,2,'#e2bd77');r(10,8,8,4,'#e2bd77');r(9,11,10,2,'#e2bd77');
      r(8,13,14,1,'#e2bd77');r(7,14,16,1,'#f1d59a');
      r(11,7,2,4,'#f9e6b3');r(10,10,1,2,'#f1d59a');
      r(13,16,4,2,'#9b7951');r(14,17,2,1,'#d8ad68');
    }
  }
  function paintRoom(ctx) {
    const r = (x, y, w, h, color) => {ctx.fillStyle = C[color] || color; ctx.fillRect(x, y, w, h);};
    const line = (x, y, w, color = 'woodDark') => r(x, y, w, 1, color);
    function block(x, y, w, h, face, outline = 'edge') {
      r(x, y, w, h, outline); r(x + 1, y + 1, w - 2, h - 2, face);
    }
    function leaf(x, y, shade, mirrored = false) {
      r(x + 1, y, 5, 2, shade); r(x, y + 2, 8, 3, shade); r(x + 2, y + 5, 5, 2, shade);
      r(x + (mirrored ? 1 : 3), y + 2, 3, 1, 'greenLight');
    }
    function flower(x, y, color) {
      r(x + 1, y, 3, 1, color); r(x, y + 1, 5, 3, color); r(x + 1, y + 4, 3, 1, color);
      r(x + 2, y + 2, 1, 1, '#bd9661');
    }

    // Room cutaway: tiny ceiling trim, warm paper walls and wood panelling.
    r(0, 0, WIDTH, HEIGHT, '#e1c3a0');
    r(5, 10, 182, 306, 'edge');
    r(7, 12, 178, 300, 'wall');
    r(9, 14, 174, 123, 'wallLight');
    r(9, 14, 3, 123, 'wallShade'); r(180, 14, 3, 123, 'wallShade');
    r(12, 14, 168, 4, 'cream'); r(12, 18, 168, 2, 'wallShade');
    // Subtle wallpaper dots, spaced to read as paper rather than noise.
    for (let y = 26; y < 123; y += 12) for (let x = 18; x < 180; x += 12) {
      r(x, y, 1, 1, '#ecddbf');
      r(x + 4, y + 5, 1, 1, '#ecddbf');
    }
    r(9, 130, 174, 16, 'wallShade');
    for (let x = 14; x < 183; x += 14) r(x, 133, 1, 12, '#d6bb94');
    r(8, 129, 176, 3, 'wood'); r(8, 129, 176, 1, 'woodLight');
    r(8, 144, 176, 5, 'woodDark'); r(8, 145, 176, 1, 'woodLight');

    // Warm planks, staggered joints and sparse hand-placed wood grain.
    r(8, 149, 176, 157, 'floor');
    for (let row = 0, y = 149; y < 306; row++, y += 19) {
      r(9, y + 1, 174, 2, 'floorLight'); line(8, y + 18, 176, 'floorDark');
      for (let x = 8 + (row % 2 ? 32 : 0); x < 184; x += 64) {
        r(x, y + 1, 1, 17, 'floorDark');
        line(x + 8, y + 8, 13, '#dab78a'); line(x + 13, y + 11, 6, '#eac99d');
      }
    }
    r(8, 149, 3, 155, '#c2a07d'); r(181, 149, 3, 155, '#c2a07d');
    r(8, 149, 176, 3, '#c3a381');
    r(8, 303, 176, 3, 'woodDark'); r(8, 306, 176, 5, 'wood'); r(9, 308, 174, 1, 'woodLight');
    // A pixel sunbeam, softly stepping across the floor from the window.
    for (let i = 0; i < 11; i++) r(28 + i * 3, 152 + i * 3, 42, 3, '#ecd0a3');

    // Window: a view of quiet sky, not an outdoor game map.
    r(21, 35, 77, 67, '#ddc6a4'); block(23, 33, 73, 65, 'wood');
    r(26, 36, 67, 58, 'cream'); r(29, 39, 61, 51, 'sky');
    r(29, 39, 61, 15, '#acd0cb'); r(29, 54, 61, 17, '#c2dcd3'); r(29, 71, 61, 19, '#d5e3cc');
    r(41, 49, 13, 3, '#e9eee1'); r(38, 52, 24, 3, '#e9eee1');
    r(76, 58, 9, 3, '#eaf0e4'); r(73, 61, 17, 2, '#eaf0e4');
    r(29, 81, 8, 9, '#a2b994'); r(37, 84, 12, 6, '#a2b994');
    r(69, 86, 21, 4, '#bac69b'); r(82, 81, 8, 9, '#bac69b');
    r(57, 38, 4, 54, 'cream'); r(59, 39, 1, 52, 'creamShade');
    r(28, 66, 63, 3, 'cream'); r(29, 69, 61, 1, 'creamShade');
    r(24, 94, 71, 4, 'woodDark'); r(20, 98, 79, 4, 'wood'); line(21, 98, 77, 'woodLight');
    // Draped curtains use wide folds rather than little unrelated pixels.
    r(17, 29, 84, 2, 'edge'); r(16, 29, 2, 4, 'woodLight'); r(99, 29, 2, 4, 'woodLight');
    for (const side of [20, 84]) {
      r(side, 32, 12, 10, 'mauve'); r(side, 42, 11, 13, '#c6b8c4');
      r(side, 55, 8, 20, 'mauve'); r(side, 75, 10, 18, '#c6b8c4');
      r(side + 1, 32, 2, 60, '#e2d1d2'); r(side + 5, 34, 2, 36, '#9f91a4');
      r(side, 70, 8, 3, 'woodLight'); r(side + 9, 33, 1, 20, 'mauveDark');
    }

    // A little notice frame with two tiny pixel hearts, and a wall shelf.
    r(114, 33, 25, 24, 'wallShade'); block(112, 31, 25, 24, 'woodLight');
    block(114, 33, 21, 20, 'cream');
    r(118, 40, 3, 3, 'pink'); r(122, 40, 3, 3, 'pink'); r(118, 42, 7, 2, 'pink');
    r(120, 44, 3, 2, 'pink'); r(121, 46, 1, 1, 'pink');
    r(126, 38, 2, 2, 'green'); r(129, 38, 2, 2, 'green'); r(126, 40, 5, 2, 'green'); r(128, 42, 1, 2, 'green');
    r(146, 48, 32, 4, 'wood'); r(147, 48, 30, 1, 'woodLight');
    r(150, 52, 2, 4, 'woodDark'); r(172, 52, 2, 4, 'woodDark');
    block(151, 38, 5, 10, 'pink'); block(157, 35, 5, 13, 'green'); block(163, 37, 5, 11, 'mauve');
    line(152, 40, 3, 'cream'); line(158, 37, 3, 'cream');
    block(170, 40, 5, 8, 'cream'); flower(170, 37, 'pinkLight');

    // Desk under the window; the stool stands fully on the floor in front.
    r(24, 137, 71, 4, '#c2a07d'); block(25, 113, 66, 5, 'woodLight');
    r(28, 118, 3, 25, 'woodDark'); r(85, 118, 3, 25, 'woodDark');
    r(29, 119, 58, 2, 'wood'); block(48, 120, 18, 9, 'woodLight'); r(56, 124, 3, 1, 'edge');
    r(48, 163, 24, 3, 'floorDark');
    r(51, 148, 3, 16, 'edge'); r(66, 148, 3, 16, 'edge');
    r(52, 149, 1, 14, 'woodLight'); r(67, 149, 1, 14, 'woodLight');
    r(53, 157, 14, 2, 'woodDark'); line(54, 157, 12, 'woodLight');
    block(48, 143, 24, 7, 'wood'); block(49, 140, 22, 6, 'pink');
    line(51, 141, 18, 'pinkLight'); line(50, 148, 20, 'woodLight');
    block(33, 107, 14, 3, 'green'); block(35, 110, 13, 3, 'cream');
    line(37, 110, 9, 'pink');
    r(57, 107, 16, 5, 'creamShade'); r(57, 106, 15, 5, 'cream');
    line(60, 108, 8, 'pinkLight'); r(67, 106, 3, 3, 'pink');
    r(80, 93, 1, 12, 'greenDark'); r(76, 97, 1, 8, 'greenDark');
    leaf(78, 97, 'green', true); flower(77, 90, 'pink'); flower(73, 95, 'cream');
    block(76, 104, 10, 9, 'blue'); r(78, 105, 2, 6, '#b5d4cc');

    // Sage cabinet, a linen-shaded lamp and a plant on top.
    r(139, 151, 38, 3, 'floorDark'); block(138, 98, 37, 5, 'woodLight');
    block(140, 103, 33, 43, 'green');
    for (let y = 106; y < 143; y += 12) {
      block(143, y, 27, 10, '#b3c2a2'); r(155, y + 5, 3, 1, 'edge'); line(145, y + 1, 23, '#cad4b4');
    }
    r(142, 146, 3, 6, 'woodDark'); r(168, 146, 3, 6, 'woodDark');
    r(144, 94, 15, 3, 'edge'); r(146, 93, 11, 2, 'woodLight');
    r(150, 81, 3, 12, 'woodDark');
    r(141, 71, 20, 2, 'edge'); r(139, 73, 24, 4, 'edge'); r(137, 77, 28, 5, 'edge');
    r(142, 72, 18, 3, '#f0d09a'); r(140, 75, 22, 5, '#f6deb0'); r(138, 79, 26, 2, '#f6deb0');
    r(144, 74, 2, 6, '#fff0c8'); r(158, 74, 1, 6, '#ddba88');
    block(165, 90, 8, 8, 'pinkLight'); r(169, 78, 1, 12, 'greenDark');
    leaf(161, 78, 'green', true); leaf(168, 82, 'greenDark');

    // The scalloped rug anchors the pet and keeps the middle uncluttered.
    r(48, 192, 100, 81, '#d6ad8b');
    r(42, 184, 106, 77, 'pinkDark'); r(47, 179, 96, 87, 'pinkDark');
    r(45, 185, 100, 75, 'pink'); r(49, 182, 92, 81, 'pink');
    r(50, 188, 89, 67, 'pinkLight'); r(54, 185, 81, 73, 'pinkLight');
    // Woven edge and small geometric flowers, all on the same 1px grid.
    for (let x = 52; x < 139; x += 6) { r(x, 182, 2, 1, 'cream'); r(x, 263, 2, 1, 'cream'); }
    for (let y = 189; y < 259; y += 6) {r(46, y, 1, 2, 'cream'); r(144, y, 1, 2, 'cream');}
    for (const [x, y] of [[61, 198], [123, 198], [61, 242], [123, 242]]) {
      r(x, y, 1, 5, '#d7a997'); r(x - 2, y + 2, 5, 1, '#d7a997'); r(x, y + 2, 1, 1, 'cream');
    }
    for (let y = 208; y <= 238; y += 6) {r(55, y, 1, 1, '#deb39e'); r(133, y, 1, 1, '#deb39e');}

    // Bed at the right edge, with a pillow and folded patchwork blanket.
    r(145, 208, 34, 4, '#c19d81');
    r(140, 172, 40, 37, 'edge'); r(142, 174, 36, 32, 'woodLight');
    r(143, 173, 33, 5, 'wood'); r(143, 172, 33, 1, 'woodLight');
    r(144, 180, 31, 24, 'creamShade'); r(145, 181, 29, 21, 'cream');
    r(148, 179, 20, 8, 'mauveDark'); r(149, 178, 18, 8, '#d6c4c9'); r(151, 180, 14, 2, '#ead9d7');
    r(145, 190, 29, 11, 'mauve');
    for (let x = 146; x < 174; x += 7) {r(x, 190, 3, 11, '#d2bfca');}
    line(145, 198, 29, '#978a9c'); r(142, 205, 3, 7, 'woodDark'); r(175, 205, 3, 7, 'woodDark');

    // Floor plant in a terracotta pot, folded throw and tiny wooden toy.
    r(17, 197, 23, 3, '#c3a381'); block(22, 180, 15, 17, 'pinkDark');
    r(20, 178, 19, 4, 'edge'); r(21, 179, 17, 2, 'pinkLight');
    r(24, 184, 2, 9, 'pink'); r(30, 160, 2, 19, 'greenDark');
    leaf(23, 160, 'green'); leaf(30, 164, 'greenDark'); leaf(22, 170, 'green', true);
    leaf(30, 153, 'green'); r(33, 160, 1, 5, 'greenDark');
    block(17, 211, 21, 14, 'mauve'); r(19, 213, 17, 3, '#d7c5ce');
    for (let x = 20; x < 37; x += 4) r(x, 217, 1, 6, '#d7c5ce');
    r(27, 237, 10, 4, 'woodDark'); r(30, 234, 4, 8, 'woodLight'); r(29, 238, 6, 2, 'cream');
    r(23, 239, 4, 3, 'green'); r(36, 238, 4, 3, 'green');

    // Two bowls on a linen mat. Empty decorative objects in this phase.
    r(17, 270, 50, 21, 'greenDark'); r(18, 271, 48, 19, '#bac49b');
    for (let x = 20; x < 65; x += 4) r(x, 287, 2, 1, 'cream');
    for (const [x, fill] of [[22, 'pinkLight'], [45, 'blue']]) {
      r(x + 2, 274, 13, 2, 'edge'); r(x, 276, 17, 8, 'edge');
      r(x + 1, 276, 15, 6, fill); r(x + 3, 283, 11, 2, 'edge');
      r(x + 3, 278, 11, 3, x === 22 ? '#b69570' : '#bfdbd2'); r(x + 4, 277, 4, 1, 'cream');
    }

    // Wicker basket with a cushion; two books. The species toy is drawn over the backdrop.
    r(148, 277, 27, 3, '#c3a381');
    block(148, 256, 25, 21, 'wood'); r(150, 254, 21, 5, 'woodLight');
    for (let y = 260; y < 275; y += 4) { line(149, y, 23, 'woodDark'); }
    for (let x = 151; x < 172; x += 4) r(x, 260, 1, 16, 'woodLight');
    r(153, 250, 13, 8, 'greenDark'); r(152, 252, 17, 5, 'green'); r(155, 251, 9, 4, 'greenLight');
    block(119, 284, 16, 3, 'mauve'); block(116, 287, 19, 3, 'green'); line(119, 288, 13, 'cream');

  }

  // 户外：院子里的一小片草地。物件的位置与室内一一对应——
  // 野餐布对应地毯、左下角仍是食盆、中下方仍是玩具、右侧树荫下的小窝对应小床，
  // 所以摸摸、喂饭、陪玩、睡觉的动作和点击位置可以原样复用。
  function paintGarden(ctx, T) {
    const r = (x, y, w, h, color) => {ctx.fillStyle = C[color] || color; ctx.fillRect(x, y, w, h);};
    const line = (x, y, w, color = 'woodDark') => r(x, y, w, 1, color);
    function block(x, y, w, h, face, outline = 'edge') {
      r(x, y, w, h, outline); r(x + 1, y + 1, w - 2, h - 2, face);
    }
    function leaf(x, y, shade, mirrored = false) {
      r(x + 1, y, 5, 2, shade); r(x, y + 2, 8, 3, shade); r(x + 2, y + 5, 5, 2, shade);
      r(x + (mirrored ? 1 : 3), y + 2, 3, 1, 'greenLight');
    }
    function flower(x, y, color) {
      r(x + 1, y, 3, 1, color); r(x, y + 1, 5, 3, color); r(x + 1, y + 4, 3, 1, color);
      r(x + 2, y + 2, 1, 1, '#bd9661');
    }
    function cloud(x, y, w) {
      r(x + 4, y, w - 10, 3, T.cloud); r(x, y + 3, w, 4, T.cloud); r(x + 3, y + 7, w - 8, 2, T.cloudShade);
      r(x + 6, y + 1, w - 16, 1, T.cloudLight);
    }
    const GRASS = T.grass, GRASS_LIGHT = T.grassLight, GRASS_DARK = T.grassDark, GRASS_DEEP = T.hedge;

    // Same card frame as the room, so switching scenes keeps the composition still.
    r(0, 0, WIDTH, HEIGHT, '#e1c3a0');
    r(5, 10, 182, 306, 'edge');
    // Late-morning sky in three soft bands, a pale sun and stepped clouds.
    r(7, 12, 178, 44, T.sky[0]); r(7, 56, 178, 30, T.sky[1]); r(7, 86, 178, 32, T.sky[2]);
    r(22, 24, 12, 12, T.sun); r(20, 26, 16, 8, T.sun); r(24, 22, 8, 16, T.sun);
    r(25, 27, 5, 4, T.sunLight);
    cloud(46, 30, 34); cloud(96, 52, 28); cloud(14, 62, 24);
    // Far hills step down toward the garden; a hedge sits just behind the fence.
    r(7, 96, 60, 22, T.hills[0]); r(20, 91, 34, 5, T.hills[0]); r(28, 88, 18, 3, T.hills[0]);
    r(58, 102, 70, 16, T.hills[1]); r(74, 97, 40, 5, T.hills[1]); r(86, 94, 18, 3, T.hills[1]);
    r(7, 110, 178, 12, GRASS_DEEP);
    for (let x = 9; x < 184; x += 13) { r(x, 107, 9, 4, GRASS_DEEP); r(x + 2, 105, 5, 2, GRASS_DEEP); r(x + 3, 108, 2, 1, GRASS_DARK); }
    for (const [i, x] of [16, 44, 70, 97, 113].entries()) flower(x, 109, T.hedgeFlowers[i % T.hedgeFlowers.length]);

    // Low picket fence with a little gate; it reads as a yard, not a wild map.
    r(7, 124, 178, 2, 'woodDark'); r(7, 133, 178, 2, 'woodDark');
    for (let x = 9; x < 184; x += 9) {
      r(x, 119, 6, 20, 'edge'); r(x + 1, 120, 4, 18, 'cream'); r(x + 1, 119, 4, 1, 'cream');
      r(x + 2, 118, 2, 1, 'edge'); r(x + 4, 121, 1, 16, 'creamShade');
    }
    block(62, 116, 22, 24, 'woodLight'); r(64, 118, 18, 2, 'wood'); r(64, 128, 18, 2, 'wood');
    for (let x = 66; x < 82; x += 5) r(x, 120, 1, 18, 'wood');
    r(80, 127, 2, 3, 'edge');

    // Mown lawn: the bands echo the floor planks, with sparse hand-placed tufts.
    r(8, 139, 176, 167, GRASS);
    for (let row = 0, y = 139; y < 306; row++, y += 19) {
      if (row % 2 === 0) r(8, y, 176, 19, GRASS_LIGHT);
      for (let x = 14 + (row % 2 ? 21 : 0); x < 182; x += 43) {
        r(x, y + 9, 1, 3, GRASS_DARK); r(x + 2, y + 8, 1, 4, GRASS_DARK); r(x + 4, y + 10, 1, 2, GRASS_DARK);
        r(x + 19, y + 14, 3, 1, row % 2 ? GRASS_LIGHT : GRASS);
      }
    }
    r(8, 139, 176, 3, GRASS_DARK); r(8, 139, 3, 167, T.grassEdge); r(181, 139, 3, 167, T.grassEdge);
    r(8, 303, 176, 3, 'woodDark'); r(8, 306, 176, 5, 'wood'); r(9, 308, 174, 1, 'woodLight');
    for (const [x, y, color] of [[20, 150, 0], [118, 152, 1], [102, 174, 0], [16, 252, 1],
      [136, 296, 0], [72, 298, 1], [176, 232, 0], [12, 300, 0]].map(([x, y, i]) => [x, y, T.daisies[i]])) {
      if (!color) continue;
      r(x, y, 1, 1, color); r(x - 1, y + 1, 3, 1, color); r(x, y + 2, 1, 1, color); r(x, y + 1, 1, 1, '#e6c98a');
    }
    // Stepping stones wander from the gate toward the picnic cloth.
    for (const [x, y, w] of [[68, 143, 12], [60, 153, 13], [50, 163, 12], [44, 172, 11]]) {
      r(x, y, w, 5, '#cdbd9f'); r(x + 1, y - 1, w - 2, 1, '#cdbd9f'); r(x + 1, y + 5, w - 2, 1, '#b7a585');
      r(x + 2, y, w - 5, 1, '#e0d3b6');
    }

    // The garden tree: a stepped canopy, a few blossoms and dappled shade on the lawn.
    r(132, 196, 50, 20, T.shade); r(126, 200, 58, 12, T.shade);
    r(156, 96, 14, 82, 'edge'); r(157, 96, 12, 82, 'wood'); r(158, 98, 3, 78, 'woodLight'); r(166, 98, 2, 78, 'woodDark');
    r(160, 120, 2, 6, 'woodDark'); r(163, 146, 2, 5, 'woodDark'); r(152, 172, 22, 4, 'edge'); r(153, 173, 20, 2, 'wood');
    r(126, 44, 58, 50, T.leafDark); r(118, 54, 66, 34, T.leafDark); r(134, 34, 46, 14, T.leafDark); r(144, 28, 30, 8, T.leafDark);
    r(128, 46, 54, 44, T.leaf); r(121, 56, 62, 28, T.leaf); r(136, 36, 42, 12, T.leaf); r(146, 30, 26, 8, T.leaf);
    r(132, 42, 30, 14, T.leafLight); r(126, 58, 24, 10, T.leafLight); r(150, 34, 18, 6, T.leafLight); r(158, 64, 18, 8, T.leafMid);
    r(140, 76, 30, 8, T.leafDark); r(124, 78, 12, 6, T.leafDark); r(168, 50, 12, 8, T.leafDark);
    for (const [x, y] of [[136, 48], [162, 44], [128, 66], [152, 58], [172, 68], [144, 82]]) {
      r(x, y, 2, 2, T.blossom); r(x + 1, y + 1, 1, 1, T.blossomLight);
    }

    // A slatted bench by the fence, with a folded throw and a potted plant beside it.
    r(20, 156, 54, 3, GRASS_DARK);
    block(18, 128, 56, 5, 'woodLight'); block(18, 135, 56, 5, 'woodLight'); line(19, 129, 54, 'cream');
    r(20, 133, 3, 24, 'edge'); r(69, 133, 3, 24, 'edge'); r(21, 134, 1, 22, 'woodLight'); r(70, 134, 1, 22, 'woodLight');
    block(16, 142, 60, 6, 'wood'); line(17, 143, 58, 'woodLight'); r(16, 148, 60, 2, 'woodDark');
    r(21, 150, 3, 8, 'woodDark'); r(68, 150, 3, 8, 'woodDark');
    block(28, 138, 16, 5, 'mauve'); line(30, 139, 12, '#d7c5ce'); block(30, 135, 12, 4, 'pink'); line(32, 136, 8, 'pinkLight');
    block(80, 146, 13, 11, 'pinkDark'); r(79, 145, 15, 3, 'edge'); r(80, 146, 13, 1, 'pinkLight');
    r(86, 132, 1, 13, 'greenDark'); leaf(80, 132, 'green', true); leaf(86, 136, 'greenDark'); flower(84, 127, 'cream');

    // Gingham picnic cloth where the rug would be: it anchors the pet and keeps the middle open.
    r(48, 192, 100, 81, T.shade);
    r(42, 184, 106, 77, T.clothEdge); r(47, 179, 96, 87, T.clothEdge);
    r(45, 185, 100, 75, 'cream'); r(49, 182, 92, 81, 'cream');
    for (let y = 185; y < 260; y += 10) r(45, y, 100, 5, T.clothMid);
    for (let x = 49; x < 141; x += 10) {
      r(x, 182, 5, 81, T.clothMid);
      for (let y = 185; y < 260; y += 10) r(x, y, 5, 5, T.clothCheck);
    }
    r(45, 185, 4, 75, 'cream'); r(141, 185, 4, 75, 'cream');
    for (let x = 52; x < 139; x += 6) { r(x, 181, 2, 1, 'cream'); r(x, 264, 2, 1, 'cream'); }
    for (let y = 189; y < 259; y += 6) { r(44, y, 1, 2, 'cream'); r(145, y, 1, 2, 'cream'); }

    // The nap spot in the shade: a wicker pet bed with a soft cushion (same place as the indoor bed).
    r(144, 208, 36, 4, T.grassDark);
    r(140, 180, 40, 29, 'edge'); r(142, 182, 36, 25, 'wood');
    for (let y = 185; y < 206; y += 4) line(142, y, 36, 'woodDark');
    for (let x = 145; x < 178; x += 5) r(x, 183, 1, 23, 'woodLight');
    r(141, 178, 38, 4, 'edge'); r(142, 179, 36, 2, 'woodLight');
    r(145, 184, 30, 18, 'mauveDark'); r(146, 185, 28, 16, '#d6c4c9'); r(149, 187, 22, 2, '#ead9d7');
    for (let x = 148; x < 173; x += 7) r(x, 195, 3, 5, 'mauve');

    // A small flower bed, a watering can and a wooden garden toy along the left edge.
    r(15, 199, 27, 3, GRASS_DARK); block(16, 186, 25, 13, '#b89373'); r(18, 188, 21, 4, '#8f6f55');
    for (const [i, x] of [18, 25, 32].entries()) { r(x + 2, 178, 1, 10, 'greenDark'); flower(x, 174, T.bedFlowers[i]); }
    leaf(20, 180, 'green'); leaf(28, 181, 'greenDark', true);
    r(18, 226, 22, 2, GRASS_DARK); block(19, 213, 15, 13, 'blue'); r(21, 215, 3, 9, '#b5d4cc');
    r(34, 216, 6, 2, 'edge'); r(39, 213, 3, 4, 'edge'); r(40, 214, 1, 2, 'blue');
    r(22, 209, 9, 2, 'edge'); r(21, 210, 2, 4, 'edge'); r(30, 210, 2, 4, 'edge');
    r(27, 240, 10, 4, 'woodDark'); r(30, 237, 4, 8, 'woodLight'); r(29, 241, 6, 2, 'cream');
    r(23, 242, 4, 3, 'green'); r(36, 241, 4, 3, 'green');

    if (T.extras) T.extras({r, line, block, leaf, flower});

    // Two bowls on a linen mat, exactly where they stand at home.
    r(17, 270, 50, 21, 'greenDark'); r(18, 271, 48, 19, '#e8dcbe');
    for (let x = 20; x < 65; x += 4) r(x, 287, 2, 1, 'creamShade');
    for (const [x, fill] of [[22, 'pinkLight'], [45, 'blue']]) {
      r(x + 2, 274, 13, 2, 'edge'); r(x, 276, 17, 8, 'edge');
      r(x + 1, 276, 15, 6, fill); r(x + 3, 283, 11, 2, 'edge');
      r(x + 3, 278, 11, 3, x === 22 ? '#b69570' : '#bfdbd2'); r(x + 4, 277, 4, 1, 'cream');
    }

    // Picnic hamper with a checked napkin, a thermos and a species toy drawn over the backdrop.
    r(148, 277, 27, 3, GRASS_DARK);
    block(148, 256, 25, 21, 'wood'); r(150, 254, 21, 5, 'woodLight');
    for (let y = 260; y < 275; y += 4) { line(149, y, 23, 'woodDark'); }
    for (let x = 151; x < 172; x += 4) r(x, 260, 1, 16, 'woodLight');
    r(152, 249, 17, 7, 'edge'); r(153, 250, 15, 5, 'cream'); r(153, 250, 5, 2, 'pink'); r(163, 250, 5, 2, 'pink'); r(158, 252, 5, 3, 'pink');
    r(156, 244, 9, 2, 'edge'); r(155, 245, 2, 5, 'edge'); r(164, 245, 2, 5, 'edge');
    r(118, 291, 14, 2, GRASS_DARK); block(120, 276, 9, 15, 'green'); r(122, 278, 2, 11, 'greenLight'); block(121, 272, 7, 5, 'cream');

  }


  // 小院的四季：同一张构图，只换天色、树冠、草地、野餐布和几样当季的小东西。
  const GARDEN = {
    sky: ['#a9cfcb', '#bfdbd3', '#d6e5cf'], sun: '#f8ecc2', sunLight: '#fdf6d8',
    cloud: '#f3f3e6', cloudShade: '#e4ebdc', cloudLight: '#fbfaf0', hills: ['#b4c9a0', '#a6bf96'],
    hedge: '#8fae7c', hedgeFlowers: ['pinkLight', 'cream', 'pink'],
    grass: '#bfd29c', grassLight: '#cbdaa8', grassDark: '#a3bd89', grassEdge: '#b1c692', shade: '#aac28f',
    daisies: ['cream', 'pinkLight'], leafDark: 'greenDark', leaf: 'green', leafLight: 'greenLight', leafMid: '#a2bd90',
    blossom: 'pinkLight', blossomLight: 'cream', clothEdge: 'pinkDark', clothMid: '#f3d9cd', clothCheck: 'pink',
    bedFlowers: ['pink', 'cream', 'pinkLight']
  };
  const SEASONS = {
    outdoor: GARDEN,
    // 春：粉白的花树、落在草地上的花瓣、花圃里的郁金香。
    spring: {...GARDEN, sky: ['#b5d9d6', '#cbe3da', '#e2edd6'], hills: ['#bcd3a6', '#aec99c'], hedge: '#9bbb86',
      hedgeFlowers: ['pink', 'cream', 'pinkLight'], grass: '#c6dba3', grassLight: '#d2e3b0', grassDark: '#a9c68e', grassEdge: '#b8d098', shade: '#b1cb95',
      leafDark: '#c98f96', leaf: '#e3aeb0', leafLight: '#f3cfcb', leafMid: '#ecbdbd', blossom: 'cream', blossomLight: '#fff8ee',
      clothEdge: '#b6a5b5', clothMid: '#e9dfe8', clothCheck: '#cdbfd0', bedFlowers: ['#e58f8f', '#f1c36d', '#e58f8f'],
      extras({r}) {
        for (const [x, y] of [[112, 150], [126, 166], [104, 178], [136, 158], [118, 286], [96, 150], [60, 300], [172, 226], [140, 296], [30, 262], [108, 168], [150, 150]]) {
          r(x, y, 2, 1, '#f3cfcb'); r(x + 1, y + 1, 1, 1, '#e3aeb0');
        }
        r(96, 296, 9, 2, '#a9c68e'); for (const [x, c] of [[96, '#e58f8f'], [100, '#f1c36d'], [104, '#e58f8f']]) { r(x, 289, 1, 7, 'greenDark'); r(x - 1, 286, 3, 3, c); r(x, 285, 1, 1, c); }
      }},
    // 夏：更蓝的天、浓绿的树、栅栏边的向日葵、蓝格子野餐布和一片西瓜。
    summer: {...GARDEN, sky: ['#8fc6d2', '#a9d6d8', '#c9e6d6'], sun: '#fbe7a2', sunLight: '#fff6cf', hills: ['#a3c391', '#93b784'], hedge: '#7fa56f',
      hedgeFlowers: ['#f1c36d', 'cream', '#f1c36d'], grass: '#b3d08c', grassLight: '#c1da99', grassDark: '#93b877', grassEdge: '#a5c684', shade: '#9bbd80',
      leafDark: '#4f7557', leaf: '#74a071', leafLight: '#a5c489', leafMid: '#8bb47c', blossom: '#d9e8a6', blossomLight: '#eef5c4',
      clothEdge: '#7f9fb0', clothMid: '#d5e6e8', clothCheck: '#9cc0c8', bedFlowers: ['#f1c36d', 'cream', '#f1c36d'],
      extras({r}) {
        for (const x of [100, 116, 130, 144]) {
          r(x + 3, 118, 1, 22, 'greenDark'); r(x + 4, 126, 3, 2, 'green'); r(x, 130, 3, 2, 'green');
          r(x + 1, 110, 5, 9, '#f1c36d'); r(x - 1, 112, 9, 5, '#f1c36d'); r(x + 1, 112, 5, 5, '#8a5f3c'); r(x + 2, 113, 2, 2, '#a97a4f');
        }
        r(100, 294, 16, 2, '#93b877'); r(100, 286, 16, 8, 'greenDark'); r(101, 286, 14, 6, '#cfe3b0'); r(102, 286, 12, 5, '#e58f8f');
        r(105, 287, 1, 1, 'edge'); r(109, 288, 1, 1, 'edge'); r(112, 287, 1, 1, 'edge');
      }},
    // 秋：暖色的天、橙红的树、满地落叶、花圃边的小南瓜和芥末色野餐布。
    autumn: {...GARDEN, sky: ['#d9d3bd', '#e7dcc0', '#f1e4c6'], sun: '#f6d9a0', sunLight: '#fbeac4', cloud: '#f6efdf', cloudShade: '#e8dcc6', cloudLight: '#fcf7ea',
      hills: ['#cdb98a', '#c2a877'], hedge: '#b0975f', hedgeFlowers: ['#d98b4a', '#eab765', '#c9704a'],
      grass: '#d2c88f', grassLight: '#dcd39c', grassDark: '#b9ac74', grassEdge: '#c6ba80', shade: '#bfb37c', daisies: [null, null],
      leafDark: '#b8643c', leaf: '#d98b4a', leafLight: '#eab765', leafMid: '#e09f55', blossom: '#c9523c', blossomLight: '#eab765',
      clothEdge: '#a97a4f', clothMid: '#f0dcae', clothCheck: '#dba95a', bedFlowers: ['#d98b4a', '#eab765', '#c9704a'],
      extras({r}) {
        for (const [x, y, c] of [[112, 150, '#d98b4a'], [128, 168, '#eab765'], [100, 176, '#c9704a'], [138, 156, '#eab765'], [120, 288, '#d98b4a'], [92, 152, '#c9704a'],
          [58, 300, '#eab765'], [174, 228, '#d98b4a'], [142, 298, '#c9704a'], [28, 262, '#eab765'], [106, 164, '#d98b4a'], [152, 148, '#eab765'], [70, 172, '#c9704a'], [12, 232, '#d98b4a']]) {
          r(x, y, 3, 2, c); r(x + 1, y - 1, 1, 1, c); r(x + 1, y + 2, 1, 1, '#8a5f3c');
        }
        r(96, 296, 24, 2, '#b9ac74');
        r(98, 286, 11, 10, 'edge'); r(99, 287, 9, 8, '#d98b4a'); r(101, 287, 1, 8, '#b8643c'); r(105, 287, 1, 8, '#b8643c'); r(103, 284, 2, 3, 'greenDark');
        r(110, 289, 8, 7, 'edge'); r(111, 290, 6, 5, '#eab765'); r(113, 290, 1, 5, '#d98b4a'); r(113, 287, 2, 3, 'greenDark');
      }},
    // 冬：灰蓝的天、落了雪的树和栅栏、雪地、小雪人和红格子毯子。
    winter: {...GARDEN, sky: ['#b9cdd3', '#cddbdc', '#e1e9e4'], sun: '#f4efdc', sunLight: '#fbf8ec', cloud: '#f4f6f2', cloudShade: '#dfe6e4', cloudLight: '#ffffff',
      hills: ['#d7e2df', '#c8d6d6'], hedge: '#a9bdb4', hedgeFlowers: ['#f4f6f2', '#f4f6f2', '#f4f6f2'],
      grass: '#eaf0ec', grassLight: '#f4f7f3', grassDark: '#d2ddda', grassEdge: '#dbe5e2', shade: '#d0dcdb', daisies: [null, null],
      leafDark: '#7f9396', leaf: '#a9bcb9', leafLight: '#f4f7f3', leafMid: '#dfe8e6', blossom: '#ffffff', blossomLight: '#f4f7f3',
      clothEdge: '#9c4f4a', clothMid: '#f0d2c8', clothCheck: '#c9605a', bedFlowers: ['#f4f6f2', '#f4f6f2', '#f4f6f2'],
      extras({r}) {
        for (let x = 9; x < 184; x += 9) r(x + 1, 118, 4, 2, '#ffffff');
        r(18, 127, 56, 2, '#ffffff'); r(16, 141, 60, 2, '#ffffff'); r(126, 43, 40, 3, '#ffffff'); r(136, 33, 34, 3, '#ffffff'); r(146, 28, 22, 2, '#ffffff');
        r(98, 296, 22, 2, '#d2ddda'); r(101, 281, 16, 15, 'edge'); r(102, 282, 14, 13, '#ffffff'); r(103, 270, 12, 12, 'edge'); r(104, 271, 10, 10, '#ffffff');
        r(106, 274, 1, 1, 'edge'); r(110, 274, 1, 1, 'edge'); r(108, 276, 3, 1, '#d98b4a'); r(102, 280, 14, 2, '#c9605a'); r(113, 282, 2, 5, '#c9605a');
        r(108, 285, 1, 1, 'edge'); r(108, 289, 1, 1, 'edge'); r(104, 266, 10, 5, 'edge'); r(105, 267, 8, 3, '#7f9396'); r(102, 270, 14, 1, 'edge');
        for (const [x, y] of [[40, 30], [90, 22], [110, 70], [60, 80], [20, 96], [100, 100], [30, 160], [120, 170], [90, 210], [20, 300], [130, 240]]) r(x, y, 1, 1, '#ffffff');
      }}
  };
  const paintOutdoor = ctx => paintGarden(ctx, SEASONS.outdoor);


  // 海边和市集共用的小工具：画框、食盆、玩具和小窝的位置与其它场景完全一致。
  function kit(ctx) {
    const r = (x, y, w, h, color) => {ctx.fillStyle = C[color] || color; ctx.fillRect(x, y, w, h);};
    const line = (x, y, w, color = 'woodDark') => r(x, y, w, 1, color);
    function block(x, y, w, h, face, outline = 'edge') { r(x, y, w, h, outline); r(x + 1, y + 1, w - 2, h - 2, face); }
    function flower(x, y, color) {
      r(x + 1, y, 3, 1, color); r(x, y + 1, 5, 3, color); r(x + 1, y + 4, 3, 1, color); r(x + 2, y + 2, 1, 1, '#bd9661');
    }
    function cloud(x, y, w, face = '#f3f3e6', shade = '#e4ebdc') {
      r(x + 4, y, w - 10, 3, face); r(x, y + 3, w, 4, face); r(x + 3, y + 7, w - 8, 2, shade);
    }
    function frame() { r(0, 0, WIDTH, HEIGHT, '#e1c3a0'); r(5, 10, 182, 306, 'edge'); }
    function sill() { r(8, 303, 176, 3, 'woodDark'); r(8, 306, 176, 5, 'wood'); r(9, 308, 174, 1, 'woodLight'); }
    function bowls(mat, shadow) {
      r(17, 270, 50, 21, shadow); r(18, 271, 48, 19, mat);
      for (let x = 20; x < 65; x += 4) r(x, 287, 2, 1, 'creamShade');
      for (const [x, fill] of [[22, 'pinkLight'], [45, 'blue']]) {
        r(x + 2, 274, 13, 2, 'edge'); r(x, 276, 17, 8, 'edge');
        r(x + 1, 276, 15, 6, fill); r(x + 3, 283, 11, 2, 'edge');
        r(x + 3, 278, 11, 3, x === 22 ? '#b69570' : '#bfdbd2'); r(x + 4, 277, 4, 1, 'cream');
      }
    }
    function petBed(shadow, cushion = '#d6c4c9', stripe = 'mauve') {
      r(144, 208, 36, 4, shadow);
      r(140, 180, 40, 29, 'edge'); r(142, 182, 36, 25, 'wood');
      for (let y = 185; y < 206; y += 4) line(142, y, 36, 'woodDark');
      for (let x = 145; x < 178; x += 5) r(x, 183, 1, 23, 'woodLight');
      r(141, 178, 38, 4, 'edge'); r(142, 179, 36, 2, 'woodLight');
      r(145, 184, 30, 18, 'mauveDark'); r(146, 185, 28, 16, cushion); r(149, 187, 22, 2, '#ead9d7');
      for (let x = 148; x < 173; x += 7) r(x, 195, 3, 5, stripe);
    }
    // 圆润的像素形状：按扫描线画椭圆，并裁在画框以内。
    function disc(cx, cy, rx, ry, color) {
      for (let dy = -ry; dy <= ry; dy++) {
        const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + 0.01))));
        const x0 = Math.max(7, cx - half), x1 = Math.min(184, cx + half), y = cy + dy;
        if (y < 12 || y > 302 || x1 < x0) continue;
        r(x0, y, x1 - x0 + 1, 1, color);
      }
    }
    // 树冠：一组互相叠压的圆团。先铺整体的深色轮廓，再铺中间色，再给每一团的右下加暗部、
    // 左上加亮部，最后点几粒高光，所以读起来是一整棵蓬松的树而不是几块方砖。
    function canopy(puffs, [dark, shade, mid, light, spark], dots = []) {
      for (const [cx, cy, rx, ry] of puffs) disc(cx, cy, rx, ry, dark);
      for (const [cx, cy, rx, ry] of puffs) disc(cx, cy - 1, Math.max(1, rx - 1), Math.max(1, ry - 1), mid);
      for (const [cx, cy, rx, ry] of puffs) if (rx > 6) disc(cx + Math.round(rx * 0.32), cy + Math.round(ry * 0.38), Math.round(rx * 0.5), Math.max(1, Math.round(ry * 0.36)), shade);
      for (const [cx, cy, rx, ry] of puffs) disc(cx - Math.round(rx * 0.26), cy - Math.round(ry * 0.34), Math.max(1, Math.round(rx * 0.52)), Math.max(1, Math.round(ry * 0.4)), light);
      for (const [cx, cy, rx, ry] of puffs) if (rx > 8) { r(cx - Math.round(rx * 0.5), cy - Math.round(ry * 0.55), Math.max(2, Math.round(rx * 0.3)), 1, spark); r(cx - Math.round(rx * 0.3), cy - Math.round(ry * 0.7), 2, 1, spark); }
      for (const [x, y, c] of dots) { r(x, y, 2, 1, c || spark); r(x, y + 1, 1, 1, c || spark); }
    }
    // 树干：由下到上逐渐收细，左侧受光、右侧背光，根部略微外张。
    function trunk(cx, top, base, wTop, wBase, [bark, barkLight, barkDark], lean = 0) {
      for (let y = top; y <= base; y++) {
        const t = (y - top) / Math.max(1, base - top), wf = wTop + (wBase - wTop) * t * t, mid = cx + lean * (1 - t) * (1 - t), x = Math.round(mid - wf / 2), w = Math.max(2, Math.round(mid + wf / 2) - x);
        r(x - 1, y, w + 2, 1, 'edge'); r(x, y, w, 1, bark); r(x + 1, y, Math.max(1, Math.round(w * 0.25)), 1, barkLight); r(x + w - Math.max(1, Math.round(w * 0.25)), y, Math.max(1, Math.round(w * 0.25)), 1, barkDark);
      }
      const w = wBase; r(cx - Math.floor(w / 2) - 4, base - 1, w + 8, 3, 'edge'); r(cx - Math.floor(w / 2) - 3, base - 1, w + 6, 2, bark); r(cx - Math.floor(w / 2) - 2, base - 1, 3, 1, barkLight);
      for (let y = top + 16; y < base - 12; y += 25) { const t = (y - top) / (base - top); r(Math.round(cx + lean * (1 - t) * (1 - t)), y, 1, 3, barkDark); r(Math.round(cx + lean * (1 - t) * (1 - t)) - 1, y + 1, 1, 1, barkDark); }
    }
    function branch(x, y, dx, len, [bark, , barkDark]) {
      for (let i = 0; i < len; i++) { const bx = x + dx * i * 2, by = y - i; r(bx, by, 3, 3, 'edge'); r(bx, by, 3, 2, bark); r(bx, by + 2, 3, 1, barkDark); }
    }
    // 近处的树冠：方方正正的像素阶梯。每一层是一条横带，层与层之间错开几格形成台阶状的轮廓；
    // 内部用方形的亮块、暗块和零星的叶片短线做层次，不用圆团。
    function stepCrown(bands, top, bandH, [dark, shade, mid, light, spark], lights = [], shades = []) {
      const rows = bands.map(([cx, w], i) => { const x0 = Math.max(7, cx - Math.floor(w / 2)), x1 = Math.min(184, cx + Math.ceil(w / 2) - 1); return {x0, x1, y: top + i * bandH}; });
      // 先铺整棵树的深色剪影，再把每一层向内收两格填中间色，台阶处自然留下一圈描边。
      for (const b of rows) r(b.x0, b.y, b.x1 - b.x0 + 1, bandH, dark);
      rows.forEach((b, i) => {
        const prev = rows[i - 1], next = rows[i + 1];
        const x0 = Math.max(b.x0, prev ? prev.x0 : b.x0, next ? Math.min(next.x0, b.x0 + 99) : b.x0) , x1 = b.x1;
        const topInset = !prev ? 2 : 0, bottomInset = !next ? 3 : 0;
        r(b.x0 + 2, b.y + topInset, b.x1 - b.x0 - 3, bandH - topInset - bottomInset, mid);
        if (prev && prev.x0 > b.x0 + 2) r(b.x0 + 2, b.y, prev.x0 - b.x0 - 2 + 2, 2, dark);
        if (prev && prev.x1 < b.x1 - 2) r(prev.x1 - 1, b.y, b.x1 - prev.x1, 2, dark);
        if (next && next.x0 > b.x0 + 2) r(b.x0 + 2, b.y + bandH - 3, next.x0 - b.x0, 3, dark);
        if (next && next.x1 < b.x1 - 2) r(next.x1 - 1, b.y + bandH - 3, b.x1 - next.x1, 3, dark);
      });
      // 大块的方形暗部和亮部，亮块左上角再压一小块高光。
      for (const [x, y, w, h] of shades) r(x, y, w, h, shade);
      for (const [x, y, w, h] of lights) { r(x, y, w, h, light); r(x + 1, y + 1, Math.max(2, Math.round(w * 0.4)), Math.max(1, Math.round(h * 0.3)), spark); }
    }
    return {r, line, block, flower, cloud, frame, sill, bowls, petBed, disc, canopy, stepCrown, trunk, branch};
  }

  // 海边：浅浅的海、远处的小帆船、椰子树荫下的小窝、条纹沙滩巾和一座沙堡。
  function paintBeach(ctx) {
    const {r, line, block, cloud, frame, sill, bowls, petBed} = kit(ctx);
    const SAND = '#f0dfb6', SAND_LIGHT = '#f7e9c6', SAND_DARK = '#dcc797', WET = '#d9c79c';
    frame();
    r(7, 12, 178, 40, '#9fd0d6'); r(7, 52, 178, 26, '#b6dcdc'); r(7, 78, 178, 18, '#d2e9dc');
    r(22, 24, 12, 12, '#fbe7a2'); r(20, 26, 16, 8, '#fbe7a2'); r(24, 22, 8, 16, '#fbe7a2'); r(25, 27, 5, 4, '#fff6cf');
    cloud(50, 26, 34); cloud(92, 46, 26); cloud(12, 58, 22);
    // Sea in four bands; the horizon keeps a distant island and one tiny sailboat.
    r(7, 96, 178, 10, '#7fb9c6'); r(7, 106, 178, 14, '#8fc6cd'); r(7, 120, 178, 14, '#a6d5d3'); r(7, 134, 178, 10, '#c3e3d9');
    r(96, 90, 34, 6, '#a9c7a4'); r(104, 87, 18, 3, '#a9c7a4'); r(110, 85, 8, 2, '#a9c7a4');
    r(52, 92, 12, 3, 'edge'); r(53, 93, 10, 1, 'cream'); r(57, 80, 1, 12, 'edge'); r(58, 81, 5, 9, 'cream'); r(58, 84, 3, 6, '#f3d9cd'); r(53, 85, 4, 6, 'cream');
    for (const [x, y, w] of [[14, 101, 18], [70, 99, 14], [132, 103, 22], [30, 112, 26], [100, 115, 20], [150, 111, 16], [18, 126, 22], [78, 128, 30], [140, 125, 24]]) line(x, y, w, '#d7ede4');
    // Foam scallops where the water meets the wet sand.
    r(7, 144, 178, 6, WET);
    for (let x = 7; x < 185; x += 12) { r(x, 141, 9, 3, '#f4f8ee'); r(x + 2, 140, 5, 1, '#f4f8ee'); r(x + 9, 143, 3, 2, '#e3efe2'); }
    r(8, 150, 176, 156, SAND);
    for (let row = 0, y = 150; y < 306; row++, y += 19) {
      if (row % 2 === 0) r(8, y, 176, Math.min(19, 306 - y), SAND_LIGHT);
      if (y + 12 >= 303) continue;
      for (let x = 12 + (row % 2 ? 24 : 0); x < 180; x += 48) { line(x, y + 10, 9, SAND_DARK); line(x + 3, y + 12, 5, SAND_DARK); r(x + 26, y + 5, 1, 1, SAND_DARK); }
    }
    r(8, 150, 3, 156, '#e6d4a6'); r(181, 150, 3, 156, '#e6d4a6'); sill();
    for (const [x, y] of [[110, 158], [128, 290], [70, 164], [174, 240], [14, 256], [104, 172]]) { r(x, y, 3, 2, 'pinkLight'); r(x + 1, y - 1, 1, 1, 'pinkLight'); r(x + 1, y, 1, 1, 'cream'); }
    r(118, 164, 5, 1, '#e58f8f'); r(120, 162, 1, 5, '#e58f8f'); r(119, 163, 3, 3, '#e58f8f'); r(120, 164, 1, 1, '#f3d9cd');

    // Palm: a leaning stepped trunk and five broad fronds with a pair of coconuts.
    r(134, 198, 48, 16, '#e0cf9f'); r(128, 202, 56, 8, '#e0cf9f');
    for (let i = 0; i < 9; i++) { r(160 - Math.floor(i / 3), 96 + i * 9, 11, 9, 'edge'); r(161 - Math.floor(i / 3), 96 + i * 9, 9, 8, i % 2 ? 'wood' : 'woodLight'); line(161 - Math.floor(i / 3), 104 + i * 9, 9, 'woodDark'); }
    // Hand-placed fronds: each one is a short run of overlapping blocks that lifts, then droops.
    const fronds = [
      [[150, 80, 14, 6], [138, 82, 14, 6], [128, 86, 12, 6], [120, 91, 10, 6], [116, 96, 6, 7]],
      [[150, 72, 14, 7], [140, 66, 13, 7], [130, 62, 12, 6], [122, 62, 10, 5]],
      [[157, 68, 9, 12], [152, 58, 9, 11], [147, 50, 9, 10], [142, 46, 8, 6]],
      [[166, 66, 9, 13], [170, 56, 9, 11], [174, 48, 9, 10]],
      [[169, 78, 11, 6], [175, 82, 8, 7], [179, 88, 5, 9]],
      [[152, 86, 9, 7], [146, 91, 8, 8], [142, 98, 6, 9]]
    ];
    for (const leafRun of fronds) for (const [x, y, w, h] of leafRun) r(x, y, w, h, 'greenDark');
    for (const leafRun of fronds) for (const [x, y, w, h] of leafRun) { r(x + 1, y + 1, w - 2, h - 3, 'green'); line(x + 2, y + 1, Math.max(2, w - 5), 'greenLight'); }
    r(158, 78, 12, 10, 'greenDark'); r(160, 79, 8, 6, 'green');
    r(158, 88, 5, 5, 'edge'); r(159, 89, 3, 3, '#a97a4f'); r(164, 90, 5, 5, 'edge'); r(165, 91, 3, 3, '#a97a4f');

    // Parasol and deck chair where the bench stands in the garden.
    r(18, 160, 58, 3, SAND_DARK);
    r(45, 104, 2, 56, 'edge'); r(14, 98, 64, 2, 'edge'); r(18, 92, 56, 6, 'edge'); r(26, 87, 40, 5, 'edge'); r(36, 84, 20, 3, 'edge');
    r(19, 93, 54, 5, 'cream'); r(27, 88, 38, 5, 'cream'); r(37, 85, 18, 3, 'cream');
    for (const x of [19, 37, 55]) { r(x, 93, 9, 5, '#e58f8f'); } r(27, 88, 9, 5, '#e58f8f'); r(46, 88, 9, 5, '#e58f8f'); r(42, 85, 8, 3, '#e58f8f');
    for (let x = 15; x < 78; x += 9) r(x, 100, 5, 2, 'cream');
    block(20, 142, 52, 5, 'woodLight'); r(22, 147, 3, 12, 'edge'); r(67, 147, 3, 12, 'edge'); r(23, 148, 1, 10, 'woodLight'); r(68, 148, 1, 10, 'woodLight');
    block(20, 126, 6, 17, 'woodLight'); for (let x = 27; x < 70; x += 8) { r(x, 138, 6, 4, 'cream'); r(x, 138, 6, 1, '#9cc0c8'); r(x, 141, 6, 1, '#9cc0c8'); }
    r(22, 128, 14, 10, 'edge'); r(23, 129, 12, 8, '#9cc0c8'); line(24, 130, 10, '#d5e6e8');

    // Striped beach towel in the middle keeps the pet's spot clear.
    r(48, 192, 100, 81, '#e0cf9f');
    r(42, 184, 106, 77, '#7f9fb0'); r(47, 179, 96, 87, '#7f9fb0');
    r(45, 185, 100, 75, 'cream'); r(49, 182, 92, 81, 'cream');
    for (let y = 190; y < 258; y += 16) { r(45, y, 100, 8, '#9cc0c8'); line(45, y + 1, 100, '#b9d6da'); }
    r(45, 185, 4, 75, 'cream'); r(141, 185, 4, 75, 'cream');
    for (let x = 52; x < 139; x += 6) { r(x, 181, 2, 1, 'cream'); r(x, 264, 2, 1, 'cream'); }

    petBed('#d6c38f', '#cfe1e2', '#9cc0c8');

    // Sandcastle with a flag, bucket and spade, and a striped beach ball.
    r(15, 199, 28, 3, SAND_DARK); r(16, 188, 26, 11, 'edge'); r(17, 189, 24, 9, '#e6d09a');
    r(16, 180, 8, 9, 'edge'); r(17, 181, 6, 8, '#e6d09a'); r(34, 180, 8, 9, 'edge'); r(35, 181, 6, 8, '#e6d09a');
    r(24, 172, 10, 17, 'edge'); r(25, 173, 8, 16, '#eedbab'); r(27, 192, 4, 6, 'edge'); r(28, 193, 2, 5, '#b99f6c');
    r(16, 178, 2, 2, 'edge'); r(20, 178, 2, 2, 'edge'); r(34, 178, 2, 2, 'edge'); r(38, 178, 2, 2, 'edge'); r(24, 170, 2, 2, 'edge'); r(28, 170, 2, 2, 'edge'); r(32, 170, 2, 2, 'edge');
    r(29, 160, 1, 10, 'edge'); r(30, 160, 6, 4, '#e58f8f');
    r(18, 226, 22, 2, SAND_DARK); r(19, 214, 14, 12, 'edge'); r(20, 215, 12, 10, '#e58f8f'); r(21, 216, 3, 8, '#f3b7ae'); r(18, 212, 16, 3, 'edge'); r(19, 213, 14, 1, '#f3b7ae');
    r(21, 207, 10, 2, 'edge'); r(20, 208, 2, 5, 'edge'); r(30, 208, 2, 5, 'edge');
    r(36, 212, 2, 12, 'edge'); r(34, 222, 6, 6, 'edge'); r(35, 223, 4, 4, '#9cc0c8');
    r(22, 246, 16, 2, SAND_DARK); r(24, 232, 12, 14, 'edge'); r(22, 234, 16, 10, 'edge'); r(24, 233, 12, 12, 'cream'); r(23, 235, 14, 8, 'cream');
    r(24, 233, 4, 12, '#e58f8f'); r(32, 233, 4, 12, '#9cc0c8'); r(23, 235, 1, 8, '#e58f8f'); r(36, 235, 1, 8, '#9cc0c8'); r(29, 234, 2, 1, '#ffffff');

    bowls('#e8dcbe', 'greenDark');
    // Cooler box with a towel on top, a drink with a straw, and the species toy.
    r(148, 277, 27, 3, SAND_DARK); block(148, 258, 25, 19, '#9cc0c8'); r(149, 259, 23, 3, '#d5e6e8'); r(148, 264, 25, 1, 'edge'); r(158, 268, 5, 2, 'edge');
    r(151, 252, 19, 6, 'edge'); r(152, 253, 17, 4, 'cream'); r(152, 254, 17, 1, '#e58f8f');
    r(118, 291, 12, 2, SAND_DARK); block(120, 279, 8, 12, '#f3d9cd'); r(121, 280, 6, 4, '#e58f8f'); r(125, 272, 1, 8, 'edge'); r(125, 272, 3, 1, 'edge');
  }

  // 市集：两个条纹棚子的小摊、彩旗和灯串、石板路，花车旁边是小窝。
  function paintMarket(ctx) {
    const {r, line, block, flower, cloud, frame, sill, bowls, petBed} = kit(ctx);
    const STONE = '#e6d7bd', STONE_LIGHT = '#efe2ca', STONE_DARK = '#cdbb9c';
    frame();
    r(7, 12, 178, 30, '#f1ddb8'); r(7, 42, 178, 26, '#f5e6c6'); r(7, 68, 178, 30, '#f8eed6');
    cloud(18, 20, 30, '#fdf6e6', '#f0e4cc'); cloud(120, 16, 26, '#fdf6e6', '#f0e4cc');
    // Rooftops of the old street behind the stalls.
    for (const [x, w, h, c] of [[7, 40, 34, '#e2c7a2'], [47, 34, 44, '#d9b98f'], [81, 46, 30, '#e7cfae'], [127, 30, 40, '#dcc09a'], [157, 28, 28, '#e2c7a2']]) {
      r(x, 98 - h, w, h, c); r(x, 98 - h, w, 3, '#b98d6b'); r(x + 2, 95 - h, w - 4, 3, '#c9a07c');
      for (let wx = x + 6; wx < x + w - 6; wx += 12) { r(wx, 104 - h, 6, 8, 'edge'); r(wx + 1, 105 - h, 4, 6, '#f6e3b0'); line(wx + 1, 108 - h, 4, 'edge'); }
    }
    // Bunting and a string of lights across the square.
    for (let x = 9, i = 0; x < 184; x += 9, i++) { const y = 46 + Math.round(Math.sin(i / 19 * Math.PI) * 9); r(x, y, 9, 1, 'edge'); const c = ['#e58f8f', '#f1c36d', '#9cc0c8', '#b6a5b5'][i % 4]; r(x + 2, y + 1, 5, 2, c); r(x + 3, y + 3, 3, 2, c); r(x + 4, y + 5, 1, 1, c); }
    for (let x = 12, i = 0; x < 184; x += 14, i++) { const y = 66 + Math.round(Math.sin(i / 12 * Math.PI) * 6); r(x - 6, y, 14, 1, '#8e715b'); r(x, y + 1, 3, 4, '#f6e3b0'); r(x + 1, y + 2, 1, 2, '#fff8d6'); }

    r(7, 98, 178, 55, '#e9d6b4'); for (let x = 9; x < 184; x += 16) r(x, 100, 1, 52, '#dcc59f');
    // Left stall: fruit under a red-striped awning.
    r(12, 150, 78, 3, STONE_DARK);
    r(14, 96, 3, 54, 'edge'); r(85, 96, 3, 54, 'edge'); r(15, 97, 1, 52, 'woodLight'); r(86, 97, 1, 52, 'woodLight');
    r(10, 84, 82, 14, 'edge'); for (let x = 11; x < 91; x += 10) { r(x, 85, 5, 12, '#e58f8f'); r(x + 5, 85, 5, 12, 'cream'); }
    for (let x = 10; x < 92; x += 10) { r(x, 98, 10, 3, 'edge'); r(x + 1, 98, 8, 2, x % 20 === 10 ? '#e58f8f' : 'cream'); }
    block(12, 122, 78, 28, 'woodLight'); line(13, 123, 76, 'cream'); for (let x = 22; x < 88; x += 13) r(x, 124, 1, 25, 'wood');
    r(10, 118, 82, 5, 'edge'); r(11, 119, 80, 3, 'wood'); line(11, 119, 80, 'woodLight');
    for (const [x, c, d] of [[15, '#e58f8f', '#c9605a'], [34, '#f1c36d', '#d9a14a'], [53, '#b9c898', '#8aab85'], [72, '#e9a36b', '#cf8650']]) {
      block(x, 108, 16, 11, 'wood'); for (let i = 0; i < 3; i++) { r(x + 2 + i * 4, 106, 4, 4, d); r(x + 2 + i * 4, 106, 3, 3, c); } r(x + 4, 103, 4, 4, d); r(x + 4, 103, 3, 3, c); r(x + 9, 104, 3, 3, c);
    }
    block(40, 132, 24, 11, 'cream'); line(44, 135, 16, 'edge'); line(46, 138, 12, 'pink');

    // Right stall: a flower cart with a green awning; the pet bed sits beside it.
    r(100, 150, 84, 3, STONE_DARK);
    r(104, 96, 3, 54, 'edge'); r(178, 96, 3, 54, 'edge'); r(105, 97, 1, 52, 'woodLight'); r(179, 97, 1, 52, 'woodLight');
    r(100, 84, 84, 14, 'edge'); for (let x = 101; x < 183; x += 10) { r(x, 85, 5, 12, 'green'); r(x + 5, 85, 5, 12, 'cream'); }
    for (let x = 100; x < 184; x += 10) { r(x, 98, 10, 3, 'edge'); r(x + 1, 98, 8, 2, x % 20 === 0 ? 'green' : 'cream'); }
    block(102, 124, 80, 26, 'green'); line(103, 125, 78, 'greenLight'); for (let x = 112; x < 180; x += 13) r(x, 126, 1, 23, 'greenDark');
    r(100, 120, 84, 5, 'edge'); r(101, 121, 82, 3, 'wood'); line(101, 121, 82, 'woodLight');
    for (const [x, c] of [[104, 'pink'], [118, 'cream'], [132, '#f1c36d'], [146, 'pinkLight'], [160, '#b6a5b5'], [171, 'cream']]) {
      block(x, 112, 10, 9, 'blue'); r(x + 4, 104, 1, 8, 'greenDark'); r(x + 2, 106, 2, 2, 'green'); r(x + 6, 108, 2, 2, 'green'); flower(x + 2, 100, c); flower(x - 1, 104, c);
    }
    block(128, 132, 28, 11, 'cream'); r(133, 135, 3, 3, 'pink'); r(137, 135, 3, 3, 'pink'); r(134, 138, 5, 2, 'pink'); line(143, 136, 9, 'edge'); line(143, 139, 7, 'edge');

    // Cobbled square: staggered warm stones with soft joints.
    r(7, 153, 178, 153, STONE);
    for (let row = 0, y = 153; y < 306; row++, y += 17) {
      line(8, y, 176, STONE_DARK); r(8, y + 1, 176, 2, STONE_LIGHT);
      for (let x = 8 + (row % 2 ? 14 : 0); x < 184; x += 28) { r(x, y + 1, 1, 16, STONE_DARK); r(x + 6, y + 9, 5, 1, '#dccbab'); }
    }
    r(8, 153, 3, 153, '#d9c8a8'); r(181, 153, 3, 153, '#d9c8a8'); sill();

    // Round woven mat in the middle of the square.
    r(48, 192, 100, 81, STONE_DARK);
    r(42, 184, 106, 77, '#a97a4f'); r(47, 179, 96, 87, '#a97a4f');
    r(45, 185, 100, 75, '#e7cf9f'); r(49, 182, 92, 81, '#e7cf9f');
    for (let y = 188; y < 258; y += 8) { line(49, y, 92, '#d2b57f'); for (let x = 50 + (y % 16 ? 6 : 0); x < 140; x += 12) r(x, y + 1, 6, 6, '#f1ddb3'); }
    r(45, 185, 4, 75, '#dcc28e'); r(141, 185, 4, 75, '#dcc28e');
    for (let x = 52; x < 139; x += 6) { r(x, 181, 2, 1, 'cream'); r(x, 264, 2, 1, 'cream'); }

    petBed(STONE_DARK, '#f0d2c8', '#e58f8f');

    // Lamp post, a barrel with a plant, and a crate of bread along the left side.
    r(26, 160, 2, 40, 'edge'); r(22, 198, 10, 3, 'edge'); r(23, 199, 8, 1, 'woodLight'); r(21, 154, 12, 8, 'edge'); r(22, 155, 10, 6, '#f6e3b0'); r(24, 156, 4, 4, '#fff8d6'); r(23, 152, 8, 2, 'edge');
    r(15, 228, 26, 2, STONE_DARK); block(16, 208, 24, 20, 'wood'); line(17, 212, 22, 'edge'); line(17, 223, 22, 'edge'); for (let x = 21; x < 38; x += 5) r(x, 209, 1, 18, 'woodDark');
    r(27, 196, 1, 12, 'greenDark'); r(22, 198, 6, 4, 'green'); r(28, 200, 7, 4, 'greenDark'); r(24, 203, 5, 3, 'green'); flower(25, 192, 'pink');
    r(18, 250, 24, 2, STONE_DARK); block(19, 238, 22, 12, 'woodLight'); line(20, 243, 20, 'wood');
    for (const x of [21, 28, 35]) { r(x, 233, 6, 6, 'edge'); r(x + 1, 234, 4, 4, '#e2b477'); line(x + 1, 235, 4, '#f0cf96'); }

    bowls('#bac49b', 'greenDark');
    // Sandwich board and a shopping basket with a baguette.
    r(146, 277, 30, 3, STONE_DARK);
    block(148, 258, 25, 19, 'wood'); r(150, 256, 21, 4, 'woodLight'); for (let y = 262; y < 275; y += 4) line(149, y, 23, 'woodDark'); for (let x = 151; x < 172; x += 4) r(x, 262, 1, 14, 'woodLight');
    r(154, 246, 4, 12, 'edge'); r(155, 247, 2, 10, '#e2b477'); r(160, 249, 8, 8, 'edge'); r(161, 250, 6, 6, '#e58f8f'); r(163, 248, 2, 2, 'greenDark');
    r(114, 292, 18, 2, STONE_DARK); r(115, 270, 16, 22, 'edge'); r(116, 271, 14, 17, '#5f6f66'); line(118, 275, 10, 'cream'); line(118, 279, 8, 'cream'); r(119, 282, 3, 3, 'pink'); r(123, 283, 5, 1, 'cream');
    r(115, 288, 2, 4, 'woodDark'); r(129, 288, 2, 4, 'woodDark');
  }


  // ---- 四季：每个季节是一处有代表性的地方和它的代表植物，而不是同一个小院换颜色。 ----
  // 春 · 樱花河堤；夏 · 荷塘木栈台；秋 · 枫叶银杏林；冬 · 雪中小木屋。

  // 春：河对岸一排樱花，一座小拱桥，近处两棵开满花的樱花树和一小片郁金香。
  function paintSpring(ctx) {
    const {r, line, block, flower, cloud, frame, sill, bowls, petBed, canopy, stepCrown, trunk, branch} = kit(ctx);
    const G = '#c6dba3', GL = '#d3e4b1', GD = '#a8c58d', P1 = '#c98f96', P2 = '#e6b1b5', P3 = '#f5d3d0', P4 = '#fff1ee', BARK = '#7d5f55';
    const BLOSSOM = [P1, '#d79fa5', P2, P3, P4], BARKS = [BARK, '#9a7a6c', '#5f463f'];
    frame();
    r(7, 12, 178, 36, '#b7dbdc'); r(7, 48, 178, 26, '#cde6de'); r(7, 74, 178, 22, '#e4f0dc');
    r(82, 20, 12, 12, '#fdf0c8'); r(80, 22, 16, 8, '#fdf0c8'); r(84, 18, 8, 16, '#fdf0c8'); r(85, 23, 5, 4, '#fff8de');
    cloud(62, 44, 26, '#fbf7ee', '#eef0e2'); cloud(96, 60, 20, '#fbf7ee', '#eef0e2');
    // Far bank: soft hills and a continuous band of cherry trees in bloom.
    r(7, 84, 70, 14, '#bcd6a8'); r(22, 80, 36, 4, '#bcd6a8'); r(70, 88, 115, 10, '#b0cc9c'); r(96, 84, 50, 4, '#b0cc9c');
    for (let x = 12, i = 0; x < 180; x += 14, i++) { r(x, 92, 2, 9, BARK); canopy([[x - 3, 90 + (i % 2), 6, 5], [x + 4, 88 + (i % 3), 7, 6], [x + 1, 84 + (i % 2), 5, 4]], BLOSSOM); }
    r(7, 100, 178, 4, '#a9c896');
    // The river, with a low arched bridge and drifting petals.
    r(7, 104, 178, 10, '#9ccbd0'); r(7, 114, 178, 12, '#aed6d5'); r(7, 126, 178, 8, '#c4e2da');
    for (const [x, y, w] of [[14, 108, 16], [58, 111, 22], [112, 107, 18], [150, 112, 20], [30, 120, 26], [96, 122, 24], [140, 128, 18], [70, 130, 12]]) line(x, y, w, '#dcefe6');
    for (const [x, y] of [[24, 116], [50, 124], [88, 110], [120, 118], [166, 122], [134, 130], [72, 119], [104, 128]]) { r(x, y, 2, 1, P3); r(x + 1, y + 1, 1, 1, P2); }
    r(36, 110, 60, 3, 'edge'); r(40, 107, 52, 3, 'edge'); r(46, 104, 40, 3, 'edge'); r(54, 102, 24, 2, 'edge');
    r(37, 111, 58, 1, '#f1e3cc'); r(41, 108, 50, 2, '#f1e3cc'); r(47, 105, 38, 2, '#f1e3cc'); r(55, 103, 22, 1, '#fbf1de');
    for (let x = 40; x < 94; x += 8) r(x, 100 + Math.round(Math.abs(x - 66) / 5), 1, 6, 'edge');
    r(36, 113, 6, 18, 'edge'); r(37, 114, 4, 16, '#e3d3ba'); r(90, 113, 6, 18, 'edge'); r(91, 114, 4, 16, '#e3d3ba'); r(46, 113, 40, 8, '#8fbfc6');
    // Near bank: young grass in mown bands, with daisies and fallen petals.
    r(8, 134, 176, 172, G);
    for (let row = 0, y = 134; y < 306; row++, y += 19) {
      if (row % 2 === 0) r(8, y, 176, Math.min(19, 306 - y), GL);
      for (let x = 14 + (row % 2 ? 21 : 0); x < 182; x += 43) if (y + 13 < 303) { r(x, y + 9, 1, 3, GD); r(x + 2, y + 8, 1, 4, GD); r(x + 4, y + 10, 1, 2, GD); }
    }
    r(8, 134, 176, 3, GD); r(8, 134, 3, 172, '#b6d09a'); r(181, 134, 3, 172, '#b6d09a'); sill();
    for (const [x, y] of [[112, 150], [126, 166], [104, 176], [136, 158], [118, 290], [94, 148], [60, 300], [172, 232], [140, 296], [12, 262], [108, 168], [150, 146], [72, 156], [176, 286], [50, 170], [14, 152], [98, 298], [130, 280]]) { r(x, y, 2, 1, P3); r(x + 1, y + 1, 1, 1, P2); }
    for (const [x, y] of [[20, 148], [102, 160], [176, 252], [70, 298]]) { r(x, y, 1, 1, 'cream'); r(x - 1, y + 1, 3, 1, 'cream'); r(x, y + 2, 1, 1, 'cream'); r(x, y + 1, 1, 1, '#e6c98a'); }

    // The big cherry tree on the right: a tapering trunk that forks into a wide, cloud-like crown.
    r(132, 196, 50, 20, '#b4cd98'); r(126, 200, 58, 12, '#b4cd98');
    trunk(163, 92, 176, 7, 13, BARKS, -3); branch(160, 108, -1, 9, BARKS); branch(164, 104, 1, 7, BARKS); branch(158, 124, -1, 5, BARKS);
    stepCrown([[158, 22], [154, 38], [150, 52], [149, 62], [146, 70], [147, 76], [145, 74], [148, 72], [150, 64], [149, 54], [155, 40], [158, 24]], 26, 6, BLOSSOM, [[128, 40, 26, 8], [148, 30, 18, 6], [118, 54, 22, 8], [152, 50, 18, 8], [124, 68, 16, 6]], [[150, 70, 26, 8], [122, 80, 16, 6], [166, 56, 14, 8], [136, 88, 24, 5]]);
    for (const [x, y] of [[132, 46], [158, 34], [120, 62], [164, 60], [142, 76], [174, 50], [116, 78], [170, 86], [138, 58], [150, 42], [128, 86], [178, 70]]) { r(x, y, 2, 2, P4); }
    for (const [x, y, h] of [[112, 86, 7], [122, 94, 5], [132, 98, 8], [146, 98, 5], [174, 100, 8], [181, 92, 6], [106, 82, 5]]) { r(x, y, 2, h, P2); r(x, y + h - 2, 2, 2, P3); r(x, y + h, 1, 1, P1); }
    // A second, smaller tree leans in from the left corner.
    trunk(30, 84, 138, 5, 9, BARKS, 2); branch(32, 100, 1, 6, BARKS);
    stepCrown([[24, 20], [27, 36], [29, 44], [31, 50], [30, 48], [32, 46], [29, 38], [33, 24]], 34, 6, BLOSSOM, [[12, 42, 18, 6], [22, 54, 20, 8], [28, 68, 14, 5]], [[38, 58, 14, 8], [14, 68, 12, 6]]);
    for (const [x, y] of [[16, 44], [36, 50], [24, 60], [44, 62], [30, 72], [12, 70], [40, 40]]) r(x, y, 2, 2, P4);
    for (const [x, y, h] of [[10, 82, 6], [22, 84, 4], [48, 80, 6], [56, 74, 5]]) { r(x, y, 2, h, P2); r(x, y + h - 2, 2, 2, P3); }

    // Sakura-pink picnic mat with a pale border.
    r(48, 192, 100, 81, '#b4cd98');
    r(42, 184, 106, 77, P1); r(47, 179, 96, 87, P1);
    r(45, 185, 100, 75, P3); r(49, 182, 92, 81, P3);
    r(50, 188, 89, 67, '#fbe6e2'); r(54, 185, 81, 73, '#fbe6e2');
    for (let x = 52; x < 139; x += 6) { r(x, 182, 2, 1, P4); r(x, 263, 2, 1, P4); }
    for (const [x, y] of [[62, 198], [124, 198], [62, 244], [124, 244], [93, 190], [93, 252]]) { r(x, y, 2, 2, P2); r(x - 2, y + 1, 2, 2, P2); r(x + 2, y + 1, 2, 2, P2); r(x - 1, y + 3, 2, 2, P2); r(x + 1, y + 3, 2, 2, P2); r(x, y + 2, 2, 1, '#f1c36d'); }
    petBed('#a8c58d', '#f5d3d0', P2);

    // Tulips in a wooden planter, a lunch box wrapped in cloth and a paper pinwheel.
    r(15, 199, 28, 3, GD); block(16, 186, 26, 13, '#b89373'); r(18, 188, 22, 3, '#8f6f55');
    for (const [x, c, d] of [[18, '#e58f8f', '#c9605a'], [24, '#f1c36d', '#d9a14a'], [30, '#e6b1b5', P1], [36, '#e58f8f', '#c9605a']]) { r(x + 1, 176, 1, 12, 'greenDark'); r(x - 1, 182, 2, 4, 'green'); r(x + 2, 180, 2, 5, 'green'); r(x, 170, 3, 6, d); r(x, 171, 3, 4, c); r(x + 1, 169, 1, 1, c); }
    r(18, 226, 22, 2, GD); block(19, 214, 20, 12, '#e6b1b5'); r(20, 215, 18, 3, '#f5d3d0'); r(27, 210, 4, 5, 'edge'); r(28, 211, 2, 3, '#f5d3d0'); r(24, 212, 3, 2, 'edge'); r(31, 212, 3, 2, 'edge');
    r(30, 240, 1, 10, 'edge'); r(26, 234, 5, 5, '#e58f8f'); r(31, 234, 5, 5, '#f1c36d'); r(26, 239, 5, 5, '#9cc0c8'); r(31, 239, 5, 5, P2); r(30, 238, 2, 2, 'cream');
    bowls('#f3e6d2', P1);
    // Picnic hamper with dango skewers, and a flask of tea.
    r(148, 277, 27, 3, GD);
    block(148, 256, 25, 21, 'wood'); r(150, 254, 21, 5, 'woodLight'); for (let y = 260; y < 275; y += 4) line(149, y, 23, 'woodDark'); for (let x = 151; x < 172; x += 4) r(x, 260, 1, 16, 'woodLight');
    for (const [x, c] of [[153, P2], [158, 'cream'], [163, '#b9c898']]) { r(x, 247, 5, 5, 'edge'); r(x + 1, 248, 3, 3, c); } r(151, 249, 20, 1, 'woodDark');
    r(118, 291, 14, 2, GD); block(120, 276, 9, 15, P2); r(122, 278, 2, 11, P3); block(121, 272, 7, 5, 'cream');
  }

  // 夏：一池荷花，垂柳，木栈台上铺着草席，旁边是西瓜和蒲扇。
  function paintSummer(ctx) {
    const {r, line, block, cloud, frame, sill, bowls, petBed, canopy, stepCrown, trunk, branch} = kit(ctx);
    const W1 = '#7fbfb9', W2 = '#93ccc2', W3 = '#abd9cb', PAD = '#6f9f6f', PAD_L = '#93bd86', PAD_D = '#4f7557', LOTUS = '#eaa7b3', LOTUS_L = '#f8d5d8';
    function pad(x, y, w) { r(x + 2, y, w - 4, 1, PAD_D); r(x, y + 1, w, 3, PAD_D); r(x + 2, y + 4, w - 4, 1, PAD_D); r(x + 2, y + 1, w - 4, 2, PAD); r(x + 3, y + 1, Math.max(2, w - 9), 1, PAD_L); r(x + Math.floor(w / 2), y + 1, 1, 3, PAD_D); }
    function lotus(x, y, stem) { r(x + 3, y + 6, 1, stem, PAD_D); r(x + 1, y, 5, 2, LOTUS); r(x, y + 2, 7, 3, LOTUS); r(x + 1, y + 5, 5, 1, LOTUS); r(x + 2, y + 1, 3, 3, LOTUS_L); r(x + 3, y + 3, 1, 1, '#f1c36d'); }
    function bud(x, y, stem) { r(x + 1, y + 5, 1, stem, PAD_D); r(x, y + 1, 3, 4, LOTUS); r(x + 1, y, 1, 1, LOTUS); r(x + 1, y + 2, 1, 2, LOTUS_L); }
    frame();
    r(7, 12, 178, 34, '#86c3d6'); r(7, 46, 178, 26, '#a3d4db'); r(7, 72, 178, 20, '#c4e4dc');
    r(22, 22, 12, 12, '#fde89c'); r(20, 24, 16, 8, '#fde89c'); r(24, 20, 8, 16, '#fde89c'); r(25, 25, 5, 4, '#fff6cf');
    // A tall summer cumulus and a smaller one.
    r(56, 40, 44, 12, '#fbfbf3'); r(62, 30, 30, 12, '#fbfbf3'); r(70, 22, 16, 10, '#fbfbf3'); r(52, 46, 52, 6, '#fbfbf3'); r(58, 52, 40, 3, '#e6efe6'); r(64, 34, 10, 3, '#ffffff'); r(72, 25, 8, 2, '#ffffff');
    cloud(104, 58, 22, '#fbfbf3', '#e6efe6');
    r(7, 82, 80, 12, '#9fc48f'); r(24, 78, 40, 4, '#9fc48f'); r(80, 86, 105, 8, '#8fb983'); r(104, 82, 44, 4, '#8fb983');
    r(7, 92, 178, 4, '#7fa873');
    // The pond: three bands of water, reeds on the far bank, lily pads and lotus in bloom.
    r(7, 96, 178, 24, W1); r(7, 120, 178, 28, W2); r(7, 148, 178, 26, W3);
    for (const [x, y, w] of [[12, 102, 20], [70, 100, 16], [128, 104, 24], [30, 126, 18], [96, 132, 22], [150, 124, 16], [56, 156, 20], [118, 160, 26]]) line(x, y, w, '#cfeadf');
    for (let x = 9; x < 120; x += 7) { const h = 6 + (x * 7) % 9; r(x, 96 - h, 1, h, '#6f9f6f'); if (x % 3 === 0) r(x - 1, 94 - h, 3, 3, '#8a5f3c'); }
    for (const [x, y, w] of [[12, 106, 18], [40, 112, 22], [74, 104, 16], [98, 114, 20], [126, 108, 18], [20, 128, 24], [58, 134, 20], [92, 140, 26], [130, 130, 22], [14, 152, 22], [44, 160, 26], [84, 156, 20], [116, 164, 24], [70, 120, 14], [108, 148, 16]]) pad(x, y, w);
    lotus(26, 110, 12); lotus(84, 122, 10); lotus(120, 96, 10); lotus(52, 142, 12); lotus(104, 132, 14); bud(46, 100, 8); bud(100, 102, 10); bud(72, 146, 8); bud(134, 142, 14); bud(18, 140, 10);
    // Weeping willow: a pale leaning trunk, a soft rounded crown and curtains of leaves that
    // hang in uneven lengths, each strand tapering to a light tip.
    const WILLOW = [PAD_D, '#5f8a62', '#74a071', '#a5c489', '#cfe0a8'], WBARK = ['#9c8a66', '#b8a67f', '#7d6c4c'];
    trunk(163, 58, 176, 7, 12, WBARK, -4); branch(160, 74, -1, 8, WBARK); branch(163, 70, 1, 6, WBARK);
    const strands = [];
    for (let x = 112, i = 0; x <= 183; x += 3, i++) {
      const arc = 1 - Math.pow((x - 148) / 38, 2), top = 54 - Math.round(arc * 6), len = 34 + ((i * 29) % 40) + Math.round(arc * 10);
      if (x > 153 && x < 173 && len > 40) continue;
      strands.push([x, top, len, i]);
    }
    for (const [x, top, len, i] of strands) { r(x, top, 2, len, i % 2 ? '#74a071' : '#5f8a62'); r(x, top + len - 5, 2, 5, '#a5c489'); r(x, top + len, 1, 2, '#cfe0a8'); if (i % 3 === 0) r(x + 1, top + 6, 1, len - 14, '#a5c489'); }
    stepCrown([[158, 24], [153, 44], [149, 60], [147, 70], [148, 72], [150, 66], [152, 52]], 16, 6, WILLOW, [[132, 24, 24, 6], [124, 36, 20, 6], [146, 20, 14, 4]], [[158, 38, 20, 8], [138, 48, 22, 5]]);
    for (const [x, top, len, i] of strands) if (i % 4 === 1) { r(x, 46, 2, 10, '#74a071'); r(x, 46, 1, 6, '#a5c489'); }
    // Wooden deck over the water: posts, a rope rail and warm planks.
    r(7, 174, 178, 4, 'edge'); r(7, 175, 178, 2, 'woodLight');
    r(8, 178, 176, 128, '#dcbb8c');
    for (let row = 0, y = 178; y < 306; row++, y += 16) { r(8, y, 176, 1, '#b99468'); r(8, y + 1, 176, 2, '#e9cc9f'); for (let x = 8 + (row % 2 ? 40 : 8); x < 184; x += 80) { r(x, y + 1, 1, 15, '#b99468'); r(x + 3, y + 7, 1, 1, '#b99468'); r(x - 3, y + 7, 1, 1, '#b99468'); if (x + 22 < 181) line(x + 10, y + 9, 12, '#cfae80'); } }
    r(8, 178, 3, 128, '#c9a577'); r(181, 178, 3, 128, '#c9a577'); sill();
    for (const x of [10, 52, 96, 138]) { r(x, 160, 6, 18, 'edge'); r(x + 1, 161, 4, 16, 'wood'); r(x + 1, 161, 1, 16, 'woodLight'); r(x - 1, 158, 8, 3, 'edge'); r(x, 159, 6, 1, 'woodLight'); }
    for (let x = 16, i = 0; x < 138; x += 6, i++) r(x, 165 + [0, 1, 2, 2, 1, 0, 0][i % 7], 6, 1, '#b99468');

    // Woven rush mat in the middle.
    r(48, 192, 100, 81, '#c2a074');
    r(42, 184, 106, 77, '#6f8f5f'); r(47, 179, 96, 87, '#6f8f5f');
    r(45, 185, 100, 75, '#cfdca2'); r(49, 182, 92, 81, '#cfdca2');
    for (let y = 186; y < 260; y += 4) line(49, y, 92, '#b7c98a'); for (let x = 60; x < 140; x += 22) r(x, 182, 2, 81, '#a9bd7c');
    r(45, 185, 4, 75, '#9fb672'); r(141, 185, 4, 75, '#9fb672');
    petBed('#c2a074', '#d7e9e4', '#93ccc2');

    // A potted lotus leaf, half a watermelon with a spoon, a round paper fan.
    r(15, 199, 28, 3, '#c2a074'); block(17, 184, 24, 15, '#9cc0c8'); r(19, 186, 20, 2, '#d5e6e8'); r(16, 182, 26, 3, 'edge'); r(17, 183, 24, 1, '#d5e6e8'); line(19, 193, 20, '#6f9fb0');
    r(28, 166, 1, 16, PAD_D); r(18, 160, 22, 7, PAD_D); r(20, 161, 18, 5, PAD); r(22, 162, 10, 2, PAD_L); r(29, 162, 1, 4, PAD_D); r(36, 172, 1, 10, PAD_D); r(34, 166, 5, 6, LOTUS); r(35, 167, 3, 4, LOTUS_L);
    r(17, 227, 26, 2, '#c2a074'); r(18, 216, 24, 11, 'edge'); r(20, 226, 20, 2, 'edge'); r(19, 216, 22, 9, '#4f7557'); r(20, 216, 20, 7, '#cfe3b0'); r(21, 216, 18, 6, '#e58f8f'); r(23, 217, 14, 2, '#f3a9a3');
    for (const [x, y] of [[24, 219], [29, 220], [34, 219], [27, 218], [32, 218]]) r(x, y, 1, 1, 'edge'); r(36, 210, 2, 8, 'edge'); r(35, 208, 4, 3, 'edge');
    r(22, 246, 18, 2, '#c2a074'); r(22, 232, 14, 12, 'edge'); r(20, 234, 18, 8, 'edge'); r(23, 233, 12, 10, '#f3ead2'); r(21, 235, 16, 6, '#f3ead2'); r(25, 235, 8, 6, '#9cc0c8'); r(27, 236, 4, 4, '#d5e6e8'); r(34, 242, 2, 6, 'edge'); r(35, 246, 3, 3, 'edge');
    bowls('#e8dcbe', '#6f8f5f');
    // A wooden tub of ice with two bottles, and a glass of iced tea.
    r(148, 277, 27, 3, '#c2a074'); block(148, 260, 25, 17, 'wood'); line(149, 264, 23, 'edge'); line(149, 272, 23, 'edge'); for (let x = 153; x < 172; x += 5) r(x, 261, 1, 15, 'woodDark');
    r(150, 256, 21, 5, '#e6f2f0'); r(152, 255, 5, 2, '#ffffff'); r(162, 255, 6, 2, '#ffffff'); r(154, 246, 4, 11, 'edge'); r(155, 247, 2, 9, '#9cc0c8'); r(163, 248, 4, 9, 'edge'); r(164, 249, 2, 7, '#b9c898');
    r(118, 291, 12, 2, '#c2a074'); block(120, 279, 8, 12, '#e9c48a'); r(121, 280, 6, 3, '#f6e7c6'); r(122, 283, 2, 2, '#ffffff'); r(125, 273, 1, 7, 'edge'); r(125, 273, 3, 1, 'edge');
  }

  // 秋：满山红叶和金黄的银杏，林间小路铺满落叶，石灯笼旁挂着柿子。
  function paintAutumn(ctx) {
    const {r, line, block, cloud, frame, sill, bowls, petBed, canopy, stepCrown, trunk, branch} = kit(ctx);
    const E = '#dcc48f', EL = '#e8d3a2', ED = '#c2a871', R1 = '#a8452f', R2 = '#cf6a3e', R3 = '#e59a52', Y1 = '#c9952f', Y2 = '#e6bd4f', Y3 = '#f4dc8a', BARK = '#6b4f40';
    function leafBit(x, y, c) { r(x, y, 3, 2, c); r(x + 1, y - 1, 1, 1, c); r(x + 1, y + 2, 1, 1, BARK); }
    const RED = [R1, '#b9532f', R2, R3, '#f4c27a'], GOLD = [Y1, '#d6a83c', Y2, Y3, '#fbeeb4'], BARKS = [BARK, '#876657', '#4f3a30'];
    frame();
    r(7, 12, 178, 34, '#e6d6b4'); r(7, 46, 178, 26, '#efe0bf'); r(7, 72, 178, 22, '#f6ebcf');
    r(84, 20, 12, 12, '#f8dba0'); r(82, 22, 16, 8, '#f8dba0'); r(86, 18, 8, 16, '#f8dba0');
    cloud(64, 46, 26, '#fbf3e2', '#eee0c6'); cloud(110, 44, 22, '#fbf3e2', '#eee0c6');
    // Layered autumn mountains.
    r(7, 78, 70, 20, '#d9a36a'); r(18, 70, 44, 8, '#d9a36a'); r(28, 64, 22, 6, '#d9a36a'); r(60, 84, 80, 14, '#c98a55'); r(80, 76, 44, 8, '#c98a55'); r(94, 71, 18, 5, '#c98a55');
    r(120, 82, 65, 16, '#dbb06f'); r(138, 76, 40, 6, '#dbb06f');
    // A row of trees behind the path, alternating maple and ginkgo.
    r(7, 96, 178, 34, '#c79a62'); r(7, 96, 178, 6, '#d3a86f');
    for (let x = 16, i = 0; x < 152; x += 19, i++) { const c = i % 2 ? GOLD : RED, y = 100 + (i % 3) * 3; r(x - 1, y + 6, 3, 24, BARK); r(x - 1, y + 6, 1, 24, '#876657'); canopy([[x, y, 10, 9], [x - 6, y + 5, 6, 6], [x + 7, y + 4, 6, 6], [x + 1, y - 7, 6, 5]], c); }
    r(7, 128, 178, 6, ED);
    // Earth path strewn with leaves in mown-looking bands.
    r(8, 134, 176, 172, E);
    for (let row = 0, y = 134; y < 306; row++, y += 19) {
      if (row % 2 === 0) r(8, y, 176, Math.min(19, 306 - y), EL);
      for (let x = 12 + (row % 2 ? 19 : 0); x < 180; x += 38) if (y + 14 < 303) { line(x, y + 12, 8, ED); r(x + 20, y + 6, 1, 1, ED); }
    }
    r(8, 134, 176, 3, ED); r(8, 134, 3, 172, '#cfb67f'); r(181, 134, 3, 172, '#cfb67f'); sill();
    for (const [x, y, i] of [[112, 150, 0], [128, 168, 1], [100, 176, 2], [138, 156, 3], [120, 288, 0], [92, 150, 4], [58, 300, 3], [174, 230, 0], [142, 298, 2], [12, 262, 1], [106, 164, 5], [152, 146, 3], [70, 172, 2], [12, 232, 0],
      [50, 152, 4], [176, 290, 1], [96, 298, 5], [132, 282, 4], [16, 146, 2], [68, 144, 1], [154, 222, 4], [44, 170, 0], [176, 160, 5], [84, 164, 3]]) leafBit(x, y, [R2, Y2, R1, R3, Y1, Y3][i]);

    // The great maple on the right: a forked trunk under a broad crown in three reds.
    r(132, 196, 50, 20, ED); r(126, 200, 58, 12, ED);
    trunk(163, 92, 176, 7, 13, BARKS, -3); branch(160, 108, -1, 9, BARKS); branch(164, 104, 1, 7, BARKS); branch(158, 124, -1, 5, BARKS);
    stepCrown([[158, 22], [154, 38], [150, 52], [149, 62], [146, 70], [147, 76], [145, 74], [148, 72], [150, 64], [149, 54], [155, 40], [158, 24]], 26, 6, RED, [[128, 40, 26, 8], [148, 30, 18, 6], [118, 54, 22, 8], [152, 50, 18, 8], [124, 68, 16, 6]], [[150, 70, 26, 8], [122, 80, 16, 6], [166, 56, 14, 8], [136, 88, 24, 5]]);
    for (const [x, y] of [[132, 46], [158, 34], [120, 62], [164, 60], [142, 76], [174, 50], [116, 78], [170, 86], [138, 58], [150, 42]]) { r(x, y, 3, 2, Y3); r(x + 1, y - 1, 1, 1, Y3); }
    // Maple leaves read as small five-point stars along the lower edge of the crown.
    for (const [x, y] of [[112, 90], [124, 96], [140, 100], [174, 102], [106, 84], [182, 94]]) { r(x, y, 3, 1, R2); r(x + 1, y - 1, 1, 3, R2); r(x, y + 1, 1, 1, R1); r(x + 2, y + 1, 1, 1, R1); }
    // A ginkgo leans in from the left corner, its fan leaves catching the light.
    trunk(30, 82, 138, 5, 9, BARKS, 2); branch(32, 98, 1, 6, BARKS);
    stepCrown([[24, 20], [27, 36], [29, 44], [31, 50], [30, 48], [32, 46], [29, 38], [33, 24]], 32, 6, GOLD, [[12, 40, 18, 6], [22, 52, 20, 8], [28, 66, 14, 5]], [[38, 56, 14, 8], [14, 66, 12, 6]]);
    for (const [x, y] of [[10, 82], [22, 86], [48, 80], [56, 72], [38, 84]]) { r(x, y, 3, 2, Y2); r(x + 1, y + 2, 1, 2, Y1); r(x, y, 1, 1, Y3); }
    // Persimmons hung to dry on a line between the ginkgo and a post.
    r(34, 100, 62, 1, 'edge'); r(94, 96, 3, 40, 'edge'); r(95, 97, 1, 38, 'woodLight');
    for (let x = 40; x < 92; x += 9) { r(x + 1, 101, 1, 4, 'edge'); r(x, 105, 4, 5, R1); r(x, 105, 3, 4, '#e9853f'); r(x + 1, 104, 2, 1, 'greenDark'); }

    // Plaid blanket in russet and mustard.
    r(48, 192, 100, 81, ED);
    r(42, 184, 106, 77, '#8a4f37'); r(47, 179, 96, 87, '#8a4f37');
    r(45, 185, 100, 75, '#f0dcae'); r(49, 182, 92, 81, '#f0dcae');
    for (let y = 188; y < 258; y += 14) { r(45, y, 100, 5, '#e2b062'); line(45, y + 2, 100, R2); }
    for (let x = 54; x < 138; x += 14) { r(x, 182, 5, 81, '#e2b062'); r(x + 2, 182, 1, 81, R2); for (let y = 188; y < 258; y += 14) r(x, y, 5, 5, '#c98a3f'); }
    r(45, 185, 4, 75, '#f0dcae'); r(141, 185, 4, 75, '#f0dcae');
    for (let x = 52; x < 139; x += 6) { r(x, 181, 2, 1, 'cream'); r(x, 264, 2, 1, 'cream'); }
    petBed(ED, '#f0dcae', '#e2b062');

    // Stone lantern, a raked heap of leaves with a rake, and three acorns.
    r(15, 199, 28, 3, ED);
    r(22, 190, 14, 9, 'edge'); r(23, 191, 12, 7, '#b9b3a4'); r(26, 176, 6, 14, 'edge'); r(27, 177, 4, 13, '#c9c3b4'); r(20, 164, 18, 12, 'edge'); r(21, 165, 16, 10, '#c9c3b4'); r(25, 167, 8, 6, 'edge'); r(26, 168, 6, 4, '#f6dc9a');
    r(16, 160, 26, 4, 'edge'); r(17, 161, 24, 2, '#b9b3a4'); r(22, 156, 14, 4, 'edge'); r(23, 157, 12, 2, '#c9c3b4'); r(27, 153, 4, 3, 'edge');
    r(16, 227, 28, 2, ED); r(20, 218, 20, 9, R1); r(24, 214, 12, 6, R1); r(21, 219, 18, 7, R2); r(25, 215, 10, 5, R2); r(24, 220, 6, 3, Y2); r(32, 217, 4, 3, Y2); r(28, 222, 5, 3, R3);
    r(41, 204, 2, 22, 'edge'); r(37, 224, 10, 2, 'edge'); for (let x = 37; x < 47; x += 3) r(x, 226, 1, 3, 'edge');
    for (const x of [24, 30, 36]) { r(x, 240, 4, 5, 'edge'); r(x + 1, 241, 2, 3, '#b98250'); r(x, 239, 4, 2, BARK); r(x + 1, 238, 2, 1, BARK); }
    bowls('#f0dcae', '#8a4f37');
    // A basket of persimmons and a small pumpkin.
    r(148, 277, 27, 3, ED);
    block(148, 258, 25, 19, 'wood'); r(150, 256, 21, 4, 'woodLight'); for (let y = 262; y < 275; y += 4) line(149, y, 23, 'woodDark'); for (let x = 151; x < 172; x += 4) r(x, 262, 1, 14, 'woodLight');
    for (const [x, y] of [[151, 250], [158, 248], [165, 250], [155, 252], [162, 252]]) { r(x, y, 6, 6, 'edge'); r(x + 1, y + 1, 4, 4, '#e9853f'); r(x + 1, y + 1, 2, 1, '#f4b06a'); r(x + 2, y, 2, 1, 'greenDark'); }
    r(116, 292, 16, 2, ED); r(117, 281, 14, 11, 'edge'); r(118, 282, 12, 9, '#e08a3c'); r(121, 282, 1, 9, R2); r(126, 282, 1, 9, R2); r(119, 283, 2, 3, '#f0ac62'); r(123, 278, 2, 4, 'greenDark');
  }

  // 冬：傍晚的雪地，亮着灯的小木屋，落雪的松树，一枝红梅和一个小雪人。
  function paintWinter(ctx) {
    const {r, line, block, frame, sill, bowls, petBed, trunk} = kit(ctx);
    const S = '#eef2f0', SL = '#f8faf8', SD = '#d3dde0', SB = '#bccbd2', PINE = '#4f7366', PINE_L = '#6f9482', PINE_D = '#3b5a50';
    // 松树：以树干为中轴严格左右对称，一层一层向下变宽；每层的下沿是锯齿状的枝梢，
    // 上沿和左侧受光面压着雪，右侧是背光的暗部。
    function pine(cx, top, base, maxHalf, tiers) {
      const step = (base - top) / tiers;
      for (let i = tiers - 1; i >= 0; i--) {
        const y0 = Math.round(top + i * step), h = Math.round(step) + 5;
        const halfTop = Math.max(1, Math.round(maxHalf * (i / tiers) * 0.45)), halfBottom = Math.max(3, Math.round(maxHalf * (i + 1) / tiers));
        for (let j = 0; j < h; j++) {
          const half = Math.round(halfTop + (halfBottom - halfTop) * (j / (h - 1)));
          const x0 = Math.max(7, cx - half), x1 = Math.min(184, cx + half), y = y0 + j;
          r(x0, y, x1 - x0 + 1, 1, PINE_D);
          if (half > 1) r(Math.max(7, cx - half + 1), y, Math.min(184, cx + half - 1) - Math.max(7, cx - half + 1) + 1, 1, j > h - 3 ? PINE_D : PINE);
          if (half > 3 && j < h - 2) r(cx + Math.round(half * 0.35), y, Math.min(184, cx + half - 1) - (cx + Math.round(half * 0.35)) + 1, 1, PINE_D);
          if (half > 3 && j > 2 && j < h - 3) r(Math.max(7, cx - half + 2), y, Math.max(1, Math.round(half * 0.4)), 1, PINE_L);
        }
        // Jagged tips along the bottom edge of the tier.
        for (let x = cx - halfBottom; x <= cx + halfBottom; x += 4) if (x >= 7 && x + 1 <= 184) r(x, y0 + h, 2, 2, PINE_D);
      }
      // Snow goes on last so the tier above never hides it: a soft cap on each visible shoulder,
      // heavier on the lit left side, with a few clumps resting toward the right.
      for (let i = 0; i < tiers; i++) {
        const y0 = Math.round(top + i * step), h = Math.round(step) + 5;
        const halfTop = Math.max(1, Math.round(maxHalf * (i / tiers) * 0.45)), halfBottom = Math.max(3, Math.round(maxHalf * (i + 1) / tiers));
        const halfAt = j => Math.round(halfTop + (halfBottom - halfTop) * (j / (h - 1)));
        const start = i === 0 ? 0 : 6;
        for (let j = start; j < start + 3 && j < h - 2; j++) {
          const half = halfAt(j), from = Math.max(7, cx - half), to = Math.min(184, cx + Math.round(half * (j === start ? 0.55 : j === start + 1 ? 0.25 : -0.2)));
          if (to >= from) r(from, y0 + j, to - from + 1, 1, j === start + 2 ? S : SL);
        }
        const mid = halfAt(start + 1);
        if (mid > 5 && cx + mid - 3 <= 184) { r(cx + Math.round(mid * 0.55), y0 + start, 3, 1, SL); r(cx + Math.round(mid * 0.55) - 1, y0 + start + 1, 4, 1, S); }
        if (mid > 8) r(Math.max(7, cx - mid + 1), y0 + start + 3, Math.round(mid * 0.4), 1, SD);
      }
      r(cx - 1, top - 4, 2, 5, PINE_D); r(cx - 1, top - 4, 2, 2, SL);
    }
    frame();
    // Dusk sky with a pale moon and a few stars.
    r(7, 12, 178, 30, '#9fb3c9'); r(7, 42, 178, 26, '#b7c6d6'); r(7, 68, 178, 24, '#d3dbe2');
    r(140, 20, 12, 12, '#f6f1dc'); r(138, 22, 16, 8, '#f6f1dc'); r(142, 18, 8, 16, '#f6f1dc'); r(146, 22, 5, 5, '#e6e0c8');
    for (const [x, y] of [[20, 20], [44, 30], [70, 18], [96, 34], [118, 22], [170, 40], [30, 48], [84, 52], [176, 18], [58, 40]]) r(x, y, 1, 1, '#fbfbf3');
    // Snowy mountains, then a line of small pines.
    r(7, 78, 60, 20, '#c5d2dc'); r(18, 68, 38, 10, '#c5d2dc'); r(28, 60, 18, 8, '#c5d2dc'); r(30, 60, 14, 5, SL); r(22, 68, 12, 3, SL);
    r(70, 82, 70, 16, '#b5c5d1'); r(88, 72, 36, 10, '#b5c5d1'); r(98, 66, 16, 6, '#b5c5d1'); r(100, 66, 12, 4, SL); r(92, 72, 10, 3, SL);
    r(134, 84, 51, 14, '#c5d2dc'); r(150, 76, 30, 8, '#c5d2dc'); r(156, 76, 16, 3, SL);
    r(7, 96, 178, 58, '#cdd8de'); r(7, 96, 178, 4, '#dbe4e8'); r(96, 128, 89, 26, '#dfe7ea');
    for (const [cx, top, half, tiers] of [[108, 100, 8, 3], [124, 90, 10, 4], [142, 102, 8, 3]]) { r(cx - 1, 126, 3, 8, '#6b4f40'); pine(cx, top, 126, half, tiers); }
    // Log cabin with a snow-laden roof, a lit window, a wreath on the door and chimney smoke.
    r(12, 152, 86, 3, SD);
    r(72, 62, 10, 22, 'edge'); r(73, 63, 8, 21, '#a9735a'); line(73, 68, 8, 'edge'); line(73, 74, 8, 'edge'); r(70, 59, 14, 4, 'edge'); r(71, 60, 12, 2, SL);
    for (const [x, y, w] of [[76, 50, 6], [80, 42, 7], [76, 34, 8], [82, 26, 6]]) { r(x, y, w, 5, '#e6ebee'); r(x + 1, y + 1, w - 2, 2, SL); }
    r(8, 96, 94, 6, 'edge'); r(14, 90, 82, 6, 'edge'); r(22, 84, 66, 6, 'edge'); r(32, 78, 46, 6, 'edge'); r(44, 73, 22, 5, 'edge');
    r(9, 97, 92, 4, SL); r(15, 91, 80, 6, SL); r(23, 85, 64, 6, SL); r(33, 79, 44, 6, SL); r(45, 74, 20, 5, SL);
    r(9, 100, 92, 2, SD); for (let x = 12; x < 100; x += 11) r(x, 102, 4, 3 + (x % 3), SL);
    block(14, 102, 82, 50, '#b98a62'); for (let y = 108; y < 150; y += 7) { line(15, y, 80, '#8f6748'); line(15, y + 1, 80, '#cfa277'); }
    r(14, 102, 4, 50, 'edge'); r(15, 103, 2, 48, '#a57754'); r(92, 102, 4, 50, 'edge'); r(93, 103, 2, 48, '#a57754');
    block(24, 112, 24, 22, 'woodDark'); r(26, 114, 20, 18, '#f6dc9a'); r(27, 115, 18, 8, '#fdeeb8'); r(35, 114, 2, 18, 'woodDark'); r(26, 122, 20, 2, 'woodDark'); r(22, 134, 28, 3, 'edge'); r(23, 134, 26, 2, SL);
    block(60, 116, 22, 36, '#8f6748'); r(62, 118, 18, 32, '#a57754'); r(76, 134, 2, 3, '#f1c36d');
    r(66, 122, 10, 10, PINE_D); r(68, 124, 6, 6, '#a57754'); r(66, 122, 10, 2, PINE); r(69, 131, 4, 2, '#c9605a'); r(67, 125, 1, 1, '#c9605a'); r(74, 127, 1, 1, '#c9605a');
    // Snowfield with soft drifts, blue shadows and a trail of paw prints.
    r(8, 152, 176, 154, S);
    for (let row = 0, y = 152; y < 306; row++, y += 19) {
      if (row % 2 === 0) r(8, y, 176, Math.min(19, 306 - y), SL);
      for (let x = 14 + (row % 2 ? 26 : 0); x < 180; x += 52) if (y + 14 < 303) { line(x, y + 11, 14, SD); line(x + 3, y + 13, 8, SD); }
    }
    r(8, 152, 176, 3, SD); r(8, 152, 3, 154, '#dfe7e8'); r(181, 152, 3, 154, '#dfe7e8'); sill();
    r(20, 140, 34, 14, '#f7ebc4'); r(24, 154, 26, 6, '#f3eccf');
    for (const [x, y] of [[66, 160], [74, 166], [84, 170], [94, 176], [106, 174], [116, 168], [126, 172]]) { r(x, y, 3, 2, SB); r(x - 1, y - 2, 1, 1, SB); r(x + 1, y - 3, 1, 1, SB); r(x + 3, y - 2, 1, 1, SB); }

    // The tall pine on the right, and under it the pet bed.
    r(132, 198, 50, 16, SD); r(126, 202, 58, 8, SD);
    trunk(163, 96, 176, 6, 10, ['#6b4f40', '#876657', '#4f3a30']); r(155, 175, 17, 2, SL);
    pine(163, 24, 118, 24, 7);

    // Red tartan blanket.
    r(48, 192, 100, 81, SD);
    r(42, 184, 106, 77, '#8f3f3c'); r(47, 179, 96, 87, '#8f3f3c');
    r(45, 185, 100, 75, '#c9605a'); r(49, 182, 92, 81, '#c9605a');
    for (let y = 190; y < 258; y += 16) { r(45, y, 100, 6, '#a84a46'); line(45, y + 2, 100, '#f0d2c8'); line(45, y + 9, 100, '#3b5a50'); }
    for (let x = 56; x < 138; x += 16) { r(x, 182, 6, 81, '#a84a46'); r(x + 2, 182, 1, 81, '#f0d2c8'); r(x + 9, 182, 1, 81, '#3b5a50'); }
    r(45, 185, 4, 75, '#c9605a'); r(141, 185, 4, 75, '#c9605a');
    for (let x = 52; x < 139; x += 6) { r(x, 181, 2, 1, 'cream'); r(x, 264, 2, 1, 'cream'); }
    petBed(SD, '#f0d2c8', '#c9605a');

    // Snowman with a scarf and a tin-bucket hat, a plum branch in bloom, and a small sled.
    r(15, 200, 28, 3, SD);
    r(18, 184, 22, 16, 'edge'); r(19, 185, 20, 14, SL); r(21, 170, 16, 15, 'edge'); r(22, 171, 14, 13, SL); r(20, 196, 18, 2, SD);
    r(25, 175, 2, 2, 'edge'); r(31, 175, 2, 2, 'edge'); r(28, 178, 4, 2, '#e08a3c'); r(26, 181, 6, 1, 'edge'); r(20, 183, 18, 3, '#c9605a'); r(34, 186, 3, 7, '#c9605a'); r(28, 189, 2, 2, 'edge'); r(28, 194, 2, 2, 'edge');
    r(23, 162, 12, 9, 'edge'); r(24, 163, 10, 7, '#8fa3ad'); r(21, 170, 16, 2, 'edge'); r(26, 164, 2, 5, '#b5c5d1');
    r(40, 176, 6, 1, '#6b4f40'); r(44, 172, 1, 5, '#6b4f40'); r(14, 178, 7, 1, '#6b4f40'); r(14, 174, 1, 5, '#6b4f40');
    r(8, 212, 2, 40, '#5f463f'); r(10, 216, 12, 2, '#5f463f'); r(20, 210, 2, 8, '#5f463f'); r(10, 232, 16, 2, '#5f463f'); r(24, 226, 2, 8, '#5f463f'); r(10, 244, 10, 2, '#5f463f');
    for (const [x, y] of [[20, 207], [14, 213], [25, 223], [16, 229], [27, 233], [12, 241], [20, 241], [9, 209], [22, 218]]) { r(x, y, 3, 3, '#d9505a'); r(x + 1, y + 1, 1, 1, '#f6dc9a'); }
    r(26, 252, 20, 2, SD); r(28, 242, 16, 3, 'edge'); r(29, 243, 14, 1, '#c9605a'); r(29, 245, 2, 6, 'edge'); r(41, 245, 2, 6, 'edge'); r(26, 250, 20, 2, 'edge'); r(26, 248, 2, 3, 'edge');
    bowls('#f3e6d2', '#8f3f3c');
    // Stacked firewood with a lantern, and a mug of hot cocoa.
    r(146, 277, 30, 3, SD);
    for (const [x, y] of [[148, 268], [157, 268], [166, 268], [152, 260], [161, 260]]) { r(x, y, 9, 9, 'edge'); r(x + 1, y + 1, 7, 7, '#b98a62'); r(x + 3, y + 3, 3, 3, '#e2c193'); r(x + 4, y + 4, 1, 1, '#8f6748'); }
    r(148, 266, 27, 2, SL); r(152, 258, 18, 2, SL);
    r(156, 244, 8, 2, 'edge'); r(155, 246, 10, 12, 'edge'); r(156, 247, 8, 10, '#f6dc9a'); r(158, 249, 4, 6, '#fdeeb8'); r(159, 241, 2, 3, 'edge');
    r(118, 292, 14, 2, SD); block(119, 281, 10, 11, '#c9605a'); r(120, 282, 8, 2, '#6b4f40'); r(129, 284, 3, 5, 'edge'); r(129, 285, 2, 3, S); r(122, 274, 1, 5, SL); r(125, 272, 1, 6, SL); line(121, 286, 6, '#f0d2c8');
  }

  const SCENES = Object.freeze({home: paintRoom, outdoor: paintOutdoor, beach: paintBeach, market: paintMarket,
    spring: paintSpring, summer: paintSummer, autumn: paintAutumn, winter: paintWinter});
  // 场景里可以点的小物件：坐标与上面画它们的位置一致（192×320 的位图坐标）。
  // 排在前面的优先命中，所以小物件写在大物件前面。
  const PROPS = Object.freeze({
    home: Object.freeze([
      {id: 'lamp', x: 136, y: 70, w: 30, h: 28},
      {id: 'frame', x: 112, y: 31, w: 25, h: 24},
      {id: 'shelf', x: 146, y: 34, w: 32, h: 22},
      {id: 'window', x: 17, y: 29, w: 84, h: 73},
      {id: 'stool', x: 47, y: 140, w: 26, h: 26},
      {id: 'desk', x: 24, y: 103, w: 68, h: 41},
      {id: 'cabinet', x: 138, y: 98, w: 37, h: 54},
      {id: 'plant', x: 19, y: 152, w: 22, h: 48},
      {id: 'throw', x: 16, y: 210, w: 23, h: 16},
      {id: 'toycar', x: 22, y: 233, w: 19, h: 10},
      {id: 'basket', x: 147, y: 249, w: 27, h: 29},
      {id: 'books', x: 115, y: 283, w: 21, h: 8}
    ]),
    outdoor: Object.freeze([
      {id: 'sun', x: 18, y: 20, w: 20, h: 20},
      {id: 'cloud', x: 44, y: 28, w: 38, h: 12}, {id: 'cloud', x: 94, y: 50, w: 26, h: 12}, {id: 'cloud', x: 12, y: 60, w: 28, h: 12},
      {id: 'tree', x: 118, y: 28, w: 66, h: 68}, {id: 'tree', x: 154, y: 96, w: 18, h: 76},
      {id: 'pot', x: 78, y: 126, w: 17, h: 32},
      {id: 'bench', x: 16, y: 127, w: 60, h: 32},
      {id: 'gate', x: 62, y: 116, w: 22, h: 24},
      {id: 'garden', x: 7, y: 88, w: 178, h: 28},
      {id: 'fence', x: 7, y: 116, w: 178, h: 24},
      {id: 'flowerbed', x: 15, y: 172, w: 27, h: 28},
      {id: 'wateringcan', x: 18, y: 208, w: 25, h: 19},
      {id: 'toycar', x: 22, y: 236, w: 19, h: 10},
      {id: 'hamper', x: 147, y: 243, w: 27, h: 35},
      {id: 'thermos', x: 119, y: 271, w: 11, h: 21},
      {id: 'sky', x: 7, y: 12, w: 178, h: 76}
    ]),
    beach: Object.freeze([
      {id: 'sun', x: 18, y: 20, w: 20, h: 20},
      {id: 'sailboat', x: 50, y: 78, w: 16, h: 18}, {id: 'island', x: 96, y: 84, w: 34, h: 12},
      {id: 'palm', x: 116, y: 44, w: 68, h: 60}, {id: 'palm', x: 154, y: 96, w: 20, h: 82},
      {id: 'parasol', x: 14, y: 84, w: 64, h: 20}, {id: 'deckchair', x: 18, y: 124, w: 56, h: 36},
      {id: 'sea', x: 7, y: 96, w: 178, h: 54},
      {id: 'sandcastle', x: 15, y: 160, w: 28, h: 40}, {id: 'bucket', x: 18, y: 206, w: 24, h: 22},
      {id: 'beachball', x: 21, y: 231, w: 18, h: 16}, {id: 'cooler', x: 147, y: 251, w: 27, h: 27},
      {id: 'drink', x: 119, y: 271, w: 11, h: 21}, {id: 'sky', x: 7, y: 12, w: 178, h: 84}
    ]),
    market: Object.freeze([
      {id: 'fruitstall', x: 10, y: 84, w: 82, h: 68}, {id: 'flowerstall', x: 100, y: 84, w: 84, h: 68},
      {id: 'bunting', x: 7, y: 40, w: 178, h: 36}, {id: 'rooftops', x: 7, y: 12, w: 178, h: 72},
      {id: 'lamppost', x: 20, y: 152, w: 14, h: 50}, {id: 'barrel', x: 15, y: 190, w: 26, h: 40},
      {id: 'bread', x: 18, y: 232, w: 24, h: 20}, {id: 'shopbasket', x: 147, y: 245, w: 27, h: 33},
      {id: 'signboard', x: 114, y: 269, w: 18, h: 24}
    ]),
    spring: Object.freeze([
      {id: 'sun', x: 78, y: 16, w: 20, h: 18}, {id: 'bridge', x: 34, y: 100, w: 62, h: 32},
      {id: 'cherry', x: 108, y: 24, w: 76, h: 70}, {id: 'cherry', x: 150, y: 94, w: 20, h: 84},
      {id: 'cherry', x: 8, y: 32, w: 48, h: 50}, {id: 'cherry', x: 22, y: 82, w: 18, h: 58},
      {id: 'farblossom', x: 7, y: 78, w: 178, h: 22}, {id: 'river', x: 7, y: 100, w: 178, h: 34},
      {id: 'tulips', x: 15, y: 168, w: 28, h: 32}, {id: 'lunchbox', x: 18, y: 208, w: 22, h: 20},
      {id: 'pinwheel', x: 24, y: 232, w: 14, h: 20}, {id: 'dango', x: 147, y: 245, w: 27, h: 33},
      {id: 'teaflask', x: 119, y: 271, w: 11, h: 21}, {id: 'sky', x: 7, y: 12, w: 178, h: 66}
    ]),
    summer: Object.freeze([
      {id: 'sun', x: 12, y: 18, w: 18, h: 20}, {id: 'cloud', x: 50, y: 20, w: 50, h: 36},
      {id: 'willow', x: 104, y: 14, w: 82, h: 60}, {id: 'willow', x: 104, y: 74, w: 40, h: 60}, {id: 'willow', x: 146, y: 60, w: 20, h: 114},
      {id: 'lotuspot', x: 15, y: 160, w: 30, h: 42}, {id: 'rail', x: 7, y: 158, w: 178, h: 18},
      {id: 'reeds', x: 7, y: 78, w: 178, h: 20}, {id: 'pond', x: 7, y: 98, w: 178, h: 60},
      {id: 'watermelon', x: 18, y: 206, w: 24, h: 22}, {id: 'fan', x: 20, y: 230, w: 22, h: 20},
      {id: 'icetub', x: 147, y: 245, w: 27, h: 33}, {id: 'icedtea', x: 119, y: 271, w: 11, h: 21},
      {id: 'sky', x: 7, y: 12, w: 178, h: 66}
    ]),
    autumn: Object.freeze([
      {id: 'sun', x: 80, y: 16, w: 20, h: 20},
      {id: 'maple', x: 108, y: 24, w: 76, h: 70}, {id: 'maple', x: 150, y: 94, w: 20, h: 84},
      {id: 'ginkgo', x: 8, y: 30, w: 48, h: 50}, {id: 'ginkgo', x: 22, y: 80, w: 18, h: 60},
      {id: 'persimmons', x: 40, y: 96, w: 58, h: 14}, {id: 'forest', x: 7, y: 84, w: 178, h: 46},
      {id: 'stonelantern', x: 15, y: 152, w: 28, h: 48}, {id: 'leafpile', x: 18, y: 208, w: 28, h: 22},
      {id: 'acorns', x: 22, y: 236, w: 18, h: 10}, {id: 'persimmonbasket', x: 147, y: 245, w: 27, h: 33},
      {id: 'pumpkin', x: 115, y: 278, w: 18, h: 16}, {id: 'path', x: 7, y: 130, w: 178, h: 16},
      {id: 'sky', x: 7, y: 12, w: 178, h: 72}
    ]),
    winter: Object.freeze([
      {id: 'moon', x: 130, y: 16, w: 16, h: 20},
      {id: 'pine', x: 134, y: 20, w: 51, h: 110}, {id: 'pine', x: 150, y: 130, w: 12, h: 48},
      {id: 'smallpines', x: 96, y: 84, w: 40, h: 50},
      {id: 'chimney', x: 62, y: 24, w: 18, h: 60}, {id: 'cabinwindow', x: 20, y: 110, w: 24, h: 28},
      {id: 'cabindoor', x: 58, y: 116, w: 20, h: 36}, {id: 'cabin', x: 7, y: 72, w: 88, h: 82},
      {id: 'snowman', x: 8, y: 160, w: 30, h: 42}, {id: 'sled', x: 30, y: 240, w: 22, h: 14},
      {id: 'plum', x: 7, y: 204, w: 28, h: 48},
      {id: 'campinglantern', x: 145, y: 240, w: 14, h: 20}, {id: 'firewood', x: 139, y: 260, w: 30, h: 18},
      {id: 'cocoa', x: 117, y: 276, w: 16, h: 16}, {id: 'sky', x: 7, y: 12, w: 178, h: 60}
    ])
  });
  const GARDEN_SCENES = Object.freeze(['outdoor']);
  function propAt(scene, x, y) {
    const list = PROPS[scene] || (GARDEN_SCENES.includes(scene) ? PROPS.outdoor : PROPS.home);
    return list.find(item => x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h)?.id || '';
  }

  function createRenderer(canvas, {sprite}) {
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d', {alpha: false});
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    ctx.petSpriteLayer = sprite.createLayer(canvas);
    ctx.imageSmoothingEnabled = false;
    // Each scene is painted once into its own backdrop the first time it is shown.
    const backdrops = new Map();
    function backdropFor(scene) {
      const key = Object.prototype.hasOwnProperty.call(SCENES, scene) ? scene : 'home';
      if (!backdrops.has(key)) {
        const layer = canvas.ownerDocument.createElement('canvas');
        layer.width = WIDTH; layer.height = HEIGHT;
        const base = layer.getContext('2d', {alpha: false});
        base.imageSmoothingEnabled = false;
        SCENES[key](base);
        backdrops.set(key, layer);
      }
      return backdrops.get(key);
    }
    backdropFor('home');
    const idle = sprite.createIdle();
    function heart(x, y) {
      ctx.fillStyle = '#c0877e'; ctx.fillRect(x, y, 2, 2); ctx.fillRect(x + 3, y, 2, 2);
      ctx.fillRect(x, y + 2, 5, 1); ctx.fillRect(x + 1, y + 3, 3, 1); ctx.fillRect(x + 2, y + 4, 1, 1);
      ctx.fillStyle = '#efc7b3'; ctx.fillRect(x + 1, y + 1, 1, 1);
    }
    function draw(elapsed = 0, reducedMotion = false, view = {}) {
      const sceneName = Object.prototype.hasOwnProperty.call(SCENES, view.scene) ? view.scene : 'home';
      const outdoor = sceneName !== 'home';
      ctx.drawImage(backdropFor(sceneName), 0, 0);
      if(view.status!=='play'||view.noPet)paintToy(ctx,view.species);
      if (view.noPet) {ctx.petSpriteLayer?.hide();return {petBounds:null};}
      const status = view.status || 'idle', action = view.interaction;
      const pose = reducedMotion ? {rise: 0, blink: 0, closed: false, gesture: '', tail: 0} : idle.sample(elapsed, status);
      pose.mode = status;
      pose.petName = view.state?.petName || '小宠';
      const progress = reducedMotion ? 0.5 : (action?.progress || 0);
      let centerX = 96, feetY = 232;
      // Only two tiny window glints move; the rest of the room stays quiet.
      if (!reducedMotion && ['spring', 'autumn', 'winter'].includes(sceneName)) {
        // 春天飘花瓣、秋天落叶、冬天下雪：几粒缓慢下落的像素，位置由时间推算，不保存状态。
        const kind = sceneName === 'winter' ? {n: 14, color: '#ffffff', w: 1, h: 1, speed: 26} : sceneName === 'autumn'
          ? {n: 6, color: '#d98b4a', w: 2, h: 2, speed: 18} : {n: 7, color: '#f3cfcb', w: 2, h: 1, speed: 14};
        ctx.fillStyle = kind.color;
        for (let i = 0; i < kind.n; i++) {
          const fall = (elapsed / 1000 * kind.speed + i * 53) % 286;
          const x = 10 + (i * 37 + Math.round(Math.sin(elapsed / 900 + i) * 3)) % 172;
          ctx.fillRect(x, 14 + Math.round(fall), kind.w, kind.h);
        }
      }
      if (!reducedMotion && sceneName === 'summer') {
        // 荷塘水面上三道慢慢挪动的波光。
        const shift = Math.round(Math.sin(elapsed / 1800) * 4);
        ctx.fillStyle = '#dff1ec'; ctx.fillRect(22 + shift, 104, 12, 1); ctx.fillRect(84 - shift, 126, 14, 1); ctx.fillRect(52 + shift, 146, 10, 1);
      } else if (!reducedMotion && sceneName === 'beach') {
        // 海面上两道随时间挪动的波光。
        const shift = Math.round(Math.sin(elapsed / 1600) * 4);
        ctx.fillStyle = '#eaf5ee'; ctx.fillRect(40 + shift, 109, 14, 1); ctx.fillRect(118 - shift, 122, 18, 1); ctx.fillRect(64 - shift, 131, 10, 1);
      } else if (!reducedMotion && sceneName === 'market') {
        // 灯串轮流亮一下。
        const lit = Math.floor(elapsed / 700) % 13;
        const y = 66 + Math.round(Math.sin(lit / 12 * Math.PI) * 6);
        ctx.fillStyle = '#fffbe6'; ctx.fillRect(12 + lit * 14, y + 1, 3, 4);
      } else if (!reducedMotion && outdoor) {
        // Outdoors, one butterfly drifts over the lawn and a blossom catches the light.
        const t = elapsed / 1000, bx = Math.round(104 + Math.sin(t / 3.1) * 26), by = Math.round(160 + Math.sin(t / 1.7) * 7);
        const open = Math.floor(elapsed / 220) % 2 === 0;
        ctx.fillStyle = '#f3d9cd'; ctx.fillRect(bx - (open ? 2 : 1), by, open ? 2 : 1, 2); ctx.fillRect(bx + 1, by, open ? 2 : 1, 2);
        ctx.fillStyle = '#8e715b'; ctx.fillRect(bx, by, 1, 2);
        if (Math.sin(elapsed / 2400) > 0.5) { ctx.fillStyle = '#fbfaf0'; ctx.fillRect(153, 59, 1, 1); ctx.fillRect(27, 25, 1, 1); }
      }
      if (!outdoor && view.lampOn) {
        // 台灯点亮：灯罩变亮，周围墙面和柜顶落下一圈阶梯状的暖光。
        ctx.fillStyle = 'rgba(255,226,150,0.16)'; ctx.fillRect(122, 60, 58, 46);
        ctx.fillStyle = 'rgba(255,226,150,0.20)'; ctx.fillRect(128, 66, 46, 36);
        ctx.fillStyle = 'rgba(255,232,165,0.26)'; ctx.fillRect(134, 82, 34, 18);
        ctx.fillStyle = '#ffe9a8'; ctx.fillRect(142, 72, 18, 3); ctx.fillRect(140, 75, 22, 5); ctx.fillRect(138, 79, 26, 2);
        ctx.fillStyle = '#fff8d6'; ctx.fillRect(144, 74, 12, 5);
      }
      if (!outdoor && !reducedMotion) {
        const bright = Math.sin(elapsed / 2400) > 0.5;
        ctx.fillStyle = bright ? '#f6f0ce' : '#dce6ce';
        ctx.fillRect(72, 46, 1, 1); ctx.fillRect(45, 76, 1, 1);
      }
      if (status === 'sleeping') {
        ctx.fillStyle = 'rgba(113,85,94,0.09)'; ctx.fillRect(8, 14, 176, 292);
        centerX = 159; feetY = 202; pose.mode = 'sleeping'; pose.closed = true;
      } else if (status === 'pet') {
        pose.closed = true; pose.gesture = 'ear';
        pose.tail = reducedMotion ? 1 : [0, 1, 0, -1][Math.floor(progress * 8) % 4];
        centerX += reducedMotion ? 1 : Math.round(Math.sin(progress * Math.PI * 2) * 2);
      } else if (status === 'feed') {
        // A short walk to the food bowl, a quiet meal, then back to the rug.
        const distance = progress < 0.22 ? progress / 0.22 : progress > 0.78 ? (1 - progress) / 0.22 : 1;
        centerX = Math.round(96 - 54 * Math.max(0, distance));
        feetY = Math.round(232 + 44 * Math.max(0, distance));
        pose.mode = 'feed'; pose.closed = true;
        pose.nod = reducedMotion ? 1 : Math.round((Math.sin(progress * Math.PI * 12) + 1) * 1.5);
      } else if (status === 'play') {
        centerX += reducedMotion ? 0 : Math.round(Math.sin(progress * Math.PI * 4) * 10);
        feetY -= reducedMotion ? 2 : Math.round(Math.abs(Math.sin(progress * Math.PI * 4)) * 5);
        pose.gesture = 'tail'; pose.happy = true;
        pose.tail = reducedMotion ? 1 : [0, 1, 0, -1][Math.floor(progress * 10) % 4];
      } else if (status === 'hungry') {pose.look = -1; pose.earDown = 1; pose.gesture = '';}
      else if (status === 'sad') {pose.earDown = 2; pose.gesture = ''; pose.rise = 0;}
      else if (status === 'happy') {
        pose.happy = true;
        if (!reducedMotion && pose.gesture === 'tail' && pose.tail === -1) feetY -= 1;
      }
      pose.groundY = status === 'play' || status === 'happy' ? 232 : feetY;
      const petBounds = sprite.draw(ctx, centerX, feetY, pose);
      if (status === 'pet') {
        const drift = Math.round(progress * 6);
        heart(centerX - 15, feetY - 57 - drift); heart(centerX + 11, feetY - 65 - drift);
      } else if (status === 'feed' && progress > 0.2 && progress < 0.8) {
        ctx.fillStyle = '#b18a5e'; ctx.fillRect(centerX - 10, feetY - 6, 1, 1);
        ctx.fillRect(centerX - 4, feetY - 4, 1, 1); ctx.fillRect(30, 278, 2, 2);
        ctx.fillStyle = '#fff3d9'; ctx.fillRect(centerX - 2, feetY - 7, 1, 1);
      } else if (status === 'play') {
        // The floor toy is picked up for play, then returns to its original place.
        const toyX=reducedMotion?108:centerX+16;
        const hop=reducedMotion?0:Math.round(Math.abs(Math.cos(progress*Math.PI*4))*4);
        paintToy(ctx,view.species,toyX,220-hop);
      } else if (status === 'sleeping') {
        const rise = reducedMotion ? 0 : Math.floor((elapsed % 3000) / 1000);
        ctx.fillStyle = '#908495'; const x = 169, y = 167 - rise;
        ctx.fillRect(x, y, 5, 1); ctx.fillRect(x + 3, y + 1, 1, 1); ctx.fillRect(x + 2, y + 2, 1, 1);
        ctx.fillRect(x + 1, y + 3, 1, 1); ctx.fillRect(x, y + 4, 5, 1);
      }
      return {petBounds};
    }
    return Object.freeze({draw});
  }
  return Object.freeze({WIDTH, HEIGHT, TOYS, toyName, paintToy, SCENE_NAMES: Object.freeze(Object.keys(SCENES)), PROPS, propAt, createRenderer, paintScene(ctx, scene, species='dog') {(SCENES[scene] || paintRoom)(ctx);paintToy(ctx,species);}});
});
