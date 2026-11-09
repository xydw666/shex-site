(function(root){
  'use strict';
  const safe = (value, local=false) => {
    const text=String(value || '').trim();
    return /^(?:cloud:\/\/|https?:\/\/|\.?\.?\/)/i.test(text) || local && /^(?:blob:|data:image\/(?:png|jpe?g|gif|webp);)/i.test(text) ? text : '';
  };
  function snapshot(message={},kind='text',text='') {
    const quote={id:message.id,kind,role:message.role||'notice',text:String(text).slice(0,60)};
    if(kind==='image'||kind==='sticker') {
      const image=safe(message.image || message.media || message.sticker);
      if(image)quote.image=image;
      if(message.stickerId)quote.stickerId=String(message.stickerId);
      if(message.imageView && typeof message.imageView==='object')quote.imageView={...message.imageView};
    }
    return quote;
  }
  function media(quote={},source,resolveSticker=()=>'',resolveTransient=()=> '') {
    if(source?.revoked || source?.deletedAt || source?.noticeKind==='revoked')return '';
    if(!['image','sticker'].includes(quote.kind))return '';
    return safe(source?.image || source?.media || source?.sticker ||
      resolveTransient(source?.imageRef) || resolveSticker(source?.stickerId || quote.stickerId) || quote.image,Boolean(source));
  }
  function render(node,quote,options={}) {
    const doc=node?.ownerDocument;if(!doc || !quote)return;
    node.textContent='';
    const source=options.source;
    const removed=options.deleted===true || source?.revoked || source?.deletedAt || source?.noticeKind==='revoked';
    const url=removed?'':media(quote,source,options.resolveSticker,options.resolveTransient);
    if(url){
      const img=doc.createElement('img');img.className='x-quote-thumbnail';img.alt=quote.kind==='sticker'?'引用的表情包':'引用的图片';
      img.loading='lazy';img.decoding='async';
      if(/^cloud:\/\//i.test(url))Promise.resolve(options.loadCloud?.(img,url)).catch(()=>img.remove());else img.src=url;
      img.addEventListener('error',()=>img.remove(),{once:true});
      options.applyView?.(img,source?.imageView || quote.imageView);node.appendChild(img);
    }
    const label=doc.createElement('span');label.className='x-quote-label';
    label.textContent=removed?'原消息已撤回或删除':quote.text || (quote.kind==='sticker'?'引用了一个表情包':quote.kind==='image'?'引用了一张图片':'引用了一条消息');
    node.appendChild(label);
  }
  function affectedIds(ids,messages) {
    const changed=new Set((ids || []).map(String)),result=new Set(changed);
    for(const message of messages || [])if(message.quote && changed.has(String(message.quote.id)))result.add(String(message.id));
    return Array.from(result);
  }
  const api=Object.freeze({snapshot,media,render,affectedIds});root.SHEXMessageQuotes=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
