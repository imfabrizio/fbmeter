import { NextResponse } from "next/server";
import { sharedProfiles } from "@/lib/aiProfiles";
import { api, requireOperator } from "@/lib/session";

/** Profili AI condivisi dagli altri operatori: si vedono nome, fornitore, modello e proprietario, mai la chiave. */
export const GET = api(async () => {
  const me = await requireOperator();
  const rows = await sharedProfiles(me.id);
  return NextResponse.json(
    rows.map(({ profile: p, ownerEmail, ownerName }) => ({
      id: p.id,
      label: p.label,
      provider: p.provider,
      model: p.model,
      owner: ownerName || ownerEmail,
      lastTestOk: p.lastTestOk,
    })),
  );
});
