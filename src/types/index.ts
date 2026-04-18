// types/index.ts - TIPOS GLOBALES

export interface User {
  id: string;
  email: string;
  google_id?: string;
  google_access_token?: string;
  google_refresh_token?: string;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  user_id: string;
  name: string;
  business_type: string;
  location: string;
  plan: 'ia_messaging' | 'ia_calendar';
  
  // Credenciales ENCRIPTADAS
  zavu_api_key_encrypted?: string;
  zavu_sender_id_encrypted?: string;
  
  // Google Calendar
  google_calendar_id?: string;
  google_calendar_email?: string;
  google_calendar_access_token_encrypted?: string;
  google_calendar_refresh_token_encrypted?: string;
  
  // Config
  services: string[];
  prompt_custom: string;
  
  schedule_monday: string;
  schedule_tuesday: string;
  schedule_wednesday: string;
  schedule_thursday: string;
  schedule_friday: string;
  schedule_saturday: string;
  schedule_sunday: string;
  
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  business_id: string;
  patient_name: string;
  patient_phone?: string;
  service?: string;
  date_time: string;
  google_event_id?: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  business_id: string;
  phone_from: string;
  message_type: 'incoming' | 'outgoing';
  message_text: string;
  timestamp: string;
}
