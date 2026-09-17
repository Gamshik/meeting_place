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
          time_zone: string | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          time_zone?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          time_zone?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      word_game_rounds: {
        Row: {
          accepted_answers: string[]
          audio_path: string | null
          card_id: string | null
          coach_feedback: string | null
          coach_score: number | null
          completed_at: string | null
          created_at: string
          explained_at: string | null
          explanation_method: Database['public']['Enums']['word_explanation_method'] | null
          explanation_duration_seconds: number
          explainer_id: string
          forbidden_words: string[]
          game_id: string
          guess: string | null
          id: string
          is_correct: boolean | null
          manual_reviewed_at: string | null
          manually_approved: boolean | null
          recording_finished_at: string | null
          recording_started_at: string | null
          score: number | null
          secret_word: string
          speaking_duration_seconds: number | null
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
          card_id?: string | null
          coach_feedback?: string | null
          coach_score?: number | null
          completed_at?: string | null
          created_at?: string
          explained_at?: string | null
          explanation_method?: Database['public']['Enums']['word_explanation_method'] | null
          explanation_duration_seconds?: number
          explainer_id: string
          forbidden_words: string[]
          game_id: string
          guess?: string | null
          id?: string
          is_correct?: boolean | null
          manual_reviewed_at?: string | null
          manually_approved?: boolean | null
          recording_finished_at?: string | null
          recording_started_at?: string | null
          score?: number | null
          secret_word: string
          speaking_duration_seconds?: number | null
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
      word_game_cards: {
        Row: {
          accepted_answers: string[]
          created_at: string
          difficulty: string
          forbidden_words: string[]
          id: string
          is_active: boolean
          last_used_at: string | null
          normalized_word: string
          source_model: string
          times_used: number
          topic: string
          word: string
        }
        Insert: {
          accepted_answers: string[]
          created_at?: string
          difficulty?: string
          forbidden_words: string[]
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          normalized_word: string
          source_model: string
          times_used?: number
          topic: string
          word: string
        }
        Update: Partial<Database['public']['Tables']['word_game_cards']['Insert']>
        Relationships: []
      }
      word_game_card_answers: {
        Row: {
          answer: string
          card_id: string
          normalized_answer: string
        }
        Insert: {
          answer: string
          card_id: string
          normalized_answer: string
        }
        Update: Partial<Database['public']['Tables']['word_game_card_answers']['Insert']>
        Relationships: []
      }
      word_game_card_exposures: {
        Row: {
          card_id: string
          first_seen_at: string
          last_seen_at: string
          profile_id: string
          times_seen: number
        }
        Insert: {
          card_id: string
          first_seen_at?: string
          last_seen_at?: string
          profile_id: string
          times_seen?: number
        }
        Update: Partial<Database['public']['Tables']['word_game_card_exposures']['Insert']>
        Relationships: []
      }
      word_games: {
        Row: {
          accepted_at: string | null
          created_at: string
          current_player_id: string
          disconnected_player_id: string | null
          explanation_duration_seconds: number
          finished_at: string | null
          id: string
          inviter_last_seen_at: string | null
          invitee_last_seen_at: string | null
          mode: Database['public']['Enums']['word_game_mode']
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
          explanation_duration_seconds?: number
          finished_at?: string | null
          id?: string
          inviter_last_seen_at?: string | null
          invitee_last_seen_at?: string | null
          mode?: Database['public']['Enums']['word_game_mode']
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
      cache_word_game_cards: {
        Args: {
          p_cards: Json
          p_game_id: string
          p_source_model: string
          p_topic: string
        }
        Returns: number
      }
      create_word_game_round_from_pool: {
        Args: { p_allow_seen?: boolean; p_game_id: string; p_topic: string }
        Returns: Json
      }
      list_word_game_card_exclusions: {
        Args: { p_game_id: string; p_limit?: number; p_topic: string }
        Returns: string[]
      }
      get_word_game: {
        Args: { p_partnership_id: string }
        Returns: Json
      }
      get_profile_activity: {
        Args: { p_profile_id: string; p_year: number }
        Returns: Json
      }
      finish_word_game_recording: {
        Args: { p_round_id: string }
        Returns: Json
      }
      end_word_game: {
        Args: { p_partnership_id: string }
        Returns: undefined
      }
      expire_word_game_round: {
        Args: { p_round_id: string }
        Returns: Json
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
          game_mode: Database['public']['Enums']['word_game_mode']
          game_status: Database['public']['Enums']['word_game_status']
          partnership_id: string
          requested_by: string
        }[]
      }
      list_my_word_game_history: {
        Args: Record<string, never>
        Returns: {
          finished_at: string
          game_mode: Database['public']['Enums']['word_game_mode']
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
      review_word_game_guess: {
        Args: { p_approved: boolean; p_round_id: string }
        Returns: Json
      }
      skip_word_game_round: {
        Args: { p_round_id: string }
        Returns: Json
      }
      start_word_game_recording: {
        Args: { p_round_id: string }
        Returns: Json
      }
      start_word_game: {
        Args: {
          p_explanation_duration_seconds: number
          p_mode: Database['public']['Enums']['word_game_mode']
          p_partnership_id: string
        }
        Returns: Json
      }
      update_word_game_settings: {
        Args: { p_explanation_duration_seconds: number; p_partnership_id: string }
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
      word_explanation_method: 'recorded' | 'live'
      word_game_mode: 'recorded' | 'live_call'
      word_game_status: 'pending' | 'active' | 'paused' | 'finished'
      word_round_status: 'explaining' | 'awaiting_guess' | 'completed' | 'skipped'
    }
    CompositeTypes: Record<string, never>
  }
}
