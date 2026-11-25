import { NextResponse, type NextRequest } from "next/server";
import { payoutRows } from "@/lib/payouts";
import { getViewer } from "@/lib/viewer";
import { toCsv } from "@/lib/csv";

/** Finance's monthly payout export (opens in Excel). */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.level === "leader" || viewer.finance)) return new NextResponse("Not allowed", { status: 403 });
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("Bad month", { status: 400 });
  const rows = await payoutRows(month);
  const csv = toCsv(["Client", "BD person", "Kiosks", "Rentals", "Sales (PHP)", "Venue share", "Venue share due (PHP)", "BD share", "BD share due (PHP)"],
    rows.map((r) => [r.client, r.owner, r.kiosks, r.rentals, r.sales, r.venueRate, r.venueDue ?? "", r.bdRate, r.bdDue ?? ""]));
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${month}_Payouts.csv"` } });
}
