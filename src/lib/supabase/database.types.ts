export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      completed_activities: {
        Row: {
          actual_measurement: Json | null;
          completed_session_id: string;
          created_at: string;
          id: string;
          instructions: string | null;
          measurement_mode: string;
          name: string;
          personal_activity_id: string | null;
          planned_activity_id: string | null;
          position: number;
          sport: string;
          user_id: string;
        };
        Insert: {
          actual_measurement?: Json | null;
          completed_session_id: string;
          created_at?: string;
          id?: string;
          instructions?: string | null;
          measurement_mode: string;
          name: string;
          personal_activity_id?: string | null;
          planned_activity_id?: string | null;
          position: number;
          sport: string;
          user_id: string;
        };
        Update: {
          actual_measurement?: Json | null;
          completed_session_id?: string;
          created_at?: string;
          id?: string;
          instructions?: string | null;
          measurement_mode?: string;
          name?: string;
          personal_activity_id?: string | null;
          planned_activity_id?: string | null;
          position?: number;
          sport?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "completed_activities_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "completed_activities_personal_fkey";
            columns: ["personal_activity_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "personal_activities";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "completed_activities_planned_fkey";
            columns: ["planned_activity_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "planned_activities";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "completed_activities_session_fkey";
            columns: ["completed_session_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "completed_sessions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      completed_sessions: {
        Row: {
          actual_local_date: string;
          actual_started_at: string | null;
          completion_group_id: string;
          correction_reason: string | null;
          created_at: string;
          duration_minutes: number | null;
          feeling: string | null;
          id: string;
          illness_reported: boolean;
          injury_reported: boolean;
          note: string | null;
          pain_reported: boolean;
          perceived_effort: number | null;
          planned_session_id: string | null;
          previous_completion_id: string | null;
          previous_revision_number: number | null;
          replacement_description: string | null;
          revision_number: number;
          severe_fatigue_reported: boolean;
          status: string;
          timezone_name: string;
          user_id: string;
        };
        Insert: {
          actual_local_date: string;
          actual_started_at?: string | null;
          completion_group_id: string;
          correction_reason?: string | null;
          created_at?: string;
          duration_minutes?: number | null;
          feeling?: string | null;
          id?: string;
          illness_reported?: boolean;
          injury_reported?: boolean;
          note?: string | null;
          pain_reported?: boolean;
          perceived_effort?: number | null;
          planned_session_id?: string | null;
          previous_completion_id?: string | null;
          previous_revision_number?: number | null;
          replacement_description?: string | null;
          revision_number: number;
          severe_fatigue_reported?: boolean;
          status: string;
          timezone_name: string;
          user_id: string;
        };
        Update: {
          actual_local_date?: string;
          actual_started_at?: string | null;
          completion_group_id?: string;
          correction_reason?: string | null;
          created_at?: string;
          duration_minutes?: number | null;
          feeling?: string | null;
          id?: string;
          illness_reported?: boolean;
          injury_reported?: boolean;
          note?: string | null;
          pain_reported?: boolean;
          perceived_effort?: number | null;
          planned_session_id?: string | null;
          previous_completion_id?: string | null;
          previous_revision_number?: number | null;
          replacement_description?: string | null;
          revision_number?: number;
          severe_fatigue_reported?: boolean;
          status?: string;
          timezone_name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "completed_sessions_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "completed_sessions_plan_fkey";
            columns: ["planned_session_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "planned_sessions";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "completed_sessions_previous_fkey";
            columns: [
              "previous_completion_id",
              "user_id",
              "completion_group_id",
              "previous_revision_number",
            ];
            isOneToOne: false;
            referencedRelation: "completed_sessions";
            referencedColumns: [
              "id",
              "user_id",
              "completion_group_id",
              "revision_number",
            ];
          },
        ];
      };
      completion_heads: {
        Row: {
          completion_group_id: string;
          current_completion_id: string;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completion_group_id: string;
          current_completion_id: string;
          revision: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completion_group_id?: string;
          current_completion_id?: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "completion_heads_current_fkey";
            columns: [
              "current_completion_id",
              "user_id",
              "completion_group_id",
              "revision",
            ];
            isOneToOne: false;
            referencedRelation: "completed_sessions";
            referencedColumns: [
              "id",
              "user_id",
              "completion_group_id",
              "revision_number",
            ];
          },
          {
            foreignKeyName: "completion_heads_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      detailed_plan_heads: {
        Row: {
          current_version_id: string;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          current_version_id: string;
          revision: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          current_version_id?: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "detailed_plan_heads_current_fkey";
            columns: ["current_version_id", "user_id", "revision"];
            isOneToOne: false;
            referencedRelation: "detailed_plan_versions";
            referencedColumns: ["id", "user_id", "version_number"];
          },
          {
            foreignKeyName: "detailed_plan_heads_owner_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      detailed_plan_versions: {
        Row: {
          accepted_at: string;
          created_at: string;
          day_count: number;
          end_date: string;
          id: string;
          parent_version_id: string | null;
          parent_version_number: number | null;
          source_kind: string;
          start_date: string;
          timezone_name: string;
          user_id: string;
          version_number: number;
        };
        Insert: {
          accepted_at?: string;
          created_at?: string;
          day_count: number;
          end_date: string;
          id?: string;
          parent_version_id?: string | null;
          parent_version_number?: number | null;
          source_kind?: string;
          start_date: string;
          timezone_name: string;
          user_id: string;
          version_number: number;
        };
        Update: {
          accepted_at?: string;
          created_at?: string;
          day_count?: number;
          end_date?: string;
          id?: string;
          parent_version_id?: string | null;
          parent_version_number?: number | null;
          source_kind?: string;
          start_date?: string;
          timezone_name?: string;
          user_id?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "detailed_plan_versions_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "detailed_plan_versions_parent_fkey";
            columns: ["parent_version_id", "user_id", "parent_version_number"];
            isOneToOne: false;
            referencedRelation: "detailed_plan_versions";
            referencedColumns: ["id", "user_id", "version_number"];
          },
        ];
      };
      personal_activities: {
        Row: {
          archived_at: string | null;
          created_at: string;
          default_measurement: Json | null;
          description: string | null;
          id: string;
          measurement_mode: string;
          name: string;
          sport: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          default_measurement?: Json | null;
          description?: string | null;
          id?: string;
          measurement_mode: string;
          name: string;
          sport: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          default_measurement?: Json | null;
          description?: string | null;
          id?: string;
          measurement_mode?: string;
          name?: string;
          sport?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "personal_activities_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      planned_activities: {
        Row: {
          created_at: string;
          id: string;
          instructions: string | null;
          is_locked: boolean;
          measurement_mode: string;
          name: string;
          personal_activity_id: string | null;
          planned_session_id: string;
          position: number;
          sport: string;
          target: Json | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          instructions?: string | null;
          is_locked?: boolean;
          measurement_mode: string;
          name: string;
          personal_activity_id?: string | null;
          planned_session_id: string;
          position: number;
          sport: string;
          target?: Json | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          instructions?: string | null;
          is_locked?: boolean;
          measurement_mode?: string;
          name?: string;
          personal_activity_id?: string | null;
          planned_session_id?: string;
          position?: number;
          sport?: string;
          target?: Json | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "planned_activities_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "planned_activities_personal_fkey";
            columns: ["personal_activity_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "personal_activities";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "planned_activities_session_fkey";
            columns: ["planned_session_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "planned_sessions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      planned_sessions: {
        Row: {
          created_at: string;
          expected_duration_minutes: number | null;
          id: string;
          intent: string | null;
          is_locked: boolean;
          local_date: string;
          note: string | null;
          plan_version_id: string;
          position: number;
          sport: string;
          title: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expected_duration_minutes?: number | null;
          id?: string;
          intent?: string | null;
          is_locked?: boolean;
          local_date: string;
          note?: string | null;
          plan_version_id: string;
          position: number;
          sport: string;
          title: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expected_duration_minutes?: number | null;
          id?: string;
          intent?: string | null;
          is_locked?: boolean;
          local_date?: string;
          note?: string | null;
          plan_version_id?: string;
          position?: number;
          sport?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "planned_sessions_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "planned_sessions_plan_fkey";
            columns: ["plan_version_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "detailed_plan_versions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_valid_training_measurement: {
        Args: { p_mode: string; p_value: Json };
        Returns: boolean;
      };
      save_manual_plan_version: {
        Args: {
          p_day_count: number;
          p_expected_revision: number;
          p_sessions: Json;
          p_start_date: string;
          p_timezone_name: string;
        };
        Returns: {
          accepted_at: string;
          created_at: string;
          day_count: number;
          end_date: string;
          id: string;
          parent_version_id: string | null;
          parent_version_number: number | null;
          source_kind: string;
          start_date: string;
          timezone_name: string;
          user_id: string;
          version_number: number;
        };
        SetofOptions: {
          from: "*";
          to: "detailed_plan_versions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
