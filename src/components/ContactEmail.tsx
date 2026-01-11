'use client';

export default function ContactEmail() {
  const handleClick = () => {
    window.location.href = 'mailto:' + 'hello' + '@' + 'charlesthompson.me';
  };

  return (
    <button
      onClick={handleClick}
      className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer text-left"
    >
      hello@charlesthompson.me
    </button>
  );
}
