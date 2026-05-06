"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PhotoUploadForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState("idle");

  async function upload(formData: FormData) {
    setStatus("uploading");
    const response = await fetch(`/api/jobs/${jobId}/photos`, { method: "POST", body: formData });
    setStatus(response.ok ? "saved" : "error");
    if (response.ok) router.refresh();
  }

  return (
    <form action={upload} className="space-y-3">
      <select name="photo_type" className="w-full rounded-md border px-3 py-2 text-sm" defaultValue="before">
        <option value="before">Before</option>
        <option value="during">During</option>
        <option value="after">After</option>
        <option value="evidence">Evidence</option>
      </select>
      <input name="file" type="file" accept="image/*" className="w-full text-sm" required />
      <Button type="submit" disabled={status === "uploading"}>{status === "uploading" ? "Uploading..." : "Upload Photo"}</Button>
      {status === "saved" && <p className="text-xs text-green-700">Photo uploaded.</p>}
      {status === "error" && <p className="text-xs text-red-600">Upload failed.</p>}
    </form>
  );
}
