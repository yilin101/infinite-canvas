import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, isAuthEnabled, verifySessionToken } from "@/lib/server-auth";

const publicPaths = ["/login", "/api/auth/login", "/favicon.ico", "/logo.svg"];
const publicPrefixes = ["/_next", "/api/auth/session"];

export async function proxy(request: NextRequest) {
    if (!isAuthEnabled() || isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
    if (await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value)) return NextResponse.next();

    if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ message: "请先登录" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: ["/((?!.*\\..*).*)", "/api/:path*"],
};

function isPublicPath(pathname: string) {
    return publicPaths.includes(pathname) || publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}
