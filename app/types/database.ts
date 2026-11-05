export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      company_settings: {
        Row: {
          address: string
          bic: string
          default_country: string
          iban: string
          id: boolean
          invoice_footer: string
          invoice_prefix: string
          legal_name: string
          next_invoice_number: number
          updated_at: string
          vat_number: string
        }
        Insert: {
          address?: string
          bic?: string
          default_country?: string
          iban?: string
          id?: boolean
          invoice_footer?: string
          invoice_prefix?: string
          legal_name?: string
          next_invoice_number?: number
          updated_at?: string
          vat_number?: string
        }
        Update: {
          address?: string
          bic?: string
          default_country?: string
          iban?: string
          id?: boolean
          invoice_footer?: string
          invoice_prefix?: string
          legal_name?: string
          next_invoice_number?: number
          updated_at?: string
          vat_number?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          description: string
          id: string
          invoice_id: string
          position: number
          quantity: number
          unit_price: number
          vat_rate: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          position?: number
          quantity: number
          unit_price: number
          vat_rate?: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          quantity?: number
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client: string
          created_at: string | null
          created_by: string | null
          currency: string
          due_date: string | null
          id: string
          invoice_date: string
          notes: string | null
          pdf_path: string | null
          reference: string
          status: string
        }
        Insert: {
          amount: number
          client: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          invoice_date: string
          notes?: string | null
          pdf_path?: string | null
          reference: string
          status?: string
        }
        Update: {
          amount?: number
          client?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          notes?: string | null
          pdf_path?: string | null
          reference?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_history: {
        Row: {
          actor_id: string | null
          changed_at: string
          from_status: string | null
          id: number
          issue_id: string
          to_status: string | null
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          changed_at: string
          from_status?: string | null
          id?: number
          issue_id: string
          to_status?: string | null
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          changed_at?: string
          from_status?: string | null
          id?: number
          issue_id?: string
          to_status?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_history_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "linear_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          allocated_days: number
          created_at: string
          id: string
          leave_type_id: string
          used_days: number
          user_id: string
          year: number
        }
        Insert: {
          allocated_days?: number
          created_at?: string
          id?: string
          leave_type_id: string
          used_days?: number
          user_id: string
          year: number
        }
        Update: {
          allocated_days?: number
          created_at?: string
          id?: string
          leave_type_id?: string
          used_days?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          is_exception: boolean
          exception_reason: string | null
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          cancel_requested_at: string | null
          cancelled_at: string | null
          comment: string | null
          created_at: string
          days_count: number
          end_date: string
          end_half: boolean
          id: string
          leave_type_id: string
          manager_reviewed_at: string | null
          manager_reviewed_by: string | null
          review_comment: string | null
          start_date: string
          start_half: boolean
          status: string
          user_id: string
        }
        Insert: {
          is_exception?: boolean
          exception_reason?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          cancel_requested_at?: string | null
          cancelled_at?: string | null
          comment?: string | null
          created_at?: string
          days_count: number
          end_date: string
          end_half?: boolean
          id?: string
          leave_type_id: string
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          review_comment?: string | null
          start_date: string
          start_half?: boolean
          status?: string
          user_id: string
        }
        Update: {
          is_exception?: boolean
          exception_reason?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          cancel_requested_at?: string | null
          cancelled_at?: string | null
          comment?: string | null
          created_at?: string
          days_count?: number
          end_date?: string
          end_half?: boolean
          id?: string
          leave_type_id?: string
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          review_comment?: string | null
          start_date?: string
          start_half?: boolean
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_admin_reviewed_by_fkey"
            columns: ["admin_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_manager_reviewed_by_fkey"
            columns: ["manager_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          tracks_balance: boolean
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tracks_balance?: boolean
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tracks_balance?: boolean
        }
        Relationships: []
      }
      linear_issues: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string | null
          estimate: number | null
          id: string
          identifier: string | null
          labels: Json | null
          qa_started_at: string | null
          raw: Json | null
          started_at: string | null
          status: string | null
          status_type: string | null
          team_id: string | null
          title: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          estimate?: number | null
          id: string
          identifier?: string | null
          labels?: Json | null
          qa_started_at?: string | null
          raw?: Json | null
          started_at?: string | null
          status?: string | null
          status_type?: string | null
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          estimate?: number | null
          id?: string
          identifier?: string | null
          labels?: Json | null
          qa_started_at?: string | null
          raw?: Json | null
          started_at?: string | null
          status?: string | null
          status_type?: string | null
          team_id?: string | null
          title?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linear_issues_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "linear_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linear_issues_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      linear_teams: {
        Row: {
          id: string
          name: string | null
          raw: Json | null
          workspace_id: string
        }
        Insert: {
          id: string
          name?: string | null
          raw?: Json | null
          workspace_id: string
        }
        Update: {
          id?: string
          name?: string | null
          raw?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linear_teams_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      linear_users: {
        Row: {
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean | null
          raw: Json | null
          synced_at: string | null
          workspace_id: string
        }
        Insert: {
          display_name?: string | null
          email?: string | null
          id: string
          is_active?: boolean | null
          raw?: Json | null
          synced_at?: string | null
          workspace_id: string
        }
        Update: {
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          raw?: Json | null
          synced_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linear_users_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_snapshots: {
        Row: {
          avg_size: number | null
          bugs_count: number | null
          computed_at: string | null
          id: number
          median_dev_cycle_hours: number | null
          median_lead_time_hours: number | null
          median_qa_time_hours: number | null
          median_review_time_hours: number | null
          month: string
          p90_dev_cycle_hours: number | null
          points_sum: number | null
          rework_rate: number | null
          team_id: string | null
          ticket_ids: string[] | null
          tickets_count: number | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          avg_size?: number | null
          bugs_count?: number | null
          computed_at?: string | null
          id?: number
          median_dev_cycle_hours?: number | null
          median_lead_time_hours?: number | null
          median_qa_time_hours?: number | null
          median_review_time_hours?: number | null
          month: string
          p90_dev_cycle_hours?: number | null
          points_sum?: number | null
          rework_rate?: number | null
          team_id?: string | null
          ticket_ids?: string[] | null
          tickets_count?: number | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          avg_size?: number | null
          bugs_count?: number | null
          computed_at?: string | null
          id?: number
          median_dev_cycle_hours?: number | null
          median_lead_time_hours?: number | null
          median_qa_time_hours?: number | null
          median_review_time_hours?: number | null
          month?: string
          p90_dev_cycle_hours?: number | null
          points_sum?: number | null
          rework_rate?: number | null
          team_id?: string | null
          ticket_ids?: string[] | null
          tickets_count?: number | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          created_at: string | null
          id: string
          notification_type: string
          recipients: string[]
          sent_date: string
          subject_user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notification_type: string
          recipients?: string[]
          sent_date?: string
          subject_user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notification_type?: string
          recipients?: string[]
          sent_date?: string
          subject_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          data: Json
          id: string
          kind: string
          read_at: string | null
          request_id: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind: string
          read_at?: string | null
          request_id?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          read_at?: string | null
          request_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birth_date: string | null
          country: string
          created_at: string
          first_name: string
          id: string
          joined_at: string
          last_name: string
          role: string
          team_id: string | null
          trial_ends_at: string | null
        }
        Insert: {
          birth_date?: string | null
          country?: string
          created_at?: string
          first_name: string
          id: string
          joined_at: string
          last_name: string
          role: string
          team_id?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          birth_date?: string | null
          country?: string
          created_at?: string
          first_name?: string
          id?: string
          joined_at?: string
          last_name?: string
          role?: string
          team_id?: string | null
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      public_holidays: {
        Row: {
          country: string
          day: string
          name: string
        }
        Insert: {
          country: string
          day: string
          name: string
        }
        Update: {
          country?: string
          day?: string
          name?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string | null
          id: string
          last_synced_at: string | null
          linear_api_key: string
          name: string
          selected_teams: Json | null
          sync_error: string | null
          sync_finished_at: string | null
          sync_issues_done: number
          sync_started_at: string | null
          sync_status: string
          sync_teams_done: number
          sync_teams_total: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          linear_api_key: string
          name: string
          selected_teams?: Json | null
          sync_error?: string | null
          sync_finished_at?: string | null
          sync_issues_done?: number
          sync_started_at?: string | null
          sync_status?: string
          sync_teams_done?: number
          sync_teams_total?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          linear_api_key?: string
          name?: string
          selected_teams?: Json | null
          sync_error?: string | null
          sync_finished_at?: string | null
          sync_issues_done?: number
          sync_started_at?: string | null
          sync_status?: string
          sync_teams_done?: number
          sync_teams_total?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _validate_leave: {
        Args: {
          p_end: string
          p_end_half: boolean
          p_exclude_id: string
          p_leave_type_id: string
          p_start: string
          p_start_half: boolean
          p_user_id: string
        }
        Returns: number
      }
      admin_update_profile: {
        Args: {
          p_country: string
          p_first_name: string
          p_id: string
          p_joined_at: string
          p_last_name: string
          p_role: string
          p_team_id: string
        }
        Returns: undefined
      }
      admin_delete_team: {
        Args: { p_id: string }
        Returns: undefined
      }
      approve_leave_exception: {
        Args: { p_request_id: string, p_reason: string }
        Returns: string
      }
      admin_save_team: {
        Args: { p_id: string | null, p_name: string, p_manager_id: string | null, p_member_ids: string[] }
        Returns: string
      }
      admin_upsert_team: {
        Args: { p_id: string; p_name: string }
        Returns: string
      }
      auth_role: { Args: never; Returns: string }
      auth_team_id: { Args: never; Returns: string }
      cancel_leave_request: { Args: { p_request_id: string }; Returns: string }
      claim_invoice_reference: { Args: never; Returns: string }
      count_leave_days: {
        Args: {
          p_end: string
          p_end_half?: boolean
          p_start: string
          p_start_half?: boolean
          p_user_id: string
        }
        Returns: number
      }
      create_leave_request: {
        Args: {
          p_comment?: string
          p_end_date: string
          p_end_half?: boolean
          p_leave_type_id: string
          p_start_date: string
          p_start_half?: boolean
        }
        Returns: string
      }
      easter_sunday: { Args: { p_year: number }; Returns: string }
      get_dashboard_snapshot: { Args: never; Returns: Json }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      preview_leave_days: {
        Args: {
          p_end: string
          p_end_half?: boolean
          p_start: string
          p_start_half?: boolean
        }
        Returns: number
      }
      review_cancellation: {
        Args: { p_decision: string; p_request_id: string }
        Returns: string
      }
      review_leave_request: {
        Args: { p_comment?: string; p_decision: string; p_request_id: string }
        Returns: string
      }
      update_leave_request: {
        Args: {
          p_comment?: string
          p_end_date: string
          p_end_half?: boolean
          p_leave_type_id: string
          p_request_id: string
          p_start_date: string
          p_start_half?: boolean
        }
        Returns: number
      }
      upsert_leave_type_balances: {
        Args: {
          p_allocated_days?: number
          p_leave_type_id: string
          p_year: number
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

