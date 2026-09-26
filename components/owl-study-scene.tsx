import { OwlMascot } from "@/components/owl-mascot";

export function OwlStudyScene() {
  return (
    <aside className="owl-hero scroll-reveal mt-8 flex max-w-xl items-center gap-3 rounded-[22px] border border-[#dce5ee] bg-white/80 p-3 shadow-[0_14px_40px_-32px_rgba(20,36,53,0.35)] sm:gap-4 sm:p-4">
      <div
        role="img"
        aria-label="A teal owl in a graduation cap uses a magnifying glass to inspect a highlighted transcript line."
        className="owl-hero__illustration relative flex size-[76px] shrink-0 items-center justify-center sm:size-[92px]"
      >
        <span aria-hidden="true" className="owl-hero__halo absolute inset-0 rounded-full" />
        <OwlMascot size={84} className="relative z-10 size-[76px] sm:size-[92px]" />
        <svg
          aria-hidden="true"
          className="owl-hero__glass absolute -right-1 top-2 z-20 size-9 sm:-right-2 sm:top-3 sm:size-11"
          viewBox="0 0 48 48"
          fill="none"
        >
          <circle cx="19" cy="18" r="12" fill="#DCEEFF" fillOpacity=".7" />
          <circle cx="19" cy="18" r="12" stroke="#2786D7" strokeWidth="3.5" />
          <path d="m28 27 12 13" stroke="#1769AE" strokeWidth="5" strokeLinecap="round" />
          <path d="m14 18 4 4 7-8" stroke="#2786D7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#1f70b7] sm:text-[10px]">
          YOUR LECTURE COMPANION
        </p>
        <p className="mt-1 text-xs font-semibold leading-5 text-[#142435] sm:text-sm">
          Meet the owl who loves a good question.
        </p>
        <p className="mt-1 hidden text-[10px] leading-4 text-[#607184] sm:block">
          Soon, it will help explore ideas right from the transcript.
        </p>
      </div>

      <div aria-hidden="true" className="owl-hero__note hidden w-[86px] shrink-0 rounded-xl border border-[#e4ebf2] bg-white p-2 sm:block">
        <div className="flex items-center justify-between text-[7px] font-semibold text-[#607184]">
          <span>NOTES</span>
          <span>08:42</span>
        </div>
        <div className="mt-2 space-y-1.5">
          <span className="block h-1 w-full rounded-full bg-[#e8edf2]" />
          <span className="block h-1 w-4/5 rounded-full bg-[#e8edf2]" />
          <span className="block h-1.5 w-full rounded-sm bg-[#b9dcf7]" />
        </div>
      </div>
    </aside>
  );
}
