import React, { useState } from 'react';
import { Utensils } from 'lucide-react';

interface DishImageProps {
  src?: string;
  alt: string;
  className?: string;
}

export function DishImage({ src, alt, className = 'w-full h-40' }: DishImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${className} bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center text-slate-400 select-none`}
        aria-label={alt}
      >
        <Utensils className="w-6 h-6 mb-1.5 opacity-60" />
        <span className="text-xs font-medium text-slate-500 px-3 text-center truncate max-w-full">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} object-cover bg-slate-100`}
    />
  );
}
