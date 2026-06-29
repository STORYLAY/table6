
export enum FieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  SELECT = 'SELECT',
  MULTI_SELECT = 'MULTI_SELECT',
  DATE = 'DATE',
  TIME = 'TIME',
  CHECKBOX = 'CHECKBOX',
  FORMULA = 'FORMULA',
  ATTACHMENT = 'ATTACHMENT',
  USER = 'USER',
  DEPARTMENT = 'DEPARTMENT',
  GROUP = 'GROUP',
  LINK = 'LINK',
  HYPERLINK = 'HYPERLINK',
  LOOKUP = 'LOOKUP',
  SEARCH_REFERENCE = 'SEARCH_REFERENCE'
}

export enum ViewType {
  GRID = 'GRID',
  KANBAN = 'KANBAN',
  CALENDAR = 'CALENDAR',
  GALLERY = 'GALLERY',
  GANTT = 'GANTT',
  DASHBOARD = 'DASHBOARD',
  FORM = 'FORM'
}

// 通用选项接口 (用于字段类型、视图类型、筛选条件、排序方向)
export interface ApiOption {
  label?: string;
  value?: string;
  id?: string;
  name?: string;
  multi?: boolean;
}

export enum FilterOperator {
  EQ = 'eq',
  NEQ = 'neq',
  CONTAINS = 'contains',
  GT = 'gt',
  LT = 'lt',
  GTE = 'gte',
  LTE = 'lte'
}

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc'
}

export type RowHeight = 'SHORT' | 'MEDIUM' | 'TALL' | 'EXTRA' | number;

// API Response Wrappers
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiListResponse<T> {
  data: {
    list: T[];
    page: number | null;
    page_size: number | null;
    total: number;
  };
  message?: string;
}

export interface FieldTypeOption {
  label: string;
  value: string;
}

// Field/Column Configuration
// Search Reference Types
export interface SearchConditionOption {
  label: string;
  value: string;
}

export interface SearchReferenceFilter {
  current_field_id?: string;
  target_condition_field_id: string;
  operator: string;
  value?: string;
}

export interface SearchReferenceConfig {
  target_table_id: string;
  target_field_id: string;
  filters: SearchReferenceFilter[];
}

export interface ColumnConfig {
  originalType?: FieldType;
  options?: string[]; // For SELECT/MULTI_SELECT
  option_colors?: Record<string, string>; // For SELECT/MULTI_SELECT
  linked_table_id?: string; // For LINK
  lookup_relation_col_id?: string; // For LOOKUP
  lookup_target_col_id?: string; // For LOOKUP
  form_display_style?: string;
  
  // Search Reference
  target_table_id?: string;
  target_field_id?: string;
  match_target_field_id?: string;
  match_current_field_id?: string;
  search_reference_config?: SearchReferenceConfig; // Added for structured config

  // Default Value
  defaultValue?: any;

  // Format
  format?: string;

  // Formula
  formula?: string;
}

export interface Column {
  id: string;
  name: string;
  type: FieldType;
  width?: number;
  sort?: number;
  config: ColumnConfig;
  // Additional frontend-only props (to be mapped or stored in config if API supports)
  format?: string;
  formula?: string;
  defaultValue?: any;
}

// View Metadata
export interface FilterCondition {
  column_id: string;
  operator: string; // 'contains' | 'eq' ...
  value: any;
  id?: string; // Frontend helper
}

export interface SortCondition {
  column_id: string;
  order: 'asc' | 'desc';
  id?: string; // Frontend helper
}

export interface ColorRule {
  id: string;
  fieldId: string;
  operator: string;
  value: any;
  color: string;
  isBold?: boolean;
}

export interface GroupCondition {
  column_id: string;
  order: 'asc' | 'desc';
}

export interface ViewConfig {
  groupBy?: string; // Keep for Kanban backward compatibility if needed, or migrate
  groups?: GroupCondition[];
  visibleColumns?: string[];
  filters?: FilterCondition[];
  sorts?: SortCondition[];
  rowHeight?: RowHeight;
  rowHeights?: Record<string, number>;
  columnWidths?: Record<string, number>;
  
  // Specific View Settings
  dateField?: string;
  endDateField?: string;
  titleField?: string;
  coverFieldId?: string;
  colorFieldId?: string;
  customColor?: string;
  galleryStyle?: 'standard' | 'compact';
  showFieldNames?: boolean;
  isWorkdayOnly?: boolean;
  ganttViewMode?: 'week' | 'month' | 'quarter' | 'year';
  defaultDuration?: number;
  colorRules?: ColorRule[];
}

export interface ViewMetadata {
  id: string;
  name: string;
  type: ViewType;
  is_default?: boolean;
  config?: ViewConfig;
}

// Data Table
export interface Table {
  id: string;
  name: string;
  description?: string;
  role?: 'READ' | 'EDIT' | 'EDITOR' | 'MANAGE'; // deprecated
  can_read?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  can_manage?: boolean;
  column_count?: number;
  row_count?: number;
  view_count?: number;
  can_share?: boolean;
  created_at?: string;
  updated_at?: string;
  metadata_values?: { metadata_id: string; metadata_value: string }[];
  
  // Detailed data (loaded via separate API calls usually)
  columns: Column[];
  views: ViewMetadata[];
  rows: Row[]; // Frontend cache
  is_edit?: boolean;
  is_delete?: boolean;
}

export interface Comment {
  id: string;
  text: string;
  author: string;
  createdAt: number;
  rowId?: string;
  colId?: string;
}

// Data Row
export interface Row {
  id: string;
  index?: number;
  parent_id?: string | null;
  data: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  
  // Frontend helpers
  children?: Row[]; 
  comments?: Record<string, Comment[]>;
  comment_count?: number; // Added to persist comment count from API
  isGroup?: boolean;
  groupKey?: string[] | { label: (any)[], value: (any)[] };
}

export interface AttachmentItem {
  id: string;
  name: string;
  type: string;
  url: string;
}

export interface TemplateType {
  id: string;
  name: string;
  is_delete: boolean;
  is_edit: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  is_super_admin: boolean;
  is_super_tenant: boolean;
}

export interface FieldMapping {
  form_field_id: string;
  form_field_name: string;
  column_id: string;
  is_required: boolean;
  order: number;
  column_type: string;
  form_field_config?: string;
  column_config?: string;
}

export interface FormConfig {
  theme_color: string;
  background_image: string | null;
  submit_message: string;
  field_display_styles?: Record<string, string>;
}

export interface CollectionFormConfig {
  id?: string;
  table_id: string;
  share_code?: string;
  title: string;
  description: string | null;
  field_mappings: FieldMapping[];
  form_config: FormConfig;
  is_enabled: boolean;
  submit_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CollectionFormStatistics {
  total_count: number;
  today_count: number;
  trend: {
    date: string;
    count: number;
  }[];
}

