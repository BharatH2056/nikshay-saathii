import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { 
  Bell, 
  Check, 
  Clock, 
  Smartphone, 
  Send, 
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';

interface PatientRemindersTabProps {
  patientId: string;
  patientName: string;
  patientPhone: string;
  channelPref: string;
}

export default function PatientRemindersTab({ 
  patientId, 
  patientName, 
  patientPhone,
  channelPref 
}: PatientRemindersTabProps) {
  const queryClient = useQueryClient();

  // Fetch reminders for this patient
  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ['patient-reminders', patientId],
    queryFn: async () => {
      const res = await apiClient.get('/reminders', {
        params: { patient_id: patientId }
      });
      return res.data;
    }
  });

  // Toggle Acknowledgment mutation
  const toggleAcknowledgeMutation = useMutation({
    mutationFn: async ({ reminderId, acknowledged }: { reminderId: string; acknowledged: boolean }) => {
      const res = await apiClient.post(`/reminders/${reminderId}/acknowledge`, {
        acknowledged
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-reminders', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
    }
  });

  // Trigger daily reminder mutation
  const triggerReminderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/reminders/trigger', {
        patient_id: patientId
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patient-reminders', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
    },
    onError: (error: any) => {
      alert('Error triggering reminder: ' + (error.response?.data?.error || error.message));
    }
  });

  const latestReminder = reminders[0]; // sorted desc

  const handleToggle = (reminderId: string, currentStatus: boolean) => {
    toggleAcknowledgeMutation.mutate({
      reminderId,
      acknowledged: !currentStatus
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* Left 2 columns: Reminders History & Dispatch Controls */}
      <div className="lg:col-span-2 space-y-6">
        <div 
          className="card overflow-hidden" 
          style={{ background: '#FFFFFF', border: '1px solid #E9E9E2', borderRadius: '24px', padding: '24px' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/80 pb-4">
            <div>
              <h3 className="text-pale font-sans font-bold text-lg uppercase tracking-tight" style={{ color: '#2C332D', margin: 0 }}>
                Daily Reminders History
              </h3>
              <p className="font-mono text-xs text-muted mt-0.5" style={{ color: '#6B705C' }}>
                Manage sent automated alerts and track patient-side delivery receipts.
              </p>
            </div>

            <button
              onClick={() => triggerReminderMutation.mutate()}
              disabled={triggerReminderMutation.isPending}
              className="px-4 py-2 bg-coral hover:bg-coral-dim text-white hover:text-coral font-mono text-[11px] uppercase tracking-wider rounded-xl flex items-center gap-1.5 transition-all"
              style={{ border: '1px solid var(--coral)' }}
            >
              <Send size={12} />
              {triggerReminderMutation.isPending ? 'Sending...' : 'Trigger Daily Reminder'}
            </button>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs font-mono text-muted animate-pulse">
              Loading reminders...
            </div>
          ) : reminders.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Bell className="mx-auto text-muted/50" size={32} />
              <p className="font-mono text-xs text-muted uppercase">No Reminders Sent Yet</p>
              <p className="font-sans text-[11px] text-muted">Click the trigger button to broadcast the initial daily medication alert.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60 max-h-[500px] overflow-y-auto pr-2 mt-4 space-y-4">
              {reminders.map((reminder: any) => {
                const formattedDate = format(new Date(reminder.scheduledAt), 'MMM dd, yyyy @ h:mm a');
                const isAcked = !!reminder.acknowledged;

                return (
                  <div key={reminder.id} className="pt-4 flex items-start gap-4 justify-between group">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted uppercase px-1.5 py-0.5 rounded bg-surface border border-border">
                          {reminder.channel}
                        </span>
                        <span className="font-mono text-[11px] text-muted">
                          {formattedDate}
                        </span>
                      </div>
                      <p className="font-mono text-[12px] text-[#4A4A4A] leading-relaxed bg-surface/50 p-2.5 rounded-lg border border-border/40">
                        {reminder.messageContent}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        onClick={() => handleToggle(reminder.id, isAcked)}
                        disabled={toggleAcknowledgeMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-colors"
                        style={{
                          background: isAcked ? 'rgba(74, 93, 78, 0.08)' : 'rgba(217, 140, 95, 0.08)',
                          color: isAcked ? 'var(--risk-green)' : 'var(--coral)',
                          border: `1px solid ${isAcked ? 'rgba(74, 93, 78, 0.2)' : 'rgba(217, 140, 95, 0.2)'}`
                        }}
                      >
                        {isAcked ? <Check size={12} /> : <Clock size={12} />}
                        {isAcked ? 'Acknowledged' : 'Pending Receipt'}
                      </button>

                      {/* Manual toggle switch */}
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleToggle(reminder.id, isAcked)}>
                        <span className="font-mono text-[9px] text-muted uppercase">Receipt Toggle</span>
                        {isAcked ? (
                          <ToggleRight size={20} className="text-risk-green" />
                        ) : (
                          <ToggleLeft size={20} className="text-muted" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Simulated Patient Device Push Notification Preview */}
      <div className="space-y-6">
        <div 
          className="card overflow-hidden relative" 
          style={{ 
            background: 'var(--charcoal)', 
            border: '1px solid var(--border)', 
            borderRadius: '24px', 
            padding: '24px',
            minHeight: '440px'
          }}
        >
          {/* Smartphone UI Wrapper */}
          <div className="mx-auto max-w-[280px] border-4 border-[#1c1c1e] rounded-[36px] bg-[#000000] overflow-hidden relative shadow-2xl h-[420px] flex flex-col justify-between">
            {/* Phone Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-4 bg-[#1c1c1e] rounded-b-xl z-20 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-900" />
            </div>

            {/* Status Bar */}
            <div className="px-5 pt-1.5 pb-1 flex justify-between items-center text-[9px] font-mono text-zinc-400 z-10 bg-black/60">
              <span>9:41 AM</span>
              <div className="flex items-center gap-1">
                <span>5G</span>
                <div className="w-4 h-2 border border-zinc-500 rounded-sm p-0.5 flex items-center">
                  <div className="h-full w-full bg-zinc-300 rounded-2xs" />
                </div>
              </div>
            </div>

            {/* Phone Screen Wallpaper/Body */}
            <div className="flex-1 p-3.5 flex flex-col justify-start items-center relative bg-gradient-to-b from-[#2d233c] to-[#0f0c1b]">
              <div className="text-center pt-8 pb-3">
                <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest block">Simulated Patient Device</span>
                <span className="font-sans font-bold text-xs text-white block mt-1">{patientName}'s Phone</span>
              </div>

              {/* Dynamic Notification Popup banner */}
              {latestReminder ? (
                <div 
                  className="w-full bg-[#1c1c1e]/95 border border-zinc-800 rounded-2xl p-3 shadow-lg space-y-2 text-left animate-bounce"
                  style={{ animationDuration: '3s' }}
                >
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                    <div className="flex items-center gap-1">
                      <Bell size={10} className="text-coral" />
                      <span className="font-bold text-white uppercase tracking-wider text-[9px]">Nikshay Saathi</span>
                    </div>
                    <span>now</span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-zinc-200 text-[11px] font-sans font-medium">Medication Alert</p>
                    <p className="text-zinc-300 text-[10px] leading-tight font-mono">
                      {latestReminder.messageContent}
                    </p>
                  </div>

                  {/* Acknowledgment Interactive Toggle inside the notification popup */}
                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                    <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider">Acknowledge Dose?</span>
                    <button
                      onClick={() => handleToggle(latestReminder.id, !!latestReminder.acknowledged)}
                      className="px-2.5 py-1 rounded-md text-[9px] uppercase font-mono font-bold tracking-wider transition-all"
                      style={{
                        background: latestReminder.acknowledged ? 'rgba(74, 93, 78, 0.4)' : 'var(--coral)',
                        color: '#FFFFFF',
                        boxShadow: !latestReminder.acknowledged ? '0 0 8px rgba(255, 107, 74, 0.4)' : 'none'
                      }}
                    >
                      {latestReminder.acknowledged ? '✅ Received' : 'Slide / Tap to OK'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full text-center py-12 text-zinc-500 font-mono text-[10px] space-y-2">
                  <Clock className="mx-auto" size={20} />
                  <span>No push notifications active. Trigger one to simulate the alert popup.</span>
                </div>
              )}
            </div>

            {/* Bottom Screen Bar */}
            <div className="h-6 bg-black flex items-center justify-center pb-1">
              <div className="w-24 h-1 bg-zinc-600 rounded-full" />
            </div>
          </div>

          <div className="mt-4 bg-surface/30 border border-border rounded-xl p-3.5 font-mono text-[11px] text-muted space-y-1.5">
            <div className="flex items-start gap-1.5 text-warn">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span className="uppercase font-bold tracking-wider">Capstone Pitch Demo Guide:</span>
            </div>
            <p className="leading-relaxed">
              Clicking <b>"Trigger Daily Reminder"</b> broadcasts a simulated daily dosage message. 
              The patient's device preview dynamically renders the push alert banner. 
              Toggling receipt instantly registers the delivery confirmation in the cloud backend.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
