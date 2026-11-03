import QRCode from "qrcode";
import { eventByCode, joinUrl } from "@/lib/events";
import { api } from "@/lib/session";

type Ctx = { params: Promise<{ code: string }> };

/** QR code (SVG) dell'unico link di accesso all'evento. */
export const GET = api(async (req: Request, { params }: Ctx) => {
  const { code } = await params;
  const ev = await eventByCode(code);
  const svg = await QRCode.toString(joinUrl(req, ev.code), {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
  const download = new URL(req.url).searchParams.has("download");
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=300",
      ...(download ? { "content-disposition": `attachment; filename="qr-${ev.code}.svg"` } : {}),
    },
  });
});
