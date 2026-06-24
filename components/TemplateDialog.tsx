
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Table, FieldType, ViewType, TemplateType } from '../types';
import { ICONS, parseJsonArray } from '../constants';
import { Tooltip } from './Tooltip';
import { api } from '../services/api';
import { toast } from 'sonner';
import GridView from './GridView';
import KanbanView from './KanbanView';
import CalendarView from './CalendarView';
import GalleryView from './GalleryView';
import GanttView from './GanttView';
import DashboardView from './DashboardView';

interface TemplateDialogProps {
  onClose: () => void;
  onSelect: (template: Table, typeId: string) => void;
}

type Mode = 'MARKET' | 'CREATE_FROM_EXISTING';

const renderPreviewCellValue = (val: any, col?: any, isMini?: boolean) => {
    if (val === undefined || val === null) return '';
    
    if (col && col.type === FieldType.HYPERLINK && typeof val === 'string') {
        if (isMini) return val;
        return (
            <a 
                href={val.startsWith('http') ? val : `https://${val}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
                onClick={(e) => e.stopPropagation()}
            >
                {val}
            </a>
        );
    }

    if (col && col.type === FieldType.ATTACHMENT) {
        const files = parseJsonArray(val);
        if (files.length > 0) {
            if (isMini) {
                return files.map((file: any) => file.filename || file.name || 'Attachment').join(', ');
            }
            return (
                <div className="flex gap-1 items-center overflow-x-auto">
                    {files.map((file: any, index: number) => {
                    const fileName = file.filename || file.name || 'Attachment';
                    const fileUrl = file.url || file.path || file.download_url;
                    if (!fileUrl) return <span key={index} className="text-gray-500 truncate">{fileName}</span>;
                    return (
                        <Tooltip content="点击查看/下载">
                            <a 
                                key={index}
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded whitespace-nowrap text-xs"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                <span className="truncate max-w-[100px]">{fileName}</span>
                            </a>
                        </Tooltip>
                    );
                })}
            </div>
        );
        }
    }

    if (Array.isArray(val)) {
        return val.map((item: any) => {
            if (typeof item === 'object' && item !== null) {
                if (col && col.type === FieldType.USER) {
                    return item.real_name || item.name || item.id || JSON.stringify(item);
                }
                return item.name || item.title || item.value || item.id || JSON.stringify(item);
            }
            return String(item);
        }).join(', ');
    }
    
    if (typeof val === 'object' && val !== null) {
        if (col && col.type === FieldType.USER) {
            return val.real_name || val.name || val.id || JSON.stringify(val);
        }
        return val.name || val.title || val.value || val.id || JSON.stringify(val);
    }
    
    return String(val);
};

const TemplateMiniPreview = ({ tpl, selectedTypeId }: { tpl: any, selectedTypeId: string | undefined }) => {
    const [rows, setRows] = useState<any[]>(tpl.rows || []);
    const [columns, setColumns] = useState<any[]>(tpl.columns || []);
    const [loading, setLoading] = useState(true);
    const [rowsLoaded, setRowsLoaded] = useState(!!(tpl.rows && tpl.rows.length > 0));

    useEffect(() => {
        let isMounted = true;
        
        const loadData = async () => {
            try {
                let currentRows = rows;
                const targetId = tpl.table_id || tpl.id;
                // Fetch columns if missing
                if (!columns || columns.length === 0) {
                    const detailRes = await api.getTemplateTableDetail(targetId, selectedTypeId);
                    if (isMounted && detailRes.data) {
                        if (detailRes.data.columns) setColumns(detailRes.data.columns);
                        if (detailRes.data.rows && detailRes.data.rows.length > 0) {
                            currentRows = detailRes.data.rows;
                            setRows(currentRows);
                            setRowsLoaded(true);
                        }
                    }
                }
                
                // Fetch rows if missing
                if (isMounted && (!currentRows || currentRows.length === 0)) {
                    const rowsRes = await api.getTemplateRows(targetId, selectedTypeId, { page_size: 3 } as any);
                    if (isMounted) {
                        if (rowsRes.data?.list) {
                            setRows(rowsRes.data.list);
                        }
                        setRowsLoaded(true);
                    }
                }
            } catch (e) {
                // Ignore errors for non-existent tables as requested
                console.warn(`Failed to load preview for template ${tpl.id}:`, e);
                if (isMounted) setRowsLoaded(true); // Mark as loaded even on error to stop showing skeletons
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadData();

        return () => { isMounted = false; };
    }, [tpl.id, selectedTypeId]);

    if (loading && (!columns || columns.length === 0)) {
        return (
            <div className="w-full h-full bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden shadow-sm">
                <div className="h-6 border-b border-gray-100 bg-gray-50/50 flex items-center px-2 gap-2 overflow-hidden">
                    <div className="w-2 h-2 rounded-full bg-gray-200" />
                    <div className="w-8 h-1.5 bg-gray-200 rounded-full" />
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-hidden">
                    <div className="flex gap-2">
                        <div className="w-1/3 h-1.5 bg-gray-100 rounded" />
                        <div className="w-2/3 h-1.5 bg-gray-100 rounded" />
                    </div>
                    <div className="flex gap-2">
                        <div className="w-1/2 h-1.5 bg-gray-50 rounded" />
                        <div className="w-1/2 h-1.5 bg-gray-50 rounded" />
                    </div>
                    <div className="flex gap-2">
                        <div className="w-full h-1.5 bg-gray-50 rounded" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden shadow-sm">
            <div className="h-6 border-b border-gray-100 bg-gray-50/50 flex items-center px-2 gap-2 overflow-hidden">
                {columns && columns.length > 0 ? (
                    columns.slice(0, 4).map((col: any) => (
                        <div key={col.id} className="font-medium text-gray-500 truncate flex-1 text-[8px]">{col.name}</div>
                    ))
                ) : (
                    <div className="text-[8px] text-gray-400">暂无列数据</div>
                )}
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-hidden">
                {columns && columns.length > 0 ? (
                    rowsLoaded && rows.length === 0 ? (
                        <div className="text-[8px] text-gray-400 text-center mt-2">暂无数据</div>
                    ) : (
                        (rows.length > 0 ? rows.slice(0, 3) : [1, 2, 3]).map((row: any, i: number) => (
                            <div key={row.id || i} className="flex gap-2">
                                {columns.slice(0, 4).map((col: any) => {
                                    const val = row.data ? row.data[col.id] : null;
                                    const displayVal = renderPreviewCellValue(val, col, true);
                                    return (
                                        <div key={col.id} className={`h-3 rounded flex-1 text-[8px] text-gray-600 truncate px-1 flex items-center ${displayVal ? 'bg-transparent' : 'bg-gray-100'}`}>
                                            {displayVal}
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )
                ) : (
                    <div className="text-[8px] text-gray-400 text-center mt-2">暂无数据</div>
                )}
            </div>
        </div>
    );
};

const TemplateDialog: React.FC<TemplateDialogProps> = ({ onClose, onSelect }) => {
  const [mode, setMode] = useState<Mode>('MARKET');
  
  // Template Types State
  const [templateTypes, setTemplateTypes] = useState<TemplateType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isSuperTenant, setIsSuperTenant] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(false);
  
  // Market State
  const [templates, setTemplates] = useState<Table[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // User Tables State (for creating template)
  const [userTables, setUserTables] = useState<Table[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog State
  const [editDialog, setEditDialog] = useState<{ 
    isOpen: boolean, 
    type: 'TYPE' | 'TEMPLATE' | 'CREATE_TYPE' | 'CREATE_TEMPLATE', 
    id?: string, 
    name: string, 
    description?: string 
  } | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Table | null>(null);
  const [previewTableDetail, setPreviewTableDetail] = useState<Table | null>(null);
  const [previewViewId, setPreviewViewId] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [shareDialog, setShareDialog] = useState<{
    isOpen: boolean;
    templateId: string;
    templateName: string;
  } | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [sharedAccountIds, setSharedAccountIds] = useState<string[]>([]);
  const [loadingSharedUsers, setLoadingSharedUsers] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ 
    isOpen: boolean, 
    type: 'TYPE' | 'TEMPLATE' | 'REMOVE_SHARED', 
    id: string, 
    name: string 
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
          await api.uploadTemplate(file);
          toast.success('模版上传成功！');
          // Reload templates
          const res = await api.getTemplates(selectedTypeId || undefined);
          setTemplates(res.data || []);
      } catch (e: any) {
          console.error("Failed to upload template", e);
          toast.error(e.message || "上传模版失败，请重试");
      }
  };

  // Load Template Types and Profile
  useEffect(() => {
      const init = async () => {
          setLoadingTypes(true);
          try {
              const [typesRes, profileRes] = await Promise.all([
                  api.getTemplateTypes(),
                  api.getProfile()
              ]);
              if (typesRes.data) {
                  setTemplateTypes(typesRes.data);
                  if (typesRes.data.length > 0) {
                      setSelectedTypeId(typesRes.data[0].id);
                  }
              }
              const profile = (profileRes.data || profileRes) as any;
              if (profile) {
                  setIsSuperAdmin(!!profile.is_super_admin);
                  setIsSuperTenant(!!profile.is_super_tenant);
              }
          } catch (e) {
              console.error("Failed to load template types or profile", e);
          } finally {
              setLoadingTypes(false);
          }
      };
      init();
  }, []);

  // Load Templates when type changes
  useEffect(() => {
      if (mode === 'MARKET' && selectedTypeId) {
          const loadTemplates = async () => {
              setLoadingTemplates(true);
              try {
                  const res = await api.getTemplates(selectedTypeId);
                  if (res.data) {
                      setTemplates(res.data);
                  }
              } catch (e) {
                  console.error("Failed to load templates", e);
              } finally {
                  setLoadingTemplates(false);
              }
          };
          loadTemplates();
      }
  }, [mode, selectedTypeId]);

  // Load Preview Detail
  useEffect(() => {
      if (previewTemplate && selectedTypeId) {
          const loadPreviewDetail = async () => {
              setLoadingPreview(true);
              setPreviewTableDetail(null);
              setPreviewViewId(null);
              setPreviewRows([]);
              try {
                  const targetId = previewTemplate.table_id || previewTemplate.id;
                  const detailRes = await api.getTemplateTableDetail(targetId, selectedTypeId);
                  if (detailRes.data) {
                      setPreviewTableDetail(detailRes.data);
                      // Set default view
                      const defaultView = detailRes.data.views?.find(v => v.is_default) || detailRes.data.views?.[0];
                      if (defaultView) {
                          setPreviewViewId(defaultView.id);
                      }
                  }
              } catch (e) {
                  console.error("Failed to load preview detail", e);
              } finally {
                  setLoadingPreview(false);
              }
          };
          loadPreviewDetail();
      }
  }, [previewTemplate, selectedTypeId]);

  // Load Preview Rows (depends on previewViewId)
  useEffect(() => {
      if (previewTemplate && selectedTypeId && previewViewId && previewTableDetail) {
          const loadPreviewRows = async () => {
              setLoadingPreview(true);
              setPreviewRows([]);
              try {
                  const targetId = previewTemplate.table_id || previewTemplate.id;
                  const activeView = previewTableDetail.views?.find(v => v.id === previewViewId);
                  const rowsRes = await api.getTemplateRows(targetId, selectedTypeId, {
                      filters: activeView?.config?.filters || [],
                      sorts: activeView?.config?.sorts || []
                  });
                  if (rowsRes.data?.list) {
                      setPreviewRows(rowsRes.data.list);
                  }
              } catch (e) {
                  console.error("Failed to load preview rows", e);
              } finally {
                  setLoadingPreview(false);
              }
          };
          loadPreviewRows();
      }
  }, [previewTemplate, selectedTypeId, previewViewId, previewTableDetail]);

  // Load User Tables when switching to create mode
  useEffect(() => {
      if (mode === 'CREATE_FROM_EXISTING') {
          const loadTables = async () => {
              setLoadingTables(true);
              try {
                  const res = await api.getTables({ page: 1, page_size: 100 });
                  if (res.data?.list) {
                      setUserTables(res.data.list);
                  }
              } catch (e) {
                  console.error("Failed to load tables", e);
              } finally {
                  setLoadingTables(false);
              }
          };
          loadTables();
      }
  }, [mode]);

  const filteredUserTables = useMemo(() => {
      if (!searchTerm) return userTables;
      return userTables.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [userTables, searchTerm]);

  // Load Members for sharing
  useEffect(() => {
    if (shareDialog?.isOpen) {
      const loadData = async () => {
        setLoadingMembers(true);
        setLoadingSharedUsers(true);
        try {
          const [membersRes, sharedRes] = await Promise.all([
            api.getMembers(),
            api.getSharedUsers(shareDialog.templateId)
          ]);
          
          if (membersRes && membersRes.accounts) {
            setMembers(membersRes.accounts);
          }
          
          if (sharedRes && sharedRes.data) {
            setSharedAccountIds(sharedRes.data.map(u => u.account_id));
          }
        } catch (e) {
          console.error("Failed to load members or shared users", e);
        } finally {
          setLoadingMembers(false);
          setLoadingSharedUsers(false);
        }
      };
      loadData();
      setSelectedMemberIds([]);
      setMemberSearchTerm('');
    }
  }, [shareDialog?.isOpen, shareDialog?.templateId]);

  const filteredMembers = useMemo(() => {
    if (!memberSearchTerm) return members;
    const term = memberSearchTerm.toLowerCase();
    return members.filter(m => 
      (m.name || '').toLowerCase().includes(term) || 
      (m.real_name || '').toLowerCase().includes(term) ||
      (m.email || '').toLowerCase().includes(term)
    );
  }, [members, memberSearchTerm]);

  const isAllSelected = useMemo(() => {
    const selectableMembers = filteredMembers.filter(m => {
      const mid = m.account_id || m.id || m.uid;
      return !sharedAccountIds.includes(mid);
    });
    
    return selectableMembers.length > 0 && selectableMembers.every(m => {
      const mid = m.account_id || m.id || m.uid;
      return selectedMemberIds.includes(mid);
    });
  }, [filteredMembers, selectedMemberIds, sharedAccountIds]);

  const canSelectAny = useMemo(() => {
    return filteredMembers.some(m => {
      const mid = m.account_id || m.id || m.uid;
      return !sharedAccountIds.includes(mid);
    });
  }, [filteredMembers, sharedAccountIds]);

  const handleToggleSelectAll = () => {
    const filteredIds = filteredMembers
      .map(m => m.account_id || m.id || m.uid)
      .filter(id => !sharedAccountIds.includes(id));
    
    if (isAllSelected) {
      setSelectedMemberIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedMemberIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleSaveAsTemplate = async (table: Table) => {
      try {
          // 3. Create template with table_id
          await api.createTemplate({
              name: table.name,
              description: `Created from ${table.name}`,
              table_id: table.id
          });
          
          toast.success('模版创建成功！');
          setMode('MARKET'); // Go back to market to see new template
      } catch (e: any) {
          console.error("Failed to create template", e);
          toast.error(e.message || "创建模版失败，请重试");
      }
  };

  // --- Template Type Handlers ---

  const handleAddType = async (name: string) => {
      try {
          await api.createTemplateType(name);
          const res = await api.getTemplateTypes();
          setTemplateTypes(res.data || []);
          toast.success('模版类型创建成功！');
          setEditDialog(null);
      } catch (e: any) {
          toast.error(e.message || '创建失败');
      }
  };

  const handleEditType = async (id: string, name: string) => {
      try {
          await api.updateTemplateType(id, name);
          const res = await api.getTemplateTypes();
          setTemplateTypes(res.data || []);
          toast.success('修改成功！');
          setEditDialog(null);
      } catch (e: any) {
          toast.error(e.message || '修改失败');
      }
  };

  const handleDeleteType = async (id: string) => {
      try {
          await api.deleteTemplateType(id);
          const res = await api.getTemplateTypes();
          setTemplateTypes(res.data || []);
          if (selectedTypeId === id) {
              setSelectedTypeId(res.data?.[0]?.id || null);
          }
          toast.success('删除成功！');
          setConfirmDelete(null);
      } catch (e: any) {
          toast.error(e.message || '删除失败');
      }
  };

  const handleEditTemplate = async (id: string, name: string, description: string) => {

      try {
          await api.updateTemplate(id, selectedTypeId || '', { 
              name, 
              description
          });
          const res = await api.getTemplates(selectedTypeId || undefined);
          setTemplates(res.data || []);
          toast.success('修改成功！');
          setEditDialog(null);
      } catch (e: any) {
          console.error('handleEditTemplate error', e);
          toast.error(e.message || '修改失败');
      }
  };

  const handleDeleteTemplate = async (id: string) => {

      try {
          await api.deleteTemplate(id, selectedTypeId || '');
          const res = await api.getTemplates(selectedTypeId || undefined);
          setTemplates(res.data || []);
          toast.success('删除成功！');
          setConfirmDelete(null);
      } catch (e: any) {
          console.error('handleDeleteTemplate error', e);
          toast.error(e.message || '删除失败');
      }
  };

  const handleRemoveSharedTemplate = async (id: string) => {
      try {
          await api.removeSharedTemplate(id);
          const res = await api.getTemplates(selectedTypeId || undefined);
          setTemplates(res.data || []);
          toast.success('移除成功！');
          setConfirmDelete(null);
      } catch (e: any) {
          toast.error(e.message || '移除失败');
      }
  };

  const handleCreateTemplateSubmit = async (name: string) => {
      try {
          // 1. Create a table first
          const tableRes = await api.createTable({
              name,
              columns: [
                  { name: "名称", type: FieldType.TEXT },
                  { name: "状态", type: FieldType.SELECT, config: { options: ["未开始", "进行中", "已完成"] } }
              ],
              views: [
                  { name: "表格视图", type: ViewType.GRID, is_default: true }
              ]
          });
          
          if (!tableRes.data) throw new Error("创建表格失败");
          const tableId = tableRes.data.id;

          // 2. Create template with table_id
          await api.createTemplate({
              name,
              description: "用户自定义模版",
              table_id: tableId
          });
          
          // Reload list
          const res = await api.getTemplates(selectedTypeId || undefined);
          setTemplates(res.data || []);
          toast.success('模版创建成功！');
          setEditDialog(null);
      } catch (e: any) {
          console.error("Failed to create template", e);
          toast.error(e.message || "创建模版失败，请检查 Token 配置");
      }
  };

  // --- Renderers ---

  const renderMarket = () => (
    <div className="flex h-full animate-in fade-in zoom-in-95 duration-200">
        {/* Left Sidebar for Types */}
        <div className="w-64 border-r border-gray-100 flex flex-col bg-gray-50/30">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center shrink-0">
                <span className="text-sm font-bold text-gray-800">模版库</span>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
                {loadingTypes ? (
                    <div className="p-4 text-xs text-gray-400 text-center">加载中...</div>
                ) : (
                    <div className="space-y-1 px-2">
                        {templateTypes.map(type => (
                            <div 
                                key={type.id}
                                onClick={() => setSelectedTypeId(type.id)}
                                className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all ${
                                    selectedTypeId === type.id 
                                    ? 'bg-primary-50 text-primary-700 font-medium' 
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                <span className="truncate text-sm">{type.name}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Tooltip content={(isSuperAdmin && isSuperTenant || type.is_edit) ? "编辑" : "无权限编辑"} className="shrink-0">
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                if (!(isSuperAdmin && isSuperTenant) && !type.is_edit) {
                                                    toast.error("您没有权限编辑此模版类型");
                                                    return;
                                                }
                                                setEditDialog({ isOpen: true, type: 'TYPE', id: type.id, name: type.name }); 
                                            }}
                                            className={`p-1 rounded transition-colors ${(isSuperAdmin && isSuperTenant || type.is_edit) ? 'hover:bg-gray-200 text-gray-400 hover:text-primary-600' : 'text-gray-300 cursor-not-allowed'}`}
                                        >
                                            <ICONS.Edit className="w-3 h-3" />
                                        </button>
                                    </Tooltip>
                                    <Tooltip content={(isSuperAdmin && isSuperTenant || type.is_delete) ? "删除" : "无权限删除"} className="shrink-0">
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                if (!(isSuperAdmin && isSuperTenant) && !type.is_delete) {
                                                    toast.error("您没有权限删除此模版类型");
                                                    return;
                                                }
                                                setConfirmDelete({ isOpen: true, type: 'TYPE', id: type.id, name: type.name }); 
                                            }}
                                            className={`p-1 rounded transition-colors ${(isSuperAdmin && isSuperTenant || type.is_delete) ? 'hover:bg-gray-200 text-gray-400 hover:text-red-600' : 'text-gray-300 cursor-not-allowed'}`}
                                        >
                                            <ICONS.Trash className="w-3 h-3" />
                                        </button>
                                    </Tooltip>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {isSuperAdmin && isSuperTenant && (
                <div className="p-4 border-t border-gray-100 shrink-0">
                    <button 
                        onClick={() => setEditDialog({ isOpen: true, type: 'CREATE_TYPE', name: '' })}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors font-medium"
                    >
                        <ICONS.Plus className="w-4 h-4" />
                        <span>新建模版类型</span>
                    </button>
                </div>
            )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">
                        {templateTypes.find(t => t.id === selectedTypeId)?.name || '模版市场'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">选择一个模版快速开始您的工作</p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-white">
                {loadingTemplates ? (
                    <div className="flex h-full items-center justify-center text-gray-400 gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-primary-600"></div>
                        加载中...
                    </div>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                        {templates.map(tpl => (
                            <div 
                                key={tpl.id}
                                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all group flex flex-col h-[340px] overflow-hidden"
                            >
                                {/* Card Header */}
                                <div className="p-4 flex items-center justify-between shrink-0">
                                        <Tooltip content={tpl.name} className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                                                <ICONS.Template className="w-5 h-5" />
                                            </div>
                                            <h3 className="font-bold text-gray-800 truncate text-sm">{tpl.name}</h3>
                                        </Tooltip>
                                    <div className="relative">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveMenuId(activeMenuId === tpl.id ? null : tpl.id);
                                            }}
                                            className={`p-1.5 rounded-lg transition-colors ${activeMenuId === tpl.id ? 'bg-primary-50 text-primary-600' : 'hover:bg-gray-100 text-gray-400'}`}
                                        >
                                            <ICONS.MoreHorizontal className="w-5 h-5" />
                                        </button>
                                        
                                        {/* Click Actions Menu */}
                                        {activeMenuId === tpl.id && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                                                <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-20 min-w-[100px] animate-in fade-in slide-in-from-top-2 duration-200">
                                                    {templateTypes.find(t => t.id === selectedTypeId)?.name === '与我共享' ? (
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setConfirmDelete({ isOpen: true, type: 'REMOVE_SHARED', id: tpl.id, name: tpl.name });
                                                                setActiveMenuId(null);
                                                            }}
                                                            className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                                                        >
                                                            <ICONS.Trash className="w-3 h-3" /> 移除
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    api.downloadTemplate(selectedTypeId || '', tpl.id);
                                                                    setActiveMenuId(null);
                                                                }}
                                                                className="w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-primary-50 hover:text-primary-600 flex items-center gap-2"
                                                            >
                                                                <ICONS.Download className="w-3 h-3" /> 下载
                                                            </button>
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();

                                                                    if (!(isSuperAdmin && isSuperTenant) && !tpl.is_edit) {
                                                                        toast.error("您没有权限编辑此模版");
                                                                        return;
                                                                    }
                                                                    setEditDialog({ isOpen: true, type: 'TEMPLATE', id: tpl.id, name: tpl.name, description: tpl.description });
                                                                    setActiveMenuId(null);
                                                                }}
                                                                className="w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-primary-50 hover:text-primary-600 flex items-center gap-2"
                                                            >
                                                                <ICONS.Edit className="w-3 h-3" /> 编辑
                                                            </button>
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setShareDialog({ isOpen: true, templateId: tpl.id, templateName: tpl.name });
                                                                    setActiveMenuId(null);
                                                                }}
                                                                className="w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-primary-50 hover:text-primary-600 flex items-center gap-2"
                                                            >
                                                                <ICONS.Send className="w-3 h-3" /> 分享
                                                            </button>
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();

                                                                    if (!(isSuperAdmin && isSuperTenant) && !tpl.is_delete) {
                                                                        toast.error("您没有权限删除此模版");
                                                                        return;
                                                                    }
                                                                    setConfirmDelete({ isOpen: true, type: 'TEMPLATE', id: tpl.id, name: tpl.name });
                                                                    setActiveMenuId(null);
                                                                }}
                                                                className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                                                            >
                                                                <ICONS.Trash className="w-3 h-3" /> 删除
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Card Body - Preview Image */}
                                <div className="flex-1 bg-gray-50 mx-4 rounded-xl border border-gray-100 overflow-hidden relative group/preview cursor-pointer" onClick={() => setPreviewTemplate(tpl)}>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-full h-full p-2 opacity-60 group-hover/preview:opacity-100 transition-opacity">
                                            {/* Mini Table Preview */}
                                            <TemplateMiniPreview tpl={tpl} selectedTypeId={selectedTypeId} />
                                        </div>
                                    </div>
                                    <div className="absolute inset-0 bg-black/0 group-hover/preview:bg-black/5 transition-colors flex items-center justify-center">
                                        <ICONS.Search className="w-6 h-6 text-white opacity-0 group-hover/preview:opacity-100 transition-opacity drop-shadow-md" />
                                    </div>
                                </div>

                                {/* Card Footer - Actions */}
                                <div className="p-4 flex gap-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPreviewTemplate(tpl);
                                        }}
                                        className="flex-1 py-2.5 border-2 border-primary-600 text-primary-600 rounded-xl font-bold text-sm hover:bg-primary-50 transition-all active:scale-95"
                                    >
                                        预览
                                    </button>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (selectedTypeId) onSelect(tpl, selectedTypeId);
                                        }}
                                        className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 shadow-md shadow-primary-200 transition-all active:scale-95"
                                    >
                                        使用
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Add New Template Card - Only show in "我的模版" */}
                        {templateTypes.find(t => t.id === selectedTypeId)?.name === '我的模版' && (
                            <>
                                <input type="file" ref={fileInputRef} onChange={handleUpload} style={{ display: 'none' }} />
                                <div 
                                    onClick={() => setMode('CREATE_FROM_EXISTING')}
                                    className="h-[340px] rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/30 hover:bg-white hover:border-primary-500 hover:shadow-xl cursor-pointer transition-all group flex flex-col items-center justify-center gap-4 text-gray-400 hover:text-primary-600"
                                >
                                    <div className="w-14 h-14 bg-white border border-gray-100 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:border-primary-200 transition-all">
                                        <ICONS.Plus className="w-6 h-6" />
                                    </div>
                                    <div className="text-center px-6">
                                        <span className="font-bold text-sm block mb-1">保存为模版</span>
                                        <span className="text-[10px] text-gray-400">将现有文档保存为我的模版</span>
                                    </div>
                                </div>
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="h-[340px] rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/30 hover:bg-white hover:border-primary-500 hover:shadow-xl cursor-pointer transition-all group flex flex-col items-center justify-center gap-4 text-gray-400 hover:text-primary-600"
                                >
                                    <div className="w-14 h-14 bg-white border border-gray-100 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:border-primary-200 transition-all">
                                        <ICONS.Import className="w-6 h-6" />
                                    </div>
                                    <div className="text-center px-6">
                                        <span className="font-bold text-sm block mb-1">上传模版</span>
                                        <span className="text-[10px] text-gray-400">上传本地模版文件</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
  );

  const renderCreateFromExisting = () => (
    <div className="flex flex-col h-full animate-in slide-in-from-right duration-200">
        <div className="p-5 border-b border-gray-100 flex items-center gap-4 shrink-0">
            <button onClick={() => setMode('MARKET')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
               <h2 className="text-xl font-bold text-gray-800">将常用文档保存为我的模版</h2>
               <p className="text-xs text-gray-500 mt-1">选择后，云文档的副本将被创建为我的模版，原文档改动和模版内容的后续改动互不影响</p>
            </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-100">
                <div className="relative">
                    <input 
                       type="text" 
                       placeholder="搜索" 
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="w-full bg-gray-50 border border-transparent hover:bg-white hover:border-primary-300 focus:bg-white focus:border-primary-500 rounded-lg pl-9 pr-3 py-2 text-sm outline-none transition-all"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                       <ICONS.Search className="w-4 h-4" />
                    </div>
                </div>
            </div>

            {/* List Header */}
            <div className="grid grid-cols-[1fr_120px_120px_140px] items-center px-8 py-3 border-b border-gray-100 bg-gray-50/80 text-xs font-semibold text-gray-500 gap-6 uppercase tracking-wider text-center">
                <div>所有类型</div>
                <div>所有者</div>
                <div>最近打开</div>
                <div>操作</div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto">
                {loadingTables ? (
                    <div className="flex justify-center items-center h-40 text-gray-400 gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-primary-600"></div>
                        加载中...
                    </div>
                ) : filteredUserTables.length === 0 ? (
                    <div className="flex justify-center items-center h-40 text-gray-400 text-sm">暂无文档</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {filteredUserTables.map(table => (
                            <div key={table.id} className="grid grid-cols-[1fr_120px_120px_140px] items-center px-8 py-4 hover:bg-gray-50/80 transition-colors group gap-6 text-center">
                                <div className="flex items-center justify-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100/50">
                                        <ICONS.Grid className="w-4 h-4" />
                                    </div>
                                    <div className="truncate font-medium text-gray-800 text-sm">{table.name}</div>
                                </div>
                                <div className="text-sm text-gray-500 flex items-center justify-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-600 font-medium">我</div>
                                    <span>我</span>
                                </div>
                                <div className="text-sm text-gray-500">
                                    {table.updated_at ? new Date(table.updated_at).toLocaleDateString() : '刚刚'}
                                </div>
                                <div>
                                    <button 
                                        onClick={() => handleSaveAsTemplate(table)}
                                        className="text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-md text-xs font-medium transition-all opacity-0 group-hover:opacity-100 whitespace-nowrap inline-flex items-center justify-center gap-1.5"
                                    >
                                        <ICONS.Template className="w-3.5 h-3.5" />
                                        保存为模版
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[90vw] xl:max-w-[1200px] 2xl:max-w-[1400px] h-[85vh] overflow-hidden relative">
          {mode === 'MARKET' ? renderMarket() : renderCreateFromExisting()}

          {/* Edit Dialog */}
          {editDialog && editDialog.isOpen && (
              <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                      <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                          <h3 className="font-bold text-gray-800">
                              {editDialog.type === 'CREATE_TYPE' ? '新增模版类型' : 
                               editDialog.type === 'CREATE_TEMPLATE' ? '新增模版' : '编辑名称'}
                          </h3>
                          <button onClick={() => setEditDialog(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                      </div>
                      <div className="p-6 space-y-4">
                          <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1.5">名称</label>
                              <input 
                                  type="text"
                                  value={editDialog.name}
                                  onChange={(e) => setEditDialog({ ...editDialog, name: e.target.value })}
                                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 transition-all"
                                  placeholder="请输入名称"
                                  autoFocus
                              />
                          </div>
                          {editDialog.type === 'TEMPLATE' && (
                              <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1.5">描述</label>
                                  <textarea 
                                      value={editDialog.description || ''}
                                      onChange={(e) => setEditDialog({ ...editDialog, description: e.target.value })}
                                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 transition-all h-24 resize-none"
                                      placeholder="请输入描述"
                                  />
                              </div>
                          )}
                      </div>
                      <div className="p-4 bg-gray-50 flex justify-end gap-3">
                          <button 
                              onClick={() => setEditDialog(null)}
                              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          >
                              取消
                          </button>
                          <button 
                              onClick={() => {
                                  if (!editDialog.name.trim()) {
                                      toast.error('名称不能为空');
                                      return;
                                  }
                                  if (editDialog.type === 'CREATE_TYPE') handleAddType(editDialog.name);
                                  else if (editDialog.type === 'TYPE') handleEditType(editDialog.id!, editDialog.name);
                                  else if (editDialog.type === 'TEMPLATE') handleEditTemplate(editDialog.id!, editDialog.name, editDialog.description || '');
                                  else if (editDialog.type === 'CREATE_TEMPLATE') handleCreateTemplateSubmit(editDialog.name);
                              }}
                              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors shadow-sm"
                          >
                              确定
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {/* Delete Confirmation */}
          {confirmDelete && confirmDelete.isOpen && (
              <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                      <div className="p-6 text-center">
                          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                              <ICONS.Trash className="w-6 h-6" />
                          </div>
                          <h3 className="font-bold text-gray-800 text-lg mb-2">
                              {confirmDelete.type === 'REMOVE_SHARED' ? '确认移除' : '确认删除'}
                          </h3>
                          <p className="text-sm text-gray-500">
                              确定要{confirmDelete.type === 'REMOVE_SHARED' ? '移除' : '删除'}{confirmDelete.type === 'TYPE' ? '模版类型' : '模版'} "{confirmDelete.name}" 吗？此操作不可撤销。
                          </p>
                      </div>
                      <div className="p-4 bg-gray-50 flex justify-center gap-3">
                          <button 
                              onClick={() => setConfirmDelete(null)}
                              className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          >
                              取消
                          </button>
                          <button 
                              onClick={() => {
                                  if (confirmDelete.type === 'TYPE') handleDeleteType(confirmDelete.id);
                                  else if (confirmDelete.type === 'REMOVE_SHARED') handleRemoveSharedTemplate(confirmDelete.id);
                                  else handleDeleteTemplate(confirmDelete.id);
                              }}
                              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                          >
                              {confirmDelete.type === 'REMOVE_SHARED' ? '移除' : '删除'}
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {/* Preview Modal */}
          {previewTemplate && (
              <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                      {/* Preview Header */}
                      <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
                          <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg">
                                  <ICONS.Template className="w-7 h-7" />
                              </div>
                              <div>
                                  <h2 className="text-2xl font-bold text-gray-900">{previewTemplate.name}</h2>
                                  <p className="text-sm text-gray-500 mt-1">{previewTemplate.description || '暂无描述'}</p>
                              </div>
                          </div>
                          <div className="flex items-center gap-3">
                              <button 
                                  onClick={() => {
                                      if (selectedTypeId) onSelect(previewTemplate, selectedTypeId);
                                      setPreviewTemplate(null);
                                  }}
                                  className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 active:scale-95"
                              >
                                  使用此模版
                              </button>
                              <button 
                                  onClick={() => setPreviewTemplate(null)}
                                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
                              >
                                  <ICONS.Close className="w-6 h-6" />
                              </button>
                          </div>
                      </div>

                      {/* Preview Content */}
                      <div className="flex-1 overflow-auto bg-gray-50/50 p-8">
                          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[400px] flex flex-col">
                              <div className="p-4 border-b border-gray-100 bg-gray-50/30 flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                      {previewTableDetail?.views && previewTableDetail.views.length > 1 ? (
                                          previewTableDetail.views.map(view => (
                                              <button 
                                                  key={view.id}
                                                  onClick={() => setPreviewViewId(view.id)}
                                                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                                                      previewViewId === view.id 
                                                      ? 'bg-white text-primary-600 shadow-sm ring-1 ring-gray-200' 
                                                      : 'text-gray-500 hover:bg-gray-100'
                                                  }`}
                                              >
                                                  <span className="flex items-center gap-2">
                                                      {view.type === ViewType.GRID && <ICONS.Grid className="w-3.5 h-3.5" />}
                                                      {view.type === ViewType.KANBAN && <ICONS.Kanban className="w-3.5 h-3.5" />}
                                                      {view.type === ViewType.CALENDAR && <ICONS.Calendar className="w-3.5 h-3.5" />}
                                                      {view.type === ViewType.GALLERY && <ICONS.Gallery className="w-3.5 h-3.5" />}
                                                      {view.type === ViewType.GANTT && <ICONS.Gantt className="w-3.5 h-3.5" />}
                                                      {view.type === ViewType.DASHBOARD && <ICONS.Dashboard className="w-3.5 h-3.5" />}
                                                      {view.name}
                                                  </span>
                                              </button>
                                          ))
                                      ) : (
                                          <div className="flex items-center gap-2 text-gray-500 text-sm font-medium px-2">
                                              {previewTableDetail?.views?.[0]?.type === ViewType.GRID ? <ICONS.Grid className="w-4 h-4" /> :
                                               previewTableDetail?.views?.[0]?.type === ViewType.KANBAN ? <ICONS.Kanban className="w-4 h-4" /> :
                                               previewTableDetail?.views?.[0]?.type === ViewType.CALENDAR ? <ICONS.Calendar className="w-4 h-4" /> :
                                               previewTableDetail?.views?.[0]?.type === ViewType.GALLERY ? <ICONS.Gallery className="w-4 h-4" /> :
                                               previewTableDetail?.views?.[0]?.type === ViewType.GANTT ? <ICONS.Gantt className="w-4 h-4" /> :
                                               previewTableDetail?.views?.[0]?.type === ViewType.DASHBOARD ? <ICONS.Dashboard className="w-4 h-4" /> :
                                               <ICONS.Grid className="w-4 h-4" />}
                                              <span>{previewTableDetail?.views?.[0]?.name || '表格视图'}</span>
                                          </div>
                                      )}
                                  </div>
                                  {previewTableDetail && (
                                      <div className="text-xs text-gray-400 shrink-0">
                                          共 {previewRows.length} 条记录
                                      </div>
                                  )}
                              </div>
                              <div className={`flex-1 p-8 flex flex-col items-center ${(!previewTableDetail && !loadingPreview) ? 'justify-center text-center' : ''}`}>
                                  {(!previewTableDetail && !loadingPreview) && (
                                      <>
                                          <div className="w-20 h-20 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center mb-6">
                                              <ICONS.Grid className="w-10 h-10" />
                                          </div>
                                          <h3 className="text-xl font-bold text-gray-800 mb-2">模版内容预览</h3>
                                          <p className="text-gray-500 max-w-md mb-10">
                                              这里将展示模版的详细表格结构、字段定义以及示例数据。您可以直观地了解模版的设计是否符合您的需求。
                                          </p>
                                      </>
                                  )}
                                  
                                  {/* Real Table Structure */}
                                  <div className="w-full max-w-5xl h-[600px] flex flex-col border border-gray-100 rounded-xl overflow-hidden shadow-sm text-left bg-white relative">
                                      {loadingPreview ? (
                                          <div className="flex justify-center items-center h-full text-gray-400 gap-2">
                                              <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-primary-600"></div>
                                              加载中...
                                          </div>
                                      ) : previewTableDetail ? (
                                          (() => {
                                              const activeView = previewTableDetail.views?.find(v => v.id === previewViewId);
                                              const visibleColumnIds = activeView?.config?.visibleColumns || (activeView?.config as any)?.columns?.filter((c: any) => c.visible !== false).map((c: any) => c.id);
                                              const columnsToShow = visibleColumnIds 
                                                  ? previewTableDetail.columns?.filter(col => visibleColumnIds.includes(col.id))
                                                  : previewTableDetail.columns;
                                              
                                              if (!activeView) return <div className="flex justify-center items-center h-full text-gray-400 text-sm">无法加载视图</div>;

                                              const commonProps = {
                                                  tableId: previewTableDetail.id,
                                                  columns: columnsToShow || [],
                                                  allColumns: previewTableDetail.columns || [],
                                                  rows: previewRows,
                                                  onCellChange: () => {},
                                                  onAddRow: () => {},
                                                  onInsertRow: () => {},
                                                  onDuplicateRow: () => {},
                                                  onDeleteRow: () => {},
                                                  onDeleteRows: () => {},
                                                  onOpenComment: () => {},
                                                  onOpenDetail: () => {},
                                                  commentCounts: {},
                                              };

                                              switch (activeView.type) {
                                                  case ViewType.GRID:
                                                      return (
                                                          <GridView 
                                                              {...commonProps}
                                                              allTables={[previewTableDetail]}
                                                              rowHeight={activeView.config?.rowHeight}
                                                              rowHeights={activeView.config?.rowHeights}
                                                              colorRules={activeView.config?.colorRules}
                                                              onAddColumn={() => {}}
                                                              onEditColumn={() => {}}
                                                              onAddSubRow={() => {}}
                                                              onColumnResize={() => {}}
                                                              onRowHeightChange={() => {}}
                                                              onColumnUpdate={() => {}}
                                                              onOptionChange={() => {}}
                                                              onRefresh={() => {}}
                                                              hasMore={false}
                                                              isLoadingMore={false}
                                                              onLoadMore={() => {}}
                                                              onSort={() => {}}
                                                          />
                                                      );
                                                  case ViewType.KANBAN:
                                                      return (
                                                          <KanbanView 
                                                              {...commonProps}
                                                              groupByFieldId={activeView.config?.groups?.[0]?.column_id || activeView.config?.groupBy || columnsToShow?.[1]?.id || columnsToShow?.[0]?.id || ''}
                                                              onAddGroup={() => {}}
                                                              onOptionChange={() => {}}
                                                          />
                                                      );
                                                  case ViewType.CALENDAR:
                                                      return (
                                                          <CalendarView 
                                                              {...commonProps}
                                                              dateFieldId={activeView.config?.dateField}
                                                              endDateFieldId={activeView.config?.endDateField}
                                                              titleFieldId={activeView.config?.titleField}
                                                              colorFieldId={activeView.config?.colorFieldId}
                                                              customColor={activeView.config?.customColor}
                                                          />
                                                      );
                                                  case ViewType.GALLERY:
                                                      return (
                                                          <GalleryView 
                                                              {...commonProps}
                                                              coverFieldId={activeView.config?.coverFieldId}
                                                              displayMode={activeView.config?.galleryStyle}
                                                              showFieldNames={activeView.config?.showFieldNames}
                                                          />
                                                      );
                                                  case ViewType.GANTT:
                                                      return (
                                                          <GanttView 
                                                              {...commonProps}
                                                              dateFieldId={activeView.config?.dateField}
                                                              endDateFieldId={activeView.config?.endDateField}
                                                              titleFieldId={activeView.config?.titleField}
                                                              colorFieldId={activeView.config?.colorFieldId}
                                                              customColor={activeView.config?.customColor}
                                                              isWorkdayOnly={activeView.config?.isWorkdayOnly}
                                                              viewMode={activeView.config?.ganttViewMode || 'month'}
                                                              onViewModeChange={() => {}}
                                                              onColumnResize={() => {}}
                                                              onColumnUpdate={() => {}}
                                                          />
                                                      );
                                                  case ViewType.DASHBOARD:
                                                      return (
                                                          <DashboardView 
                                                              columns={previewTableDetail.columns || []}
                                                              rows={previewRows}
                                                          />
                                                      );
                                                  default:
                                                      return <div className="flex justify-center items-center h-full text-gray-400 text-sm">暂不支持该视图类型的预览</div>;
                                              }
                                          })()
                                      ) : (
                                          <div className="flex justify-center items-center h-full text-gray-400 text-sm">
                                              无法加载模版详情
                                          </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* Share Dialog */}
          {shareDialog && (
              <div className="fixed inset-0 bg-black/50 z-[250] flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
                      <div className="p-6 border-b border-gray-100 shrink-0">
                          <div className="flex items-center justify-between mb-4">
                              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                  <ICONS.Send className="w-5 h-5 text-primary-600" />
                                  分享模版
                              </h3>
                              <button onClick={() => setShareDialog(null)} className="text-gray-400 hover:text-gray-600">
                                  <ICONS.Close className="w-5 h-5" />
                              </button>
                          </div>
                          
                          <div className="space-y-4">
                              <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1.5">模版名称</label>
                                  <div className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-sm text-gray-600">
                                      {shareDialog.templateName}
                                  </div>
                              </div>
                              <div className="flex items-center justify-between">
                                  <div className="relative flex-1">
                                      <ICONS.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                      <input 
                                          type="text"
                                          value={memberSearchTerm}
                                          onChange={(e) => setMemberSearchTerm(e.target.value)}
                                          placeholder="搜索成员名称或邮箱..."
                                          className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary-500 focus:bg-white transition-all"
                                      />
                                  </div>
                                  <button 
                                      onClick={handleToggleSelectAll}
                                      disabled={!canSelectAny}
                                      className={`ml-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                                          canSelectAny 
                                              ? 'text-primary-600 hover:bg-primary-50' 
                                              : 'text-gray-300 cursor-not-allowed'
                                      }`}
                                  >
                                      {isAllSelected ? '取消全选' : '全选'}
                                  </button>
                              </div>
                          </div>
                      </div>

                      <div className="flex-1 overflow-auto p-2">
                          {loadingMembers ? (
                              <div className="py-12 text-center text-gray-400 text-sm">加载成员中...</div>
                          ) : filteredMembers.length === 0 ? (
                              <div className="py-12 text-center text-gray-400 text-sm">未找到相关成员</div>
                          ) : (
                              <div className="grid gap-1">
                                  {filteredMembers.map(member => {
                                      const memberId = member.account_id || member.id || member.uid;
                                      const isSelected = selectedMemberIds.includes(memberId);
                                      const isAlreadyShared = sharedAccountIds.includes(memberId);
                                      
                                      return (
                                          <div 
                                              key={memberId}
                                              onClick={() => {
                                                  if (isAlreadyShared) return;
                                                  setSelectedMemberIds(prev => 
                                                      isSelected 
                                                          ? prev.filter(id => id !== memberId)
                                                          : [...prev, memberId]
                                                  );
                                              }}
                                              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                                                  isAlreadyShared
                                                      ? 'bg-gray-50 opacity-60 cursor-not-allowed'
                                                      : isSelected 
                                                          ? 'bg-primary-50 border-primary-100 cursor-pointer' 
                                                          : 'hover:bg-gray-50 border-transparent cursor-pointer'
                                              } border`}
                                          >
                                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                                                  isAlreadyShared
                                                      ? 'bg-gray-200 text-gray-400'
                                                      : isSelected
                                                          ? 'bg-primary-600 text-white'
                                                          : 'bg-gray-100 text-gray-500'
                                              }`}>
                                                  {(member.real_name || member.name)?.[0]?.toUpperCase() || '?'}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                  <div className="text-sm font-bold text-gray-800 truncate">
                                                      {member.real_name ? `${member.real_name} (${member.name})` : member.name}
                                                      {isAlreadyShared && <span className="ml-2 text-[10px] font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">已分享</span>}
                                                  </div>
                                                  <div className="text-xs text-gray-400 truncate">{member.email}</div>
                                              </div>
                                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                                  isAlreadyShared
                                                      ? 'bg-gray-100 border-gray-200'
                                                      : isSelected
                                                          ? 'bg-primary-600 border-primary-600'
                                                          : 'border-gray-200'
                                              }`}>
                                                  {isSelected && !isAlreadyShared && (
                                                      <ICONS.Check className="w-3 h-3 text-white" />
                                                  )}
                                                  {isAlreadyShared && (
                                                      <ICONS.Check className="w-3 h-3 text-gray-300" />
                                                  )}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          )}
                      </div>

                      <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
                          <div className="text-xs text-gray-500">
                              已选择 <span className="font-bold text-primary-600">{selectedMemberIds.length}</span> 位成员
                          </div>
                          <div className="flex gap-3">
                              <button 
                                  onClick={() => setShareDialog(null)}
                                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                              >
                                  取消
                              </button>
                              <button 
                                  onClick={async () => {
                                      if (selectedMemberIds.length === 0) {
                                          toast.error('请选择要分享的成员');
                                          return;
                                      }
                                      try {
                                          const res = await api.shareTemplate(shareDialog.templateId, selectedMemberIds);
                                          toast.success(res.data?.message || res.message || '分享成功');
                                          setShareDialog(null);
                                      } catch (e: any) {
                                          toast.error(e.message || '分享失败');
                                      }
                                  }}
                                  className="px-6 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-all shadow-md shadow-primary-100 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                  disabled={selectedMemberIds.length === 0}
                              >
                                  确认分享
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default TemplateDialog;
