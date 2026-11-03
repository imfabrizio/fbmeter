import type { Metadata } from "next";
import { legalInfo } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Termini di servizio" };

export default function TermsPage() {
  const { appName, owner, contact, updated } = legalInfo();
  return (
    <main className="container stack" style={{ maxWidth: 760 }}>
      <div>
        <div className="small muted">Ultimo aggiornamento: {updated}</div>
        <h1>Termini di servizio</h1>
        <p>
          {appName} è uno strumento gratuito per raccogliere parole e domande dal pubblico durante eventi e presentazioni.
          È messo a disposizione da {owner}
          {contact && (
            <>
              {" "}
              (<a href={`mailto:${contact}`}>{contact}</a>)
            </>
          )}
          . Usandolo accetti questi termini.
        </p>
      </div>

      <section>
        <h2>Uso da parte del pubblico</h2>
        <ul>
          <li>Partecipare è facoltativo e non richiede registrazione: basta un nickname.</li>
          <li>
            Scrivi contenuti pertinenti all&apos;evento. Non sono ammessi contenuti offensivi, discriminatori, illeciti o che
            contengano dati personali di altre persone.
          </li>
          <li>
            Le parole e le domande inviate possono essere mostrate sullo schermo dell&apos;evento, nella pagina dei risultati
            e nelle analisi aggregate degli organizzatori, associate solo al nickname.
          </li>
          <li>
            Gli organizzatori possono nascondere o eliminare contenuti in qualsiasi momento, senza preavviso.
          </li>
        </ul>
      </section>

      <section>
        <h2>Uso da parte degli operatori</h2>
        <ul>
          <li>
            L&apos;accesso alla regia avviene con un account Microsoft o Google ed è abilitato da un amministratore. Ogni
            operatore è responsabile dell&apos;uso del proprio account.
          </li>
          <li>
            Chi salva una propria chiave di un servizio di intelligenza artificiale ne resta titolare e responsabile, anche
            per i costi e per il rispetto dei termini del fornitore scelto.
          </li>
          <li>
            Gli operatori trattano i risultati esportati nel rispetto dell&apos;<a href="/privacy">informativa privacy</a>.
          </li>
        </ul>
      </section>

      <section>
        <h2>Disponibilità e responsabilità</h2>
        <p>
          Lo strumento è fornito &quot;così com&apos;è&quot;, senza garanzia di disponibilità continua o di assenza di
          errori. Nei limiti consentiti dalla legge, il titolare non risponde di interruzioni del servizio, perdita di dati o
          danni indiretti derivanti dal suo uso. Il servizio può essere modificato o sospeso in qualsiasi momento.
        </p>
      </section>

      <section>
        <h2>Modifiche e legge applicabile</h2>
        <p>
          Questi termini possono essere aggiornati; la versione in vigore è sempre pubblicata in questa pagina con la data di
          aggiornamento. Si applica la legge italiana.
        </p>
      </section>

      <p className="small">
        <a href="/privacy">Informativa privacy</a> · <a href="/">Torna alla home</a>
      </p>
    </main>
  );
}
