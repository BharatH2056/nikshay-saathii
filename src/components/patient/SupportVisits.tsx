import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MicOff, 
  Calendar, 
  Clock, 
  User, 
  Trash2, 
  AlertCircle, 
  Plus, 
  Save, 
  Languages, 
  Sparkles,
  Eraser,
  MessageSquare,
  ChevronRight
} from 'lucide-react';

interface SupportVisitsProps {
  patientId: string;
  patientLanguage: string;
  patientName: string;
}

export default function SupportVisits({ patientId, patientLanguage, patientName }: SupportVisitsProps) {
  const queryClient = useQueryClient();
  const [isListening, setIsListening] = useState(false);
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [speechLang, setSpeechLang] = useState(patientLanguage === 'ka' || patientLanguage === 'Kannada' ? 'kn-IN' : 'en-US');
  const [micError, setMicError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);

  // Fetch past visits
  const { data: visits = [], isLoading, error } = useQuery({
    queryKey: ['visits', patientId],
    queryFn: async () => {
      const res = await apiClient.get(`/visits/${patientId}/visits`);
      return res.data;
    },
  });

  // Mutation to record visit
  const recordVisitMutation = useMutation({
    mutationFn: async (payload: { notes: string; follow_up_date?: string }) => {
      const res = await apiClient.post('/visits', {
        patient_id: patientId,
        notes: payload.notes,
        follow_up_date: payload.follow_up_date || null,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setNotes('');
      setFollowUpDate('');
    },
  });

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = speechLang;

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          setNotes((prev) => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${finalTranscript.trim()}` : finalTranscript.trim();
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setMicError('Microphone permission blocked. Please check browser settings.');
        } else if (event.error === 'no-speech') {
          // Normal timeout/silence, ignore
        } else {
          setMicError(`Speech error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setMicError('Web Speech API is not supported in this browser. Manually type notes instead.');
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, [speechLang]);

  const handleToggleListening = () => {
    setMicError(null);
    if (!recognitionRef.current) {
      setMicError('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err: any) {
        console.error('Failed to start speech recognition:', err);
        setMicError('Could not access microphone.');
        setIsListening(false);
      }
    }
  };

  const handleSubmitVisit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) return;
    recordVisitMutation.mutate({
      notes: notes.trim(),
      follow_up_date: followUpDate || undefined,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      {/* Voice Recorder Note Logger (3 Columns) */}
      <div 
        className="lg:col-span-3 card relative" 
        style={{ background: '#FFFFFF', border: '1px solid #E9E9E2', borderRadius: '28px', padding: '24px' }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--coral)' }} />
        
        <div className="flex items-center justify-between border-b border-border pb-4 mb-5">
          <div>
            <h4 className="text-pale font-sans font-bold text-base uppercase tracking-tight" style={{ color: '#2C332D', margin: 0 }}>
              Record Visit Note
            </h4>
            <p className="font-mono text-xs text-muted mt-0.5" style={{ color: '#6B705C' }}>
              Record support visits using voice-to-text assistant
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted flex items-center gap-1">
              <Languages size={11} /> LANG:
            </span>
            <select
              value={speechLang}
              onChange={(e) => setSpeechLang(e.target.value)}
              disabled={isListening}
              className="text-xs bg-white border border-border rounded-lg px-2 py-1"
              style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '8px' }}
            >
              <option value="en-US">English (US)</option>
              <option value="kn-IN">Kannada (IN)</option>
              <option value="hi-IN">Hindi (IN)</option>
            </select>
          </div>
        </div>

        {/* Recording Console */}
        <form onSubmit={handleSubmitVisit} className="space-y-5">
          {/* Mic Button & Waveform Area */}
          <div className="flex flex-col items-center justify-center py-6 bg-[#F8F9F5] border border-border rounded-2xl relative overflow-hidden">
            
            {/* Dynamic wave anim when recording */}
            <AnimatePresence>
              {isListening && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center gap-1 pointer-events-none opacity-10"
                >
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 bg-coral rounded-full"
                      animate={{ height: [12, 40, 12] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.12 }}
                      style={{ height: '24px', backgroundColor: 'var(--coral)' }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={handleToggleListening}
              className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
                isListening 
                  ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                  : 'bg-coral hover:bg-coral/90 text-white'
              }`}
              style={{
                backgroundColor: isListening ? '#B24C3D' : '#D98C5F',
                boxShadow: isListening ? '0 0 16px rgba(178,76,61,0.4)' : '0 4px 12px rgba(217,140,95,0.2)'
              }}
              aria-label={isListening ? 'Stop recording voice note' : 'Start recording voice note'}
            >
              {isListening ? <MicOff size={24} /> : <Mic size={24} />}
            </button>

            <span className="font-mono text-xs font-semibold mt-3 text-pale">
              {isListening ? 'Listening... Speak now' : 'Click to record voice-to-text'}
            </span>

            {isListening && (
              <span className="text-[10px] text-muted font-mono animate-pulse mt-1">
                Real-time transcription active ({speechLang})
              </span>
            )}
          </div>

          {/* Microhpone Error Message Banner */}
          {micError && (
            <div className="p-3 bg-[#FAF3F2] border border-red-100 rounded-xl flex items-start gap-2 text-xs text-[#B24C3D] font-mono">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{micError}</span>
            </div>
          )}

          {/* Realtime note textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted flex items-center gap-1.5" style={{ color: '#6B705C' }}>
                <MessageSquare size={12} /> Transcribed Visit Notes
              </label>
              {notes && (
                <button
                  type="button"
                  onClick={() => setNotes('')}
                  className="text-xs text-muted hover:text-pale font-mono flex items-center gap-1"
                >
                  <Eraser size={12} /> Clear Text
                </button>
              )}
            </div>
            
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record support visit details or type them manually here..."
              className="w-full min-h-[140px] p-3 text-sm border border-border rounded-xl focus:ring-1"
              required
            />
          </div>

          {/* Optional follow up date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted flex items-center gap-1.5" style={{ color: '#6B705C' }}>
                <Calendar size={12} /> Next Follow-Up Date (Optional)
              </label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                className="w-full text-sm border border-border rounded-xl py-2 px-3"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={recordVisitMutation.isPending || !notes.trim()}
                className="w-full btn-teal py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-50"
              >
                <Save size={16} />
                {recordVisitMutation.isPending ? 'Logging Visit...' : 'Log Support Visit'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Support Visits Timeline List (2 Columns) */}
      <div 
        className="lg:col-span-2 card relative overflow-hidden" 
        style={{ background: '#FFFFFF', border: '1px solid #E9E9E2', borderRadius: '28px', padding: '24px' }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--risk-green)' }} />
        
        <h4 className="text-pale font-sans font-bold text-base uppercase tracking-tight mb-1" style={{ color: '#2C332D' }}>
          Visits Timeline
        </h4>
        <p className="font-mono text-xs text-muted border-b border-border pb-4 mb-5" style={{ color: '#6B705C' }}>
          History of logged support visits for this patient
        </p>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 skeleton rounded-xl" />
            ))}
          </div>
        ) : visits.length === 0 ? (
          <div className="text-center py-16 text-muted font-mono text-xs uppercase tracking-wider border border-dashed border-border rounded-2xl bg-[#F8F9F5]">
            <Clock size={20} className="mx-auto mb-2 opacity-50" style={{ color: '#6B705C' }} />
            No logged field visits yet.
          </div>
        ) : (
          <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1 relative">
            {/* Thread timeline line */}
            <div className="absolute left-[15px] top-[10px] bottom-[10px] w-[1px] bg-border pointer-events-none" />

            {visits.map((visit: any, index: number) => (
              <div key={visit.id || index} className="flex gap-3 relative">
                {/* Visual anchor point */}
                <div 
                  className="w-[30px] h-[30px] rounded-full flex items-center justify-center border border-border bg-white flex-shrink-0 z-10 font-sans text-[10px] font-bold text-muted"
                  style={{ color: '#6B705C' }}
                >
                  {visits.length - index}
                </div>

                {/* Note details Card */}
                <div className="flex-1 bg-[#F8F9F5] border border-[#E9E9E2] p-3 rounded-2xl">
                  <div className="flex items-center justify-between border-b border-border/60 pb-1.5 mb-2 flex-wrap gap-2">
                    <span className="font-mono text-[10px] font-bold text-pale flex items-center gap-1">
                      <Clock size={10} />
                      {visit.visitedAt ? format(parseISO(visit.visitedAt), 'MMM d, yyyy HH:mm') : 'Recently'}
                    </span>

                    {visit.followUpDate && (
                      <span className="font-mono text-[9px] bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5">
                        Follow-up: {format(parseISO(visit.followUpDate), 'MMM d')}
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-sans text-pale leading-relaxed whitespace-pre-wrap break-words" style={{ color: '#2C332D' }}>
                    {visit.notes || 'No notes documented.'}
                  </p>

                  <div className="mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between text-[9px] font-mono text-muted">
                    <span>Field Visit Logged</span>
                    <span className="text-teal-800">Verified DOTS</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
