export enum RiskLevel {
  GREEN = 'green',
  YELLOW = 'yellow',
  RED = 'red',
}

export enum EscalationStatus {
  OPEN = 'open',
  AUTO_RESOLVED = 'auto_resolved',
  RESOLVED = 'resolved',
}

export enum EscalationType {
  MISSED_DOSES = 'MISSED_DOSES',
  SYMPTOM_SEVERE = 'SYMPTOM_SEVERE',
}

export enum PatientStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
}

export enum CommunicationChannel {
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
}

export enum MessageStatus {
  SENT = 'sent',
  FAILED = 'failed',
}
