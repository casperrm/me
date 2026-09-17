import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const invoices = await prisma.invoice.findMany({
    orderBy: { issueDate: "desc" },
    include: { client: true },
  });
  return NextResponse.json(invoices);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.clientId || !body.description || !body.amount || !body.dueDate) {
    return NextResponse.json({ error: "clientId, description, amount and dueDate are required." }, { status: 400 });
  }
  const invoice = await prisma.invoice.create({
    data: {
      clientId: body.clientId,
      description: body.description,
      amount: Number(body.amount),
      status: body.status || "unpaid",
      dueDate: new Date(body.dueDate),
    },
  });
  return NextResponse.json(invoice, { status: 201 });
}
