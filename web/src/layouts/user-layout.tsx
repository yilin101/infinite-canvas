import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AgentPanel } from "@/components/agent/agent-panel";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { useUserStore } from "@/stores/use-user-store";

export default function UserLayout({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const user = useUserStore((state) => state.user);
    const loading = useUserStore((state) => state.loading);

    useEffect(() => {
        if (!loading && !user) navigate(`/login?from=${encodeURIComponent(`${location.pathname}${location.search}`)}`, { replace: true });
    }, [loading, location.pathname, location.search, navigate, user]);

    if (loading || !user) return <div className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">正在检查登录状态...</div>;

    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            <AgentPanel />
        </div>
    );
}
