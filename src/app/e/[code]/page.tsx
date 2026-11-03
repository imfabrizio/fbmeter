import { ParticipantApp } from "./ParticipantApp";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ParticipantApp code={code.toUpperCase()} />;
}
