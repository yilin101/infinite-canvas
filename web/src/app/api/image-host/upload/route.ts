import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { AUTH_COOKIE_NAME, isAuthEnabled, verifySessionToken } from "@/lib/server-auth";

const DEFAULT_IMAGE_HOST_UPLOAD_URL = "http://amzimg.bizzlife.top/api/v1/upload";
const DEFAULT_IMAGE_HOST_FIELD = "file";
const DEFAULT_IMAGE_HOST_METHOD = "POST";

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
        const imageHostConfigError = validateImageHostConfig();
        if (imageHostConfigError) return NextResponse.json({ message: imageHostConfigError }, { status: 400 });

        const uploadUrl = imageHostUploadUrl();
        const response = await uploadToImageHost(uploadUrl, file);
        let text = await response.text();
        let data = parseJson(text);
        let url = extractImageUrl(data);

        if (response.status === 405 && shouldRetryUploadUrl(uploadUrl)) {
            const retryResponse = await uploadToImageHost(`${uploadUrl.replace(/\/+$/, "")}/upload`, file);
            text = await retryResponse.text();
            data = parseJson(text);
            url = extractImageUrl(data);
            if (!retryResponse.ok || !url) return uploadErrorResponse(retryResponse, data, text);
            return NextResponse.json({ url: rewriteUrlBase(url, publicBaseUrl), raw: data });
        }

        if (!response.ok || !url) {
            return uploadErrorResponse(response, data, text);
        }

        return NextResponse.json({ url: rewriteUrlBase(url, publicBaseUrl), raw: data });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : "上传图床失败" }, { status: 500 });
    }
}

function imageHostUploadUrl() {
    return (process.env.IMAGE_HOST_UPLOAD_URL || DEFAULT_IMAGE_HOST_UPLOAD_URL).trim();
}

function imageHostMethod() {
    const method = (process.env.IMAGE_HOST_METHOD || DEFAULT_IMAGE_HOST_METHOD).trim().toUpperCase();
    return ["POST", "PUT", "PATCH"].includes(method) ? method : DEFAULT_IMAGE_HOST_METHOD;
}

function imageHostField() {
    return (process.env.IMAGE_HOST_FIELD || DEFAULT_IMAGE_HOST_FIELD).trim() || DEFAULT_IMAGE_HOST_FIELD;
}

function imageHostToken() {
    return (process.env.IMAGE_HOST_TOKEN || "").trim();
}

function uploadToImageHost(uploadUrl: string, file: File) {
    const formData = new FormData();
    formData.append(imageHostField(), file, file.name || "canvas-image.png");

    const headers = new Headers();
    const token = imageHostToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    return fetch(uploadUrl, {
        method: imageHostMethod(),
        headers,
        body: formData,
    });
}

function validateImageHostConfig() {
    const token = imageHostToken();
    if (hasChinesePlaceholder(token)) return "请把 Docker 里的 IMAGE_HOST_TOKEN 改成真实图床 token，不要填写“你的图床token”这类中文占位文字";
    if (token && !isHeaderSafe(`Bearer ${token}`)) return "IMAGE_HOST_TOKEN 包含请求头不支持的字符，请检查是否粘贴了中文、换行或占位文字";
    return "";
}

function hasChinesePlaceholder(value: string) {
    return /[\u4e00-\u9fff]/.test(value);
}

function isHeaderSafe(value: string) {
    return /^[\t\x20-\x7e\x80-\xff]*$/.test(value);
}

function shouldRetryUploadUrl(uploadUrl: string) {
    try {
        const url = new URL(uploadUrl);
        return /\/api\/v1\/?$/.test(url.pathname);
    } catch {
        return false;
    }
}

function uploadErrorResponse(response: Response, data: unknown, text: string) {
    return NextResponse.json({ message: uploadErrorMessage(response, data, text) }, { status: response.status || 502 });
}

function uploadErrorMessage(response: Response, data: unknown, text: string) {
    const extracted = extractErrorMessage(data);
    if (extracted) return extracted;
    if (response.status === 405) return `图床接口不允许 ${imageHostMethod()} 请求，请检查 IMAGE_HOST_UPLOAD_URL 是否是上传地址`;
    return cleanErrorText(text) || "上传图床失败";
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
    return value
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
}
