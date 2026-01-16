import { Calendar, Building2, FileCheck, Scale, Clock } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface Activity {
  type: string;
  id: string;
  name: string;
  activity_date: string;
  created_at: string;
}

interface ActivityFeedProps {
  activities: Activity[];
}

const typeConfig = {
  meeting: {
    icon: Calendar,
    label: 'Meeting',
    color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50',
  },
  business: {
    icon: Building2,
    label: 'New Business',
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50',
  },
  permit: {
    icon: FileCheck,
    label: 'Permit',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50',
  },
  ordinance: {
    icon: Scale,
    label: 'Ordinance',
    color: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50',
  },
  'permit-report': {
    icon: FileCheck,
    label: 'Development',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50',
  },
  'business-report': {
    icon: Building2,
    label: 'Development',
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50',
  },
};

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  if (!activities.length) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Recent Activity</h2>
        <p className="text-slate-500 dark:text-slate-400 text-center py-8">No recent activity to display</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Recent Activity</h2>
      <div className="space-y-4">
        {activities.map((activity) => {
          const config = typeConfig[activity.type as keyof typeof typeConfig] || typeConfig.meeting;
          const Icon = config.icon;

          return (
            <div key={`${activity.type}-${activity.id}`} className="flex items-start space-x-3">
              <div className={`p-2 rounded-lg ${config.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{activity.name}</p>
                <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 mr-2">
                    {config.label}
                  </span>
                  <Clock className="w-3 h-3 mr-1" />
                  <span>{formatDistanceToNow(parseISO(activity.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
