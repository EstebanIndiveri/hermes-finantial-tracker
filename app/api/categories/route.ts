import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const cats = await db.query.categories.findMany({
    where: eq(categories.is_active, 1),
    orderBy: (c, { asc }) => asc(c.sort_order),
  });
  return NextResponse.json(cats);
}
