import { PresenterScreen } from "./PresenterScreen";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { code } = await params;
  const { preview } = await searchParams;
  return <PresenterScreen code={code.toUpperCase()} preview={preview === "1"} />;
}
