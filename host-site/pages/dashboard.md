---
title: Dashboard — Volt Hosting
description: Manage your sites.
format: html
---
<section><div class="wrap">
  <p class="eyebrow">Dashboard</p>
  <h1>Your sites</h1>
  <p id="acct" class="lead"></p>
  <div id="sites" class="grid c3" style="margin-top:1rem"></div>
  <form id="newf" style="margin-top:2rem;max-width:440px">
    <h3>New site</h3>
    <input id="name" required placeholder="My site"
      style="width:100%;padding:.75rem 1rem;border:1px solid #cbd5e1;border-radius:10px;box-sizing:border-box" />
    <button class="btn" type="submit" style="margin-top:.8rem">Create site</button>
  </form>
  <p id="msg" style="margin-top:1rem;min-height:1.3em"></p>
  <p style="margin-top:2.5rem">
    <a class="btn ghost" id="upgrade" href="#" style="display:none">Upgrade to Pro — $12/mo</a>
    &nbsp; <a href="#" id="out">Sign out</a>
  </p>
</div></section>
<script>
(function(){
  var $=function(id){return document.getElementById(id);};
  async function jget(u,o){ var r=await fetch(u,o); return r.json(); }
  async function load(){
    var me=await jget('/api/me');
    if(!me.ok){ location.href='/signup'; return; }
    $('acct').textContent=me.user.email+' · '+me.plan.name+' plan · '+me.sites+'/'+me.plan.sites+' sites';
    if(me.user.plan==='free') $('upgrade').style.display='';
    var d=await jget('/api/sites');
    var list=(d.sites||[]);
    $('sites').innerHTML = list.length
      ? list.map(function(s){ return '<div class="card"><h3>'+s.name+'</h3><p><a href="https://'+s.id+'.vsites.app" target="_blank" rel="noopener">'+s.id+'.vsites.app →</a></p></div>'; }).join('')
      : '<p>No sites yet — create your first one below.</p>';
  }
  $('newf').addEventListener('submit', async function(e){
    e.preventDefault(); $('msg').textContent='Creating…';
    var d=await jget('/api/sites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('name').value})});
    $('msg').textContent = d.ok ? ('✓ Created '+d.url) : (d.error||'Error creating site');
    if(d.ok){ $('name').value=''; load(); }
  });
  $('upgrade').addEventListener('click', async function(e){
    e.preventDefault(); $('msg').textContent='Opening checkout…';
    var d=await jget('/api/billing/upgrade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:'pro'})});
    if(d.checkoutUrl){ location.href=d.checkoutUrl; }
    else if(d.ok){ $('msg').textContent='✓ Upgraded to Pro.'; load(); }
    else { $('msg').textContent=d.error||'Upgrade failed'; }
  });
  $('out').addEventListener('click', async function(e){ e.preventDefault(); await fetch('/api/auth/logout',{method:'POST'}); location.href='/'; });
  load();
})();
</script>
