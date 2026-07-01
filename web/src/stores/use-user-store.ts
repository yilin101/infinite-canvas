"use client";

import { create } from "zustand";

import type { AiConfig } from "@/stores/use-config-store";
import { useConfigStore } from "@/stores/use-config-store";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
};

type SessionDefaults = {
    version?: string;
    config?: Partial<AiConfig>;
};

type UserStore = {
    user: LocalUser | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshSession: () => Promise<void>;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    loading: true,
    login: async (username, password) => {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        const data = (await response.json().catch(() => ({}))) as { user?: LocalUser; defaults?: SessionDefaults; message?: string };
        if (!response.ok || !data.user) throw new Error(data.message || "登录失败");
        applySessionDefaults(data.defaults, true);
        set({ user: data.user, loading: false });
    },
    logout: async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        set({ user: null, loading: false });
        window.location.href = "/login";
    },
    refreshSession: async () => {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { user?: LocalUser; defaults?: SessionDefaults };
        if (!response.ok || !data.user) {
            set({ user: null, loading: false });
            return;
        }
        applySessionDefaults(data.defaults, false);
        set({ user: data.user, loading: false });
    },
    clearSession: () => set({ user: null }),
}));

function applySessionDefaults(defaults: SessionDefaults | undefined, force: boolean) {
    const config = defaults?.config;
    if (!config) return;
    const configStore = useConfigStore.getState();
    const version = defaults.version || "";
    if (!force && version && version === configStore.serverDefaultConfigVersion) return;
    if (!force && !version && configStore.config.channels.some((channel) => channel.apiKey.trim())) return;
    configStore.applyDefaultConfig(config, version);
}
