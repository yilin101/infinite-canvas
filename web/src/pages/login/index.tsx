import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App, Button, Card, Form, Input } from "antd";

import { useUserStore } from "@/stores/use-user-store";

export default function LoginPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const login = useUserStore((state) => state.login);
    const [loading, setLoading] = useState(false);
    const searchParams = new URLSearchParams(location.search);
    const from = safeFrom(searchParams.get("from"));

    const submit = async (values: { username: string; password: string }) => {
        setLoading(true);
        try {
            await login(values.username, values.password);
            message.success("登录成功");
            navigate(from, { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="grid min-h-dvh place-items-center bg-stone-100 px-4 py-10 text-stone-950 dark:bg-stone-950 dark:text-stone-50">
            <Card className="w-full max-w-sm" title="登录无限画布">
                <Form layout="vertical" requiredMark={false} onFinish={submit} initialValues={{ username: "admin" }}>
                    <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }]}>
                        <Input autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
                        <Input.Password autoComplete="current-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading}>
                        登录
                    </Button>
                </Form>
            </Card>
        </main>
    );
}

function safeFrom(value: string | null) {
    return value && value.startsWith("/") && !value.startsWith("//") ? value : "/canvas";
}
