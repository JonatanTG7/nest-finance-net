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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_balance_history: {
        Row: {
          changed_by: Database["public"]["Enums"]["person"] | null
          changed_by_user_id: string | null
          created_at: string
          currency: string
          household_id: string
          id: string
          investment_account_id: string | null
          kind: string
          new_amount: number
          note: string | null
          old_amount: number
        }
        Insert: {
          changed_by?: Database["public"]["Enums"]["person"] | null
          changed_by_user_id?: string | null
          created_at?: string
          currency?: string
          household_id: string
          id?: string
          investment_account_id?: string | null
          kind?: string
          new_amount?: number
          note?: string | null
          old_amount?: number
        }
        Update: {
          changed_by?: Database["public"]["Enums"]["person"] | null
          changed_by_user_id?: string | null
          created_at?: string
          currency?: string
          household_id?: string
          id?: string
          investment_account_id?: string | null
          kind?: string
          new_amount?: number
          note?: string | null
          old_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_balance_history_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_balance_history_investment_account_id_fkey"
            columns: ["investment_account_id"]
            isOneToOne: false
            referencedRelation: "investment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          emoji: string | null
          household_id: string | null
          icon: string
          id: string
          investment_account_id: string | null
          is_system: boolean
          name: string
          sort_order: number
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          color?: string
          created_at?: string
          emoji?: string | null
          household_id?: string | null
          icon?: string
          id?: string
          investment_account_id?: string | null
          is_system?: boolean
          name: string
          sort_order?: number
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          color?: string
          created_at?: string
          emoji?: string | null
          household_id?: string | null
          icon?: string
          id?: string
          investment_account_id?: string | null
          is_system?: boolean
          name?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_investment_account_id_fkey"
            columns: ["investment_account_id"]
            isOneToOne: false
            referencedRelation: "investment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          household_id: string
          id: string
          max_uses: number
          uses: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id: string
          id?: string
          max_uses?: number
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          max_uses?: number
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ib_holdings: {
        Row: {
          cash_usd: number
          created_at: string
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          cash_usd?: number
          created_at?: string
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          cash_usd?: number
          created_at?: string
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ib_holdings_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      ib_positions: {
        Row: {
          avg_price: number
          created_at: string
          household_id: string
          id: string
          quantity: number
          symbol: string
          updated_at: string
        }
        Insert: {
          avg_price?: number
          created_at?: string
          household_id: string
          id?: string
          quantity?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          avg_price?: number
          created_at?: string
          household_id?: string
          id?: string
          quantity?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ib_positions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_accounts: {
        Row: {
          color: string
          created_at: string
          currency: string
          household_id: string
          id: string
          kind: string
          name: string
          sort_order: number
          starting_balance: number
          starting_balance_ils: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          currency?: string
          household_id: string
          id?: string
          kind?: string
          name: string
          sort_order?: number
          starting_balance?: number
          starting_balance_ils?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          currency?: string
          household_id?: string
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          starting_balance?: number
          starting_balance_ils?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string
          household_id: string
          id: string
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          household_id: string | null
          id: string
          person: Database["public"]["Enums"]["person"] | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          household_id?: string | null
          id: string
          person?: Database["public"]["Enums"]["person"] | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          household_id?: string | null
          id?: string
          person?: Database["public"]["Enums"]["person"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_tags: {
        Row: {
          tag_id: string
          transaction_id: string
        }
        Insert: {
          tag_id: string
          transaction_id: string
        }
        Update: {
          tag_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_tags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          amount_ils: number
          category_id: string | null
          created_at: string
          currency: string
          entered_by: Database["public"]["Enums"]["person"]
          fx_rate_to_ils: number
          household_id: string
          id: string
          investment_account_id: string | null
          location: string | null
          note: string | null
          occurred_at: string
          payment_method: string | null
          photo_url: string | null
          title: string
          trip_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          amount_ils: number
          category_id?: string | null
          created_at?: string
          currency?: string
          entered_by: Database["public"]["Enums"]["person"]
          fx_rate_to_ils?: number
          household_id: string
          id?: string
          investment_account_id?: string | null
          location?: string | null
          note?: string | null
          occurred_at?: string
          payment_method?: string | null
          photo_url?: string | null
          title: string
          trip_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          amount_ils?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          entered_by?: Database["public"]["Enums"]["person"]
          fx_rate_to_ils?: number
          household_id?: string
          id?: string
          investment_account_id?: string | null
          location?: string | null
          note?: string | null
          occurred_at?: string
          payment_method?: string | null
          photo_url?: string | null
          title?: string
          trip_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_investment_account_id_fkey"
            columns: ["investment_account_id"]
            isOneToOne: false
            referencedRelation: "investment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          budget: number
          cities: string | null
          country: string
          cover_image: string | null
          created_at: string
          currency: string
          end_date: string
          household_id: string
          id: string
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          budget?: number
          cities?: string | null
          country?: string
          cover_image?: string | null
          created_at?: string
          currency?: string
          end_date?: string
          household_id: string
          id?: string
          name: string
          start_date?: string
          updated_at?: string
        }
        Update: {
          budget?: number
          cities?: string | null
          country?: string
          cover_image?: string | null
          created_at?: string
          currency?: string
          end_date?: string
          household_id?: string
          id?: string
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          barcode: string | null
          created_at: string
          currency: string
          entered_by: string
          expiry_date: string | null
          face_value: number
          household_id: string
          id: string
          image_url: string | null
          label: string
          occurred_at: string
          remaining_value: number
          source: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          currency?: string
          entered_by: string
          expiry_date?: string | null
          face_value: number
          household_id: string
          id?: string
          image_url?: string | null
          label: string
          occurred_at?: string
          remaining_value: number
          source?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          currency?: string
          entered_by?: string
          expiry_date?: string | null
          face_value?: number
          household_id?: string
          id?: string
          image_url?: string | null
          label?: string
          occurred_at?: string
          remaining_value?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_household: { Args: { _name: string }; Returns: string }
      current_household_id: { Args: never; Returns: string }
      generate_invite_code: { Args: { _household_id: string }; Returns: string }
      redeem_invite: { Args: { _code: string }; Returns: string }
    }
    Enums: {
      person: "yonatan" | "shiri" | "shared"
      transaction_type:
        | "income"
        | "expense"
        | "fixed"
        | "savings"
        | "investment"
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
      person: ["yonatan", "shiri", "shared"],
      transaction_type: ["income", "expense", "fixed", "savings", "investment"],
    },
  },
} as const
