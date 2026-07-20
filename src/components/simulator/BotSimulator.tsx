import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Plus, RefreshCw } from 'lucide-react';
import RiskBadge from '../shared/RiskBadge';

export default function BotSimulator() {
  const queryClient = useQueryClient();
  const [selectedPatientId, setSelectedPatientId] = useState('');

  // 1. Fetch patients for selector
  const { data: patients = [] } = useQuery({
    queryKey: ['patients'],
    queryFn: async () => {
      const res = await apiClient.get('/patients');
      return res.data;
    }
  });

  useEffect(() => {
    if (patients.length > 0 && !selectedPatientId) {
      setSelectedPatientId(patients[0].id);
    }
  }, [patients]);

  const selectedPatient = patients.find((p: any) => p.id === selectedPatientId);



  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (messageText: string) => {
      const res = await apiClient.post('/simulate/reply', {
        phone: selectedPatient?.phone,
        message: messageText
      });
      return res.data;
    },
    onSuccess: (data) => {
      alert('Patient action logged successfully!\n\nBot Response: ' + data.response);
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: any) => {
      alert('Error simulating action: ' + (error.response?.data?.error || error.message));
    }
  });

  // Trigger daily reminder mutation
  const triggerReminderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/reminders/trigger', {
        patient_id: selectedPatient?.id
      });
      return res.data;
    },
    onSuccess: (data) => {
      alert('Daily reminder triggered successfully!\n\nMessage: ' + data.reminder.messageContent);
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient-reminders', selectedPatientId] });
    },
    onError: (error: any) => {
      alert('Error triggering reminder: ' + (error.response?.data?.error || error.message));
    }
  });

  // Fetch reminders for the selected patient
  const { data: patientReminders = [], refetch: refetchReminders } = useQuery({
    queryKey: ['patient-reminders', selectedPatientId],
    queryFn: async () => {
      if (!selectedPatientId) return [];
      const res = await apiClient.get('/reminders', {
        params: { patient_id: selectedPatientId }
      });
      return res.data;
    },
    enabled: !!selectedPatientId,
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
      queryClient.invalidateQueries({ queryKey: ['patient-reminders', selectedPatientId] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    }
  });

  // End day mutation
  const endDayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/simulate/day', { date_offset: 0 });
      return res.data;
    },
    onSuccess: () => {
      alert('Day transitioned. Non-responding active patients marked as MISSED. Risk levels re-evaluated.');
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });



  const sendQuickReply = (text: string) => {
    if (sendMutation.isPending) return;
    sendMutation.mutate(text);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bebas text-2xl tracking-widest text-white">Interactive Bot Simulator</h2>
        <p className="font-mono text-xs text-muted mt-1 uppercase tracking-wider">
          Simulate Patient-Bot interactions, WhatsApp reminders, and daily risk updates
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left column: Simulator controls */}
          <div className="bg-charcoal border border-border p-6 space-y-4">
            <h4 className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
              Simulator Configurations
            </h4>

            <div>
              <label className="block font-mono text-xs text-muted uppercase tracking-widest mb-1.5">
                Select Patient Profile
              </label>
              <select 
                className="w-full bg-surface border border-border text-white font-mono text-sm p-3 focus:border-accent focus:outline-none"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
              >
                {patients.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.riskLevel.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {selectedPatient && (
              <div className="bg-surface/50 border border-border p-4 font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted">CONDITION:</span>
                  <span className="text-accent uppercase font-bold">{selectedPatient.condition}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">DURATION:</span>
                  <span className="text-white">{selectedPatient.treatmentDurationDays} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">RISK STATE:</span>
                  <RiskBadge level={selectedPatient.riskLevel} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">PHONE NO:</span>
                  <span className="text-white">{selectedPatient.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">CHANNEL:</span>
                  <span className="text-accent uppercase font-bold">{selectedPatient.channelPref}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">LANGUAGE:</span>
                  <span className="text-white uppercase">{selectedPatient.language}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">STREAK:</span>
                  <span className="text-teal font-bold">{selectedPatient.currentStreak} Days</span>
                </div>
              </div>
            )}

            <div className="space-y-2.5 pt-4">
              <button 
                onClick={() => triggerReminderMutation.mutate()}
                disabled={triggerReminderMutation.isPending}
                className="w-full bg-rust hover:bg-blood text-white font-mono text-xs uppercase tracking-widest py-3 flex items-center justify-center space-x-2 transition-colors"
              >
                <Plus size={14} />
                <span>Force Daily Reminder</span>
              </button>

              <button 
                onClick={() => endDayMutation.mutate()}
                disabled={endDayMutation.isPending}
                className="w-full bg-transparent border border-border hover:border-pale text-pale hover:text-white font-mono text-xs uppercase tracking-widest py-3 flex items-center justify-center space-x-2 transition-colors"
              >
                <RefreshCw size={14} />
                <span>Trigger End of Day</span>
              </button>
            </div>
          </div>

          {/* Quick Replies Panel */}
          <div className="bg-charcoal border border-border p-6 space-y-4">
            <h4 className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
              Simulated Patient Actions
            </h4>

            {/* In-App push notification block */}
            <div className="space-y-2 border-b border-border/60 pb-4">
              <p className="font-mono text-[10px] text-coral uppercase tracking-widest">In-App Push Reminder (Simulated)</p>
              {patientReminders && patientReminders.length > 0 ? (
                (() => {
                  const latest = patientReminders[0];
                  const isAck = !!latest.acknowledged;
                  return (
                    <div className="bg-surface border border-border p-3.5 space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] text-muted">
                          {new Date(latest.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span 
                          className="font-mono text-[9px] uppercase px-1.5 py-0.5 border"
                          style={{
                            background: isAck ? 'rgba(74, 93, 78, 0.1)' : 'rgba(217, 140, 95, 0.1)',
                            color: isAck ? 'var(--risk-green)' : 'var(--coral)',
                            borderColor: isAck ? 'rgba(74, 93, 78, 0.2)' : 'rgba(217, 140, 95, 0.2)'
                          }}
                        >
                          {isAck ? 'Acknowledged' : 'Unread / Pending'}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-white leading-relaxed bg-black/30 p-2 border border-border/40">
                        "{latest.messageContent}"
                      </p>
                      <button
                        onClick={() => toggleAcknowledgeMutation.mutate({ reminderId: latest.id, acknowledged: !isAck })}
                        disabled={toggleAcknowledgeMutation.isPending}
                        className="w-full bg-mid hover:bg-surface border border-border text-white font-mono text-[10px] uppercase py-2 tracking-wider transition-colors flex items-center justify-center space-x-1.5"
                      >
                        <span>{isAck ? '↩ Mark as Unacknowledged' : '✓ Toggle Acknowledge Receipt'}</span>
                      </button>
                    </div>
                  );
                })()
              ) : (
                <div className="bg-surface/30 border border-dashed border-border/60 p-4 text-center">
                  <p className="font-mono text-[10px] text-muted uppercase">No Reminders Sent Today</p>
                  <p className="font-sans text-[10px] text-muted mt-1">Force a daily reminder to simulate the push alert popup.</p>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <p className="font-mono text-xs text-muted uppercase tracking-widest">Adherence Answers</p>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => sendQuickReply('DONE')}
                  className="bg-surface hover:bg-mid border border-border text-white font-mono text-xs px-3 py-1.5 transition-colors"
                >
                  DONE (English)
                </button>
                <button 
                  onClick={() => sendQuickReply('ಹೌದು')}
                  className="bg-surface hover:bg-mid border border-border text-white font-mono text-xs px-3 py-1.5 transition-colors"
                >
                  ಹೌದು (Kannada YES)
                </button>
                <button 
                  onClick={() => sendQuickReply('1')}
                  className="bg-surface hover:bg-mid border border-border text-white font-mono text-xs px-3 py-1.5 transition-colors"
                >
                  1 (Number confirmation)
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="font-mono text-xs text-muted uppercase tracking-widest">Sunday Symptom Survey Answers</p>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => sendQuickReply('2 2 3 2')}
                  className="bg-surface hover:bg-mid border border-border text-teal font-mono text-xs px-3 py-1.5 transition-colors"
                >
                  All Clean (2 2 3 2)
                </button>
                <button 
                  onClick={() => sendQuickReply('1 1 1 1')}
                  className="bg-surface hover:bg-mid border border-border text-blood font-mono text-xs px-3 py-1.5 transition-colors"
                >
                  Severe Symptoms (1 1 1 1)
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="font-mono text-xs text-muted uppercase tracking-widest">Q&A / LLM Queries</p>
              <div className="flex flex-col space-y-1.5">
                <button 
                  onClick={() => sendQuickReply(`What should I eat for my ${selectedPatient?.condition || 'condition'}?`)}
                  className="bg-surface hover:bg-mid border border-border text-white font-mono text-xs px-3 py-2 text-left transition-colors"
                >
                  Food/Diet advice for {selectedPatient?.condition || 'condition'}
                </button>
                <button 
                  onClick={() => sendQuickReply('Can I stop my medication?')}
                  className="bg-surface hover:bg-mid border border-border text-warn font-mono text-xs px-3 py-2 text-left transition-colors"
                >
                  "Can I stop medication?" (Guardrail block)
                </button>
                <button 
                  onClick={() => sendQuickReply('diagnose my side effects')}
                  className="bg-surface hover:bg-mid border border-border text-warn font-mono text-xs px-3 py-2 text-left transition-colors"
                >
                  "Diagnose side effects" (Intent block)
                </button>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
