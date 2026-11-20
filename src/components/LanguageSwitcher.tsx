import { Globe } from 'lucide-react';
import { useLanguage } from '../i18n';

interface LanguageSwitcherProps {
  variant?: 'light' | 'dark';
}

export function LanguageSwitcher({ variant = 'light' }: LanguageSwitcherProps) {
  const { lang, setLang } = useLanguage();

  const isDark = variant === 'dark';

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-lg p-1 ${
        isDark
          ? 'border border-white/15 bg-white/10 text-slate-200'
          : 'border border-slate-200 bg-slate-100 text-slate-700'
      }`}
      role="group"
      aria-label="Language switcher"
    >
      <Globe
        className={`ml-1.5 mr-0.5 h-3.5 w-3.5 shrink-0 ${
          isDark ? 'text-slate-300' : 'text-slate-500'
        }`}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => setLang('so')}
        className={`min-h-[32px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
          lang === 'so'
            ? isDark
              ? 'bg-white text-[#0B162C] shadow-xs'
              : 'bg-white text-[#0B162C] shadow-xs'
            : isDark
            ? 'text-slate-300 hover:text-white'
            : 'text-slate-600 hover:text-slate-900'
        }`}
        aria-pressed={lang === 'so'}
      >
        Soomaali
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`min-h-[32px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
          lang === 'en'
            ? isDark
              ? 'bg-white text-[#0B162C] shadow-xs'
              : 'bg-white text-[#0B162C] shadow-xs'
            : isDark
            ? 'text-slate-300 hover:text-white'
            : 'text-slate-600 hover:text-slate-900'
        }`}
        aria-pressed={lang === 'en'}
      >
        English
      </button>
    </div>
  );
}
