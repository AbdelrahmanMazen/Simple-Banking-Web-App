import { NextResponse } from "next/server";
import { adminUpdateAnnouncementSchedule } from "@/app/actions/bankActions";

export async function POST(req: Request) {
  const formData = await req.formData();
  try {
    const result = await adminUpdateAnnouncementSchedule(formData);
    // adminUpdateAnnouncementSchedule redirects on success; if it returns, fall through
    return NextResponse.redirect(new URL("/admin?announcementUpdated=1", req.url));
  } catch (err: any) {
    // If the server action threw a NEXT_REDIRECT, rethrow to let Next.js handle it
    if (err && typeof err === "object" && "digest" in err && typeof err.digest === "string" && err.digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error("/api/admin/update-announcement error", err);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
