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
      approval_levels: {
        Row: {
          company_id: string
          id: string
          label: string
          level: number
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          company_id: string
          id?: string
          label: string
          level: number
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          company_id?: string
          id?: string
          label?: string
          level?: number
          project_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_levels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_levels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          bucket: string
          company_id: string
          contract_item_id: string | null
          created_at: string
          id: string
          measurement_id: string | null
          measurement_item_id: string | null
          mime_type: string
          path: string
          size_bytes: number
        }
        Insert: {
          bucket: string
          company_id: string
          contract_item_id?: string | null
          created_at?: string
          id?: string
          measurement_id?: string | null
          measurement_item_id?: string | null
          mime_type: string
          path: string
          size_bytes: number
        }
        Update: {
          bucket?: string
          company_id?: string
          contract_item_id?: string | null
          created_at?: string
          id?: string
          measurement_id?: string | null
          measurement_item_id?: string | null
          mime_type?: string
          path?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_measurement_item_id_fkey"
            columns: ["measurement_item_id"]
            isOneToOne: false
            referencedRelation: "measurement_items"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          level: number | null
          measurement_id: string | null
          new_value: string | null
          old_value: string | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          level?: number | null
          measurement_id?: string | null
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          level?: number | null
          measurement_id?: string | null
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
        }
        Relationships: []
      }
      contract_addendums: {
        Row: {
          company_id: string
          contract_id: string
          created_at: string
          description: string | null
          id: string
          number: string
        }
        Insert: {
          company_id: string
          contract_id: string
          created_at?: string
          description?: string | null
          id?: string
          number: string
        }
        Update: {
          company_id?: string
          contract_id?: string
          created_at?: string
          description?: string | null
          id?: string
          number?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_addendums_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_addendums_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_items: {
        Row: {
          addendum_id: string | null
          company_id: string
          contract_id: string
          created_at: string
          id: string
          quantity: number
          service_group: string | null
          service_name: string
          unit: Database["public"]["Enums"]["measurement_unit"]
          unit_id: string | null
          unit_price: number
        }
        Insert: {
          addendum_id?: string | null
          company_id: string
          contract_id: string
          created_at?: string
          id?: string
          quantity: number
          service_group?: string | null
          service_name: string
          unit: Database["public"]["Enums"]["measurement_unit"]
          unit_id?: string | null
          unit_price: number
        }
        Update: {
          addendum_id?: string | null
          company_id?: string
          contract_id?: string
          created_at?: string
          id?: string
          quantity?: number
          service_group?: string | null
          service_name?: string
          unit?: Database["public"]["Enums"]["measurement_unit"]
          unit_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_items_addendum_id_fkey"
            columns: ["addendum_id"]
            isOneToOne: false
            referencedRelation: "contract_addendums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          company_id: string
          created_at: string
          document: string | null
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          document?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          document?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          company_id: string
          contractor_id: string
          created_at: string
          description: string | null
          ends_on: string | null
          id: string
          number: string
          project_id: string
          starts_on: string | null
        }
        Insert: {
          company_id: string
          contractor_id: string
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          number: string
          project_id: string
          starts_on?: string | null
        }
        Update: {
          company_id?: string
          contractor_id?: string
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: string
          number?: string
          project_id?: string
          starts_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          expected_payment_date: string | null
          id: string
          issued_on: string
          measurement_id: string
          number: string
          pdf_path: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          xml_path: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          expected_payment_date?: string | null
          id?: string
          issued_on: string
          measurement_id: string
          number: string
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          xml_path?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          expected_payment_date?: string | null
          id?: string
          issued_on?: string
          measurement_id?: string
          number?: string
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          xml_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_items: {
        Row: {
          company_id: string
          contract_item_id: string
          created_at: string
          id: string
          measurement_id: string
          notes: string | null
          qty_approved: number | null
          qty_requested: number
        }
        Insert: {
          company_id: string
          contract_item_id: string
          created_at?: string
          id?: string
          measurement_id: string
          notes?: string | null
          qty_approved?: number | null
          qty_requested: number
        }
        Update: {
          company_id?: string
          contract_item_id?: string
          created_at?: string
          id?: string
          measurement_id?: string
          notes?: string | null
          qty_approved?: number | null
          qty_requested?: number
        }
        Relationships: [
          {
            foreignKeyName: "measurement_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_items_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_items_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_periods: {
        Row: {
          closes_at: string
          company_id: string
          competence: string
          created_at: string
          id: string
          opens_at: string
          project_id: string
        }
        Insert: {
          closes_at: string
          company_id: string
          competence: string
          created_at?: string
          id?: string
          opens_at: string
          project_id: string
        }
        Update: {
          closes_at?: string
          company_id?: string
          competence?: string
          created_at?: string
          id?: string
          opens_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_periods_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      measurements: {
        Row: {
          company_id: string
          contract_id: string
          created_at: string
          current_level: number
          id: string
          period_id: string
          protocol: string | null
          status: Database["public"]["Enums"]["measurement_status"]
          submitted_at: string | null
          version: number
        }
        Insert: {
          company_id: string
          contract_id: string
          created_at?: string
          current_level?: number
          id?: string
          period_id: string
          protocol?: string | null
          status?: Database["public"]["Enums"]["measurement_status"]
          submitted_at?: string | null
          version?: number
        }
        Update: {
          company_id?: string
          contract_id?: string
          created_at?: string
          current_level?: number
          id?: string
          period_id?: string
          protocol?: string | null
          status?: Database["public"]["Enums"]["measurement_status"]
          submitted_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "measurements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "measurement_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          company_id: string
          contractor_id: string | null
          created_at: string
          id: string
          project_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          contractor_id?: string | null
          created_at?: string
          id?: string
          project_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          contractor_id?: string | null
          created_at?: string
          id?: string
          project_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          emailed_at: string | null
          id: string
          kind: string
          link: string | null
          measurement_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          emailed_at?: string | null
          id?: string
          kind: string
          link?: string | null
          measurement_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          emailed_at?: string | null
          id?: string
          kind?: string
          link?: string | null
          measurement_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
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
      period_reopenings: {
        Row: {
          authorized_by: string | null
          company_id: string
          contractor_id: string
          created_at: string
          id: string
          period_id: string
          reason: string
          reopened_until: string
        }
        Insert: {
          authorized_by?: string | null
          company_id: string
          contractor_id: string
          created_at?: string
          id?: string
          period_id: string
          reason: string
          reopened_until: string
        }
        Update: {
          authorized_by?: string | null
          company_id?: string
          contractor_id?: string
          created_at?: string
          id?: string
          period_id?: string
          reason?: string
          reopened_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_reopenings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_reopenings_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_reopenings_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "measurement_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          approval_levels: number
          company_id: string
          created_at: string
          id: string
          invoice_tolerance: number
          measurement_input_mode: Database["public"]["Enums"]["input_mode"]
          name: string
          unit_label: string
        }
        Insert: {
          approval_levels?: number
          company_id: string
          created_at?: string
          id?: string
          invoice_tolerance?: number
          measurement_input_mode?: Database["public"]["Enums"]["input_mode"]
          name: string
          unit_label?: string
        }
        Update: {
          approval_levels?: number
          company_id?: string
          created_at?: string
          id?: string
          invoice_tolerance?: number
          measurement_input_mode?: Database["public"]["Enums"]["input_mode"]
          name?: string
          unit_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          company_id: string
          id: string
          name: string
          position: number
          project_id: string
        }
        Insert: {
          company_id: string
          id?: string
          name: string
          position?: number
          project_id: string
        }
        Update: {
          company_id?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_types: {
        Row: {
          area: number | null
          company_id: string
          id: string
          name: string
          project_id: string
        }
        Insert: {
          area?: number | null
          company_id: string
          id?: string
          name: string
          project_id: string
        }
        Update: {
          area?: number | null
          company_id?: string
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_types_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          company_id: string
          id: string
          name: string
          position: number
          stage_id: string
          unit_type_id: string | null
        }
        Insert: {
          company_id: string
          id?: string
          name: string
          position?: number
          stage_id: string
          unit_type_id?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          name?: string
          position?: number
          stage_id?: string
          unit_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_item_approved_qty: {
        Args: { p_item_id: string; p_qty_approved: number }
        Returns: undefined
      }
      approve_direct_billing: { Args: { p_id: string }; Returns: undefined }
      approve_invoice: { Args: { p_invoice_id: string }; Returns: undefined }
      pay_direct_billing: { Args: { p_id: string }; Returns: undefined }
      return_direct_billing: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      approve_measurement: {
        Args: { p_measurement_id: string }
        Returns: Database["public"]["Enums"]["measurement_status"]
      }
      attach_measurement_file: {
        Args: {
          p_bucket: string
          p_contract_item_id: string
          p_measurement_id: string
          p_mime_type: string
          p_path: string
          p_size_bytes: number
        }
        Returns: string
      }
      auth_company_ids: { Args: never; Returns: string[] }
      auth_project_ids: { Args: never; Returns: string[] }
      can_read_contract: { Args: { p_contract_id: string }; Returns: boolean }
      cancel_measurement: {
        Args: { p_measurement_id: string; p_reason: string }
        Returns: undefined
      }
      contract_item_balance: {
        Args: { p_exclude_measurement?: string; p_item_id: string }
        Returns: number
      }
      contract_summary: {
        Args: { p_contract_id: string }
        Returns: {
          approved: number
          available: number
          contracted: number
          in_review: number
        }[]
      }
      get_company_measurements: {
        Args: { p_status?: string }
        Returns: {
          competence: string
          contract_id: string
          contract_number: string
          contractor_id: string
          contractor_name: string
          current_level: number
          id: string
          items_count: number
          project_id: string
          project_name: string
          protocol: string
          status: Database["public"]["Enums"]["measurement_status"]
          submitted_at: string
          total_approved: number
          total_requested: number
        }[]
      }
      get_contract_items_overview: {
        Args: { p_contract_id: string }
        Returns: {
          balance_amount: number
          balance_qty: number
          item_id: string
          measured_qty: number
          quantity: number
          service_group: string
          service_name: string
          stage_name: string
          total_price: number
          unit: string
          unit_name: string
          unit_price: number
        }[]
      }
      get_contract_services_summary: {
        Args: { p_contract_id: string }
        Returns: {
          balance_amount: number
          balance_quantity: number
          locations: number
          measured_amount: number
          measured_quantity: number
          service_group: string
          service_name: string
          total_amount: number
          total_quantity: number
          unit: string
        }[]
      }
      get_current_measurement_progress: {
        Args: { p_contract_id: string }
        Returns: {
          competence: string
          current_level: number
          expected_payment_date: string
          invoice_number: string
          invoice_status: string
          measurement_id: string
          project_id: string
          protocol: string
          status: string
          submitted_at: string
        }[]
      }
      get_measurement_analysis_details: {
        Args: { p_measurement_id: string }
        Returns: {
          contract_balance: number
          contract_item_id: string
          item_id: string
          notes: string
          qty_approved: number
          qty_requested: number
          service_group: string
          service_name: string
          stage_name: string
          subtotal_approved: number
          subtotal_requested: number
          unit: string
          unit_name: string
          unit_price: number
          unit_quantity: number
        }[]
      }
      get_measurement_audit_timeline: {
        Args: { p_measurement_id: string }
        Returns: {
          action: string
          actor_name: string
          actor_role: string
          created_at: string
          id: string
          level: number
          new_value: string
          old_value: string
          reason: string
          service_name: string
        }[]
      }
      get_measurement_files: {
        Args: { p_contract_item_id?: string; p_measurement_id: string }
        Returns: {
          bucket: string
          contract_item_id: string
          created_at: string
          id: string
          mime_type: string
          path: string
          size_bytes: number
        }[]
      }
      get_measurement_invoice_details: {
        Args: { p_measurement_id: string }
        Returns: Json
      }
      get_measurement_review: {
        Args: { p_measurement_id: string }
        Returns: {
          contract_item_id: string
          measurement_item_id: string
          notes: string
          qty_requested: number
          service_group: string
          service_name: string
          stage_name: string
          subtotal: number
          unit: string
          unit_name: string
          unit_price: number
        }[]
      }
      get_measurement_stages_and_units: {
        Args: { p_measurement_id: string }
        Returns: {
          measured_items: number
          stage_id: string
          stage_name: string
          stage_position: number
          total_contracted: number
          total_items: number
          total_measured: number
          unit_id: string
          unit_name: string
          unit_position: number
        }[]
      }
      get_measurement_statement: {
        Args: { p_measurement_id: string }
        Returns: Json
      }
      get_or_create_draft: { Args: { p_contract_id: string }; Returns: Json }
      get_pending_invoices: {
        Args: never
        Returns: {
          approved_amount: number
          competence: string
          contractor_name: string
          invoice_amount: number
          invoice_id: string
          invoice_issued_on: string
          invoice_number: string
          invoice_status: Database["public"]["Enums"]["invoice_status"]
          measurement_id: string
          measurement_status: Database["public"]["Enums"]["measurement_status"]
          pdf_path: string
          project_name: string
          protocol: string
          submitted_at: string
          xml_path: string
          notes: string | null
        }[]
      }
      cobrar_envio_medicao: { Args: { p_contract_id: string }; Returns: number }
      get_direct_billing: { Args: { p_id: string }; Returns: Json }
      get_measurement_submission_status: {
        Args: never
        Returns: {
          closes_at: string
          competence: string
          contract_id: string
          contract_number: string
          contractor_id: string
          contractor_name: string
          measurement_id: string | null
          measurement_status: Database["public"]["Enums"]["measurement_status"] | null
          period_open: boolean
          project_id: string
          project_name: string
          sent: boolean
        }[]
      }
      list_direct_billings: {
        Args: {
          p_statuses?: Database["public"]["Enums"]["direct_billing_status"][]
        }
        Returns: {
          amount: number
          approved_at: string | null
          billing_type: string
          contract_number: string
          contractor_name: string
          description: string
          id: string
          issued_on: string
          notes: string | null
          number: string
          paid_at: string | null
          pdf_path: string | null
          project_name: string
          protocol: string
          return_reason: string | null
          status: Database["public"]["Enums"]["direct_billing_status"]
          submitted_at: string | null
          xml_path: string | null
        }[]
      }
      get_pending_measurements: {
        Args: never
        Returns: {
          competence: string
          contract_id: string
          contract_number: string
          contractor_id: string
          contractor_name: string
          current_level: number
          id: string
          items_count: number
          project_id: string
          project_name: string
          protocol: string
          status: Database["public"]["Enums"]["measurement_status"]
          submitted_at: string
          total_approved: number
          total_requested: number
        }[]
      }
      get_period_contractors_status: {
        Args: { p_period_id: string }
        Returns: {
          contract_id: string
          contract_number: string
          contractor_id: string
          contractor_name: string
          measurement_id: string
          measurement_status: string
          period_open: boolean
          protocol: string
          reopened_until: string
        }[]
      }
      get_unit_services_for_measurement: {
        Args: { p_measurement_id: string; p_unit_id: string }
        Returns: {
          balance: number
          contract_item_id: string
          measured_qty: number
          notes: string
          quantity: number
          service_group: string
          service_name: string
          subtotal: number
          unit: string
          unit_price: number
        }[]
      }
      is_company_staff: { Args: { p_company_id: string }; Returns: boolean }
      is_period_open: {
        Args: { p_contractor_id: string; p_period_id: string }
        Returns: boolean
      }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      measurement_total: {
        Args: { p_approved: boolean; p_measurement_id: string }
        Returns: number
      }
      next_protocol: { Args: { p_measurement_id: string }; Returns: string }
      notificar: {
        Args: {
          p_body: string
          p_company: string
          p_kind: string
          p_link?: string
          p_measurement?: string
          p_title: string
          p_users: string[]
        }
        Returns: number
      }
      notify_deadline_approaching: {
        Args: { p_period_id: string }
        Returns: number
      }
      notify_period_opened: { Args: { p_period_id: string }; Returns: number }
      pay_invoice: { Args: { p_invoice_id: string }; Returns: undefined }
      percent_from_qty: {
        Args: { p_item_id: string; p_qty: number }
        Returns: number
      }
      qty_from_percent: {
        Args: { p_item_id: string; p_percent: number }
        Returns: number
      }
      reject_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
      remove_measurement_file: {
        Args: { p_attachment_id: string }
        Returns: undefined
      }
      reopen_period: {
        Args: {
          p_contractor_id: string
          p_period_id: string
          p_reason: string
          p_until: string
        }
        Returns: string
      }
      return_measurement: {
        Args: { p_measurement_id: string; p_reason: string }
        Returns: undefined
      }
      save_measurement_items: {
        Args: { p_items: Json; p_measurement_id: string }
        Returns: undefined
      }
      set_invoice_expected_payment: {
        Args: { p_expected_date: string; p_invoice_id: string }
        Returns: undefined
      }
      submit_invoice: {
        Args: {
          p_amount: number
          p_issued_on: string
          p_measurement_id: string
          p_number: string
          p_notes?: string
          p_pdf?: string
          p_xml?: string
        }
        Returns: string
      }
      submit_direct_billing: {
        Args: {
          p_amount: number
          p_contract_id: string
          p_description: string
          p_id: string | null
          p_issued_on: string
          p_notes?: string | null
          p_number: string
          p_pdf?: string | null
          p_type: string
          p_xml?: string | null
        }
        Returns: string
      }
      submit_measurement: {
        Args: { p_measurement_id: string }
        Returns: string
      }
      usuarios_da_construtora: {
        Args: {
          p_company: string
          p_roles?: Database["public"]["Enums"]["app_role"][]
        }
        Returns: string[]
      }
      usuarios_do_contratado: {
        Args: { p_company: string; p_contractor: string }
        Returns: string[]
      }
    }
    Enums: {
      direct_billing_status:
        | "RASCUNHO"
        | "ENVIADO"
        | "AGUARDANDO_ENGENHARIA"
        | "DEVOLVIDO"
        | "APROVADO"
        | "PAGO"
      app_role:
        | "admin"
        | "engenharia"
        | "coordenacao"
        | "gerencia"
        | "financeiro"
        | "empreiteiro"
        | "incorporadora"
      input_mode: "quantidade" | "percentual"
      invoice_status:
        | "RECEBIDA"
        | "EM_CONFERENCIA"
        | "APROVADA"
        | "REJEITADA"
        | "PAGA"
      measurement_status:
        | "RASCUNHO"
        | "EM_ANALISE"
        | "DEVOLVIDA"
        | "APROVADA"
        | "NF_ENVIADA"
        | "NF_APROVADA"
        | "PAGA"
        | "CANCELADA"
      measurement_unit:
        | "m2"
        | "m3"
        | "ml"
        | "un"
        | "pt"
        | "vb"
        | "kg"
        | "ton"
        | "h"
        | "diaria"
        | "pct"
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
    Enums: {
      direct_billing_status: [
        "RASCUNHO",
        "ENVIADO",
        "AGUARDANDO_ENGENHARIA",
        "DEVOLVIDO",
        "APROVADO",
        "PAGO",
      ],
      app_role: [
        "admin",
        "engenharia",
        "coordenacao",
        "gerencia",
        "financeiro",
        "empreiteiro",
        "incorporadora",
      ],
      input_mode: ["quantidade", "percentual"],
      invoice_status: [
        "RECEBIDA",
        "EM_CONFERENCIA",
        "APROVADA",
        "REJEITADA",
        "PAGA",
      ],
      measurement_status: [
        "RASCUNHO",
        "EM_ANALISE",
        "DEVOLVIDA",
        "APROVADA",
        "NF_ENVIADA",
        "NF_APROVADA",
        "PAGA",
        "CANCELADA",
      ],
      measurement_unit: [
        "m2",
        "m3",
        "ml",
        "un",
        "pt",
        "vb",
        "kg",
        "ton",
        "h",
        "diaria",
        "pct",
      ],
    },
  },
} as const

