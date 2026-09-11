export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      partnerships: {
        Row: {
          accepted_at: string | null
          created_at: string
          ended_at: string | null
          id: string
          invitee_id: string
          inviter_id: string
          status: Database['public']['Enums']['partnership_status']
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          invitee_id: string
          inviter_id: string
          status?: Database['public']['Enums']['partnership_status']
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          invitee_id?: string
          inviter_id?: string
          status?: Database['public']['Enums']['partnership_status']
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      end_partnership: {
        Args: { p_partnership_id: string }
        Returns: undefined
      }
      invite_partner: {
        Args: { p_target_username: string }
        Returns: Json
      }
      list_my_partnerships: {
        Args: { p_before_created_at?: string; p_before_id?: string; p_limit?: number }
        Returns: {
          accepted_at: string | null
          created_at: string
          invitation_direction: string
          partner_avatar_url: string | null
          partner_display_name: string
          partner_id: string
          partner_username: string
          partnership_id: string
          partnership_status: Database['public']['Enums']['partnership_status']
        }[]
      }
      respond_to_partnership: {
        Args: { p_accept: boolean; p_partnership_id: string }
        Returns: undefined
      }
    }
    Enums: {
      partnership_status: 'pending' | 'active' | 'declined' | 'ended'
    }
    CompositeTypes: Record<string, never>
  }
}
