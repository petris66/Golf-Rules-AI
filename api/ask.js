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
    const ranked=chunks.map((c,i)=>({
      ...c,
      score:cosine(qv,vectors[i+1])
    })).sort((a,b)=>b.score-a.score);

    const retrieved=ranked.slice(0,4);

    const context=retrieved.map((c,i)=>
      `[Lähde ${i+1}] Sääntö ${c.rule_ref} – ${c.title}\n${c.content}`
    ).join('\n\n');

    const compactHistory=history.map(m=>
      `${m.role==='user'?'Pelaaja':'Avustaja'}: ${m.content}`
    ).join('\n');

    const instructions=`Olet Golf Rules AI, golfin sääntöavustaja.
Vastaa suomeksi ja käytä vain annettua RAG-lähdeaineistoa.
Älä keksi sääntöä tai yksityiskohtaa, jota lähteissä ei ole.
Vastaa ensin suoraan käyttäjän tilanteeseen selkokielellä.
Kerro rangaistus, jos se käy lähteestä ilmi.
Jos ratkaisu riippuu puuttuvasta olennaisesta tiedosta, kysy yksi täsmällinen lisäkysymys.
Jos lähdeaineisto ei riitä varmaan vastaukseen, sano se selvästi.
Älä lainaa lähdettä pitkästi; selitä omin sanoin.
Älä lisää sääntönumeroita vastauksen loppuun, koska käyttöliittymä näyttää lähdeviitteet erikseen.`;

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

    const answer=outputText(response);
    if(!answer) throw new Error('OpenAI ei palauttanut tekstivastausta.');

    // Expose refs from the retrieved evidence actually supplied to the answer model.
    const ruleRefs=unique(retrieved.map(x=>x.rule_ref));

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
