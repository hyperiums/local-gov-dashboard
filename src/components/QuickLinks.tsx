import { ExternalLink } from 'lucide-react';
import { getClearGovSpendingUrl } from '@/lib/dates';

function getLinks() {
  return [
    {
      title: 'CivicClerk Portal',
      description: 'Official agendas & minutes',
      url: 'https://flowerybranchga.portal.civicclerk.com',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
    },
    {
      title: 'City Code (Municode)',
      description: 'Official ordinances',
      url: 'https://library.municode.com/ga/flowery_branch/codes/code_of_ordinances',
      color: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
    },
    {
      title: 'Budget Transparency',
      description: 'ClearGov spending data',
      url: getClearGovSpendingUrl(),
      color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
    },
    {
      title: 'City Website',
      description: 'Official city portal',
      url: 'https://www.flowerybranchga.org',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
    },
  ];
}

export default function QuickLinks() {
  const links = getLinks();
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Official Sources</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-between p-3 rounded-lg border transition ${link.color}`}
          >
            <div>
              <p className="font-medium text-slate-900 text-sm">{link.title}</p>
              <p className="text-xs text-slate-500">{link.description}</p>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400" />
          </a>
        ))}
      </div>
    </div>
  );
}
