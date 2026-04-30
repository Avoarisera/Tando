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
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          comment: string | null
          created_at: string
          days_count: number
          end_date: string
          id: string
          leave_type_id: string
          manager_reviewed_at: string | null
          manager_reviewed_by: string | null
          start_date: string
          status: string
          user_id: string
        }
        Insert: {
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          comment?: string | null
          created_at?: string
          days_count: number
          end_date: string
          id?: string
          leave_type_id: string
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          start_date: string
          status?: string
          user_id: string
        }
        Update: {
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          comment?: string | null
          created_at?: string
          days_count?: number
          end_date?: string
          id?: string
          leave_type_id?: string
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          start_date?: string
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
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
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
          month: string
          points_sum: number | null
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
          month: string
          points_sum?: number | null
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
          month?: string
          points_sum?: number | null
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
      profiles: {
        Row: {
          created_at: string
          first_name: string
          id: string
          joined_at: string
          last_name: string
          role: string
          team_id: string | null
        }
        Insert: {
          created_at?: string
          first_name: string
          id: string
          joined_at: string
          last_name: string
          role: string
          team_id?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          joined_at?: string
          last_name?: string
          role?: string
          team_id?: string | null
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
          selected_teams: { id: string; name: string }[] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          linear_api_key: string
          name: string
          selected_teams?: { id: string; name: string }[] | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          linear_api_key?: string
          name?: string
          selected_teams?: { id: string; name: string }[] | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_role: { Args: never; Returns: string }
      auth_team_id: { Args: never; Returns: string }
      create_leave_request: {
        Args: {
          p_comment?: string
          p_end_date: string
          p_leave_type_id: string
          p_start_date: string
        }
        Returns: string
      }
      upsert_leave_type_balances: {
        Args: {
          p_leave_type_id: string
          p_year: number
          p_allocated_days?: number
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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

