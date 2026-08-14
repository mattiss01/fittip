export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_spend_reservations: {
        Row: {
          charged_micro_usd: number | null;
          created_at: string;
          currency: string;
          expires_at: string;
          id: string;
          operation: string;
          rate_card_version: string;
          reserved_micro_usd: number;
          settled_at: string | null;
          settlement_token: string;
          spend_day: string;
          user_id: string;
        };
        Insert: {
          charged_micro_usd?: number | null;
          created_at?: string;
          currency?: string;
          expires_at: string;
          id?: string;
          operation: string;
          rate_card_version: string;
          reserved_micro_usd: number;
          settled_at?: string | null;
          settlement_token?: string;
          spend_day: string;
          user_id: string;
        };
        Update: {
          charged_micro_usd?: number | null;
          created_at?: string;
          currency?: string;
          expires_at?: string;
          id?: string;
          operation?: string;
          rate_card_version?: string;
          reserved_micro_usd?: number;
          settled_at?: string | null;
          settlement_token?: string;
          spend_day?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_spend_reservations_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
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
          idempotency_fingerprint: string;
          idempotency_key: string;
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
          idempotency_fingerprint?: string;
          idempotency_key?: string;
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
          idempotency_fingerprint?: string;
          idempotency_key?: string;
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
      goal_collections: {
        Row: {
          revision: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          revision?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_collections_owner_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      goal_lifecycle_events: {
        Row: {
          collection_revision: number;
          created_at: string;
          from_status: string;
          goal_id: string;
          id: string;
          to_status: string;
          user_id: string;
        };
        Insert: {
          collection_revision: number;
          created_at?: string;
          from_status: string;
          goal_id: string;
          id?: string;
          to_status: string;
          user_id: string;
        };
        Update: {
          collection_revision?: number;
          created_at?: string;
          from_status?: string;
          goal_id?: string;
          id?: string;
          to_status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_lifecycle_events_goal_fkey";
            columns: ["goal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "goal_lifecycle_events_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      goals: {
        Row: {
          active_rank: number | null;
          activity_areas: string[];
          archived_at: string | null;
          category: string;
          constraints_text: string | null;
          created_at: string;
          desired_outcome: string;
          id: string;
          last_active_rank: number | null;
          priority_tier: string;
          rationale: string | null;
          start_date: string;
          status: string;
          target_date: string | null;
          target_detail: string | null;
          target_metric_label: string | null;
          target_metric_unit: string | null;
          target_metric_value: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active_rank?: number | null;
          activity_areas?: string[];
          archived_at?: string | null;
          category: string;
          constraints_text?: string | null;
          created_at?: string;
          desired_outcome: string;
          id?: string;
          last_active_rank?: number | null;
          priority_tier: string;
          rationale?: string | null;
          start_date: string;
          status?: string;
          target_date?: string | null;
          target_detail?: string | null;
          target_metric_label?: string | null;
          target_metric_unit?: string | null;
          target_metric_value?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active_rank?: number | null;
          activity_areas?: string[];
          archived_at?: string | null;
          category?: string;
          constraints_text?: string | null;
          created_at?: string;
          desired_outcome?: string;
          id?: string;
          last_active_rank?: number | null;
          priority_tier?: string;
          rationale?: string | null;
          start_date?: string;
          status?: string;
          target_date?: string | null;
          target_detail?: string | null;
          target_metric_label?: string | null;
          target_metric_unit?: string | null;
          target_metric_value?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      memory_collections: {
        Row: {
          revision: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          revision?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memory_collections_owner_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      memory_deletion_events: {
        Row: {
          collection_revision: number;
          created_at: string;
          id: string;
          item_id: string;
          memory_type: string;
          purged_revision_count: number;
          user_id: string;
        };
        Insert: {
          collection_revision: number;
          created_at?: string;
          id?: string;
          item_id: string;
          memory_type: string;
          purged_revision_count: number;
          user_id: string;
        };
        Update: {
          collection_revision?: number;
          created_at?: string;
          id?: string;
          item_id?: string;
          memory_type?: string;
          purged_revision_count?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memory_deletion_events_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      memory_items: {
        Row: {
          confidence: number | null;
          created_at: string;
          current_revision_id: string;
          expires_on: string | null;
          id: string;
          intake_field_key: string | null;
          memory_type: string;
          provenance: string;
          source_reference: string | null;
          status: string;
          status_changed_at: string;
          updated_at: string;
          user_confirmed_at: string | null;
          user_id: string;
        };
        Insert: {
          confidence?: number | null;
          created_at?: string;
          current_revision_id: string;
          expires_on?: string | null;
          id?: string;
          intake_field_key?: string | null;
          memory_type: string;
          provenance: string;
          source_reference?: string | null;
          status: string;
          status_changed_at?: string;
          updated_at?: string;
          user_confirmed_at?: string | null;
          user_id: string;
        };
        Update: {
          confidence?: number | null;
          created_at?: string;
          current_revision_id?: string;
          expires_on?: string | null;
          id?: string;
          intake_field_key?: string | null;
          memory_type?: string;
          provenance?: string;
          source_reference?: string | null;
          status?: string;
          status_changed_at?: string;
          updated_at?: string;
          user_confirmed_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memory_items_current_revision_fkey";
            columns: ["current_revision_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "memory_revisions";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "memory_items_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      memory_revisions: {
        Row: {
          author_class: string;
          change_kind: string;
          content: string;
          created_at: string;
          id: string;
          item_id: string;
          previous_revision_id: string | null;
          provenance: string;
          revision_number: number;
          status_after: string;
          user_id: string;
        };
        Insert: {
          author_class: string;
          change_kind: string;
          content: string;
          created_at?: string;
          id?: string;
          item_id: string;
          previous_revision_id?: string | null;
          provenance: string;
          revision_number: number;
          status_after: string;
          user_id: string;
        };
        Update: {
          author_class?: string;
          change_kind?: string;
          content?: string;
          created_at?: string;
          id?: string;
          item_id?: string;
          previous_revision_id?: string | null;
          provenance?: string;
          revision_number?: number;
          status_after?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memory_revisions_item_fkey";
            columns: ["item_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "memory_items";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "memory_revisions_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "memory_revisions_previous_fkey";
            columns: ["previous_revision_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "memory_revisions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      onboarding_drafts: {
        Row: {
          access_labels: string[];
          available_days: string[];
          created_at: string;
          current_step: number;
          expires_at: string;
          id: string;
          idempotency_key: string;
          revision: number;
          session_duration_minutes: number | null;
          sessions_per_week: number | null;
          timezone_name: string | null;
          training_status: string | null;
          units_system: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          access_labels?: string[];
          available_days?: string[];
          created_at?: string;
          current_step?: number;
          expires_at: string;
          id?: string;
          idempotency_key?: string;
          revision?: number;
          session_duration_minutes?: number | null;
          sessions_per_week?: number | null;
          timezone_name?: string | null;
          training_status?: string | null;
          units_system?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          access_labels?: string[];
          available_days?: string[];
          created_at?: string;
          current_step?: number;
          expires_at?: string;
          id?: string;
          idempotency_key?: string;
          revision?: number;
          session_duration_minutes?: number | null;
          sessions_per_week?: number | null;
          timezone_name?: string | null;
          training_status?: string | null;
          units_system?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_drafts_owner_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      onboarding_goal_candidates: {
        Row: {
          activity_areas: string[];
          category: string;
          constraints_text: string | null;
          decision: string;
          desired_outcome: string;
          draft_id: string;
          id: string;
          position: number;
          priority_tier: string;
          rationale: string | null;
          resolution: string | null;
          start_date: string;
          target_date: string | null;
          target_detail: string | null;
          target_goal_id: string | null;
          target_metric_label: string | null;
          target_metric_unit: string | null;
          target_metric_value: string | null;
          target_rank: number | null;
          title: string;
          user_id: string;
        };
        Insert: {
          activity_areas?: string[];
          category: string;
          constraints_text?: string | null;
          decision?: string;
          desired_outcome: string;
          draft_id: string;
          id?: string;
          position: number;
          priority_tier: string;
          rationale?: string | null;
          resolution?: string | null;
          start_date: string;
          target_date?: string | null;
          target_detail?: string | null;
          target_goal_id?: string | null;
          target_metric_label?: string | null;
          target_metric_unit?: string | null;
          target_metric_value?: string | null;
          target_rank?: number | null;
          title: string;
          user_id: string;
        };
        Update: {
          activity_areas?: string[];
          category?: string;
          constraints_text?: string | null;
          decision?: string;
          desired_outcome?: string;
          draft_id?: string;
          id?: string;
          position?: number;
          priority_tier?: string;
          rationale?: string | null;
          resolution?: string | null;
          start_date?: string;
          target_date?: string | null;
          target_detail?: string | null;
          target_goal_id?: string | null;
          target_metric_label?: string | null;
          target_metric_unit?: string | null;
          target_metric_value?: string | null;
          target_rank?: number | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_goal_candidates_draft_fkey";
            columns: ["draft_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_drafts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "onboarding_goal_candidates_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "onboarding_goal_candidates_target_fkey";
            columns: ["target_goal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      onboarding_memory_candidates: {
        Row: {
          content: string;
          decision: string;
          draft_id: string;
          field_key: string;
          id: string;
          memory_type: string;
          position: number;
          resolution: string | null;
          target_memory_id: string | null;
          user_id: string;
        };
        Insert: {
          content: string;
          decision?: string;
          draft_id: string;
          field_key: string;
          id?: string;
          memory_type: string;
          position: number;
          resolution?: string | null;
          target_memory_id?: string | null;
          user_id: string;
        };
        Update: {
          content?: string;
          decision?: string;
          draft_id?: string;
          field_key?: string;
          id?: string;
          memory_type?: string;
          position?: number;
          resolution?: string | null;
          target_memory_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_memory_candidates_draft_fkey";
            columns: ["draft_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_drafts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "onboarding_memory_candidates_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "onboarding_memory_candidates_target_fkey";
            columns: ["target_memory_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "memory_items";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      onboarding_prompt_states: {
        Row: {
          dismissed_at: string;
          user_id: string;
        };
        Insert: {
          dismissed_at?: string;
          user_id: string;
        };
        Update: {
          dismissed_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_prompt_states_owner_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      onboarding_publication_receipts: {
        Row: {
          goal_collection_revision: number;
          goal_ids: string[];
          id: string;
          idempotency_key: string;
          memory_collection_revision: number;
          memory_ids: string[];
          published_at: string;
          user_id: string;
        };
        Insert: {
          goal_collection_revision: number;
          goal_ids?: string[];
          id?: string;
          idempotency_key: string;
          memory_collection_revision: number;
          memory_ids?: string[];
          published_at?: string;
          user_id: string;
        };
        Update: {
          goal_collection_revision?: number;
          goal_ids?: string[];
          id?: string;
          idempotency_key?: string;
          memory_collection_revision?: number;
          memory_ids?: string[];
          published_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_publication_receipts_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      onboarding_training_activities: {
        Row: {
          detail: string | null;
          draft_id: string;
          duration_minutes: number;
          id: string;
          name: string;
          position: number;
          sessions_per_week: number;
          user_id: string;
        };
        Insert: {
          detail?: string | null;
          draft_id: string;
          duration_minutes: number;
          id?: string;
          name: string;
          position: number;
          sessions_per_week: number;
          user_id: string;
        };
        Update: {
          detail?: string | null;
          draft_id?: string;
          duration_minutes?: number;
          id?: string;
          name?: string;
          position?: number;
          sessions_per_week?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_training_activities_draft_fkey";
            columns: ["draft_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_drafts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "onboarding_training_activities_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
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
      plan_generation_requests: {
        Row: {
          completion_token: string;
          created_at: string;
          day_count: number;
          failure_code: string | null;
          id: string;
          idempotency_key: string;
          planning_note_hash: string | null;
          proposal_id: string | null;
          request_fingerprint: string;
          requested_end_date: string;
          requested_start_date: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completion_token?: string;
          created_at?: string;
          day_count: number;
          failure_code?: string | null;
          id?: string;
          idempotency_key: string;
          planning_note_hash?: string | null;
          proposal_id?: string | null;
          request_fingerprint: string;
          requested_end_date: string;
          requested_start_date: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completion_token?: string;
          created_at?: string;
          day_count?: number;
          failure_code?: string | null;
          id?: string;
          idempotency_key?: string;
          planning_note_hash?: string | null;
          proposal_id?: string | null;
          request_fingerprint?: string;
          requested_end_date?: string;
          requested_start_date?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_generation_requests_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      plan_proposal_decisions: {
        Row: {
          decided_at: string;
          decision: string;
          proposal_id: string;
          user_id: string;
        };
        Insert: {
          decided_at?: string;
          decision: string;
          proposal_id: string;
          user_id: string;
        };
        Update: {
          decided_at?: string;
          decision?: string;
          proposal_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_proposal_decisions_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "plan_proposal_decisions_proposal_fkey";
            columns: ["proposal_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "plan_proposals";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      plan_proposal_sources: {
        Row: {
          ordinal: number;
          proposal_id: string;
          record_id: string;
          revision_id: string | null;
          revision_number: number | null;
          source_kind: string;
          user_id: string;
        };
        Insert: {
          ordinal: number;
          proposal_id: string;
          record_id: string;
          revision_id?: string | null;
          revision_number?: number | null;
          source_kind: string;
          user_id: string;
        };
        Update: {
          ordinal?: number;
          proposal_id?: string;
          record_id?: string;
          revision_id?: string | null;
          revision_number?: number | null;
          source_kind?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_proposal_sources_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "plan_proposal_sources_proposal_fkey";
            columns: ["proposal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "plan_proposals";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      plan_proposals: {
        Row: {
          content: Json;
          created_at: string;
          generation_request_id: string;
          id: string;
          model_code: string;
          origin: string;
          planning_note: string | null;
          prompt_version: string;
          provider_code: string;
          rate_card_version: string;
          schema_version: string;
          spend_reservation_id: string | null;
          user_id: string;
        };
        Insert: {
          content: Json;
          created_at?: string;
          generation_request_id: string;
          id?: string;
          model_code: string;
          origin: string;
          planning_note?: string | null;
          prompt_version: string;
          provider_code: string;
          rate_card_version: string;
          schema_version: string;
          spend_reservation_id?: string | null;
          user_id: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          generation_request_id?: string;
          id?: string;
          model_code?: string;
          origin?: string;
          planning_note?: string | null;
          prompt_version?: string;
          provider_code?: string;
          rate_card_version?: string;
          schema_version?: string;
          spend_reservation_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_proposals_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "plan_proposals_request_fkey";
            columns: ["generation_request_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "plan_generation_requests";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "plan_proposals_spend_fkey";
            columns: ["spend_reservation_id"];
            isOneToOne: false;
            referencedRelation: "ai_spend_reservations";
            referencedColumns: ["id"];
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
      roadmap_generation_requests: {
        Row: {
          completion_token: string;
          created_at: string;
          expected_head_revision: number;
          failure_code: string | null;
          id: string;
          idempotency_key: string;
          planning_note_hash: string | null;
          previous_proposal_id: string | null;
          proposal_id: string | null;
          regeneration_feedback_hash: string | null;
          regeneration_number: number;
          request_fingerprint: string;
          requested_end_date: string;
          requested_start_date: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completion_token?: string;
          created_at?: string;
          expected_head_revision: number;
          failure_code?: string | null;
          id?: string;
          idempotency_key: string;
          planning_note_hash?: string | null;
          previous_proposal_id?: string | null;
          proposal_id?: string | null;
          regeneration_feedback_hash?: string | null;
          regeneration_number?: number;
          request_fingerprint: string;
          requested_end_date: string;
          requested_start_date: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completion_token?: string;
          created_at?: string;
          expected_head_revision?: number;
          failure_code?: string | null;
          id?: string;
          idempotency_key?: string;
          planning_note_hash?: string | null;
          previous_proposal_id?: string | null;
          proposal_id?: string | null;
          regeneration_feedback_hash?: string | null;
          regeneration_number?: number;
          request_fingerprint?: string;
          requested_end_date?: string;
          requested_start_date?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_generation_requests_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      roadmap_heads: {
        Row: {
          current_version_id: string | null;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          current_version_id?: string | null;
          revision?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          current_version_id?: string | null;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_heads_current_fkey";
            columns: ["current_version_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "roadmap_versions";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "roadmap_heads_owner_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      roadmap_proposal_decisions: {
        Row: {
          accepted_version_id: string | null;
          decided_at: string;
          decision: string;
          proposal_id: string;
          user_id: string;
        };
        Insert: {
          accepted_version_id?: string | null;
          decided_at?: string;
          decision: string;
          proposal_id: string;
          user_id: string;
        };
        Update: {
          accepted_version_id?: string | null;
          decided_at?: string;
          decision?: string;
          proposal_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_proposal_decisions_accepted_fkey";
            columns: ["accepted_version_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "roadmap_versions";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "roadmap_proposal_decisions_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "roadmap_proposal_decisions_proposal_fkey";
            columns: ["proposal_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "roadmap_proposals";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      roadmap_proposal_sources: {
        Row: {
          ordinal: number;
          proposal_id: string;
          record_id: string;
          revision_id: string | null;
          revision_number: number | null;
          source_kind: string;
          user_id: string;
        };
        Insert: {
          ordinal: number;
          proposal_id: string;
          record_id: string;
          revision_id?: string | null;
          revision_number?: number | null;
          source_kind: string;
          user_id: string;
        };
        Update: {
          ordinal?: number;
          proposal_id?: string;
          record_id?: string;
          revision_id?: string | null;
          revision_number?: number | null;
          source_kind?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_proposal_sources_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "roadmap_proposal_sources_proposal_fkey";
            columns: ["proposal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "roadmap_proposals";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      roadmap_proposals: {
        Row: {
          content: Json;
          created_at: string;
          generation_request_id: string;
          id: string;
          model_code: string;
          origin: string;
          planning_note: string | null;
          prompt_version: string;
          provider_code: string;
          rate_card_version: string;
          regeneration_feedback: string | null;
          schema_version: string;
          source_proposal_id: string | null;
          spend_reservation_id: string | null;
          user_id: string;
        };
        Insert: {
          content: Json;
          created_at?: string;
          generation_request_id: string;
          id?: string;
          model_code: string;
          origin: string;
          planning_note?: string | null;
          prompt_version: string;
          provider_code: string;
          rate_card_version: string;
          regeneration_feedback?: string | null;
          schema_version: string;
          source_proposal_id?: string | null;
          spend_reservation_id?: string | null;
          user_id: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          generation_request_id?: string;
          id?: string;
          model_code?: string;
          origin?: string;
          planning_note?: string | null;
          prompt_version?: string;
          provider_code?: string;
          rate_card_version?: string;
          regeneration_feedback?: string | null;
          schema_version?: string;
          source_proposal_id?: string | null;
          spend_reservation_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_proposals_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "roadmap_proposals_request_fkey";
            columns: ["generation_request_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "roadmap_generation_requests";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "roadmap_proposals_source_fkey";
            columns: ["source_proposal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "roadmap_proposals";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "roadmap_proposals_spend_fkey";
            columns: ["spend_reservation_id"];
            isOneToOne: false;
            referencedRelation: "ai_spend_reservations";
            referencedColumns: ["id"];
          },
        ];
      };
      roadmap_versions: {
        Row: {
          accepted_at: string;
          content: Json;
          id: string;
          previous_version_id: string | null;
          source_proposal_id: string;
          user_id: string;
          version_number: number;
        };
        Insert: {
          accepted_at?: string;
          content: Json;
          id?: string;
          previous_version_id?: string | null;
          source_proposal_id: string;
          user_id: string;
          version_number: number;
        };
        Update: {
          accepted_at?: string;
          content?: Json;
          id?: string;
          previous_version_id?: string | null;
          source_proposal_id?: string;
          user_id?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_versions_owner_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "roadmap_versions_previous_fkey";
            columns: ["previous_version_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "roadmap_versions";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "roadmap_versions_proposal_fkey";
            columns: ["source_proposal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "roadmap_proposals";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      rolling_plan_activities: {
        Row: {
          created_at: string;
          id: string;
          instructions: string | null;
          is_locked: boolean;
          measurement_mode: string;
          name: string;
          personal_activity_id: string | null;
          plan_id: string;
          position: number;
          session_id: string;
          sport: string;
          target: Json | null;
          updated_at: string;
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
          plan_id: string;
          position: number;
          session_id: string;
          sport: string;
          target?: Json | null;
          updated_at?: string;
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
          plan_id?: string;
          position?: number;
          session_id?: string;
          sport?: string;
          target?: Json | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rolling_plan_activities_personal_fkey";
            columns: ["personal_activity_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "personal_activities";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "rolling_plan_activities_session_fkey";
            columns: ["session_id", "user_id", "plan_id"];
            isOneToOne: false;
            referencedRelation: "rolling_plan_sessions";
            referencedColumns: ["id", "user_id", "plan_id"];
          },
        ];
      };
      rolling_plan_change_entries: {
        Row: {
          after_state: Json;
          before_state: Json | null;
          change_kind: string;
          change_set_id: string;
          created_at: string;
          id: string;
          ordinal: number;
          plan_id: string;
          session_id: string;
          user_id: string;
        };
        Insert: {
          after_state: Json;
          before_state?: Json | null;
          change_kind: string;
          change_set_id: string;
          created_at?: string;
          id?: string;
          ordinal: number;
          plan_id: string;
          session_id: string;
          user_id: string;
        };
        Update: {
          after_state?: Json;
          before_state?: Json | null;
          change_kind?: string;
          change_set_id?: string;
          created_at?: string;
          id?: string;
          ordinal?: number;
          plan_id?: string;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rolling_plan_change_entries_change_set_fkey";
            columns: ["change_set_id", "user_id", "plan_id"];
            isOneToOne: false;
            referencedRelation: "rolling_plan_change_sets";
            referencedColumns: ["id", "user_id", "plan_id"];
          },
          {
            foreignKeyName: "rolling_plan_change_entries_session_fkey";
            columns: ["session_id", "user_id", "plan_id"];
            isOneToOne: false;
            referencedRelation: "rolling_plan_sessions";
            referencedColumns: ["id", "user_id", "plan_id"];
          },
        ];
      };
      rolling_plan_change_sets: {
        Row: {
          created_at: string;
          id: string;
          idempotency_key: string;
          plan_id: string;
          plan_revision: number;
          provenance: string;
          request_fingerprint: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          idempotency_key: string;
          plan_id: string;
          plan_revision: number;
          provenance: string;
          request_fingerprint: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          plan_id?: string;
          plan_revision?: number;
          provenance?: string;
          request_fingerprint?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rolling_plan_change_sets_plan_fkey";
            columns: ["plan_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "rolling_plans";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      rolling_plan_sessions: {
        Row: {
          active_position: number | null;
          cancelled_at: string | null;
          created_at: string;
          expected_duration_minutes: number | null;
          id: string;
          intent: string | null;
          is_locked: boolean;
          local_date: string;
          note: string | null;
          plan_id: string;
          position: number;
          sport: string;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active_position?: number | null;
          cancelled_at?: string | null;
          created_at?: string;
          expected_duration_minutes?: number | null;
          id: string;
          intent?: string | null;
          is_locked?: boolean;
          local_date: string;
          note?: string | null;
          plan_id: string;
          position: number;
          sport: string;
          status?: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active_position?: number | null;
          cancelled_at?: string | null;
          created_at?: string;
          expected_duration_minutes?: number | null;
          id?: string;
          intent?: string | null;
          is_locked?: boolean;
          local_date?: string;
          note?: string | null;
          plan_id?: string;
          position?: number;
          sport?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rolling_plan_sessions_plan_fkey";
            columns: ["plan_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "rolling_plans";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      rolling_plans: {
        Row: {
          created_at: string;
          id: string;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          revision?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rolling_plans_owner_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_roadmap_proposal: {
        Args: { p_expected_head_revision: number; p_proposal_id: string };
        Returns: Database["public"]["CompositeTypes"]["roadmap_acceptance_receipt"];
        SetofOptions: {
          from: "*";
          to: "roadmap_acceptance_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      apply_goal_change: {
        Args: {
          p_activity_areas?: string[];
          p_category?: string;
          p_constraints_text?: string;
          p_desired_outcome?: string;
          p_expected_collection_revision: number;
          p_goal_id?: string;
          p_operation: string;
          p_ordered_goal_ids?: string[];
          p_priority_tier?: string;
          p_rationale?: string;
          p_start_date?: string;
          p_target_date?: string;
          p_target_detail?: string;
          p_target_metric_label?: string;
          p_target_metric_unit?: string;
          p_target_metric_value?: string;
          p_target_rank?: number;
          p_title?: string;
        };
        Returns: Database["public"]["CompositeTypes"]["goal_change_receipt"];
        SetofOptions: {
          from: "*";
          to: "goal_change_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      apply_memory_change: {
        Args: {
          p_content?: string;
          p_expected_collection_revision: number;
          p_expires_on?: string;
          p_item_id?: string;
          p_memory_type?: string;
          p_operation: string;
        };
        Returns: Database["public"]["CompositeTypes"]["memory_change_receipt"];
        SetofOptions: {
          from: "*";
          to: "memory_change_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      apply_onboarding_change: {
        Args: {
          p_expected_draft_revision: number;
          p_expected_goal_revision?: number;
          p_expected_memory_revision?: number;
          p_idempotency_key?: string;
          p_operation: string;
          p_payload?: Json;
        };
        Returns: Database["public"]["CompositeTypes"]["onboarding_change_receipt"];
        SetofOptions: {
          from: "*";
          to: "onboarding_change_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      apply_roadmap_proposal_change: {
        Args: { p_content?: Json; p_operation: string; p_proposal_id: string };
        Returns: Database["public"]["CompositeTypes"]["roadmap_proposal_change_receipt"];
        SetofOptions: {
          from: "*";
          to: "roadmap_proposal_change_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      apply_rolling_plan_change_set: {
        Args: {
          p_changes: Json;
          p_expected_plan_revision: number;
          p_idempotency_key: string;
          p_provenance: string;
        };
        Returns: Database["public"]["CompositeTypes"]["rolling_plan_change_receipt"];
        SetofOptions: {
          from: "*";
          to: "rolling_plan_change_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      begin_plan_generation: {
        Args: {
          p_day_count: number;
          p_idempotency_key: string;
          p_planning_note?: string;
          p_request_fingerprint: string;
          p_start_date: string;
        };
        Returns: Database["public"]["CompositeTypes"]["plan_generation_receipt"];
        SetofOptions: {
          from: "*";
          to: "plan_generation_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      begin_roadmap_generation: {
        Args: {
          p_end_date: string;
          p_expected_head_revision: number;
          p_idempotency_key: string;
          p_planning_note?: string;
          p_previous_proposal_id?: string;
          p_regeneration_feedback?: string;
          p_request_fingerprint: string;
          p_start_date: string;
        };
        Returns: Database["public"]["CompositeTypes"]["roadmap_generation_receipt"];
        SetofOptions: {
          from: "*";
          to: "roadmap_generation_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      finish_plan_generation: {
        Args: {
          p_completion_token: string;
          p_content?: Json;
          p_model_code?: string;
          p_outcome: string;
          p_planning_note?: string;
          p_prompt_version?: string;
          p_provider_code?: string;
          p_rate_card_version?: string;
          p_safe_failure_code?: string;
          p_schema_version?: string;
          p_sources?: Json;
          p_spend_reservation_id?: string;
        };
        Returns: Database["public"]["CompositeTypes"]["plan_generation_result"];
        SetofOptions: {
          from: "*";
          to: "plan_generation_result";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      finish_roadmap_generation: {
        Args: {
          p_completion_token: string;
          p_content?: Json;
          p_model_code?: string;
          p_outcome: string;
          p_planning_note?: string;
          p_prompt_version?: string;
          p_provider_code?: string;
          p_rate_card_version?: string;
          p_regeneration_feedback?: string;
          p_safe_failure_code?: string;
          p_schema_version?: string;
          p_sources?: Json;
          p_spend_reservation_id?: string;
        };
        Returns: Database["public"]["CompositeTypes"]["roadmap_generation_result"];
        SetofOptions: {
          from: "*";
          to: "roadmap_generation_result";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_rolling_plan_slice: {
        Args: { p_end_date: string; p_start_date: string };
        Returns: Database["public"]["CompositeTypes"]["rolling_plan_slice_receipt"];
        SetofOptions: {
          from: "*";
          to: "rolling_plan_slice_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      is_valid_training_measurement: {
        Args: { p_mode: string; p_value: Json };
        Returns: boolean;
      };
      plan_content_is_valid: {
        Args: { p_content: Json; p_end_date: string; p_start_date: string };
        Returns: boolean;
      };
      record_plan_memory_candidates: {
        Args: {
          p_candidates: Json;
          p_completion_token: string;
          p_expected_memory_revision: number;
        };
        Returns: Database["public"]["CompositeTypes"]["plan_memory_candidate_receipt"];
        SetofOptions: {
          from: "*";
          to: "plan_memory_candidate_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_roadmap_memory_candidates: {
        Args: {
          p_candidates: Json;
          p_completion_token: string;
          p_expected_memory_revision: number;
        };
        Returns: Database["public"]["CompositeTypes"]["roadmap_memory_candidate_receipt"];
        SetofOptions: {
          from: "*";
          to: "roadmap_memory_candidate_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reject_plan_proposal: {
        Args: { p_proposal_id: string };
        Returns: Database["public"]["CompositeTypes"]["plan_proposal_decision_receipt"];
        SetofOptions: {
          from: "*";
          to: "plan_proposal_decision_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reserve_ai_spend: {
        Args: {
          p_currency: string;
          p_operation: string;
          p_rate_card_version: string;
          p_reserved_micro_usd: number;
        };
        Returns: Database["public"]["CompositeTypes"]["ai_spend_reservation_receipt"];
        SetofOptions: {
          from: "*";
          to: "ai_spend_reservation_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      roadmap_content_is_valid: {
        Args: { p_content: Json; p_end_date: string; p_start_date: string };
        Returns: boolean;
      };
      roadmap_normalize_owner_text: {
        Args: { p_value: string };
        Returns: string;
      };
      roadmap_owner_text_hash: { Args: { p_value: string }; Returns: string };
      roadmap_technical_codes_are_accepted: {
        Args: {
          p_has_spend_reservation: boolean;
          p_model_code: string;
          p_provider_code: string;
          p_rate_card_version: string;
        };
        Returns: boolean;
      };
      rolling_plan_activity_input_is_valid: {
        Args: { p_value: Json };
        Returns: boolean;
      };
      rolling_plan_session_input_is_valid: {
        Args: { p_value: Json; p_with_placement: boolean };
        Returns: boolean;
      };
      rolling_plan_session_state: {
        Args: { p_session_id: string; p_user_id: string };
        Returns: Json;
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
      save_training_completion: {
        Args: {
          p_activities: Json;
          p_actual_local_date: string;
          p_actual_started_at: string | null;
          p_completion_group_id: string | null;
          p_correction_reason: string | null;
          p_duration_minutes: number | null;
          p_expected_revision: number;
          p_feeling: string | null;
          p_idempotency_key: string;
          p_illness_reported: boolean;
          p_injury_reported: boolean;
          p_note: string | null;
          p_pain_reported: boolean;
          p_perceived_effort: number | null;
          p_planned_session_id: string | null;
          p_replacement_description: string | null;
          p_severe_fatigue_reported: boolean;
          p_status: string;
          p_timezone_name: string;
        };
        Returns: {
          actual_local_date: string;
          actual_started_at: string | null;
          completion_group_id: string;
          correction_reason: string | null;
          created_at: string;
          duration_minutes: number | null;
          feeling: string | null;
          id: string;
          idempotency_fingerprint: string;
          idempotency_key: string;
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
        SetofOptions: {
          from: "*";
          to: "completed_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      settle_ai_spend: {
        Args: { p_charged_micro_usd: number; p_settlement_token: string };
        Returns: Database["public"]["CompositeTypes"]["ai_spend_settlement_receipt"];
        SetofOptions: {
          from: "*";
          to: "ai_spend_settlement_receipt";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      ai_spend_reservation_receipt: {
        reservation_id: string | null;
        settlement_token: string | null;
        spend_day: string | null;
        reserved_micro_usd: number | null;
        expires_at: string | null;
      };
      ai_spend_settlement_receipt: {
        reservation_id: string | null;
        charged_micro_usd: number | null;
      };
      goal_change_receipt: {
        goal_id: string | null;
        collection_revision: number | null;
        result: string | null;
      };
      memory_change_receipt: {
        item_id: string | null;
        collection_revision: number | null;
        revision_number: number | null;
        result: string | null;
      };
      onboarding_change_receipt: {
        draft_id: string | null;
        draft_revision: number | null;
        result: string | null;
        idempotency_key: string | null;
        publication_id: string | null;
        goal_collection_revision: number | null;
        memory_collection_revision: number | null;
      };
      plan_generation_receipt: {
        generation_id: string | null;
        completion_token: string | null;
        state: string | null;
        proposal_id: string | null;
      };
      plan_generation_result: {
        state: string | null;
        proposal_id: string | null;
      };
      plan_memory_candidate_receipt: {
        collection_revision: number | null;
        item_ids: string[] | null;
      };
      plan_proposal_decision_receipt: {
        proposal_id: string | null;
        result: string | null;
      };
      roadmap_acceptance_receipt: {
        proposal_id: string | null;
        version_id: string | null;
        head_revision: number | null;
        result: string | null;
      };
      roadmap_generation_receipt: {
        generation_id: string | null;
        completion_token: string | null;
        state: string | null;
        regeneration_number: number | null;
        proposal_id: string | null;
      };
      roadmap_generation_result: {
        state: string | null;
        proposal_id: string | null;
      };
      roadmap_memory_candidate_receipt: {
        collection_revision: number | null;
        item_ids: string[] | null;
      };
      roadmap_proposal_change_receipt: {
        proposal_id: string | null;
        result: string | null;
      };
      rolling_plan_change_receipt: {
        plan_id: string | null;
        plan_revision: number | null;
        change_set_id: string | null;
        result: string | null;
      };
      rolling_plan_slice_receipt: {
        plan_id: string | null;
        plan_revision: number | null;
        sessions: Json | null;
      };
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
