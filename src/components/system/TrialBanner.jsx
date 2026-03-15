import React from 'react';
import { Clock, Zap, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TrialBanner({ trialStatus }) {
  const navigate = useNavigate();

  if (!trialStatus?.isTrial || trialStatus?.isExpired) return null;

  const daysLeft = trialStatus.daysLeft ?? 0;
  const isUrgent = daysLeft <= 3;
  const isWarning = daysLeft <= 7 && !isUrgent;

  const bgClass = isUrgent
    ? 'bg-gradient-to-r from-red-600 to-red-500'
    : isWarning
    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
    : 'bg-gradient-to-r from-cyan-600 to-blue-600';

  const Icon = isUrgent ? AlertTriangle : isWarning ? Clock : Clock;

  return (
    <div className={`${bgClass} text-white px-4 py-2.5 flex items-center justify-between text-sm`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span className="font-medium">
          {isUrgent
            ? `Testphase endet in ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tagen'}!`
            : `Testphase: noch ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tage'} übrig`}
        </span>
      </div>
      <button
        onClick={() => navigate('/Upgrade')}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1 rounded-lg font-semibold transition-all text-xs"
      >
        <Zap className="w-3.5 h-3.5" />
        Jetzt upgraden
      </button>
    </div>
  );
}
