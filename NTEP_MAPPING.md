# NTEP Alignment & Strategic Positioning Mapping
## India's National Tuberculosis Elimination Programme (NTEP) Digital Blueprint

This document outlines how the **Adherence Monitoring & Risk Escalation Digital Portal** aligns architecturally and operationally with India’s National Tuberculosis Elimination Programme (NTEP) guidelines, the **National Strategic Plan (NSP) for TB Elimination**, and the **Ni-kshay** digital ecosystem.

---

## 1. Governance & Administrative Hierarchy Alignment
The portal is structured around the same multi-tiered administrative structure defined by the NTEP to oversee TB care delivery:

```
                  ┌────────────────────────────────────────┐
                  │      State TB Officer (STO) View       │
                  └───────────────────┬────────────────────┘
                                      ▼
                  ┌────────────────────────────────────────┐
                  │    District TB Officer (DTO) Portal    │
                  │ (Command Center, Region Filters, Cohorts)│
                  └───────────────────┬────────────────────┘
                                      ▼
                  ┌────────────────────────────────────────┐
                  │  Tuberculosis Unit (TU) Level/STLS     │
                  └───────────────────┬────────────────────┘
                                      ▼
                  ┌────────────────────────────────────────┐
                  │    Community Health Workers (ASHAs)    │
                  │ (Active Incident Feed, Direct Contacts)│
                  └────────────────────────────────────────┘
```

*   **District TB Officer (DTO) Executive Portal**: Maps directly to the district HQ dashboard, providing the DTO and Senior Treatment Supervisors (STS) with real-time views of adherence trends across multiple sub-districts and health blocks.
*   **Multi-District/Multi-Region Isolation**: Supports horizontal filtering. A DTO can filter compliance by individual rural health blocks (e.g., *Devanahalli*, *Channapatna*, *Anekal*) to pinpoint underperforming ASHAs or localized adherence drops.
*   **Health Worker Workforce Management**: Allows administrative assignment of community health workers (ASHAs/ANMs) to high-risk zones, reflecting the field-staff allocations managed at Tuberculosis Unit (TU) levels.

---

## 2. Digital DOTS & Adherence Tracking Model
NTEP guidelines mandate Direct Observation Treatment (DOTS). The traditional DOTS model requires patients to visit a clinic or have a health worker watch them swallow pills daily—creating severe financial and physical friction for patients.

*   **Hybrid Digital Adherence Monitoring (DAM)**: Modernizes DOTS by allowing self-reporting via secure, interactive digital channels (WhatsApp, SMS, Interactive Voice Response).
*   **Automated Daily Reminders**: Dispatched at patient-customized hours (e.g., 08:00 AM post-breakfast), reducing the manual tracking burden on health workers.
*   **Punitive-Free Self-Reporting**: Encourages open treatment logging. A single missed dose initiates low-friction digital follow-ups rather than immediate clinical reprimands.

---

## 3. Dynamic Risk-Stratified Clinical Escalation
The NTEP emphasizes risk-stratification of patients to prevent treatment default, multi-drug resistance (MDR-TB), and mortality. The portal implements a **Three-Tier Risk-Stratification Engine**:

| Risk Tier | Compliance Threshold | System Actions | NTEP Guideline Mapping |
| :--- | :--- | :--- | :--- |
| **Green** (Stable) | $\ge 90\%$ | Standard daily logging; weekly summaries | Standard DOTS maintenance |
| **Yellow** (Flagged) | $75\% - 89\%$ | Priority ASHA attention; warm, automated supportive checks | Early Adherence Warning (STS Intervention) |
| **Red** (High Risk) | $< 75\%$ or 3+ missed days | Immediate high-priority ASHA dispatch; urgent Caregiver alerts | **Active Default Prevention Protocol** |

*   **Active Default Prevention Protocol (Red Alert)**: When a patient misses three consecutive daily check-ins, the portal triggers an automated alert, escalating the patient directly onto the ASHA’s high-priority physical dispatch queue.
*   **Dynamic Response Tracking**: Resolving an escalation requires the ASHA to document a physical or phone follow-up reason, ensuring complete clinical accountability.

---

## 4. Family & Caregiver Notification Channel
Social and family support is a recognized pillar of the NTEP’s patient-centric care guidelines. Adherence research demonstrates that involving a second contact drastically improves completion rates.

*   **Dual-Channel Alerts**: Allows registration of a designated family member or caregiver (*e.g., Spouse, Parent, Sibling*) with their preferred messaging channel.
*   **Proactive Daily Support Notices**: Spouses/caregivers receive a supportive update when daily reminders are sent, prompting them to encourage adherence.
*   **Reactive Emergency Alerts**: If the patient's risk profile escalates to **Red**, the caregiver is automatically notified via SMS/WhatsApp, leveraging the family circle to prevent clinical default before a physical home visit is even made.

---

## 5. Integration with India’s Ni-kshay Ecosystem
The portal is designed with API-readiness and structured reporting formats to easily sync data into the Central Government’s **Ni-kshay Portal**:

*   **Ni-kshay ID Mapping**: Every patient profile includes a dedicated Ni-kshay ID field as the primary public health identifier.
*   **NTEP Cohort Adherence Curves**: Calculates cohort curves grouped by "Weeks since Treatment Start" (Wk 1 to Wk 6+), matching the standard cohort reporting formats used by the World Health Organization (WHO) and the Central TB Division.
*   **Standardized CSV Exports**: The portal exports compliance logs in a format that maps directly to the Ni-kshay batch upload schemas, enabling seamless offline data synchronization for clinics with limited internet access.

---

## 6. Enterprise Scale, Operations & Data Sovereignty
To move from a "hackathon demo" to an official national pilot, the architecture has been hardened against rigorous deployment standards:

*   **Rigorous Secrets Management**: Prioritizes secure volume mounts (`/secrets/config.json`) for sensitive database credentials and Twilio API keys over insecure plain-text `.env` variables, meeting National Informatics Centre (NIC) security audits.
*   **Automated System Health Monitoring**: Continuous background health checks monitor database connections, escalation queue status, and adherence cron heartbeat. If the automated reminder scheduler misses its 2:00 AM dispatch time, administrators are instantly flagged on the dashboard.
*   **Disaster Recovery & Hot Backups**: Implements immediate hot-backups to isolated directories and verified database restore mechanisms, ensuring zero clinical patient data loss in the event of hardware failures.
