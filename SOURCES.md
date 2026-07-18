# Fonti dei dati

Tutte le fonti del progetto Internet Adoption Map sono pubbliche, scaricabili e riproducibili tramite gli script Python inclusi nel repo.

## 1. Penetrazione internet (% popolazione online)

**Fonte primaria:** [Our World in Data](https://ourworldindata.org/grapher/share-of-individuals-using-the-internet) / International Telecommunication Union (ITU), edizione 2025

**Aggiornamento:** Eseguire `python3 scripts/build_data.py`
- Scarica il CSV da OWID
- Genera `data/adoption.js` con serie annuali per 213 paesi (1990–2024)
- Calcola metriche di soglia: anni per passare da 10%→50%, 10%→40%, ecc.
- Per ogni paese: primo anno con dati disponibili, anno di raggiungimento del 10% e del 50%, velocità (2–17 anni)

**Copertura:**
- 213 paesi e territori
- Anni: 1990–2024
- Valore di base: percentuale annuale di persone che usano internet

**Nota:** I valori sono aggiunti via interpolazione lineare tra i dati ITU disponibili (che spesso sono saltuari), mantenendo costante il valore finale quando la serie termina prima del 2024.

---

## 2. Sottoscrizioni mobili e banda larga fissa

**Fonte:** [World Bank Open Data API](https://data.worldbank.org)

**Indicatori:**
- `IT.CEL.SETS.P2` — Sottoscrizioni cellulari per 100 persone
- `IT.NET.BBND.P2` — Sottoscrizioni banda larga fissa per 100 persone

**Aggiornamento:** Eseguire `python3 scripts/build_data.py`
- Scarica via API (con retry e User-Agent header)
- Genera `data/metrics.js` con serie per 195 paesi (anni variabili, spesso 1990+)
- Valori: per 100 persone (es. 120 = 1.2 sottoscrizioni pro capite)

**Copertura:**
- Copertura mondiale per paesi con dati disponibili
- Anni: varia per paese, ma principalmente 1990–2024
- Due metriche indipendenti per capire la penetrazione di tecnologie diverse

---

## 2-bis. Dataset extra (fase 1a): prezzo, velocità, gender gap

**Script:** `python3 scripts/build_extras.py` → genera `data/extras.js`

### Prezzo di 1GB di dati mobili
- **Fonte:** [Cable.co.uk worldwide mobile data pricing](https://www.cable.co.uk/mobiles/worldwide-data-pricing/) (studio 2023, XLSX con storico)
- **Copertura:** 214 paesi, anni 2019–2023 (USD, prezzo medio 1GB)
- **Nota:** codici ISO2 nel file, convertiti in ISO3 tramite l'elenco paesi World Bank

### Velocità mediana download mobile
- **Fonte:** [Ookla Speedtest Global Index](https://www.speedtest.net/global-index) (tabelle HTML della pagina)
- **Copertura:** ~96 paesi, snapshot corrente (Mbps mediani mobile) — nessuno storico
- **Nota:** i nomi paese (slug) sono mappati a ISO3 con alias curati nello script

### Gender gap online (parità F/M)
- **Fonte:** World Bank API, indicatori `IT.NET.USER.FE.ZS` (donne online %) e `IT.NET.USER.MA.ZS` (uomini online %)
- **Metrica derivata:** rapporto donne/uomini online (1.0 = parità)
- **Copertura:** 165 paesi, serie annuali dove entrambi gli indicatori esistono

### Internet shutdowns
- **Fonte:** [Access Now #KeepItOn — STOP dataset](https://www.accessnow.org/campaign/keepiton/) (Google Sheet pubblico, foglio "Combined 2016-2025")
- **Metrica:** conteggio cumulativo di shutdown registrati per paese dal 2016 (le righe multi-paese vengono attribuite a ogni paese coinvolto)
- **Copertura:** 92 paesi; grigio in mappa = zero shutdown registrati (non "dato mancante")
- **Nota:** gli incidenti dell'anno in corso entrano al refresh successivo (la serie si ferma a YEAR_MAX)

### Freedom on the Net
- **Fonte:** [Freedom House](https://freedomhouse.org/countries/freedom-net/scores) (tabella scores dell'edizione corrente)
- **Metrica:** indice 0–100 (100 = massima libertà della rete)
- **Copertura:** 72 paesi valutati; il resto risulta "Not assessed"
- **Nota:** solo edizione corrente, nessuno storico (Freedom House non pubblica un bulk-download)

### Internet exchange points & data center
- **Fonte:** [PeeringDB](https://www.peeringdb.com/) API pubblica, endpoint `ix` (internet exchange) e `fac` (data center facilities)
- **Metrica primaria:** conteggio IXP attivi per paese (layer mappa)
- **Metrica secondaria:** conteggio data center PeeringDB per paese (riga extra nel tooltip, non un layer a sé)
- **Copertura:** 1.311 IXP in 164 paesi mappati, 5.857 facility in 162 paesi
- **Nota sullo zero:** l'assenza dalla mappa significa "nessun IXP censito su PeeringDB", non necessariamente zero in assoluto — PeeringDB è il database più completo ma è a iscrizione volontaria, quindi la legenda dice "No listed exchange", non "0"

### IPv6 adoption
- **Fonte:** [Google — statistiche IPv6 per paese](https://www.google.com/intl/en/ipv6/statistics.html), file dati statico `worldmap.js` aggiornato quotidianamente
- **Metrica:** % di traffico IPv6 nativo verso Google, per paese
- **Copertura:** 216 paesi/territori
- **Nota:** solo snapshot corrente, nessuno storico (il file non contiene serie temporali)

---

## 3. Cavi sottomarini

**Fonte:** [TeleGeography Submarine Cable Map](https://www.submarinecablemap.com/) — API v3 live

**Dati:**
- 604 cavi sottomarini in servizio (i ~90 progetti pianificati sono esclusi)
- Per ogni cavo: id, nome, anno di Ready-For-Service (RFS), proprietari, geometria (rotte come MultiLineString)
- Endpoint: `all.json` (indice), `{id}.json` (dettagli per cavo, scaricati in parallelo), `cable-geo.json` (geometrie GeoJSON)

**Aggiornamento:** Eseguire `python3 scripts/build_cables.py`
- Scarica da TeleGeography mirror
- Semplifica la densità dei punti (~0.15° di thinning) per ridurre la payload
- Calcola le rotte per cavo
- Genera `data/cables.js` (88 KB, file JS puro)

**Nota:** Fonte live — gli anni RFS vanno dal 1989 al 2026. Rigenerando con lo script si ottiene sempre lo stato attuale della rete.

**Visualizzazione:** I cavi appaiono sulla mappa quando la timelapse raggiunge il loro anno RFS, con uno stato visivo che cambia da "laid" (posato) a "fresh" (nuovo, con glow) e infine "unlaid" (futuro).

---

## 4. Eventi storici di internet

**Fonte:** Curati manualmente in `data/events.js`

**Struttura:**
- 52 milestone (1990–2024)
- Almeno una per anno, massimo due (per evitare sovraccarico visivo)
- Globali o specifici per paese (con array `iso`)
- Fonte: letteratura storica su internet, stampa tech, rapporti ITU

**Esempi:**
- 1990: Disattivazione ARPANET, lancio del primo browser Web a CERN
- 1993: Mosaic browser (primo browser grafico popolare)
- 2001: Korea raggiunge il 50% online in 2 anni (10→50% più veloce della storia)
- 2007: iPhone (nascita dell'era mobile)
- 2016: Jio in India (centinaia di milioni di indiani vanno online)
- 2024: 68% dell'umanità online

**Descrizioni:** Una riga sintetica per ogni evento, leggibile nella card timelapse.

---

## 5. Geometrie geografiche

**Fonte:** [world-atlas](https://github.com/topojson/world-atlas) tramite TopoJSON

**Contenuto:**
- Confini dei paesi (fixed borders a una data storica)
- Coordinate di centroidi per piccole isole (`data/geo.js`)
- Mapping tra TopoJSON ID numerici e codici ISO3 (ISO 3166-1 alpha-3)

**Formato:** TopoJSON (geometrie compresse), convertite al volo da D3 in SVG paths per rendering.

**Nota:** I confini sono fissi e storici — non rappresentano rivendicazioni contemporanee, ma consentono una coerenza visiva nel timelapse 1990–2024.

---

## 6. Topografia per proiezioni cartografiche

**Fonte:** [Natural Earth Data](https://www.naturalearthmap.com/) (10m resolution)

**Uso:**
- Proiezione Natural Earth 1 (mappa piatta, meno distorsione ai poli)
- Proiezione ortografica (globo 3D, draggabile)
- Graticola geografica (10° × 10°)

**Implementazione:** Caricate tramite D3.js

---

## Come aggiornare i dati

### Penetrazione internet e metriche (mobile/broadband)
```bash
cd /path/to/world-internet-map
python3 scripts/build_data.py
```
Richiede: Python 3, nessuna libreria esterna (usa urllib, json e csv stdlib).

**Cosa fa:**
1. Scarica CSV da OWID per penetrazione internet
2. Scarica da World Bank API per mobile e banda larga
3. Interpola linearmente gli anni mancanti
4. Scrive `data/adoption.js` e `data/metrics.js`

### Cavi sottomarini
```bash
cd /path/to/world-internet-map
python3 scripts/build_cables.py
```
Richiede: Python 3, nessuna libreria esterna.

**Cosa fa:**
1. Scarica da TeleGeography mirror (all.json + cables-geo.json)
2. Semplifica geometrie per ridurre dimensione file
3. Scrive `data/cables.js`

### Eventi storici
Nessuno script: modificare manualmente `data/events.js`.
- Aggiungere/rimuovere entry nella lista EVENTS
- Mantenere l'ordine cronologico e il formato JSON
- Massimo 2 per anno (in via di principio)
- Testare la visualizzazione in locale

---

## Licenze e attribuzione

- **Our World in Data**: CC BY 4.0 (richiede attribuzione)
- **World Bank Data**: CC BY 4.0 (richiede attribuzione)
- **TeleGeography**: Mirror pubblico, usato per scopi educativi / ricerca
- **world-atlas (TopoJSON)**: Public Domain
- **Natural Earth**: Public Domain

Attribuzione visibile nel footer della mappa e nel README.

---

## Qualità e limitazioni dei dati

### Penetrazione internet (OWID/ITU)
- ✅ Migliore stima disponibile a livello globale per il periodo 1990–2024
- ⚠️ I dati ITU sono spesso incomplete per paesi piccoli, isole remote, e conflitti
- ⚠️ Definizione di "internet user" varia leggermente nel tempo
- ⚠️ Alcuni paesi sono aggregati (es. ex Unione Sovietica) o mancanti (es. Corea del Nord)

### Mobile e banda larga (World Bank)
- ✅ Fonte ufficiale per le statistiche telecomunicazioni globali
- ⚠️ Copertura discontinua: non tutti i paesi reportano ogni anno
- ⚠️ "Sottoscrizioni" ≠ "utenti attivi" (alcuni hanno più di una sottoscrizione, altri zero)
- ⚠️ Banda larga "fissa" non include mobile broadband (4G/5G)

### Cavi sottomarini (TeleGeography)
- ✅ Database più completo di cavi internazionali
- ⚠️ Snapshot congelato al 2015, non aggiornato in tempo reale
- ⚠️ Cavi post-2015 (es. Google Private Cables, Meta Global Express) non presenti
- ⚠️ RFS = "ready-for-service" pianificato, non sempre coincide con attivazione effettiva

### Eventi (curati manualmente)
- ⚠️ Soggettivi: non esaustivi, scelti per importanza narrativa
- ⚠️ Datazione approssimativa (anno, non giorno) per coerenza con granularità annuale timelapse

---

## Contatti e segnalazioni

Per errori di dati, missing countries, o suggerimenti di nuovi milestone:
- Aprire un'issue su GitHub
- Verificare prima su OWID, World Bank, o TeleGeography che i dati sorgente siano corretti

---

*Ultimo aggiornamento: luglio 2026*
