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
      _cron_secrets: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      admin_alerts: {
        Row: {
          admin_response: string | null
          alert_type: string
          conversation_id: string
          created_at: string
          customer_context: string | null
          discount_requested: string | null
          id: string
          is_read: boolean | null
          message: string
          responded_at: string | null
        }
        Insert: {
          admin_response?: string | null
          alert_type: string
          conversation_id: string
          created_at?: string
          customer_context?: string | null
          discount_requested?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          responded_at?: string | null
        }
        Update: {
          admin_response?: string | null
          alert_type?: string
          conversation_id?: string
          created_at?: string
          customer_context?: string | null
          discount_requested?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          responded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_alerts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "customer_conversation_history"
            referencedColumns: ["conversation_id"]
          },
        ]
      }
      admin_duffel_cards: {
        Row: {
          brand: string | null
          created_at: string
          created_by: string | null
          duffel_card_id: string
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          is_test: boolean
          label: string
          last4: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          created_by?: string | null
          duffel_card_id: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          is_test?: boolean
          label: string
          last4?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          created_by?: string | null
          duffel_card_id?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          is_test?: boolean
          label?: string
          last4?: string | null
        }
        Relationships: []
      }
      agent_memory_cache: {
        Row: {
          compiled_at: string
          compiled_content: string
          id: string
          memory_type: string
          stats: Json | null
        }
        Insert: {
          compiled_at?: string
          compiled_content: string
          id?: string
          memory_type: string
          stats?: Json | null
        }
        Update: {
          compiled_at?: string
          compiled_content?: string
          id?: string
          memory_type?: string
          stats?: Json | null
        }
        Relationships: []
      }
      agent_room_messages: {
        Row: {
          agent_name: string
          content: string
          created_at: string
          id: string
          meta: Json | null
          role: string
          room_id: string
        }
        Insert: {
          agent_name: string
          content: string
          created_at?: string
          id?: string
          meta?: Json | null
          role: string
          room_id: string
        }
        Update: {
          agent_name?: string
          content?: string
          created_at?: string
          id?: string
          meta?: Json | null
          role?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "agent_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_rooms: {
        Row: {
          azure_conversation_id: string | null
          azure_response_id: string | null
          created_at: string
          id: string
          room: string
          title: string | null
          updated_at: string
        }
        Insert: {
          azure_conversation_id?: string | null
          azure_response_id?: string | null
          created_at?: string
          id?: string
          room: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          azure_conversation_id?: string | null
          azure_response_id?: string | null
          created_at?: string
          id?: string
          room?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "customer_conversation_history"
            referencedColumns: ["conversation_id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          admin_notes: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          is_serious: boolean | null
          last_discount_requested: string | null
          needs_admin_attention: boolean | null
          owner_verified: boolean | null
          session_id: string
          status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          is_serious?: boolean | null
          last_discount_requested?: string | null
          needs_admin_attention?: boolean | null
          owner_verified?: boolean | null
          session_id: string
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          is_serious?: boolean | null
          last_discount_requested?: string | null
          needs_admin_attention?: boolean | null
          owner_verified?: boolean | null
          session_id?: string
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_conversation_history"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "ai_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      azure_agent_threads: {
        Row: {
          assistant_id: string
          channel: string
          created_at: string
          external_id: string
          id: string
          last_message_at: string
          thread_id: string
        }
        Insert: {
          assistant_id: string
          channel: string
          created_at?: string
          external_id: string
          id?: string
          last_message_at?: string
          thread_id: string
        }
        Update: {
          assistant_id?: string
          channel?: string
          created_at?: string
          external_id?: string
          id?: string
          last_message_at?: string
          thread_id?: string
        }
        Relationships: []
      }
      azure_assistants: {
        Row: {
          assistant_id: string
          instructions: string | null
          model: string
          name: string | null
          role: string
          updated_at: string
        }
        Insert: {
          assistant_id: string
          instructions?: string | null
          model: string
          name?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          assistant_id?: string
          instructions?: string | null
          model?: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
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
          {
            foreignKeyName: "bids_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_queue: {
        Row: {
          booking_method: string
          booking_result: Json | null
          call_log_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          inventory_id: string | null
          inventory_type: string
          priority: number | null
          quote_id: string | null
          retry_count: number | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          ticket_request_id: string | null
          updated_at: string
        }
        Insert: {
          booking_method: string
          booking_result?: Json | null
          call_log_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          inventory_id?: string | null
          inventory_type: string
          priority?: number | null
          quote_id?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          ticket_request_id?: string | null
          updated_at?: string
        }
        Update: {
          booking_method?: string
          booking_result?: Json | null
          call_log_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          inventory_id?: string | null
          inventory_type?: string
          priority?: number | null
          quote_id?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          ticket_request_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_queue_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_queue_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quote_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_queue_ticket_request_id_fkey"
            columns: ["ticket_request_id"]
            isOneToOne: false
            referencedRelation: "ticket_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          admin_notes: string | null
          airline: string
          answered_at: string | null
          booked_flight_info: string | null
          booked_price: number | null
          call_sid: string | null
          call_summary: string | null
          call_type: string | null
          confirmation_number: string | null
          conversation_id: string | null
          created_at: string
          customer_email: string | null
          customer_phone: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          passenger_names: string | null
          phone_number: string
          started_at: string | null
          status: string
          ticket_request_id: string | null
          transcript: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          airline: string
          answered_at?: string | null
          booked_flight_info?: string | null
          booked_price?: number | null
          call_sid?: string | null
          call_summary?: string | null
          call_type?: string | null
          confirmation_number?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          passenger_names?: string | null
          phone_number: string
          started_at?: string | null
          status?: string
          ticket_request_id?: string | null
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          airline?: string
          answered_at?: string | null
          booked_flight_info?: string | null
          booked_price?: number | null
          call_sid?: string | null
          call_summary?: string | null
          call_type?: string | null
          confirmation_number?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          passenger_names?: string | null
          phone_number?: string
          started_at?: string | null
          status?: string
          ticket_request_id?: string | null
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_ticket_request_id_fkey"
            columns: ["ticket_request_id"]
            isOneToOne: false
            referencedRelation: "ticket_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      car_rental_requests: {
        Row: {
          admin_notes: string | null
          budget: number | null
          car_type: string | null
          contact_email: string
          contact_phone: string | null
          created_at: string | null
          drivers_age: number | null
          dropoff_date: string
          dropoff_location: string | null
          dropoff_time: string | null
          id: string
          needs_child_seat: boolean | null
          needs_gps: boolean | null
          needs_insurance: boolean | null
          num_drivers: number | null
          pickup_date: string
          pickup_location: string
          pickup_time: string | null
          quoted_price: number | null
          rental_company: string | null
          special_notes: string | null
          status: string
          transmission: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          budget?: number | null
          car_type?: string | null
          contact_email: string
          contact_phone?: string | null
          created_at?: string | null
          drivers_age?: number | null
          dropoff_date: string
          dropoff_location?: string | null
          dropoff_time?: string | null
          id?: string
          needs_child_seat?: boolean | null
          needs_gps?: boolean | null
          needs_insurance?: boolean | null
          num_drivers?: number | null
          pickup_date: string
          pickup_location: string
          pickup_time?: string | null
          quoted_price?: number | null
          rental_company?: string | null
          special_notes?: string | null
          status?: string
          transmission?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          budget?: number | null
          car_type?: string | null
          contact_email?: string
          contact_phone?: string | null
          created_at?: string | null
          drivers_age?: number | null
          dropoff_date?: string
          dropoff_location?: string | null
          dropoff_time?: string | null
          id?: string
          needs_child_seat?: boolean | null
          needs_gps?: boolean | null
          needs_insurance?: boolean | null
          num_drivers?: number | null
          pickup_date?: string
          pickup_location?: string
          pickup_time?: string | null
          quoted_price?: number | null
          rental_company?: string | null
          special_notes?: string | null
          status?: string
          transmission?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          source: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          source?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          source?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      duffel_bookings: {
        Row: {
          booking_reference: string | null
          contact_email: string
          contact_phone: string | null
          created_at: string
          customer_amount: number
          customer_currency: string
          duffel_order: Json | null
          duffel_order_id: string | null
          error: string | null
          id: string
          offer_id: string
          passengers: Json
          status: string
          stripe_session_id: string | null
          updated_at: string
          user_id: string | null
          wholesale_amount: number
          wholesale_currency: string
        }
        Insert: {
          booking_reference?: string | null
          contact_email: string
          contact_phone?: string | null
          created_at?: string
          customer_amount: number
          customer_currency: string
          duffel_order?: Json | null
          duffel_order_id?: string | null
          error?: string | null
          id?: string
          offer_id: string
          passengers: Json
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string | null
          wholesale_amount: number
          wholesale_currency: string
        }
        Update: {
          booking_reference?: string | null
          contact_email?: string
          contact_phone?: string | null
          created_at?: string
          customer_amount?: number
          customer_currency?: string
          duffel_order?: Json | null
          duffel_order_id?: string | null
          error?: string | null
          id?: string
          offer_id?: string
          passengers?: Json
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string | null
          wholesale_amount?: number
          wholesale_currency?: string
        }
        Relationships: []
      }
      foundry_connection_backups: {
        Row: {
          agent_name: string | null
          id: string
          label: string
          payload: Json
          scope: string
          taken_at: string
        }
        Insert: {
          agent_name?: string | null
          id?: string
          label: string
          payload: Json
          scope: string
          taken_at?: string
        }
        Update: {
          agent_name?: string | null
          id?: string
          label?: string
          payload?: Json
          scope?: string
          taken_at?: string
        }
        Relationships: []
      }
      foundry_connection_probes: {
        Row: {
          agent_name: string
          auth_type: string | null
          connection_name: string | null
          connection_type: string | null
          error: Json | null
          id: string
          identity_used: string | null
          phase: string
          ran_at: string
          raw: Json | null
          test_result: string | null
        }
        Insert: {
          agent_name: string
          auth_type?: string | null
          connection_name?: string | null
          connection_type?: string | null
          error?: Json | null
          id?: string
          identity_used?: string | null
          phase: string
          ran_at?: string
          raw?: Json | null
          test_result?: string | null
        }
        Update: {
          agent_name?: string
          auth_type?: string | null
          connection_name?: string | null
          connection_type?: string | null
          error?: Json | null
          id?: string
          identity_used?: string | null
          phase?: string
          ran_at?: string
          raw?: Json | null
          test_result?: string | null
        }
        Relationships: []
      }
      foundry_runs: {
        Row: {
          agent_name: string
          channel: string | null
          conversation_id: string | null
          duration_ms: number | null
          ended_at: string | null
          error: string | null
          external_id: string | null
          final_text: string | null
          id: string
          request_message: string | null
          response_id: string | null
          source: string
          started_at: string
          status: string
          steps: Json
        }
        Insert: {
          agent_name: string
          channel?: string | null
          conversation_id?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          error?: string | null
          external_id?: string | null
          final_text?: string | null
          id?: string
          request_message?: string | null
          response_id?: string | null
          source?: string
          started_at?: string
          status?: string
          steps?: Json
        }
        Update: {
          agent_name?: string
          channel?: string | null
          conversation_id?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          error?: string | null
          external_id?: string | null
          final_text?: string | null
          id?: string
          request_message?: string | null
          response_id?: string | null
          source?: string
          started_at?: string
          status?: string
          steps?: Json
        }
        Relationships: []
      }
      gift_cards: {
        Row: {
          airline: string
          balance: number
          billing_address: string | null
          billing_city: string | null
          billing_country: string | null
          billing_state: string | null
          billing_zip: string | null
          card_cvv_encrypted: string | null
          card_exp_month: string | null
          card_exp_year: string | null
          card_identifier: string
          card_number_encrypted: string | null
          card_reference: string
          cardholder_name: string | null
          created_at: string
          expiry_date: string | null
          id: string
          notes: string | null
          original_balance: number
          purchase_price: number | null
          status: string
          updated_at: string
        }
        Insert: {
          airline: string
          balance: number
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_state?: string | null
          billing_zip?: string | null
          card_cvv_encrypted?: string | null
          card_exp_month?: string | null
          card_exp_year?: string | null
          card_identifier: string
          card_number_encrypted?: string | null
          card_reference: string
          cardholder_name?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          original_balance: number
          purchase_price?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          airline?: string
          balance?: number
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_state?: string | null
          billing_zip?: string | null
          card_cvv_encrypted?: string | null
          card_exp_month?: string | null
          card_exp_year?: string | null
          card_identifier?: string
          card_number_encrypted?: string | null
          card_reference?: string
          cardholder_name?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          original_balance?: number
          purchase_price?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      maya_conversation_reviews: {
        Row: {
          best_moment: string | null
          call_log_id: string | null
          channel: string | null
          closing_score: number | null
          conversation_id: string | null
          customer_id: string | null
          customer_preferences_learned: Json | null
          id: string
          missed_opportunity: string | null
          objection_handling_score: number | null
          outcome: string | null
          outcome_value: number | null
          overall_score: number | null
          product_knowledge_score: number | null
          rapport_score: number | null
          reviewed_at: string
          strengths: Json | null
          suggestions: Json | null
          tags: string[] | null
          transcript_snippet: string | null
          weaknesses: Json | null
          worst_moment: string | null
        }
        Insert: {
          best_moment?: string | null
          call_log_id?: string | null
          channel?: string | null
          closing_score?: number | null
          conversation_id?: string | null
          customer_id?: string | null
          customer_preferences_learned?: Json | null
          id?: string
          missed_opportunity?: string | null
          objection_handling_score?: number | null
          outcome?: string | null
          outcome_value?: number | null
          overall_score?: number | null
          product_knowledge_score?: number | null
          rapport_score?: number | null
          reviewed_at?: string
          strengths?: Json | null
          suggestions?: Json | null
          tags?: string[] | null
          transcript_snippet?: string | null
          weaknesses?: Json | null
          worst_moment?: string | null
        }
        Update: {
          best_moment?: string | null
          call_log_id?: string | null
          channel?: string | null
          closing_score?: number | null
          conversation_id?: string | null
          customer_id?: string | null
          customer_preferences_learned?: Json | null
          id?: string
          missed_opportunity?: string | null
          objection_handling_score?: number | null
          outcome?: string | null
          outcome_value?: number | null
          overall_score?: number | null
          product_knowledge_score?: number | null
          rapport_score?: number | null
          reviewed_at?: string
          strengths?: Json | null
          suggestions?: Json | null
          tags?: string[] | null
          transcript_snippet?: string | null
          weaknesses?: Json | null
          worst_moment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maya_conversation_reviews_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maya_conversation_reviews_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maya_conversation_reviews_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "customer_conversation_history"
            referencedColumns: ["conversation_id"]
          },
          {
            foreignKeyName: "maya_conversation_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_conversation_history"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "maya_conversation_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_customer_memory: {
        Row: {
          avoid_topics: string[] | null
          booking_history_count: number | null
          budget_range: string | null
          common_objections: string[] | null
          created_at: string
          customer_id: string | null
          id: string
          key_facts: Json | null
          preferred_airlines: string[] | null
          preferred_cabin_class: string | null
          preferred_tone: string | null
          rapport_level: number | null
          response_style: string | null
          total_spend: number | null
          travel_frequency: string | null
          trust_level: number | null
          typical_destinations: string[] | null
          updated_at: string
          what_failed: string[] | null
          what_works: string[] | null
        }
        Insert: {
          avoid_topics?: string[] | null
          booking_history_count?: number | null
          budget_range?: string | null
          common_objections?: string[] | null
          created_at?: string
          customer_id?: string | null
          id?: string
          key_facts?: Json | null
          preferred_airlines?: string[] | null
          preferred_cabin_class?: string | null
          preferred_tone?: string | null
          rapport_level?: number | null
          response_style?: string | null
          total_spend?: number | null
          travel_frequency?: string | null
          trust_level?: number | null
          typical_destinations?: string[] | null
          updated_at?: string
          what_failed?: string[] | null
          what_works?: string[] | null
        }
        Update: {
          avoid_topics?: string[] | null
          booking_history_count?: number | null
          budget_range?: string | null
          common_objections?: string[] | null
          created_at?: string
          customer_id?: string | null
          id?: string
          key_facts?: Json | null
          preferred_airlines?: string[] | null
          preferred_cabin_class?: string | null
          preferred_tone?: string | null
          rapport_level?: number | null
          response_style?: string | null
          total_spend?: number | null
          travel_frequency?: string | null
          trust_level?: number | null
          typical_destinations?: string[] | null
          updated_at?: string
          what_failed?: string[] | null
          what_works?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "maya_customer_memory_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customer_conversation_history"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "maya_customer_memory_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_global_learnings: {
        Row: {
          applies_to: string[] | null
          avoid_when: string[] | null
          confidence_score: number | null
          description: string
          discovered_at: string
          example: string | null
          failure_count: number | null
          id: string
          is_active: boolean | null
          last_validated: string | null
          learning_type: string
          source: string | null
          success_count: number | null
          success_rate: number | null
          title: string
        }
        Insert: {
          applies_to?: string[] | null
          avoid_when?: string[] | null
          confidence_score?: number | null
          description: string
          discovered_at?: string
          example?: string | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_validated?: string | null
          learning_type: string
          source?: string | null
          success_count?: number | null
          success_rate?: number | null
          title: string
        }
        Update: {
          applies_to?: string[] | null
          avoid_when?: string[] | null
          confidence_score?: number | null
          description?: string
          discovered_at?: string
          example?: string | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_validated?: string | null
          learning_type?: string
          source?: string | null
          success_count?: number | null
          success_rate?: number | null
          title?: string
        }
        Relationships: []
      }
      maya_prompt_adaptations: {
        Row: {
          adaptation_type: string
          content: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          positive_outcomes: number | null
          priority: number | null
          scope: string
          scope_id: string | null
          times_used: number | null
        }
        Insert: {
          adaptation_type: string
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          positive_outcomes?: number | null
          priority?: number | null
          scope: string
          scope_id?: string | null
          times_used?: number | null
        }
        Update: {
          adaptation_type?: string
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          positive_outcomes?: number | null
          priority?: number | null
          scope?: string
          scope_id?: string | null
          times_used?: number | null
        }
        Relationships: []
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
      points_accounts: {
        Row: {
          account_identifier: string
          airline: string
          created_at: string
          expiry_date: string | null
          id: string
          login_reference: string
          notes: string | null
          owner_name: string | null
          points_balance: number
          purchase_price: number | null
          status: string
          updated_at: string
        }
        Insert: {
          account_identifier: string
          airline: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          login_reference: string
          notes?: string | null
          owner_name?: string | null
          points_balance?: number
          purchase_price?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_identifier?: string
          airline?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          login_reference?: string
          notes?: string | null
          owner_name?: string | null
          points_balance?: number
          purchase_price?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          is_active: boolean
          max_market_price: number | null
          min_market_price: number | null
          notes: string | null
          priority: number
          rule_name: string
        }
        Insert: {
          created_at?: string
          discount_percent?: number
          id?: string
          is_active?: boolean
          max_market_price?: number | null
          min_market_price?: number | null
          notes?: string | null
          priority?: number
          rule_name: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          is_active?: boolean
          max_market_price?: number | null
          min_market_price?: number | null
          notes?: string | null
          priority?: number
          rule_name?: string
        }
        Relationships: []
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
      quote_logs: {
        Row: {
          admin_notes: string | null
          alaska_available: boolean | null
          auto_approved: boolean
          booking_method: string | null
          conversation_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_applied: number | null
          gift_card_id: string | null
          id: string
          inventory_id: string | null
          inventory_type: string | null
          market_price: number | null
          passengers: number
          payment_method: string | null
          points_account_id: string | null
          quoted_price: number
          route: string
          status: string
          ticket_request_id: string | null
          travel_dates: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          alaska_available?: boolean | null
          auto_approved?: boolean
          booking_method?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_applied?: number | null
          gift_card_id?: string | null
          id?: string
          inventory_id?: string | null
          inventory_type?: string | null
          market_price?: number | null
          passengers?: number
          payment_method?: string | null
          points_account_id?: string | null
          quoted_price: number
          route: string
          status?: string
          ticket_request_id?: string | null
          travel_dates: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          alaska_available?: boolean | null
          auto_approved?: boolean
          booking_method?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_applied?: number | null
          gift_card_id?: string | null
          id?: string
          inventory_id?: string | null
          inventory_type?: string | null
          market_price?: number | null
          passengers?: number
          payment_method?: string | null
          points_account_id?: string | null
          quoted_price?: number
          route?: string
          status?: string
          ticket_request_id?: string | null
          travel_dates?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_logs_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_logs_points_account_id_fkey"
            columns: ["points_account_id"]
            isOneToOne: false
            referencedRelation: "points_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_logs_ticket_request_id_fkey"
            columns: ["ticket_request_id"]
            isOneToOne: false
            referencedRelation: "ticket_requests"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "seller_reviews_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers_public"
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
      shopper_profile: {
        Row: {
          bill_to: Json
          budget_daily_cap_usd: number | null
          id: number
          notes: string | null
          payment_brand: string | null
          payment_cvv: string | null
          payment_exp: string | null
          payment_holder: string | null
          payment_last4: string | null
          payment_pan: string | null
          payment_ref: string | null
          ship_to: Json
          updated_at: string
        }
        Insert: {
          bill_to?: Json
          budget_daily_cap_usd?: number | null
          id?: number
          notes?: string | null
          payment_brand?: string | null
          payment_cvv?: string | null
          payment_exp?: string | null
          payment_holder?: string | null
          payment_last4?: string | null
          payment_pan?: string | null
          payment_ref?: string | null
          ship_to?: Json
          updated_at?: string
        }
        Update: {
          bill_to?: Json
          budget_daily_cap_usd?: number | null
          id?: number
          notes?: string | null
          payment_brand?: string | null
          payment_cvv?: string | null
          payment_exp?: string | null
          payment_holder?: string | null
          payment_last4?: string | null
          payment_pan?: string | null
          payment_ref?: string | null
          ship_to?: Json
          updated_at?: string
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
          active_call_id: string | null
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
          active_call_id?: string | null
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
          active_call_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "ticket_requests_active_call_id_fkey"
            columns: ["active_call_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
        ]
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
      vapi_call_events: {
        Row: {
          at: string
          call_id: string
          content: string
          id: string
          meta: Json | null
          role: string
        }
        Insert: {
          at?: string
          call_id: string
          content: string
          id?: string
          meta?: Json | null
          role: string
        }
        Update: {
          at?: string
          call_id?: string
          content?: string
          id?: string
          meta?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "vapi_call_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "vapi_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      vapi_calls: {
        Row: {
          agent_name: string
          created_at: string
          ended_at: string | null
          goal: string | null
          id: string
          phone_number: string
          room_id: string | null
          started_at: string
          status: string
          summary: string | null
          updated_at: string
          vapi_call_id: string | null
        }
        Insert: {
          agent_name: string
          created_at?: string
          ended_at?: string | null
          goal?: string | null
          id?: string
          phone_number: string
          room_id?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          updated_at?: string
          vapi_call_id?: string | null
        }
        Update: {
          agent_name?: string
          created_at?: string
          ended_at?: string | null
          goal?: string | null
          id?: string
          phone_number?: string
          room_id?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          updated_at?: string
          vapi_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vapi_calls_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "agent_rooms"
            referencedColumns: ["id"]
          },
        ]
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
      war_room_cron_log: {
        Row: {
          fired_at: string
          id: number
          job: string
          req_id: number | null
        }
        Insert: {
          fired_at?: string
          id?: number
          job: string
          req_id?: number | null
        }
        Update: {
          fired_at?: string
          id?: number
          job?: string
          req_id?: number | null
        }
        Relationships: []
      }
      war_room_heartbeats: {
        Row: {
          agent_name: string
          current_task_id: string | null
          last_beat_at: string
          mood: string | null
          status_line: string | null
        }
        Insert: {
          agent_name: string
          current_task_id?: string | null
          last_beat_at?: string
          mood?: string | null
          status_line?: string | null
        }
        Update: {
          agent_name?: string
          current_task_id?: string | null
          last_beat_at?: string
          mood?: string | null
          status_line?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "war_room_heartbeats_current_task_id_fkey"
            columns: ["current_task_id"]
            isOneToOne: false
            referencedRelation: "war_room_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      war_room_messages: {
        Row: {
          addressed_to: string[] | null
          agent_name: string
          content: string
          created_at: string
          id: string
          meta: Json | null
          role: string
        }
        Insert: {
          addressed_to?: string[] | null
          agent_name: string
          content: string
          created_at?: string
          id?: string
          meta?: Json | null
          role?: string
        }
        Update: {
          addressed_to?: string[] | null
          agent_name?: string
          content?: string
          created_at?: string
          id?: string
          meta?: Json | null
          role?: string
        }
        Relationships: []
      }
      war_room_tasks: {
        Row: {
          assignee: string
          created_at: string
          created_by: string
          deadline_at: string | null
          description: string | null
          id: string
          priority: number
          result: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee: string
          created_at?: string
          created_by?: string
          deadline_at?: string | null
          description?: string | null
          id?: string
          priority?: number
          result?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: string
          created_at?: string
          created_by?: string
          deadline_at?: string | null
          description?: string | null
          id?: string
          priority?: number
          result?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      customer_conversation_history: {
        Row: {
          conversation_id: string | null
          conversation_started: string | null
          customer_id: string | null
          email: string | null
          full_name: string | null
          last_activity: string | null
          messages: Json | null
          phone: string | null
          session_id: string | null
        }
        Relationships: []
      }
      sellers_public: {
        Row: {
          business_name: string | null
          created_at: string | null
          description: string | null
          id: string | null
          logo_url: string | null
          website: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          website?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          website?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _cron_call: { Args: { fn: string; payload?: Json }; Returns: number }
      _cron_fire: {
        Args: { fn: string; job: string; payload?: Json }
        Returns: undefined
      }
      get_customer_context: { Args: { p_customer_id: string }; Returns: Json }
      get_or_create_customer_by_phone: {
        Args: { p_phone: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved_seller: { Args: { _user_id: string }; Returns: boolean }
      is_staff_or_admin: { Args: { _user_id: string }; Returns: boolean }
      link_conversation_to_customer: {
        Args: { p_conversation_id: string; p_customer_id: string }
        Returns: undefined
      }
      search_documents: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          content: string
          document_id: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
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
      war_room_stale_sweep: { Args: never; Returns: number }
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
      payment_method: "stripe" | "bitcoin" | "zelle" | "paypal" | "escrow"
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
      payment_method: ["stripe", "bitcoin", "zelle", "paypal", "escrow"],
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
