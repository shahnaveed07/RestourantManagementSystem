import React from 'react';

const SIZE_CLASSES = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-14 h-14 rounded-xl',
  xl: 'w-20 h-20 rounded-2xl',
};

export function BrandLogo({ size = 'md', className = '' }) {
  const boxClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <span
      className={`inline-flex items-center justify-center bg-white border border-slate-200/90 overflow-hidden shrink-0 shadow-xs ${boxClass} ${className}`}
    >
      <img
        src="/assets/aistudio/passline_3e2e00e8.svg"
        alt="Passline Restaurant logo"
        className="w-full h-full object-cover object-center scale-[1.22]"
      />
    </span>
  );
}
