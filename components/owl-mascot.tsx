type OwlMascotProps = {
  className?: string;
  size?: number;
};

export function OwlMascot({ className, size = 44 }: OwlMascotProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Blue tassel behind the cap */}
      <path
        d="M78 22v21m0 0-3 12m3-12 3 12"
        stroke="#2786D7"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <circle cx="78" cy="44" r="3.3" fill="#2786D7" />

      {/* Tufts, body, and wings */}
      <path
        d="m19 36-8-14 19 8m47 6 8-14-19 8"
        fill="#0E5967"
        stroke="#0A4653"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 57c0-22 14-37 34-37s34 15 34 37v9c0 17-15 27-34 27S14 83 14 66v-9Z"
        fill="#0E5967"
        stroke="#0A4653"
        strokeWidth="2.5"
      />
      <path d="M18 60c-5 2-8 8-8 17 7 0 12-3 16-9m52-8c5 2 8 8 8 17-7 0-12-3-16-9" fill="#0A4D5A" />

      {/* Pale face and feathered chest */}
      <path d="M25 51c0-10 7-17 16-17 6 0 11 3 15 8 3-5 8-8 14-8 9 0 16 7 16 17 0 8-6 14-14 16-3-8-9-13-17-13s-14 5-17 13c-8-2-13-8-13-16Z" fill="#DCEBFA" />
      <path d="M28 70c0-10 9-17 20-17s20 7 20 17-9 18-20 18-20-8-20-18Z" fill="#C8DDF1" />
      <path d="M37 67c3 3 7 3 10 0m5 0c3 3 7 3 10 0M35 76c3 3 7 3 10 0m7 0c3 3 7 3 10 0" stroke="#8BAAC4" strokeWidth="2" strokeLinecap="round" />

      {/* Big round eyes */}
      <circle cx="40" cy="51" r="12" fill="#F7FAFE" />
      <circle cx="66" cy="51" r="12" fill="#F7FAFE" />
      <circle cx="40" cy="51" r="8.7" fill="#4A91D0" />
      <circle cx="66" cy="51" r="8.7" fill="#4A91D0" />
      <circle cx="41" cy="52" r="6.2" fill="#171316" />
      <circle cx="65" cy="52" r="6.2" fill="#171316" />
      <circle cx="39" cy="49" r="2.2" fill="white" />
      <circle cx="63" cy="49" r="2.2" fill="white" />
      <path d="m53 59 5 6-5 6-5-6 5-6Z" fill="#4A91D0" />

      {/* Blue feet */}
      <path d="M34 88v4m7-4v4m7-4v4m14-4v4m7-4v4m7-4v4" stroke="#2786D7" strokeWidth="5.5" strokeLinecap="round" />

      {/* Dark graduation cap, layered over the head */}
      <path d="m8 24 45-18 39 18-41 19L8 24Z" fill="#211719" />
      <path d="M24 26v10c0 6 13 11 29 11 13 0 23-4 25-9V27L52 37 24 26Z" fill="#2C2021" />
      <path d="M8 24 52 42l40-18" stroke="#39292A" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
