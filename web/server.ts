import { existsSync } from "node:fs";
import { join, normalize } from "node:path";

const AUTH_COOKIE_NAME = "infinite_canvas_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_IMAGE_HOST_UPLOAD_URL = "https://amzimg.bizzlife.top/api/v1/upload";
const DEFAULT_IMAGE_HOST_FIELD = "file";
const DEFAULT_IMAGE_HOST_METHOD = "POST";
const distRoot = join(import.meta.dir, "dist");

Bun.serve({
    port: Number(env("PORT", "3000")),
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request);
        if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout();
        if (url.pathname === "/api/auth/session" && request.method === "GET") return session(request);
        if (url.pathname === "/api/image-host/upload" && request.method === "POST") return uploadImageHost(request);
        if (url.pathname.startsWith("/api/")) return json({ message: "接口不存在" }, 404);
        return staticFile(url.pathname);
    },
});

async function login(request: Request) {
    const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
    if (!verifyLogin(body.username || "", body.password || "")) return json({ message: "账号或密码不正确" }, 401);
    return json({ user: getServerUser(), defaults: getServerDefaults() }, 200, { "Set-Cookie": cookie(AUTH_COOKIE_NAME, await createSessionToken(), SESSION_MAX_AGE) });
}

function logout() {
    return json({ ok: true }, 200, { "Set-Cookie": cookie(AUTH_COOKIE_NAME, "", 0) });
}

async function session(request: Request) {
    const authenticated = !isAuthEnabled() || (await verifySessionToken(parseCookies(request.headers.get("cookie")).get(AUTH_COOKIE_NAME)));
    if (!authenticated) return json({ user: null }, 401);
    return json({ user: getServerUser(), defaults: getServerDefaults() });
}

async function uploadImageHost(request: Request) {
    try {
        if (isAuthEnabled() && !(await verifySessionToken(parseCookies(request.headers.get("cookie")).get(AUTH_COOKIE_NAME)))) return json({ message: "请先登录" }, 401);
        const incoming = await request.formData();
        const file = incoming.get("image") || incoming.get("file") || incoming.get("upload");
        if (!(file instanceof File)) return json({ message: "请选择要上传的图片" }, 400);
        const publicDomain = String(incoming.get("publicBaseUrl") || "").trim();
        if (!publicDomain) return json({ message: "请先在配置里填写图床根域名" }, 400);
        const publicBaseUrl = createPublicBaseUrl(publicDomain);
        if (!publicBaseUrl) return json({ message: "图床根域名格式不正确，只需要填写 brp2o0stwv.xin 这类域名" }, 400);
        const configError = validateImageHostConfig();
        if (configError) return json({ message: configError }, 400);

        const uploadResult = await uploadToImageHost(imageHostUploadUrl(), file);
        let text = await uploadResult.response.text();
        let data = parseJson(text);
        let url = extractImageUrl(data);
        if (uploadResult.response.status === 405 && shouldRetryUploadUrl(uploadResult.uploadUrl)) {
            const retryResult = await uploadToImageHost(`${uploadResult.uploadUrl.replace(/\/+$/, "")}/upload`, file);
            text = await retryResult.response.text();
            data = parseJson(text);
            url = extractImageUrl(data);
            if (!retryResult.response.ok || !url) return uploadErrorResponse(retryResult.response, data, text, retryResult.uploadUrl);
            return json({ url: rewriteUrlBase(url, publicBaseUrl), raw: data });
        }
        if (!uploadResult.response.ok || !url) return uploadErrorResponse(uploadResult.response, data, text, uploadResult.uploadUrl);
        return json({ url: rewriteUrlBase(url, publicBaseUrl), raw: data });
    } catch (error) {
        return json({ message: error instanceof Error ? error.message : "上传图床失败" }, 500);
    }
}

function staticFile(pathname: string) {
    const cleanPath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
    const target = cleanPath === "/" || cleanPath === "." ? join(distRoot, "index.html") : join(distRoot, cleanPath);
    if (target.startsWith(distRoot) && existsSync(target)) return new Response(Bun.file(target));
    return new Response(Bun.file(join(distRoot, "index.html")));
}

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
    return Response.json(value, { status, headers });
}

function cookie(name: string, value: string, maxAge: number) {
    const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
    if (env("APP_AUTH_COOKIE_SECURE", "false").toLowerCase() === "true") parts.push("Secure");
    return parts.join("; ");
}

function parseCookies(value: string | null) {
    const cookies = new Map<string, string>();
    (value || "").split(";").forEach((part) => {
        const index = part.indexOf("=");
        if (index > -1) cookies.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
    });
    return cookies;
}

function isAuthEnabled() {
    return env("APP_AUTH_ENABLED", "true").toLowerCase() !== "false";
}

function getServerUser() {
    const username = env("APP_AUTH_USERNAME", "admin");
    return { id: username, username, displayName: env("APP_AUTH_DISPLAY_NAME", username), avatarUrl: env("APP_AUTH_AVATAR_URL", "") };
}

async function createSessionToken(username = getServerUser().username) {
    return `${username}.${await hashText(`${username}.${sessionSecret()}`)}`;
}

async function verifySessionToken(token?: string | null) {
    if (!isAuthEnabled()) return true;
    return Boolean(token) && safeEqual(token, await createSessionToken());
}

function verifyLogin(username: string, password: string) {
    if (!isAuthEnabled()) return true;
    return safeEqual(username.trim(), getServerUser().username) && safeEqual(password, env("APP_AUTH_PASSWORD", "admin"));
}

function getServerDefaults() {
    const channel = buildDefaultChannel();
    const models = channel.models.map((model) => `${channel.id}::${model}`);
    const imageModel = encodeDefaultModel(env("APP_DEFAULT_IMAGE_MODEL", ""), channel, models[0] || "");
    const videoModel = encodeDefaultModel(env("APP_DEFAULT_VIDEO_MODEL", ""), channel, models[1] || imageModel);
    const textModel = encodeDefaultModel(env("APP_DEFAULT_TEXT_MODEL", ""), channel, models[2] || imageModel);
    const audioModel = encodeDefaultModel(env("APP_DEFAULT_AUDIO_MODEL", ""), channel, models[3] || textModel);
    const config = {
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: channel.apiFormat,
        channels: [channel],
        models,
        imageModels: imageModel ? [imageModel] : [],
        videoModels: videoModel ? [videoModel] : [],
        textModels: textModel ? [textModel] : [],
        audioModels: audioModel ? [audioModel] : [],
        model: imageModel || models[0] || "",
        imageModel,
        videoModel,
        textModel,
        audioModel,
        quality: env("APP_DEFAULT_IMAGE_QUALITY", ""),
        size: env("APP_DEFAULT_IMAGE_SIZE", ""),
        count: env("APP_DEFAULT_IMAGE_COUNT", ""),
        canvasImageCount: env("APP_DEFAULT_CANVAS_IMAGE_COUNT", ""),
        videoSeconds: env("APP_DEFAULT_VIDEO_SECONDS", ""),
        vquality: env("APP_DEFAULT_VIDEO_QUALITY", ""),
        videoGenerateAudio: env("APP_DEFAULT_VIDEO_GENERATE_AUDIO", ""),
        videoWatermark: env("APP_DEFAULT_VIDEO_WATERMARK", ""),
        audioVoice: env("APP_DEFAULT_AUDIO_VOICE", ""),
        audioFormat: env("APP_DEFAULT_AUDIO_FORMAT", ""),
        audioSpeed: env("APP_DEFAULT_AUDIO_SPEED", ""),
        audioInstructions: env("APP_DEFAULT_AUDIO_INSTRUCTIONS", ""),
        systemPrompt: env("APP_DEFAULT_SYSTEM_PROMPT", ""),
    };
    return { version: defaultConfigVersion(config), config };
}

function buildDefaultChannel() {
    const apiFormat = env("APP_DEFAULT_API_FORMAT", "openai").toLowerCase() === "gemini" ? "gemini" : "openai";
    const imageModel = env("APP_DEFAULT_IMAGE_MODEL", "gpt-image-2");
    const videoModel = env("APP_DEFAULT_VIDEO_MODEL", "grok-imagine-video");
    const textModel = env("APP_DEFAULT_TEXT_MODEL", "gpt-5.5");
    const audioModel = env("APP_DEFAULT_AUDIO_MODEL", "gpt-4o-mini-tts");
    return {
        id: "default",
        name: env("APP_DEFAULT_CHANNEL_NAME", "默认渠道"),
        baseUrl: env("APP_DEFAULT_API_BASE_URL", apiFormat === "gemini" ? GEMINI_BASE_URL : OPENAI_BASE_URL),
        apiKey: env("APP_DEFAULT_API_KEY", ""),
        apiFormat,
        models: unique([env("APP_DEFAULT_MODELS", ""), imageModel, videoModel, textModel, audioModel].flatMap(splitList)),
    };
}

function encodeDefaultModel(model: string, channel: { id: string }, fallback: string) {
    const value = model.trim() || fallback.split("::").pop() || "";
    return value ? `${channel.id}::${value}` : "";
}

function imageHostUploadUrl() {
    return env("IMAGE_HOST_UPLOAD_URL", DEFAULT_IMAGE_HOST_UPLOAD_URL);
}

function imageHostMethod() {
    const method = env("IMAGE_HOST_METHOD", DEFAULT_IMAGE_HOST_METHOD).toUpperCase();
    return ["POST", "PUT", "PATCH"].includes(method) ? method : DEFAULT_IMAGE_HOST_METHOD;
}

function imageHostField() {
    return env("IMAGE_HOST_FIELD", DEFAULT_IMAGE_HOST_FIELD) || DEFAULT_IMAGE_HOST_FIELD;
}

function imageHostToken() {
    return env("IMAGE_HOST_TOKEN", "");
}

async function uploadToImageHost(uploadUrl: string, file: File, redirectCount = 0): Promise<{ response: Response; uploadUrl: string }> {
    const formData = new FormData();
    formData.append(imageHostField(), file, file.name || "canvas-image.png");
    const headers = new Headers();
    const token = imageHostToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(uploadUrl, { method: imageHostMethod(), headers, body: formData, redirect: "manual" });
    const location = response.headers.get("location");
    if (location && [301, 302, 303, 307, 308].includes(response.status) && redirectCount < 3) return uploadToImageHost(new URL(location, uploadUrl).toString(), file, redirectCount + 1);
    return { response, uploadUrl };
}

function validateImageHostConfig() {
    const token = imageHostToken();
    if (/[\u4e00-\u9fff]/.test(token)) return "请把 Docker 里的 IMAGE_HOST_TOKEN 改成真实图床 token，不要填写“你的图床token”这类中文占位文字";
    if (token && !/^[\t\x20-\x7e\x80-\xff]*$/.test(`Bearer ${token}`)) return "IMAGE_HOST_TOKEN 包含请求头不支持的字符，请检查是否粘贴了中文、换行或占位文字";
    return "";
}

function uploadErrorResponse(response: Response, data: unknown, text: string, uploadUrl: string) {
    return json({ message: uploadErrorMessage(response, data, text, uploadUrl) }, response.status || 502);
}

function uploadErrorMessage(response: Response, data: unknown, text: string, uploadUrl: string) {
    const extracted = extractErrorMessage(data);
    if (extracted) return extracted;
    if (response.status === 405 && imageHostUploadUrl().startsWith("http://")) return "图床接口不允许当前请求，请把 IMAGE_HOST_UPLOAD_URL 改成 https:// 开头，避免 http 跳转导致 POST 变成 GET";
    if (response.status === 405) return `图床接口不允许 ${imageHostMethod()} 请求。当前请求地址：${uploadUrl}，请确认 IMAGE_HOST_UPLOAD_URL 是真实上传地址`;
    return cleanErrorText(text) || "上传图床失败";
}

function createPublicBaseUrl(value: string) {
    const host = normalizePublicHost(value);
    return host ? `https://${host}` : "";
}

function normalizePublicHost(value: string) {
    try {
        const url = new URL(/^[a-z][a-z\d+\-.]*:\/\//i.test(value.trim()) ? value.trim() : `http://${value.trim()}`);
        const host = url.hostname.trim().toLowerCase();
        return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host) ? host : "";
    } catch {
        return "";
    }
}

function rewriteUrlBase(value: string, publicBaseUrl: string) {
    const source = new URL(value);
    const target = new URL(publicBaseUrl);
    target.pathname = source.pathname;
    target.search = source.search;
    target.hash = source.hash;
    return target.toString();
}

function extractImageUrl(value: unknown): string | null {
    if (typeof value === "string") return /^https?:\/\//.test(value) ? value : firstUrl(value);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    for (const key of ["url", "src", "path", "image", "markdown", "html", "data", "result", "links", "urls"]) {
        const url = extractImageUrl(record[key]);
        if (url) return url;
    }
    return firstUrl(JSON.stringify(record));
}

function firstUrl(value: unknown) {
    return typeof value === "string" ? value.match(/https?:\/\/[^\s"'<>()[\]]+/)?.[0] || null : null;
}

function extractErrorMessage(value: unknown) {
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    return typeof record.message === "string" ? record.message : typeof record.msg === "string" ? record.msg : typeof record.error === "string" ? record.error : "";
}

function parseJson(text: string) {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

function shouldRetryUploadUrl(uploadUrl: string) {
    try {
        return /\/api\/v1\/?$/.test(new URL(uploadUrl).pathname);
    } catch {
        return false;
    }
}

function cleanErrorText(value: string) {
    return value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

function splitList(value: string) {
    return value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
}

function unique(values: string[]) {
    return Array.from(new Set(values));
}

function defaultConfigVersion(config: object) {
    return `${env("APP_DEFAULT_CONFIG_VERSION", "auto")}-${hashString(JSON.stringify(config))}`;
}

function hashString(value: string) {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    return (hash >>> 0).toString(36);
}

async function hashText(value: string) {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sessionSecret() {
    return env("APP_AUTH_SECRET", env("APP_AUTH_PASSWORD", "infinite-canvas"));
}

function safeEqual(left: string, right: string) {
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return diff === 0;
}

function env(key: string, fallback = "") {
    return (process.env[key] || fallback).trim();
}
