import React, { useState, useEffect } from 'react';
import { Column, Table, FieldType, CollectionFormConfig, FieldMapping } from '../types';
import { ICONS, FIELD_TYPE_ICONS } from '../constants';
import { api } from '../services/api';
import { UserSelector } from './UserSelector';
import { ClickOutsideWrapper } from './ClickOutsideWrapper';
import { Dropdown } from './Dropdown';
import { toast } from 'sonner';
import { CollectionFormStats } from './CollectionFormStats';

interface FormViewBuilderProps {
  table: Table;
  viewConfig: any;
  onUpdateConfig: (newConfig: any) => void;
  onBack: () => void;
}

const FormViewBuilder: React.FC<FormViewBuilderProps> = ({
  table,
  viewConfig,
  onUpdateConfig,
  onBack,
}) => {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'stats'>('edit');
  const [sidebarTab, setSidebarTab] = useState<'add' | 'outline'>('add');
  const [previewMode, setPreviewMode] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [publishedTab, setPublishedTab] = useState<'fill' | 'stats'>('fill');
  const [formTitle, setFormTitle] = useState('请输入表单标题');
  const [formDescription, setFormDescription] = useState('添加描述：文字、图片或链接');
  const [formFields, setFormFields] = useState<Column[]>([]);
  const [requiredFields, setRequiredFields] = useState<Record<string, boolean>>({});
  const [activeSelectorId, setActiveSelectorId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [dragOverFieldIndex, setDragOverFieldIndex] = useState<number | null>(null);
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);

  const [shareCode, setShareCode] = useState<string>('');
  const [submitMessage, setSubmitMessage] = useState<string>('提交成功');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);

  const [hasLoadedConfig, setHasLoadedConfig] = useState(false);

  useEffect(() => {
    const handleAuthError = (err: any) => {
      if (err.message === 'Unauthorized' || err.status === 401 || err.message?.includes('401') || err.message?.includes('Unauthorized')) {
        toast.error("接口调用失败（401 未授权），请配置您的 console_token。");
      }
    };

    const initializeFormView = async () => {
      setLoading(true);
      try {
        // Step 1: GET Columns
        let fetchedCols: Column[] = [];
        try {
          const columnsRes = await api.getColumns(table.id);
          const excludeTypes = [FieldType.FORMULA, FieldType.LINK, FieldType.LOOKUP, FieldType.SEARCH_REFERENCE];
          if (columnsRes?.data && Array.isArray(columnsRes.data)) {
            fetchedCols = columnsRes.data.filter(c => !excludeTypes.includes(c.type));
          } else {
            fetchedCols = (table.columns || []).filter(c => !excludeTypes.includes(c.type));
          }
        } catch (colErr: any) {
          console.error('Failed to fetch columns', colErr);
          handleAuthError(colErr);
          const excludeTypes = [FieldType.FORMULA, FieldType.LINK, FieldType.LOOKUP, FieldType.SEARCH_REFERENCE];
          fetchedCols = (table.columns || []).filter(c => !excludeTypes.includes(c.type));
        }
        
        setColumns(fetchedCols);

        // Step 2: GET Collection Form Config
        try {
          const configRes = await api.getCollectionForm(table.id);
          if (configRes && configRes.data) {
            const config = configRes.data;
            setFormTitle(config.title || '请输入表单标题');
            setFormDescription(config.description || '添加描述：文字、图片 or 链接');
            if (config.share_code) {
              setShareCode(config.share_code);
            }

            let parsedFormConfig: any = {};
            if (config.form_config) {
              if (typeof config.form_config === 'string') {
                try {
                  parsedFormConfig = JSON.parse(config.form_config);
                } catch (e) {}
              } else if (typeof config.form_config === 'object') {
                parsedFormConfig = config.form_config;
              }
            }

            if (parsedFormConfig?.submit_message) {
              setSubmitMessage(parsedFormConfig.submit_message);
            }
            
            // Map field_mappings to Column objects
            const mappings = config.field_mappings || [];
            const sortedMappings = [...mappings].sort((a, b) => (a.order || 0) - (b.order || 0));
            
            const loadedFields: Column[] = [];
            const loadedReqs: Record<string, boolean> = {};
            
            sortedMappings.forEach(mapping => {
              const matchedCol = fetchedCols.find(c => c.id === mapping.column_id);
              if (matchedCol) {
                let formConfig = {};
                try {
                  const rawFormConfig = mapping.form_field_config || mapping.column_config;
                  if (rawFormConfig) {
                    if (typeof rawFormConfig === 'string') {
                      formConfig = JSON.parse(rawFormConfig);
                    } else if (typeof rawFormConfig === 'object') {
                      formConfig = rawFormConfig;
                    }
                  }
                } catch (e) {}

                const mappedConfig = { ...matchedCol.config, ...formConfig };
                let displayStyle = 'chips';
                if (mappedConfig.form_display_style) {
                  displayStyle = mappedConfig.form_display_style;
                } else if ((formConfig as any)?.form_display_style) {
                  displayStyle = (formConfig as any).form_display_style;
                } else if (parsedFormConfig?.field_display_styles) {
                  const styles = parsedFormConfig.field_display_styles;
                  const styleVal = styles[matchedCol.id] || styles[mapping.column_id] || styles[mapping.form_field_id];
                  if (styleVal) {
                    displayStyle = styleVal;
                  }
                }
                mappedConfig.form_display_style = displayStyle;

                loadedFields.push({
                  ...matchedCol,
                  name: mapping.form_field_name || matchedCol.name,
                  config: mappedConfig
                });
                loadedReqs[matchedCol.id] = !!mapping.is_required;
              }
            });
            
            setFormFields(loadedFields);
            setRequiredFields(loadedReqs);
          } else {
            // No config exists: Trigger POST initial config
            await createInitialConfig(fetchedCols);
          }
        } catch (configErr: any) {
          console.log("No existing collection form configuration, creating initial setup.", configErr);
          handleAuthError(configErr);
          await createInitialConfig(fetchedCols);
        }
      } catch (err) {
        console.error('Failed to initialize form view configuration', err);
        const excludeTypes = [FieldType.FORMULA, FieldType.LINK, FieldType.LOOKUP, FieldType.SEARCH_REFERENCE];
        const filteredCols = (table.columns || []).filter(c => !excludeTypes.includes(c.type));
        setColumns(filteredCols);
        setFormFields(filteredCols);
      } finally {
        setLoading(false);
        setHasLoadedConfig(true); // Enable auto PUT sync afterwards
      }
    };

    const createInitialConfig = async (availableCols: Column[]) => {
      try {
        const defaultTitle = '请输入表单标题';
        const defaultDesc = '添加描述：文字、图片或链接';
        
        const payload = {
          title: defaultTitle,
          description: defaultDesc,
          field_mappings: availableCols.map((col, index) => ({
            form_field_id: col.id,
            form_field_name: col.name,
            column_id: col.id,
            is_required: false,
            order: index,
            column_type: col.type,
            form_field_config: col.config ? JSON.stringify(col.config) : '{}',
            column_config: col.config ? JSON.stringify(col.config) : '{}',
          })),
          form_config: {
            theme_color: "#1890ff",
            background_image: null,
            submit_message: submitMessage,
            field_display_styles: availableCols.reduce((acc, col) => {
              if (col.config?.form_display_style) {
                acc[col.id] = col.config.form_display_style;
              }
              return acc;
            }, {} as Record<string, string>)
          },
          is_enabled: true
        };
        
        const postRes = await api.createCollectionForm(table.id, payload);
        if (postRes && postRes.data) {
          setFormTitle(postRes.data.title || defaultTitle);
          setFormDescription(postRes.data.description || defaultDesc);
          if (postRes.data.share_code) {
            setShareCode(postRes.data.share_code);
          }
          
          let parsedPostFormConfig: any = {};
          if (postRes.data.form_config) {
            if (typeof postRes.data.form_config === 'string') {
              try {
                parsedPostFormConfig = JSON.parse(postRes.data.form_config);
              } catch (e) {}
            } else if (typeof postRes.data.form_config === 'object') {
              parsedPostFormConfig = postRes.data.form_config;
            }
          }

          if (parsedPostFormConfig?.submit_message) {
            setSubmitMessage(parsedPostFormConfig.submit_message);
          }
          
          const mappings = postRes.data.field_mappings || [];
          const sortedMappings = [...mappings].sort((a, b) => (a.order || 0) - (b.order || 0));
          const loadedFields: Column[] = [];
          const loadedReqs: Record<string, boolean> = {};
          
          sortedMappings.forEach(mapping => {
            const matchedCol = availableCols.find(c => c.id === mapping.column_id);
            if (matchedCol) {
              let formConfig = {};
              try {
                const rawFormConfig = mapping.form_field_config || mapping.column_config;
                if (rawFormConfig) {
                  if (typeof rawFormConfig === 'string') {
                    formConfig = JSON.parse(rawFormConfig);
                  } else if (typeof rawFormConfig === 'object') {
                    formConfig = rawFormConfig;
                  }
                }
              } catch (e) {}

              const mappedConfig = { ...matchedCol.config, ...formConfig };
              let displayStyle = 'chips';
              if (mappedConfig.form_display_style) {
                displayStyle = mappedConfig.form_display_style;
              } else if ((formConfig as any)?.form_display_style) {
                displayStyle = (formConfig as any).form_display_style;
              } else if (parsedPostFormConfig?.field_display_styles) {
                const styles = parsedPostFormConfig.field_display_styles;
                const styleVal = styles[matchedCol.id] || styles[mapping.column_id] || styles[mapping.form_field_id];
                if (styleVal) {
                  displayStyle = styleVal;
                }
              }
              mappedConfig.form_display_style = displayStyle;

              loadedFields.push({
                ...matchedCol,
                name: mapping.form_field_name || matchedCol.name,
                config: mappedConfig
              });
              loadedReqs[matchedCol.id] = !!mapping.is_required;
            }
          });
          
          setFormFields(loadedFields);
          setRequiredFields(loadedReqs);
        } else {
          setFormFields(availableCols);
        }
      } catch (createErr: any) {
        console.error("Failed to create initial collection form config", createErr);
        handleAuthError(createErr);
        setFormFields(availableCols);
      }
    };

    initializeFormView();
  }, [table.id, table.columns]);

  // Synchronize subsequent changes back to backend via PUT
  useEffect(() => {
    if (!hasLoadedConfig) return;

    const saveConfig = async () => {
      if (formFields.length === 0) {
        // Backend key field_mappings must not be empty. Bypassing empty mappings sync to prevent validation errors.
        return;
      }
      try {
        const payload = {
          title: formTitle,
          description: formDescription,
          field_mappings: formFields.map((field, index) => ({
            form_field_id: field.id,
            form_field_name: field.name,
            column_id: field.id,
            is_required: !!requiredFields[field.id],
            order: index,
            column_type: field.type,
            form_field_config: field.config ? JSON.stringify(field.config) : '{}',
            column_config: field.config ? JSON.stringify(field.config) : '{}',
          })),
          form_config: {
            theme_color: "#1890ff",
            background_image: null,
            submit_message: submitMessage,
            field_display_styles: formFields.reduce((acc, field) => {
              if (field.config?.form_display_style) {
                acc[field.id] = field.config.form_display_style;
              }
              return acc;
            }, {} as Record<string, string>)
          },
          is_enabled: true
        };
        await api.updateCollectionForm(table.id, payload);
      } catch (err: any) {
        console.error("Failed to update collection form configuration via PUT", err);
        if (err.message === 'Unauthorized' || err.status === 401 || err.message?.includes('401') || err.message?.includes('Unauthorized')) {
          toast.error("保存配置失败：401 未授权，请检查您的 console_token。");
        }
      }
    };

    const timer = setTimeout(() => {
      saveConfig();
    }, 500);

    return () => clearTimeout(timer);
  }, [formFields, requiredFields, formTitle, formDescription, hasLoadedConfig, table.id]);

  const handleShare = () => {
    if (!shareCode) {
      toast.warning("分享码尚未生成，请稍后。");
      return;
    }
    setIsShareModalOpen(true);
  };

  const handleSubmitForm = async () => {
    // Validate required fields
    for (const field of formFields) {
      if (requiredFields[field.id]) {
        const val = formData[field.id];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          toast.warning(`请填写/选择：${field.name}`);
          return;
        }
      }
    }

    if (!shareCode) {
      toast.error("表单尚未拥有合法的分享码，无法提交。");
      return;
    }

    setIsConfirmModalOpen(true);
  };

  const executeSubmit = async () => {
    try {
      setLoading(true);
      // Format payload keys and handle submissions
      const payload: Record<string, any> = {};
      formFields.forEach(field => {
        const val = formData[field.id];
        if (val !== undefined && val !== null && val !== '') {
          if (field.type === FieldType.USER || field.type === FieldType.DEPARTMENT || field.type === FieldType.GROUP) {
            if (Array.isArray(val)) {
              payload[field.id] = val.map((item: any) => {
                if (typeof item === 'object' && item !== null) {
                  return item.id;
                }
                return item;
              });
            } else if (typeof val === 'object' && val !== null) {
              payload[field.id] = [val.id];
            } else {
              payload[field.id] = [val];
            }
          } else {
            payload[field.id] = val;
          }
        }
      });

      await api.submitCollectionForm(shareCode, payload);
      toast.success(submitMessage || "提交成功！");
      setFormData({}); // Reset fields on success
    } catch (err: any) {
      console.error(err);
      toast.error(`提交失败: ${err.message || "未知错误"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportAll = () => {
    setFormFields([...columns]);
  };

  const handleClearAll = () => {
    if (formFields.length === 0) {
      toast.info("表单中没有字段可以清空");
      return;
    }
    setIsClearAllConfirmOpen(true);
  };

  const executeClearAll = () => {
    if (columns.length > 0) {
      setFormFields([columns[0]]);
      toast.success("根据系统限制，收集表必须保留至少一个字段，已自动为您保留首列作为表单项并完成同步");
    } else {
      setFormFields([]);
      toast.success("已清空全部字段");
    }
  };

  const handleAddField = (col: Column) => {
    if (!formFields.find((f) => f.id === col.id)) {
      setFormFields([...formFields, col]);
    }
  };

  const FIELD_TYPE_LABELS: Record<string, string> = {
    [FieldType.TEXT]: '文本',
    [FieldType.NUMBER]: '数字',
    [FieldType.SELECT]: '单选',
    [FieldType.MULTI_SELECT]: '多选',
    [FieldType.DATE]: '日期',
    [FieldType.TIME]: '时间',
    [FieldType.CHECKBOX]: '复选框',
    [FieldType.FORMULA]: '公式',
    [FieldType.ATTACHMENT]: '附件',
    [FieldType.USER]: '人员',
    [FieldType.DEPARTMENT]: '部门',
    [FieldType.GROUP]: '群组',
    [FieldType.LINK]: '关联引用',
    [FieldType.HYPERLINK]: '超链接',
    [FieldType.LOOKUP]: '引用 (Lookup)',
    [FieldType.SEARCH_REFERENCE]: '查找引用',
  };

  const groupedColumns = columns.reduce((acc, col) => {
    if (!acc[col.type]) acc[col.type] = [];
    acc[col.type].push(col);
    return acc;
  }, {} as Record<string, Column[]>);

  if (isPublished) {
    return (
      <div className="flex flex-col h-full w-full bg-[#f3f5f7] absolute inset-0 z-[100]">
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">确认提交吗？</h3>
              </div>
              <p className="text-gray-500 text-[14px] leading-relaxed mb-6">
                请确认您填写的信息无误，点击确定后您的数据将提交并保存至多维表格中。
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors cursor-pointer select-none"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmModalOpen(false);
                    executeSubmit();
                  }}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm cursor-pointer select-none"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-center h-[56px] bg-white text-gray-500 border-b px-4 shrink-0 relative w-full shadow-sm z-10">
          <div className="flex items-center gap-8 h-full">
            <button 
              onClick={() => setPublishedTab('fill')} 
              className={`h-full border-b-2 px-2 text-sm font-medium transition-colors ${publishedTab === 'fill' ? 'border-gray-900 text-gray-900' : 'border-transparent hover:text-gray-900'}`}
            >
              填写
            </button>
            <button 
              onClick={() => setPublishedTab('stats')}
               className={`h-full border-b-2 px-2 text-sm font-medium transition-colors ${publishedTab === 'stats' ? 'border-gray-900 text-gray-900' : 'border-transparent hover:text-gray-900'}`}
            >
              统计
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto relative pb-32">
          {publishedTab === 'fill' && (
            <div className="max-w-4xl mx-auto py-8 sm:px-8">
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 overflow-hidden mb-6">
                  <h1 className="text-[28px] font-bold text-gray-900 mb-3">{formTitle}</h1>
                  <p className="text-gray-500 text-[14px]">{formDescription}</p>
                </div>
                
                {formFields.map((field, index) => (
                  <div key={field.id} className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col relative w-full">
                    <div className="p-6">
                      <div className="font-bold text-gray-900 mb-4 text-[13px] flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span>
                            {requiredFields[field.id] && <span className="text-red-500 mr-1">*</span>}
                            {String(index + 1).padStart(2, '0')} {field.name}
                          </span>
                        </div>
                      </div>
                      
                      {field.type === FieldType.TEXT && (
                      <textarea 
                        rows={1}
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 min-h-[40px] resize-none" 
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = target.scrollHeight + 'px';
                        }}
                      />
                    )}
                    
                    {field.type === FieldType.NUMBER && (
                      <input 
                        type="number"
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500" 
                      />
                    )}
                    
                    {(field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT) && (
                      <div className="w-full">
                        <Dropdown
                          options={field.config?.options || []}
                          value={formData[field.id] || (field.type === FieldType.MULTI_SELECT ? [] : '')}
                          onChange={(val) => setFormData(prev => ({ ...prev, [field.id]: val }))}
                          multiple={field.type === FieldType.MULTI_SELECT}
                          placeholder={`请选择${field.name}`}
                          colorMap={field.config?.optionColors || field.config?.option_colors}
                        />
                      </div>
                    )}
                    
                    {field.type === FieldType.DATE && (
                      <input 
                        type="date"
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 max-w-[200px]" 
                      />
                    )}
                    
                    {field.type === FieldType.TIME && (
                      <input 
                        type="time"
                        step={field.config?.format?.includes('ss') ? "1" : undefined}
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 max-w-[200px]" 
                      />
                    )}
                    
                    {field.type === FieldType.CHECKBOX && (
                      <div className="flex items-center">
                        <input 
                          type="checkbox" 
                          checked={!!formData[field.id]}
                          onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.checked }))}
                          className="w-4 h-4 mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer bg-white" 
                        />
                        <span className="text-[14px] text-gray-700">选项</span>
                      </div>
                    )}
                    
                    {field.type === FieldType.ATTACHMENT && (
                      <div className="w-full">
                        <label className="w-full border border-dashed border-gray-200 rounded py-6 flex flex-col items-center justify-center bg-gray-50 text-gray-500 cursor-pointer hover:bg-gray-100 transition-colors mb-4">
                          <input 
                            type="file" 
                            className="hidden" 
                            multiple
                            onChange={async (e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                const filesArray = Array.from(e.target.files) as File[];
                                const uploadPromises = filesArray.map((file: File) => api.uploadFile(file));
                                try {
                                  const results = await Promise.all(uploadPromises);
                                  const uploadedFiles = results.map((res: any, idx: number) => res.data || { name: filesArray[idx].name, filename: filesArray[idx].name, url: URL.createObjectURL(filesArray[idx]) });
                                  setFormData(prev => ({ ...prev, [field.id]: [...(prev[field.id] || []), ...uploadedFiles] }));
                                } catch (error) {
                                  console.error("Upload failed", error);
                                  const fallbackFiles = filesArray.map((f: File) => ({ name: f.name, filename: f.name, url: URL.createObjectURL(f) }));
                                  setFormData(prev => ({ ...prev, [field.id]: [...(prev[field.id] || []), ...fallbackFiles] }));
                                }
                              }
                            }}
                          />
                          <svg className="w-5 h-5 mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                          <span className="text-[13px] font-medium">点击或拖拽文件到这里</span>
                        </label>
                        
                        {(formData[field.id] || []).length > 0 && (
                          <div className="space-y-2 mt-4">
                            {(formData[field.id] || []).map((file: any, i: number) => (
                              <div key={i} className="flex items-center justify-between p-2.5 border border-gray-100 rounded bg-white">
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <ICONS.Link className="w-4 h-4 text-gray-400 shrink-0" />
                                  <span className="text-[13px] text-gray-700 truncate">{file.name || file.filename || '未知文件'}</span>
                                </div>
                                <button 
                                  onClick={() => {
                                    setFormData(prev => ({
                                      ...prev,
                                      [field.id]: prev[field.id].filter((_: any, idx: number) => idx !== i)
                                    }));
                                  }}
                                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                >
                                  <ICONS.Close className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {(field.type === FieldType.USER || field.type === FieldType.DEPARTMENT || field.type === FieldType.GROUP) && (
                      <div className="relative">
                        <div 
                          className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-700 bg-white flex justify-between items-center cursor-pointer hover:border-primary-500 transition-colors"
                          onClick={() => setActiveSelectorId(activeSelectorId === field.id ? null : field.id)}
                        >
                          <div className="flex gap-2 flex-wrap min-h-[20px]">
                            {formData[field.id] && formData[field.id].length > 0 ? (
                              formData[field.id].map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-[13px] text-gray-700">
                                  {field.type === FieldType.USER ? <ICONS.User className="w-3 h-3" /> : <ICONS.Building className="w-3 h-3" />}
                                  {field.type === FieldType.USER ? (item.real_name || item.name || item) : (item.name || item)}
                                </div>
                              ))
                            ) : (
                              <span className="text-gray-400">请选择人员/部门...</span>
                            )}
                          </div>
                          <ICONS.ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                        </div>
                        {activeSelectorId === field.id && field.type === FieldType.USER && (
                          <div className="absolute top-full left-0 z-50 mt-1">
                            <ClickOutsideWrapper onClickOutside={() => setActiveSelectorId(null)}>
                              <UserSelector
                                value={formData[field.id] || []}
                                onChange={(val) => setFormData(prev => ({ ...prev, [field.id]: val }))}
                                onClose={() => setActiveSelectorId(null)}
                                multi={true}
                              />
                            </ClickOutsideWrapper>
                          </div>
                        )}
                      </div>
                    )}

                    {field.type === FieldType.HYPERLINK && (
                      <input 
                        type="url"
                        placeholder="请输入链接（例如 https://...）" 
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500" 
                      />
                    )}
                    </div>
                  </div>
                ))}

                <div className="flex justify-center mt-8 pt-4">
                  <button onClick={handleSubmitForm} className="w-64 py-2.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-600 transition-all focus:ring-4 focus:ring-primary-500/20 text-[15px]">提交</button>
                </div>
              </div>
            </div>
          )}
          
          {publishedTab === 'stats' && (
             <CollectionFormStats table={table} formFields={formFields} />
          )}
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#f6f7f9] backdrop-blur-md rounded-lg shadow border border-gray-200 flex items-center h-12 px-1 z-20 overflow-hidden w-[600px] justify-between">
          <button onClick={() => setIsPublished(false)} className="flex items-center justify-center flex-1 gap-2 h-full text-[13px] text-gray-600 hover:text-gray-900 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
             编辑
          </button>
          <div className="w-px h-6 bg-gray-300"></div>
          <button onClick={handleShare} className="flex items-center justify-center flex-1 gap-2 h-full text-[13px] text-gray-600 hover:text-gray-900 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
             分享
          </button>
        </div>

        {isShareModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-[420px] p-8 flex flex-col items-center relative shadow-2xl text-center">
              <div className="bg-[#eefcf7] w-16 h-16 rounded-full flex items-center justify-center mb-5 animate-bounce">
                <svg className="w-8 h-8 text-[#10b981]" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-gray-900 font-bold text-xl mb-1.5">分享码已生成</h2>
              <p className="text-gray-500 font-medium text-[13px] mb-6">您可以将此分享码发送给您的协作者</p>
              
              <div className="bg-[#f5f8ff] rounded-2xl w-full p-6 flex flex-col gap-4 mb-6 border border-[#e6efff]">
                <div className="text-[#2b68ff] font-bold text-[14px] leading-relaxed break-all select-all">
                  {`${window.location.origin}/collectionform?share_code=${shareCode}`}
                </div>
                <button 
                  onClick={() => {
                    const shareLink = `${window.location.origin}/collectionform?share_code=${shareCode}`;
                    navigator.clipboard.writeText(shareLink).then(() => {
                      toast.success("链接已成功复制到剪贴板！");
                    }).catch(() => {
                      toast.info(`链接已生成，请手动复制：\n${shareLink}`);
                    });
                  }}
                  className="w-full border border-gray-200 bg-white hover:bg-gray-50 rounded-xl py-2.5 flex items-center justify-center gap-2 text-gray-700 hover:text-gray-900 transition-colors font-medium text-[13px] shadow-sm select-none"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                  </svg>
                  复制分享码
                </button>
              </div>

              <button 
                onClick={() => setIsShareModalOpen(false)}
                className="w-full bg-[#f4f6fa] hover:bg-gray-200 text-gray-700 font-semibold py-3.5 rounded-2xl text-[14px] transition-colors shadow-sm"
              >
                完成
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-gray-100 absolute inset-0 z-[100]">
      {isClearAllConfirmOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">确认清空全部字段吗？</h3>
            </div>
            <p className="text-gray-500 text-[14px] leading-relaxed mb-6">
              请确认是否清空当前表单中的所有字段，清空后需要重新添加。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setIsClearAllConfirmOpen(false)}
                className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors cursor-pointer select-none"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsClearAllConfirmOpen(false);
                  executeClearAll();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm cursor-pointer select-none"
              >
                确定清空
              </button>
            </div>
          </div>
        </div>
      )}
      {deletingFieldId && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">确认删除该字段吗？</h3>
            </div>
            <p className="text-gray-500 text-[14px] leading-relaxed mb-6">
              请确认是否删除此字段
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeletingFieldId(null)}
                className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors cursor-pointer select-none"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormFields(formFields.filter(f => f.id !== deletingFieldId));
                  setDeletingFieldId(null);
                  toast.success("字段已成功删除");
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm cursor-pointer select-none"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
      {!previewMode && (
      <div className="flex items-center justify-between h-[56px] bg-white border-b px-4 shrink-0 shadow-sm relative z-10 w-full">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium hover:text-primary-600 transition-colors">
          <ICONS.ArrowLeft className="w-5 h-5" /> 返回
        </button>
        <div className="flex gap-6 h-full items-end">
          <button
            onClick={() => setActiveTab('edit')}
            className={`text-sm font-medium pb-4 border-b-2 transition-colors ${activeTab === 'edit' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
          >
            编辑
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`text-sm font-medium pb-4 border-b-2 transition-colors ${activeTab === 'stats' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
          >
            统计
          </button>
        </div>
        <div className="w-20"></div>
      </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {activeTab === 'edit' && (
          <>
            {!previewMode && (
              <div className="w-[300px] bg-white border-r flex flex-col shrink-0">
                <div className="m-4 p-1 bg-gray-100 rounded-lg flex text-sm">
                <button 
                  onClick={() => setSidebarTab('add')}
                  className={`flex-1 py-1.5 rounded-md transition-all font-medium ${sidebarTab === 'add' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  添加问题
                </button>
                <button 
                  onClick={() => setSidebarTab('outline')}
                  className={`flex-1 py-1.5 rounded-md transition-all font-medium ${sidebarTab === 'outline' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  大纲
                </button>
              </div>

              {sidebarTab === 'add' ? (
                <>
                  <div className="px-4 pb-4 border-b flex gap-2">
                    <button onClick={handleImportAll} className="flex-1 py-2 border rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">导入全部字段</button>
                    <button onClick={handleClearAll} className="flex-1 py-2 border rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">清空全部字段</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {Object.entries(groupedColumns).map(([type, cols]) => {
                      const typedCols = cols as Column[];
                      const isCollapsed = collapsedGroups[type];
                      return (
                      <div key={type}>
                        <div 
                          className="flex items-center text-xs text-gray-500 font-medium mb-3 cursor-pointer select-none"
                          onClick={() => setCollapsedGroups(prev => ({ ...prev, [type]: !prev[type] }))}
                        >
                          {isCollapsed ? (
                            <ICONS.ChevronRight className="w-3.5 h-3.5 mr-1" />
                          ) : (
                            <ICONS.ChevronDown className="w-3.5 h-3.5 mr-1" />
                          )}
                          {FIELD_TYPE_LABELS[type] || type} ({typedCols.length})
                        </div>
                        {!isCollapsed && (
                        <div className="grid grid-cols-3 gap-2 pb-2">
                          {typedCols.map((col) => {
                            const renderIcon = () => {
                              switch (col.type) {
                                case FieldType.TEXT: return <div className="text-orange-500"><span className="font-serif text-xl font-bold">T</span></div>;
                                case FieldType.NUMBER: return <div className="text-primary-500 font-mono text-xl font-bold">#</div>;
                                case FieldType.SELECT: return <div className="text-green-500"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth="1.5"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg></div>;
                                case FieldType.MULTI_SELECT: return <ICONS.List className="w-6 h-6 text-teal-500" />;
                                case FieldType.DATE: return <ICONS.Calendar className="w-6 h-6 text-purple-500" />;
                                case FieldType.CHECKBOX: return <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5"/><path d="M9 12l2 2 4-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
                                case FieldType.FORMULA: return <div className="text-pink-500 font-mono text-xl font-bold">ƒx</div>;
                                case FieldType.ATTACHMENT: return <ICONS.Link className="w-6 h-6 text-indigo-500" />;
                                case FieldType.USER: return <ICONS.User className="w-6 h-6 text-sky-500" />;
                                case FieldType.DEPARTMENT: return <ICONS.Building className="w-6 h-6 text-rose-500" />;
                                case FieldType.GROUP: return <ICONS.Users className="w-6 h-6 text-cyan-500" />;
                                case FieldType.LINK: return <ICONS.Link className="w-6 h-6 text-emerald-500" />;
                                case FieldType.HYPERLINK: return <ICONS.Link className="w-6 h-6 text-fuchsia-500" />;
                                case FieldType.LOOKUP: return <ICONS.Lookup className="w-6 h-6 text-amber-500" />;
                                case FieldType.SEARCH_REFERENCE: return <ICONS.SearchRef className="w-6 h-6 text-lime-500" />;
                                default: return <div className="text-gray-500"><span className="font-serif text-xl font-bold">{FIELD_TYPE_LABELS[col.type]?.[0] || 'T'}</span></div>;
                              }
                            };
                            
                            return (
                                <div
                                  key={col.id}
                                  onClick={() => handleAddField(col)}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'add', colId: col.id }));
                                    e.dataTransfer.effectAllowed = 'copy';
                                  }}
                                  className="flex flex-col items-center justify-center p-3 border border-gray-100 rounded-xl hover:border-primary-200 cursor-grab active:cursor-grabbing transition-all bg-white hover:shadow-sm"
                                >
                                <div className="mb-2 flex items-center justify-center h-8">
                                  {renderIcon()}
                                </div>
                                <div className="text-[10px] text-gray-600 truncate w-full text-center" title={col.name}>{col.name}</div>
                              </div>
                            );
                          })}
                        </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  <div className="text-sm font-bold text-gray-800 mb-4 px-2">{formTitle || '无标题'}</div>
                  {formFields.map((field, index) => (
                    <div 
                      key={field.id} 
                      className="flex flex-col cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors"
                      onClick={() => {
                        const el = document.getElementById(`form-field-${field.id}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                    >
                      <div className="flex items-center text-sm text-gray-600">
                        <span className="text-gray-400 mr-3 w-4 text-right shrink-0">{String(index + 1).padStart(2, '0')}</span>
                        <span className="truncate">{field.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            <div 
              className="flex-1 overflow-y-auto p-4 sm:p-8 relative bg-[#e9ebed] pb-24 h-full"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverFieldIndex(null);
                try {
                  const data = JSON.parse(e.dataTransfer.getData('application/json'));
                  if (data.type === 'add') {
                    const col = columns.find(c => c.id === data.colId);
                    if (col && !formFields.find(f => f.id === col.id)) {
                      setFormFields([...formFields, col]);
                    }
                  } else if (data.type === 'reorder' && data.index !== null) {
                    const newFields = [...formFields];
                    const [movedItems] = newFields.splice(data.index, 1);
                    newFields.push(movedItems);
                    setFormFields(newFields);
                  }
                } catch (err) {}
              }}
            >
              <div className="max-w-4xl mx-auto bg-[#f3f5f7] shadow-sm sm:rounded-2xl p-6 sm:p-12 min-h-full">
                <div className="max-w-3xl mx-auto space-y-6 pb-32">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-0 overflow-hidden">
                  <div className="p-8">
                    {previewMode ? (
                      <>
                        <h1 className="text-3xl font-bold text-gray-900 mb-3 outline-none">{formTitle}</h1>
                        <p className="text-gray-400 outline-none text-sm">{formDescription}</p>
                      </>
                    ) : (
                      <>
                        <h1 
                          className="text-3xl font-bold text-gray-900 mb-3 outline-none" 
                          contentEditable 
                          suppressContentEditableWarning
                          onBlur={(e) => setFormTitle(e.currentTarget.textContent || '')}
                        >
                          {formTitle}
                        </h1>
                        <p 
                          className="text-gray-400 outline-none text-sm" 
                          contentEditable 
                          suppressContentEditableWarning
                          onBlur={(e) => setFormDescription(e.currentTarget.textContent || '')}
                        >
                          {formDescription}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {formFields.map((field, index) => (
                  <div 
                    key={field.id} 
                    id={`form-field-${field.id}`}
                    className={`bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col transition-shadow relative group ${!previewMode ? 'hover:shadow-md' : ''} ${dragOverFieldIndex === index ? 'ring-2 ring-primary-500 ring-offset-2' : ''} ${draggedFieldIndex === index ? 'opacity-50' : ''}`}
                    draggable={!previewMode}
                    onDragStart={(e) => {
                      if (previewMode) return;
                      setDraggedFieldIndex(index);
                      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'reorder', index }));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => !previewMode && setDraggedFieldIndex(null)}
                    onDragOver={(e) => {
                      if (previewMode) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverFieldIndex(index);
                    }}
                    onDragLeave={() => !previewMode && setDragOverFieldIndex(null)}
                    onDrop={(e) => {
                      if (previewMode) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverFieldIndex(null);
                      try {
                        const data = JSON.parse(e.dataTransfer.getData('application/json'));
                        if (data.type === 'reorder' && data.index !== index && data.index !== null) {
                          const newFields = [...formFields];
                          const [movedItems] = newFields.splice(data.index, 1);
                          newFields.splice(index, 0, movedItems);
                          setFormFields(newFields);
                        } else if (data.type === 'add') {
                          const col = columns.find(c => c.id === data.colId);
                          if (col && !formFields.find(f => f.id === col.id)) {
                            const newFields = [...formFields];
                            newFields.splice(index, 0, col);
                            setFormFields(newFields);
                          }
                        }
                      } catch (err) {}
                    }}
                  >
                    <div className="p-6">
                      <div className={`font-bold text-gray-900 mb-4 text-[15px] flex items-center justify-between ${!previewMode ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                        <div className="flex items-center gap-2">
                          {!previewMode && <ICONS.GripVertical className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
                          <span>
                            {requiredFields[field.id] && <span className="text-red-500 mr-1">*</span>}
                            {String(index + 1).padStart(2, '0')} {field.name}
                          </span>
                        </div>
                      </div>
                      
                      {field.type === FieldType.TEXT && (
                      <textarea 
                        placeholder="请输入内容..." 
                        rows={1}
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none overflow-hidden" 
                      />
                    )}
                    
                    {field.type === FieldType.NUMBER && (
                      <input 
                        type="number"
                        placeholder="请输入数字..." 
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                      />
                    )}
                    
                    {(field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT) && (
                      <div className="w-full">
                        <Dropdown
                          options={field.config?.options || []}
                          value={formData[field.id] || (field.type === FieldType.MULTI_SELECT ? [] : '')}
                          onChange={(val) => setFormData(prev => ({ ...prev, [field.id]: val }))}
                          multiple={field.type === FieldType.MULTI_SELECT}
                          placeholder={`请选择${field.name}`}
                          colorMap={field.config?.optionColors || field.config?.option_colors}
                        />
                      </div>
                    )}
                    
                    {field.type === FieldType.DATE && (
                      <input 
                        type="date"
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent max-w-[200px]" 
                      />
                    )}
                    
                    {field.type === FieldType.TIME && (
                      <input 
                        type="time"
                        step={field.config?.format?.includes('ss') ? "1" : undefined}
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent max-w-[200px]" 
                      />
                    )}
                    
                    {field.type === FieldType.CHECKBOX && (
                      <div className="flex items-center">
                        <input 
                          type="checkbox" 
                          checked={!!formData[field.id]}
                          onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.checked }))}
                          className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" 
                        />
                        <span className="ml-2 text-sm text-gray-700">选项</span>
                      </div>
                    )}
                    
                    {field.type === FieldType.ATTACHMENT && (
                      <div className="w-full">
                        <label className="w-full border border-dashed border-gray-200 rounded-lg py-8 flex flex-col items-center justify-center bg-white text-gray-500 cursor-pointer hover:bg-gray-50 transition-colors mb-4">
                          <input 
                            type="file" 
                            className="hidden" 
                            multiple
                            onChange={async (e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                const filesArray = Array.from(e.target.files) as File[];
                                const uploadPromises = filesArray.map((file: File) => api.uploadFile(file));
                                try {
                                  const results = await Promise.all(uploadPromises);
                                  const uploadedFiles = results.map((res: any, idx: number) => res.data || { name: filesArray[idx].name, filename: filesArray[idx].name, url: URL.createObjectURL(filesArray[idx]) });
                                  setFormData(prev => ({ ...prev, [field.id]: [...(prev[field.id] || []), ...uploadedFiles] }));
                                } catch (error) {
                                  console.error("Upload failed", error);
                                  const fallbackFiles = filesArray.map((f: File) => ({ name: f.name, filename: f.name, url: URL.createObjectURL(f) }));
                                  setFormData(prev => ({ ...prev, [field.id]: [...(prev[field.id] || []), ...fallbackFiles] }));
                                }
                              }
                            }}
                          />
                          <div className="flex items-center justify-center gap-1 mb-1 text-gray-600">
                            <ICONS.Plus className="w-4 h-4" />
                            <span className="text-sm font-medium">点击或拖拽上传文件/图片</span>
                          </div>
                          <span className="text-xs text-gray-400 font-light">支持多选，大小不超过 10MB</span>
                        </label>
                        
                        {formData[field.id] && formData[field.id].length > 0 && (
                          <div className="flex flex-wrap gap-4 mt-2">
                            {formData[field.id].map((f: any, idx: number) => (
                              <div key={idx} className="w-[160px] h-[160px] border border-gray-200 bg-gray-50/30 rounded-2xl flex flex-col items-center justify-center p-4 relative group hover:shadow-md transition-all">
                                <ICONS.File className="w-10 h-10 text-primary-500 mb-4" />
                                <span className="text-sm text-gray-700 truncate w-full text-center font-medium px-2" title={f.name || f.filename}>{f.name || f.filename}</span>
                                <div 
                                  className="absolute top-3 right-3 bg-white shadow-sm border border-gray-100 rounded-full p-1.5 cursor-pointer hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all text-gray-500"
                                  onClick={() => setFormData(prev => ({
                                    ...prev,
                                    [field.id]: prev[field.id].filter((_: any, i: number) => i !== idx)
                                  }))}
                                >
                                  <ICONS.Trash className="w-4 h-4" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {(field.type === FieldType.USER || field.type === FieldType.DEPARTMENT || field.type === FieldType.GROUP) && (
                      <div className="relative">
                        <div 
                          className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 bg-white flex justify-between items-center cursor-pointer hover:border-gray-300"
                          onClick={() => setActiveSelectorId(activeSelectorId === field.id ? null : field.id)}
                        >
                          <div className="flex flex-wrap gap-1">
                            {formData[field.id] && Array.isArray(formData[field.id]) && formData[field.id].length > 0 ? (
                              formData[field.id].map((u: any) => (
                                <div key={u.id} className="bg-gray-100 rounded px-2 py-0.5 text-xs flex items-center gap-1">
                                  {u.real_name || u.name}
                                  <ICONS.Close 
                                    className="w-3 h-3 text-gray-400 hover:text-red-500 cursor-pointer ml-1" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFormData(prev => ({
                                        ...prev,
                                        [field.id]: prev[field.id].filter((x: any) => x.id !== u.id)
                                      }));
                                    }}
                                  />
                                </div>
                              ))
                            ) : (
                              <span className="text-gray-400">请选择人员/部门...</span>
                            )}
                          </div>
                          <ICONS.ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                        </div>
                        {activeSelectorId === field.id && field.type === FieldType.USER && (
                          <div className="absolute top-full left-0 z-50 mt-1">
                            <ClickOutsideWrapper onClickOutside={() => setActiveSelectorId(null)}>
                              <UserSelector
                                value={formData[field.id] || []}
                                onChange={(val) => setFormData(prev => ({ ...prev, [field.id]: val }))}
                                onClose={() => setActiveSelectorId(null)}
                                multi={true}
                              />
                            </ClickOutsideWrapper>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {(field.type === FieldType.LINK || field.type === FieldType.LOOKUP || field.type === FieldType.SEARCH_REFERENCE) && (
                      <div className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-400 bg-white flex justify-between items-center cursor-pointer bg-gray-50">
                        <span>{FIELD_TYPE_LABELS[field.type]} 字段不支持在此录入</span>
                      </div>
                    )}
                    
                    {field.type === FieldType.FORMULA && (
                      <div className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-400 bg-gray-50 flex items-center cursor-not-allowed">
                        <span className="font-mono font-bold text-gray-400 mr-2">ƒx</span>
                        <span>自动计算</span>
                      </div>
                    )}
                    
                    {field.type === FieldType.HYPERLINK && (
                      <input 
                        type="url"
                        placeholder="请输入链接（例如 https://...）" 
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                      />
                    )}
                    </div>
                    {!previewMode && (
                    <div className="px-6 py-3 border-t border-gray-100 flex justify-end items-center gap-4 bg-gray-50/50 rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity">

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={!!requiredFields[field.id]}
                          onChange={(e) => setRequiredFields(prev => ({ ...prev, [field.id]: e.target.checked }))}
                          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" 
                        />
                        <span className="text-sm text-gray-600 font-medium">必填</span>
                      </label>
                      <div className="w-px h-3 bg-gray-200"></div>
                      <button 
                        onClick={() => setDeletingFieldId(field.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="删除"
                      >
                        <ICONS.Trash className="w-4 h-4" />
                      </button>
                    </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            </div>
            
            <div className={`absolute ${previewMode ? 'bottom-12 left-0 bg-transparent border-transparent' : 'bottom-0 left-[300px] bg-white border-t border-gray-200 h-[80px]'} right-0 flex items-center justify-center gap-4 z-20`}>
               {previewMode ? (
                 <button onClick={() => setPreviewMode(false)} className="w-[300px] py-3 rounded-lg bg-gray-200 text-gray-700 font-medium hover:bg-gray-300 transition-colors shadow-sm">继续编辑</button>
               ) : (
                 <>
                   <button onClick={() => setPreviewMode(true)} className="w-[180px] py-2.5 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors">预览</button>
                   <button onClick={() => setIsPublished(true)} className="w-[180px] py-2.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 shadow-md shadow-primary-500/20 transition-all">发布</button>
                 </>
               )}
            </div>
          </>
        )}
        
        {activeTab === 'stats' && (
           <div className="flex-1 overflow-y-auto bg-gray-50/50 pb-24">
             <CollectionFormStats table={table} formFields={formFields} />
           </div>
        )}
        {isShareModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-[420px] p-8 flex flex-col items-center relative shadow-2xl text-center">
              <div className="bg-[#eefcf7] w-16 h-16 rounded-full flex items-center justify-center mb-5 animate-bounce">
                <svg className="w-8 h-8 text-[#10b981]" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-gray-900 font-bold text-xl mb-1.5">分享码已生成</h2>
              <p className="text-gray-500 font-medium text-[13px] mb-6">您可以将此分享码发送给您的协作者</p>
              
              <div className="bg-[#f5f8ff] rounded-2xl w-full p-6 flex flex-col gap-4 mb-6 border border-[#e6efff]">
                <div className="text-[#2b68ff] font-bold text-[14px] leading-relaxed break-all select-all">
                  {`${window.location.origin}/collectionform?share_code=${shareCode}`}
                </div>
                <button 
                  onClick={() => {
                    const shareLink = `${window.location.origin}/collectionform?share_code=${shareCode}`;
                    navigator.clipboard.writeText(shareLink).then(() => {
                      toast.success("链接已成功复制到剪贴板！");
                    }).catch(() => {
                      toast.info(`链接已生成，请手动复制：\n${shareLink}`);
                    });
                  }}
                  className="w-full border border-gray-200 bg-white hover:bg-gray-50 rounded-xl py-2.5 flex items-center justify-center gap-2 text-gray-700 hover:text-gray-900 transition-colors font-medium text-[13px] shadow-sm select-none"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                  </svg>
                  复制分享码
                </button>
              </div>

              <button 
                onClick={() => setIsShareModalOpen(false)}
                className="w-full bg-[#f4f6fa] hover:bg-gray-200 text-gray-700 font-semibold py-3.5 rounded-2xl text-[14px] transition-colors shadow-sm"
              >
                完成
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormViewBuilder;
