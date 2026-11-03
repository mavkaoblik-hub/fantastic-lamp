/* Optional integration: startup and all network failures leave the game running. */
(async()=>{
 'use strict';
 const $=id=>document.getElementById(id),labels={storage_unavailable:'Немає доступу до сховища · гра працює офлайн',server_upgrade_required:'Потрібне оновлення сервера для автоматичного входу',invalid_code:'Код має починатися з cv1_ і містити 47 символів',nickname_taken:'Це ім’я вже зайнято. Оберіть інше або увійдіть за кодом',invalid_input:'Перевірте ім’я профілю (3–24 літери, цифри, пробіл, _ або -)',unconfigured:'Сервер не налаштовано · офлайн',disabled:'Синхронізацію вимкнено',waiting:'Очікування зв’язку',connecting:'З’єднання…',connected:'Профіль підключено',synced:'Зведення надіслано',offline:'Немає зв’язку · гра збережена локально',unauthorized:'Код не прийнято · увійдіть знову',rate_limited:'Ліміт сервера · повторимо пізніше',conflict:'Профіль змінився · повторимо пізніше'};
 let client;
 const showLogin=login=>{$('syncRegistration').hidden=login;$('syncLogin').hidden=!login};
 try{
  const r=await fetch('sync_config.json',{cache:'no-store'});if(!r.ok)throw Error();
  const config=await r.json();
  client=CaravanServerSync.create({url:config.endpoint,storage:localStorage,fetch:fetch.bind(globalThis),
   getResources:()=>globalThis.__CARAVAN_RESOURCE_SUMMARY(),onStatus:s=>{
    $('syncStatus').textContent=labels[s]||labels.offline;
    $('syncLinkStatus').textContent=labels[s]||labels.offline;
    if(s==='unauthorized')showLogin(true)
   }});
  $('syncConnect').disabled=!config.endpoint;$('syncRegister').disabled=!config.endpoint;
  const connect=async register=>{
   $('syncConnect').disabled=true;$('syncRegister').disabled=true;
   const code=await client.connect($('syncNickname').value.trim(),register?undefined:$('syncCode').value.trim());
   if(code){$('syncCode').value=code;$('syncContinue').hidden=false;showLogin(true);if(!register)$('syncAuth').close();void client.sync()}
   $('syncConnect').disabled=false;$('syncRegister').disabled=false;
  };
  $('syncConnect').onclick=()=>{if($('syncCode').value.trim())void connect(false)};
  $('syncRegister').onclick=()=>{try{client.enable();void client.sync()}catch{$('syncStatus').textContent=labels.storage_unavailable}};
  $('syncDisconnect').onclick=()=>{try{client.disconnect()}catch{} $('syncCode').value=''};
  setInterval(()=>{if(!document.hidden)void client.sync()},15000);
  window.addEventListener('online',()=>void client.sync());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void client.sync()});
  void client.sync();
 }catch{$('syncStatus').textContent=labels.unconfigured;$('syncLinkStatus').textContent=labels.unconfigured}
 $('syncOpen').onclick=()=>{$('syncAuth').showModal()};
 $('syncOffline').onclick=()=>{try{client?.disconnect()}catch{} $('syncAuth').close()};
 $('syncContinue').onclick=()=>{$('syncAuth').close()};
 $('syncReveal').onclick=()=>{$('syncCode').type=$('syncCode').type==='password'?'text':'password'};
 $('syncShowRegister').onclick=()=>showLogin(false);
 $('syncShowLogin').onclick=()=>showLogin(true);
})();
