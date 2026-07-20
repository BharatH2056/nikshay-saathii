import React from 'react';
import BotSimulator from '../components/simulator/BotSimulator';
import { Zap } from 'lucide-react';

export default function SimulatorPage() {
  return (
    <div className="space-y-8">
      {/* Info banner */}
      <div className="bg-accent/5 border border-accent/20 p-4 flex items-start gap-3">
        <Zap size={14} className="text-accent shrink-0 mt-0.5" />
        <div>
          <p className="font-mono text-sm text-accent uppercase tracking-widest font-semibold">Demo Mode Active</p>
          <p className="font-mono text-[0.85rem] text-muted mt-1 leading-relaxed">
            This simulator bypasses Twilio/WhatsApp and communicates directly with the API engine.
            Use it to demonstrate the patient→bot→dashboard loop for the IBM SkillsBuild capstone pitch.
            All risk state changes are real and will appear on the Dashboard.
          </p>
        </div>
      </div>

      <BotSimulator />
    </div>
  );
}
