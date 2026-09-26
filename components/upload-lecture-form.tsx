"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LECTURE_UPLOAD_MAX_BYTES } from "@/lib/validation";

const acceptedFormats = new Set(["mp4", "mov", "webm"]);

export function UploadLectureForm({ classId }: { classId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [request, setRequest] = useState<XMLHttpRequest | null>(null);

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") ?? "").trim();
    const file = form.get("video");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a video file to upload.");
      return;
    }
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    if (!acceptedFormats.has(extension)) {
      setError("Choose an MP4, MOV, or WebM video.");
      return;
    }
    if (file.size > LECTURE_UPLOAD_MAX_BYTES) {
      setError("Videos must be 2 GB or smaller.");
      return;
    }
    if (!title || title.length > 120) {
      setError("Enter a title between 1 and 120 characters.");
      return;
    }

    setBusy(true);
    setProgress(0);
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `/api/classes/${classId}/lectures?title=${encodeURIComponent(title)}`,
    );
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.setRequestHeader("X-File-Extension", extension);
    setRequest(request);
    request.upload.onprogress = (uploadEvent) => {
      if (uploadEvent.lengthComputable) {
        setProgress(Math.round((uploadEvent.loaded / uploadEvent.total) * 100));
      }
    };
    request.onload = () => {
      setBusy(false);
      setRequest(null);
      if (request.status < 200 || request.status >= 300) {
        try {
          const result = JSON.parse(request.responseText) as { error?: string };
          setError(result.error || "The upload could not be completed.");
        } catch {
          setError("The upload could not be completed.");
        }
        return;
      }
      setOpen(false);
      setProgress(0);
      formElement.reset();
      router.refresh();
    };
    request.onerror = () => {
      setBusy(false);
      setRequest(null);
      setError("The connection dropped before the upload finished. Please try again.");
    };
    request.onabort = () => {
      setBusy(false);
      setRequest(null);
      setError("The upload was cancelled.");
    };
    request.send(file);
  }

  return <div className="space-y-4">
    <Button type="button" disabled={busy} onClick={() => setOpen((value) => !value)}>
      {open ? <X /> : <Upload />}{open ? "Close upload" : "Upload lecture"}
    </Button>
    {open && <Card className="border-[#c5def3] shadow-none">
      <CardContent className="pt-6">
        <form onSubmit={upload} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium" htmlFor={`lecture-title-${classId}`}>
            Lecture title
            <Input id={`lecture-title-${classId}`} name="title" maxLength={120} required disabled={busy} placeholder="Week 1 — Introduction" />
          </label>
          <label className="block space-y-1.5 text-sm font-medium" htmlFor={`lecture-file-${classId}`}>
            Video file
            <Input id={`lecture-file-${classId}`} name="video" type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" required disabled={busy} className="h-auto py-2" />
          </label>
          <p className="text-xs leading-5 text-muted-foreground">MP4, MOV, or WebM · up to 2 GB and 60 minutes. The video must include audio.</p>
          {busy && <div className="space-y-2" aria-live="polite">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Uploading video</span><span>{progress}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-[#dceeff]"><div className="h-full rounded-full bg-[#2786d7] transition-[width]" style={{ width: `${progress}%` }} /></div>
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? <><LoaderCircle className="animate-spin" />Uploading…</> : <><Upload />Upload and transcribe</>}
            </Button>
            {busy && <Button type="button" variant="outline" onClick={() => request?.abort()}>Cancel upload</Button>}
          </div>
        </form>
      </CardContent>
    </Card>}
  </div>;
}
