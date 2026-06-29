
import { 
  Table, Column, Row, ViewMetadata, 
  ApiResponse, ApiListResponse, 
  FieldType, ViewType, Comment, ApiOption,
  SearchConditionOption, SearchReferenceConfig,
  TemplateType, UserProfile, CollectionFormConfig, CollectionFormStatistics
} from '../types';
// import {getRequestURL} from "@/utils";

const API_HOST = 'http://192.168.1.201:5005';
// const API_HOST = getRequestURL()
const BASE_URL = `${API_HOST}/console/api/apps/multi/dimensional`;
const CONSOLE_API_URL = `${API_HOST}/console/api`;

const getHeaders = () => {
  const token = localStorage.getItem('console_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

const handleResponse = async (response: Response) => {
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('api:unauthorized'));
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `Request failed with status ${response.status}`;
    try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.message || errorJson.msg || errorJson.error || errorMessage;
    } catch (e) {
        errorMessage = errorBody || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return response.json();
};

export const api = {
  getFileUrl: (path?: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_HOST}/${path.startsWith('/') ? path.slice(1) : path}`;
  },
  
  // Data Source APIs
  getDataSourceOptions: (): Promise<ApiResponse<ApiOption[]>> => 
      fetch(`${CONSOLE_API_URL}/data/source/option?module_type=mdtable`, { headers: getHeaders() }).then(handleResponse),
  
  getDatabaseOptions: (): Promise<ApiResponse<ApiOption[]>> => 
      fetch(`${CONSOLE_API_URL}/database/option`, { headers: getHeaders() }).then(handleResponse),
      
  getDatabaseTableOptions: (databaseId: string): Promise<ApiResponse<ApiOption[]>> => 
      fetch(`${CONSOLE_API_URL}/database/${databaseId}/table/option`, { headers: getHeaders() }).then(handleResponse),
      
  getDataMartOptions: (): Promise<ApiResponse<ApiOption[]>> => 
      fetch(`${CONSOLE_API_URL}/data-mart/option`, { headers: getHeaders() }).then(handleResponse),
      
  getDataModelOptions: (datamarkId: string): Promise<ApiResponse<ApiOption[]>> => 
      fetch(`${CONSOLE_API_URL}/data_model/${datamarkId}/option`, { headers: getHeaders() }).then(handleResponse),

  // --- 接口: 获取表格权限选项 ---
  getCollaboratorRoles: (): Promise<ApiResponse<ApiOption[]>> => 
    fetch(`${API_HOST}/console/api/apps/rg/permission-types/choices?resource_type=MDTABLE`, { headers: getHeaders() })
      .then(handleResponse)
      .then(res => Array.isArray(res) ? { data: res, message: 'success' } : res),

  // --- 接口 32: 获取字段类型选项 ---
  getFieldTypes: (): Promise<ApiResponse<ApiOption[]>> => 
    fetch(`${BASE_URL}/tables/field-types`, { headers: getHeaders() })
      .then(handleResponse)
      .then(res => Array.isArray(res) ? { data: res, message: 'success' } : res),

  // --- 接口 33: 获取视图类型选项 ---
  getViewTypes: (): Promise<ApiResponse<ApiOption[]>> => 
    fetch(`${BASE_URL}/tables/view-types`, { headers: getHeaders() })
      .then(handleResponse)
      .then(res => Array.isArray(res) ? { data: res, message: 'success' } : res),

  // --- 接口 34: 获取筛选条件选项 ---
  getFilterOperators: (fieldType?: string): Promise<ApiResponse<ApiOption[]>> => {
    let url = `${BASE_URL}/tables/filter-operators`;
    if (fieldType) url += `?field_type=${fieldType}`;
    return fetch(url, { headers: getHeaders() })
      .then(handleResponse)
      .then(res => Array.isArray(res) ? { data: res, message: 'success' } : res);
  },

  // --- 接口 35: 获取排序方向选项 ---
  getSortOrders: (): Promise<ApiResponse<ApiOption[]>> => 
    fetch(`${BASE_URL}/tables/sort-orders`, { headers: getHeaders() })
      .then(handleResponse)
      .then(res => Array.isArray(res) ? { data: res, message: 'success' } : res),

  // --- 接口 36: 导入Excel数据 ---
  importExcel: (file: File, name?: string, signal?: AbortSignal): Promise<ApiResponse<Table>> => {
    const formData = new FormData();
    formData.append('file', file);
    if (name) {
      formData.append('name', name);
    }
    
    // We need to omit Content-Type so the browser sets it to multipart/form-data with the correct boundary
    const headers = getHeaders();
    delete headers['Content-Type'];

    return fetch(`${BASE_URL}/tables/import`, {
      method: 'POST',
      headers,
      body: formData,
      signal
    }).then(handleResponse);
  },

  // --- 多元数据导入 ---
  importMultiDimensionalData: (data: {
    name?: string;
    dataSource: string;
    file?: File;
    databaseId?: string;
    tableName?: string;
    datamarkId?: string;
    dataModelId?: string;
    appendToTable?: boolean;
    targetTableId?: string;
    metadataValues?: any[];
  }): Promise<ApiResponse<any>> => {
    const formData = new FormData();
    if (data.name !== undefined) {
      formData.append('name', data.name);
    }
    formData.append('data_source', data.dataSource);
    
    if (data.file) {
      formData.append('data_file', data.file);
    }
    if (data.databaseId) {
      formData.append('database_id', data.databaseId);
    }
    if (data.tableName) {
      formData.append('table_name', data.tableName);
    }
    if (data.datamarkId) {
      formData.append('datamark_id', data.datamarkId);
    }
    if (data.dataModelId) {
      formData.append('data_model_id', data.dataModelId);
    }
    if (data.appendToTable !== undefined) {
      formData.append('append_to_table', String(data.appendToTable));
    }
    if (data.targetTableId) {
      formData.append('target_table_id', data.targetTableId);
    }
    if (data.metadataValues !== undefined) {
      formData.append('metadata_values', JSON.stringify(data.metadataValues));
    }

    const headers = getHeaders();
    delete headers['Content-Type'];

    return fetch(`${BASE_URL}/tables/build`, {
      method: 'POST',
      headers,
      body: formData
    }).then(handleResponse);
  },

  // --- 导出表格 ---
  exportTable: async (tableId: string): Promise<Blob> => {
    const response = await fetch(`${BASE_URL}/tables/${tableId}/export`, {
      method: 'GET',
      headers: getHeaders()
    });
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('api:unauthorized'));
      throw new Error('Unauthorized');
    }
    if (!response.ok) {
      throw new Error(`Export failed with status ${response.status}`);
    }
    return response.blob();
  },

  // --- 接口 1: 多维表格列表 ---
  getTables: (params?: { keyword?: string; page?: number; page_size?: number }): Promise<ApiListResponse<Table>> => {
    const qs = new URLSearchParams();
    if (params?.keyword) qs.append('keyword', params.keyword);
    if (params?.page) qs.append('page', String(params.page));
    if (params?.page_size) qs.append('page_size', String(params.page_size));
    
    return fetch(`${BASE_URL}/tables?${qs.toString()}`, { headers: getHeaders() })
      .then(handleResponse)
      .then((res: ApiListResponse<Table>) => {
          if (res.data && Array.isArray(res.data.list)) {
              res.data.list = res.data.list.map(t => ({
                  ...t,
                  columns: t.columns || [],
                  views: t.views || [],
                  rows: t.rows || []
              }));
          }
          return res;
      });
  },

  // --- 接口 2: 新增多维表格 ---
  createTable: (payload: { name: string; columns?: Partial<Column>[]; views?: Partial<ViewMetadata>[]; metadata_values?: { metadata_id: string; metadata_value: string }[] }): Promise<ApiResponse<Table>> => 
    fetch(`${BASE_URL}/tables`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // --- 接口 3: 修改表格名称 ---
  updateTable: (tableId: string, payload: { name: string; metadata_values?: { metadata_id: string; metadata_value: string }[] }): Promise<ApiResponse<{id: string, name: string}>> => 
    fetch(`${BASE_URL}/tables/${tableId}`, { 
      method: 'PUT', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // --- 获取元数据配置项 ---
  getMetadataChoices: (resourceType: string = 'MDTABLE'): Promise<ApiResponse<any[]>> =>
    fetch(`${CONSOLE_API_URL}/apps/rg/metadata-definitions/choices?resource_type=${resourceType}`, { headers: getHeaders() }).then(handleResponse),

  // --- 接口 4: 删除多维表格 ---
  deleteTable: (tableId: string): Promise<ApiResponse<void>> => 
    fetch(`${BASE_URL}/tables/${tableId}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),

  // --- 接口 5: 多维表格详情 ---
  getTableDetail: (tableId: string): Promise<ApiResponse<Table>> => 
    fetch(`${BASE_URL}/tables/${tableId}`, { headers: getHeaders() }).then(handleResponse),

  // --- 接口: 模版表格详情 ---
  getTemplateTableDetail: (tableId: string, typeId?: string): Promise<ApiResponse<Table>> => {
    const url = new URL(`${BASE_URL}/tables/${tableId}`);
    if (typeId) {
      url.searchParams.append('type_id', typeId);
    }
    return fetch(url.toString(), { headers: getHeaders() })
      .then(handleResponse)
      .then((res: any) => {
          if (res.data) {
              res.data = {
                  ...res.data,
                  columns: res.data.columns || res.data.config?.columns || [],
                  views: res.data.views || res.data.config?.views || [],
                  rows: res.data.rows || res.data.config?.rows || []
              };
          }
          return res;
      });
  },

  // --- 接口 6: 复制项目 ---
  duplicateTable: (tableId: string): Promise<ApiResponse<Table>> => 
    fetch(`${BASE_URL}/tables/${tableId}/duplicate`, { method: 'POST', headers: getHeaders() }).then(handleResponse),

  // --- 接口 40: 执行分组 ---
  groupRows: (tableId: string, payload: { groups: { column_id: string; order: string }[], filters?: any[], sorts?: { column_id: string; order: string }[], search?: string }) =>
    fetch(`${BASE_URL}/tables/${tableId}/rows/group`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ...payload,
        sorts: payload.sorts || [],
        search: payload.search || ""
      })
    }).then(handleResponse),

  // --- 接口 【数据行管理】获取单元格-单向关联 ---
  getCellLink: (tableId: string, rowId: string, columnId: string): Promise<ApiResponse<{ message: string; row_ids: string[] }>> => {
    if (!rowId || rowId === 'undefined' || !tableId || tableId === 'undefined' || !columnId || columnId === 'undefined') {
       return Promise.reject(new Error('Invalid parameters for getCellLink'));
    }
    return fetch(`${BASE_URL}/tables/${tableId}/rows/${rowId}/columns/${columnId}/cell/link`, {
      method: 'GET',
      headers: getHeaders()
    }).then(handleResponse);
  },

  // --- 接口 7: 获取行列表 (POST) ---
  // --- 接口 7: 获取行列表 (POST /rows) ---
  getRows: (tableId: string, payload: { page?: number; page_size?: number; filters?: any[]; sorts?: any[]; keyword?: string; search?: string }) => 
    fetch(`${BASE_URL}/tables/${tableId}/rows`, { 
      method: 'POST', 
      headers: getHeaders(),
      body: JSON.stringify({
        page: payload.page || 1,
        page_size: payload.page_size || 100,
        filters: payload.filters || [],
        sorts: payload.sorts || [],
        keyword: payload.keyword,
        search: payload.search,
        with_comment_count: true
      })
    })
    .then(handleResponse)
    .then((json: any) => {
        // Normalize response structure
        const list = (json.data?.list || []).map((r: any) => ({
            ...r,
            // Map various possible backend field names to frontend standard
            comment_count: r.comment_count ?? r.comments_count ?? r.total_comments ?? 0
        }));
        return { data: { list, total: json.data?.total || 0, page: json.data?.page, page_size: json.data?.page_size }, message: 'success' };
    }),

  // --- 接口: 获取模版行列表 ---
  getTemplateRows: (tableId: string, typeId?: string, payload: { page?: number; page_size?: number; filters?: any[]; sorts?: any[]; search?: string } = {}): Promise<ApiListResponse<Row>> => 
    fetch(`${BASE_URL}/tables/${tableId}/rows`, { 
      method: 'POST', 
      headers: getHeaders(),
      body: JSON.stringify({
        page: payload.page || 1,
        page_size: payload.page_size || 100,
        filters: payload.filters || [],
        sorts: payload.sorts || [],
        search: payload.search,
        type_id: typeId
      })
    })
    .then(handleResponse)
    .then((json: any) => {
        const list = json.data?.list || [];
        return { data: { list, total: json.data?.total || 0, page: json.data?.page, page_size: json.data?.page_size }, message: 'success' };
    }),

  // --- 接口 8: 获取行详情 (GET) ---
  getRowDetail: (tableId: string, rowId: string): Promise<ApiResponse<Row>> => {
    if (!rowId || rowId === 'undefined' || !tableId || tableId === 'undefined') {
       return Promise.reject(new Error('Invalid parameters for getRowDetail'));
    }
    return fetch(`${BASE_URL}/tables/${tableId}/rows/${rowId}`, { headers: getHeaders() }).then(handleResponse);
  },

  // --- 接口 9: 更新行 (PUT) ---
  updateRow: (tableId: string, rowId: string, payload: { parent_id?: string | null; data: any; index?: number }): Promise<ApiResponse<Row>> => {
    if (!rowId || rowId === 'undefined' || !tableId || tableId === 'undefined') {
       return Promise.reject(new Error('Invalid parameters for updateRow'));
    }
    return fetch(`${BASE_URL}/tables/${tableId}/rows/${rowId}`, { 
      method: 'PUT', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse);
  },

  // --- 接口 10: 删除行 (DELETE) ---
  deleteRow: (tableId: string, rowId: string): Promise<ApiResponse<void>> => {
    if (!rowId || rowId === 'undefined' || !tableId || tableId === 'undefined') {
       return Promise.reject(new Error('Invalid parameters for deleteRow'));
    }
    return fetch(`${BASE_URL}/tables/${tableId}/rows/${rowId}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse);
  },

  // --- 接口 11: 创建行 (POST /create) ---
  createRow: (tableId: string, payload: { parent_id?: string | null; data: any; index?: number }): Promise<ApiResponse<Row>> => 
    fetch(`${BASE_URL}/tables/${tableId}/rows/create`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // --- 接口 37: 向上插入 (POST /insert-above) ---
  insertRowAbove: (tableId: string, payload: { data: any; index: number; parent_id: string | null }): Promise<ApiResponse<Row>> => 
    fetch(`${BASE_URL}/tables/${tableId}/rows/insert-above`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // --- 接口 38: 向下插入 (POST /insert-below) ---
  insertRowBelow: (tableId: string, payload: { data: any; index: number; parent_id: string | null }): Promise<ApiResponse<Row>> => 
    fetch(`${BASE_URL}/tables/${tableId}/rows/insert-below`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // --- 接口 12: 批量创建行 (POST /batch-create) ---
  batchCreateRows: (tableId: string, payload: { rows_data: any[] }): Promise<ApiResponse<{ created_count: number }>> => 
    fetch(`${BASE_URL}/tables/${tableId}/rows/batch-create`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // --- 接口: 批量处理行 (POST /batch-process) ---
  batchProcessRows: (tableId: string, payload: any[]): Promise<ApiResponse<any>> =>
    fetch(`${BASE_URL}/tables/${tableId}/rows/batch-process`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    }).then(handleResponse),

  // --- 接口 13: 批量删除行 (POST /batch-delete) ---
  batchDeleteRows: (tableId: string, rowIds: string[]): Promise<ApiResponse<{ deleted_count: number }>> => 
    fetch(`${BASE_URL}/tables/${tableId}/rows/batch-delete`, { 
      method: 'POST', 
      headers: getHeaders(),
      body: JSON.stringify({ row_ids: rowIds })
    }).then(handleResponse),

  // --- 接口 14: 复制行 (POST /copy) ---
  copyRow: (tableId: string, rowId: string): Promise<ApiResponse<Row>> => {
    if (!rowId || rowId === 'undefined' || !tableId || tableId === 'undefined') {
       return Promise.reject(new Error('Invalid parameters for copyRow'));
    }
    return fetch(`${BASE_URL}/tables/${tableId}/rows/${rowId}/copy`, { 
      method: 'POST', 
      headers: getHeaders() 
    }).then(handleResponse);
  },

  // --- 接口: 批量复制行 (POST /batch-copy) ---
  batchCopyRows: (tableId: string, rowIds: string[]): Promise<ApiResponse<{ rows_data: Row[] }>> => 
    fetch(`${BASE_URL}/tables/${tableId}/rows/batch-copy`, { 
      method: 'POST', 
      headers: getHeaders(),
      body: JSON.stringify({ row_ids: rowIds })
    }).then(handleResponse),

  // --- Views ---
  
  // Interface 21: 创建视图
  createView: (tableId: string, payload: { name: string; type: string; is_default: boolean; config: any }) =>
    fetch(`${BASE_URL}/tables/${tableId}/views`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),
  
  // Interface 23: 重命名视图
  renameView: (tableId: string, viewId: string, name: string) =>
    fetch(`${BASE_URL}/tables/${tableId}/views/${viewId}/name`, { 
      method: 'PATCH', 
      headers: getHeaders(), 
      body: JSON.stringify({ name }) 
    }).then(handleResponse),
  
  // Interface 22: 更新视图配置
  updateView: (tableId: string, viewId: string, payload: { is_default?: boolean; config?: any }) =>
    fetch(`${BASE_URL}/tables/${tableId}/views/${viewId}`, { 
      method: 'PUT', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // Interface 24: 删除视图
  deleteView: (tableId: string, viewId: string) =>
    fetch(`${BASE_URL}/tables/${tableId}/views/${viewId}`, { 
      method: 'DELETE', 
      headers: getHeaders() 
    }).then(handleResponse),

  // Interface 25: 复制视图
  copyView: (tableId: string, viewId: string) =>
    fetch(`${BASE_URL}/tables/${tableId}/views/${viewId}/copy`, { 
      method: 'POST', 
      headers: getHeaders() 
    }).then(handleResponse),

  // Interface 26: 更新视图排序
  updateViewSort: (tableId: string, payload: { id: string; sort: number }[]) => 
    fetch(`${BASE_URL}/tables/${tableId}/views/sort`, { 
      method: 'PATCH', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // Interface: 视图拖拽排序
  moveView: (tableId: string, viewId: string, targetSort: number) =>
    fetch(`${BASE_URL}/tables/${tableId}/views/${viewId}/move`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ target_sort: targetSort })
    }).then(handleResponse),

  // --- Columns (Interfaces 15-19) ---
  
  // Interface 15: 获取字段列表
  getColumns: (tableId: string): Promise<ApiResponse<Column[]>> =>
    fetch(`${BASE_URL}/tables/${tableId}/columns`, { headers: getHeaders() }).then(handleResponse),

  // Interface 16: 创建表格字段
  createColumn: (tableId: string, payload: Partial<Column>) => 
    fetch(`${BASE_URL}/tables/${tableId}/columns`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) }).then(handleResponse),

  // Interface 17: 更新表格字段
  updateColumn: (tableId: string, columnId: string, payload: Partial<Column>) => 
    fetch(`${BASE_URL}/tables/${tableId}/columns/${columnId}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(payload) }).then(handleResponse),

  // Interface 18: 删除表格字段
  deleteColumn: (tableId: string, columnId: string) => 
    fetch(`${BASE_URL}/tables/${tableId}/columns/${columnId}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),

  // Interface 18.5: 批量删除表格字段
  batchDeleteColumns: (tableId: string, columnIds: string[]) => 
    fetch(`${BASE_URL}/tables/${tableId}/columns/batch-delete`, { 
      method: 'POST', 
      headers: getHeaders(),
      body: JSON.stringify({ column_ids: columnIds })
    }).then(handleResponse),

  // Interface 19: 更新字段排序
  updateColumnSort: (tableId: string, payload: { id: string; sort: number }[]) => 
    fetch(`${BASE_URL}/tables/${tableId}/columns/sort`, { 
      method: 'PATCH', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // --- Template Management (Interfaces 29-31) ---
  
  // 获取个人资料 (用于检查 is_super_admin)
  getProfile: (): Promise<ApiResponse<UserProfile>> =>
    fetch(`${API_HOST}/console/api/account/profile`, { headers: getHeaders() }).then(handleResponse),

  // 获取模版类型
  getTemplateTypes: (): Promise<ApiResponse<TemplateType[]>> =>
    fetch(`${BASE_URL}/tables/templates/type`, { headers: getHeaders() }).then(handleResponse),

  // 新增模版类型
  createTemplateType: (name: string): Promise<ApiResponse<void>> =>
    fetch(`${BASE_URL}/tables/templates/type`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name })
    }).then(handleResponse),

  // 编辑模版类型
  updateTemplateType: (typeId: string, name: string): Promise<ApiResponse<void>> =>
    fetch(`${BASE_URL}/tables/templates/type`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ type_id: typeId, name })
    }).then(handleResponse),

  // 删除模版类型
  deleteTemplateType: (typeId: string): Promise<ApiResponse<void>> =>
    fetch(`${BASE_URL}/tables/templates/type`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ type_id: typeId })
    }).then(handleResponse),

  // Interface 29: 获取模版列表
  // The API returns config { columns: [] }, we map it to root columns for frontend Table type
  // Also checking config.views if available there
  getTemplates: (typeId?: string): Promise<ApiResponse<Table[]>> => {
    const qs = new URLSearchParams();
    if (typeId) qs.append('type_id', typeId);
    return fetch(`${BASE_URL}/tables/templates?${qs.toString()}`, { headers: getHeaders() })
      .then(handleResponse)
      .then((res: any) => {
          if (res.data && Array.isArray(res.data)) {
              res.data = res.data.map((tpl: any) => ({
                  ...tpl,
                  table_id: tpl.table_id || tpl.config?.table_id || tpl.id,
                  columns: tpl.columns || tpl.config?.columns || [],
                  views: tpl.views || tpl.config?.views || [],
                  rows: tpl.rows || tpl.config?.rows || []
              }));
          }
          return res;
      });
  },

  // Interface 30: 新增模版
  createTemplate: (payload: { 
      name: string; 
      description: string; 
      table_id: string; 
  }): Promise<ApiResponse<Table>> =>
    fetch(`${BASE_URL}/tables/templates`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // Interface 31: 通过模版创建表格
  createTableFromTemplate: (templateId: string, payload: { name: string; type_id: string }): Promise<ApiResponse<Table>> =>
    fetch(`${BASE_URL}/tables/templates/${templateId}/create`, { 
      method: 'POST', 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    }).then(handleResponse),

  // 接口: 表格模版发布
  publishTemplate: (payload: { type_id: string; table_id: string; name: string; description: string | null }): Promise<ApiResponse<{ message: string }>> =>
    fetch(`${BASE_URL}/tables/templates/release`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
    }).then(handleResponse),

  // 下载模版
  downloadTemplate: async (typeId: string, templateId: string): Promise<void> => {
    const token = localStorage.getItem('console_token');
    const response = await fetch(`${BASE_URL}/tables/templates/${typeId}/${templateId}/download`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('api:unauthorized'));
      alert('您的登录已过期或 Token 配置有误，请在缓存中配置 console_token 字段。');
      throw new Error('Unauthorized');
    }
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_${templateId}.yfpkg`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // 上传模版
  uploadTemplate: (file: File): Promise<ApiResponse<{ message: string }>> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('console_token');
    return fetch(`${BASE_URL}/tables/templates/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    }).then(handleResponse);
  },

  // 编辑模版
  updateTemplate: (templateId: string, typeId: string, payload: { name: string | null; description: string | null; new_type_id?: string }): Promise<ApiResponse<void>> =>
    fetch(`${BASE_URL}/tables/templates`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ 
        template_id: templateId, 
        type_id: typeId,
        name: payload.name,
        description: payload.description,
        new_type_id: payload.new_type_id || typeId
      })
    }).then(handleResponse),

  // 删除模版
  deleteTemplate: (templateId: string, typeId: string): Promise<ApiResponse<void>> =>
    fetch(`${BASE_URL}/tables/templates`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ 
        template_id: templateId,
        type_id: typeId
      })
    }).then(handleResponse),

  // 移除表格模版 (与我共享)
  removeSharedTemplate: (templateId: string): Promise<ApiResponse<{ message: string }>> =>
    fetch(`${BASE_URL}/tables/templates/${templateId}/remove`, {
      method: 'DELETE',
      headers: getHeaders()
    }).then(handleResponse),

  // 分享模版
  shareTemplate: (templateId: string, accountIds: string[]): Promise<ApiResponse<{ message: string }>> =>
    fetch(`${BASE_URL}/tables/templates/${templateId}/shared`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ account_ids: accountIds })
    }).then(handleResponse),

  // 获取已分享用户
  getSharedUsers: (templateId: string): Promise<ApiResponse<{ account_id: string, sharing_type: string }[]>> =>
    fetch(`${BASE_URL}/tables/templates/${templateId}/shared`, {
      method: 'GET',
      headers: getHeaders()
    }).then(handleResponse),

  // --- Comments ---
  
  // Interface 26: 获取评论列表
  getComments: (tableId: string, params: { row_id?: string, column_id?: string }) => {
    const qs = new URLSearchParams();
    if (params.row_id) qs.append('row_id', params.row_id);
    if (params.column_id) qs.append('column_id', params.column_id);

    return fetch(`${BASE_URL}/tables/${tableId}/comments?${qs.toString()}`, { headers: getHeaders() })
      .then(handleResponse)
      .then((res: any) => {
          // Map API response to frontend Comment type
          const rawList = Array.isArray(res.data) ? res.data : [];
          const list = rawList.map((item: any) => ({
              id: item.id,
              text: item.content,
              author: item.account_name,
              createdAt: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
              rowId: item.row_id,
              colId: item.column_id
          }));
          return { data: { list, total: res.total || list.length, page: 1, page_size: list.length }, message: res.message };
      });
  },

  // --- 接口 39: 获取各单元格评论数量 ---
  getCommentCounts: (tableId: string): Promise<ApiResponse<{ column_id: string, row_id: string, total: number }[]>> => 
    fetch(`${BASE_URL}/tables/${tableId}/comments/counts`, { headers: getHeaders() }).then(handleResponse),
    
  // Interface 27: 添加评论
  addComment: (tableId: string, payload: { row_id?: string, column_id?: string, content: string }) => 
    fetch(`${BASE_URL}/tables/${tableId}/comments`, { 
      method: 'POST', 
      headers: getHeaders(),
      body: JSON.stringify(payload)
    }).then(handleResponse)
      .then((res: any) => {
          // Map response data to frontend Comment type if needed, or just return as is
          // The API returns the created comment object in `data`
          const item = res.data;
          const comment: Comment = {
              id: item.id,
              text: item.content,
              author: item.account_name,
              createdAt: item.created_at ? new Date(item.created_at).getTime() : Date.now()
          };
          return { data: comment, total: res.total, message: res.message };
      }),

  // Interface 28: 删除评论
  deleteComment: (tableId: string, commentId: string) => 
    fetch(`${BASE_URL}/tables/${tableId}/comments/${commentId}`, { 
      method: 'DELETE', 
      headers: getHeaders() 
    }).then(handleResponse)
      .then((res: any) => ({ message: res.message, total: res.total })),

  // --- 接口 41: 获取撤回/恢复状态 ---
  getUndoRedoStatus: (tableId: string): Promise<ApiResponse<{ can_undo: boolean; can_redo: boolean }>> =>
    fetch(`${BASE_URL}/tables/${tableId}/undo-redo-status`, { headers: getHeaders() }).then(handleResponse),

  // --- 接口 42: 撤回操作 ---
  undo: (tableId: string): Promise<ApiResponse<void>> =>
    fetch(`${BASE_URL}/tables/${tableId}/undo`, { method: 'POST', headers: getHeaders() }).then(handleResponse),

  // --- 接口 43: 恢复操作 ---
  redo: (tableId: string): Promise<ApiResponse<void>> =>
    fetch(`${BASE_URL}/tables/${tableId}/redo`, { method: 'POST', headers: getHeaders() }).then(handleResponse),

  // --- 接口 44: 获取角色选项 ---
  getRoles: (): Promise<ApiResponse<{role_id: string, role_name: string}[]>> =>
    fetch(`${API_HOST}/console/api/workspaces/current/roles`, { headers: getHeaders() }).then(handleResponse),

  // --- 接口 45: 获取部门选项 ---
  getDepts: (): Promise<ApiResponse<{dept_id: string, dept_name: string}[]>> =>
    fetch(`${API_HOST}/console/api/workspaces/current/depts`, { headers: getHeaders() }).then(handleResponse),

  // --- 接口 46: 用户筛选 ---
  getMembers: (params?: { name?: string, role_ids?: string, dept_ids?: string }): Promise<{accounts: any[]}> => {
    const qs = new URLSearchParams();
    if (params?.name) qs.append('name', params.name);
    if (params?.role_ids) qs.append('role_ids', params.role_ids);
    if (params?.dept_ids) qs.append('dept_ids', params.dept_ids);
    return fetch(`${API_HOST}/console/api/workspaces/current/members?${qs.toString()}`, { headers: getHeaders() }).then(handleResponse);
  },

  getPublicUserInfo: (params: { name?: string, keyword?: string }): Promise<any> => {
    return fetch(`${API_HOST}/console/api/get-user-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    }).then(handleResponse);
  },

  // --- 接口 47: 已获得权限用户接口 ---
  getCollaborators: (tableId: string, role?: string): Promise<ApiResponse<any[]>> => {
    const qs = new URLSearchParams();
    if (role) qs.append('role', role);
    const url = role ? `${BASE_URL}/tables/${tableId}/collaborators?${qs.toString()}` : `${BASE_URL}/tables/${tableId}/collaborators`;
    return fetch(url, { headers: getHeaders() })
      .then(handleResponse)
      .then(res => {
          if (Array.isArray(res)) return { data: res, message: 'success' };
          if (res && typeof res === 'object' && res.data === undefined) {
              // Handle associative array/object from backend
              return { data: Object.values(res), message: 'success' };
          }
          return res;
      });
  },

  // --- 接口 48: 权限分配接口 ---
  assignCollaborators: (tableId: string, payload: any): Promise<ApiResponse<void>> =>
    fetch(`${BASE_URL}/tables/${tableId}/collaborators`, { 
      method: 'POST', 
      headers: getHeaders(),
      body: JSON.stringify(payload)
    }).then(handleResponse),

  // --- 权限分配修改 ---
  updateCollaborator: (tableId: string, collaboratorId: string, payload: { role: string; can_share: boolean }): Promise<ApiResponse<void>> =>
    fetch(`${BASE_URL}/tables/${tableId}/collaborators/${collaboratorId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    }).then(handleResponse),

  // --- 权限分配删除 ---
  deleteCollaborator: (tableId: string, collaboratorId: string): Promise<ApiResponse<void>> =>
    fetch(`${BASE_URL}/tables/${tableId}/collaborators/${collaboratorId}`, {
      method: 'DELETE',
      headers: getHeaders()
    }).then(handleResponse),

  // --- 接口 49: 文件上传 ---
  uploadFile: (file: File): Promise<ApiResponse<any>> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('console_token');
    return fetch(`${BASE_URL}/tables/files/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    }).then(handleResponse);
  },

  // --- 接口 50: 文件预览 ---
  previewFile: async (fileId: string): Promise<void> => {
    const token = localStorage.getItem('console_token');
    const response = await fetch(`${BASE_URL}/tables/files/${fileId}/preview`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('api:unauthorized'));
      throw new Error('Unauthorized');
    }
    if (!response.ok) throw new Error('Preview failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
  },

  // --- 接口 51: 文件下载 ---
  downloadFile: async (fileId: string, filename: string): Promise<void> => {
    const token = localStorage.getItem('console_token');
    const response = await fetch(`${BASE_URL}/tables/files/${fileId}/download`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('api:unauthorized'));
      throw new Error('Unauthorized');
    }
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // --- 获取文件 Blob (用于纯前端预览) ---
  getFileBlob: async (fileId: string): Promise<Blob> => {
    const token = localStorage.getItem('console_token');
    const response = await fetch(`${BASE_URL}/tables/files/${fileId}/download`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('api:unauthorized'));
      throw new Error('Unauthorized');
    }
    if (!response.ok) throw new Error('Failed to fetch file blob');
    return await response.blob();
  },

  // --- 接口 52: 模型选择 ---
  getModels: (): Promise<ApiResponse<{
      provider: string;
      label: { zh_Hans: string; en_US: string };
      icon_small: { zh_Hans: string; en_US: string };
      icon_large: { zh_Hans: string; en_US: string };
      status: string;
      models: {
          model: string;
          label: { zh_Hans: string; en_US: string };
          model_type: string;
          features: string[];
      }[];
  }[]>> =>
    fetch(`${API_HOST}/console/api/workspaces/current/models/model-types/llm?usage=multi-dimensional-tables`, { headers: getHeaders() }).then(handleResponse),

  // --- 接口 53: 智能生成 ---
  generateContent: (payload: {
      provider: string;
      model: string;
      content: string;
      role: string;
  }): Promise<{ content: string; message: string }> =>
    fetch(`${BASE_URL}/tables/generation`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    }).then(handleResponse),

  // --- 接口 54: 【查找引用】条件选项 ---
  getSearchConditions: (): Promise<ApiResponse<SearchConditionOption[]>> =>
    fetch(`${BASE_URL}/tables/search-conditions`, { headers: getHeaders() }).then(handleResponse),

  // --- 接口 55: 【查找引用】批量更新 ---
  batchUpdateSearchReference: (tableId: string, columnId: string): Promise<ApiResponse<{ updated_count: number }>> =>
    fetch(`${BASE_URL}/tables/${tableId}/columns/${columnId}/batch-update-search-reference`, {
      method: 'POST',
      headers: getHeaders()
    }).then(handleResponse),

  // --- 接口 56: 获取单元格 ---
  getCell: (tableId: string, rowId: string, columnId: string): Promise<ApiResponse<{ column_id: string, row_id: string, table_id: string, value: any }>> => {
    if (!rowId || rowId === 'undefined' || !tableId || tableId === 'undefined' || !columnId || columnId === 'undefined') {
       return Promise.reject(new Error('Invalid parameters for getCell'));
    }
    return fetch(`${BASE_URL}/tables/${tableId}/rows/${rowId}/cells/${columnId}`, { headers: getHeaders() }).then(handleResponse);
  },

  // --- 接口: 移动行 ---
  moveRow: (tableId: string, rowId: string, targetIndex: number): Promise<ApiResponse<void>> => {
    if (!rowId || rowId === 'undefined' || !tableId || tableId === 'undefined') {
       return Promise.reject(new Error('Invalid parameters for moveRow'));
    }
    return fetch(`${BASE_URL}/tables/${tableId}/rows/${rowId}/move`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ target_index: targetIndex })
    }).then(handleResponse);
  },

  // --- 接口: 字段类型转换 ---
  convertColumnType: (tableId: string, columnId: string, newType: string): Promise<ApiResponse<any>> =>
    fetch(`${BASE_URL}/tables/${tableId}/columns/${columnId}/convert`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ new_type: newType })
    }).then(handleResponse),

  // --- Collection Form APIs ---
  getCollectionForm: (tableId: string): Promise<ApiResponse<CollectionFormConfig>> =>
    fetch(`${BASE_URL}/tables/${tableId}/collection-form`, { headers: getHeaders() }).then(handleResponse),

  createCollectionForm: (tableId: string, payload: Partial<CollectionFormConfig>): Promise<ApiResponse<CollectionFormConfig>> =>
    fetch(`${BASE_URL}/tables/${tableId}/collection-form`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    }).then(handleResponse),

  updateCollectionForm: (tableId: string, payload: Partial<CollectionFormConfig>): Promise<ApiResponse<CollectionFormConfig>> =>
    fetch(`${BASE_URL}/tables/${tableId}/collection-form`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    }).then(handleResponse),

  submitCollectionForm: (shareCode: string, payload: Record<string, any>): Promise<ApiResponse<any>> =>
    fetch(`${BASE_URL}/tables/collection-form/public/${shareCode}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    }).then(handleResponse),

  getPublicCollectionForm: (shareCode: string): Promise<ApiResponse<CollectionFormConfig>> =>
    fetch(`${BASE_URL}/tables/collection-form/public/${shareCode}`, {
      headers: {
        'Content-Type': 'application/json',
      }
    }).then(handleResponse),

  getPublicCollectionFormColumns: (shareCode: string): Promise<ApiResponse<Column[]>> =>
    fetch(`${BASE_URL}/tables/collection-form/public/${shareCode}/columns`, {
      headers: {
        'Content-Type': 'application/json',
      }
    }).then(handleResponse),

  getCollectionFormStatistics: (tableId: string, days?: number): Promise<ApiResponse<CollectionFormStatistics>> =>
    fetch(`${BASE_URL}/tables/${tableId}/collection-form/statistics${days ? `?days=${days}` : ''}`, {
      headers: getHeaders()
    }).then(handleResponse),
};
