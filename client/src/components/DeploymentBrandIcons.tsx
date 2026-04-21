import React from "react";

type IconProps = {
  className?: string;
};

function SvgWrap({ children, className = "" }: React.PropsWithChildren<IconProps>) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function ReactLogo({ className = "" }: IconProps) {
  return (
    <SvgWrap className={className}>
      <circle cx="32" cy="32" r="4.5" fill="#61DAFB" />
      <ellipse cx="32" cy="32" rx="22" ry="9" stroke="#61DAFB" strokeWidth="2.6" />
      <ellipse cx="32" cy="32" rx="22" ry="9" stroke="#61DAFB" strokeWidth="2.6" transform="rotate(60 32 32)" />
      <ellipse cx="32" cy="32" rx="22" ry="9" stroke="#61DAFB" strokeWidth="2.6" transform="rotate(120 32 32)" />
    </SvgWrap>
  );
}

export function NodeLogo({ className = "" }: IconProps) {
  return (
    <SvgWrap className={className}>
      <path
        d="M32 10.5 49.5 20.5v23L32 53.5 14.5 43.5v-23L32 10.5Z"
        fill="#68A063"
        stroke="#3C873A"
        strokeWidth="2"
      />
      <path
        d="M24 26.5c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8-8-3.6-8-8Z"
        fill="#fff"
        opacity="0.92"
      />
      <path d="M24 26.5h16" stroke="#3C873A" strokeWidth="2.4" strokeLinecap="round" />
    </SvgWrap>
  );
}

export function NextLogo({ className = "" }: IconProps) {
  return (
    <SvgWrap className={className}>
      <circle cx="32" cy="32" r="22" fill="#000" />
      <path d="M22 43V21h5.2l14.6 18.2V21H46v22h-4.8L26.7 24.8V43H22Z" fill="#fff" />
      <path d="M48 22.5v20" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
    </SvgWrap>
  );
}

export function NpmLogo({ className = "" }: IconProps) {
  return (
    <SvgWrap className={className}>
      <rect x="12" y="18" width="40" height="28" rx="4" fill="#CB3837" />
      <path d="M18 24h28v6h-8v10h-6V30h-4v10h-10V24Z" fill="#fff" />
      <path d="M18 40h28" stroke="#fff" strokeWidth="2" opacity="0.7" />
    </SvgWrap>
  );
}

export function YarnLogo({ className = "" }: IconProps) {
  return (
    <SvgWrap className={className}>
      <circle cx="32" cy="32" r="22" fill="#2C8EBB" />
      <path
        d="M27 20.5c3.2 2.2 5.4 5.7 5.4 9.8 0 2.6-.8 4.9-2.2 6.9L36 44"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M38.5 22.5c-3.4 1.6-6.4 4.6-7.9 8.1-1.1 2.5-1.5 5.4-1.1 8.4"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="42" cy="41" r="2.4" fill="#fff" />
    </SvgWrap>
  );
}

export function PnpmLogo({ className = "" }: IconProps) {
  return (
    <SvgWrap className={className}>
      <path d="M14 14h16v16H14z" fill="#F9AD00" />
      <path d="M34 14h16v16H34z" fill="#F9AD00" opacity="0.9" />
      <path d="M14 34h16v16H14z" fill="#EA5A47" opacity="0.95" />
      <path d="M34 34h16v16H34z" fill="#4A90E2" opacity="0.95" />
      <path d="M22 22h20v20H22z" fill="#111" opacity="0.12" />
      <path d="M24 24h16v16H24z" fill="#fff" opacity="0.18" />
    </SvgWrap>
  );
}
