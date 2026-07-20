import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { 
  Phone, 
  MessageSquare, 
  Copy, 
  Check, 
  Send, 
  Sparkles, 
  ChevronDown, 
  MessageCircle,
  Smartphone
} from 'lucide-react';

interface PatientQuickContactProps {
  patientId: string;
  patientName: string;
  phoneNumber: string;
  preferredChannel: string;
}

const TEMPLATES = [
  {
    id: 'reminder',
    label: '💊 Morning Dose Reminder',
    text: 'Hello! Just a friendly reminder from Nikshay Saathi to take your morning TB medication. Please reply 1 or DONE once taken.'
  },
  {
    id: 'missed',
    label: '⚠️ Missed Check-In Check',
    text: 'Hi! We missed your check-in log today. Is everything alright? Please reply when you can, or let us know if you need help.'
  },
  {
    id: 'encouragement',
    label: '✨ Encouraging Support',
    text: 'Hi! Just checking in to support you. Completing your full treatment plan is the absolute key to curing TB. Keep it up!'
  }
];

export default function PatientQuickContact({ 
  patientId, 
  patientName, 
  phoneNumber, 
  preferredChannel 
}: PatientQuickContactProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'sms' | null>(null);
  const [customText, setCustomText] = useState('');
  const [successMsg, setSuccessMsg] = useState(false);

  // Copy number to clipboard helper
  const handleCopy = () => {
    navigator.clipboard.writeText(phoneNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Dispatch custom reminder mutation
  const sendCustomReminderMutation = useMutation({
    mutationFn: async ({ message, channel }: { message: string; channel: 'whatsapp' | 'sms' }) => {
      const res = await apiClient.post('/reminders/custom', {
        patient_id: patientId,
        message_content: message,
        channel: channel
      });
      return res.data;
    },
    onSuccess: () => {
      // Invalidate queries to instantly update UI
      queryClient.invalidateQueries({ queryKey: ['patient-reminders', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      
      setSuccessMsg(true);
      setCustomText('');
      setActiveChannel(null);
      setTimeout(() => setSuccessMsg(false), 3000);
    },
    onError: (err: any) => {
      alert('Error sending message: ' + (err.response?.data?.error || err.message));
    }
  });

  const handleSelectTemplate = (templateText: string) => {
    setCustomText(templateText);
  };

  const handleSendMessage = () => {
    if (!customText.trim() || !activeChannel) return;
    sendCustomReminderMutation.mutate({
      message: customText.trim(),
      channel: activeChannel
    });
  };

  const isPreferred = (chan: 'whatsapp' | 'sms') => {
    return preferredChannel.toLowerCase() === chan;
  };

  return (
    <div 
      className="card relative overflow-hidden transition-all duration-300"
      style={{
        background: '#FFFFFF',
        border: '1px solid #E9E9E2',
        borderRadius: '24px',
        padding: '20px',
        boxShadow: '0 6px 20px -8px rgba(107, 112, 92, 0.08)'
      }}
    >
      {/* Accent strip */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--coral)' }} />

      <div className="space-y-4">
        {/* Header */}
        <div>
          <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-pale flex items-center gap-2" style={{ margin: 0 }}>
            <Phone size={14} className="text-coral" /> Quick Contact
          </h3>
          <p className="font-mono text-[10px] text-muted mt-0.5" style={{ color: '#6B705C' }}>
            Initiate direct patient outreach support
          </p>
        </div>

        {/* Primary Contact Row */}
        <div className="bg-surface border border-border/80 rounded-xl p-3 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="font-mono text-[9px] text-muted uppercase tracking-wider">Primary Number</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[12px] font-bold text-pale select-all">
                {phoneNumber || 'No number logged'}
              </span>
              {preferredChannel && (
                <span className="font-mono text-[8px] uppercase tracking-wider px-1 bg-coral-dim text-coral rounded border border-coral/10">
                  {preferredChannel}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg border border-border/80 hover:bg-white text-muted hover:text-pale transition-colors"
            title="Copy number"
          >
            {copied ? <Check size={12} className="text-risk-green" /> : <Copy size={12} />}
          </button>
        </div>

        {/* Channel Selection Buttons */}
        <div className="grid grid-cols-2 gap-2">
          {/* WhatsApp Button */}
          <button
            onClick={() => {
              setActiveChannel('whatsapp');
              if (!customText) setCustomText(TEMPLATES[0].text);
            }}
            className={`py-2 px-3 rounded-xl font-mono text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 border transition-all duration-150 ${
              activeChannel === 'whatsapp'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-300'
                : 'bg-white border-border/80 text-pale hover:bg-surface'
            }`}
          >
            <MessageCircle size={13} className={activeChannel === 'whatsapp' ? 'text-emerald-700' : 'text-emerald-600'} />
            <span>WhatsApp</span>
            {isPreferred('whatsapp') && <span className="w-1 h-1 bg-coral rounded-full" title="Preferred Channel" />}
          </button>

          {/* SMS Button */}
          <button
            onClick={() => {
              setActiveChannel('sms');
              if (!customText) setCustomText(TEMPLATES[0].text);
            }}
            className={`py-2 px-3 rounded-xl font-mono text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 border transition-all duration-150 ${
              activeChannel === 'sms'
                ? 'bg-blue-50 text-blue-800 border-blue-300 ring-1 ring-blue-300'
                : 'bg-white border-border/80 text-pale hover:bg-surface'
            }`}
          >
            <Smartphone size={13} className={activeChannel === 'sms' ? 'text-blue-700' : 'text-blue-600'} />
            <span>SMS Message</span>
            {isPreferred('sms') && <span className="w-1 h-1 bg-coral rounded-full" title="Preferred Channel" />}
          </button>
        </div>

        {/* Message Input & Template Selector */}
        {activeChannel && (
          <div className="border-t border-border/60 pt-3 space-y-3 fade-in">
            {/* Template Selection Pills */}
            <div className="space-y-1.5">
              <span className="font-mono text-[9px] text-muted uppercase tracking-wider block">Outreach Templates</span>
              <div className="flex flex-col gap-1.5">
                {TEMPLATES.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => handleSelectTemplate(tmpl.text)}
                    className="text-left font-sans text-[10.5px] p-2 bg-surface hover:bg-white rounded-lg border border-border/60 text-pale hover:text-coral transition-colors flex items-center justify-between"
                  >
                    <span>{tmpl.label}</span>
                    <Sparkles size={10} className="text-muted" />
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div className="space-y-1.5">
              <span className="font-mono text-[9px] text-muted uppercase tracking-wider block">Message Content</span>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Type custom message..."
                rows={3}
                className="w-full font-mono text-[11px] leading-normal p-2 bg-surface rounded-xl border border-border/80 text-pale focus:outline-none focus:border-coral transition-colors"
              />
            </div>

            {/* Send Row */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setActiveChannel(null)}
                className="font-mono text-[9px] uppercase tracking-widest text-muted hover:text-pale py-1 px-2 rounded hover:bg-surface transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleSendMessage}
                disabled={!customText.trim() || sendCustomReminderMutation.isPending}
                className={`py-1.5 px-3 rounded-xl font-mono text-[10px] uppercase tracking-wider flex items-center gap-1.5 text-white shadow-sm transition-all duration-150 ${
                  activeChannel === 'whatsapp' 
                    ? 'bg-emerald-600 hover:bg-emerald-700' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {sendCustomReminderMutation.isPending ? (
                  <span>Sending...</span>
                ) : (
                  <>
                    <Send size={11} />
                    <span>Send Simulated</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Success Alert toast inline */}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-2.5 font-mono text-[10px] flex items-center gap-2 animate-bounce">
            <Check size={12} className="text-emerald-700" />
            <span>Simulated outreach sent successfully!</span>
          </div>
        )}
      </div>
    </div>
  );
}
