import Image from "next/image";

type OwlMascotProps = {
  className?: string;
  size?: number;
};

export function OwlMascot({ className, size = 44 }: OwlMascotProps) {
  return (
    <Image
      src="/highlighted-owl.png"
      alt=""
      aria-hidden="true"
      className={className}
      width={Math.round(size * 0.722)}
      height={size}
    />
  );
}
