(()=>{
  const subtitle=document.querySelector('[data-i18n="subtitle"]');
  if(!subtitle)return;
  const clean=()=>{
    const next=subtitle.textContent
      .replace(/\s*·\s*CMN\s*枢纽\s*/g,' · ')
      .replace(/\s*·\s*CMN\s*HUB\s*/gi,' · ')
      .replace(/\s*·\s*·\s*/g,' · ')
      .trim();
    if(next!==subtitle.textContent)subtitle.textContent=next;
  };
  clean();
  new MutationObserver(clean).observe(subtitle,{childList:true,characterData:true,subtree:true});
})();
