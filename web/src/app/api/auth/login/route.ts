import { NextResponse } from "next/server";

import { createSessionToken, getServerDefaults, getServerUser, sessionCookieOptions, verifyLogin, AUTH_COOKIE_NAME } from "@/lib/server-auth";

export async function POST(request: Request) {
    const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
    if (!verifyLogin(body.username || "", body.password || "")) {
        return NextResponse.json({ message: "账号或密码不正确" }, { status: 401 });
    }

    const response = NextResponse.json({ user: getServerUser(), defaults: getServerDefaults() });
    response.cookies.set(AUTH_COOKIE_NAME, await createSessionToken(), sessionCookieOptions());
    return response;
}
