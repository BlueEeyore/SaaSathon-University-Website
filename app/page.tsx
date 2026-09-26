import Link from "next/link";
import {
  ArrowRight,
  Captions,
  CirclePlay,
  MessageSquareText,
  UsersRound,
} from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { Button } from "@/components/ui/button";
import { TranscriptStory } from "@/components/transcript-story";
import { OwlStudyScene } from "@/components/owl-study-scene";

const features = [
  {
    icon: CirclePlay,
    number: "01",
    title: "Watch together",
    body: "Lecture recordings with a transcript that keeps pace, so it is easy to follow along.",
  },
  {
    icon: Captions,
    number: "02",
    title: "Find the moment",
    body: "Jump to the part you need with searchable, time-aligned captions.",
  },
  {
    icon: MessageSquareText,
    number: "03",
    title: "Learn out loud",
    body: "Highlight an idea, ask a question, and keep the conversation with the lecture.",
  },
];

export default function Home() {
  return (
    <main id="main" className="min-h-screen overflow-clip bg-[#f5f8fb] text-[#142435]">
      <header className="relative z-10 w-full">
        <div className="relative mx-auto flex h-[64px] max-w-7xl items-center justify-between px-5 sm:h-[72px] sm:px-8">
          <Link href="/" aria-label="HighlightEd home" className="relative z-10">
            <BrandWordmark />
          </Link>
          <nav className="relative z-10 flex items-center gap-3">
            <a
              href="#how-it-works"
              className="hidden px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block"
            >
              How it works
            </a>
            <Button asChild size="sm" className="h-10 rounded-full px-5">
              <Link href="/login">
                Sign in <ArrowRight />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-start gap-12 px-5 pb-24 pt-4 sm:px-8 sm:pb-32 sm:pt-6 lg:min-h-[calc(100svh-72px)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="scroll-reveal relative z-10">
          <BadgeLine />
          <h1 className="mt-6 max-w-3xl text-[clamp(3rem,5vw,5.5rem)] font-semibold leading-[0.97] tracking-[-0.065em]">
            Make every
            <br />
            <span className="text-[#2786d7]">lecture click.</span>
          </h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-[#607184] sm:text-lg sm:leading-8">
            A quieter, clearer place to watch your lectures, follow along with
            transcripts, and ask the question you have been holding onto.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="xl" className="h-12 rounded-full px-6">
              <Link href="/login">
                Get started <ArrowRight />
              </Link>
            </Button>
            <a
              href="#how-it-works"
              className="rounded-full px-5 py-3 text-sm font-medium text-[#1f70b7] hover:bg-white"
            >
              See how it works
            </a>
          </div>
          <OwlStudyScene />
        </div>

        <div className="scroll-reveal relative mx-auto w-full max-w-[570px] lg:ml-auto">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-20 size-[500px] rounded-full bg-[#eaf3fb] blur-3xl"
          />
          <div className="relative rounded-[30px] border border-white bg-white p-3 shadow-[0_35px_100px_-50px_rgba(35,55,40,0.32)] sm:p-5">
            <div className="overflow-hidden rounded-[22px] bg-[#eef3f8]">
              <div className="flex items-center justify-between border-b border-black/[0.05] bg-white px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#607184]">
                    BIO 204 · WEEK 03
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Cell signalling pathways
                  </p>
                </div>
                <span className="rounded-full bg-[#eaf3fb] px-3 py-1 text-[10px] font-medium text-[#1f70b7]">
                  Transcript on
                </span>
              </div>
              <div className="relative flex aspect-[1.72] items-center justify-center overflow-hidden bg-[#142435]">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_22%,rgba(206,224,204,0.26),transparent_32%),radial-gradient(ellipse_at_21%_85%,rgba(133,167,137,0.22),transparent_40%)]"
                />
                <div
                  aria-hidden="true"
                  className="absolute right-[14%] top-[18%] size-40 rounded-full border border-white/10"
                />
                <div
                  aria-hidden="true"
                  className="absolute right-[20%] top-[25%] size-28 rounded-full border border-white/10"
                />
                <span className="relative flex size-14 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur">
                  <CirclePlay className="size-7" />
                </span>
                <span className="absolute bottom-4 left-4 text-xs font-medium text-white/75">
                  08:42 <span className="mx-2">/</span> 38:16
                </span>
                <div className="absolute bottom-5 left-[22%] right-5 h-1 rounded-full bg-white/25">
                  <div className="h-full w-[23%] rounded-full bg-[#8bb9e2]" />
                </div>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#607184]">
                  <span className="size-1.5 rounded-full bg-[#2786d7]" />
                  FOLLOWING TRANSCRIPT
                </div>
                <p className="text-xs leading-6 text-[#607184]">
                  The cell receives a signal through a receptor on its surface.
                  That signal is then carried through a series of proteins...
                </p>
                <p className="rounded-lg bg-[#dceeff] px-3 py-2.5 text-xs leading-5 text-[#142435]">
                  <span className="mr-2 font-semibold text-[#1f70b7]">
                    08:42
                  </span>
                  Each step amplifies the original message, allowing the cell
                  to respond with precision.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="flex size-6 items-center justify-center rounded-full bg-[#b7d5ef] text-[9px] font-semibold text-[#1f70b7]">
                    M
                  </span>
                  <p className="text-[10px] text-[#607184]">
                    “Amplifies the original message”
                  </p>
                  <MessageSquareText className="ml-auto size-3.5 text-[#607184]" />
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-5 hidden items-center gap-3 rounded-2xl border border-white bg-white px-4 py-3 shadow-lg sm:flex">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#dceeff] text-[#1f70b7]">
              <Captions className="size-4" />
            </span>
            <div>
              <p className="text-xs font-semibold">Always in sync</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Transcript follows playback
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label="A better way to learn"
        className="flex min-h-[88svh] items-center justify-center bg-white px-6 py-24 text-center sm:min-h-screen"
      >
        <div className="scroll-reveal max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1f70b7]">
            LEARN IN CONTEXT
          </p>
          <h2 className="mt-8 text-[clamp(3rem,8.5vw,8rem)] font-semibold leading-[0.96] tracking-[-0.075em]">
            A lecture is more than a recording.
          </h2>
          <p className="mx-auto mt-8 max-w-xl text-base leading-7 text-[#607184] sm:text-lg sm:leading-8">
            Keep the words, the moment, and the question together.
          </p>
        </div>
      </section>

      <section
        id="how-it-works"
        className="border-y border-black/[0.05] bg-[#f5f8fb] py-20 sm:py-28"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="scroll-reveal flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f70b7]">
                LEARN IN CONTEXT
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Everything around the lecture.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              Your class, recordings, transcripts, and conversations live
              together.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, number, title, body }) => (
              <article
                key={number}
                className="scroll-reveal rounded-2xl border border-[#dce5ee] bg-white p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-[#dceeff] text-[#1f70b7]">
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="text-xs font-medium text-[#607184]">
                    {number}
                  </span>
                </div>
                <h3 className="mt-8 text-base font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <TranscriptStory />

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="scroll-reveal relative overflow-hidden rounded-[28px] bg-[#eaf3fb] px-6 py-10 sm:px-12 sm:py-14">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-40 size-[430px] rounded-full border border-[#c5def3]"
          />
          <div
            aria-hidden="true"
            className="absolute -right-4 -top-32 size-[330px] rounded-full border border-[#c5def3]"
          />
          <div className="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#526779]">
                READY WHEN YOU ARE
              </p>
              <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                A better way to stay with the lesson.
              </h2>
            </div>
            <Button
              asChild
              size="xl"
              className="shrink-0 rounded-full bg-[#2786d7] px-6 hover:bg-[#1f70b7]"
            >
              <Link href="/login">
                Sign in to your class <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/[0.06] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Link href="/" className="text-[#142435]">
            <BrandWordmark />
          </Link>
          <span>Learn together. Remember more.</span>
        </div>
      </footer>
    </main>
  );
}

function BadgeLine() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[#dfe7e0] bg-white/70 px-3 py-1.5 text-[11px] font-medium text-[#1f70b7]">
      <UsersRound className="size-3.5" />A shared space for every class
    </div>
  );
}
