import { Captions, CirclePlay, MessageSquareText } from "lucide-react";

const moments = [
  {
    time: "08:42",
    title: "The signal begins",
    text: "A receptor catches the signal at the surface of the cell.",
  },
  {
    time: "12:18",
    title: "The message moves",
    text: "A chain of proteins carries the message inward, one step at a time.",
  },
  {
    time: "16:06",
    title: "The idea clicks",
    text: "Each step amplifies the original message, helping the cell respond.",
  },
];

export function TranscriptStory() {
  return (
    <section
      aria-labelledby="story-title"
      className="transcript-story relative bg-[#142435] text-white"
    >
      <div className="transcript-story__stage mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
        <div className="transcript-story__copy">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a9d2f6]">
            ONE MOMENT AT A TIME
          </p>
          <h2
            id="story-title"
            className="mt-5 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.06em] sm:text-5xl lg:text-6xl"
          >
            Stay with the idea as it unfolds.
          </h2>
          <p className="mt-6 max-w-md text-sm leading-7 text-white/65 sm:text-base">
            The transcript follows the lecture, so every explanation and
            question stays close to the moment that sparked it.
          </p>
          <div className="mt-9 flex items-center gap-3 text-sm text-white/70">
            <span className="flex size-10 items-center justify-center rounded-full bg-white/10 text-[#a9d2f6]">
              <Captions className="size-5" />
            </span>
            Synced to the lecture, from start to finish
          </div>
        </div>

        <div className="transcript-story__visual relative mx-auto w-full max-w-2xl">
          <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[#1c3045] shadow-[0_40px_100px_-50px_rgba(0,0,0,0.8)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  BIO 204 · WEEK 03
                </p>
                <p className="mt-1 text-sm font-medium text-white/90">
                  Cell signalling pathways
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] text-[#a9d2f6]">
                Lecture notes
              </span>
            </div>

            <div className="px-5 pb-6 pt-6 sm:px-7 sm:pb-8">
              <div className="relative mb-7 flex aspect-[2.3] items-center justify-center overflow-hidden rounded-2xl bg-[#0e1a28]">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_42%,rgba(73,140,197,0.32),transparent_42%),radial-gradient(ellipse_at_30%_100%,rgba(58,99,133,0.3),transparent_45%)]"
                />
                <div
                  aria-hidden="true"
                  className="absolute right-[28%] top-[20%] size-24 rounded-full border border-white/15 sm:size-32"
                />
                <div
                  aria-hidden="true"
                  className="absolute right-[35%] top-[29%] size-12 rounded-full border border-white/20 sm:size-16"
                />
                <span className="relative flex size-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur">
                  <CirclePlay className="size-6" />
                </span>
                <span className="absolute bottom-3 left-4 text-[10px] text-white/65">
                  08:42 <span className="mx-1.5">/</span> 38:16
                </span>
                <div className="absolute bottom-[18px] left-[22%] right-4 h-px bg-white/25">
                  <div className="story-progress h-full w-full origin-left scale-x-0 bg-[#9ac9f1]" />
                  <span className="absolute -top-[3px] left-[23%] size-1.5 rounded-full bg-white" />
                </div>
              </div>

              <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                <span className="size-1.5 rounded-full bg-[#8bc2f2]" />
                TRANSCRIPT
              </div>
              <div className="space-y-2">
                {moments.map((moment, index) => (
                  <article
                    key={moment.time}
                    className={`story-moment story-moment--${index + 1} flex gap-3 rounded-xl border border-white/[0.06] px-3 py-3 sm:gap-4 sm:px-4`}
                  >
                    <span className="pt-0.5 text-[10px] font-medium tabular-nums text-[#a9d2f6]">
                      {moment.time}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-white/90 sm:text-sm">
                        {moment.title}
                      </h3>
                      <p className="mt-1 text-[11px] leading-5 text-white/55 sm:text-xs">
                        {moment.text}
                      </p>
                    </div>
                    {index === 2 && (
                      <MessageSquareText className="ml-auto mt-0.5 size-4 shrink-0 text-[#a9d2f6]" />
                    )}
                  </article>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 -right-3 hidden items-center gap-3 rounded-2xl border border-white/10 bg-[#20374e] px-4 py-3 text-xs text-white/75 shadow-xl sm:flex sm:items-center sm:gap-2">
            <MessageSquareText className="size-4 text-[#a9d2f6]" />
            A question, right where it belongs
          </div>
        </div>
      </div>
    </section>
  );
}
