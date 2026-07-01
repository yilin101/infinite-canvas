import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, getServerDefaults, getServerUser, isAuthEnabled, verifySessionToken } from "@/lib/server-auth";

export async function GET() {
    const cookieStore = await cookies();
    const authenticated = !isAuthEnabled() || (await verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value));
    if (!authenticated) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: getServerUser(), defaults: getServerDefaults() });
}
