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


## v1.2
- Vahvempi haku punaisen estealueen drop/vapautumiskysymyksille.
- Vahvempi haku tilanteeseen, jossa viimeistä ylityskohtaa ei tiedetä.
- Mallia ohjataan käyttämään lähdepalan olennainen tieto eikä väittämään tiedon puuttuvan, jos se on mukana.
- Vastaukset aloitetaan suoralla käytännön vastauksella ja pidetään napakoina.


## v1.3
- Robustimpi OpenAI Responses API -tekstin poiminta useista vastausrakenteista.
- Tarkempi virheilmoitus, jos API-vastaus saadaan mutta tekstisisältö puuttuu.
- Kadonneen pallon / epävarman estealueeseen päätymisen haku vahvistettu (17.1c).
- Lisätty minimaalinen 18.2-ristiviite, jotta kadonneen pallon jatkomenettely voidaan vastata oikein.
- Yleinen sääntöviite 17 poistetaan näkyvistä, jos mukana on tarkempi 17.x-viite.


## v1.4
- Korjattu epävarma estealue / kadonnut pallo -tilanne: 17.1c + 18.2 priorisoidaan 17.1d:n sijaan.
- Lisätty selkeä 18.2-ristiviite kadonneen pallon menettelyyn.
- OpenAI Responses API -tekstin poiminta tehty robustimmaksi.
- Yleinen 17-viite poistetaan, kun tarkempi 17.x-viite on mukana.
- Kysy jatkokysymys -painike on nyt sama tummanvihreä pääpainike kuin ensimmäinen Kysy-painike.
- Golf-sovellusten vihreää visuaalista linjaa yhtenäistetty kevyesti ilman keskustelurakenteen muuttamista.


## v1.5
- UI-only update; RAG logic and Rule 17 data are unchanged from v1.4.
- Whole page now uses a soft light-green Golf-app background instead of white.
- Question and answer cards remain visually separated on the green canvas.
- Initial Kysy and Kysy jatkokysymys buttons use the same dark-green primary style.


## v1.6
- Stronger light-green page background; question card stays lighter and action buttons darkest green.
- Hardened answer parsing so raw JSON is never intentionally passed to the chat UI.
- Improved Rule 17.3 retrieval for temporary water / abnormal course conditions.
- Improved Rule 17.1a retrieval for penalty-area boundary cases.
- Improved Rule 17.1c retrieval for a ball not found but known/virtually certain to be in a penalty area.
- Complete new questions no longer inherit missing facts such as penalty-area colour from earlier turns.
- Prompt now requires a short rule-reasoning chain for multi-step situations.


## v1.7
- Technical robustness update only; Rule 17 retrieval/data logic remains v1.6.
- More tolerant parsing of OpenAI answer payloads while still blocking raw JSON from the player UI.
- After an API/parser error the follow-up composer is always restored.
- The failed question is prefilled so the player can retry immediately or edit it.
