'use client';

export default function ContactEmail() {
  const handleClick = () => {
    window.location.href = 'mailto:' + 'hello' + '@' + 'charlesthompson.me';
  };

  return (
    <button
      onClick={handleClick}
      className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline cursor-pointer text-left"
    >
      hello@charlesthompson.me
    </button>
  );
}
