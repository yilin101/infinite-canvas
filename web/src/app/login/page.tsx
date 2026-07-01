"use client";

import { App, Button, Form, Input } from "antd";
import { ArrowRight, KeyRound, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useUserStore } from "@/stores/use-user-store";

type LoginForm = {
    username: string;
    password: string;
};

export default function LoginPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const [submitting, setSubmitting] = useState(false);
    const user = useUserStore((state) => state.user);
    const loading = useUserStore((state) => state.loading);
    const login = useUserStore((state) => state.login);

    useEffect(() => {
        if (!loading && user) router.replace(redirectPath());
    }, [loading, router, user]);

    const submit = async (values: LoginForm) => {
        setSubmitting(true);
        try {
            await login(values.username, values.password);
            message.success("登录成功");
            router.replace(redirectPath());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="grid h-dvh overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 text-stone-950 [background-size:16px_16px] md:grid-cols-[1fr_420px] md:items-center md:gap-12 md:px-12 dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)] dark:text-stone-100">
            <section className="mx-auto flex w-full max-w-3xl flex-col justify-center">
                <div className="mb-8 flex items-center gap-3 text-sm font-medium text-stone-600 dark:text-stone-300">
                    <span
                        className="size-8 shrink-0 bg-current"
                        style={{
                            mask: "url(/logo.svg) center / contain no-repeat",
                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                        }}
                    />
                    <span>无限画布</span>
                </div>
                <h1 className="max-w-2xl text-balance text-5xl font-semibold tracking-normal md:text-7xl">进入你的私有创作空间</h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-stone-500 dark:text-stone-400">登录后会自动使用服务器配置的默认 AI 渠道和图像参数，并写入当前浏览器的本地配置。</p>
            </section>

            <section className="mx-auto mt-10 w-full max-w-[420px] rounded-lg border border-stone-200 bg-white/88 p-6 shadow-sm backdrop-blur-xl md:mt-0 dark:border-stone-800 dark:bg-stone-950/80">
                <div className="mb-6">
                    <div className="text-xl font-semibold">账号登录</div>
                    <div className="mt-1 text-sm text-stone-500 dark:text-stone-400">使用 Docker 环境变量中配置的账号。</div>
                </div>
                <Form<LoginForm> layout="vertical" requiredMark={false} onFinish={submit}>
                    <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }]}>
                        <Input size="large" prefix={<UserRound className="mr-1 size-4 text-stone-400" />} autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
                        <Input.Password size="large" prefix={<KeyRound className="mr-1 size-4 text-stone-400" />} autoComplete="current-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" size="large" block loading={submitting} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                        登录
                    </Button>
                </Form>
            </section>
        </main>
    );
}

function redirectPath() {
    if (typeof window === "undefined") return "/canvas";
    const from = new URLSearchParams(window.location.search).get("from");
    return from && from.startsWith("/") && !from.startsWith("//") ? from : "/canvas";
}
