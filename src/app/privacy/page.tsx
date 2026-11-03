import type { Metadata } from "next";
import { legalInfo } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Informativa privacy" };

export default function PrivacyPage() {
  const { appName, owner, contact, updated } = legalInfo();
  return (
    <main className="container stack" style={{ maxWidth: 760 }}>
      <div>
        <div className="small muted">Ultimo aggiornamento: {updated}</div>
        <h1>Informativa sul trattamento dei dati personali</h1>
        <p>
          Questa informativa spiega quali dati tratta {appName}, lo strumento usato durante eventi e presentazioni per
          raccogliere parole e domande dal pubblico, ai sensi del Regolamento (UE) 2016/679 (GDPR).
        </p>
      </div>

      <section>
        <h2>Titolare del trattamento</h2>
        <p>
          Il titolare è {owner}
          {contact && (
            <>
              , contattabile all&apos;indirizzo <a href={`mailto:${contact}`}>{contact}</a>
            </>
          )}
          .
        </p>
      </section>

      <section>
        <h2>Quali dati trattiamo</h2>
        <h3>Partecipanti (pubblico)</h3>
        <ul>
          <li>
            <b>Nickname</b> scelto liberamente all&apos;ingresso: può essere inventato, non è richiesto il nome reale.
          </li>
          <li>
            <b>Risposte</b>: le parole inviate ai sondaggi e le eventuali domande e voti nella sezione domande.
          </li>
          <li>
            <b>Identificativo tecnico</b>: un codice casuale salvato nel browser del telefono (localStorage), che serve a
            riconoscere lo stesso partecipante se ricarica la pagina. Sul server ne viene conservata solo un&apos;impronta
            (hash), non il codice in chiaro.
          </li>
        </ul>
        <p>
          Non chiediamo email, numero di telefono o altri dati identificativi e non usiamo cookie di profilazione o di
          terze parti. Ti invitiamo a non scrivere dati personali tuoi o di altri nelle risposte.
        </p>
        <h3>Operatori (relatori e organizzatori)</h3>
        <ul>
          <li>
            <b>Nome e indirizzo email</b> ricevuti da Microsoft o Google al momento dell&apos;accesso, il metodo di accesso
            usato, il ruolo assegnato e la data dell&apos;ultimo accesso.
          </li>
          <li>
            <b>Cookie di sessione</b> tecnico, necessario per restare collegati alla regia.
          </li>
          <li>
            <b>Chiave API di un servizio di intelligenza artificiale</b>, se l&apos;operatore sceglie di salvarla: viene
            conservata cifrata e non viene mai mostrata di nuovo.
          </li>
        </ul>
      </section>

      <section>
        <h2>Perché li trattiamo e su quale base</h2>
        <ul>
          <li>
            Per far funzionare i sondaggi e le domande durante l&apos;evento e mostrare i risultati aggregati: esecuzione del
            servizio richiesto partecipando (art. 6.1.b GDPR).
          </li>
          <li>
            Per analizzare in forma aggregata le parole raccolte e migliorare i contenuti degli eventi: legittimo interesse
            dell&apos;organizzatore (art. 6.1.f GDPR). Le analisi riguardano le parole e i loro conteggi, non le singole
            persone.
          </li>
          <li>Per gestire l&apos;accesso degli operatori e la sicurezza dello strumento: legittimo interesse.</li>
        </ul>
      </section>

      <section>
        <h2>Uso dell&apos;intelligenza artificiale</h2>
        <p>
          Un operatore può chiedere a un servizio di intelligenza artificiale (Anthropic, Google o OpenAI, a sua scelta) di
          suggerire quali parole raccolte abbiano lo stesso significato. In quel caso al servizio vengono inviati solo
          l&apos;elenco delle parole di un blocco e il numero di persone che le hanno scritte: non vengono inviati nickname
          né altri dati dei partecipanti. I suggerimenti vengono applicati solo dopo la conferma dell&apos;operatore.
        </p>
      </section>

      <section>
        <h2>Dove sono conservati e per quanto tempo</h2>
        <p>
          I dati sono conservati su un database PostgreSQL e l&apos;applicazione è ospitata da fornitori cloud che agiscono
          come responsabili del trattamento. I dati di un evento restano disponibili finché l&apos;evento non viene
          eliminato dagli organizzatori; le risposte dei test vengono cancellate prima dell&apos;evento. Gli operatori
          possono esportare i risultati per analisi interne.
        </p>
        <p>
          Alcuni fornitori potrebbero trattare dati al di fuori dello Spazio economico europeo; in tal caso il trasferimento
          avviene sulla base delle garanzie previste dal GDPR (ad esempio clausole contrattuali standard o decisioni di
          adeguatezza).
        </p>
      </section>

      <section>
        <h2>I tuoi diritti</h2>
        <p>
          Puoi chiedere accesso, rettifica, cancellazione o limitazione dei tuoi dati, opporti al trattamento basato sul
          legittimo interesse e proporre reclamo al Garante per la protezione dei dati personali
          (<a href="https://www.garanteprivacy.it">garanteprivacy.it</a>).
          {contact ? (
            <>
              {" "}
              Per esercitare i tuoi diritti scrivi a <a href={`mailto:${contact}`}>{contact}</a>, indicando l&apos;evento e
              il nickname usato.
            </>
          ) : (
            " Per esercitare i tuoi diritti rivolgiti all'organizzatore dell'evento, indicando l'evento e il nickname usato."
          )}
        </p>
      </section>

      <p className="small">
        <a href="/termini">Termini di servizio</a> · <a href="/">Torna alla home</a>
      </p>
    </main>
  );
}
