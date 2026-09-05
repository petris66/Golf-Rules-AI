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
  if(typeof response.output_text==='string' && response.output_text.trim()) return response.output_text.trim();
  const parts=[];
  for(const item of response.output || []){
    for(const c of item.content || []){
      if(c.type==='output_text' && c.text) parts.push(c.text);
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

  // Strong boosts for the two practical Rule 17.1d intents tested by players.
  const redPenalty=/punai/.test(q) && /estealue|esteal/.test(q);
  const asksDrop=/drop|vapaut|mista saan|mistä saan/.test(q);
  const unknownCrossing=/(en tieda|ei tiedeta|ei tiedä|tarkkaa.*ei|mista kohtaa|mistä kohtaa)/.test(q)
    && /(ylit|raja|ylitys)/.test(q);

  if(chunk.id==='17.1d-red' && redPenalty && asksDrop) score+=0.85;
  if(chunk.id==='17.1d-estimate' && unknownCrossing) score+=1.10;
  return score;
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

    // Context is used in retrieval so short follow-ups ("Entä jos...") retain meaning.
    const historyText=history.map(m=>`${m.role}: ${m.content}`).join('\n');
    const retrievalQuery=(historyText ? historyText+'\n' : '')+'user: '+question;

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

    const retrieved=ranked.slice(0,3);

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
4. Jos lähteet eivät aidosti riitä ratkaisemaan kysymystä, sano se lyhyesti ja kysy korkeintaan yksi täsmällinen jatkokysymys. Älä arvaa.
5. Kerro rangaistus selkeästi, jos lähde sen kertoo.
6. Käytä keskusteluhistoriaa vain kontekstin säilyttämiseen. Uusi kysymys ratkaisee, mikä tieto on nyt olennaista.
7. Älä käytä Markdown-merkintöjä kuten ** tai #. Kirjoita selkeää tavallista tekstiä.
8. Älä lainaa lähteitä pitkästi; selitä omin sanoin.

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
    if(!raw) throw new Error('OpenAI ei palauttanut tekstivastausta.');

    let parsed;
    try{
      const cleaned=raw.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
      parsed=JSON.parse(cleaned);
    }catch(e){
      parsed={answer:raw.replace(/\*\*/g,''),rule_refs:[]};
    }

    const answer=String(parsed.answer || '').replace(/\*\*/g,'').trim();
    const allowed=new Set(retrieved.map(x=>x.rule_ref));
    const ruleRefs=unique((Array.isArray(parsed.rule_refs)?parsed.rule_refs:[])
      .map(String).filter(ref=>allowed.has(ref)));

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
