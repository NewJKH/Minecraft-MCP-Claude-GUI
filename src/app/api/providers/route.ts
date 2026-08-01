import { NextResponse } from "next/server";
import { availableProviders, defaultProvider } from "@/lib/ai/image";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    providers: availableProviders(),
    default: defaultProvider(),
    claudeRefine: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
