import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const latest = await prisma.announcement.findFirst({ orderBy: { createdAt: "desc" }, select: { updatedAt: true } });
    return NextResponse.json({ updatedAt: latest?.updatedAt?.toISOString() ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ updatedAt: null }, { status: 200, headers: { "cache-control": "no-store" } });
  }
}
