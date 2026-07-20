import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { X, UploadCloud, Download, AlertTriangle, CheckCircle, FileSpreadsheet } from 'lucide-react';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BulkImportModal({ isOpen, onClose }: BulkImportModalProps) {
  const queryClient = useQueryClient();
  const [dragActive, setDragActive] = useState(false);
  const [csvData, setCsvData] = useState('');
  const [fileName, setFileName] = useState('');
  const [isPasting, setIsPasting] = useState(false);
  const [importResult, setImportResult] = useState<{
    summary: { totalRows: number; successCount: number; failCount: number };
    results: Array<{ row: number; status: 'success' | 'error'; name?: string; error?: string }>;
  } | null>(null);

  const importMutation = useMutation({
    mutationFn: async (data: string) => {
      const res = await apiClient.post('/patients/import', { csvData: data });
      return res.data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (file && file.name.endsWith('.csv')) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setCsvData(text);
      };
      reader.readAsText(file);
    } else {
      alert("Please upload a valid CSV file (.csv)");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDownloadTemplate = () => {
    const template = `fullName,phone,consentGiven,channelPref,language,condition,regimenType,treatmentStart,treatmentDurationDays,medicationSupplyDays,caregiverName,caregiverPhone,caregiverRelation,caregiverChannelPref
Rajesh Naik,9876543210,true,whatsapp,en,TB,standard_6mo_dots,2026-07-20,180,30,Suman Naik,9876543211,Spouse,whatsapp
Anjali Gowda,9123456789,true,sms,ka,TB,standard_6mo_dots,2026-07-15,180,30,,,
`;
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'patient_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvData.trim()) return;
    importMutation.mutate(csvData);
  };

  const handleReset = () => {
    setCsvData('');
    setFileName('');
    setImportResult(null);
    importMutation.reset();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/90 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-2xl relative overflow-hidden flex flex-col max-h-[90vh] animate-slide-up rounded-md"
        style={{ background: 'var(--charcoal)', border: '1px solid var(--border)' }}
      >
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--coral)' }} />

        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} style={{ color: 'var(--coral)' }} />
            <h3 style={{ color: 'var(--coral)', fontSize: '0.9375rem' }} className="font-mono uppercase font-bold tracking-wider">
              Bulk Patient CSV Import
            </h3>
          </div>
          <button 
            onClick={onClose} 
            style={{ color: 'var(--muted)' }}
            className="hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {!importResult ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="font-mono text-[0.6875rem] text-muted uppercase">Import TB cohort registry in bulk</p>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="font-mono text-[0.6875rem] text-coral hover:underline flex items-center gap-1 bg-transparent border-0 cursor-pointer p-0"
                >
                  <Download size={12} /> Download CSV Template
                </button>
              </div>

              {/* Selector Tabs */}
              <div className="flex border-b border-border/40 gap-1">
                <button
                  type="button"
                  onClick={() => { setIsPasting(false); handleReset(); }}
                  className={`px-4 py-2 font-mono text-[0.6875rem] uppercase tracking-wider border-b-2 transition-all ${!isPasting ? 'border-coral text-coral' : 'border-transparent text-muted hover:text-white'}`}
                >
                  File Upload
                </button>
                <button
                  type="button"
                  onClick={() => { setIsPasting(true); handleReset(); }}
                  className={`px-4 py-2 font-mono text-[0.6875rem] uppercase tracking-wider border-b-2 transition-all ${isPasting ? 'border-coral text-coral' : 'border-transparent text-muted hover:text-white'}`}
                >
                  Paste Raw CSV
                </button>
              </div>

              {/* Upload Interface */}
              {!isPasting ? (
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    dragActive ? 'border-coral bg-coral-dim/10' : 'border-border/60 hover:border-border/100'
                  }`}
                >
                  <input
                    id="csv-file-input"
                    type="file"
                    accept=".csv"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                  <label htmlFor="csv-file-input" className="cursor-pointer flex flex-col items-center gap-3">
                    <div className="p-3 bg-surface border border-border/40 rounded-full text-muted">
                      <UploadCloud size={24} />
                    </div>
                    {fileName ? (
                      <div className="space-y-1">
                        <p className="font-mono text-sm font-semibold text-white">{fileName}</p>
                        <p className="font-mono text-[0.6875rem] text-muted uppercase">Ready for processing</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-mono text-xs text-pale uppercase font-semibold">
                          Drag & Drop CSV file here, or <span className="text-coral underline">browse</span>
                        </p>
                        <p className="font-mono text-[0.625rem] text-muted uppercase">
                          Supported format: .csv · DPDP explicit consent required per row
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Raw Comma-Separated Values</label>
                  <textarea
                    rows={8}
                    placeholder="fullName,phone,consentGiven,channelPref,language...&#10;Rajesh Naik,9876543210,true,whatsapp,en..."
                    value={csvData}
                    onChange={(e) => setCsvData(e.target.value)}
                    className="w-full font-mono text-xs p-3 bg-dark border border-border focus:border-coral focus:ring-0 rounded-xl"
                  />
                </div>
              )}

              {/* Consent check */}
              {csvData.trim() && (
                <div className="p-3.5 bg-surface/30 border border-border/40 rounded-xl font-mono text-[0.6875rem] text-muted leading-relaxed uppercase">
                  ⚡ ALL IMPORTED RECORDS MUST INCLUDE A <code className="text-coral font-bold font-mono">consentGiven</code> COLUMN SET TO <code className="text-risk-green font-bold font-mono">true</code> OR <code className="text-risk-green font-bold font-mono">yes</code> IN ORDER TO INGEST DATA PURSUANT TO THE INDIA DPDP ACT COMPLIANCE DIRECTIVES.
                </div>
              )}

              {importMutation.error && (
                <div className="p-3 bg-risk-red/10 border border-risk-red/30 rounded-xl font-mono text-[0.75rem] text-risk-red">
                  ⚠ Error: {(importMutation.error as any)?.response?.data?.error || 'Failed to parse and import patients'}
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-border/40">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 btn-ghost py-2.5 justify-center text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!csvData.trim() || importMutation.isPending}
                  className="flex-1 btn-primary py-2.5 justify-center text-xs"
                >
                  {importMutation.isPending ? 'Processing Import...' : 'Import Patient Cohort'}
                </button>
              </div>
            </form>
          ) : (
            /* Results View */
            <div className="space-y-5 animate-fade-in">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-surface/40 border border-border/40 text-center rounded-xl">
                  <p className="font-mono text-2xl font-bold text-white">{importResult.summary.totalRows}</p>
                  <p className="font-mono text-[0.6rem] text-muted uppercase mt-1">Total Parsed</p>
                </div>
                <div className="p-4 bg-risk-green/5 border border-risk-green/30 text-center rounded-xl">
                  <p className="font-mono text-2xl font-bold text-risk-green">{importResult.summary.successCount}</p>
                  <p className="font-mono text-[0.6rem] text-risk-green uppercase mt-1">Ingested (Success)</p>
                </div>
                <div className="p-4 bg-risk-red/5 border border-risk-red/30 text-center rounded-xl">
                  <p className="font-mono text-2xl font-bold text-risk-red">{importResult.summary.failCount}</p>
                  <p className="font-mono text-[0.6rem] text-risk-red uppercase mt-1">Failed Records</p>
                </div>
              </div>

              {/* Per-row Audit Log */}
              <div className="space-y-2">
                <h4 className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted font-bold">Per-Row Ingestion Ledger</h4>
                <div className="border border-border/60 max-h-[30vh] overflow-y-auto font-mono text-xs rounded-xl divide-y divide-border/30 bg-dark">
                  {importResult.results.map((r, i) => (
                    <div key={i} className="p-3 flex items-start gap-3 hover:bg-surface/10">
                      <span className="text-muted w-14 font-semibold">Row {r.row}</span>
                      {r.status === 'success' ? (
                        <div className="flex items-center gap-1.5 text-risk-green flex-1 uppercase text-[0.6875rem]">
                          <CheckCircle size={12} />
                          <span>Successfully enrolled patient: <strong>{r.name}</strong></span>
                        </div>
                      ) : (
                        <div className="space-y-1 text-risk-red flex-1 uppercase text-[0.6875rem]">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle size={12} />
                            <span>Failed {r.name ? `(${r.name})` : ''}</span>
                          </div>
                          <p className="text-muted text-[0.625rem] font-mono whitespace-pre-wrap">{r.error}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-border/40">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 btn-ghost py-2.5 justify-center text-xs"
                >
                  Import Another File
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 btn-primary py-2.5 justify-center text-xs"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
