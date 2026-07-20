import React, { useState, useMemo } from 'react';
import { 
  format, 
  isSameDay, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isToday, 
  addMonths, 
  subMonths, 
  parseISO 
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Check, 
  X, 
  Award, 
  Info,
  TrendingUp,
  AlertCircle,
  HelpCircle,
  CalendarCheck
} from 'lucide-react';

interface AdherenceCalendarProps {
  logs: { logDate: string; status: boolean }[];
}

export default function AdherenceCalendar({ logs }: AdherenceCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // 1. Generate month calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const calendarDays = useMemo(() => {
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [gridStart, gridEnd]);

  // Create lookup map for logs
  const logsMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    logs.forEach(log => {
      map[log.logDate] = log.status;
    });
    return map;
  }, [logs]);

  // Navigation handlers
  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handleCurrentMonth = () => setCurrentMonth(new Date());

  // 2. Calculations for statistics (this month)
  const stats = useMemo(() => {
    let takenThisMonth = 0;
    let missedThisMonth = 0;
    let unloggedThisMonth = 0;

    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    daysInMonth.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const status = logsMap[dateStr];
      if (status === true) {
        takenThisMonth++;
      } else if (status === false) {
        missedThisMonth++;
      } else {
        unloggedThisMonth++;
      }
    });

    const totalLogged = takenThisMonth + missedThisMonth;
    const adherenceRate = totalLogged > 0 ? Math.round((takenThisMonth / totalLogged) * 100) : 0;

    return {
      taken: takenThisMonth,
      missed: missedThisMonth,
      unlogged: unloggedThisMonth,
      totalLogged,
      rate: adherenceRate,
      daysInMonthCount: daysInMonth.length
    };
  }, [logsMap, monthStart, monthEnd]);

  // 3. Calculate Overall Streak Statistics
  const streakStats = useMemo(() => {
    // Sort all logs by date ascending
    const sortedLogs = [...logs]
      .filter(l => l.logDate)
      .sort((a, b) => a.logDate.localeCompare(b.logDate));

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // We can compute longest consecutive taken streak
    sortedLogs.forEach((log) => {
      if (log.status) {
        tempStreak++;
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
      } else {
        tempStreak = 0;
      }
    });

    // Calculate current streak counting backwards from today or last recorded date
    // Let's search back from today's date
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    let searchDate = new Date();
    
    // If today is unlogged or missed, check if yesterday had a streak
    let activeStreak = true;
    let checkDayCount = 0;
    
    while (activeStreak && checkDayCount < 365) {
      const dateStr = format(searchDate, 'yyyy-MM-dd');
      const status = logsMap[dateStr];
      
      if (status === true) {
        currentStreak++;
      } else if (status === false) {
        // If they missed a dose, the streak is broken
        activeStreak = false;
      } else {
        // If it's today and unlogged, we don't break the streak immediately
        // but if it is past days and unlogged, it breaks the streak.
        if (checkDayCount === 0) {
          // Skip today if unlogged
        } else {
          activeStreak = false;
        }
      }
      
      // Go to previous day
      searchDate.setDate(searchDate.getDate() - 1);
      checkDayCount++;
    }

    return {
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
    };
  }, [logs, logsMap]);

  // 4. Weekday Compliance Pattern (Mon - Sun)
  const weekdayStats = useMemo(() => {
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = daysOfWeek.map(name => ({ name, taken: 0, total: 0 }));

    logs.forEach(log => {
      try {
        const date = parseISO(log.logDate);
        const dayIdx = date.getDay(); // 0 is Sunday, 1 is Monday
        counts[dayIdx].total++;
        if (log.status) {
          counts[dayIdx].taken++;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    });

    return counts.map(item => {
      const rate = item.total > 0 ? Math.round((item.taken / item.total) * 100) : null;
      return {
        ...item,
        rate
      };
    });
  }, [logs]);

  // Style helper for calendar days
  const getDayStyles = (day: Date) => {
    const isCurrentMonth = isSameMonth(day, currentMonth);
    const dateStr = format(day, 'yyyy-MM-dd');
    const status = logsMap[dateStr];
    const isSelectedToday = isToday(day);

    let bg = 'transparent';
    let border = '1px solid #E9E9E2';
    let textColor = '#2C332D';
    let label = 'Unlogged';

    if (!isCurrentMonth) {
      textColor = '#CCD5AE'; // very light gray-green
      border = '1px dashed #E9E9E2';
    }

    if (status === true) {
      bg = '#F4F7F5'; // soft green tint
      border = '1px solid rgba(74, 93, 78, 0.3)';
      textColor = '#4A5D4E';
      label = 'Taken';
    } else if (status === false) {
      bg = '#FAF3F2'; // soft red tint
      border = '1px solid rgba(178, 76, 61, 0.3)';
      textColor = '#B24C3D';
      label = 'Missed';
    }

    // Highlight today
    if (isSelectedToday) {
      border = '2px solid #D98C5F'; // Coral border for today
    }

    return { bg, border, textColor, label, isCurrentMonth };
  };

  return (
    <div 
      id="monthly-adherence-calendar-card"
      className="card relative overflow-hidden"
      style={{ background: '#FFFFFF', border: '1px solid #E9E9E2', borderRadius: '28px', padding: '24px' }}
    >
      {/* Decorative Top Accent Bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'var(--coral)' }} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Interactive Monthly Grid (2 Cols span) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Calendar Header / Navigation Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
            <div>
              <h3 className="text-pale font-sans font-bold text-lg uppercase tracking-tight" style={{ color: '#2C332D', margin: 0 }}>
                Medication Adherence Calendar
              </h3>
              <p className="font-mono text-xs text-muted mt-0.5" style={{ color: '#6B705C' }}>
                Track monthly dose adherence patterns & timeline details
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-surface rounded-xl border border-border text-muted hover:text-pale transition-colors"
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>

              <span className="font-sans font-bold text-sm text-pale px-2 min-w-[120px] text-center uppercase tracking-wide">
                {format(currentMonth, 'MMMM yyyy')}
              </span>

              <button 
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-surface rounded-xl border border-border text-muted hover:text-pale transition-colors"
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>

              <button 
                onClick={handleCurrentMonth}
                className="text-[10px] uppercase font-mono px-2 py-1.5 border border-border rounded-xl hover:bg-surface text-muted transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Standard Calendar Month Grid */}
          <div>
            {/* Weekdays indicator labels */}
            <div className="grid grid-cols-7 gap-2 mb-2 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="font-mono text-[10px] uppercase tracking-wider text-muted font-bold py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Monthly grid days */}
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day, idx) => {
                const { bg, border, textColor, label, isCurrentMonth } = getDayStyles(day);
                const dayStr = format(day, 'd');
                const isSelectedToday = isToday(day);

                return (
                  <div
                    key={idx}
                    className="aspect-square flex flex-col items-center justify-between p-1.5 rounded-xl transition-all relative group cursor-pointer"
                    style={{
                      background: bg,
                      border: border,
                      opacity: isCurrentMonth ? 1 : 0.4
                    }}
                    title={`${format(day, 'MMMM d, yyyy')} — ${label}`}
                  >
                    {/* Date Number */}
                    <span 
                      className={`font-mono text-xs font-bold self-start ${isSelectedToday ? 'text-coral' : ''}`}
                      style={{ color: isSelectedToday ? 'var(--coral)' : textColor }}
                    >
                      {dayStr}
                    </span>

                    {/* Miniature Dose Indicator Dot / Icon */}
                    <div className="self-end mt-1">
                      {label === 'Taken' && (
                        <Check size={10} className="text-risk-green font-bold" style={{ color: 'var(--risk-green)' }} />
                      )}
                      {label === 'Missed' && (
                        <X size={10} className="text-risk-red font-bold" style={{ color: 'var(--risk-red)' }} />
                      )}
                      {label === 'Unlogged' && isCurrentMonth && (
                        <div className="w-1 h-1 bg-gray-300 rounded-full mx-auto" />
                      )}
                    </div>

                    {/* Popover Hover tooltip details */}
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-pale text-white text-[9px] py-1 px-2 rounded-lg font-mono pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 shadow-md">
                      {format(day, 'MMM d')}: {label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend indicator badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-3 border-t border-border/60">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <div className="w-3.5 h-3.5 bg-[#F4F7F5] border border-green-200 rounded-md flex items-center justify-center">
                <Check size={8} className="text-risk-green" />
              </div>
              <span className="text-muted">Taken Dose</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-mono">
              <div className="w-3.5 h-3.5 bg-[#FAF3F2] border border-red-200 rounded-md flex items-center justify-center">
                <X size={8} className="text-risk-red" />
              </div>
              <span className="text-muted">Missed Dose</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-mono">
              <div className="w-3.5 h-3.5 bg-white border border-gray-200 rounded-md" />
              <span className="text-muted">Unlogged</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-mono">
              <div className="w-3.5 h-3.5 bg-white border-2 border-coral rounded-md" />
              <span className="text-muted">Today</span>
            </div>
          </div>
        </div>

        {/* Right Column: Streaks & Weekday Pattern Analysis */}
        <div className="space-y-6 lg:border-l lg:border-border lg:pl-6">
          
          {/* Monthly stats card */}
          <div>
            <h4 className="text-pale font-sans font-bold text-sm uppercase tracking-tight mb-3" style={{ color: '#2C332D' }}>
              Monthly Statistics
            </h4>

            <div className="bg-surface border border-border rounded-2xl p-4 space-y-4">
              {/* Adherence Rate Circular progress indicator */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-coral" />
                  <span className="font-sans font-semibold text-xs text-pale">Adherence Rate</span>
                </div>
                <span 
                  className="font-mono text-base font-bold"
                  style={{ color: stats.rate >= 85 ? 'var(--risk-green)' : stats.rate >= 60 ? 'var(--risk-yellow)' : 'var(--risk-red)' }}
                >
                  {stats.rate}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500" 
                  style={{ 
                    width: `${stats.rate}%`,
                    backgroundColor: stats.rate >= 85 ? 'var(--risk-green)' : stats.rate >= 60 ? 'var(--risk-yellow)' : 'var(--risk-red)'
                  }} 
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono pt-1">
                <div className="bg-white/60 p-2 rounded-xl border border-border/50">
                  <span className="text-[10px] text-muted block uppercase tracking-wider">Taken</span>
                  <span className="font-bold text-pale text-sm">{stats.taken}</span>
                </div>

                <div className="bg-white/60 p-2 rounded-xl border border-border/50">
                  <span className="text-[10px] text-muted block uppercase tracking-wider">Missed</span>
                  <span className="font-bold text-pale text-sm">{stats.missed}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Adherence Streak Milestones */}
          <div>
            <h4 className="text-pale font-sans font-bold text-sm uppercase tracking-tight mb-3" style={{ color: '#2C332D' }}>
              Treatment Streaks
            </h4>

            <div className="space-y-3">
              {/* Current Streak */}
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-[#F4F7F5] to-transparent border border-green-100 rounded-2xl">
                <div className="w-10 h-10 rounded-xl bg-[#E9EDC9] flex items-center justify-center text-risk-green">
                  <CalendarCheck size={18} />
                </div>
                <div>
                  <span className="text-[10px] text-muted font-mono uppercase block tracking-wider">Current Streak</span>
                  <span className="font-sans font-bold text-sm text-pale">
                    {streakStats.currentStreak} Days Consecutive
                  </span>
                </div>
              </div>

              {/* Longest Streak */}
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-amber-50 to-transparent border border-amber-100 rounded-2xl">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800">
                  <Award size={18} />
                </div>
                <div>
                  <span className="text-[10px] text-muted font-mono uppercase block tracking-wider">Longest Streak</span>
                  <span className="font-sans font-bold text-sm text-pale">
                    {streakStats.longestStreak} Days Record
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Weekday Adherence Pattern Heatmap */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-pale font-sans font-bold text-sm uppercase tracking-tight" style={{ color: '#2C332D' }}>
                Weekday Patterns
              </h4>
              <span className="font-mono text-[9px] text-muted uppercase">Adherence %</span>
            </div>

            <div className="space-y-2">
              {weekdayStats.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted w-10 font-bold">{item.name}</span>
                  <div className="flex-1 mx-3 bg-gray-100 h-2 rounded-full overflow-hidden relative">
                    {item.rate !== null ? (
                      <div 
                        className="h-full rounded-full"
                        style={{ 
                          width: `${item.rate}%`,
                          backgroundColor: item.rate >= 85 ? 'var(--risk-green)' : item.rate >= 60 ? 'var(--risk-yellow)' : 'var(--risk-red)'
                        }}
                      />
                    ) : null}
                  </div>
                  <span className="text-pale font-semibold w-8 text-right">
                    {item.rate !== null ? `${item.rate}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
