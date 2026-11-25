/** Tables in the weekly backup (selfie and document files stay in their private buckets). */
export const BACKUP_TABLES = [
  "profiles", "departments", "hr_records", "hr_private", "hr_notes", "employee_documents", "shifts", "attendance", "attendance_location", "field_sites",
  "leave_types", "leave_balances", "leave_requests", "holidays", "disciplinary_cases", "reviews", "projects", "project_members", "milestones", "tasks", "task_comments",
  "task_checklist", "task_history", "meetings", "meeting_attendees", "issue_types", "issues", "issue_amounts", "issue_events", "clients", "client_kiosks", "contracts",
  "client_terms", "client_notes", "kiosk_usage_monthly", "cs_cases", "cs_case_events", "cs_refund_requests", "cs_quick_replies", "cs_targets", "cs_quality_reviews",
  "business_metrics", "access_requests", "invites", "access_changes", "app_settings", "app_releases", "notifications", "audit_log",
] as const;
