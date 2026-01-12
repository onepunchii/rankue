import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check for saved theme preference or default to dark mode
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark) || !savedTheme) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);

    if (newTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <div className="relative inline-block w-14 h-8">
      <input
        type="checkbox"
        checked={isDark}
        onChange={toggleTheme}
        className="sr-only"
        id="theme-toggle"
      />
      <label
        htmlFor="theme-toggle"
        className="block overflow-hidden h-8 rounded-full cursor-pointer transition-all duration-300 bg-gradient-to-r from-pink-300 to-pink-400 dark:from-gray-800 dark:to-gray-900 border border-pink-300 dark:border-gray-700 pt-[-2px] pb-[-2px]"
      >
        <div
          className={`w-6 h-6 bg-white rounded-full shadow-lg transform transition-all duration-300 mt-1 ml-1 relative overflow-hidden ${isDark ? 'translate-x-6' : 'translate-x-0'
            }`}
          style={{
            background: 'linear-gradient(45deg, #FFFFFF, #F8F9FA)'
          }}
        >
          {/* Moon spots for dark mode */}
          {isDark && (
            <>
              <div className="absolute w-1 h-1 bg-gray-500 rounded-full top-1 left-2 opacity-80" />
              <div className="absolute w-1.5 h-1.5 bg-gray-500 rounded-full top-2.5 left-0.5 opacity-60" />
              <div className="absolute w-0.5 h-0.5 bg-gray-500 rounded-full top-3.5 left-3.5 opacity-70" />
            </>
          )}

          {/* Sun rays for light mode */}
          {!isDark && (
            <>
              <div className="absolute -inset-1 bg-yellow-300 rounded-full opacity-20 animate-pulse" />
              <div className="absolute -inset-2 rounded-full opacity-10 animate-pulse bg-[#ffffff]" style={{ animationDelay: '0.5s' }} />
            </>
          )}
        </div>

        {/* Stars for dark mode */}
        {isDark && (
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1 left-1 w-1 h-1 bg-white opacity-80 animate-pulse" style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }} />
            <div className="absolute top-4 left-1 w-0.5 h-0.5 bg-white opacity-60 animate-pulse" style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', animationDelay: '0.3s' }} />
            <div className="absolute top-5 left-2 w-0.5 h-0.5 bg-white opacity-70 animate-pulse" style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', animationDelay: '0.6s' }} />
            <div className="absolute top-0.5 left-4 w-1 h-1 bg-white opacity-50 animate-pulse" style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)', animationDelay: '1s' }} />
          </div>
        )}
      </label>
    </div>
  );
}