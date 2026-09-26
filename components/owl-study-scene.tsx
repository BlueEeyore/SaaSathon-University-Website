import { OwlMascot } from "@/components/owl-mascot";

export function OwlStudyScene() {
  return (
    <aside className="owl-hero scroll-reveal mt-8 flex max-w-xl items-center gap-3 rounded-[22px] border border-[#dce5ee] bg-white/80 p-3 shadow-[0_14px_40px_-32px_rgba(20,36,53,0.35)] sm:gap-4 sm:p-4">
      <div
        role="img"
        aria-label="Howie, the HighlightEd owl mascot."
        className="owl-hero__illustration relative flex h-[106px] w-[76px] shrink-0 items-center justify-center sm:h-[130px] sm:w-[94px]"
      >
        <span aria-hidden="true" className="owl-hero__halo absolute inset-0 rounded-full" />
        <OwlMascot size={130} className="relative z-10 h-[106px] w-auto object-contain sm:h-[130px]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#1f70b7] sm:text-[10px]">
          YOUR LECTURE COMPANION
        </p>
        <p className="mt-1 text-xs font-semibold leading-5 text-[#142435] sm:text-sm">
          Meet Howie, your lecture companion.
        </p>
        <p className="mt-1 hidden text-[10px] leading-4 text-[#607184] sm:block">
          Soon, it will help explore ideas right from the transcript.
        </p>
      </div>

      <div aria-hidden="true" className="owl-hero__note hidden h-[58px] w-[86px] shrink-0 self-center rounded-xl border border-[#e4ebf2] bg-white p-2 sm:block">
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
