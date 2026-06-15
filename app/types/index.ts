export type UserRole = 'admin' | 'manager' | 'employee'
export type LeaveStatus = 'pending' | 'manager_approved' | 'approved' | 'rejected'

export interface Profile {
  id: string
  first_name: string
  last_name: string
  role: UserRole
  team_id: string | null
  joined_at: string
  birth_date: string | null
  trial_ends_at: string | null
  created_at: string
}

export interface LeaveRequest {
  id: string
  user_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  days_count: number
  status: LeaveStatus
  comment: string | null
  manager_reviewed_by: string | null
  manager_reviewed_at: string | null
  admin_reviewed_by: string | null
  admin_reviewed_at: string | null
  created_at: string
}

export interface LeaveType {
  id: string
  name: string
  color: string
  is_active: boolean
  created_at: string
}

export interface LeaveBalance {
  id: string
  user_id: string
  leave_type_id: string
  year: number
  allocated_days: number
  used_days: number
  created_at: string
}

export interface Team {
  id: string
  name: string
  created_at: string
}

export type LeaveBalanceWithType = LeaveBalance & { leave_types: LeaveType }

export type AdminBalanceRow = LeaveBalance & {
  profiles: Pick<Profile, 'id' | 'first_name' | 'last_name'>
  leave_types: Pick<LeaveType, 'id' | 'name' | 'color'>
}

export interface TeamMemberBalance {
  user_id: string
  first_name: string
  last_name: string
  allocated_days: number | null
  used_days: number | null
}

export interface ConfirmAction {
  type: 'approve' | 'reject'
  requestId: string
  employeeName: string
  startDate: string
  endDate: string
}

export interface AdminConfirmAction {
  type: 'approve' | 'reject'
  requestId: string
  currentStatus: LeaveStatus
  employeeName: string
  period: string
}

export type LeaveRequestWithRelations = LeaveRequest & {
  leave_types: Pick<LeaveType, 'id' | 'name' | 'color'>
  profiles: Pick<Profile, 'id' | 'first_name' | 'last_name' | 'team_id'> & {
    teams: Pick<Team, 'name'> | null
  }
}

export type InvoiceStatus = 'en_attente' | 'envoyee' | 'payee'
export type InvoiceCurrency = 'EUR' | 'USD' | 'GBP' | 'CAD' | 'AUD' | 'MGA'

export interface Invoice {
  id: string
  reference: string
  client: string
  amount: number
  currency: InvoiceCurrency
  invoice_date: string
  due_date: string | null
  notes: string | null
  status: InvoiceStatus
  pdf_path: string | null
  created_by: string | null
  created_at: string
}

export interface DashboardEmployee {
  id: string
  first_name: string
  last_name: string
  role: UserRole
  team_name: string | null
  joined_at: string
  on_leave: boolean
  leave_type_name: string | null
  leave_end_date: string | null
}

export interface DashboardSnapshot {
  total_employees: number
  on_leave_today: number
  on_leave_week: number
  present: number
  employees: DashboardEmployee[]
}

export interface CalendarEvent {
  id: string
  userId: string
  employeeName: string
  leaveTypeName: string
  leaveTypeColor: string
  startDate: string
  endDate: string
  status: LeaveStatus
  isOwn: boolean
  teamId?: string
  teamName?: string
}
