"use client";

export async function uploadImageToHost(file: Blob, filename = "canvas-image.png") {
    const formData = new FormData();
    formData.append("image", file, filename);

    const response = await fetch("/api/image-host/upload", {
        method: "POST",
        body: formData,
    });
    const data = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
    if (!response.ok || !data?.url) throw new Error(data?.message || "上传图床失败");
    return data.url;
}
