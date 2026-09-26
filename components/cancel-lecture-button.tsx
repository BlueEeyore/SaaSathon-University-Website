"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { cancelQueuedLecture } from "@/app/classes/actions";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/validation";

export function CancelLectureButton({
  lectureId,
  lectureTitle,
}: {
  lectureId: string;
  lectureTitle: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(cancelQueuedLecture, {});

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Cancel “${lectureTitle}” and permanently remove its uploaded video?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="lectureId" value={lectureId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="text-destructive hover:bg-red-50 hover:text-destructive">
        {pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
        {pending ? "Removing…" : "Cancel lecture"}
      </Button>
    </form>
    {state.error && <p role="alert" className="max-w-52 text-right text-xs text-destructive">{state.error}</p>}
  </div>;
}
