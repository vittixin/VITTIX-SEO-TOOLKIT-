import { scoreTone } from '@/src/lib/format';

const STROKE: Record<ReturnType<typeof scoreTone>, string> = {
  emerald: '#059669',
  sky: '#0284c7',
  amber: '#d97706',
  rose: '#e11d48',
};

const TEXT: Record<ReturnType<typeof scoreTone>, string> = {
  emerald: 'text-emerald-600',
  sky: 'text-sky-600',
  amber: 'text-amber-600',
  rose: 'text-rose-600',
};

export function ScoreRing({ score, size = 150 }: { score: number; size?: number }) {
  const tone = scoreTone(score);
  const strokeWidth = Math.max(8, Math.round(size / 14));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (circumference * score) / 100;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--vittix-score-track)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={STROKE[tone]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold tabular-nums ${TEXT[tone]}`}>{score}</span>
        <span className="text-xs font-medium text-slate-400">/ 100</span>
      </div>
    </div>
  );
}
