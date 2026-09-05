const question=document.getElementById('question');
const ask=document.getElementById('ask');
const mic=document.getElementById('mic');
const speechStatus=document.getElementById('speechStatus');
const conversation=document.getElementById('conversation');
const followComposer=document.getElementById('followComposer');
const followQuestion=document.getElementById('followQuestion');
const followAsk=document.getElementById('followAsk');
const followMic=document.getElementById('followMic');
const followSpeechStatus=document.getElementById('followSpeechStatus');

const history=[];

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function createTurn(userText){
  const el=document.createElement('article');
  el.className='turn';
  el.innerHTML=`
    <div class="questionCard">
      <div class="questionLabel">Kysymys</div>
      <div class="questionText">${escapeHtml(userText)}</div>
    </div>
    <div class="answerCard loading">
      <div class="answerLabel">Golf Rules AI</div>
      <div class="answerText">Haetaan sääntökohdat ja muodostetaan vastausta…</div>
      <div class="refs"></div>
    </div>`;
  conversation.appendChild(el);
  el.scrollIntoView({behavior:'smooth',block:'nearest'});
  return el;
}

async function sendQuestion(text){
  const clean=text.trim();
  if(!clean) return;

  const turn=createTurn(clean);
  const answerCard=turn.querySelector('.answerCard');
  const answerText=turn.querySelector('.answerText');
  const refs=turn.querySelector('.refs');

  ask.disabled=true;
  followAsk.disabled=true;

  try{
    const r=await fetch('/api/ask',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question:clean, history:history.slice(-6)})
    });

    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error || `API-virhe ${r.status}`);

    answerText.textContent=data.answer || 'Vastausta ei saatu.';
    refs.textContent=(data.rule_refs && data.rule_refs.length)
      ? 'Säännöt: ' + data.rule_refs.join(', ')
      : '';
    answerCard.classList.remove('loading');

    history.push({role:'user',content:clean});
    history.push({role:'assistant',content:data.answer || '',rule_refs:data.rule_refs || []});

    followComposer.classList.remove('hidden');
    // Composer stays directly after the newest Q/A pair. On submission,
    // the next question becomes a visible question card immediately above its answer.
    conversation.after(followComposer);
    followQuestion.value='';
    followQuestion.focus();
  }catch(err){
    answerCard.classList.remove('loading');
    answerText.textContent='Vastausta ei saatu: ' + err.message;
    answerText.classList.add('error');
    refs.textContent='';

    // Never strand the user after an API/parser error.
    // Keep the composer visible and prefill the failed question for an immediate retry/edit.
    followComposer.classList.remove('hidden');
    conversation.after(followComposer);
    followQuestion.value=clean;
    followQuestion.focus();
  }finally{
    ask.disabled=false;
    followAsk.disabled=false;
  }
}

ask.addEventListener('click',()=>sendQuestion(question.value));
question.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendQuestion(question.value);}
});

followAsk.addEventListener('click',()=>{
  const text=followQuestion.value.trim();
  if(!text){followQuestion.focus();return;}
  // Hide/move composer while the submitted follow-up becomes part of the transcript.
  followComposer.classList.add('hidden');
  sendQuestion(text);
});
followQuestion.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();
    const text=followQuestion.value.trim();
    if(text){followComposer.classList.add('hidden');sendQuestion(text);}
  }
});

function attachSpeech(button,target,status){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    button.disabled=true;
    status.textContent='Puheentunnistus ei ole tässä selaimessa käytettävissä. Kirjoittaminen toimii normaalisti.';
    return;
  }
  const rec=new SR();
  rec.lang='fi-FI';
  rec.interimResults=false;
  rec.maxAlternatives=1;
  button.addEventListener('click',()=>{
    status.textContent='Kuuntelen…';
    button.classList.add('listening');
    try{rec.start();}catch(e){}
  });
  rec.onresult=e=>{
    target.value=e.results[0][0].transcript;
    status.textContent='Puhe tunnistettu. Voit korjata tekstiä ennen lähettämistä.';
  };
  rec.onend=()=>button.classList.remove('listening');
  rec.onerror=()=>{
    status.textContent='Puheentunnistus ei onnistunut. Voit kirjoittaa kysymyksen.';
    button.classList.remove('listening');
  };
}
attachSpeech(mic,question,speechStatus);
attachSpeech(followMic,followQuestion,followSpeechStatus);

// v2.0 admin entry: intentionally unobtrusive. A long press opens maintenance.
const adminEntry=document.getElementById('adminEntry');
const adminPanel=document.getElementById('adminPanel');
const adminClose=document.getElementById('adminClose');
const checkClarifications=document.getElementById('checkClarifications');
const adminStatus=document.getElementById('adminStatus');
let adminTimer=null;
function beginAdminPress(){ adminTimer=setTimeout(()=>adminPanel.classList.remove('hidden'),900); }
function cancelAdminPress(){ if(adminTimer){clearTimeout(adminTimer);adminTimer=null;} }
if(adminEntry){
  adminEntry.addEventListener('pointerdown',beginAdminPress);
  adminEntry.addEventListener('pointerup',cancelAdminPress);
  adminEntry.addEventListener('pointerleave',cancelAdminPress);
  adminEntry.addEventListener('pointercancel',cancelAdminPress);
}
if(adminClose) adminClose.addEventListener('click',()=>adminPanel.classList.add('hidden'));
if(checkClarifications) checkClarifications.addEventListener('click',()=>{
  adminStatus.textContent='v2.0-pohja on valmis. Automaattinen R&A-tarkistus kytketään vasta sääntöaineiston käyttöönoton jälkeen; mitään dataa ei muutettu.';
});
