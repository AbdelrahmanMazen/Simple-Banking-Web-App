import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const latest = await prisma.announcementSchedule.findFirst({
      where: {
        status: { in: ["SCHEDULED", "ACTIVE"] },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: [{ startsAt: "desc" }, { updatedAt: "desc" }],
      select: { updatedAt: true },
    });
    return NextResponse.json({ updatedAt: latest?.updatedAt?.toISOString() ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ updatedAt: null }, { status: 200, headers: { "cache-control": "no-store" } });
  }
}
