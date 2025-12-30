export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_default: boolean | null
          name: string
          team_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          team_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      item_listings: {
        Row: {
          id: string
          is_active: boolean | null
          item_id: string
          listed_at: string | null
          listing_url: string | null
          platform_id: string | null
          sold_at: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean | null
          item_id: string
          listed_at?: string | null
          listing_url?: string | null
          platform_id?: string | null
          sold_at?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean | null
          item_id?: string
          listed_at?: string | null
          listing_url?: string | null
          platform_id?: string | null
          sold_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_listings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_listings_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          acquisition_date: string
          acquisition_source: string | null
          actual_price: number | null
          amazon_asin: string | null
          amazon_review_status: string | null
          category_id: string | null
          condition: Database["public"]["Enums"]["item_condition"]
          created_at: string
          created_by: string | null
          default_pickup_location: string | null
          description: string | null
          fb_conversation_notes: string | null
          fb_listed_date: string | null
          fb_listing_url: string | null
          fb_views: number | null
          id: string
          original_cost: number
          photos: string[] | null
          platform_fees: number | null
          refurbish_cost: number | null
          refurbish_notes: string | null
          review_notes: string | null
          reviewed_by: string[] | null
          sale_date: string | null
          shipping_cost: number | null
          status: Database["public"]["Enums"]["item_status"]
          storage_location_id: string | null
          target_price: number | null
          team_id: string
          time_invested_minutes: number | null
          title: string | null
          tracking_number: number | null
          updated_at: string
        }
        Insert: {
          acquisition_date?: string
          acquisition_source?: string | null
          actual_price?: number | null
          amazon_asin?: string | null
          amazon_review_status?: string | null
          category_id?: string | null
          condition?: Database["public"]["Enums"]["item_condition"]
          created_at?: string
          created_by?: string | null
          default_pickup_location?: string | null
          description?: string | null
          fb_conversation_notes?: string | null
          fb_listed_date?: string | null
          fb_listing_url?: string | null
          fb_views?: number | null
          id?: string
          original_cost: number
          photos?: string[] | null
          platform_fees?: number | null
          refurbish_cost?: number | null
          refurbish_notes?: string | null
          review_notes?: string | null
          reviewed_by?: string[] | null
          sale_date?: string | null
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["item_status"]
          storage_location_id?: string | null
          target_price?: number | null
          team_id: string
          time_invested_minutes?: number | null
          title?: string | null
          tracking_number?: number | null
          updated_at?: string
        }
        Update: {
          acquisition_date?: string
          acquisition_source?: string | null
          actual_price?: number | null
          amazon_asin?: string | null
          amazon_review_status?: string | null
          category_id?: string | null
          condition?: Database["public"]["Enums"]["item_condition"]
          created_at?: string
          created_by?: string | null
          default_pickup_location?: string | null
          description?: string | null
          fb_conversation_notes?: string | null
          fb_listed_date?: string | null
          fb_listing_url?: string | null
          fb_views?: number | null
          id?: string
          original_cost?: number
          photos?: string[] | null
          platform_fees?: number | null
          refurbish_cost?: number | null
          refurbish_notes?: string | null
          review_notes?: string | null
          reviewed_by?: string[] | null
          sale_date?: string | null
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["item_status"]
          storage_location_id?: string | null
          target_price?: number | null
          team_id?: string
          time_invested_minutes?: number | null
          title?: string | null
          tracking_number?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_default: boolean | null
          latitude: number | null
          location_type: string | null
          longitude: number | null
          name: string
          notes: string | null
          team_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          latitude?: number | null
          location_type?: string | null
          longitude?: number | null
          name: string
          notes?: string | null
          team_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          latitude?: number | null
          location_type?: string | null
          longitude?: number | null
          name?: string
          notes?: string | null
          team_id?: string
        }
        Relationships: []
      }
      meetups: {
        Row: {
          agreed_price: number | null
          buyer_contact: string | null
          buyer_name: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          custom_latitude: number | null
          custom_location: string | null
          custom_longitude: number | null
          id: string
          item_id: string
          meeting_started_at: string | null
          meetup_location_id: string | null
          notes: string | null
          offer_id: string | null
          partner_notified: boolean
          safe_checkin_at: string | null
          scheduled_at: string
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          agreed_price?: number | null
          buyer_contact?: string | null
          buyer_name?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          custom_latitude?: number | null
          custom_location?: string | null
          custom_longitude?: number | null
          id?: string
          item_id: string
          meeting_started_at?: string | null
          meetup_location_id?: string | null
          notes?: string | null
          offer_id?: string | null
          partner_notified?: boolean
          safe_checkin_at?: string | null
          scheduled_at: string
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          agreed_price?: number | null
          buyer_contact?: string | null
          buyer_name?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          custom_latitude?: number | null
          custom_location?: string | null
          custom_longitude?: number | null
          id?: string
          item_id?: string
          meeting_started_at?: string | null
          meetup_location_id?: string | null
          notes?: string | null
          offer_id?: string | null
          partner_notified?: boolean
          safe_checkin_at?: string | null
          scheduled_at?: string
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetups_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetups_meetup_location_id_fkey"
            columns: ["meetup_location_id"]
            isOneToOne: false
            referencedRelation: "meetup_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetups_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          is_shared: boolean | null
          name: string
          team_id: string
          template_text: string
          updated_at: string
          use_count: number | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean | null
          name: string
          team_id: string
          template_text: string
          updated_at?: string
          use_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean | null
          name?: string
          team_id?: string
          template_text?: string
          updated_at?: string
          use_count?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          team_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          team_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          team_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          buyer_contact: string | null
          buyer_name: string | null
          conversation_thread: string | null
          counter_amount: number | null
          created_at: string
          id: string
          is_lowball: boolean
          item_id: string
          notes: string | null
          offer_amount: number
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          buyer_contact?: string | null
          buyer_name?: string | null
          conversation_thread?: string | null
          counter_amount?: number | null
          created_at?: string
          id?: string
          is_lowball?: boolean
          item_id: string
          notes?: string | null
          offer_amount: number
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          buyer_contact?: string | null
          buyer_name?: string | null
          conversation_thread?: string | null
          counter_amount?: number | null
          created_at?: string
          id?: string
          is_lowball?: boolean
          item_id?: string
          notes?: string | null
          offer_amount?: number
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      platforms: {
        Row: {
          created_at: string
          fee_percentage: number | null
          flat_fee: number | null
          id: string
          is_default: boolean | null
          name: string
          processing_flat_fee: number | null
          processing_percentage: number | null
          team_id: string | null
        }
        Insert: {
          created_at?: string
          fee_percentage?: number | null
          flat_fee?: number | null
          id?: string
          is_default?: boolean | null
          name: string
          processing_flat_fee?: number | null
          processing_percentage?: number | null
          team_id?: string | null
        }
        Update: {
          created_at?: string
          fee_percentage?: number | null
          flat_fee?: number | null
          id?: string
          is_default?: boolean | null
          name?: string
          processing_flat_fee?: number | null
          processing_percentage?: number | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platforms_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          team_id?: string | null
          updated_at?: string
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
      safety_checkins: {
        Row: {
          checkin_type: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          meetup_id: string
          message: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          checkin_type: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          meetup_id: string
          message?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          checkin_type?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          meetup_id?: string
          message?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_checkins_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_checkins_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          team_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          team_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_locations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          id: string
          item_id: string | null
          notes: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          team_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          team_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          id?: string
          item_id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_team_id_fkey"
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
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          accent_color: string | null
          background_image_url: string | null
          created_at: string
          id: string
          primary_color: string | null
          text_color: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          background_image_url?: string | null
          created_at?: string
          id?: string
          primary_color?: string | null
          text_color?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          background_image_url?: string | null
          created_at?: string
          id?: string
          primary_color?: string | null
          text_color?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_team_id: { Args: never; Returns: string }
      is_team_member: { Args: { team_uuid: string }; Returns: boolean }
      verify_team_exists: {
        Args: { team_uuid: string }
        Returns: {
          id: string
          name: string
        }[]
      }
    }
    Enums: {
      item_condition: "new" | "like_new" | "good" | "fair" | "for_parts"
      item_status:
        | "acquired"
        | "refurbishing"
        | "ready_to_list"
        | "listed"
        | "sold"
        | "shipped"
      task_status: "pending" | "in_progress" | "completed"
      task_type:
        | "needs_photos"
        | "needs_cleaning"
        | "needs_pricing"
        | "ready_to_list"
        | "needs_packaging"
        | "ready_to_ship"
        | "meetup_scheduled"
        | "needs_discussion"
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
  public: {
    Enums: {
      item_condition: ["new", "like_new", "good", "fair", "for_parts"],
      item_status: [
        "acquired",
        "refurbishing",
        "ready_to_list",
        "listed",
        "sold",
        "shipped",
      ],
      task_status: ["pending", "in_progress", "completed"],
      task_type: [
        "needs_photos",
        "needs_cleaning",
        "needs_pricing",
        "ready_to_list",
        "needs_packaging",
        "ready_to_ship",
        "meetup_scheduled",
        "needs_discussion",
      ],
    },
  },
} as const
