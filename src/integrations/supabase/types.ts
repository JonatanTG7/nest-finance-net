export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      account_balance_history: {
        Row: {
          changed_by: Database["public"]["Enums"]["person"] | null;
          changed_by_user_id: string | null;
          created_at: string;
          currency: string;
          household_id: string;
          id: string;
          investment_account_id: string | null;
          kind: string;
          new_amount: number;
          note: string | null;
          old_amount: number;
        };
        Insert: {
          changed_by?: Database["public"]["Enums"]["person"] | null;
          changed_by_user_id?: string | null;
          created_at?: string;
          currency?: string;
          household_id: string;
          id?: string;
          investment_account_id?: string | null;
          kind?: string;
          new_amount?: number;
          note?: string | null;
          old_amount?: number;
        };
        Update: {
          changed_by?: Database["public"]["Enums"]["person"] | null;
          changed_by_user_id?: string | null;
          created_at?: string;
          currency?: string;
          household_id?: string;
          id?: string;
          investment_account_id?: string | null;
          kind?: string;
          new_amount?: number;
          note?: string | null;
          old_amount?: number;
        };
        Relationships: [
          {
            foreignKeyName: "account_balance_history_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_balance_history_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          color: string;
          created_at: string;
          emoji: string | null;
          household_id: string | null;
          icon: string;
          id: string;
          investment_account_id: string | null;
          is_system: boolean;
          name: string;
          sort_order: number;
          type: Database["public"]["Enums"]["transaction_type"];
        };
        Insert: {
          color?: string;
          created_at?: string;
          emoji?: string | null;
          household_id?: string | null;
          icon?: string;
          id?: string;
          investment_account_id?: string | null;
          is_system?: boolean;
          name: string;
          sort_order?: number;
          type: Database["public"]["Enums"]["transaction_type"];
        };
        Update: {
          color?: string;
          created_at?: string;
          emoji?: string | null;
          household_id?: string | null;
          icon?: string;
          id?: string;
          investment_account_id?: string | null;
          is_system?: boolean;
          name?: string;
          sort_order?: number;
          type?: Database["public"]["Enums"]["transaction_type"];
        };
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categories_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      category_budgets: {
        Row: {
          amount_ils: number;
          category_id: string;
          household_id: string;
          updated_at: string;
        };
        Insert: {
          amount_ils: number;
          category_id: string;
          household_id: string;
          updated_at?: string;
        };
        Update: {
          amount_ils?: number;
          category_id?: string;
          household_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "category_budgets_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "category_budgets_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_cards: {
        Row: {
          billing_day: number;
          created_at: string;
          household_id: string;
          id: string;
          last_four: string;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          billing_day: number;
          created_at?: string;
          household_id: string;
          id?: string;
          last_four: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          billing_day?: number;
          created_at?: string;
          household_id?: string;
          id?: string;
          last_four?: string;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_cards_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      email_digest_preferences: {
        Row: {
          created_at: string;
          email: string;
          enabled: boolean;
          household_id: string;
          id: string;
          last_digest_kind: string | null;
          last_net_worth_ils: number | null;
          last_sent_at: string | null;
          monthly_day: number | null;
          monthly_enabled: boolean;
          profile_id: string;
          updated_at: string;
          weekly_enabled: boolean;
          weekly_weekday: number | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          enabled?: boolean;
          household_id: string;
          id?: string;
          last_digest_kind?: string | null;
          last_net_worth_ils?: number | null;
          last_sent_at?: string | null;
          monthly_day?: number | null;
          monthly_enabled?: boolean;
          profile_id: string;
          updated_at?: string;
          weekly_enabled?: boolean;
          weekly_weekday?: number | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          enabled?: boolean;
          household_id?: string;
          id?: string;
          last_digest_kind?: string | null;
          last_net_worth_ils?: number | null;
          last_sent_at?: string | null;
          monthly_day?: number | null;
          monthly_enabled?: boolean;
          profile_id?: string;
          updated_at?: string;
          weekly_enabled?: boolean;
          weekly_weekday?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_digest_preferences_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_digest_preferences_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      household_hidden_categories: {
        Row: {
          category_id: string;
          created_at: string;
          household_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          household_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          household_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_hidden_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_hidden_categories_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_invites: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          household_id: string;
          id: string;
          max_uses: number;
          uses: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          household_id: string;
          id?: string;
          max_uses?: number;
          uses?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          household_id?: string;
          id?: string;
          max_uses?: number;
          uses?: number;
        };
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_media: {
        Row: {
          bucket_id: string;
          household_id: string;
          object_name: string;
        };
        Insert: {
          bucket_id: string;
          household_id: string;
          object_name: string;
        };
        Update: {
          bucket_id?: string;
          household_id?: string;
          object_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_media_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ib_holdings: {
        Row: {
          cash_usd: number;
          created_at: string;
          household_id: string;
          id: string;
          investment_account_id: string;
          updated_at: string;
        };
        Insert: {
          cash_usd?: number;
          created_at?: string;
          household_id: string;
          id?: string;
          investment_account_id: string;
          updated_at?: string;
        };
        Update: {
          cash_usd?: number;
          created_at?: string;
          household_id?: string;
          id?: string;
          investment_account_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ib_holdings_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ib_holdings_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      ib_position_transactions: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          investment_account_id: string;
          kind: string;
          note: string | null;
          occurred_at: string;
          position_id: string | null;
          price: number;
          prior_avg_price: number | null;
          quantity: number;
          symbol: string;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          investment_account_id: string;
          kind: string;
          note?: string | null;
          occurred_at?: string;
          position_id?: string | null;
          price: number;
          prior_avg_price?: number | null;
          quantity: number;
          symbol: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          investment_account_id?: string;
          kind?: string;
          note?: string | null;
          occurred_at?: string;
          position_id?: string | null;
          price?: number;
          prior_avg_price?: number | null;
          quantity?: number;
          symbol?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ib_position_transactions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ib_position_transactions_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ib_position_transactions_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "ib_positions";
            referencedColumns: ["id"];
          },
        ];
      };
      ib_positions: {
        Row: {
          avg_price: number;
          created_at: string;
          household_id: string;
          id: string;
          investment_account_id: string;
          quantity: number;
          symbol: string;
          updated_at: string;
        };
        Insert: {
          avg_price?: number;
          created_at?: string;
          household_id: string;
          id?: string;
          investment_account_id: string;
          quantity?: number;
          symbol: string;
          updated_at?: string;
        };
        Update: {
          avg_price?: number;
          created_at?: string;
          household_id?: string;
          id?: string;
          investment_account_id?: string;
          quantity?: number;
          symbol?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ib_positions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ib_positions_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_accounts: {
        Row: {
          avg_fee_from_balance: number | null;
          avg_fee_from_deposits: number | null;
          balance_reset_at: string | null;
          color: string;
          company: string | null;
          created_at: string;
          currency: string;
          data_source: string | null;
          expected_monthly_pension: number | null;
          fee_from_balance: number | null;
          fee_from_deposits: number | null;
          household_id: string;
          id: string;
          kind: string;
          monthly_deposit_employee: number | null;
          monthly_deposit_employer: number | null;
          monthly_deposit_severance: number | null;
          name: string;
          person: Database["public"]["Enums"]["person"];
          sort_order: number;
          source_date: string | null;
          starting_balance: number;
          starting_balance_ils: number;
          track: string | null;
          treasury_code: string | null;
          updated_at: string;
        };
        Insert: {
          avg_fee_from_balance?: number | null;
          avg_fee_from_deposits?: number | null;
          balance_reset_at?: string | null;
          color?: string;
          company?: string | null;
          created_at?: string;
          currency?: string;
          data_source?: string | null;
          expected_monthly_pension?: number | null;
          fee_from_balance?: number | null;
          fee_from_deposits?: number | null;
          household_id: string;
          id?: string;
          kind?: string;
          monthly_deposit_employee?: number | null;
          monthly_deposit_employer?: number | null;
          monthly_deposit_severance?: number | null;
          name: string;
          person?: Database["public"]["Enums"]["person"];
          sort_order?: number;
          source_date?: string | null;
          starting_balance?: number;
          starting_balance_ils?: number;
          track?: string | null;
          treasury_code?: string | null;
          updated_at?: string;
        };
        Update: {
          avg_fee_from_balance?: number | null;
          avg_fee_from_deposits?: number | null;
          balance_reset_at?: string | null;
          color?: string;
          company?: string | null;
          created_at?: string;
          currency?: string;
          data_source?: string | null;
          expected_monthly_pension?: number | null;
          fee_from_balance?: number | null;
          fee_from_deposits?: number | null;
          household_id?: string;
          id?: string;
          kind?: string;
          monthly_deposit_employee?: number | null;
          monthly_deposit_employer?: number | null;
          monthly_deposit_severance?: number | null;
          name?: string;
          person?: Database["public"]["Enums"]["person"];
          sort_order?: number;
          source_date?: string | null;
          starting_balance?: number;
          starting_balance_ils?: number;
          track?: string | null;
          treasury_code?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investment_accounts_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_methods: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          key: string;
          label: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          key: string;
          label: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          key?: string;
          label?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "payment_methods_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      private_account_history: {
        Row: {
          changed_by: Database["public"]["Enums"]["person"] | null;
          changed_by_user_id: string | null;
          created_at: string;
          field: string;
          household_id: string;
          id: string;
          investment_account_id: string;
          new_value: string | null;
          old_value: string | null;
        };
        Insert: {
          changed_by?: Database["public"]["Enums"]["person"] | null;
          changed_by_user_id?: string | null;
          created_at?: string;
          field: string;
          household_id: string;
          id?: string;
          investment_account_id: string;
          new_value?: string | null;
          old_value?: string | null;
        };
        Update: {
          changed_by?: Database["public"]["Enums"]["person"] | null;
          changed_by_user_id?: string | null;
          created_at?: string;
          field?: string;
          household_id?: string;
          id?: string;
          investment_account_id?: string;
          new_value?: string | null;
          old_value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "private_account_history_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "private_account_history_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          household_id: string | null;
          id: string;
          person: Database["public"]["Enums"]["person"] | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          household_id?: string | null;
          id: string;
          person?: Database["public"]["Enums"]["person"] | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          household_id?: string | null;
          id?: string;
          person?: Database["public"]["Enums"]["person"] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          active: boolean;
          amount: number;
          billing_day: number;
          category_id: string | null;
          created_at: string;
          credit_card_id: string | null;
          currency: string;
          emoji: string;
          end_date: string | null;
          entered_by: Database["public"]["Enums"]["person"];
          household_id: string;
          id: string;
          name: string;
          payment_count: number | null;
          payment_method: string | null;
          start_date: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          amount?: number;
          billing_day?: number;
          category_id?: string | null;
          created_at?: string;
          credit_card_id?: string | null;
          currency?: string;
          emoji?: string;
          end_date?: string | null;
          entered_by?: Database["public"]["Enums"]["person"];
          household_id: string;
          id?: string;
          name: string;
          payment_count?: number | null;
          payment_method?: string | null;
          start_date?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          amount?: number;
          billing_day?: number;
          category_id?: string | null;
          created_at?: string;
          credit_card_id?: string | null;
          currency?: string;
          emoji?: string;
          end_date?: string | null;
          entered_by?: Database["public"]["Enums"]["person"];
          household_id?: string;
          id?: string;
          name?: string;
          payment_count?: number | null;
          payment_method?: string | null;
          start_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_credit_card_id_fkey";
            columns: ["credit_card_id"];
            isOneToOne: false;
            referencedRelation: "credit_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tags_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      trade_journal_entries: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          investment_account_id: string;
          note: string;
          occurred_at: string;
          pnl_usd: number;
          quantity: number;
          side: string;
          symbol: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          investment_account_id: string;
          note?: string;
          occurred_at?: string;
          pnl_usd?: number;
          quantity: number;
          side: string;
          symbol: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          investment_account_id?: string;
          note?: string;
          occurred_at?: string;
          pnl_usd?: number;
          quantity?: number;
          side?: string;
          symbol?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trade_journal_entries_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trade_journal_entries_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      track_allocations: {
        Row: {
          allocation_pct_balance: number | null;
          allocation_pct_deposits: number | null;
          created_at: string;
          household_id: string;
          id: string;
          investment_account_id: string;
          return_year_pct: number | null;
          sort_order: number;
          track_code: string | null;
          track_name: string;
          track_type: string;
          updated_at: string;
        };
        Insert: {
          allocation_pct_balance?: number | null;
          allocation_pct_deposits?: number | null;
          created_at?: string;
          household_id: string;
          id?: string;
          investment_account_id: string;
          return_year_pct?: number | null;
          sort_order?: number;
          track_code?: string | null;
          track_name: string;
          track_type?: string;
          updated_at?: string;
        };
        Update: {
          allocation_pct_balance?: number | null;
          allocation_pct_deposits?: number | null;
          created_at?: string;
          household_id?: string;
          id?: string;
          investment_account_id?: string;
          return_year_pct?: number | null;
          sort_order?: number;
          track_code?: string | null;
          track_name?: string;
          track_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "track_allocations_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "track_allocations_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_tags: {
        Row: {
          tag_id: string;
          transaction_id: string;
        };
        Insert: {
          tag_id: string;
          transaction_id: string;
        };
        Update: {
          tag_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_tags_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount: number;
          amount_ils: number;
          category_id: string | null;
          created_at: string;
          credit_card_id: string | null;
          currency: string;
          entered_by: Database["public"]["Enums"]["person"];
          fx_rate_to_ils: number;
          household_id: string;
          id: string;
          investment_account_id: string | null;
          location: string | null;
          note: string | null;
          occurred_at: string;
          payment_method: string | null;
          photo_url: string | null;
          subscription_id: string | null;
          title: string;
          trip_id: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          amount: number;
          amount_ils: number;
          category_id?: string | null;
          created_at?: string;
          credit_card_id?: string | null;
          currency?: string;
          entered_by: Database["public"]["Enums"]["person"];
          fx_rate_to_ils?: number;
          household_id: string;
          id?: string;
          investment_account_id?: string | null;
          location?: string | null;
          note?: string | null;
          occurred_at?: string;
          payment_method?: string | null;
          photo_url?: string | null;
          subscription_id?: string | null;
          title: string;
          trip_id?: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          amount?: number;
          amount_ils?: number;
          category_id?: string | null;
          created_at?: string;
          credit_card_id?: string | null;
          currency?: string;
          entered_by?: Database["public"]["Enums"]["person"];
          fx_rate_to_ils?: number;
          household_id?: string;
          id?: string;
          investment_account_id?: string | null;
          location?: string | null;
          note?: string | null;
          occurred_at?: string;
          payment_method?: string | null;
          photo_url?: string | null;
          subscription_id?: string | null;
          title?: string;
          trip_id?: string | null;
          type?: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey";
            columns: ["credit_card_id"];
            isOneToOne: false;
            referencedRelation: "credit_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: {
          budget: number;
          cities: string | null;
          country: string;
          cover_image: string | null;
          created_at: string;
          currency: string;
          end_date: string;
          household_id: string;
          id: string;
          name: string;
          start_date: string;
          updated_at: string;
        };
        Insert: {
          budget?: number;
          cities?: string | null;
          country?: string;
          cover_image?: string | null;
          created_at?: string;
          currency?: string;
          end_date?: string;
          household_id: string;
          id?: string;
          name: string;
          start_date?: string;
          updated_at?: string;
        };
        Update: {
          budget?: number;
          cities?: string | null;
          country?: string;
          cover_image?: string | null;
          created_at?: string;
          currency?: string;
          end_date?: string;
          household_id?: string;
          id?: string;
          name?: string;
          start_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trips_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      vouchers: {
        Row: {
          barcode: string | null;
          created_at: string;
          currency: string;
          entered_by: string;
          expiry_date: string | null;
          face_value: number;
          household_id: string;
          id: string;
          image_url: string | null;
          label: string;
          occurred_at: string;
          remaining_value: number;
          source: string;
          updated_at: string;
        };
        Insert: {
          barcode?: string | null;
          created_at?: string;
          currency?: string;
          entered_by: string;
          expiry_date?: string | null;
          face_value: number;
          household_id: string;
          id?: string;
          image_url?: string | null;
          label: string;
          occurred_at?: string;
          remaining_value: number;
          source?: string;
          updated_at?: string;
        };
        Update: {
          barcode?: string | null;
          created_at?: string;
          currency?: string;
          entered_by?: string;
          expiry_date?: string | null;
          face_value?: number;
          household_id?: string;
          id?: string;
          image_url?: string | null;
          label?: string;
          occurred_at?: string;
          remaining_value?: number;
          source?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vouchers_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_ib_sync: {
        Args: {
          _account_id: string;
          _cash_usd: number;
          _ops: Json;
          _occurred_at: string;
          _note?: string;
        };
        Returns: Json;
      };
      buy_ib_shares: {
        Args: {
          _account_id: string;
          _symbol: string;
          _quantity: number;
          _price: number;
          _occurred_at: string;
          _note?: string;
          _adjust_cash?: boolean;
        };
        Returns: Json;
      };
      create_household: { Args: { _name: string }; Returns: string };
      current_household_id: { Args: never; Returns: string };
      delete_my_household: { Args: never; Returns: undefined };
      generate_invite_code: { Args: { _household_id: string }; Returns: string };
      leave_household: { Args: never; Returns: undefined };
      redeem_invite: { Args: { _code: string }; Returns: string };
      sell_ib_shares: {
        Args: {
          _account_id: string;
          _symbol: string;
          _quantity: number;
          _price: number;
          _occurred_at: string;
          _note?: string;
          _adjust_cash?: boolean;
        };
        Returns: Json;
      };
      set_ib_cash: {
        Args: { _account_id: string; _cash_usd: number };
        Returns: Json;
      };
    };
    Enums: {
      person: "yonatan" | "shiri" | "shared";
      transaction_type: "income" | "expense" | "fixed" | "savings" | "investment";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      person: ["yonatan", "shiri", "shared"],
      transaction_type: ["income", "expense", "fixed", "savings", "investment"],
    },
  },
} as const;
