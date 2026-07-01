import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { AUTH_COOKIE_NAME, isAuthEnabled, verifySessionToken } from "@/lib/server-auth";

const DEFAULT_IMAGE_HOST_UPLOAD_URL = "http://amzimg.bizzlife.top/api/v1/upload";
const DEFAULT_IMAGE_HOST_FIELD = "file";

export async function POST(request: Request) {
    try {
        if (isAuthEnabled()) {
            const cookieStore = await cookies();
            if (!(await verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value))) return NextResponse.json({ message: "请先登录" }, { status: 401 });
        }
        const incoming = await request.formData();
        const file = incoming.get("image") || incoming.get("file") || incoming.get("upload");
        if (!(file instanceof File)) return NextResponse.json({ message: "请选择要上传的图片" }, { status: 400 });
        const publicBaseUrl = String(incoming.get("publicBaseUrl") || "").trim();
        if (!publicBaseUrl) return NextResponse.json({ message: "请先在配置里填写图床返回域名" }, { status: 400 });

        const formData = new FormData();
        formData.append(imageHostField(), file, file.name || "canvas-image.png");

        const headers = new Headers();
        const token = imageHostToken();
        if (token) headers.set("Authorization", `Bearer ${token}`);

        const response = await fetch(imageHostUploadUrl(), {
            method: "POST",
            headers,
            body: formData,
        });
        const text = await response.text();
        const data = parseJson(text);
        const url = extractImageUrl(data);

        if (!response.ok || !url) {
            return NextResponse.json({ message: extractErrorMessage(data) || cleanErrorText(text) || "上传图床失败" }, { status: response.status || 502 });
        }

        return NextResponse.json({ url: rewriteUrlBase(url, publicBaseUrl), raw: data });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : "上传图床失败" }, { status: 500 });
    }
}

function imageHostUploadUrl() {
    return (process.env.IMAGE_HOST_UPLOAD_URL || DEFAULT_IMAGE_HOST_UPLOAD_URL).trim();
}

function imageHostField() {
    return (process.env.IMAGE_HOST_FIELD || DEFAULT_IMAGE_HOST_FIELD).trim() || DEFAULT_IMAGE_HOST_FIELD;
}

function imageHostToken() {
    return (process.env.IMAGE_HOST_TOKEN || "").trim();
}

function parseJson(text: string) {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

function extractImageUrl(value: unknown): string | null {
    if (typeof value === "string") return isHttpUrl(value) ? value : null;
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    for (const key of ["url", "src", "path", "image", "markdown", "html"]) {
        const url = firstUrl(record[key]);
        if (url) return url;
    }
    for (const key of ["data", "result", "links", "urls"]) {
        const url = extractImageUrl(record[key]);
        if (url) return url;
    }
    return firstUrl(JSON.stringify(record));
}

function firstUrl(value: unknown): string | null {
    if (typeof value !== "string") return null;
    return value.match(/https?:\/\/[^\s"'<>()[\]]+/)?.[0] || null;
}

function isHttpUrl(value: string) {
    return /^https?:\/\//.test(value);
}

function extractErrorMessage(value: unknown) {
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    return typeof record.message === "string" ? record.message : typeof record.msg === "string" ? record.msg : typeof record.error === "string" ? record.error : "";
}

function rewriteUrlBase(value: string, publicBaseUrl: string) {
    const source = new URL(value);
    const target = new URL(publicBaseUrl);
    target.pathname = source.pathname;
    target.search = source.search;
    target.hash = source.hash;
    return target.toString();
}

function cleanErrorText(value: string) {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}
