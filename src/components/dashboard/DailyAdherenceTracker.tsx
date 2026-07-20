import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { format, subDays, addDays, parseISO, isToday } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Calendar, 
  User, 
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react';

export default function DailyAdherenceTracker() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch all active patients
  const { data: patients = [], isLoading: isLoadingPatients } = useQuery({
    queryKey: ['patients'],
    queryFn: async () => {
      const res = await apiClient.get('/patients');
      return res.data;
    },
  });

  // Fetch adherence logs for the selected date
  const { data: dateLogs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ['adherenceLogs', selectedDate],
    queryFn: async () => {
      const res = await apiClient.get(`/adherence/by-date/${selectedDate}`);
      return res.data;
    },
  });

  // Toggle/Log adherence mutation
  const logMutation = useMutation({
    mutationFn: async ({ patientId, status }: { patientId: string; status: boolean }) => {
      const res = await apiClient.post('/adherence/log', {
        patient_id: patientId,
        log_date: selectedDate,
        status,
      });
      return res.data;
    },
    onSuccess: () => {
      // Invalidate queries so counters, trends, and calendars update immediately
      queryClient.invalidateQueries({ queryKey: ['adherenceLogs', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  // Handlers for date changes
  const handlePrevDay = () => {
    const prev = subDays(parseISO(selectedDate), 1);
    setSelectedDate(format(prev, 'yyyy-MM-dd'));
  };

  const handleNextDay = () => {
    const next = addDays(parseISO(selectedDate), 1);
    setSelectedDate(format(next, 'yyyy-MM-dd'));
  };

  const handleSetToday = () => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
  };

  // Process adherence logs into a map for fast lookup
  const logsMap = React.useMemo(() => {
    const map: Record<string, { id: string; status: boolean; responseText?: string }> = {};
    dateLogs.forEach((log: any) => {
      map[log.patientId] = {
        id: log.id,
        status: log.status,
        responseText: log.responseText,
      };
    });
    return map;
  }, [dateLogs]);

  // Filter patients based on search
  const filteredPatients = patients.filter((patient: any) => {
    const nameMatch = patient.fullName.toLowerCase().includes(searchQuery.toLowerCase());
    const phoneMatch = patient.phone.includes(searchQuery);
    return nameMatch || phoneMatch;
  });

  // Calculate adherence stats for selected day
  const totalPatients = filteredPatients.length;
  const loggedPatients = filteredPatients.filter((p: any) => logsMap[p.id] !== undefined).length;
  const takenPatients = filteredPatients.filter((p: any) => logsMap[p.id]?.status === true).length;
  const adherenceRate = loggedPatients > 0 ? Math.round((takenPatients / loggedPatients) * 100) : 0;

  const handleToggle = (patientId: string, currentStatus: boolean | undefined, targetStatus: boolean) => {
    // If clicking already active status, we can either leave it or let it toggle
    // For this component, we will explicitly set it to the clicked status
    logMutation.mutate({ patientId, status: targetStatus });
  };

  const displayDateStr = format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy');

  return (
    <div 
      id="daily-adherence-tracker-card"
      className="card overflow-hidden" 
      style={{ background: '#FFFFFF', border: '1px solid #E9E9E2', borderRadius: '28px' }}
    >
      {/* Visual Accent Top Bar */}
      <div style={{ height: '4px', background: 'var(--coral)', margin: '-24px -24px 20px -24px' }} />

      {/* Header and Controls */}
      <div className="flex flex-col gap-5 border-b border-border pb-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 
              className="text-pale font-sans font-bold text-lg tracking-tight uppercase"
              style={{ color: '#2C332D', margin: 0 }}
            >
              Daily Medication Adherence
            </h3>
            <p className="font-mono text-xs text-muted mt-1 uppercase tracking-wider" style={{ color: '#6B705C' }}>
              Verify & log TB medication schedules for active patients
            </p>
          </div>
          <button 
            onClick={handleSetToday}
            disabled={isToday(parseISO(selectedDate))}
            className="btn-ghost self-start sm:self-auto text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
            style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '12px' }}
          >
            <Clock size={12} /> Today
          </button>
        </div>

        {/* Date Selector and Navigation */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#F8F9F5] p-3 rounded-2xl border border-[#E9E9E2]">
          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrevDay} 
              className="p-2 bg-white rounded-xl border border-border hover:bg-gray-50 text-pale hover:border-gray-400 transition-colors"
              aria-label="Previous day"
              style={{ width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={16} />
            </button>
            
            <div className="flex items-center gap-2 px-2">
              <Calendar size={16} className="text-muted" style={{ color: '#6B705C' }} />
              <span className="font-sans font-semibold text-sm text-pale">
                {displayDateStr}
              </span>
            </div>

            <button 
              onClick={handleNextDay} 
              className="p-2 bg-white rounded-xl border border-border hover:bg-gray-50 text-pale hover:border-gray-400 transition-colors"
              aria-label="Next day"
              style={{ width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Quick Stats for selected date */}
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase tracking-wider">Logged Progress</span>
              <span className="font-semibold text-pale text-sm">
                {loggedPatients} / {totalPatients} ({totalPatients > 0 ? Math.round((loggedPatients / totalPatients) * 100) : 0}%)
              </span>
            </div>
            <div className="w-[1px] h-8 bg-border" />
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase tracking-wider">Adherence Rate</span>
              <span 
                className="font-bold text-sm"
                style={{ color: adherenceRate >= 85 ? '#4A5D4E' : adherenceRate >= 60 ? '#E7AB79' : '#B24C3D' }}
              >
                {adherenceRate}% taken
              </span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-muted">
            <Search size={16} style={{ color: '#6B705C' }} />
          </span>
          <input
            type="text"
            placeholder="Search patients by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-border rounded-xl text-sm focus:ring-2 focus:ring-opacity-20"
            style={{ paddingLeft: '40px' }}
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-pale"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Patients Adherence List */}
      {isLoadingPatients || isLoadingLogs ? (
        <div className="space-y-3 py-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 skeleton rounded-xl" />
          ))}
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="text-center py-10 px-4 border border-dashed border-border rounded-2xl bg-[#F8F9F5]">
          <User className="mx-auto text-muted mb-2 opacity-50" size={28} style={{ color: '#6B705C' }} />
          <p className="font-sans font-medium text-pale text-sm">No active patients found</p>
          <p className="font-mono text-xs text-muted mt-1">Try adjusting your search query</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {filteredPatients.map((patient: any) => {
              const log = logsMap[patient.id];
              const logStatus = log?.status; // true (taken), false (missed), undefined (unlogged)
              const isPending = logMutation.isPending && logMutation.variables?.patientId === patient.id;
              const pendingStatus = logMutation.variables?.status;

              // Render risk bullet color helper
              const getRiskColor = (level: string) => {
                if (level === 'red') return '#B24C3D';
                if (level === 'yellow') return '#E7AB79';
                return '#4A5D4E';
              };

              return (
                <motion.div
                  key={patient.id}
                  layoutId={`adherence-row-${patient.id}`}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-2xl border transition-all"
                  style={{
                    backgroundColor: logStatus === true 
                      ? '#F4F7F5' // soft tint green
                      : logStatus === false 
                        ? '#FAF3F2' // soft tint red
                        : '#FFFFFF',
                    borderColor: logStatus === true
                      ? 'rgba(74, 93, 78, 0.15)'
                      : logStatus === false
                        ? 'rgba(178, 76, 61, 0.15)'
                        : '#E9E9E2',
                  }}
                  whileHover={{ y: -1 }}
                >
                  {/* Left Column: Patient Profile info */}
                  <div className="flex items-start gap-3 min-w-0 mb-3 sm:mb-0">
                    {/* Risk Badge dot */}
                    <div 
                      className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: getRiskColor(patient.riskLevel) }}
                      title={`${patient.riskLevel} risk level`}
                    />
                    
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-sans font-bold text-pale text-sm truncate">
                          {patient.fullName}
                        </span>
                        <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-gray-100 rounded text-muted font-medium">
                          {patient.regimenType || 'Standard DOTS'}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 mt-1 text-xs font-mono text-muted">
                        <span>{patient.phone}</span>
                        <span>•</span>
                        <span className="capitalize">{patient.condition || 'TB'}</span>
                        <span>•</span>
                        <span className="text-[10px] text-gray-500">Streak: {patient.currentStreak}d</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Toggle Controls and State Indicator */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap sm:flex-nowrap">
                    {/* Log Status Label */}
                    <div className="flex-shrink-0">
                      {isPending ? (
                        <div className="flex items-center gap-1 text-xs text-muted font-mono animate-pulse">
                          <Clock size={12} className="animate-spin" /> Saving...
                        </div>
                      ) : logStatus === true ? (
                        <span className="risk-pill-green">
                          <span style={{ backgroundColor: '#4A5D4E' }} /> Taken
                        </span>
                      ) : logStatus === false ? (
                        <span className="risk-pill-red">
                          <span style={{ backgroundColor: '#B24C3D' }} /> Missed
                        </span>
                      ) : (
                        <span className="risk-pill-yellow">
                          <span style={{ backgroundColor: '#E7AB79' }} /> Unmarked
                        </span>
                      )}
                    </div>

                    {/* Action Toggles */}
                    <div className="flex items-center gap-1.5">
                      {/* Taken Button */}
                      <button
                        onClick={() => handleToggle(patient.id, logStatus, true)}
                        disabled={isPending}
                        aria-label={`Mark ${patient.fullName} as taken`}
                        className="flex items-center justify-center rounded-xl border transition-all"
                        style={{
                          width: '42px',
                          height: '42px',
                          backgroundColor: logStatus === true ? '#4A5D4E' : '#FFFFFF',
                          borderColor: logStatus === true ? '#4A5D4E' : '#E9E9E2',
                          color: logStatus === true ? '#FFFFFF' : '#6B705C',
                          cursor: isPending ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          if (logStatus !== true && !isPending) {
                            e.currentTarget.style.borderColor = '#4A5D4E';
                            e.currentTarget.style.backgroundColor = '#FAFBF9';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (logStatus !== true && !isPending) {
                            e.currentTarget.style.borderColor = '#E9E9E2';
                            e.currentTarget.style.backgroundColor = '#FFFFFF';
                          }
                        }}
                      >
                        <Check size={18} />
                      </button>

                      {/* Missed Button */}
                      <button
                        onClick={() => handleToggle(patient.id, logStatus, false)}
                        disabled={isPending}
                        aria-label={`Mark ${patient.fullName} as missed`}
                        className="flex items-center justify-center rounded-xl border transition-all"
                        style={{
                          width: '42px',
                          height: '42px',
                          backgroundColor: logStatus === false ? '#B24C3D' : '#FFFFFF',
                          borderColor: logStatus === false ? '#B24C3D' : '#E9E9E2',
                          color: logStatus === false ? '#FFFFFF' : '#6B705C',
                          cursor: isPending ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          if (logStatus !== false && !isPending) {
                            e.currentTarget.style.borderColor = '#B24C3D';
                            e.currentTarget.style.backgroundColor = '#FDF9F8';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (logStatus !== false && !isPending) {
                            e.currentTarget.style.borderColor = '#E9E9E2';
                            e.currentTarget.style.backgroundColor = '#FFFFFF';
                          }
                        }}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
