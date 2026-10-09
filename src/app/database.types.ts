export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      admins: {
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
      events: {
        Row: {
          button_text: string;
          confirmation_message: string;
          created_at: string;
          description: string | null;
          end_time: string | null;
          event_date: string;
          id: string;
          is_active: boolean;
          language: string;
          location_address: string | null;
          location_name: string | null;
          notes_enabled: boolean;
          notes_label: string;
          notes_required: boolean;
          rsvp_question: string;
          slug: string;
          start_time: string;
          theme: Json;
          timezone: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          button_text?: string;
          confirmation_message?: string;
          created_at?: string;
          description?: string | null;
          end_time?: string | null;
          event_date: string;
          id?: string;
          is_active?: boolean;
          language?: string;
          location_address?: string | null;
          location_name?: string | null;
          notes_enabled?: boolean;
          notes_label?: string;
          notes_required?: boolean;
          rsvp_question?: string;
          slug: string;
          start_time: string;
          theme?: Json;
          timezone?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          button_text?: string;
          confirmation_message?: string;
          created_at?: string;
          description?: string | null;
          end_time?: string | null;
          event_date?: string;
          id?: string;
          is_active?: boolean;
          language?: string;
          location_address?: string | null;
          location_name?: string | null;
          notes_enabled?: boolean;
          notes_label?: string;
          notes_required?: boolean;
          rsvp_question?: string;
          slug?: string;
          start_time?: string;
          theme?: Json;
          timezone?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rsvps: {
        Row: {
          created_at: string;
          edit_token: string;
          event_id: string;
          guest_name: string;
          id: string;
          notes: string | null;
          response: Database['public']['Enums']['rsvp_response'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          edit_token?: string;
          event_id: string;
          guest_name: string;
          id?: string;
          notes?: string | null;
          response: Database['public']['Enums']['rsvp_response'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          edit_token?: string;
          event_id?: string;
          guest_name?: string;
          id?: string;
          notes?: string | null;
          response?: Database['public']['Enums']['rsvp_response'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rsvps_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'event_summaries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rsvps_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      event_summaries: {
        Row: {
          event_date: string | null;
          id: string | null;
          is_active: boolean | null;
          maybe_count: number | null;
          no_count: number | null;
          slug: string | null;
          title: string | null;
          total_count: number | null;
          yes_count: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_public_event: {
        Args: { p_slug: string };
        Returns: {
          button_text: string;
          confirmation_message: string;
          description: string;
          end_time: string;
          event_date: string;
          language: string;
          location_address: string;
          location_name: string;
          notes_enabled: boolean;
          notes_label: string;
          notes_required: boolean;
          rsvp_question: string;
          slug: string;
          start_time: string;
          theme: Json;
          timezone: string;
          title: string;
        }[];
      };
      submit_rsvp: {
        Args: {
          p_edit_token?: string;
          p_guest_name: string;
          p_notes?: string;
          p_response: Database['public']['Enums']['rsvp_response'];
          p_slug: string;
        };
        Returns: string;
      };
    };
    Enums: {
      rsvp_response: 'yes' | 'maybe' | 'no';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      rsvp_response: ['yes', 'maybe', 'no'],
    },
  },
} as const;
