import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { 
  FileText, 
  Save, 
  Trash2, 
  Check, 
  Loader2, 
  AlertCircle 
} from 'lucide-react';

interface PatientStickyNoteProps {
  patientId: string;
  initialNote: string | null;
}

export default function PatientStickyNote({ patientId, initialNote }: PatientStickyNoteProps) {
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState(initialNote || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'changed' | 'saving' | 'saved' | 'error'>('idle');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state if initialNote changes (e.g. on patient fetch)
  useEffect(() => {
    setNoteText(initialNote || '');
    setSaveStatus('idle');
  }, [initialNote, patientId]);

  // Mutation to save sticky note to database
  const saveNoteMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiClient.put(`/patients/${patientId}/sticky-note`, {
        stickyNote: text || null
      });
      return res.data;
    },
    onMutate: () => {
      setSaveStatus('saving');
    },
    onSuccess: () => {
      setSaveStatus('saved');
      // Invalidate patients queries to ensure updated state throughout the app
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      
      // Keep "Saved" indicator for 2.5 seconds, then reset to idle
      const timer = setTimeout(() => {
        setSaveStatus('idle');
      }, 2500);
      return () => clearTimeout(timer);
    },
    onError: (err) => {
      console.error('Failed to save sticky note:', err);
      setSaveStatus('error');
    }
  });

  // Debounced auto-save effect
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNoteText(val);
    setSaveStatus('changed');

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new auto-save timer for 1200ms
    debounceTimerRef.current = setTimeout(() => {
      saveNoteMutation.mutate(val);
    }, 1200);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleManualSave = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    saveNoteMutation.mutate(noteText);
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear this sticky note?')) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setNoteText('');
      saveNoteMutation.mutate('');
    }
  };

  return (
    <div 
      className="card flex flex-col h-full overflow-hidden transition-all duration-300"
      style={{
        background: '#FEFDF5', // Soft, very subtle off-yellow/cream notepad color
        border: '1px solid #E3DFCE',
        borderRadius: '24px',
        padding: '20px',
        boxShadow: '0 6px 20px -8px rgba(107, 112, 92, 0.12)'
      }}
    >
      {/* Note Header */}
      <div className="flex items-center justify-between border-b border-[#EAE6D2] pb-3 mb-3.5">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-coral" />
          <h3 className="font-sans font-bold text-xs uppercase tracking-wider text-pale" style={{ margin: 0 }}>
            CHW Sticky Notes
          </h3>
        </div>

        {/* Sync/Saved Status Pill */}
        <div className="flex items-center">
          {saveStatus === 'changed' && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-warn flex items-center gap-1 bg-[#FFFBEA] px-2 py-0.5 rounded-full border border-[#F3E2B8]">
              Unsaved changes
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted flex items-center gap-1">
              <Loader2 size={10} className="animate-spin text-coral" /> Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-risk-green flex items-center gap-1 bg-[#EEF5F0] px-2 py-0.5 rounded-full border border-[#D5E6DA]">
              <Check size={10} /> Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-risk-red flex items-center gap-1 bg-[#FDF0ED] px-2 py-0.5 rounded-full border border-[#F6D5CD]">
              <AlertCircle size={10} /> Save failed
            </span>
          )}
          {saveStatus === 'idle' && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#9FA48F]">
              Ready
            </span>
          )}
        </div>
      </div>

      {/* Text Area */}
      <div className="flex-1 min-h-[140px] flex flex-col relative">
        <textarea
          value={noteText}
          onChange={handleTextChange}
          placeholder="Jot down quick, non-voice reminders for this patient here (e.g. 'Prefers afternoon visits', 'Needs help reading regimen guidelines'). Auto-saves as you type..."
          className="flex-1 w-full bg-transparent font-mono text-[11.5px] leading-relaxed text-pale resize-none outline-none focus:ring-0 placeholder:text-muted/60"
          style={{
            background: 'none !important',
            border: 'none !important',
            boxShadow: 'none !important',
            padding: '0 !important',
            borderRadius: '0 !important',
          }}
        />
      </div>

      {/* Foot Actions */}
      <div className="flex items-center justify-between border-t border-[#EAE6D2] pt-3.5 mt-3">
        <button
          onClick={handleClear}
          disabled={!noteText && saveStatus !== 'changed'}
          className="p-2 text-muted hover:text-risk-red rounded-lg transition-colors duration-150 flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest"
          title="Clear Notepad"
          style={{ background: 'transparent', border: 'none', padding: '6px' }}
        >
          <Trash2 size={12} />
          <span>Clear</span>
        </button>

        <button
          onClick={handleManualSave}
          disabled={saveStatus !== 'changed' && saveStatus !== 'error'}
          className="px-3.5 py-1.5 bg-coral hover:bg-coral-dim text-white rounded-xl flex items-center gap-1.5 transition-all duration-150 font-mono text-[10px] uppercase tracking-wider"
          style={{
            opacity: (saveStatus === 'changed' || saveStatus === 'error') ? 1 : 0.6,
            cursor: (saveStatus === 'changed' || saveStatus === 'error') ? 'pointer' : 'default',
            boxShadow: 'none'
          }}
        >
          <Save size={11} />
          Save Note
        </button>
      </div>
    </div>
  );
}
