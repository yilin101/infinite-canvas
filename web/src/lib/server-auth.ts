import type { AiConfig, ApiCallFormat, ModelChannel } from "@/stores/use-config-store";

export const AUTH_COOKIE_NAME = "infinite_canvas_session";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

export type ServerUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
};

export type ServerDefaults = {
    version: string;
    config: Partial<AiConfig>;
};

export function isAuthEnabled() {
    return env("APP_AUTH_ENABLED", "true").toLowerCase() !== "false";
}

export function sessionCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: env("APP_AUTH_COOKIE_SECURE", "false").toLowerCase() === "true",
        path: "/",
        maxAge: SESSION_MAX_AGE,
    };
}

export function getServerUser(): ServerUser {
    const username = env("APP_AUTH_USERNAME", "admin");
    return {
        id: username,
        username,
        displayName: env("APP_AUTH_DISPLAY_NAME", username),
        avatarUrl: env("APP_AUTH_AVATAR_URL", ""),
    };
}

export async function createSessionToken(username = getServerUser().username) {
    return `${username}.${await hashText(`${username}.${sessionSecret()}`)}`;
}

export async function verifySessionToken(token?: string | null) {
    if (!isAuthEnabled()) return true;
    if (!token) return false;
    return safeEqual(token, await createSessionToken());
}

export function verifyLogin(username: string, password: string) {
    if (!isAuthEnabled()) return true;
    return safeEqual(username.trim(), getServerUser().username) && safeEqual(password, env("APP_AUTH_PASSWORD", "admin"));
}

export function getServerDefaults(): ServerDefaults {
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

function buildDefaultChannel(): ModelChannel {
    const apiFormat = normalizeApiFormat(env("APP_DEFAULT_API_FORMAT", "openai"));
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

function encodeDefaultModel(model: string, channel: ModelChannel, fallback: string) {
    const value = model.trim() || fallback.split("::").pop() || "";
    if (!value) return "";
    return `${channel.id}::${value}`;
}

function normalizeApiFormat(value: string): ApiCallFormat {
    return value.trim().toLowerCase() === "gemini" ? "gemini" : "openai";
}

function splitList(value: string) {
    return value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function unique(values: string[]) {
    return Array.from(new Set(values));
}

function defaultConfigVersion(config: Partial<AiConfig>) {
    const version = env("APP_DEFAULT_CONFIG_VERSION", "auto");
    return `${version}-${hashString(JSON.stringify(config))}`;
}

function hashString(value: string) {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    return (hash >>> 0).toString(36);
}

function env(key: string, fallback = "") {
    return (process.env[key] || fallback).trim();
}

async function hashText(value: string) {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
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
