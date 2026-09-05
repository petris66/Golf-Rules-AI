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

  const replayedFromPenalty=/(pelasin|pelattu|lyoin|lyöin|lyonti|lyönti)/.test(q)
    && /(estealueelta|estealueelta)/.test(q)
    && /(takaisin|samalle|toiselle)/.test(q)
    && /(estealue|esteal)/.test(q);
  if(chunk.rule_ref==='17.2a' && replayedFromPenalty) score+=1.65;

  const noPlayZone=/(kielletty pelialue|no play zone|kielletyksi pelialueeksi)/.test(q)
    && /(estealue|esteal)/.test(q);
  if(chunk.rule_ref==='17.1e' && noPlayZone) score+=2.00;

  const lostUncertain=/(en loyda|en löydä|kadonn|ei loydy|ei löydy)/.test(q)
    && /(en ole varma|ei ole varma|ylittiko|ylittikö|takaraja|mets|estealue|vesieste)/.test(q);

  if(chunk.id==='17.1c' && lostUncertain) score+=2.00;
  if(chunk.id==='18.2-crossref' && lostUncertain) score+=1.80;
  if(chunk.id==='17.1d-red' && lostUncertain) score-=0.55;
  if(chunk.id==='17.1d-estimate' && lostUncertain) score-=0.45;

  return score;
}


function parseAnswerPayload(raw){
  let text=String(raw || '').trim();
  if(!text) return null;

  // Strip common Markdown fences, including ```json ... ```.
  text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();

  const candidates=[text];
  const first=text.indexOf('{');
  const last=text.lastIndexOf('}');
  if(first>=0 && last>first) candidates.push(text.slice(first,last+1));

  // First try normal JSON. Also tolerate a JSON string containing the object.
  for(const candidate of candidates){
    try{
      let obj=JSON.parse(candidate);
      if(typeof obj==='string'){
        try{ obj=JSON.parse(obj); }catch(_){}
      }
      if(obj && typeof obj.answer==='string'){
        return {
          answer:obj.answer.trim(),
          rule_refs:Array.isArray(obj.rule_refs) ? obj.rule_refs.map(String) : []
        };
      }
    }catch(_){}
  }

  // Recover the answer field from slightly malformed JSON instead of exposing
  // the raw object to the player. rule_refs are recovered separately when possible.
  const answerMatch=text.match(/["']answer["']\s*:\s*["']([\s\S]*?)["']\s*(?:,\s*["']rule_refs["']\s*:|}\s*$)/i);
  if(answerMatch){
    let answer=answerMatch[1]
      .replace(/\\n/g,'\n')
      .replace(/\\"/g,'"')
      .replace(/\\'/g,"'")
      .replace(/\\\\/g,'\\')
      .trim();

    let refs=[];
    const refsMatch=text.match(/["']rule_refs["']\s*:\s*\[([\s\S]*?)\]/i);
    if(refsMatch){
      refs=refsMatch[1].split(',')
        .map(x=>x.trim().replace(/^["']|["']$/g,''))
        .filter(Boolean);
    }
    if(answer) return {answer,rule_refs:refs};
  }

  // A normal prose response is safe to display. Only JSON-looking content is blocked.
  if(!/^\s*[\{\[]/.test(text) && !/["']answer["']\s*:/.test(text)){
    return {answer:text,rule_refs:[]};
  }
  return null;
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

    const vectorStoreId=String(process.env.OPENAI_VECTOR_STORE_ID || '').trim();
    if(!vectorStoreId){
      res.status(503).json({
        error:'Koko sääntökirjan haku ei ole vielä kytketty. OPENAI_VECTOR_STORE_ID puuttuu Vercelin Environment Variables -asetuksista.'
      });
      return;
    }

    const compactHistory=history.map(m=>
      `${m.role==='user'?'Pelaaja':'Avustaja'}: ${m.content}`
    ).join('\n');

    const instructions=`Olet Golf Rules AI. Vastaa suomeksi käyttäjän golf-sääntökysymykseen käyttäen ensisijaisena tietolähteenä file_search-työkalulla haettavaa virallista sääntöaineistoa.

Toimintaperiaatteet:
1. Käytä file_search-hakua ennen sääntöratkaisua. Hae kaikki kysymyksen ratkaisemiseen tarvittavat sääntökohdat, myös eri sääntöjen väliset ristiviittaukset.
2. Vastaa ensin käyttäjän kysymykseen suoraan ja selitä sitten lyhyesti, miten sääntöratkaisu muodostuu.
3. Älä keksi puuttuvia tosiseikkoja. Jos ratkaisu aidosti riippuu yhdestä puuttuvasta tiedosta, kysy korkeintaan yksi täsmällinen jatkokysymys.
4. Kerro rangaistus ja oikea toimintatapa selkeästi, kun aineisto ne kertoo.
5. Käytä keskusteluhistoriaa vain aidon jatkokysymyksen kontekstina. Täydellinen uusi kysymys ratkaistaan omien tosiseikkojensa perusteella.
6. Älä käytä Markdown-merkintöjä kuten ** tai #. Kirjoita selkeää tavallista tekstiä.
7. Älä lainaa sääntöaineistoa pitkästi; selitä omin sanoin.
8. Lisää vastauksen loppuun omalle riville muodossa "Säännöt: 14.3, 14.5, 17.1d" vain ne sääntöviitteet, joita ratkaisu todella käyttää. Älä keksi sääntönumeroita.`;

    const input=`KESKUSTELUHISTORIA:\n${compactHistory || '(ei aiempaa keskustelua)'}\n\nUUSI KYSYMYS:\n${question}`;

    async function createResponse(maxOutputTokens){
      return openai('/responses',{
        model:'gpt-5.6-luna',
        instructions,
        input,
        tools:[{
          type:'file_search',
          vector_store_ids:[vectorStoreId],
          max_num_results:8
        }],
        include:['file_search_call.results'],
        reasoning:{effort:'low'},
        max_output_tokens:maxOutputTokens
      });
    }

    let finalResponse=await createResponse(1600);
    let raw=outputText(finalResponse);
    if(!raw){
      const types=(Array.isArray(finalResponse?.output)?finalResponse.output:[])
        .map(x=>x?.type || 'unknown').join(', ');
      const onlyReasoning=types && types.split(',').map(x=>x.trim()).filter(Boolean)
        .every(x=>x==='reasoning');
      if(onlyReasoning || finalResponse?.status==='incomplete'){
        finalResponse=await createResponse(3000);
        raw=outputText(finalResponse);
      }
    }
    if(!raw){
      const types=(Array.isArray(finalResponse?.output)?finalResponse.output:[])
        .map(x=>x?.type || 'unknown').join(', ');
      throw new Error(`OpenAI-vastaus saatiin, mutta lopullista tekstivastausta ei löytynyt${types ? ` (output: ${types})` : ''}.`);
    }

    let answer=String(raw).replace(/\*\*/g,'').trim();
    let ruleRefs=[];
    const rulesLine=answer.match(/(?:^|\n)Säännöt:\s*([^\n]+)\s*$/i);
    if(rulesLine){
      ruleRefs=unique(rulesLine[1].split(',').map(x=>x.trim()).filter(Boolean));
      answer=answer.replace(/(?:^|\n)Säännöt:\s*[^\n]+\s*$/i,'').trim();
    }

    const searchResults=[];
    for(const item of (Array.isArray(finalResponse?.output)?finalResponse.output:[])){
      if(item?.type==='file_search_call' && Array.isArray(item?.results)){
        for(const r of item.results){
          searchResults.push({filename:r?.filename || '', score:typeof r?.score==='number'?r.score:null});
        }
      }
    }

    res.status(200).json({
      answer,
      rule_refs:ruleRefs,
      rag_mode:'vector_store',
      sources:searchResults.slice(0,8)
    });
  }catch(err){
    console.error(err);
    res.status(500).json({error:err.message || 'Tuntematon palvelinvirhe.'});
  }
};
