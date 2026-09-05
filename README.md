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


## v1.8
- Expanded Rule 17.2a source chunk to preserve its full decision structure.
- Clarifies play-as-lies, the three normal one-stroke relief options, and the extra option of returning to the place of the last stroke made outside a penalty area.
- Includes the two-penalty-stroke sequence when stroke-and-distance is first taken back into the penalty area and further relief is then taken outside it.
- Added a general retrieval boost for a ball played from a penalty area that returns to the same or another penalty area.
- v1.7 parser/retry fixes retained.


## v1.9
- Responses API robustness: low reasoning effort and a larger output budget.
- If a response contains only reasoning/incomplete output, the backend retries once with more output room.
- Added Rule 17.1e source data for a no-play zone inside a penalty area.
- Added general retrieval support for the no-play-zone concept.
- v1.8 Rule 17.2a data and v1.7 parser/retry UI fixes retained.

## v2.0 — koko sääntökirjan RAG-pohja
- `api/ask.js` käyttää OpenAI Responses API:n `file_search`-työkalua.
- Vector store tunnistetaan Vercelin ympäristömuuttujalla `OPENAI_VECTOR_STORE_ID`.
- Nykyistä `OPENAI_API_KEY`-muuttujaa käytetään edelleen; API-avainta ei siirretä selaimeen.
- Jos vector storea ei ole vielä kytketty, API palauttaa hallitun 503-ilmoituksen eikä putoa vanhaan Rule 17 -aineistoon vahingossa.
- `data/rule17.json` on jätetty pakettiin v1.9:n vertailu-/palautusaineistoksi, mutta v2.0 API ei käytä sitä.
- `data/vector-store-metadata.json` pitää yllä sääntöedition ja Clarifications-version tilaa.
- Footerin pieni `v2.0` avaa ylläpitopaneelin pitkällä painalluksella. Tavallinen käyttäjä ei tarvitse toimintoa.
- Clarifications-tarkistus on tässä paketissa turvallinen käyttöliittymäpohja: se ei vielä muuta dataa automaattisesti.

### Käyttöönoton seuraava askel
1. Luo OpenAI-projektiin vector store nimellä esimerkiksi `Golf Rules AI`.
2. Lisää koko hyväksytty sääntöaineisto vector storeen ja odota, että tiedostojen tila on `completed`.
3. Lisää Verceliin ympäristömuuttuja `OPENAI_VECTOR_STORE_ID=vs_...`.
4. Redeploy ja testaa ristiviittauskysymys (esim. Rule 17 + Rule 14).


## v2.0.1 — PWA / mobile
- Added `manifest.webmanifest`, app icons and `apple-touch-icon.png`.
- Added lightweight service worker for the static app shell; `/api/` responses are not cached.
- iPhone/iPad Home Screen name: `Golf Rules AI`.
- Updated UI text: full Rules of Golf 2023 + R&A Clarifications 1.7.2026 are now in use.
- Vector Store metadata updated to active.
- Existing Vector Store/File Search backend and speech/chat logic are unchanged.
