interface BrandLogoProps {
  size?: number;
  variant?: 'light' | 'dark';
}

export function BrandLogo({ size = 36, variant = 'light' }: BrandLogoProps) {
  const bg = variant === 'light' ? '#1D4E89' : '#0F1D36';
  const stroke = '#FFFFFF';
  const accent = '#60A5FA';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="40" height="40" rx="10" fill={bg} />
      <path
        d="M8 14.5C8 13.3954 8.89543 12.5 10 12.5H23V25.5H8V14.5Z"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M23 16.5H28.5L32 20.5V25.5H23V16.5Z"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M11.5 17H19.5M11.5 21H17" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      <circle cx="13.5" cy="27.5" r="2.75" fill={bg} stroke={stroke} strokeWidth="2" />
      <circle cx="27.5" cy="27.5" r="2.75" fill={bg} stroke={stroke} strokeWidth="2" />
    </svg>
  );
}
