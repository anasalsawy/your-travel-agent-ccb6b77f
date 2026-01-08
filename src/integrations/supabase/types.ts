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
      bids: {
        Row: {
          amount: number
          conditions: string | null
          created_at: string
          estimated_delivery: string | null
          id: string
          listing_id: string
          message: string | null
          payment_method: string | null
          payment_proof_url: string | null
          payment_verified_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["bid_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          conditions?: string | null
          created_at?: string
          estimated_delivery?: string | null
          id?: string
          listing_id: string
          message?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          payment_verified_at?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["bid_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          conditions?: string | null
          created_at?: string
          estimated_delivery?: string | null
          id?: string
          listing_id?: string
          message?: string | null
          payment_method?: string | null
          payment_proof_url?: string | null
          payment_verified_at?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["bid_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bids_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          buyer_notified_at: string | null
          completed_at: string | null
          created_at: string
          deadline: string
          escrow_notes: string | null
          escrow_status: string | null
          id: string
          min_bid: number | null
          seller_notified_at: string | null
          sparefare_listing_url: string | null
          status: Database["public"]["Enums"]["listing_status"]
          ticket_request_id: string
          title: string
          travel_date: string | null
          updated_at: string
          user_id: string
          winning_bid_id: string | null
        }
        Insert: {
          buyer_notified_at?: string | null
          completed_at?: string | null
          created_at?: string
          deadline: string
          escrow_notes?: string | null
          escrow_status?: string | null
          id?: string
          min_bid?: number | null
          seller_notified_at?: string | null
          sparefare_listing_url?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          ticket_request_id: string
          title: string
          travel_date?: string | null
          updated_at?: string
          user_id: string
          winning_bid_id?: string | null
        }
        Update: {
          buyer_notified_at?: string | null
          completed_at?: string | null
          created_at?: string
          deadline?: string
          escrow_notes?: string | null
          escrow_status?: string | null
          id?: string
          min_bid?: number | null
          seller_notified_at?: string | null
          sparefare_listing_url?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          ticket_request_id?: string
          title?: string
          travel_date?: string | null
          updated_at?: string
          user_id?: string
          winning_bid_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_ticket_request_id_fkey"
            columns: ["ticket_request_id"]
            isOneToOne: true
            referencedRelation: "ticket_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_admin: boolean | null
          order_id: string | null
          sender_id: string | null
          ticket_request_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_admin?: boolean | null
          order_id?: string | null
          sender_id?: string | null
          ticket_request_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_admin?: boolean | null
          order_id?: string | null
          sender_id?: string | null
          ticket_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_ticket_request_id_fkey"
            columns: ["ticket_request_id"]
            isOneToOne: false
            referencedRelation: "ticket_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          payload: Json | null
          recipient: string | null
          record_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          recipient?: string | null
          record_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          recipient?: string | null
          record_id?: string | null
          status?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          admin_notes: string | null
          amount_paid: number
          btc_address: string | null
          btc_amount: string | null
          created_at: string | null
          customer_email: string | null
          delivery_info: string | null
          delivery_status: string | null
          id: string
          order_status: Database["public"]["Enums"]["order_status"] | null
          payment_attempt_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          payment_submitted_at: string | null
          proof_upload_url: string | null
          stripe_session_id: string | null
          updated_at: string | null
          user_id: string | null
          voucher_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount_paid: number
          btc_address?: string | null
          btc_amount?: string | null
          created_at?: string | null
          customer_email?: string | null
          delivery_info?: string | null
          delivery_status?: string | null
          id?: string
          order_status?: Database["public"]["Enums"]["order_status"] | null
          payment_attempt_id?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_submitted_at?: string | null
          proof_upload_url?: string | null
          stripe_session_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          voucher_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount_paid?: number
          btc_address?: string | null
          btc_amount?: string | null
          created_at?: string | null
          customer_email?: string | null
          delivery_info?: string | null
          delivery_status?: string | null
          id?: string
          order_status?: Database["public"]["Enums"]["order_status"] | null
          payment_attempt_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_submitted_at?: string | null
          proof_upload_url?: string | null
          stripe_session_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_proofs: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          payment_attempt_id: string
          proof_upload_url: string
          ticket_request_id: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          payment_attempt_id: string
          proof_upload_url: string
          ticket_request_id?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          payment_attempt_id?: string
          proof_upload_url?: string
          ticket_request_id?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_ticket_request_id_fkey"
            columns: ["ticket_request_id"]
            isOneToOne: false
            referencedRelation: "ticket_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      seller_reviews: {
        Row: {
          bid_id: string
          created_at: string
          id: string
          rating: number
          review_text: string | null
          reviewer_id: string
          seller_id: string
          updated_at: string
        }
        Insert: {
          bid_id: string
          created_at?: string
          id?: string
          rating: number
          review_text?: string | null
          reviewer_id: string
          seller_id: string
          updated_at?: string
        }
        Update: {
          bid_id?: string
          created_at?: string
          id?: string
          rating?: number
          review_text?: string | null
          reviewer_id?: string
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_reviews_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reviews_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          business_name: string
          contact_email: string
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          status: Database["public"]["Enums"]["seller_status"]
          telegram_chat_id: number | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_name: string
          contact_email: string
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          status?: Database["public"]["Enums"]["seller_status"]
          telegram_chat_id?: number | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_name?: string
          contact_email?: string
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          status?: Database["public"]["Enums"]["seller_status"]
          telegram_chat_id?: number | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          location: string | null
          name: string
          rating: number | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          name: string
          rating?: number | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          name?: string
          rating?: number | null
        }
        Relationships: []
      }
      ticket_requests: {
        Row: {
          admin_notes: string | null
          balance_amount: number | null
          balance_due_date: string | null
          balance_proof_url: string | null
          balance_status: string
          btc_address: string | null
          btc_amount: string | null
          budget: number | null
          cabin_class: string | null
          contact_email: string
          contact_phone: string | null
          created_at: string | null
          departure_date: string
          deposit_amount: number | null
          deposit_proof_url: string | null
          deposit_status: string
          destination: string
          flexibility: string | null
          id: string
          is_public: boolean
          issued_ticket_info: string | null
          origin: string
          passengers: number | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_plan: string
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          preferred_airline: string | null
          proof_upload_url: string | null
          quoted_price: number | null
          return_date: string | null
          special_notes: string | null
          status: Database["public"]["Enums"]["ticket_request_status"] | null
          stripe_session_id: string | null
          trip_type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          balance_amount?: number | null
          balance_due_date?: string | null
          balance_proof_url?: string | null
          balance_status?: string
          btc_address?: string | null
          btc_amount?: string | null
          budget?: number | null
          cabin_class?: string | null
          contact_email: string
          contact_phone?: string | null
          created_at?: string | null
          departure_date: string
          deposit_amount?: number | null
          deposit_proof_url?: string | null
          deposit_status?: string
          destination: string
          flexibility?: string | null
          id?: string
          is_public?: boolean
          issued_ticket_info?: string | null
          origin: string
          passengers?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_plan?: string
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          preferred_airline?: string | null
          proof_upload_url?: string | null
          quoted_price?: number | null
          return_date?: string | null
          special_notes?: string | null
          status?: Database["public"]["Enums"]["ticket_request_status"] | null
          stripe_session_id?: string | null
          trip_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          balance_amount?: number | null
          balance_due_date?: string | null
          balance_proof_url?: string | null
          balance_status?: string
          btc_address?: string | null
          btc_amount?: string | null
          budget?: number | null
          cabin_class?: string | null
          contact_email?: string
          contact_phone?: string | null
          created_at?: string | null
          departure_date?: string
          deposit_amount?: number | null
          deposit_proof_url?: string | null
          deposit_status?: string
          destination?: string
          flexibility?: string | null
          id?: string
          is_public?: boolean
          issued_ticket_info?: string | null
          origin?: string
          passengers?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_plan?: string
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          preferred_airline?: string | null
          proof_upload_url?: string | null
          quoted_price?: number | null
          return_date?: string | null
          special_notes?: string | null
          status?: Database["public"]["Enums"]["ticket_request_status"] | null
          stripe_session_id?: string | null
          trip_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          airline: string
          created_at: string | null
          currency: string | null
          delivery_method: string | null
          discount_percent: number
          expiry_date: string | null
          face_value: number
          id: string
          image_url: string | null
          is_refundable: boolean | null
          is_transferable: boolean | null
          redemption_method: string | null
          redemption_notes: string | null
          sale_price: number
          status: Database["public"]["Enums"]["voucher_status"] | null
          terms: string | null
          title: string
          type: Database["public"]["Enums"]["voucher_type"]
          updated_at: string | null
          verification_method: string | null
          verified_balance: boolean | null
        }
        Insert: {
          airline: string
          created_at?: string | null
          currency?: string | null
          delivery_method?: string | null
          discount_percent: number
          expiry_date?: string | null
          face_value: number
          id?: string
          image_url?: string | null
          is_refundable?: boolean | null
          is_transferable?: boolean | null
          redemption_method?: string | null
          redemption_notes?: string | null
          sale_price: number
          status?: Database["public"]["Enums"]["voucher_status"] | null
          terms?: string | null
          title: string
          type?: Database["public"]["Enums"]["voucher_type"]
          updated_at?: string | null
          verification_method?: string | null
          verified_balance?: boolean | null
        }
        Update: {
          airline?: string
          created_at?: string | null
          currency?: string | null
          delivery_method?: string | null
          discount_percent?: number
          expiry_date?: string | null
          face_value?: number
          id?: string
          image_url?: string | null
          is_refundable?: boolean | null
          is_transferable?: boolean | null
          redemption_method?: string | null
          redemption_notes?: string | null
          sale_price?: number
          status?: Database["public"]["Enums"]["voucher_status"] | null
          terms?: string | null
          title?: string
          type?: Database["public"]["Enums"]["voucher_type"]
          updated_at?: string | null
          verification_method?: string | null
          verified_balance?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved_seller: { Args: { _user_id: string }; Returns: boolean }
      is_staff_or_admin: { Args: { _user_id: string }; Returns: boolean }
      submit_order_payment_proof: {
        Args: { p_order_id: string; p_proof_upload_url: string }
        Returns: {
          admin_notes: string | null
          amount_paid: number
          btc_address: string | null
          btc_amount: string | null
          created_at: string | null
          customer_email: string | null
          delivery_info: string | null
          delivery_status: string | null
          id: string
          order_status: Database["public"]["Enums"]["order_status"] | null
          payment_attempt_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          payment_submitted_at: string | null
          proof_upload_url: string | null
          stripe_session_id: string | null
          updated_at: string | null
          user_id: string | null
          voucher_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "customer" | "staff"
      bid_status: "pending" | "accepted" | "rejected" | "expired"
      listing_status: "open" | "closed" | "awarded" | "expired"
      order_status:
        | "pending"
        | "paid"
        | "delivered"
        | "cancelled"
        | "refunded"
        | "payment_under_review"
      payment_method: "stripe" | "bitcoin" | "zelle"
      payment_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "refunded"
        | "under_review"
      seller_status: "pending" | "approved" | "rejected" | "suspended"
      ticket_request_status:
        | "submitted"
        | "quoted"
        | "paid"
        | "ticketed"
        | "completed"
        | "cancelled"
      voucher_status: "available" | "reserved" | "sold" | "disabled"
      voucher_type: "voucher" | "certificate" | "gift_card"
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
      app_role: ["admin", "customer", "staff"],
      bid_status: ["pending", "accepted", "rejected", "expired"],
      listing_status: ["open", "closed", "awarded", "expired"],
      order_status: [
        "pending",
        "paid",
        "delivered",
        "cancelled",
        "refunded",
        "payment_under_review",
      ],
      payment_method: ["stripe", "bitcoin", "zelle"],
      payment_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "refunded",
        "under_review",
      ],
      seller_status: ["pending", "approved", "rejected", "suspended"],
      ticket_request_status: [
        "submitted",
        "quoted",
        "paid",
        "ticketed",
        "completed",
        "cancelled",
      ],
      voucher_status: ["available", "reserved", "sold", "disabled"],
      voucher_type: ["voucher", "certificate", "gift_card"],
    },
  },
} as const
