"use client";

import { TeamChat } from "@/components/TeamChat";

export function JobChat({ jobId, canWrite, me }: { jobId: string; canWrite: boolean; me: string }) {
  return (
    <TeamChat
      endpoint={`/api/prod/jobs/${jobId}/messages`}
      canWrite={canWrite}
      me={me}
      className="h-[70vh]"
      lockedText="Писать в чат могут только участники этой крупной задачи."
    />
  );
}
