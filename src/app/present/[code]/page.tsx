import { PresenterScreen } from "./PresenterScreen";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PresenterScreen code={code.toUpperCase()} />;
}
