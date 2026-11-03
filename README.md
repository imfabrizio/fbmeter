# FBMeter

Sondaggi a parole e domande dal pubblico per eventi dal vivo, sul modello di Mentimeter, pensati per una presentazione divisa in **blocchi**.

Il pubblico inquadra **un solo QR code** all'inizio e sceglie un nickname. Da quel momento il telefono segue da solo la regia: per ogni blocco (es. Entra ID, SharePoint, Defender…) arriva una domanda di **inizio** e, a fine intervento, una di **fine**. Ognuno scrive fino a 3 parole. Alla fine c'è una pagina con le **3 parole dominanti del "dopo"** per ogni blocco, confrontate con quelle del "prima".

## Funzioni

- **QR unico e sessione persistente.** Nessuna riscansione. Se il telefono si blocca o la pagina viene chiusa, riaprendo il link si rientra con lo stesso nickname.
- **Regia.** Un clic apre la domanda successiva e chiude automaticamente quella precedente. Il pubblico che ha già risposto resta in attesa.
- **Schermo proiettore** (`/present/<CODICE>`), pilotato dalla regia, con cinque modalità:
  - nuvola live;
  - QR grande;
  - confronto prima/dopo di un blocco;
  - riepilogo finale;
  - domande dal pubblico.
- **Aggregazione delle parole, su due livelli.**
  1. Automatica: maiuscole, accenti, punteggiatura, articoli e singolare/plurale (`utente` = `Utenti`, `identità` = `Identita`, `user` = `users`).
  2. Unioni di significato decise dall'operatore (`utenti` → `identità`), valide per inizio e fine del blocco e reversibili. Si possono fare a mano oppure con suggerimenti dell'AI, da confermare.
- **AI personale.** Ogni operatore salva la propria chiave (Anthropic, Google Gemini o OpenAI). La chiave è cifrata nel database (AES-256-GCM) e non viene mai restituita. Se lo strumento passa a un altro team, ognuno usa la sua.
- **Q&A attivabile per evento.** Le domande si possono votare e, se si vuole, approvare prima della pubblicazione. Se il Q&A è spento non compare da nessuna parte.
- **Login operatori** con Microsoft Entra ID e/o Google, in OpenID Connect standard. MFA e criteri di accesso sono quelli del vostro tenant. I nuovi utenti restano *in attesa* finché un amministratore non li abilita.
- **Esportazione CSV**, compatibile con Excel in italiano. Due file: la classifica per blocco e tutte le risposte grezze, con forma scritta, chiave normalizzata e voce finale.
- **Azzeramento delle prove** prima dell'evento vero.

## Architettura

| Livello | Scelta | Perché |
|---|---|---|
| App | Next.js 16 (Node) | Un solo progetto per pagine e API, gira ovunque ci sia Node 20+ |
| Database | PostgreSQL qualsiasi, via Drizzle ORM | Nessuna funzione proprietaria: per cambiare provider si cambia `DATABASE_URL` |
| Login | Auth.js (OpenID Connect), sessioni JWT | Nessuna tabella di sessione, provider standard |
| "Tempo reale" | Aggiornamento periodico (2–2,5 s) | Nessun servizio WebSocket esterno da gestire |
| AI | Chiamate HTTP dirette ai fornitori | Nessun SDK; aggiungere un fornitore significa aggiungere un `case` in `src/lib/ai.ts` |

Il pubblico non ha account: il telefono conserva un token casuale e il database ne salva solo l'hash.

## Avvio rapido in locale

```bash
cp .env.example .env          # compila DATABASE_URL, AUTH_SECRET, APP_ENCRYPTION_KEY, ADMIN_EMAILS
npm install
npm run db:migrate            # crea le tabelle
npm run dev                   # http://localhost:3000
```

Per provare senza configurare Entra o Google, aggiungi `AUTH_DEV_LOGIN_INSECURE=1` al `.env`: nella pagina di login compare un accesso con la sola email. **Non usarlo mai in produzione.**

## Deploy di test: Vercel + Neon (gratuito)

1. **Neon** – crea un progetto dedicato e copia la stringa di connessione **pooled** (host con `-pooler`).
2. **Vercel** – *Add New → Project*, importa questo repository da GitHub.
3. In *Settings → Environment Variables* inserisci le variabili di `.env.example`: `DATABASE_URL`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `ADMIN_EMAILS`, `APP_URL` e quelle del provider di login.
4. Deploy. Lo script `vercel-build` applica le migrazioni e poi compila: non serve altro.
5. Registra i redirect URI dei provider (sotto), poi accedi su `/admin` con un indirizzo presente in `ADMIN_EMAILS`.

Ogni `git push` sul ramo principale ripubblica in automatico.

> Due note. Il piano Hobby di Vercel è pensato per uso personale e non commerciale: per eventi aziendali verifica i termini o passa a Vercel Pro o a un altro host (sotto). Inoltre il database Neon gratuito si sospende dopo qualche minuto di inattività: apri la regia qualche minuto prima dell'evento, così il primo accesso del pubblico è già veloce.

## Deploy su un server qualsiasi

**Con Node 20+**

```bash
npm ci
npm run build
npm run db:migrate
npm start              # porta 3000; mettilo dietro un reverse proxy HTTPS
```

**Con Docker** (Azure App Service, Azure Container Apps, VM, NAS…)

```bash
docker build -t fbmeter .
docker run -p 3000:3000 --env-file .env fbmeter
```

Il container applica le migrazioni a ogni avvio.

## Configurare il login

### Microsoft Entra ID

1. Entra admin center → *App registrations* → *New registration*.
2. Tipo di account: *Accounts in this organizational directory only*.
3. Redirect URI (Web): `https://<host>/api/auth/callback/microsoft-entra-id`.
4. *Certificates & secrets* → nuovo client secret.
5. Imposta le variabili d'ambiente:
   - `AUTH_MICROSOFT_ENTRA_ID_ID` = Application (client) ID
   - `AUTH_MICROSOFT_ENTRA_ID_SECRET` = valore del secret
   - `AUTH_MICROSOFT_ENTRA_ID_ISSUER` = `https://login.microsoftonline.com/<TENANT_ID>/v2.0`
6. Facoltativo: in *Enterprise applications* → *Properties* attiva *Assignment required* e assegna gli utenti o i gruppi ammessi. MFA e Conditional Access si applicano come a qualsiasi altra app del tenant.

### Google

1. Google Cloud Console → *APIs & Services* → *Credentials* → *OAuth client ID* (tipo *Web application*).
2. Authorized redirect URI: `https://<host>/api/auth/callback/google`.
3. Imposta `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`.

Un provider compare nella pagina di login solo se le sue variabili sono impostate.

### Ruoli

| Ruolo | Cosa può fare |
|---|---|
| In attesa | Ha fatto l'accesso, ma non vede la regia |
| Operatore | Crea e conduce eventi, modera il Q&A, gestisce la propria chiave AI |
| Amministratore | Come l'operatore, più la gestione degli utenti |

- Gli indirizzi in `ADMIN_EMAILS` sono sempre amministratori.
- Gli utenti dei domini in `OPERATOR_EMAIL_DOMAINS` vengono abilitati in automatico come operatori.
- Tutti gli operatori vedono tutti gli eventi, così i relatori possono passarsi la regia.

## Uso durante l'evento

1. In regia crea l'evento: titolo e un blocco per riga. Scarica il QR in SVG per la slide iniziale.
2. Apri **Schermo proiettore** in una finestra a parte, a tutto schermo. Senza domande aperte mostra il QR grande.
3. Per ogni blocco: **Inizio**, poi l'intervento, poi **Fine**. Il pulsante blu "Apri: …" propone sempre il passo successivo.
4. Dopo la fine di un blocco puoi usare **Confronta** per mostrare il prima/dopo sul proiettore.
5. In **Parole e unioni** rivedi le voci, unisci i sinonimi a mano o con l'AI.
6. **Riepilogo finale** sul proiettore, poi **Pubblica i risultati**: sul telefono del pubblico compare il pulsante Risultati.
7. Esporta i CSV per le analisi commerciali.

Prima dell'evento vero usa *Impostazioni → Azzera le prove* per eliminare i dati dei test.

## Struttura del codice

```
src/
  app/
    e/[code]/          telefono del partecipante
    present/[code]/    schermo del proiettore
    r/[code]/          risultati finali
    admin/             regia, utenti, impostazioni AI
    api/p/[code]/      API pubbliche (join, stato, risposte, Q&A, QR)
    api/admin/         API della regia (protette)
  db/schema.ts         modello dati
  lib/words.ts         normalizzazione e aggregazione delle parole
  lib/ai.ts            suggerimenti di unione con l'AI
  lib/events.ts        query e statistiche
drizzle/               migrazioni SQL (generate con `npm run db:generate`)
```

Per modificare il modello dati: cambia `src/db/schema.ts`, esegui `npm run db:generate` e poi `npm run db:migrate`.

## Limiti noti

- L'aggiornamento è periodico: con 100 persone collegate per due ore sono circa 150–200 mila richieste. Restano nei limiti dei piani gratuiti, ma conviene saperlo.
- La normalizzazione automatica è euristica: qualche falsa unione è possibile tra parole brevi molto simili. Le unioni manuali possono solo aggiungere raggruppamenti, quindi una falsa unione automatica resta e si vede nell'export, dove è riportata la forma originale.
- Non c'è un limite di frequenza sulle risposte oltre a quello del Q&A. Per eventi molto grandi o aperti al pubblico conviene metterne uno a livello di reverse proxy.
