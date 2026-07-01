import { NextResponse } from "next/server";

const IMAGE_HOST_UPLOAD_URL = "http://amzimg.bizzlife.top/api/v1/upload";

export async function POST(request: Request) {
    try {
        const incoming = await request.formData();
        const file = incoming.get("image") || incoming.get("file") || incoming.get("upload");
        if (!(file instanceof File)) return NextResponse.json({ message: "请选择要上传的图片" }, { status: 400 });

        const formData = new FormData();
        formData.append("file", file, file.name || "canvas-image.png");

        const response = await fetch(IMAGE_HOST_UPLOAD_URL, {
            method: "POST",
            body: formData,
        });
        const text = await response.text();
        const data = parseJson(text);
        const url = extractImageUrl(data);

        if (!response.ok || !url) {
            return NextResponse.json({ message: extractErrorMessage(data) || text || "上传图床失败" }, { status: response.status || 502 });
        }

        return NextResponse.json({ url, raw: data });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : "上传图床失败" }, { status: 500 });
    }
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
