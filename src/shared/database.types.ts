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
      word_game_rounds: {
        Row: {
          accepted_answers: string[]
          audio_path: string | null
          coach_feedback: string | null
          coach_score: number | null
          completed_at: string | null
          created_at: string
          explainer_id: string
          forbidden_words: string[]
          game_id: string
          guess: string | null
          id: string
          is_correct: boolean | null
          score: number | null
          secret_word: string
          status: Database['public']['Enums']['word_round_status']
          topic: string
          transcript: string | null
          transcript_words: Json
          turn_number: number
          used_forbidden_word: boolean | null
        }
        Insert: {
          accepted_answers: string[]
          audio_path?: string | null
          coach_feedback?: string | null
          coach_score?: number | null
          completed_at?: string | null
          created_at?: string
          explainer_id: string
          forbidden_words: string[]
          game_id: string
          guess?: string | null
          id?: string
          is_correct?: boolean | null
          score?: number | null
          secret_word: string
          status?: Database['public']['Enums']['word_round_status']
          topic: string
          transcript?: string | null
          transcript_words?: Json
          turn_number: number
          used_forbidden_word?: boolean | null
        }
        Update: Partial<Database['public']['Tables']['word_game_rounds']['Insert']>
        Relationships: []
      }
      word_games: {
        Row: {
          accepted_at: string | null
          created_at: string
          current_player_id: string
          disconnected_player_id: string | null
          finished_at: string | null
          id: string
          inviter_last_seen_at: string | null
          invitee_last_seen_at: string | null
          partnership_id: string
          paused_at: string | null
          presence_ready: boolean
          reconnect_deadline: string | null
          requested_by: string
          status: Database['public']['Enums']['word_game_status']
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          current_player_id: string
          disconnected_player_id?: string | null
          finished_at?: string | null
          id?: string
          inviter_last_seen_at?: string | null
          invitee_last_seen_at?: string | null
          partnership_id: string
          paused_at?: string | null
          presence_ready?: boolean
          reconnect_deadline?: string | null
          requested_by: string
          status?: Database['public']['Enums']['word_game_status']
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['word_games']['Insert']>
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
      create_word_game_round: {
        Args: {
          p_accepted_answers: string[]
          p_forbidden_words: string[]
          p_game_id: string
          p_secret_word: string
          p_topic: string
        }
        Returns: Json
      }
      get_word_game: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      end_word_game: {
        Args: { p_partnership_id: string }
        Returns: undefined
      }
      heartbeat_word_game: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      leave_word_game: {
        Args: { p_partnership_id: string }
        Returns: undefined
      }
      list_my_word_games: {
        Args: Record<string, never>
        Returns: {
          game_status: Database['public']['Enums']['word_game_status']
          partnership_id: string
          requested_by: string
        }[]
      }
      list_my_word_game_history: {
        Args: Record<string, never>
        Returns: {
          finished_at: string
          history_id: string
          my_score: number
          partner_avatar_url: string | null
          partner_display_name: string
          partner_id: string
          partner_score: number
          partner_username: string
          partnership_id: string
          round_count: number
          rounds: Json
        }[]
      }
      guess_word_game_round: {
        Args: { p_guess: string; p_round_id: string }
        Returns: Json
      }
      skip_word_game_round: {
        Args: { p_round_id: string }
        Returns: Json
      }
      start_word_game: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      cancel_word_game: {
        Args: { p_game_id: string }
        Returns: undefined
      }
      respond_to_word_game: {
        Args: { p_accept: boolean; p_game_id: string }
        Returns: Json
      }
      submit_word_game_transcript: {
        Args: {
          p_coach_feedback?: string | null
          p_coach_score?: number | null
          p_round_id: string
          p_transcript: string
          p_transcript_words: Json
        }
        Returns: Json
      }
    }
    Enums: {
      partnership_status: 'pending' | 'active' | 'declined' | 'ended'
      word_game_status: 'pending' | 'active' | 'paused' | 'finished'
      word_round_status: 'explaining' | 'awaiting_guess' | 'completed' | 'skipped'
    }
    CompositeTypes: Record<string, never>
  }
}
