import { AI_PROVIDERS } from "@/lib/ai";
import { AiProfiles } from "./AiProfiles";

export default function SettingsPage() {
  return (
    <main className="container stack" style={{ maxWidth: 820 }}>
      <h1>Impostazioni AI</h1>
      <p className="muted">
        Puoi salvare più profili AI, anche di fornitori diversi. Il profilo <b>predefinito</b> serve per le unioni tra parole,
        i collegamenti del prima/dopo e la convergenza finale. Se non risponde (crediti finiti, chiave revocata…) l&apos;app
        prova da sola gli altri profili. Le chiavi sono cifrate sul server e non vengono mai mostrate di nuovo. Un profilo
        si può <b>condividere con tutti gli operatori</b>: lo useranno senza vedere la chiave, consumando i tuoi crediti.
      </p>
      <AiProfiles providers={AI_PROVIDERS} />
    </main>
  );
}
