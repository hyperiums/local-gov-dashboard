'use client';

interface ContactEmailProps {
  email: string;
}

export default function ContactEmail({ email }: ContactEmailProps) {
  const handleClick = () => {
    // Split email to prevent simple scraping
    const [local, domain] = email.split('@');
    window.location.href = `mailto:${local}@${domain}`;
  };

  return (
    <button
      onClick={handleClick}
      className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline cursor-pointer text-left"
    >
      {email}
    </button>
  );
}
