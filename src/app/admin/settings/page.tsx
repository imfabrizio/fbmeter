import { AI_PROVIDERS } from "@/lib/ai";
import { AiSettingsForm } from "./AiSettingsForm";

export default function SettingsPage() {
  return (
    <main className="container stack" style={{ maxWidth: 720 }}>
      <h1>Impostazioni AI</h1>
      <p className="muted">
        La chiave è personale: la usa solo la tua utenza quando chiedi all&apos;AI di proporre unioni tra parole simili. Viene
        cifrata sul server e non viene mai mostrata di nuovo, né agli altri operatori né al pubblico.
      </p>
      <AiSettingsForm providers={AI_PROVIDERS} />
    </main>
  );
}
