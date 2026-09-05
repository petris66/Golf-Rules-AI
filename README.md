# Golf Rules AI – RAG test v1.0

Ensimmäinen oikea embedding-pohjainen RAG-testiversio säännöllä 17.

## Mitä tämä tekee

- kysymys kirjoittamalla tai selaimen puheentunnistuksella
- embedding-haku Rule 17 -testiaineistosta (`text-embedding-3-small`)
- parhaat sääntökohdat annetaan vastausmallille
- vastaus muodostetaan OpenAI Responses API:lla
- jatkokysymykset käyttävät keskusteluhistoriaa
- käyttöliittymä näyttää jokaisen kysymyksen heti oman vastauksensa yläpuolella
- API-avain pysyy Vercelissä eikä GitHubissa

## Tiedostot

- `index.html`
- `style.css`
- `app.js`
- `api/ask.js`
- `data/rule17.json`
- `vercel.json`

## Vercel-asetus

Lisää Vercelin projektin Environment Variables -kohtaan:

`OPENAI_API_KEY` = oma OpenAI API -avaimesi

Älä koskaan lisää API-avainta GitHubiin tai selaimen `app.js`-tiedostoon.

Environment Variablen lisäämisen jälkeen tee uusi deployment.

## Testikysymykset

1. `Palloni meni punaiseen estealueeseen. Mistä saan dropata?`
2. Jatkokysymys: `Entä jos en tiedä, mistä kohtaa pallo ylitti estealueen rajan?`

Toisen vastauksen pitäisi kertoa, että ylityskohta arvioidaan, jos tarkkaa kohtaa ei tiedetä.

Muita kokeita:
- `Saanko lyödä pallon suoraan estealueelta?`
- `Palloa ei löydy, mutta näin sen menevän lampeen.`
- `Palloni on estealueella tilapäisessä vedessä. Saanko ilmaisen dropin?`

## Huomio

Tämä versio käyttää vain säännön 17 rajattua testiaineistoa. Se ei vielä ole koko golfin sääntökirjan palvelu.

Live Server näyttää käyttöliittymän, mutta `/api/ask` tarvitsee Vercelin serverless-ympäristön (tai `vercel dev` -ajon) ja `OPENAI_API_KEY`-ympäristömuuttujan.


## v1.1
- Hybrid RAG: embeddings + pelaajakielen avainsanat.
- Rule 17.3 tunnistaa myös putoamisjälki/alastulojälki-ilmaisut.
- Näytetään vain vastauksessa oikeasti käytetyt sääntöviitteet.
- Vastaukset ovat plain text -muodossa ilman näkyviä **-merkkejä.
