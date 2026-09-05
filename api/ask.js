const fs = require('fs');
const path = require('path');

const OPENAI_URL='https://api.openai.com/v1';

function cosine(a,b){
  let dot=0, aa=0, bb=0;
  const n=Math.min(a.length,b.length);
  for(let i=0;i<n;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return dot/(Math.sqrt(aa)*Math.sqrt(bb) || 1);
}

async function openai(endpoint, body){
  const key=process.env.OPENAI_API_KEY;
  if(!key) throw new Error('OPENAI_API_KEY puuttuu Vercelin Environment Variables -asetuksista.');

  const r=await fetch(OPENAI_URL+endpoint,{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${key}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify(body)
  });
  const data=await r.json();
  if(!r.ok){
    const msg=data?.error?.message || `OpenAI API error ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

function outputText(response){
  if(!response) return '';
  if(typeof response.output_text==='string' && response.output_text.trim()){
    return response.output_text.trim();
  }
  const parts=[];
  for(const item of (Array.isArray(response.output) ? response.output : [])){
    if(typeof item?.text==='string' && item.text.trim()) parts.push(item.text);
    for(const c of (Array.isArray(item?.content) ? item.content : [])){
      if(typeof c?.text==='string' && c.text.trim()) parts.push(c.text);
      else if(typeof c?.text?.value==='string' && c.text.value.trim()) parts.push(c.text.value);
      else if(typeof c?.output_text==='string' && c.output_text.trim()) parts.push(c.output_text);
    }
  }
  return parts.join('\n').trim();
}

function unique(arr){return [...new Set(arr)];}


function normalizeFi(text){
  return String(text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9åäö\s-]/gi,' ').replace(/\s+/g,' ').trim();
}
function lexicalScore(query, chunk){
  const q=normalizeFi(query);
  let score=0;
  for(const kw of (chunk.keywords||[])){
    const k=normalizeFi(kw);
    if(k && q.includes(k)) score+=0.18;
  }
  const embedded=/putoamisj|alastuloj|maahan pain|uponn|pallon jalj/.test(q);
  const freeRelief=/ilman rangaist|ilmain|nostaa|vapaut/.test(q);
  if(chunk.rule_ref==='17.3' && embedded) score+=0.60;
  if(chunk.rule_ref==='17.3' && embedded && freeRelief) score+=0.30;

  const temporaryWater=/tilapainen vesi|tilapäinen vesi|epanormaali kenttaolosuhde|epänormaali kenttäolosuhde/.test(q);
  if(chunk.rule_ref==='17.3' && temporaryWater) score+=1.45;

  const boundaryCase=/(rajalla|rajan|merkkien valissa|merkkien välissä|osa pallosta|osittain)/.test(q)
    && /(estealue|esteal)/.test(q);
  if(chunk.rule_ref==='17.1a' && boundaryCase) score+=1.55;

  const knownPenaltyLost=/(en loyta|en löydä|kadonn|ei loydy|ei löydy)/.test(q)
    && /(varmasti|kaytannossa varma|käytännössä varma|tiedan|tiedän|nain sen|näin sen)/.test(q)
    && /(estealue|vesieste)/.test(q);
  if(chunk.id==='17.1c' && knownPenaltyLost) score+=1.75;

  // Strong boosts for the two practical Rule 17.1d intents tested by players.
  const redPenalty=/punai/.test(q) && /estealue|esteal/.test(q);
  const asksDrop=/drop|vapaut|mista saan|mistä saan/.test(q);
  const unknownCrossing=/(en tieda|ei tiedeta|ei tiedä|tarkkaa.*ei|mista kohtaa|mistä kohtaa)/.test(q)
    && /(ylit|raja|ylitys)/.test(q);

  if(chunk.id==='17.1d-red' && redPenalty && asksDrop) score+=0.85;
  if(chunk.id==='17.1d-estimate' && unknownCrossing) score+=1.10;

  const lostUncertain=/(en loyda|en löydä|kadonn|ei loydy|ei löydy)/.test(q)
    && /(en ole varma|ei ole varma|ylittiko|ylittikö|takaraja|mets|estealue|vesieste)/.test(q);

  if(chunk.id==='17.1c' && lostUncertain) score+=2.00;
  if(chunk.id==='18.2-crossref' && lostUncertain) score+=1.80;
  if(chunk.id==='17.1d-red' && lostUncertain) score-=0.55;
  if(chunk.id==='17.1d-estimate' && lostUncertain) score-=0.45;

  return score;
}


function parseAnswerPayload(raw){
  const text=String(raw || '').trim();
  if(!text) return null;
  const candidates=[text];
  const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fenced) candidates.push(fenced[1].trim());
  const first=text.indexOf('{'), last=text.lastIndexOf('}');
  if(first>=0 && last>first) candidates.push(text.slice(first,last+1));
  for(const candidate of candidates){
    try{
      const obj=JSON.parse(candidate);
      if(obj && typeof obj.answer==='string'){
        return {
          answer:obj.answer.trim(),
          rule_refs:Array.isArray(obj.rule_refs) ? obj.rule_refs.map(String) : []
        };
      }
    }catch(_){}
  }
  // If JSON parsing failed, do not expose JSON syntax to the player.
  if(/^\s*\{/.test(text) || /"answer"\s*:/.test(text)){
    const m=text.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/s);
    if(m){
      try{return {answer:JSON.parse('"'+m[1]+'"'),rule_refs:[]};}catch(_){}
    }
    return null;
  }
  return {answer:text,rule_refs:[]};
}

module.exports = async (req,res)=>{
  if(req.method!=='POST'){
    res.status(405).json({error:'Use POST'});
    return;
  }

  try{
    const question=String(req.body?.question || '').trim();
    const history=Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
    if(!question){
      res.status(400).json({error:'Kysymys puuttuu.'});
      return;
    }

    const file=path.join(process.cwd(),'data','rule17.json');
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    const chunks=data.chunks || [];

    // Use history only when the new turn is genuinely follow-up-like.
    // A complete new question must not inherit facts (for example penalty-area colour)
    // merely because they appeared earlier in the conversation.
    const historyText=history.map(m=>`${m.role}: ${m.content}`).join('\n');
    const qNorm=normalizeFi(question);
    const followUpLike=/^(enta|entä|jos taas|mites|miten sitten|entäs|entäs jos)\b/.test(qNorm)
      || question.trim().length < 38;
    const retrievalQuery=(followUpLike && historyText ? historyText+'\n' : '')+'user: '+question;

    // Real embedding-based RAG. For this tiny Rule 17 test we embed the query
    // and all chunks in one request. Later the chunk embeddings can be precomputed.
    const inputs=[
      retrievalQuery,
      ...chunks.map(c=>`${c.rule_ref} ${c.title}\n${c.content}\nHakusanat: ${(c.keywords||[]).join(', ')}`)
    ];

    const emb=await openai('/embeddings',{
      model:'text-embedding-3-small',
      input:inputs
    });

    const vectors=emb.data.map(x=>x.embedding);
    const qv=vectors[0];
    const ranked=chunks.map((c,i)=>{
      const semantic=cosine(qv,vectors[i+1]);
      const lexical=lexicalScore(retrievalQuery,c);
      return {...c, semantic, lexical, score:semantic+lexical};
    }).sort((a,b)=>b.score-a.score);

    const retrieved=ranked.slice(0,4);

    const context=retrieved.map((c,i)=>
      `[Lähde ${i+1}] Sääntö ${c.rule_ref} – ${c.title}\n${c.content}`
    ).join('\n\n');

    const compactHistory=history.map(m=>
      `${m.role==='user'?'Pelaaja':'Avustaja'}: ${m.content}`
    ).join('\n');

    const instructions=`Olet Golf Rules AI. Vastaa suomeksi vain annettujen RAG-lähdepalojen perusteella.

Tärkeimmät toimintaperiaatteet:
1. Vastaa ensin käyttäjän kysymykseen suoraan. Jos vastaus on kyllä/ei, aloita kyllä/ei-vastauksella. Jos kysytään mistä saa dropata tai vapautua, kerro konkreettiset vapautumisvaihtoehdot ja vapautumisalue.
2. Käytä kaikki kysymyksen kannalta olennainen tieto lähdepaloista. Älä sano "lähdeaineisto ei kerro", "lähteistä ei selviä" tai pyydä turhaa tarkennusta, jos jokin annetuista lähdepaloista sisältää vastauksen.
3. Jos lähdepala sanoo, että jokin piste arvioidaan kun sitä ei tiedetä, kerro tämä käyttäjälle suoraan.
4. Jos käyttäjä kertoo, ettei palloa löydy eikä hän ole varma jäikö pallo estealueelle tai ylittikö se estealueen takarajan, ratkaise ensin säännön 17.1c kynnys. Estealueen vapautumista saa käyttää vain, jos tiedetään tai on käytännössä varmaa, että pallo päätyi estealueelle. Jos tätä varmuutta ei ole, kerro kadonneen pallon menettely säännön 18.2 mukaan. Älä kysy lisäkysymystä, jos käyttäjä on jo kertonut epävarmuudesta ja siitä, ettei palloa löydy.
5. Jos lähteet eivät aidosti riitä ratkaisemaan kysymystä, sano se lyhyesti ja kysy korkeintaan yksi täsmällinen jatkokysymys. Älä arvaa.
6. Kerro rangaistus selkeästi, jos lähde sen kertoo.
7. Käytä keskusteluhistoriaa vain kontekstin säilyttämiseen. Uusi kysymys ratkaisee, mikä tieto on nyt olennaista.
8. Älä käytä Markdown-merkintöjä kuten ** tai #. Kirjoita selkeää tavallista tekstiä.
9. Älä lainaa lähteitä pitkästi; selitä omin sanoin.

Palauta AINOASTAAN kelvollinen JSON-objekti muodossa:
{"answer":"vastausteksti","rule_refs":["17.1d"]}

rule_refs-taulukkoon saa lisätä vain ne sääntökohdat, joita answer todella käyttää perustelunaan.
Älä listaa kaikkia RAG-haun lähteitä. Käytä vain RAG-lähteissä näkyviä sääntöviitteitä.`;

    const input=`KESKUSTELUHISTORIA:
${compactHistory || '(ei aiempaa keskustelua)'}

UUSI KYSYMYS:
${question}

RAG-HAUN LÄHTEET:
${context}

Muodosta vastaus juuri uuteen kysymykseen ottaen aiempi keskustelu huomioon.`;

    const response=await openai('/responses',{
      model:'gpt-5.6-luna',
      instructions,
      input,
      max_output_tokens:500
    });

    const raw=outputText(response);
    if(!raw){
      const types=(Array.isArray(response?.output)?response.output:[])
        .map(x=>x?.type || 'unknown').join(', ');
      throw new Error(`OpenAI-vastaus saatiin, mutta tekstisisältöä ei löytynyt${types ? ` (output: ${types})` : ''}.`);
    }

    const parsed=parseAnswerPayload(raw);
    if(!parsed || !parsed.answer){
      throw new Error('Vastausta ei voitu jäsentää turvallisesti. Kysy sama kysymys uudelleen.');
    }

    const answer=String(parsed.answer || '').replace(/\*\*/g,'').trim();
    const allowed=new Set(retrieved.map(x=>x.rule_ref));
    let ruleRefs=unique((Array.isArray(parsed.rule_refs)?parsed.rule_refs:[])
      .map(String).filter(ref=>allowed.has(ref)));
    if(ruleRefs.some(ref=>/^17\./.test(ref))){
      ruleRefs=ruleRefs.filter(ref=>ref!=='17');
    }

    res.status(200).json({
      answer,
      rule_refs:ruleRefs,
      retrieved:retrieved.map(x=>({rule_ref:x.rule_ref,title:x.title,score:Number(x.score.toFixed(4))}))
    });
  }catch(err){
    console.error(err);
    res.status(500).json({error:err.message || 'Tuntematon palvelinvirhe.'});
  }
};
