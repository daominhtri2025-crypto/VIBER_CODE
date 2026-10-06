
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "chapters": {
                  Row: {
                    "course_id": string,"created_at": string,"id": string,"position": number,"title": string,"updated_at": string
                  }
                  Insert: {
                    "course_id": string,"created_at"?: string,"id"?: string,"position": number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"id"?: string,"position"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chapters_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "cover_image_path": string | null,"created_at": string,"id": string,"is_featured": boolean,"language": Database["public"]['Enums']["learning_language"],"level": Database["public"]['Enums']["skill_level"],"objectives_md": string,"position": number,"requirements_md": string,"slug": string,"status": Database["public"]['Enums']["content_status"],"summary": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "cover_image_path"?: string | null,"created_at"?: string,"id"?: string,"is_featured"?: boolean,"language": Database["public"]['Enums']["learning_language"],"level"?: Database["public"]['Enums']["skill_level"],"objectives_md"?: string,"position"?: number,"requirements_md"?: string,"slug": string,"status"?: Database["public"]['Enums']["content_status"],"summary"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "cover_image_path"?: string | null,"created_at"?: string,"id"?: string,"is_featured"?: boolean,"language"?: Database["public"]['Enums']["learning_language"],"level"?: Database["public"]['Enums']["skill_level"],"objectives_md"?: string,"position"?: number,"requirements_md"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["content_status"],"summary"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"enrollments": {
                  Row: {
                    "course_id": string,"created_at": string,"user_id": string
                  }
                  Insert: {
                    "course_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollments_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"exercise_attempts": {
                  Row: {
                    "exercise_id": string,"tried_at": string,"user_id": string
                  }
                  Insert: {
                    "exercise_id": string,"tried_at"?: string,"user_id": string
                  }
                  Update: {
                    "exercise_id"?: string,"tried_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercise_attempts_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    }
                  ]
                },"exercise_contents": {
                  Row: {
                    "exercise_id": string,"hint1_md": string,"hint2_md": string | null,"statement_md": string,"updated_at": string
                  }
                  Insert: {
                    "exercise_id": string,"hint1_md"?: string,"hint2_md"?: string | null,"statement_md"?: string,"updated_at"?: string
                  }
                  Update: {
                    "exercise_id"?: string,"hint1_md"?: string,"hint2_md"?: string | null,"statement_md"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercise_contents_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: true
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    }
                  ]
                },"exercise_solutions": {
                  Row: {
                    "exercise_id": string,"solution_md": string,"updated_at": string
                  }
                  Insert: {
                    "exercise_id": string,"solution_md"?: string,"updated_at"?: string
                  }
                  Update: {
                    "exercise_id"?: string,"solution_md"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercise_solutions_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: true
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    }
                  ]
                },"exercises": {
                  Row: {
                    "course_id": string,"created_at": string,"difficulty": Database["public"]['Enums']["skill_level"],"id": string,"lesson_id": string | null,"position": number,"slug": string,"status": Database["public"]['Enums']["content_status"],"title": string,"updated_at": string
                  }
                  Insert: {
                    "course_id": string,"created_at"?: string,"difficulty"?: Database["public"]['Enums']["skill_level"],"id"?: string,"lesson_id"?: string | null,"position": number,"slug": string,"status"?: Database["public"]['Enums']["content_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"difficulty"?: Database["public"]['Enums']["skill_level"],"id"?: string,"lesson_id"?: string | null,"position"?: number,"slug"?: string,"status"?: Database["public"]['Enums']["content_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercises_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exercises_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_paths": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"language": Database["public"]['Enums']["learning_language"],"position": number,"slug": string,"status": Database["public"]['Enums']["content_status"],"title": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string,"id"?: string,"language": Database["public"]['Enums']["learning_language"],"position"?: number,"slug": string,"status"?: Database["public"]['Enums']["content_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"language"?: Database["public"]['Enums']["learning_language"],"position"?: number,"slug"?: string,"status"?: Database["public"]['Enums']["content_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"lesson_contents": {
                  Row: {
                    "body_md": string,"lesson_id": string,"updated_at": string,"video_url": string | null
                  }
                  Insert: {
                    "body_md"?: string,"lesson_id": string,"updated_at"?: string,"video_url"?: string | null
                  }
                  Update: {
                    "body_md"?: string,"lesson_id"?: string,"updated_at"?: string,"video_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_contents_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: true
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_progress": {
                  Row: {
                    "completed_at": string | null,"last_viewed_at": string,"lesson_id": string,"user_id": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"last_viewed_at"?: string,"lesson_id": string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"last_viewed_at"?: string,"lesson_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_progress_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "chapter_id": string,"created_at": string,"id": string,"is_preview": boolean,"position": number,"slug": string,"status": Database["public"]['Enums']["content_status"],"summary": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "chapter_id": string,"created_at"?: string,"id"?: string,"is_preview"?: boolean,"position": number,"slug": string,"status"?: Database["public"]['Enums']["content_status"],"summary"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "chapter_id"?: string,"created_at"?: string,"id"?: string,"is_preview"?: boolean,"position"?: number,"slug"?: string,"status"?: Database["public"]['Enums']["content_status"],"summary"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_chapter_id_fkey"
      columns: ["chapter_id"]
isOneToOne: false
      referencedRelation: "chapters"
      referencedColumns: ["id"]
    }
                  ]
                },"path_courses": {
                  Row: {
                    "course_id": string,"path_id": string,"position": number
                  }
                  Insert: {
                    "course_id": string,"path_id": string,"position": number
                  }
                  Update: {
                    "course_id"?: string,"path_id"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "path_courses_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "path_courses_path_id_fkey"
      columns: ["path_id"]
isOneToOne: false
      referencedRelation: "learning_paths"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_roles": {
                  Row: {
                    "granted_at": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Insert: {
                    "granted_at"?: string,"role"?: Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "app_role": "student"|"admin","content_status": "draft"|"published"|"archived","learning_language": "scratch"|"python","skill_level": "beginner"|"intermediate"|"advanced"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["student", "admin"],"content_status": ["draft", "published", "archived"],"learning_language": ["scratch", "python"],"skill_level": ["beginner", "intermediate", "advanced"]
          }
        }
} as const
