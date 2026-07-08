---
title: Start free — Volt Hosting
description: Create your Volt Hosting account. No password, no card — just a magic link.
format: html
---
<section><div class="wrap" style="max-width:540px">
  <p class="eyebrow">Get started</p>
  <h1>Create your account</h1>
  <p class="lead">Enter your email and we'll send a magic link to sign in. No password, no card.</p>
  <form id="su" style="margin-top:1.5rem">
    <input id="email" type="email" required autocomplete="email" placeholder="you@example.com"
      style="width:100%;padding:.85rem 1rem;font-size:1rem;border:1px solid #cbd5e1;border-radius:10px;box-sizing:border-box" />
    <button class="btn" type="submit" style="margin-top:1rem;width:100%">Send my sign-in link</button>
  </form>
  <p id="msg" style="margin-top:1.1rem;min-height:1.4em"></p>
  <p class="lead" style="margin-top:1.5rem">Already have an account? The same link signs you in — just enter your email above.</p>
</div></section>
<script>
(function(){
  var f=document.getElementById('su'), m=document.getElementById('msg'), e=document.getElementById('email');
  f.addEventListener('submit', async function(ev){
    ev.preventDefault(); m.style.color=''; m.textContent='Sending…';
    try{
      var r=await fetch('/api/auth/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.value})});
      var d=await r.json();
      if(d.ok){ m.style.color='#15803d'; m.textContent='✓ Check your email for your sign-in link (it expires in 15 minutes).'; f.reset(); }
      else { m.style.color='#b91c1c'; m.textContent=d.error||'Something went wrong — please try again.'; }
    }catch(err){ m.style.color='#b91c1c'; m.textContent='Network error — please try again.'; }
  });
})();
</script>
