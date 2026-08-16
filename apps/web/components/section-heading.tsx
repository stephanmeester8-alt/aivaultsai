import type { ReactNode } from "react";

type SectionHeadingProps = {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  children?: ReactNode;
};

export function SectionHeading({ id, index, eyebrow, title, children }: SectionHeadingProps) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-[11px] tracking-[0.18em] text-gold uppercase">
        {index} / {eyebrow}
      </p>
      <h2 id={id} className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {children ? <div className="mt-4 max-w-2xl text-base leading-relaxed text-mute">{children}</div> : null}
    </div>
  );
}
